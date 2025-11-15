# Google OAuth 2.1 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deliver Google OAuth 2.1 authentication for the Pulse MCP server (per `oauth.md`) so every MCP session requires a verified Google identity with scoped access control, encrypted token storage, and production-grade security.

**Architecture:** Introduce dedicated OAuth modules (`server/oauth/*`) that orchestrate PKCE, Google token exchange, Redis-backed sessions, and encrypted token persistence (PostgreSQL in prod, filesystem for local dev) exposed through new Express routes and middleware. The MCP `/mcp` endpoint becomes a protected resource behind Bearer-token validation, CSRF/rate-limiting middleware, and scoped access controls while metadata endpoints advertise compliance with RFC 8707/8414.

**Tech Stack:** TypeScript (strict), Express 4, `@modelcontextprotocol/sdk`, `google-auth-library`, `googleapis`, `express-session`, `connect-redis`, `redis@4`, `pg`, `jsonwebtoken`, `uuid`, `zod`, Vitest + Supertest + Nock, Redis, PostgreSQL.

**Spec Reference:** `/compose/pulse/oauth.md`

---

### Task 1: Add OAuth Runtime & Test Dependencies

**Files:**
- Modify: `apps/mcp/package.json`
- Modify: `pnpm-lock.yaml`

**Step 1: Declare new runtime dependencies**

Add the exact versions required by `oauth.md` plus supporting libraries (`redis`, `@redis/client`, `google-auth-library`, `pg`) to `apps/mcp/package.json`:

```json
"dependencies": {
  "connect-redis": "^7.1.0",
  "express-session": "^1.18.0",
  "google-auth-library": "^9.14.2",
  "googleapis": "^134.0.0",
  "jsonwebtoken": "^9.0.2",
  "pg": "^8.13.0",
  "redis": "^4.7.0",
  "@redis/client": "^1.6.0",
  "uuid": "^9.0.1"
}
```

Include dev/test helpers:

```json
"devDependencies": {
  "@types/express-session": "^1.18.0",
  "@types/jsonwebtoken": "^9.0.6",
  "@types/uuid": "^9.0.8",
  "@types/pg": "^8.11.6",
  "nock": "^14.0.4",
  "@types/nock": "^13.3.5",
  "redis-mock": "^0.56.3"
}
```

**Step 2: Install workspace deps**

Run: `pnpm --filter ./apps/mcp install`  
Expected: lockfile updates with new packages.

**Step 3: Verify lint + typecheck still pass**

Run: `pnpm lint:js && pnpm typecheck:js`  
Expected: PASS to confirm dependency graph is healthy.

**Step 4: Commit**

```bash
git add apps/mcp/package.json pnpm-lock.yaml
git commit -m "chore(mcp): add OAuth dependencies"
```

---

### Task 2: OAuth Environment Schema & Config Module

**Files:**
- Modify: `apps/mcp/config/environment.ts`
- Create: `apps/mcp/config/oauth.ts`
- Create: `apps/mcp/tests/config/oauth-config.test.ts`

**Step 1: Write failing config tests**

Create `apps/mcp/tests/config/oauth-config.test.ts` asserting required vars when `MCP_ENABLE_OAUTH === "true"`:

```ts
import { describe, expect, it, beforeEach } from "vitest";
import { loadOAuthConfig } from "../../config/oauth.js";

describe("OAuth config validation", () => {
  beforeEach(() => {
    process.env.MCP_ENABLE_OAUTH = "true";
  });

  it("throws when Google credentials missing", () => {
    expect(() => loadOAuthConfig()).toThrow(/GOOGLE_CLIENT_ID/);
  });
});
```

**Step 2: Run tests (expect fail)**

`pnpm --filter ./apps/mcp vitest --run tests/config/oauth-config.test.ts`

**Step 3: Implement `config/oauth.ts`**

Create a `zod` schema that pulls from `env`, enforces PKCE/session/token secrets, default scopes, expiry windows, resource identifier, and derives booleans:

