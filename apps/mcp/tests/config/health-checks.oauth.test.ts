import { describe, expect, it, beforeEach, vi } from "vitest";

const mockRedisClient = {
  connect: vi.fn().mockResolvedValue(undefined),
  ping: vi.fn().mockResolvedValue("PONG"),
  disconnect: vi.fn().mockResolvedValue(undefined),
  on: vi.fn(),
};

vi.mock("redis", () => ({
  createClient: vi.fn().mockReturnValue(mockRedisClient),
}));

const mockHttpRequest = vi.fn().mockImplementation((_options, callback) => {
  const res = { statusCode: 400 } as any;
  process.nextTick(() => callback(res));
  return { write: vi.fn(), end: vi.fn(), on: vi.fn(), setTimeout: vi.fn() };
});

const mockHttpsRequest = vi.fn().mockImplementation((_options, callback) => {
  const res = { statusCode: 400 } as any;
  process.nextTick(() => callback(res));
  return { write: vi.fn(), end: vi.fn(), on: vi.fn(), setTimeout: vi.fn() };
});

vi.mock("http", () => ({
  default: { request: mockHttpRequest },
  request: mockHttpRequest,
}));

vi.mock("https", () => ({
  default: { request: mockHttpsRequest },
  request: mockHttpsRequest,
}));

describe("health checks", () => {
  beforeEach(() => {
    vi.resetModules();
    mockRedisClient.connect.mockClear();
    mockRedisClient.ping.mockClear();
    mockRedisClient.disconnect.mockClear();
    process.env.MCP_FIRECRAWL_API_KEY = "test";
    process.env.MCP_FIRECRAWL_BASE_URL = "https://api.firecrawl.dev";
    process.env.MCP_ENABLE_OAUTH = "false";
  });

  it("passes when Firecrawl auth healthy", async () => {
    const { runHealthChecks } = await import("../../config/health-checks.js");
    const checks = await runHealthChecks();
    expect(checks.find((c) => c.service === "Firecrawl")?.success).toBe(true);
  });

  it("fails when OAuth config missing", async () => {
    process.env.MCP_ENABLE_OAUTH = "true";
    delete process.env.MCP_GOOGLE_CLIENT_ID;
    process.env.MCP_GOOGLE_CLIENT_SECRET = "secret";
    process.env.MCP_GOOGLE_REDIRECT_URI = "https://example.com/callback";
    process.env.MCP_OAUTH_SESSION_SECRET = "s".repeat(64);
    process.env.MCP_OAUTH_TOKEN_KEY = "t".repeat(64);
    process.env.MCP_REDIS_URL = "redis://localhost:6379";

    const { runHealthChecks } = await import("../../config/health-checks.js");
    const checks = await runHealthChecks();
    const oauthCheck = checks.find((c) => c.service === "OAuth");
    expect(oauthCheck?.success).toBe(false);
  });

  it("passes OAuth and Redis checks when configured", async () => {
    process.env.MCP_ENABLE_OAUTH = "true";
    process.env.MCP_GOOGLE_CLIENT_ID = "client";
    process.env.MCP_GOOGLE_CLIENT_SECRET = "secret";
    process.env.MCP_GOOGLE_REDIRECT_URI = "https://example.com/callback";
    process.env.MCP_OAUTH_SESSION_SECRET = "s".repeat(64);
    process.env.MCP_OAUTH_TOKEN_KEY = "t".repeat(64);
    process.env.MCP_REDIS_URL = "redis://localhost:6379";

    const { runHealthChecks } = await import("../../config/health-checks.js");
    const checks = await runHealthChecks();
    expect(checks.find((c) => c.service === "OAuth")?.success).toBe(true);
    expect(
      checks.find((c) => c.service === "Redis (sessions)")?.success,
    ).toBe(true);
  });
});
