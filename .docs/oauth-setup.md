# OAuth Setup Guide

**Last Updated:** 2025-11-12

This guide walks through configuring Google OAuth 2.1 for the Pulse MCP server.

## 1. Google Cloud Console Configuration

1. Create a Google Cloud project (or reuse an existing one).
2. Enable the "Google People API" (required for profile access).
3. Navigate to **APIs & Services → Credentials** and create an OAuth Client (Web application).
4. Add authorized redirect URIs:
   - `http://localhost:50107/auth/google/callback`
   - Production URL when deploying.
5. Record the **Client ID** and **Client Secret**.

## 2. Environment Variables

Update `.env` with:

```
MCP_ENABLE_OAUTH=true
MCP_GOOGLE_CLIENT_ID=your-client-id
MCP_GOOGLE_CLIENT_SECRET=your-client-secret
MCP_GOOGLE_REDIRECT_URI=http://localhost:50107/auth/google/callback
MCP_GOOGLE_OAUTH_SCOPES=openid,email,profile
MCP_OAUTH_SESSION_SECRET=<32+ char random>
MCP_OAUTH_TOKEN_KEY=<32+ char random>
MCP_OAUTH_RESOURCE_IDENTIFIER=https://pulse-mcp.local
MCP_OAUTH_AUTHORIZATION_SERVER=https://accounts.google.com
MCP_OAUTH_TOKEN_TTL=3600
MCP_OAUTH_REFRESH_TTL=2592000
MCP_REDIS_URL=redis://pulse_redis:6379
```

Use `openssl rand -hex 32` to generate secrets.

## 3. Redis & Database

- Ensure `pulse_redis` is running (`pnpm services:up`).
- For audit logging and PostgreSQL token storage, set `MCP_DATABASE_URL` (defaults to `NUQ_DATABASE_URL`).

## 4. Local Testing

```
pnpm dev:mcp
```

Visit `http://localhost:50107/auth/google` from a browser. After completing consent, `GET /auth/status` should return user info.

## 5. Troubleshooting

| Symptom | Likely Cause | Fix |
|--------|--------------|-----|
| `OAuth is not enabled` | Missing `MCP_ENABLE_OAUTH=true` | Update env + restart |
| `Missing or invalid CSRF token` | POST without `X-CSRF-Token` | Capture token from response header |
| `Redis (sessions) health check fails` | `MCP_REDIS_URL` incorrect | Verify redis container + URL |

