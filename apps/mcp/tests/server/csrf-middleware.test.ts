import express from "express";
import session from "express-session";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

async function createApp() {
  const { createSessionMiddleware } = await import(
    "../../server/middleware/session.js"
  );
  const { csrfTokenMiddleware, csrfProtection } = await import(
    "../../server/middleware/csrf.js"
  );
  const app = express();
  app.use(express.json());
  const store = new session.MemoryStore();
  app.use(
    createSessionMiddleware({
      store,
      cookieName: "test.sid",
      rolling: false,
    }),
  );
  app.use(csrfTokenMiddleware);
  app.post("/protected", csrfProtection, (_req, res) => res.json({ ok: true }));
  return app;
}

describe("csrf middleware", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.MCP_OAUTH_SESSION_SECRET = "s".repeat(64);
    process.env.MCP_OAUTH_REFRESH_TTL = "3600";
  });

  it("issues csrf token header", async () => {
    const app = await createApp();
    const response = await request(app).post("/protected").send({});
    expect(response.headers["x-csrf-token"]).toBeDefined();
  });

  it("rejects missing token", async () => {
    const app = await createApp();
    await request(app).post("/protected").send({}).expect(403);
  });

  it("accepts valid token", async () => {
    const app = await createApp();
    const agent = request.agent(app);
    const first = await agent.post("/protected").send({});
    const token = first.headers["x-csrf-token"];
    await agent
      .post("/protected")
      .set("X-CSRF-Token", token)
      .send({})
      .expect(200);
  });
});
