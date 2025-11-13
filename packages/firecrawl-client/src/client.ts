/**
 * @fileoverview Unified Firecrawl client
 *
 * Provides a single client class for all Firecrawl operations:
 * scrape, search, map, and crawl.
 *
 * @module shared/clients/firecrawl/client
 */

import type {
  FirecrawlConfig,
  FirecrawlScrapingOptions,
  FirecrawlScrapingResult,
  SearchOptions,
  SearchResult,
  MapOptions,
  MapResult,
  CrawlOptions,
  StartCrawlResult,
  CrawlStatusResult,
  CancelResult,
  CrawlErrorsResult,
  ActiveCrawlsResult,
  BatchScrapeOptions,
  BatchScrapeStartResult,
  BatchScrapeCancelResult,
} from './types.js';

import { scrape as scrapeOp } from './operations/scrape.js';
import { search as searchOp } from './operations/search.js';
import { map as mapOp } from './operations/map.js';
import {
  startCrawl as startCrawlOp,
  getCrawlStatus as getCrawlStatusOp,
  cancelCrawl as cancelCrawlOp,
  getCrawlErrors as getCrawlErrorsOp,
  getActiveCrawls as getActiveCrawlsOp,
} from './operations/crawl.js';
import {
  startBatchScrape as startBatchScrapeOp,
  getBatchScrapeStatus as getBatchScrapeStatusOp,
  cancelBatchScrape as cancelBatchScrapeOp,
  getBatchScrapeErrors as getBatchScrapeErrorsOp,
} from './operations/batch-scrape.js';

/**
 * Unified Firecrawl client for all operations
 *
 * Provides a single interface for scraping, searching, mapping,
 * and crawling using the Firecrawl API.
 *
 * @example
 * ```typescript
 * const client = new FirecrawlClient({ apiKey: process.env.FIRECRAWL_API_KEY });
 *
 * // Scrape a single page
 * const scrapeResult = await client.scrape('https://example.com');
 *
 * // Search for content
 * const searchResult = await client.search({ query: 'test' });
 *
 * // Map website structure
 * const mapResult = await client.map({ url: 'https://example.com' });
 *
 * // Start a crawl
 * const crawlResult = await client.startCrawl({ url: 'https://example.com' });
 * ```
 */
export class FirecrawlClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(config: FirecrawlConfig) {
    if (!config.apiKey || config.apiKey.trim() === '') {
      throw new Error('API key is required');
    }
    this.apiKey = config.apiKey;
    const base = config.baseUrl || 'https://api.firecrawl.dev';
    this.baseUrl = `${base}/v2`;
  }

  /**
   * Scrape a single webpage
   *
   * @param url - URL to scrape
   * @param options - Scraping options
   * @returns Scraping result with content and metadata
   */
  async scrape(
    url: string,
    options: FirecrawlScrapingOptions = {}
  ): Promise<FirecrawlScrapingResult> {
    return scrapeOp(this.apiKey, this.baseUrl, url, options);
  }

  /**
   * Search for content using Firecrawl
   *
   * @param options - Search options
   * @returns Search results
   */
  async search(options: SearchOptions): Promise<SearchResult> {
    return searchOp(this.apiKey, this.baseUrl, options);
  }

  /**
   * Map website structure to discover URLs
   *
   * @param options - Map options
   * @returns Discovered URLs with metadata
   */
  async map(options: MapOptions): Promise<MapResult> {
    return mapOp(this.apiKey, this.baseUrl, options);
  }

  /**
   * Start a multi-page crawl job
   *
   * @param options - Crawl options
   * @returns Crawl job information
   */
  async startCrawl(options: CrawlOptions): Promise<StartCrawlResult> {
    return startCrawlOp(this.apiKey, this.baseUrl, options);
  }

  /**
   * Get status of a crawl job
   *
   * @param jobId - Crawl job ID
   * @returns Crawl status and results
   */
  async getCrawlStatus(jobId: string): Promise<CrawlStatusResult> {
    return getCrawlStatusOp(this.apiKey, this.baseUrl, jobId);
  }

  /**
   * Cancel a running crawl job
   *
   * @param jobId - Crawl job ID
   * @returns Cancellation confirmation
   */
  async cancelCrawl(jobId: string): Promise<CancelResult> {
    return cancelCrawlOp(this.apiKey, this.baseUrl, jobId);
  }

  /**
   * Retrieve error information for a crawl job
   */
  async getCrawlErrors(jobId: string): Promise<CrawlErrorsResult> {
    return getCrawlErrorsOp(this.apiKey, this.baseUrl, jobId);
  }

  /**
   * List currently active crawl jobs
   */
  async listActiveCrawls(): Promise<ActiveCrawlsResult> {
    return getActiveCrawlsOp(this.apiKey, this.baseUrl);
  }

  /**
   * Start a batch scrape job
   */
  async startBatchScrape(options: BatchScrapeOptions): Promise<BatchScrapeStartResult> {
    return startBatchScrapeOp(this.apiKey, this.baseUrl, options);
  }

  /**
   * Get status for a batch scrape job
   */
  async getBatchScrapeStatus(jobId: string): Promise<CrawlStatusResult> {
    return getBatchScrapeStatusOp(this.apiKey, this.baseUrl, jobId);
  }

  /**
   * Cancel a batch scrape job
   */
  async cancelBatchScrape(jobId: string): Promise<BatchScrapeCancelResult> {
    return cancelBatchScrapeOp(this.apiKey, this.baseUrl, jobId);
  }

  /**
   * Retrieve batch scrape errors
   */
  async getBatchScrapeErrors(jobId: string): Promise<CrawlErrorsResult> {
    return getBatchScrapeErrorsOp(this.apiKey, this.baseUrl, jobId);
  }
}
