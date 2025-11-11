/**
 * @fileoverview Firecrawl search operation
 *
 * Provides search functionality using Firecrawl's search API.
 *
 * @module shared/clients/firecrawl/operations/search
 */

import type { SearchOptions, SearchResult } from '../types.js';
import { categorizeFirecrawlError } from '../errors.js';
import { buildHeaders } from '../utils/headers.js';

/**
 * Search using Firecrawl API
 *
 * @param apiKey - Firecrawl API key
 * @param baseUrl - Base URL for Firecrawl API
 * @param options - Search options
 * @returns Search results
 */
export async function search(
  apiKey: string,
  baseUrl: string,
  options: SearchOptions
): Promise<SearchResult> {
  const headers = buildHeaders(apiKey, true);

  const response = await fetch(`${baseUrl}/search`, {
    method: 'POST',
    headers,
    body: JSON.stringify(options),
  });

  if (!response.ok) {
    const errorText = await response.text();
    const error = categorizeFirecrawlError(response.status, errorText);

    throw new Error(
      `Firecrawl Search API Error (${error.code}): ${error.userMessage}\n` +
        `Details: ${error.message}\n` +
        `Retryable: ${error.retryable}${error.retryAfterMs ? ` (retry after ${error.retryAfterMs}ms)` : ''}`
    );
  }

  try {
    return (await response.json()) as SearchResult;
  } catch (error) {
    throw new Error(
      `Failed to parse Firecrawl API response: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
