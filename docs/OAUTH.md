# Pulse MCP OAuth Implementation

**Last Updated:** 04:10 PM EST | 11/12/2025  
**Scope:** `apps/mcp` Google OAuth 2.1 user authentication

---

## 1. Architecture Overview

| Layer | Files | Purpose |
|-------|-------|---------|
| Session management | `server/middleware/session.ts` | Redis-backed `express-session`, secure cookies |
| OAuth client | `server/oauth/google-client.ts` | PKCE auth URL, code exchange, refresh/revoke, ID token verify |
| Token storage | `server/storage/{token-store,fs-store,redis-store,postgres-store}.ts`, `migrations/20251112_oauth_tokens.sql` | Encrypted token persistence (filesystem for dev, Redis/Postgres for prod) |
| Token security | `server/oauth/crypto.ts`, `server/oauth/token-manager.ts` | AES-256-GCM encryption/decryption |
| HTTP surface | `server/routes/auth.ts`, `server/http.ts` | `/auth/*` endpoints, metadata endpoint, MCP protection |
| Safety net | `server/middleware/{csrf,rateLimit,securityHeaders,auth}.ts`, `server/oauth/scope-validator.ts`, `server/oauth/audit-logger.ts` | CSRF tokens, rate limiting, security headers, scope enforcement, audit logging |
| Config & health | `config/environment.ts`, `config/health-checks.ts`, `utils/service-status.ts`, `server/startup/display.ts` | Env validation, Redis/OAuth health checks, startup banner |

**Flow summary:**
1. `/auth/google` stores `{state, codeVerifier}`, issues PKCE redirect.
2. `/auth/google/callback` validates state, exchanges code for tokens, encrypts & stores them, populates `req.session.user`.
3. All `/mcp` requests pass through `authMiddleware` (session gate) and `scopeMiddleware` (tool ↔ scope mapping).
4. `/auth/refresh` refreshes tokens; `/auth/logout` revokes and clears session.
5. `/.well-known/oauth-protected-resource` advertises RFC 8707 metadata.

---

## 2. Prerequisites

| Requirement | Details |
|-------------|---------|
| Redis | `MCP_REDIS_URL` must point to a running Redis instance (e.g., `redis://pulse_redis:6379`). |
| Database (optional but recommended) | `MCP_DATABASE_URL` (or `NUQ_DATABASE_URL`) enables Postgres token storage + audit log. Filesystem storage is used otherwise. |
| Google Cloud project | Needed to create OAuth credentials and configure consent screen. |
| Domain/Origins | Decide the hostnames you will run the MCP server on (for Authorized Domains & JavaScript Origins). |

---

## 3. Google Cloud Console – Step-by-Step

