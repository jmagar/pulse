/**
 * @fileoverview Firecrawl crawl operations
 *
 * Provides multi-page crawling functionality using Firecrawl's Crawl API.
 *
 * @module shared/clients/firecrawl/operations/crawl
 */

import type { CrawlOptions, StartCrawlResult, CrawlStatusResult, CancelResult } from '../types.js';
import { buildHeaders, debugLog } from '../utils/headers.js';

/**
 * Start a crawl job using Firecrawl API
 *
 * @param apiKey - Firecrawl API key
 * @param baseUrl - Base URL for Firecrawl API
 * @param options - Crawl options
 * @returns Crawl job information
 */
export async function startCrawl(
  apiKey: string,
  baseUrl: string,
  options: CrawlOptions
): Promise<StartCrawlResult> {
  debugLog('startCrawl called', { baseUrl, targetUrl: options.url });

  const headers = buildHeaders(apiKey, true);

  const fetchUrl = `${baseUrl}/crawl`;
  debugLog('Fetching', { url: fetchUrl, hasAuth: !!headers['Authorization'] });

  const response = await fetch(fetchUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(options),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Firecrawl API error (${response.status}): ${errorText}`);
  }

  try {
    return (await response.json()) as StartCrawlResult;
  } catch (error) {
    throw new Error(
      `Failed to parse Firecrawl API response: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Get crawl job status
 *
 * @param apiKey - Firecrawl API key
 * @param baseUrl - Base URL for Firecrawl API
 * @param jobId - Crawl job ID
 * @returns Crawl status information
 */
export async function getCrawlStatus(
  apiKey: string,
  baseUrl: string,
  jobId: string
): Promise<CrawlStatusResult> {
  const headers = buildHeaders(apiKey);

  const response = await fetch(`${baseUrl}/crawl/${jobId}`, {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Firecrawl API error (${response.status}): ${errorText}`);
  }

  try {
    return (await response.json()) as CrawlStatusResult;
  } catch (error) {
    throw new Error(
      `Failed to parse Firecrawl API response: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Cancel a crawl job
 *
 * @param apiKey - Firecrawl API key
 * @param baseUrl - Base URL for Firecrawl API
 * @param jobId - Crawl job ID
 * @returns Cancellation confirmation
 */
export async function cancelCrawl(
  apiKey: string,
  baseUrl: string,
  jobId: string
): Promise<CancelResult> {
  const headers = buildHeaders(apiKey);

  const response = await fetch(`${baseUrl}/crawl/${jobId}`, {
    method: 'DELETE',
    headers,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Firecrawl API error (${response.status}): ${errorText}`);
  }

  try {
    return (await response.json()) as CancelResult;
  } catch (error) {
    throw new Error(
      `Failed to parse Firecrawl API response: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
