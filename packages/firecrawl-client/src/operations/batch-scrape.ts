import type {
  BatchScrapeOptions,
  BatchScrapeStartResult,
  BatchScrapeCancelResult,
  CrawlStatusResult,
  CrawlErrorsResult,
} from '../types.js';
import { buildHeaders } from '../utils/headers.js';

function buildRequestBody(options: BatchScrapeOptions): Record<string, unknown> {
  const {
    urls,
    webhook,
    appendToId,
    ignoreInvalidURLs,
    ignoreInvalidUrls,
    ...scrapeOptions
  } = options;

  const body: Record<string, unknown> = {
    urls,
    ...scrapeOptions,
  };

  const ignoreFlag = ignoreInvalidURLs ?? ignoreInvalidUrls;
  if (typeof ignoreFlag === 'boolean') {
    body.ignoreInvalidURLs = ignoreFlag;
  }

  if (appendToId) {
    body.appendToId = appendToId;
  }

  if (webhook) {
    body.webhook = webhook;
  }

  return body;
}

async function throwForFailure(response: Response): Promise<never> {
  let detail = '';
  try {
    detail = await response.text();
  } catch {
    detail = response.statusText;
  }
  throw new Error(`Firecrawl API error (${response.status}): ${detail}`);
}

export async function startBatchScrape(
  apiKey: string,
  baseUrl: string,
  options: BatchScrapeOptions,
): Promise<BatchScrapeStartResult> {
  if (!options.urls || options.urls.length === 0) {
    throw new Error('Batch scrape requires at least one URL');
  }

  const response = await fetch(`${baseUrl}/batch/scrape`, {
    method: 'POST',
    headers: buildHeaders(apiKey, true),
    body: JSON.stringify(buildRequestBody(options)),
  });

  if (!response.ok) {
    await throwForFailure(response);
  }

  const payload = (await response.json()) as Record<string, any>;

  return {
    success: Boolean(payload.success),
    id: payload.id,
    url: payload.url,
    invalidURLs: payload.invalidURLs ?? payload.invalidUrls ?? [],
  };
}

export async function getBatchScrapeStatus(
  apiKey: string,
  baseUrl: string,
  jobId: string,
): Promise<CrawlStatusResult> {
  const response = await fetch(`${baseUrl}/batch/scrape/${jobId}`, {
    method: 'GET',
    headers: buildHeaders(apiKey),
  });

  if (!response.ok) {
    await throwForFailure(response);
  }

  const payload = (await response.json()) as Record<string, any>;

  return {
    status: payload.status,
    total: payload.total ?? 0,
    completed: payload.completed ?? 0,
    creditsUsed: payload.creditsUsed ?? 0,
    expiresAt: payload.expiresAt ?? '',
    next: payload.next ?? undefined,
    data: Array.isArray(payload.data) ? payload.data : [],
  };
}

export async function cancelBatchScrape(
  apiKey: string,
  baseUrl: string,
  jobId: string,
): Promise<BatchScrapeCancelResult> {
  const response = await fetch(`${baseUrl}/batch/scrape/${jobId}`, {
    method: 'DELETE',
    headers: buildHeaders(apiKey),
  });

  if (!response.ok) {
    await throwForFailure(response);
  }

  const payload = (await response.json()) as Record<string, any>;
  return {
    success: Boolean(payload.success ?? true),
    message: payload.message,
  };
}

export async function getBatchScrapeErrors(
  apiKey: string,
  baseUrl: string,
  jobId: string,
): Promise<CrawlErrorsResult> {
  const response = await fetch(`${baseUrl}/batch/scrape/${jobId}/errors`, {
    method: 'GET',
    headers: buildHeaders(apiKey),
  });

  if (!response.ok) {
    await throwForFailure(response);
  }

  const payload = (await response.json()) as {
    errors?: CrawlErrorsResult['errors'];
    robotsBlocked?: string[];
    robots_blocked?: string[];
  };

  return {
    errors: payload.errors ?? [],
    robotsBlocked: payload.robotsBlocked ?? payload.robots_blocked ?? [],
  };
}
