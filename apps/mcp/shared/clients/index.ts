// Re-export unified Firecrawl client
export {
  FirecrawlClient,
  FirecrawlSearchClient,
  FirecrawlMapClient,
  FirecrawlCrawlClient,
  FirecrawlScrapingClient,
  categorizeFirecrawlError,
} from './firecrawl/index.js';

// Re-export types (FirecrawlConfig is exported from shared/types.ts)
export type {
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
  FirecrawlError,
} from './firecrawl/index.js';
