import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { Application } from "express";
import { createExpressServer } from "../../server/http.js";

describe("OAuth Disabled", () => {
  let app: Application;

  beforeEach(async () => {
    process.env.MCP_ENABLE_OAUTH = "false";
    process.env.FIRECRAWL_API_KEY = "test-key-for-oauth-test";
    app = await createExpressServer();
  });

  afterEach(() => {
    delete process.env.MCP_ENABLE_OAUTH;
    delete process.env.FIRECRAWL_API_KEY;
  });

  it("should return clear error when trying to access /auth/google", async () => {
    const response = await request(app).get("/auth/google").expect(404);

    expect(response.body).toHaveProperty("error");
    expect(response.body.error).toContain("OAuth is not enabled");
  });

  it("should allow MCP endpoint without authentication (no 401/403)", async () => {
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

    expect(response.status).not.toBe(401);
    expect(response.status).not.toBe(403);
  });
});
