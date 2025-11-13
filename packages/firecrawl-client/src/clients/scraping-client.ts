import { FirecrawlClient } from '../client.js';
import type {
  FirecrawlConfig,
  FirecrawlScrapingOptions,
  FirecrawlScrapingResult,
  BatchScrapeOptions,
  BatchScrapeStartResult,
  BatchScrapeCancelResult,
  CrawlStatusResult,
  CrawlErrorsResult,
} from '../types.js';

/**
 * Specialized Firecrawl client for scraping operations
 */
export class FirecrawlScrapingClient {
  private readonly client: FirecrawlClient;

  constructor(config: FirecrawlConfig) {
    this.client = new FirecrawlClient(config);
  }

  async scrape(
    url: string,
    options: FirecrawlScrapingOptions = {}
  ): Promise<FirecrawlScrapingResult> {
    return this.client.scrape(url, options);
  }

  async batchScrape(options: BatchScrapeOptions): Promise<BatchScrapeStartResult> {
    return this.client.startBatchScrape(options);
  }

  async getBatchScrapeStatus(jobId: string): Promise<CrawlStatusResult> {
    return this.client.getBatchScrapeStatus(jobId);
  }

  async cancelBatchScrape(jobId: string): Promise<BatchScrapeCancelResult> {
    return this.client.cancelBatchScrape(jobId);
  }

  async getBatchScrapeErrors(jobId: string): Promise<CrawlErrorsResult> {
    return this.client.getBatchScrapeErrors(jobId);
  }
}
