import type { Request, Response, NextFunction } from "express";

import { env } from "../../config/environment.js";
import { getScopesForRequest } from "../oauth/scope-validator.js";

function isInitializationRequest(req: Request): boolean {
  return (
    req.method === "POST" &&
    typeof req.body === "object" &&
    req.body?.method === "initialize"
  );
}

export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (env.enableOAuth !== "true") {
    next();
    return;
  }

  if (isInitializationRequest(req)) {
    next();
    return;
  }

  if (req.session?.user) {
    res.locals.user = req.session.user;
    next();
    return;
  }

  res.status(401).json({
    error: "unauthorized",
    error_description: "Authentication required",
  });
}

export function scopeMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (env.enableOAuth !== "true" || isInitializationRequest(req)) {
    next();
    return;
  }

  const requiredScopes = getScopesForRequest(req);
  if (requiredScopes.length === 0) {
    next();
    return;
  }

  const userScopes = req.session?.user?.scopes ?? [];
  const missing = requiredScopes.filter((scope) => !userScopes.includes(scope));

  if (missing.length > 0) {
    res.status(403).json({
      error: "insufficient_scope",
      error_description: `Missing required scopes: ${missing.join(", ")}`,
      required_scopes: missing,
    });
    return;
  }

  next();
}

export function metricsAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (process.env.METRICS_AUTH_ENABLED !== "true") {
    next();
    return;
  }

  const authKey = req.headers["x-metrics-key"] || req.query.key;
  const expectedKey = process.env.METRICS_AUTH_KEY;

  if (!expectedKey) {
    res.status(500).json({
      error: "Server misconfiguration",
      message:
        "METRICS_AUTH_ENABLED is true but METRICS_AUTH_KEY is not set. Please configure METRICS_AUTH_KEY.",
    });
    return;
  }

  if (authKey === expectedKey) {
    next();
    return;
  }

  res.status(401).json({
    error: "Unauthorized",
    message:
      "Valid metrics authentication key required. Provide via X-Metrics-Key header or ?key= query parameter.",
  });
}