> References: [Manage OAuth Clients – Google Cloud Console Help](https://support.google.com/cloud/answer/15549257?hl=en), [Setting up OAuth 2.0 – Google API Console Help](https://support.google.com/googleapi/answer/6158849?hl=en)

1. **Create / Select Project**
   - Visit <https://console.cloud.google.com/>.
   - Use the project picker to create or select the desired project.

2. **Enable APIs**
   - Go to **APIs & Services → Library**.
   - Enable “Google People API” (required for basic profile/email scopes).

3. **Configure OAuth Consent Screen**
   - Navigate to **APIs & Services → OAuth consent screen**.
   - Choose *Internal* (Workspace) or *External*.
   - Provide App name, user support email, developer contact email.
   - Add **Authorized domains** (e.g., `localhost` for local testing, `example.com` for production).
   - Add scopes: `openid`, `email`, `profile` (additional `mcp:*` scopes are handled internally).
   - For External apps, add test users (email addresses) until the app is verified.

4. **Create OAuth 2.0 Client (Web Application)**
   - Go to **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
   - Application type: **Web application**.
   - Name it (e.g., “Pulse MCP Local”).
   - **Authorized JavaScript origins**: domains allowed to host the client.
     - Local dev: `http://localhost:50107`
     - Production: `https://mcp.example.com`
     - (Per Google, origins must use HTTPS except for `http://localhost` during development.)
   - **Authorized redirect URIs**: where Google sends the user after consent.
     - Local dev: `http://localhost:50107/auth/google/callback`
     - Production: `https://mcp.example.com/auth/google/callback`
   - Save; copy the **Client ID** and **Client secret**.

5. **Download Credentials (optional)**
   - You can download the JSON for backup, but only the Client ID/Secret are needed in `.env`.

---

## 4. Environment Variables

Add to `.env` (or secrets manager):

```
MCP_ENABLE_OAUTH=true
MCP_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
MCP_GOOGLE_CLIENT_SECRET=your-client-secret
MCP_GOOGLE_REDIRECT_URI=http://localhost:50107/auth/google/callback
MCP_GOOGLE_OAUTH_SCOPES=openid,email,profile
MCP_OAUTH_SESSION_SECRET=<32+ char random hex>
MCP_OAUTH_TOKEN_KEY=<32+ char random hex>
MCP_OAUTH_RESOURCE_IDENTIFIER=https://pulse-mcp.local
MCP_OAUTH_AUTHORIZATION_SERVER=https://accounts.google.com
MCP_OAUTH_TOKEN_TTL=3600
MCP_OAUTH_REFRESH_TTL=2592000
MCP_REDIS_URL=redis://pulse_redis:6379
MCP_DATABASE_URL=postgres://user:pass@host:5432/db   # optional but needed for audit logging/Postgres token store
```

Generate secrets with:
```bash
openssl rand -hex 32
```

---

## 5. Enabling OAuth – Checklist

1. ✅ **Set env vars** above (plus `FIRECRAWL_API_KEY`, etc.).
2. ✅ **Provision Redis/Postgres** containers or services.
3. ✅ **Run migrations** (if using Postgres token store):
   ```bash
   # Example using psql
   psql $MCP_DATABASE_URL -f apps/mcp/migrations/20251112_oauth_tokens.sql
   ```
4. ✅ **Start supporting services**:
   ```bash
   pnpm services:up
   ```
5. ✅ **Start MCP server**:
   ```bash
   pnpm dev:mcp
   ```
6. ✅ **Run OAuth harness** (recommended before committing):
   ```bash
   ./scripts/test-oauth-flow.sh
   ```
7. ✅ **Manual browser test** (`http://localhost:50107/auth/google` → check `/auth/status`, `/auth/refresh`, `/auth/logout`).

---

## 6. Verification & Testing

### Automated

- **Unit / integration suites**: see `.docs/development/oauth-testing.md` for the `pnpm vitest run …` command list.
- **Harness**: `./scripts/test-oauth-flow.sh`.
- **Type checking**: `pnpm --filter ./apps/mcp typecheck`.

### Manual

1. Visit `/auth/google`, sign in via Google, confirm redirect back to MCP.
2. Load `/auth/status` – expect `{ authenticated: true, user: { … } }`.
3. POST `/auth/refresh` with `X-CSRF-Token` header.
4. POST `/auth/logout` with `X-CSRF-Token`, verify session cleared.
5. Query metadata endpoint:
   ```
   curl http://localhost:50107/.well-known/oauth-protected-resource | jq
   ```

---

## 7. Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `OAuth is not enabled` | `MCP_ENABLE_OAUTH` missing/false | Set to `true` and restart |
| `Missing or invalid CSRF token` | POST without `X-CSRF-Token` | Read header from prior response and include it |
| `rate_limit_exceeded` | Too many requests/minute | Wait `Retry-After` seconds (default: 60s windows) |
| Redis health check fails | `MCP_REDIS_URL` incorrect or Redis down | Fix URL / start Redis |
| Google error `redirect_uri_mismatch` | Redirect URI not registered | Add the exact URI under OAuth client → Authorized redirect URIs |
| `invalid_scope` | Scope not listed on consent screen | Ensure Google consent screen includes `openid`, `email`, `profile` |

---

## 8. Reference Endpoints

| Path | Method | Notes |
|------|--------|-------|
| `/auth/google` | GET | Initiate flow (rate limited 5/min) |
| `/auth/google/callback` | GET | Handles code → token (10/min) |
| `/auth/status` | GET | Returns session info |
| `/auth/refresh` | POST | Requires CSRF token |
| `/auth/logout` | POST | Requires CSRF token |
| `/.well-known/oauth-protected-resource` | GET | RFC 8707 metadata |
| `/mcp` | ALL | Protected via `authMiddleware` + `scopeMiddleware` |

---

## 9. Audit Logging

If `MCP_DATABASE_URL` is present:
- Logs stored in `oauth_audit_log`.
- Events recorded: `login_success`, `login_failure`, `token_refresh`, `token_revoke`, `logout`, `csrf_block`, `rate_limit`.
- Adjust retention or alerting via SQL or downstream analytics.

---

## 10. Production Hardening Tips

1. Use HTTPS for all domains (Let’s Encrypt or managed certs).
2. Configure `MCP_OAUTH_SESSION_SECRET`/`MCP_OAUTH_TOKEN_KEY` via secret manager.
3. Enforce firewall/security groups for Redis/Postgres; do not expose publicly.
4. Monitor Redis memory (sessions expire with refresh TTL).
5. Periodically prune `oauth_tokens` and `oauth_audit_log` as needed.

---

With these steps, your Pulse MCP server will authenticate users via Google OAuth 2.1, scope MCP tool access, and log/audit all key events. Use the harness and manual flow to verify before deploying. Happy shipping!
