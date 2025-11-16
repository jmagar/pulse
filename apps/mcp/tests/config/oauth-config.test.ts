import { beforeEach, describe, expect, it, afterEach, vi } from "vitest";

function setBaseEnv(overrides: Record<string, string> = {}): void {
  process.env = {
    ...process.env,
    MCP_ENABLE_OAUTH: "true",
    MCP_GOOGLE_CLIENT_ID: "test-client",
    MCP_GOOGLE_CLIENT_SECRET: "test-secret",
    MCP_GOOGLE_REDIRECT_URI: "https://example.com/callback",
    MCP_GOOGLE_OAUTH_SCOPES: "openid,email,profile",
    MCP_OAUTH_SESSION_SECRET: "a".repeat(64),
    MCP_OAUTH_TOKEN_KEY: "b".repeat(64),
    MCP_OAUTH_RESOURCE_IDENTIFIER: "https://pulse.example",
    MCP_OAUTH_AUTHORIZATION_SERVER: "https://accounts.google.com",
    MCP_OAUTH_TOKEN_TTL: "3600",
    MCP_OAUTH_REFRESH_TTL: "2592000",
    ...overrides,
  } as NodeJS.ProcessEnv;
}

async function loadConfig() {
  vi.resetModules();
  const module = await import("../../config/oauth.js");
  return module.loadOAuthConfig({ forceReload: true });
}

describe("OAuth config loader", () => {
  beforeEach(() => {
    setBaseEnv();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("returns null when OAuth disabled", async () => {
    process.env.MCP_ENABLE_OAUTH = "false";
    const config = await loadConfig();
    expect(config).toBeNull();
  });

  it("loads configuration when enabled", async () => {
    const config = await loadConfig();
    expect(config).not.toBeNull();
    expect(config?.clientId).toBe("test-client");
    expect(config?.scopes).toEqual(["openid", "email", "profile"]);
  });

  it("throws when required values missing", async () => {
    process.env.MCP_GOOGLE_CLIENT_ID = "";
    await expect(loadConfig()).rejects.toThrow(/clientId/i);
  });
});
