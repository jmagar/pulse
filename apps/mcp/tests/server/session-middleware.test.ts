import express from "express";
import session from "express-session";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { createSessionMiddleware as CreateSessionMiddleware } from "../../server/middleware/session.js";

type SessionMiddlewareFactory = typeof CreateSessionMiddleware;

let createSessionMiddleware: SessionMiddlewareFactory;

async function loadModule() {
  vi.resetModules();
  const mod = await import("../../server/middleware/session.js");
  createSessionMiddleware = mod.createSessionMiddleware;
}

function buildApp() {
  const app = express();
  app.set("trust proxy", 1);
  const store = new session.MemoryStore();
  app.use(createSessionMiddleware({ store, cookieName: "test.sid" }));

  app.get("/set", (req, res) => {
    (req.session as session.Session & { pkce?: string }).pkce = "verifier";
    res.json({ ok: true });
  });

  app.get("/get", (req, res) => {
    const pkce = (req.session as session.Session & { pkce?: string }).pkce;
    res.json({ pkce: pkce ?? null });
  });

  return app;
}

describe("Session middleware", () => {
  beforeEach(async () => {
    process.env.MCP_OAUTH_SESSION_SECRET = "s".repeat(64);
    process.env.MCP_OAUTH_REFRESH_TTL = "3600";
    process.env.NODE_ENV = "test";
    await loadModule();
  });

  it("sets secure cookie attributes", async () => {
    const app = buildApp();
    const response = await request(app).get("/set").expect(200);
    const cookie = response.headers["set-cookie"][0];
    expect(cookie).toContain("test.sid=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).not.toContain("Secure");
  });

  it("respects secure flag in production", async () => {
    process.env.NODE_ENV = "production";
    await loadModule();
    const app = buildApp();
    const response = await request(app)
      .get("/set")
      .set("X-Forwarded-Proto", "https")
      .expect(200);
    const cookie = response.headers["set-cookie"][0];
    expect(cookie).toContain("Secure");
  });

  it("persists session data between requests", async () => {
    const app = buildApp();
    const agent = request.agent(app);
    await agent.get("/set").expect(200);
    const result = await agent.get("/get").expect(200);
    expect(result.body.pkce).toBe("verifier");
  });
});
