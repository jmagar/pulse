/**
 * @fileoverview Webhook scrape client - Thin wrapper for webhook v2/scrape endpoint
 *
 * This client delegates all scraping operations to the webhook service's
 * /api/v2/scrape endpoint, which handles caching, cleaning, extraction,
 * and storage. The MCP server becomes a pure thin wrapper.
 *
 * @module tools/scrape/webhook-client
 */

/**
 * Configuration for WebhookScrapeClient
 */
export interface WebhookScrapeConfig {
  baseUrl: string;
  apiSecret: string;
}

/**
 * Browser automation action types
 */
export interface BrowserAction {
  type:
    | "wait"
    | "click"
    | "write"
    | "press"
    | "scroll"
    | "screenshot"
    | "scrape"
    | "executeJavascript";
  milliseconds?: number;
  selector?: string;
  text?: string;
  key?: string;
  direction?: "up" | "down";
  amount?: number;
  name?: string;
  script?: string;
}

/**
 * Scrape request options matching webhook API schema
 */
export interface ScrapeRequest {
  // Command type
  command: "start" | "status" | "cancel" | "errors";

  // Single URL scrape (command=start)
  url?: string;
  timeout?: number;
  maxChars?: number;
  startIndex?: number;
  resultHandling?: "saveOnly" | "saveAndReturn" | "returnOnly";
  forceRescrape?: boolean;
  cleanScrape?: boolean;
  maxAge?: number;
  proxy?: "basic" | "stealth" | "auto";
  blockAds?: boolean;
  headers?: Record<string, string>;
  waitFor?: number;
  includeTags?: string[];
  excludeTags?: string[];
  formats?: string[];
  onlyMainContent?: boolean;
  actions?: BrowserAction[];
  extract?: string;

  // Batch scrape (command=start with urls)
  urls?: string[];

  // Batch management (command=status/cancel/errors)
  jobId?: string;
}

/**
 * Saved URIs for content tiers
 */
export interface SavedUris {
  raw?: string;
  cleaned?: string;
  extracted?: string;
}

/**
 * Scrape metadata
 */
export interface ScrapeMetadata {
  rawLength?: number;
  cleanedLength?: number;
  extractedLength?: number;
  wasTruncated: boolean;
}

/**
 * Single URL scrape response data
 */
export interface ScrapeData {
  url?: string;
  source: string;
  timestamp: string;
  cached: boolean;
  cacheAge?: number;
  content?: string;
  contentType?: string;
  screenshot?: string;
  screenshotFormat?: string;
  savedUris?: SavedUris;
  metadata?: ScrapeMetadata;
  message?: string;
}

/**
 * Batch operation response data
 */
export interface BatchData {
  jobId: string;
  status: string;
  total?: number;
  completed?: number;
  creditsUsed?: number;
  expiresAt?: string;
  urls?: number;
  message: string;
}

/**
 * Batch error details
 */
export interface BatchError {
  url: string;
  error: string;
  timestamp: string;
}

/**
 * Batch errors response data
 */
export interface BatchErrorsData {
  jobId: string;
  errors: BatchError[];
  message: string;
}

/**
 * Error details
 */
export interface ScrapeErrorDetail {
  message: string;
  code: string;
  url?: string;
  diagnostics?: Record<string, unknown>;
  validationErrors?: Array<Record<string, string>>;
}

/**
 * Unified scrape response from webhook API
 */
export interface ScrapeResponse {
  success: boolean;
  command: string;
  data?: ScrapeData | BatchData | BatchErrorsData;
  error?: ScrapeErrorDetail;
}

/**
 * Client for calling webhook service's scrape endpoint
 *
 * Handles all scraping operations (single URL, batch, status, cancel, errors)
 * by delegating to the webhook service's /api/v2/scrape endpoint.
 *
 * @example
 * ```typescript
 * const client = new WebhookScrapeClient({
 *   baseUrl: 'http://pulse_webhook:52100',
 *   apiSecret: 'your-secret-key'
 * });
 *
 * // Single URL scrape
 * const result = await client.scrape({
 *   command: 'start',
 *   url: 'https://example.com'
 * });
 *
 * // Batch scrape
 * const batch = await client.scrape({
 *   command: 'start',
 *   urls: ['https://example.com/1', 'https://example.com/2']
 * });
 *
 * // Check batch status
 * const status = await client.scrape({
 *   command: 'status',
 *   jobId: batch.data.jobId
 * });
 * ```
 */
export class WebhookScrapeClient {
  private baseUrl: string;
  private apiSecret: string;

  /**
   * Create a new webhook scrape client
   *
   * @param config - Client configuration
   */
  constructor(config: WebhookScrapeConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.apiSecret = config.apiSecret;
  }

  /**
   * Execute a scrape operation
   *
   * Supports all commands:
   * - start: Scrape single URL or batch of URLs
   * - status: Check batch job status
   * - cancel: Cancel batch job
   * - errors: Get batch job errors
   *
   * @param request - Scrape request with command and parameters
   * @returns Scrape response with data or error
   * @throws Error if HTTP request fails or scrape unsuccessful
   */
  async scrape(request: ScrapeRequest): Promise<ScrapeResponse> {
    const response = await fetch(`${this.baseUrl}/api/v2/scrape`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiSecret}`,
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Webhook scrape failed: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    const result: ScrapeResponse = await response.json();

    if (!result.success) {
      const errorMsg = result.error?.message || "Unknown error";
      throw new Error(`Scrape failed: ${errorMsg}`);
    }

    return result;
  }
}
