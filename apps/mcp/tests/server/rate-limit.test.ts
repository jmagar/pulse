import express from "express";
import request from "supertest";
import { describe, expect, it, beforeEach, vi } from "vitest";

import { createRateLimiter, RateLimiter } from "../../server/middleware/rateLimit.js";

describe("rate limiter middleware", () => {
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

describe("RateLimiter class - Crawl Operations", () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 10, // 10 requests per window
    });
  });

  it("should allow requests within limit", () => {
    for (let i = 0; i < 10; i++) {
      expect(limiter.check("user-123")).toBe(true);
    }
  });

  it("should block requests exceeding limit", () => {
    for (let i = 0; i < 10; i++) {
      limiter.check("user-123");
    }
    expect(limiter.check("user-123")).toBe(false);
  });

  it("should reset after window expires", async () => {
    // Use fake timers
    vi.useFakeTimers();

    for (let i = 0; i < 10; i++) {
      limiter.check("user-123");
    }

    // Verify limit reached
    expect(limiter.check("user-123")).toBe(false);

    // Fast-forward time past the 15-minute window
    vi.advanceTimersByTime(15 * 60 * 1000 + 100);

    // Should allow requests again
    expect(limiter.check("user-123")).toBe(true);

    vi.useRealTimers();
  });

  it("should track different keys independently", () => {
    // User 123 uses all requests
    for (let i = 0; i < 10; i++) {
      limiter.check("user-123");
    }
    expect(limiter.check("user-123")).toBe(false);

    // User 456 should still have requests available
    expect(limiter.check("user-456")).toBe(true);
  });

  it("should reset a specific key", () => {
    // Use some requests
    for (let i = 0; i < 10; i++) {
      limiter.check("user-123");
    }
    expect(limiter.check("user-123")).toBe(false);

    // Reset the key
    limiter.reset("user-123");

    // Should allow requests again
    expect(limiter.check("user-123")).toBe(true);
  });
});
