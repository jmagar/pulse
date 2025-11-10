import { Request, Response, NextFunction } from 'express';

/**
 * Placeholder for future authentication middleware
 * Currently a no-op passthrough
 *
 * Future implementation could use:
 * - Bearer token validation
 * - OAuth 2.0 with MCP SDK auth helpers
 * - API key checking
 * - JWT verification
 *
 * @param req - Express request object
 * @param res - Express response object
 * @param next - Express next function
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  // TODO: Implement authentication logic
  // Example: Check Authorization header, validate token, etc.
  next();
}

/**
 * Metrics authentication middleware
 *
 * Protects metrics endpoints with optional authentication.
 * Enable by setting METRICS_AUTH_ENABLED=true and providing METRICS_AUTH_KEY.
 *
 * Security note: These endpoints can expose operational details.
 * In production, enable authentication with:
 * - METRICS_AUTH_ENABLED=true
 * - METRICS_AUTH_KEY=your-secret-key
 *
 * Access authenticated endpoints with:
 * - X-Metrics-Key header: curl -H "X-Metrics-Key: your-secret-key" http://localhost:${MCP_PORT}/metrics
 * - key query parameter: curl http://localhost:${MCP_PORT}/metrics?key=your-secret-key
 *
 * @param req - Express request object
 * @param res - Express response object
 * @param next - Express next function
 */
export function metricsAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Check if authentication is enabled
  if (process.env.METRICS_AUTH_ENABLED !== 'true') {
    // Auth disabled, allow access
    return next();
  }

  // Get auth key from header or query parameter
  const authKey = req.headers['x-metrics-key'] || req.query.key;
  const expectedKey = process.env.METRICS_AUTH_KEY;

  // Validate key exists and matches
  if (!expectedKey) {
    res.status(500).json({
      error: 'Server misconfiguration',
      message:
        'METRICS_AUTH_ENABLED is true but METRICS_AUTH_KEY is not set. Please configure METRICS_AUTH_KEY.',
    });
    return;
  }

  if (authKey === expectedKey) {
    // Valid key, proceed
    next();
  } else {
    // Invalid or missing key
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Valid metrics authentication key required. Provide via X-Metrics-Key header or ?key= query parameter.',
    });
  }
}
