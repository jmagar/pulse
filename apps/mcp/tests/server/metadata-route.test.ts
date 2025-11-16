import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { OAuthConfig } from "../../config/oauth.js";

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

describe("OAuth metadata route", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns protected resource metadata when OAuth enabled", async () => {
    vi.doMock("../../config/oauth.js", () => ({
      loadOAuthConfig: () => baseConfig,
    }));
    const { oauthProtectedResource: handler } = await import(
      "../../server/routes/metadata.js"
    );
    const app = express();
    app.get("/.well-known/oauth-protected-resource", handler);

    const response = await request(app)
      .get("/.well-known/oauth-protected-resource")
      .expect(200);

    expect(response.body.resource).toBe(baseConfig.resourceIndicator);
    expect(response.body.authorization_servers).toContain(
      baseConfig.authorizationServer,
    );
    expect(response.body.scopes_supported).toEqual(
      expect.arrayContaining(["openid", "email", "mcp:scrape"]),
    );
  });
});
