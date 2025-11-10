/**
 * @fileoverview Firecrawl crawl operations
 *
 * Provides multi-page crawling functionality using Firecrawl's Crawl API.
 *
 * @module shared/clients/firecrawl/operations/crawl
 */

import type { CrawlOptions, StartCrawlResult, CrawlStatusResult, CancelResult } from '../types.js';

// Simple stderr logging for debugging (bypasses any log filtering)
function debugLog(message: string, data?: any) {
  process.stderr.write(`[FIRECRAWL-CLIENT-DEBUG] ${message} ${data ? JSON.stringify(data) : ''}\n`);
}

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
  debugLog('startCrawl called', { apiKey, baseUrl, targetUrl: options.url });

  // Build headers - skip Authorization for self-hosted deployments without auth
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Only add Authorization header if API key is not a self-hosted placeholder
  if (apiKey && apiKey !== 'self-hosted-no-auth') {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

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
  // Build headers - skip Authorization for self-hosted deployments without auth
  const headers: Record<string, string> = {};

  // Only add Authorization header if API key is not a self-hosted placeholder
  if (apiKey && apiKey !== 'self-hosted-no-auth') {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

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
  // Build headers - skip Authorization for self-hosted deployments without auth
  const headers: Record<string, string> = {};

  // Only add Authorization header if API key is not a self-hosted placeholder
  if (apiKey && apiKey !== 'self-hosted-no-auth') {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

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
