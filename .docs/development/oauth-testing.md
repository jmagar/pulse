# OAuth Testing Guide

**Last Updated:** 2025-11-12

## Unit / Integration Suites

```
cd apps/mcp
pnpm vitest run \
  tests/server/auth-middleware.test.ts \
  tests/server/auth-routes.test.ts \
  tests/server/session-middleware.test.ts \
  tests/server/csrf-middleware.test.ts \
  tests/server/rate-limit.test.ts \
  tests/server/security-headers.test.ts \
  tests/oauth/token-manager.test.ts \
  tests/oauth/google-client.test.ts \
  tests/oauth/audit-logger.test.ts

## Scripted Harness

From the repo root:
```
./scripts/test-oauth-flow.sh
```
Runs the MCP-specific suites plus OAuth health checks and token storage tests.
```

## Manual Flow

1. `pnpm dev:mcp` with OAuth vars set.
2. Hit `/auth/google` in browser; complete Google consent.
3. Confirm `GET /auth/status` returns scopes.
4. Use cURL/Postman to call `/auth/refresh` and `/auth/logout` supplying `X-CSRF-Token`.
5. Hit `/.well-known/oauth-protected-resource` to verify metadata.

## Cypress / Playwright (Optional)

- Launch headless browser to `/auth/google`.
- Stub Google accounts or use test workspace credentials.
- Validate session cookie + CSRF token presence.

## Troubleshooting

| Issue | Remedy |
|-------|--------|
| `invalid_csrf_token` | Ensure subsequent POST includes `X-CSRF-Token` header from previous response |
| `rate_limit_exceeded` | Wait `Retry-After` seconds or increase limits temporarily via `createRateLimiter` config |
| `Redis (sessions)` health check fails | Confirm `redis-cli -u MCP_REDIS_URL ping` succeeds |
