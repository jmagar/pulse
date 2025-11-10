import { Request, Response, NextFunction } from 'express';
import { logWarning } from '../shared/utils/logging.js';

/**
 * Middleware to log when requests would be blocked by DNS rebinding protection
 *
 * This middleware checks if DNS rebinding protection is enabled and validates
 * the Host header against the allowed hosts list. If a request would be blocked,
 * it logs a warning with details about the blocked request before allowing the
 * SDK's transport layer to handle the actual rejection.
 *
 * @param req - Express request object
 * @param res - Express response object
 * @param next - Express next function
 */
export function hostValidationLogger(req: Request, res: Response, next: NextFunction): void {
  // Only check if DNS rebinding protection is enabled
  const isDnsProtectionEnabled = process.env.NODE_ENV === 'production';

  if (!isDnsProtectionEnabled) {
    next();
    return;
  }

  // Get the Host header
  const hostHeader = req.headers.host;

  if (!hostHeader) {
    logWarning('host-validation', 'Request blocked: Missing Host header', {
      ip: req.ip,
      method: req.method,
      path: req.path,
      userAgent: req.headers['user-agent'],
    });
    next();
    return;
  }

  // Get allowed hosts from environment
  const allowedHosts = process.env.ALLOWED_HOSTS?.split(',').filter(Boolean) || [];

  // If no allowed hosts are configured, all hosts are allowed
  if (allowedHosts.length === 0) {
    next();
    return;
  }

  // Check if the Host header matches any allowed host
  const isAllowed = allowedHosts.some((allowed) => {
    // Exact match
    if (hostHeader === allowed) {
      return true;
    }

    // Wildcard subdomain match (e.g., *.example.com matches api.example.com)
    if (allowed.startsWith('*.')) {
      const domain = allowed.slice(2); // Remove '*.'
      return hostHeader.endsWith(domain);
    }

    return false;
  });

  if (!isAllowed) {
    logWarning('host-validation', `Request blocked: Invalid Host header: ${hostHeader}`, {
      blockedHost: hostHeader,
      allowedHosts: allowedHosts.join(', '),
      ip: req.ip,
      method: req.method,
      path: req.path,
      userAgent: req.headers['user-agent'],
      origin: req.headers.origin,
      referer: req.headers.referer,
    });
  }

  next();
}
