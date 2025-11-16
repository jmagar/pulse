import express from "express";
import request from "supertest";
import { beforeEach, describe, it, vi } from "vitest";

async function loadMiddleware() {
  vi.resetModules();
  const mod = await import("../../server/middleware/auth.js");
  return mod;
}

describe("authMiddleware", () => {
  beforeEach(() => {
    process.env.MCP_ENABLE_OAUTH = "true";
  });

  it("allows requests when OAuth disabled", async () => {
    process.env.MCP_ENABLE_OAUTH = "false";
    const { authMiddleware } = await loadMiddleware();
    const app = express();
    app.use(express.json());
    app.post("/mcp", authMiddleware, (_req, res) => res.json({ ok: true }));

    await request(app).post("/mcp").send({ method: "tools/list" }).expect(200);
  });

  it("allows initialization requests without session", async () => {
    const { authMiddleware } = await loadMiddleware();
    const app = express();
    app.use(express.json());
    app.post("/mcp", authMiddleware, (_req, res) => res.json({ ok: true }));

    await request(app).post("/mcp").send({ method: "initialize" }).expect(200);
  });

  it("blocks non-initialized requests without session", async () => {
    const { authMiddleware } = await loadMiddleware();
    const app = express();
    app.use(express.json());
    app.post("/mcp", authMiddleware, (_req, res) => res.json({ ok: true }));

    await request(app).post("/mcp").send({ method: "tools/list" }).expect(401);
  });

  it("passes through when session user exists", async () => {
    const { authMiddleware } = await loadMiddleware();
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as any).session = { user: { id: "user", scopes: [] } };
      next();
    });
    app.post("/mcp", authMiddleware, (_req, res) => res.json({ ok: true }));

    await request(app).post("/mcp").send({ method: "tools/list" }).expect(200);
  });
});

describe("scopeMiddleware", () => {
  beforeEach(() => {
    process.env.MCP_ENABLE_OAUTH = "true";
  });

  it("allows requests without scope requirements", async () => {
    const { scopeMiddleware } = await loadMiddleware();
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as any).session = { user: { id: "user", scopes: [] } };
      next();
    });
    app.post("/mcp", scopeMiddleware, (_req, res) => res.json({ ok: true }));

    await request(app).post("/mcp").send({ method: "tools/list" }).expect(200);
  });

  it("blocks requests when required scopes missing", async () => {
    const { scopeMiddleware } = await loadMiddleware();
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as any).session = { user: { id: "user", scopes: ["mcp:query"] } };
      next();
    });
    app.post("/mcp", scopeMiddleware, (_req, res) => res.json({ ok: true }));

    await request(app)
      .post("/mcp")
      .send({
        method: "tools/call",
        params: { name: "scrape" },
      })
      .expect(403);
  });

  it("allows requests when user has required scope", async () => {
    const { scopeMiddleware } = await loadMiddleware();
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as any).session = {
        user: { id: "user", scopes: ["mcp:scrape"] },
      };
      next();
    });
    app.post("/mcp", scopeMiddleware, (_req, res) => res.json({ ok: true }));

    await request(app)
      .post("/mcp")
      .send({ method: "tools/call", params: { name: "scrape" } })
      .expect(200);
  });
});
