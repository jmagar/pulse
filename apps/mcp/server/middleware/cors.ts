import { CorsOptions } from 'cors';

/**
 * Get CORS configuration options for the HTTP server
 *
 * Configures CORS to:
 * - Allow specified origins from environment or default to all
 * - Expose MCP-specific headers (Mcp-Session-Id)
 * - Support credentials (when not using wildcard origin)
 * - Allow standard MCP HTTP methods
 *
 * Note: CORS specification prohibits using `credentials: true` with `origin: '*'`
 *
 * @returns CORS options object
 */
export function getCorsOptions(): CorsOptions {
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').filter(Boolean) || ['*'];

  // CORS spec: can't use credentials: true with origin: '*'
  const isWildcard = allowedOrigins.length === 1 && allowedOrigins[0] === '*';

  return {
    origin: isWildcard ? '*' : allowedOrigins, // Use string '*' for wildcard, not array
    exposedHeaders: ['Mcp-Session-Id'],
    credentials: !isWildcard, // Only enable credentials for specific origins
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  };
}
