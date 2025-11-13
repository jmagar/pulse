# MCP OAuth API Endpoints

**Date:** 2025-11-12

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/auth/google` | Session | Initiate Google OAuth with PKCE; returns 302 redirect |
| `GET` | `/auth/google/callback` | Session | Handles Google callback, exchanges code for tokens |
| `GET` | `/auth/status` | Session | Returns current authenticated user context |
| `POST` | `/auth/refresh` | Session + CSRF | Forces token refresh, returns new access token |
| `POST` | `/auth/logout` | Session + CSRF | Revokes tokens and destroys session |
| `GET` | `/.well-known/oauth-protected-resource` | Public | RFC 8707 metadata |

## Request / Response Samples

### `/auth/status`
```bash
curl -b cookies.txt http://localhost:50107/auth/status
```
```json
{
  "authenticated": true,
  "user": {
    "id": "1234567890",
    "email": "user@example.com",
    "scopes": ["openid", "email", "mcp:scrape"],
    "expiresAt": "2025-11-12T20:15:00.000Z"
  }
}
```

### `/auth/refresh`
Requires CSRF token from `X-CSRF-Token` header emitted on prior responses.
```bash
curl -b cookies.txt \
  -H "X-CSRF-Token: <value>" \
  -X POST http://localhost:50107/auth/refresh
```

### `/auth/logout`
```bash
curl -b cookies.txt \
  -H "X-CSRF-Token: <value>" \
  -X POST http://localhost:50107/auth/logout
```
Returns `204 No Content`.

## Error Codes

| Status | Code | Description |
|--------|------|-------------|
| 401 | `unauthorized` | Session missing or token invalid |
| 403 | `invalid_csrf_token` | CSRF token missing/mismatch |
| 403 | `insufficient_scope` | User lacks tool-specific scope |
| 429 | `rate_limit_exceeded` | Too many requests per window |

## Notes

- `/auth/google` and `/auth/google/callback` are rate-limited (5/min and 10/min).
- `/mcp` is protected by Bearer-to-session mapping; tool access is gated by `mcp:*` scopes defined in `server/oauth/scopes.ts`.
