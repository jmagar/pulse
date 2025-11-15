# OAuth Security Guide

**Version:** 2025-11-12

## Controls Implemented

- **PKCE (S256)** enforced for all authorization flows.
- **CSRF protection** via server-generated tokens (`X-CSRF-Token`).
- **Redis-backed sessions** with HTTP-only, SameSite cookies and secure flag in production.
- **Encrypted token storage** (AES-256-GCM with per-app secret).
- **Scope enforcement** mapping MCP tools to `mcp:*` scopes.
- **Rate limiting** on `/auth/google`, `/auth/google/callback`, and `/mcp`.
- **Audit logging** (login, logout, refresh, revocation, CSRF blocks) when `MCP_DATABASE_URL` configured.
- **Security headers** (`HSTS`, `X-Frame-Options`, `CSP`, etc.) globally applied.

## Threats & Mitigations

| Threat | Mitigation |
|--------|------------|
| Token theft | Short-lived tokens (1h), refresh tokens stored encrypted, HTTPS enforced |
| CSRF | Token middleware + SameSite cookies + state validation |
| Scope escalation | Tool-to-scope mapping in `scopeMiddleware` |
| Brute force | Rate limiter per IP |
| Session hijack | HttpOnly cookies, Redis TTL tied to refresh TTL |
| Replay attacks | Audience/resource validation via Google JWT claims |

## Operational Checklist

1. Rotate `MCP_OAUTH_SESSION_SECRET` and `MCP_OAUTH_TOKEN_KEY` if compromise suspected.
2. Monitor `oauth_audit_log` for repeated `login_failure` / `csrf_block` events.
3. Ensure `MCP_DATABASE_URL` and `MCP_REDIS_URL` point to secured services.
4. Run `pnpm vitest run tests/server/auth-*` before releases to confirm CSRF/rate-limit behavior.