```ts
const OAuthEnvSchema = z.object({
  enabled: z.boolean(),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  redirectUri: z.string().url(),
  scopes: z.array(z.string()).min(1),
  sessionSecret: z.string().min(32),
  tokenEncryptionKey: z.string().min(32),
  resourceIndicator: z.string().url(),
  authorizationServer: z.string().url(),
  tokenTtlSeconds: z.number().int().positive(),
  refreshTtlSeconds: z.number().int().positive(),
});
```

Export `loadOAuthConfig()` that caches the parsed result and respects `MCP_ENABLE_OAUTH` / legacy `ENABLE_OAUTH`.

**Step 4: Extend `config/environment.ts`**

- Add new getters for `googleClientId`, `googleClientSecret`, `googleRedirectUri`, `googleScopes`, `oauthSessionSecret`, `oauthTokenKey`, `oauthResourceIndicator`, `oauthAuthorizationServer`, `oauthTokenTtl`, `oauthRefreshTtl`, `redisUrl`, `databaseUrl`.
- Ensure `getEnvSnapshot()` exposes them for startup diagnostics.

**Step 5: Re-run tests**

`pnpm --filter ./apps/mcp vitest --run tests/config/oauth-config.test.ts` (PASS).

**Step 6: Commit**

`git add apps/mcp/config apps/mcp/tests/config && git commit -m "feat(mcp): add OAuth env config"`

---

### Task 3: PKCE Helper Utilities

**Files:**
- Create: `apps/mcp/server/oauth/pkce.ts`
- Create: `apps/mcp/tests/oauth/pkce.test.ts`

**Step 1: Author tests first**

`apps/mcp/tests/oauth/pkce.test.ts` should cover verifier generation, SHA-256 challenge derivation, and verification failures:

```ts
import { describe, it, expect } from "vitest";
import { createPkceVerifier, createPkceChallenge, verifyPkcePair } from "../../server/oauth/pkce.js";

it("creates matching verifier/challenge pair", () => {
  const verifier = createPkceVerifier();
  const challenge = createPkceChallenge(verifier);
  expect(verifyPkcePair({ verifier, challenge })).toBe(true);
});
```

**Step 2: Run tests (RED)**

`pnpm --filter ./apps/mcp vitest --run tests/oauth/pkce.test.ts`

**Step 3: Implement helper**

Create functions:

```ts
const PKCE_LENGTH = 96;

export function createPkceVerifier(): string {
  return base64URLEncode(randomBytes(PKCE_LENGTH));
}

export function createPkceChallenge(verifier: string): string {
  return base64URLEncode(createHash("sha256").update(verifier).digest());
}

export function verifyPkcePair({ verifier, challenge }: PkcePair): boolean {
  return timingSafeEqual(
    Buffer.from(createPkceChallenge(verifier)),
    Buffer.from(challenge),
  );
}
```

Include short-lived in-memory cache (Map with TTL) for local dev; the Redis-backed storage comes in Task 7.

**Step 4: Run tests (GREEN)**

`pnpm --filter ./apps/mcp vitest --run tests/oauth/pkce.test.ts`

**Step 5: Commit**

`git add apps/mcp/server/oauth/pkce.ts apps/mcp/tests/oauth/pkce.test.ts && git commit -m "feat(mcp): add PKCE utilities"`

---

### Task 4: Token Storage Interface & Backends

**Files:**
- Create: `apps/mcp/server/storage/token-store.ts`
- Create: `apps/mcp/server/storage/fs-store.ts`
- Create: `apps/mcp/server/storage/redis-store.ts`
- Create: `apps/mcp/server/storage/postgres-store.ts`
- Modify: `apps/mcp/server/storage/index.ts`
- Create: `apps/mcp/tests/storage/token-store.test.ts`
- Create: `apps/mcp/migrations/20251112_oauth_tokens.sql`

**Step 1: Write comprehensive storage tests**

`apps/mcp/tests/storage/token-store.test.ts` should run against the interface using injected factory functions for fs/redis/postgres, covering `saveToken`, `getToken`, `refreshToken`, `deleteToken`, and TTL trimming. Use temporary directories + `redis-mock` for unit tests; stub `pg.Pool` with `vi.fn()`:

