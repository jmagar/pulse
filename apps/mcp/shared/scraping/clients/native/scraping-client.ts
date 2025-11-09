/**
 * Main scraping client exports
 * Re-exports all scraping client interfaces and implementations
 */

// Native scraping client
export type {
  INativeScrapingClient,
  NativeScrapingOptions,
  NativeScrapingResult,
} from './native-scrape-client.js';
export { NativeScrapingClient } from './native-scrape-client.js';

// Firecrawl scraping client (unified location)
export type {
  FirecrawlScrapingOptions,
  FirecrawlScrapingResult,
} from '../../../clients/firecrawl/index.js';
export { FirecrawlScrapingClient } from '../../../clients/firecrawl/index.js';
