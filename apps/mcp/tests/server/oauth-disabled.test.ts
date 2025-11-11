import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { Application } from "express";
import { createExpressServer } from "../../server/http.js";

/**
 * Test suite for OAuth disabled functionality
 *
 * Verifies that when ENABLE_OAUTH is false (default), the server:
 * 1. Returns clear error for OAuth endpoints
 * 2. Works normally for MCP endpoint without auth
 * 3. Properly reads the environment variable
 */
describe("OAuth Disabled", () => {
  let app: Application;

  beforeEach(async () => {
    // Ensure ENABLE_OAUTH is false
    process.env.ENABLE_OAUTH = "false";
    // Set dummy API key to avoid initialization errors
    process.env.FIRECRAWL_API_KEY = "test-key-for-oauth-test";
    app = await createExpressServer();
  });

  afterEach(() => {
    delete process.env.ENABLE_OAUTH;
    delete process.env.FIRECRAWL_API_KEY;
  });

  it("should return clear error when trying to access /register endpoint", async () => {
    const response = await request(app)
      .post("/register")
      .send({ client_id: "test" })
      .expect(404);

    expect(response.body).toHaveProperty("error");
    expect(response.body.error).toContain("OAuth is not enabled");
  });

  it("should return clear error when trying to access /authorize endpoint", async () => {
    const response = await request(app).get("/authorize").expect(404);

    expect(response.body).toHaveProperty("error");
    expect(response.body.error).toContain("OAuth is not enabled");
  });

  it("should allow MCP endpoint without authentication (no 401/403)", async () => {
    // Initialize request should not require OAuth
    const initRequest = {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: {
          name: "test-client",
          version: "1.0.0",
        },
      },
    };

    const response = await request(app)
      .post("/mcp")
      .set("Content-Type", "application/json")
      .set("Accept", "*/*")
      .send(initRequest);

    // Verify no authentication error (401 Unauthorized or 403 Forbidden)
    // Note: 406 is a content negotiation issue, not an auth issue
    expect(response.status).not.toBe(401);
    expect(response.status).not.toBe(403);
  });
});

describe("OAuth Enabled (future)", () => {
  let app: Application;

  beforeEach(async () => {
    process.env.ENABLE_OAUTH = "true";
    process.env.FIRECRAWL_API_KEY = "test-key-for-oauth-test";
    app = await createExpressServer();
  });

  afterEach(() => {
    delete process.env.ENABLE_OAUTH;
    delete process.env.FIRECRAWL_API_KEY;
  });

  it("should indicate OAuth is not yet implemented when enabled", async () => {
    const response = await request(app)
      .post("/register")
      .send({ client_id: "test" })
      .expect(501);

    expect(response.body).toHaveProperty("error");
    expect(response.body.error).toContain("not yet implemented");
  });
});