```ts
import { describe, it, expect } from "vitest";
import { createFilesystemTokenStore } from "../../server/storage/fs-store.js";

it("persists encrypted tokens on disk", async () => {
  const store = createFilesystemTokenStore({ basePath });
  await store.save({ userId: "abc", accessToken: "enc:123", ... });
  expect(await store.get("abc")).toMatchObject({ accessToken: "enc:123" });
});
```

**Step 2: Run tests (RED)**

`pnpm --filter ./apps/mcp vitest --run tests/storage/token-store.test.ts`

**Step 3: Implement interface + backends**

- `token-store.ts`: export `TokenRecord`, `ITokenStore`, and helper `createTokenStore(env)` that chooses backend (dev=filesystem, prod=postgres, fallback=redis).
- `fs-store.ts`: JSON file per user (ensure atomic writes with `fs.promises.writeFile`).
- `redis-store.ts`: store serialized payload under `oauth:token:${userId}` with TTL.
- `postgres-store.ts`: use `pg.Pool` + parameterized queries hitting `oauth_tokens`.

**Step 4: Add SQL migration**

`apps/mcp/migrations/20251112_oauth_tokens.sql` containing the schema from `oauth.md` plus `ON UPDATE` triggers for `updated_at`.

**Step 5: Export factory**

Update `server/storage/index.ts` so other modules can `import { getTokenStore }`. Use singleton caching.

**Step 6: Re-run tests (GREEN)**

`pnpm --filter ./apps/mcp vitest --run tests/storage/token-store.test.ts`

**Step 7: Commit**

`git add apps/mcp/server/storage apps/mcp/tests/storage apps/mcp/migrations && git commit -m "feat(mcp): add token storage backends"`

---

### Task 5: Token Encryption & Manager

**Files:**
- Create: `apps/mcp/server/oauth/crypto.ts`
- Create: `apps/mcp/server/oauth/token-manager.ts`
- Create: `apps/mcp/tests/oauth/token-manager.test.ts`

**Step 1: Draft failing token-manager tests**

Cover encrypt/decrypt, refresh, revoke, and scope persistence while mocking the `ITokenStore`:

```ts
import { describe, it, expect, vi } from "vitest";
import { createTokenManager } from "../../server/oauth/token-manager.js";

it("encrypts tokens before persisting", async () => {
  const store = createMockStore();
  const manager = createTokenManager({ store, cryptoKey: "hex...", now: () => 1 });
  await manager.saveTokens("user", tokensPayload);
  expect(store.save).toHaveBeenCalledWith(expect.objectContaining({
    accessToken: expect.stringMatching(/^enc:/),
  }));
});
```

**Step 2: Run tests (RED)**

`pnpm --filter ./apps/mcp vitest --run tests/oauth/token-manager.test.ts`

**Step 3: Implement encryption helper**

`crypto.ts` uses AES-256-GCM with derived key (e.g., `createHash("sha256").update(secret).digest()`). Provide `encryptToken(value)` / `decryptToken(value)` returning `{ ciphertext, iv, authTag }` encoded in base64url.

**Step 4: Implement token manager**

`createTokenManager` should expose `saveTokens`, `getTokens`, `getAccessToken`, `refreshIfNeeded`, `revokeTokens`, `listActiveSessions`. Integrate with `google-auth-library` refresh logic via dependency injection for testability.

**Step 5: Re-run tests (GREEN)**

`pnpm --filter ./apps/mcp vitest --run tests/oauth/token-manager.test.ts`

**Step 6: Commit**

`git add apps/mcp/server/oauth/crypto.ts apps/mcp/server/oauth/token-manager.ts apps/mcp/tests/oauth/token-manager.test.ts && git commit -m "feat(mcp): add encrypted token manager"`

---

### Task 6: Google OAuth Client Wrapper

**Files:**
- Create: `apps/mcp/server/oauth/google-client.ts`
- Create: `apps/mcp/tests/oauth/google-client.test.ts`

**Step 1: Write failing Nock-backed tests**

Use `nock("https://oauth2.googleapis.com")` to simulate token exchange and refresh flows:

