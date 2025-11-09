/**
 * @fileoverview Firecrawl crawl operations
 *
 * Provides multi-page crawling functionality using Firecrawl's Crawl API.
 *
 * @module shared/clients/firecrawl/operations/crawl
 */

import type { CrawlOptions, StartCrawlResult, CrawlStatusResult, CancelResult } from '../types.js';

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
  const response = await fetch(`${baseUrl}/crawl`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
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
  const response = await fetch(`${baseUrl}/crawl/${jobId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
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
  const response = await fetch(`${baseUrl}/crawl/${jobId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
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
