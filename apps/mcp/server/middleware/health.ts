import { Request, Response } from 'express';

/**
 * Health check endpoint handler
 * Returns basic server health information
 *
 * @param _req - Express request object (unused)
 * @param res - Express response object
 */
export function healthCheck(_req: Request, res: Response): void {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || 'unknown',
    transport: 'http-streaming',
  });
}