```ts
it("exchanges authorization code using PKCE verifier", async () => {
  nock("https://oauth2.googleapis.com")
    .post("/token")
    .reply(200, { access_token: "ya29...", refresh_token: "1//", expires_in: 3600, scope: "openid email" });
  const client = createGoogleOAuthClient(loadOAuthConfig());
  const tokens = await client.exchangeCode({ code: "abc", codeVerifier: "verifier" });
  expect(tokens.accessToken).toBe("ya29...");
});
```

**Step 2: Run tests (RED)**

`pnpm --filter ./apps/mcp vitest --run tests/oauth/google-client.test.ts`

**Step 3: Implement wrapper**

Wrap `OAuth2Client`:

```ts
export function createGoogleOAuthClient(config: OAuthConfig) {
  const client = new OAuth2Client(config.clientId, config.clientSecret, config.redirectUri);
  return {
    createAuthUrl({ codeChallenge, state }) {...},
    exchangeCode({ code, codeVerifier }) {...},
    refreshToken(refreshToken) {...},
    revokeToken(token) {...},
    verifyIdToken(idToken) {...},
  };
}
```

Ensure Resource Indicator (`config.resourceIndicator`) populates the `audience`/`resource` parameters.

**Step 4: Re-run tests (GREEN)**

`pnpm --filter ./apps/mcp vitest --run tests/oauth/google-client.test.ts`

**Step 5: Commit**

`git add apps/mcp/server/oauth/google-client.ts apps/mcp/tests/oauth/google-client.test.ts && git commit -m "feat(mcp): add Google OAuth client wrapper"`

---

### Task 7: Redis Session Middleware

**Files:**
- Create: `apps/mcp/server/middleware/session.ts`
- Modify: `apps/mcp/server/middleware/index.ts`
- Create: `apps/mcp/tests/server/session-middleware.test.ts`

**Step 1: Write failing middleware tests**

Use `supertest` against a minimal Express app to assert cookies (`httpOnly`, `secure` in prod, `SameSite=lax`) and PKCE storage:

```ts
it("persists pkce verifier in Redis session", async () => {
  const app = buildAppWithSession(redisMock);
  const res = await request(app).post("/set-pkce").expect(204);
  expect(await redisMock.get("sess:" + parseCookie(res))).toContain("pkce");
});
```

**Step 2: Run tests (RED)**

`pnpm --filter ./apps/mcp vitest --run tests/server/session-middleware.test.ts`

**Step 3: Implement middleware**

- Initialize `express-session`.
- Use `connect-redis` with `createClient({ url: env.redisUrl })`.
- Expose helper `attachSession(app: Application)` for `server/http.ts`.
- Configure rolling sessions, TTL synced with `oauth.refreshTtlSeconds`.

**Step 4: Re-run tests (GREEN)**

`pnpm --filter ./apps/mcp vitest --run tests/server/session-middleware.test.ts`

**Step 5: Commit**

`git add apps/mcp/server/middleware/session.ts apps/mcp/server/middleware/index.ts apps/mcp/tests/server/session-middleware.test.ts && git commit -m "feat(mcp): add Redis session middleware"`

---

### Task 8: Authentication Routes (`/auth/*`)

**Files:**
- Create: `apps/mcp/server/routes/auth.ts`
- Modify: `apps/mcp/server/http.ts`
- Create: `apps/mcp/tests/server/auth-routes.test.ts`
- Modify: `apps/mcp/tests/server/oauth-disabled.test.ts` (update expectations)

**Step 1: Write failing route tests**

Use `supertest` with `vi.mock` for `google-client` + `token-manager` to simulate flows:

```ts
it("GET /auth/google issues redirect with PKCE state", async () => {
  const res = await request(app).get("/auth/google").expect(302);
  expect(res.headers.location).toContain("code_challenge=");
});

it("GET /auth/google/callback stores tokens and redirects", async () => {
  await request(app)
    .get("/auth/google/callback")
    .set("Cookie", pkceSession)
    .query({ code: "abc", state: validState })
    .expect(302);
  expect(mockTokenManager.saveTokens).toHaveBeenCalled();
});
```

