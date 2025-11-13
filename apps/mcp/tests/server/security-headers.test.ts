import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { securityHeaders } from "../../server/middleware/securityHeaders.js";

describe("security headers", () => {
  it("sets standard headers", async () => {
    const app = express();
    app.use(securityHeaders);
    app.get("/", (_req, res) => res.send("ok"));

    const res = await request(app).get("/");
    expect(res.headers["strict-transport-security"]).toBeDefined();
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBe("DENY");
  });
});
