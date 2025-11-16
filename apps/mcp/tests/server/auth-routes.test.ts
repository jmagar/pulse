import express from "express";
import session from "express-session";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { OAuthConfig } from "../../config/oauth.js";
import type { createGoogleOAuthClient } from "../../server/oauth/google-client.js";
import type { createTokenManager } from "../../server/oauth/token-manager.js";
import type { TokenRecord } from "../../server/storage/token-store.js";
type SessionMiddlewareFactory =
  (typeof import("../../server/middleware/session.js"))["createSessionMiddleware"];
type AuthRouterFactory =
  (typeof import("../../server/routes/auth.js"))["createAuthRouter"];
type CsrfMiddlewareFactory =
  (typeof import("../../server/middleware/csrf.js"))["csrfTokenMiddleware"];

const baseConfig: OAuthConfig = {
  enabled: true,
  clientId: "client-id",
  clientSecret: "secret",
  redirectUri: "https://app/callback",
  scopes: ["openid", "email"],
  sessionSecret: "s".repeat(64),
  tokenEncryptionKey: "t".repeat(64),
  resourceIndicator: "https://pulse-mcp.local",
  authorizationServer: "https://accounts.google.com",
  tokenTtlSeconds: 3600,
  refreshTtlSeconds: 2592000,
};

type GoogleClient = ReturnType<typeof createGoogleOAuthClient>;
type TokenManager = ReturnType<typeof createTokenManager>;
let createSessionMiddleware: SessionMiddlewareFactory;
let createAuthRouter: AuthRouterFactory;
let csrfTokenMiddleware: CsrfMiddlewareFactory;

function buildRecord(overrides: Partial<TokenRecord> = {}): TokenRecord {
  const now = new Date();
  return {
    userId: "user-123",
    sessionId: "session-abc",
    accessToken: "enc-access",
    refreshToken: "refresh-token",
    tokenType: "Bearer",
    expiresAt: new Date(now.getTime() + 3600_000),
    scopes: ["openid", "email"],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createMocks(): {
  googleClient: GoogleClient;
  tokenManager: TokenManager;
} {
  const googleClient: GoogleClient = {
    createAuthUrl: vi
      .fn()
      .mockImplementation(
        ({ state }) =>
          `https://accounts.google.com/o/oauth2/v2/auth?state=${state}`,
      ),
    exchangeCode: vi.fn().mockResolvedValue({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiryDate: Date.now() + 3600_000,
      idToken: "id-token",
      scope: "openid email",
    }),
    refreshAccessToken: vi.fn().mockResolvedValue({
      accessToken: "new-access-token",
      refreshToken: "refresh-token",
      expiryDate: Date.now() + 7200_000,
      scope: "openid email",
    }),
    revokeToken: vi.fn().mockResolvedValue(undefined),
    verifyIdToken: vi
      .fn()
      .mockResolvedValue({ sub: "user-123", email: "user@example.com" } as any),
  };

  const tokenManager: TokenManager = {
    save: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(buildRecord()),
    delete: vi.fn().mockResolvedValue(undefined),
    refresh: vi.fn().mockResolvedValue(null),
  } as unknown as TokenManager;

  return { googleClient, tokenManager };
}

async function buildApp(deps: {
  googleClient: GoogleClient;
  tokenManager: TokenManager;
}) {
  const app = express();
  app.use(express.json());
  const store = new session.MemoryStore();
  app.use(createSessionMiddleware({ store, cookieName: "test.sid" }));
  app.use(csrfTokenMiddleware);

  const router = await createAuthRouter({
    config: baseConfig,
    googleClient: deps.googleClient,
    tokenManager: deps.tokenManager,
  });
  app.use(router);
  return app;
}

function getStateFromLocation(location: string): string | null {
  const url = new URL(location);
  return url.searchParams.get("state");
}

describe("Auth routes", () => {
  beforeEach(async () => {
    process.env.MCP_OAUTH_SESSION_SECRET = "s".repeat(64);
    process.env.MCP_OAUTH_REFRESH_TTL = "2592000";
    process.env.NODE_ENV = "test";
    vi.resetModules();
    ({ createSessionMiddleware } = await import(
      "../../server/middleware/session.js"
    ));
    ({ createAuthRouter } = await import("../../server/routes/auth.js"));
    ({ csrfTokenMiddleware } = await import("../../server/middleware/csrf.js"));
  });

  it("redirects to Google with PKCE parameters", async () => {
    const mocks = createMocks();
    const app = await buildApp(mocks);
    const agent = request.agent(app);
    const response = await agent.get("/auth/google").expect(302);
    expect(response.headers.location).toContain("accounts.google.com");
    expect(mocks.googleClient.createAuthUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        codeChallenge: expect.any(String),
        state: expect.any(String),
      }),
    );
  });

  it("completes callback and stores session user", async () => {
    const mocks = createMocks();
    const app = await buildApp(mocks);
    const agent = request.agent(app);
    const start = await agent.get("/auth/google");
    const state = getStateFromLocation(start.headers.location);
    await agent
      .get("/auth/google/callback")
      .query({ code: "auth-code", state })
      .expect(200)
      .expect((res) => {
        expect(res.body.authenticated).toBe(true);
        expect(res.body.user.email).toBe("user@example.com");
      });
    expect(mocks.tokenManager.save).toHaveBeenCalled();
  });

  it("returns status for authenticated session", async () => {
    const mocks = createMocks();
    const app = await buildApp(mocks);
    const agent = request.agent(app);
    const start = await agent.get("/auth/google");
    const state = getStateFromLocation(start.headers.location);
    await agent
      .get("/auth/google/callback")
      .query({ code: "auth-code", state });
    const status = await agent.get("/auth/status").expect(200);
    expect(status.body.user.id).toBe("user-123");
  });

  it("refreshes tokens when requested", async () => {
    const mocks = createMocks();
    const app = await buildApp(mocks);
    const agent = request.agent(app);
    const start = await agent.get("/auth/google");
    const state = getStateFromLocation(start.headers.location);
    await agent
      .get("/auth/google/callback")
      .query({ code: "auth-code", state });
    const status = await agent.get("/auth/status");
    const csrfToken = status.headers["x-csrf-token"];
    await agent
      .post("/auth/refresh")
      .set("X-CSRF-Token", csrfToken)
      .expect(200);
    expect(mocks.googleClient.refreshAccessToken).toHaveBeenCalled();
    expect(mocks.tokenManager.save).toHaveBeenCalledTimes(2);
  });

  it("logs out and revokes tokens", async () => {
    const mocks = createMocks();
    const app = await buildApp(mocks);
    const agent = request.agent(app);
    const start = await agent.get("/auth/google");
    const state = getStateFromLocation(start.headers.location);
    await agent
      .get("/auth/google/callback")
      .query({ code: "auth-code", state });
    const status = await agent.get("/auth/status");
    const csrfToken = status.headers["x-csrf-token"];
    await agent.post("/auth/logout").set("X-CSRF-Token", csrfToken).expect(204);
    expect(mocks.googleClient.revokeToken).toHaveBeenCalled();
    await agent.get("/auth/status").expect(401);
  });
});