**Step 2: Run tests (RED)**

`pnpm --filter ./apps/mcp vitest --run tests/server/auth-routes.test.ts`

**Step 3: Implement routes**

- `/auth/google`: generate `state` (UUID), store `codeVerifier` + `state` in session, redirect to `googleClient.createAuthUrl`.
- `/auth/google/callback`: validate `state`, fetch tokens, save via token manager, set `session.user`.
- `/auth/status`: return sanitized session info + scopes.
- `/auth/logout`: revoke tokens, destroy session.
- `/auth/refresh`: optional endpoint to force refresh using stored refresh token.

Mount router inside `createExpressServer()` only when `config.enabled`.

**Step 4: Update disabled tests**

Ensure `oauth-disabled.test.ts` expects `404` when feature flag is false.

**Step 5: Re-run tests (GREEN)**

`pnpm --filter ./apps/mcp vitest --run tests/server/auth-routes.test.ts tests/server/oauth-disabled.test.ts`

**Step 6: Commit**

`git add apps/mcp/server/routes apps/mcp/server/http.ts apps/mcp/tests/server && git commit -m "feat(mcp): add OAuth auth routes"`

---

### Task 9: Metadata Endpoint & Scope Definitions

**Files:**
- Create: `apps/mcp/server/oauth/scopes.ts`
- Create: `apps/mcp/server/routes/metadata.ts`
- Create: `apps/mcp/tests/server/metadata-route.test.ts`
- Modify: `apps/mcp/server/http.ts`

**Step 1: Failing tests**

`metadata-route.test.ts` should assert JSON payload matches RFC 8707 fields and derived tool scopes:

```ts
it("returns oauth-protected-resource metadata", async () => {
  const res = await request(app).get("/.well-known/oauth-protected-resource").expect(200);
  expect(res.body.authorization_servers).toContain("https://accounts.google.com");
});
```

**Step 2: Run tests (RED)**

`pnpm --filter ./apps/mcp vitest --run tests/server/metadata-route.test.ts`

**Step 3: Implement scope map + router**

- `scopes.ts`: export `BASE_SCOPES`, `toolScopeMap`, and helper `getScopesForTool(toolName)`.
- `metadata.ts`: respond with JSON described in `oauth.md`, using config to fill `resource` and scopes.
- Register route in `createExpressServer()` regardless of OAuth flag (spec requires metadata always available).

**Step 4: Re-run tests (GREEN)**

`pnpm --filter ./apps/mcp vitest --run tests/server/metadata-route.test.ts`

**Step 5: Commit**

`git add apps/mcp/server/oauth/scopes.ts apps/mcp/server/routes/metadata.ts apps/mcp/tests/server/metadata-route.test.ts && git commit -m "feat(mcp): add OAuth metadata endpoint"`

---

### Task 10: Auth Middleware, Scope Validation, and MCP Protection

**Files:**
- Modify: `apps/mcp/server/middleware/auth.ts`
- Create: `apps/mcp/server/oauth/scope-validator.ts`
- Modify: `apps/mcp/server/http.ts`
- Create: `apps/mcp/tests/server/auth-middleware.test.ts`
- Create: `apps/mcp/tests/integration/mcp-oauth.test.ts`

**Step 1: Middleware tests**

`auth-middleware.test.ts` should mock `tokenManager.getAccessToken`, `scopeValidator.ensureScopes` and assert 401/403 flows plus refresh fallback.

**Step 2: Integration tests (RED)**

`mcp-oauth.test.ts` spins up Express server with OAuth enabled, uses `supertest` to call `/mcp` with Bearer tokens (mock `jsonwebtoken.verify`). Expect 401 when missing, 403 for insufficient scopes, success when valid.

**Step 3: Update middleware implementation**

- Extract token from `Authorization` header or session cookie fallback.
- Verify JWT via `jsonwebtoken.verify` with Google public keys (cache JWKS via `google-auth-library`).
- Ensure `aud` matches `resourceIndicator`.
- Attach `req.user` with `id`, `email`, `scopes`.
- If expired and refresh token exists -> call `tokenManager.refreshIfNeeded`.

