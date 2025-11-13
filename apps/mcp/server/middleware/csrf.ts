import type { Request, Response, NextFunction } from "express";
import type { Session } from "express-session";
import crypto from "node:crypto";
import { logAuditEvent } from "../oauth/audit-logger.js";

const TOKEN_LENGTH = 32;
const HEADER_NAME = "x-csrf-token";

function ensureSession(req: Request): asserts req is Request & {
  session: Session & { csrfToken?: string };
} {
  if (!req.session) {
    throw new Error("Session middleware is required before CSRF middleware");
  }
}

function generateToken(): string {
  return crypto.randomBytes(TOKEN_LENGTH).toString("hex");
}

export function csrfTokenMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.session) {
    return next();
  }

  if (!req.session.csrfToken) {
    req.session.csrfToken = generateToken();
  }

  res.setHeader("X-CSRF-Token", req.session.csrfToken);
  next();
}

export async function csrfProtection(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  ensureSession(req);

  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
    return next();
  }

  const expected = req.session.csrfToken;
  const provided = req.headers[HEADER_NAME];

  if (expected && typeof provided === "string" && provided === expected) {
    return next();
  }

  await logAuditEvent({
    type: "csrf_block",
    userId: req.session.user?.id,
    ip: req.ip,
    userAgent: req.headers["user-agent"] as string | undefined,
  });

  res.status(403).json({
    error: "invalid_csrf_token",
    error_description: "Missing or invalid CSRF token",
  });
}
