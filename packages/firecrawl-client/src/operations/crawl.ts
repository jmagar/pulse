/**
 * @fileoverview Firecrawl crawl operations
 *
 * Provides multi-page crawling functionality using Firecrawl's Crawl API.
 *
 * @module shared/clients/firecrawl/operations/crawl
 */

import type {
  CrawlOptions,
  StartCrawlResult,
  CrawlStatusResult,
  CancelResult,
  CrawlErrorsResult,
  ActiveCrawlsResult,
} from '../types.js';
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

/**
 * Retrieve crawl errors for a job
 */
export async function getCrawlErrors(
  apiKey: string,
  baseUrl: string,
  jobId: string
): Promise<CrawlErrorsResult> {
  const headers = buildHeaders(apiKey);

  const response = await fetch(`${baseUrl}/crawl/${jobId}/errors`, {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Firecrawl API error (${response.status}): ${errorText}`);
  }

  try {
    const payload = (await response.json()) as Record<string, unknown> & {
      data?: Record<string, unknown>;
    };
    const data = payload?.data ?? payload ?? {};
    return {
      errors: Array.isArray(data.errors) ? data.errors : [],
      robotsBlocked: data.robotsBlocked ?? data.robots_blocked ?? [],
    } as CrawlErrorsResult;
  } catch (error) {
    throw new Error(
      `Failed to parse Firecrawl API response: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * List active crawl jobs for the authenticated team
 */
export async function getActiveCrawls(
  apiKey: string,
  baseUrl: string
): Promise<ActiveCrawlsResult> {
  const headers = buildHeaders(apiKey);

  const response = await fetch(`${baseUrl}/crawl/active`, {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Firecrawl API error (${response.status}): ${errorText}`);
  }

  try {
    const payload = (await response.json()) as Record<string, unknown>;
    if (!payload?.success) {
      const errorMessage =
        typeof (payload as { error?: unknown }).error === 'string'
          ? ((payload as { error?: string }).error as string)
          : 'Firecrawl API returned an error response';
      throw new Error(errorMessage);
    }

    const crawls = Array.isArray(payload.crawls)
      ? (payload.crawls as Array<Record<string, unknown>>).map((crawl) => ({
          id: crawl.id as string,
          teamId: (crawl.teamId ?? crawl.team_id) as string | undefined,
          url: crawl.url as string | undefined,
          options: crawl.options as Record<string, unknown> | undefined,
        }))
      : [];

    return {
      success: true,
      crawls,
    } satisfies ActiveCrawlsResult;
  } catch (error) {
    throw new Error(
      `Failed to parse Firecrawl API response: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
