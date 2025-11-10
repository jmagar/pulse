import { FirecrawlClient } from '../client.js';
import type { FirecrawlConfig, SearchOptions, SearchResult } from '../types.js';

/**
 * Specialized Firecrawl client for search operations
 */
export class FirecrawlSearchClient {
  private readonly client: FirecrawlClient;

  constructor(config: FirecrawlConfig) {
    this.client = new FirecrawlClient(config);
  }

  async search(options: SearchOptions): Promise<SearchResult> {
    return this.client.search(options);
  }
}
