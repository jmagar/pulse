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
