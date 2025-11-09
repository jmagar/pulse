import type {
  FirecrawlCrawlClient,
  CrawlOptions as ClientCrawlOptions,
  StartCrawlResult,
  CrawlStatusResult,
  CancelResult,
} from '@firecrawl/client';
import type { CrawlOptions } from './schema.js';

export async function crawlPipeline(
  client: FirecrawlCrawlClient,
  options: CrawlOptions
): Promise<StartCrawlResult | CrawlStatusResult | CancelResult> {
  // Determine operation based on parameters
  if ('url' in options && options.url) {
    // Start crawl operation
    const clientOptions: ClientCrawlOptions = {
      url: options.url,
      prompt: options.prompt,
      limit: options.limit,
      maxDiscoveryDepth: options.maxDiscoveryDepth,
      crawlEntireDomain: options.crawlEntireDomain,
      allowSubdomains: options.allowSubdomains,
      allowExternalLinks: options.allowExternalLinks,
      includePaths: options.includePaths,
      excludePaths: options.excludePaths,
      ignoreQueryParameters: options.ignoreQueryParameters,
      sitemap: options.sitemap,
      delay: options.delay,
      maxConcurrency: options.maxConcurrency,
      scrapeOptions: options.scrapeOptions,
    };
    return await client.startCrawl(clientOptions);
  } else if ('jobId' in options && options.jobId) {
    // Cancel or status operation
    if (options.cancel) {
      return await client.cancelCrawl(options.jobId);
    } else {
      return await client.getCrawlStatus(options.jobId);
    }
  } else {
    throw new Error('Either url (to start crawl) or jobId (to check status/cancel) is required');
  }
}
