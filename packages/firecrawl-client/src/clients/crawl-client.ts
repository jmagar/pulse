import { FirecrawlClient } from '../client.js';
import type {
  FirecrawlConfig,
  CrawlOptions,
  StartCrawlResult,
  CrawlStatusResult,
  CancelResult,
  CrawlErrorsResult,
  ActiveCrawlsResult,
} from '../types.js';

/**
 * Specialized Firecrawl client for crawl operations
 */
export class FirecrawlCrawlClient {
  private readonly client: FirecrawlClient;

  constructor(config: FirecrawlConfig) {
    this.client = new FirecrawlClient(config);
  }

  async startCrawl(options: CrawlOptions): Promise<StartCrawlResult> {
    return this.client.startCrawl(options);
  }

  async getCrawlStatus(jobId: string): Promise<CrawlStatusResult> {
    return this.client.getCrawlStatus(jobId);
  }

  async cancelCrawl(jobId: string): Promise<CancelResult> {
    return this.client.cancelCrawl(jobId);
  }

  async getCrawlErrors(jobId: string): Promise<CrawlErrorsResult> {
    return this.client.getCrawlErrors(jobId);
  }

  async listActiveCrawls(): Promise<ActiveCrawlsResult> {
    return this.client.listActiveCrawls();
  }
}
