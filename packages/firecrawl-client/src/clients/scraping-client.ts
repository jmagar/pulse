import { FirecrawlClient } from '../client.js';
import type {
  FirecrawlConfig,
  FirecrawlScrapingOptions,
  FirecrawlScrapingResult,
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
}