**Step 4: Scope validator**

`scope-validator.ts` maps MCP methods (e.g., `scrape`, `crawl`, `map`) to required scopes defined in `scopes.ts`. Provide `assertScopes({ userScopes, required })`.

**Step 5: Apply to `/mcp`**

In `server/http.ts`, insert `authMiddleware` + `scopeGate` before `transport.handleRequest`. Provide a bypass for health + internal endpoints to avoid auth loops.

**Step 6: Tests (GREEN)**

`pnpm --filter ./apps/mcp vitest --run tests/server/auth-middleware.test.ts tests/integration/mcp-oauth.test.ts`

**Step 7: Commit**

`git add apps/mcp/server/middleware/auth.ts apps/mcp/server/oauth/scope-validator.ts apps/mcp/server/http.ts apps/mcp/tests/server/auth-middleware.test.ts apps/mcp/tests/integration/mcp-oauth.test.ts && git commit -m "feat(mcp): protect MCP endpoint with OAuth"`

---

### Task 11: Health Checks, Startup Display, and Env Examples

**Files:**
- Modify: `apps/mcp/config/health-checks.ts`
- Create: `apps/mcp/tests/config/health-checks.oauth.test.ts`
- Modify: `apps/mcp/index.ts`
- Modify: `apps/mcp/server/startup/display.ts`
- Modify: `apps/mcp/server/startup/env-display.ts`
- Modify: `apps/mcp/utils/service-status.ts`
- Modify: `.env.example`
- Modify: `CLAUDE.md`
- Modify: `docs/services-ports.md` (document OAuth endpoints)

**Step 1: Tests for new health checks**

Create `tests/config/health-checks.oauth.test.ts` verifying:
- Missing Google creds triggers failure when OAuth enabled.
- Redis connectivity failure surfaces error.
- Token encryption self-check works.

**Step 2: Run tests (RED)**

`pnpm --filter ./apps/mcp vitest --run tests/config/health-checks.oauth.test.ts`

**Step 3: Implement health checks**

- In `config/health-checks.ts`, when OAuth enabled, call:
  - `checkGoogleCredentials` (attempt token endpoint with client creds + `grant_type=client_credentials` to validate).
  - `checkRedisConnection` using `redis` ping.
  - `checkTokenEncryption` using `encrypt/decrypt` roundtrip.

**Step 4: Update startup surfaces**

- `index.ts`: use `env` helper for booleans and pass config to `displayStartupInfo`.
- `display.ts`: show actual OAuth status (Enabled/Disabled, redirect URI) and metadata endpoint link.
- `service-status.ts`: add `Redis (Sessions)` and `Google OAuth` entries.

**Step 5: Update env docs**

- `.env.example`: add `MCP_ENABLE_OAUTH`, `MCP_GOOGLE_CLIENT_ID`, `MCP_GOOGLE_CLIENT_SECRET`, `MCP_GOOGLE_REDIRECT_URI`, `MCP_GOOGLE_OAUTH_SCOPES`, `MCP_OAUTH_SESSION_SECRET`, `MCP_OAUTH_TOKEN_KEY`, `MCP_OAUTH_RESOURCE_IDENTIFIER`, `MCP_OAUTH_AUTHORIZATION_SERVER`, `MCP_OAUTH_TOKEN_TTL`, `MCP_OAUTH_REFRESH_TTL`.
- `CLAUDE.md`: Document new vars & flow.
- `docs/services-ports.md`: list OAuth endpoints + session port reuse.

**Step 6: Tests (GREEN)**

`pnpm --filter ./apps/mcp vitest --run tests/config/health-checks.oauth.test.ts`

**Step 7: Commit**

`git add apps/mcp/config apps/mcp/index.ts apps/mcp/server/startup apps/mcp/utils/service-status.ts .env.example CLAUDE.md docs/services-ports.md && git commit -m "feat(mcp): add OAuth health checks and env docs"`

---

### Task 12: CSRF, Rate Limiting, and Security Headers

