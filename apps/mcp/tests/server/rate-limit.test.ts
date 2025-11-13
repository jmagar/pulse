import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createRateLimiter } from "../../server/middleware/rateLimit.js";

describe("rate limiter", () => {
  it("limits requests after threshold", async () => {
    const app = express();
    const limiter = createRateLimiter({ windowMs: 1000, limit: 2 });
    app.get("/limited", limiter, (_req, res) => res.json({ ok: true }));

    await request(app).get("/limited").expect(200);
    await request(app).get("/limited").expect(200);
    const res = await request(app).get("/limited").expect(429);
    expect(res.body.error).toBe("rate_limit_exceeded");
  });
});
