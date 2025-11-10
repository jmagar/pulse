/**
 * @fileoverview Firecrawl map operation
 *
 * Provides URL discovery within websites using Firecrawl's Map API.
 *
 * @module shared/clients/firecrawl/operations/map
 */

import type { MapOptions, MapResult } from '../types.js';
import { categorizeFirecrawlError } from '../errors.js';
import { buildHeaders } from '../utils/headers.js';

/**
 * Map website URLs using Firecrawl API
 *
 * @param apiKey - Firecrawl API key
 * @param baseUrl - Base URL for Firecrawl API
 * @param options - Map options
 * @returns Map result with discovered URLs
 */
export async function map(
  apiKey: string,
  baseUrl: string,
  options: MapOptions
): Promise<MapResult> {
  console.log(
    '[DEBUG] Firecrawl map API request:',
    JSON.stringify({ url: `${baseUrl}/map`, body: options }, null, 2)
  );

  const headers = buildHeaders(apiKey, true);

  const response = await fetch(`${baseUrl}/map`, {
    method: 'POST',
    headers,
    body: JSON.stringify(options),
  });

  console.log('[DEBUG] Firecrawl map API response status:', response.status);

  if (!response.ok) {
    const errorText = await response.text();
    const error = categorizeFirecrawlError(response.status, errorText);

    throw new Error(
      `Firecrawl Map API Error (${error.code}): ${error.userMessage}\n` +
        `Details: ${error.message}\n` +
        `Retryable: ${error.retryable}${error.retryAfterMs ? ` (retry after ${error.retryAfterMs}ms)` : ''}`
    );
  }

  try {
    const result = await response.json();
    console.log('[DEBUG] Firecrawl map API raw response:', JSON.stringify(result, null, 2));
    return result as MapResult;
  } catch (error) {
    throw new Error(
      `Failed to parse Firecrawl API response: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
