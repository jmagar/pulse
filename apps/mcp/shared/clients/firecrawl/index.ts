/**
 * @fileoverview Unified Firecrawl client exports
 *
 * Single entry point for all Firecrawl functionality:
 * client class, types, and error handling.
 *
 * @module shared/clients/firecrawl
 */

// Main client
export { FirecrawlClient } from './client.js';

// Types (FirecrawlConfig is exported from shared/types.ts, not here)
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
} from './types.js';

// Error handling
export { categorizeFirecrawlError } from './errors.js';
export type { FirecrawlError } from './errors.js';

// Legacy compatibility - individual client classes (all point to same unified client)
export { FirecrawlClient as FirecrawlScrapingClient } from './client.js';
export { FirecrawlClient as FirecrawlSearchClient } from './client.js';
export { FirecrawlClient as FirecrawlMapClient } from './client.js';
export { FirecrawlClient as FirecrawlCrawlClient } from './client.js';