**Files:**
- Create: `apps/mcp/server/middleware/csrf.ts`
- Create: `apps/mcp/server/middleware/rateLimit.ts`
- Create: `apps/mcp/server/middleware/securityHeaders.ts`
- Modify: `apps/mcp/server/http.ts`
- Create: `apps/mcp/tests/server/csrf-middleware.test.ts`
- Create: `apps/mcp/tests/server/rate-limit.test.ts`

**Step 1: Tests first**

`csrf-middleware.test.ts`: ensure missing token returns 403, valid token passes.  
`rate-limit.test.ts`: simulate >5 `/auth/google` calls -> expect 429 with `Retry-After`.

**Step 2: Run tests (RED)**

`pnpm --filter ./apps/mcp vitest --run tests/server/csrf-middleware.test.ts tests/server/rate-limit.test.ts`

**Step 3: Implement middleware**

- `csrf.ts`: generate token per session, expose helper `attachCsrfToken(res)` and validate header `X-CSRF-Token` or form field. Integrate with OAuth state parameter for login.
- `rateLimit.ts`: use Redis INCR with TTL; export factory `createRateLimiter(config)` to protect `/auth/google`, `/auth/google/callback`, `/mcp`.
- `securityHeaders.ts`: set HSTS, X-Content-Type-Options, etc.

**Step 4: Register middleware**

In `createExpressServer()` order: security headers → CORS → session → CSRF (except GET) → rate limit (per route) → auth routes.

**Step 5: Re-run tests (GREEN)**

`pnpm --filter ./apps/mcp vitest --run tests/server/csrf-middleware.test.ts tests/server/rate-limit.test.ts`

**Step 6: Commit**

`git add apps/mcp/server/middleware apps/mcp/tests/server && git commit -m "feat(mcp): add CSRF, rate limiting, security headers"`

---

### Task 13: Audit Logging & Token Revocation

**Files:**
- Create: `apps/mcp/server/oauth/audit-logger.ts`
- Modify: `apps/mcp/server/routes/auth.ts`
- Modify: `apps/mcp/server/oauth/token-manager.ts`
- Create: `apps/mcp/tests/oauth/audit-logger.test.ts`
- Modify: `apps/mcp/migrations/20251112_oauth_tokens.sql` (append audit table DDL)

**Step 1: Tests**

`audit-logger.test.ts` should mock `pg.Pool` and assert inserts for login/logout/refresh events with IP + UA metadata.

**Step 2: Run tests (RED)**

`pnpm --filter ./apps/mcp vitest --run tests/oauth/audit-logger.test.ts`

**Step 3: Implement audit logger**

- Provide `logAuthEvent(event: AuditEvent)` writing to `oauth_audit_log`.
- Batch inserts using `pool.query`.

**Step 4: Wire into routes/manager**

- `auth.ts`: log `login_success`, `login_failure`, `logout`, `csrf_block`, `rate_limit`.
- `token-manager.ts`: log `refresh_success`, `refresh_failure`, `revoke`.

**Step 5: Re-run tests (GREEN)**

`pnpm --filter ./apps/mcp vitest --run tests/oauth/audit-logger.test.ts tests/server/auth-routes.test.ts`

**Step 6: Commit**

`git add apps/mcp/server/oauth apps/mcp/server/routes apps/mcp/tests/oauth apps/mcp/migrations/20251112_oauth_tokens.sql && git commit -m "feat(mcp): add OAuth audit logging"`

---

### Task 14: Documentation Suite

**Files:**
- Create: `.docs/oauth-setup.md`
- Create: `.docs/api/auth-endpoints.md`
- Create: `.docs/security/oauth-security.md`
- Create: `.docs/architecture/oauth.md`
- Create: `.docs/development/oauth-testing.md`
- Modify: `README.md`
- Modify: `docs/AGENTS.md` (reference new docs)

**Step 1: Outline docs (RED)**

Draft skeleton markdown files with TODO placeholders to fail lint (if doc checks) or simply stage incomplete sections.

**Step 2: Fill content referencing `oauth.md`**

