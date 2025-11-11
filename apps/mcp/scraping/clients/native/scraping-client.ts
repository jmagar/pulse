/**
 * Main scraping client exports
 * Re-exports all scraping client interfaces and implementations
 */

// Native scraping client
export type {
  INativeScrapingClient,
  NativeScrapingOptions,
  NativeScrapingResult,
} from "./native-scrape-client.js";
export { NativeScrapingClient } from "./native-scrape-client.js";

// Firecrawl scraping client (unified location)
export type {
  FirecrawlScrapingOptions,
  FirecrawlScrapingResult,
} from "@firecrawl/client";
export { FirecrawlScrapingClient } from "@firecrawl/client";
