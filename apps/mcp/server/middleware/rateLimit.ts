import type { Request, Response, NextFunction } from "express";

interface RateLimitConfig {
  windowMs: number;
  limit: number;
  keyGenerator?: (req: Request) => string;
}

interface RateRecord {
  count: number;
  expiresAt: number;
}

export function createRateLimiter(config: RateLimitConfig) {
  const store = new Map<string, RateRecord>();
  const keyGen = config.keyGenerator ?? ((req) => req.ip || "global");

  return function rateLimit(
    req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    const key = keyGen(req);
    const now = Date.now();
    const record = store.get(key);

    if (!record || record.expiresAt < now) {
      store.set(key, { count: 1, expiresAt: now + config.windowMs });
      return next();
    }

    if (record.count < config.limit) {
      record.count += 1;
      return next();
    }

    res.status(429).json({
      error: "rate_limit_exceeded",
      error_description: "Too many requests. Please try again later.",
      retry_after: Math.ceil((record.expiresAt - now) / 1000),
    });
  };
}

/**
 * Simple in-memory rate limiter using sliding window.
 */
export interface RateLimiterOptions {
  windowMs: number; // Time window in milliseconds
  max: number; // Max requests per window
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export class RateLimiter {
  private store = new Map<string, RateLimitEntry>();
  private options: RateLimiterOptions;

  constructor(options: RateLimiterOptions) {
    this.options = options;
  }

  check(key: string): boolean {
    const now = Date.now();
    const entry = this.store.get(key);

    // No entry or expired window
    if (!entry || now >= entry.resetAt) {
      this.store.set(key, {
        count: 1,
        resetAt: now + this.options.windowMs,
      });
      return true;
    }

    // Within window, check limit
    if (entry.count < this.options.max) {
      entry.count++;
      return true;
    }

    // Exceeded limit
    return false;
  }

  reset(key: string): void {
    this.store.delete(key);
  }
}
