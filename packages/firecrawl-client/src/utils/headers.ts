/**
 * @fileoverview HTTP header utilities and debug logging for Firecrawl API requests
 *
 * @module firecrawl-client/utils/headers
 */

import { SELF_HOSTED_NO_AUTH } from '../constants.js';

/**
 * Debug logging utility for Firecrawl client
 *
 * Writes debug messages to stderr, bypassing any log filtering.
 * Only logs when DEBUG environment variable includes 'firecrawl-client'.
 *
 * @param message - Debug message to log
 * @param data - Optional data to include (will be JSON stringified)
 *
 * @example
 * ```typescript
 * debugLog('API request', { url: 'https://api.firecrawl.dev/scrape', method: 'POST' });
 * // Output (only if DEBUG=firecrawl-client): [FIRECRAWL-CLIENT-DEBUG] API request {"url":"...","method":"POST"}
 * ```
 */
export function debugLog(message: string, data?: any): void {
  if (process.env.DEBUG?.includes('firecrawl-client')) {
    process.stderr.write(`[FIRECRAWL-CLIENT-DEBUG] ${message} ${data ? JSON.stringify(data) : ''}\n`);
  }
}

/**
 * Build HTTP headers for Firecrawl API requests
 *
 * Constructs the appropriate headers based on the API key and request type.
 * For self-hosted deployments without authentication, the Authorization header
 * is omitted.
 *
 * @param apiKey - Firecrawl API key or SELF_HOSTED_NO_AUTH placeholder
 * @param includeContentType - Whether to include Content-Type: application/json header
 * @returns Record of HTTP headers
 *
 * @example
 * ```typescript
 * // For authenticated requests with JSON body
 * const headers = buildHeaders('fc-abc123', true);
 * // Result: { 'Content-Type': 'application/json', 'Authorization': 'Bearer fc-abc123' }
 *
 * // For self-hosted without auth
 * const headers = buildHeaders('self-hosted-no-auth', true);
 * // Result: { 'Content-Type': 'application/json' }
 *
 * // For GET requests without body
 * const headers = buildHeaders('fc-abc123', false);
 * // Result: { 'Authorization': 'Bearer fc-abc123' }
 * ```
 */
export function buildHeaders(apiKey: string, includeContentType = false): Record<string, string> {
  const headers: Record<string, string> = {};

  if (includeContentType) {
    headers['Content-Type'] = 'application/json';
  }

  // Only add Authorization header if API key is not a self-hosted placeholder
  if (apiKey && apiKey !== SELF_HOSTED_NO_AUTH) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  return headers;
}