- `.docs/oauth-setup.md`: Google Cloud Console steps, env mapping table, trouble-shooting.
- `.docs/api/auth-endpoints.md`: request/response tables for `/auth/*`, metadata, sample cURL.
- `.docs/security/oauth-security.md`: threat model + mitigations from `oauth.md`.
- `.docs/architecture/oauth.md`: include ASCII diagrams already in `oauth.md`.
- `.docs/development/oauth-testing.md`: instructions for running Vitest suites, mocking Google with `nock`, integration/E2E flows.
- Update `README.md` authentication section with TL;DR referencing above docs.
- Update `docs/AGENTS.md` documentation matrix to link newly added files.

**Step 3: Cross-link docs**

Add "Further Reading" sections referencing each other + `oauth.md`.

**Step 4: Commit**

`git add .docs README.md docs/AGENTS.md && git commit -m "docs: add OAuth guides"`

---

### Task 15: Integration & E2E Test Harness

**Files:**
- Create: `apps/mcp/tests/integration/oauth-flow.test.ts`
- Create: `apps/mcp/tests/integration/oauth-refresh.test.ts`
- Create: `apps/mcp/tests/e2e/oauth-browser.spec.ts` (Playwright optional)
- Update: `apps/mcp/package.json` test scripts to add `test:integration`, `test:e2e`

**Step 1: Write failing integration tests**

Use `supertest + nock` to simulate the entire handshake:

```ts
it("completes OAuth code flow and accesses MCP", async () => {
  mockGoogleTokenExchange();
  const authRedirect = await request(app).get("/auth/google").expect(302);
  await request(app).get("/auth/google/callback").set("Cookie", authRedirect.headers["set-cookie"]).query({ code: "abc", state }).expect(302);
  await request(app).get("/auth/status").set("Cookie", sessionCookie).expect(200);
  await request(app).post("/mcp").set("Authorization", `Bearer ${fakeAccessToken}`).send(mcpInit).expect(200);
});
```

Add refresh scenario verifying `tokenManager.refreshIfNeeded` path.

**Step 2: Optional Playwright E2E**

Record spec launching headless browser to hit `/auth/google` and follow state machine using Google sandbox credentials (guard with `process.env.TEST_SUITE_SELF_HOSTED` per repo conventions).

**Step 3: Update package scripts**

`"test:integration": "vitest run tests/integration/**/*.test.ts", "test:e2e": "playwright test apps/mcp/tests/e2e"` (behind optional flag).

**Step 4: Run tests (RED -> GREEN)**

`pnpm --filter ./apps/mcp vitest --run tests/integration/oauth-flow.test.ts`

**Step 5: Commit**

`git add apps/mcp/tests/integration apps/mcp/tests/e2e apps/mcp/package.json && git commit -m "test(mcp): add OAuth integration suites"`

---

### Task 16: Final Hardening & Verification

**Files:**
- N/A (command + verification focused)

**Step 1: Run full static checks**

`pnpm format:js && pnpm lint:js && pnpm typecheck:js`

**Step 2: Run targeted tests**

`pnpm --filter ./apps/mcp test`  
`pnpm --filter ./apps/mcp vitest --run tests/server/**/*.test.ts tests/oauth/**/*.test.ts tests/integration/**/*.test.ts`

**Step 3: Manual verification**

1. `pnpm dev:mcp` with OAuth enabled.  
2. Use browser (localhost:50107) to confirm `/auth/google` redirect, `/auth/status`, and `/mcp` responses.  
3. Simulate invalid tokens to confirm 401/403/429 flows.

**Step 4: Update documentation references**

Note completion in `.docs/deployment-log.md` only after deploying (per lifecycle guidelines).

**Step 5: Final commit**

`git commit -am "feat(mcp): ship Google OAuth 2.1 flow"` (or merge via PR workflow).

---

**Plan complete. Implementation spec synced with `oauth.md`. Choose execution path:**

1. **Subagent-Driven (this session)** — I can run superpowers:subagent-driven-development now for each task with built-in reviews.  
2. **Parallel Session** — Open a new session and load superpowers:executing-plans to work through the tasks elsewhere.

Let me know which route you prefer.
