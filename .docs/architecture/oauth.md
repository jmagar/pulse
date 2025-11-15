# OAuth Architecture Overview

**Date:** 2025-11-12

## Components

```
Client → /auth/google → Google Consent → /auth/google/callback
          ↓                                ↓
       Session (Redis) ← Token Manager ← Google OAuth APIs
          ↓                                ↓
      authMiddleware → scopeMiddleware → /mcp
```

- `server/middleware/session.ts`: Redis session store.
- `server/oauth/pkce.ts`: PKCE helpers.
- `server/oauth/google-client.ts`: Google OAuth2 wrapper.
- `server/oauth/token-manager.ts`: Encrypts & stores tokens.
- `server/oauth/audit-logger.ts`: Writes events to `oauth_audit_log`.
- `server/routes/auth.ts`: Router wiring everything together.

## Data Flows

1. **Initiation**: `/auth/google` stores `{ state, codeVerifier }` in session and redirects.
2. **Callback**: Exchange code with PKCE, verify ID token, store encrypted tokens.
3. **Session**: `req.session.user` populated with `id/email/scopes/expiresAt`.
4. **MCP Requests**: `authMiddleware` gates non-initialize requests; `scopeMiddleware` verifies tool access via `TOOL_SCOPE_MAP`.
5. **Refresh**: `/auth/refresh` uses stored refresh token, updates DB/Redis, returns new access token.
6. **Logout**: `/auth/logout` revokes tokens (Google API) and destroys session.

## Storage

- **Redis**: Session data + PKCE verifier + CSRF tokens.
- **Filesystem/Redis/Postgres**: Token store per environment (`server/storage/*`).
- **Postgres**: Optional `oauth_audit_log` for audit events.

## Health Checks

`config/health-checks.ts` validates:
- Firecrawl credential (existing behavior)
- OAuth config completeness
- Redis connectivity

Failing checks block startup unless `SKIP_HEALTH_CHECKS=true`.
