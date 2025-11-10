import { FirecrawlClient } from '../client.js';
import type { FirecrawlConfig, MapOptions, MapResult } from '../types.js';

/**
 * Specialized Firecrawl client for map operations
 */
export class FirecrawlMapClient {
  private readonly client: FirecrawlClient;

  constructor(config: FirecrawlConfig) {
    this.client = new FirecrawlClient(config);
  }

  async map(options: MapOptions): Promise<MapResult> {
    return this.client.map(options);
  }
}
