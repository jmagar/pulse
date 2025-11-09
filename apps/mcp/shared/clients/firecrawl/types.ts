/**
 * @fileoverview Shared types for Firecrawl client
 *
 * Consolidated type definitions for all Firecrawl operations:
 * scrape, search, map, and crawl.
 *
 * @module shared/clients/firecrawl/types
 */

import type { BrowserAction } from '../../mcp/tools/scrape/action-types.js';
import type { FirecrawlConfig as BaseFirecrawlConfig } from '../../types.js';

/**
 * Configuration for Firecrawl client (re-exported from shared/types.ts)
 */
export type FirecrawlConfig = BaseFirecrawlConfig;

// ============================================================================
// SCRAPE TYPES
// ============================================================================

/**
 * Configuration options for Firecrawl scraping operations
 */
export interface FirecrawlScrapingOptions {
  formats?: Array<
    | 'markdown'
    | 'html'
    | 'rawHtml'
    | 'links'
    | 'images'
    | 'screenshot'
    | 'summary'
    | 'branding'
    | 'changeTracking'
  >;
  parsers?: Array<{
    type: 'pdf';
    maxPages?: number;
  }>;
  onlyMainContent?: boolean;
  waitFor?: number;
  timeout?: number;
  extract?: {
    schema?: Record<string, unknown>;
    systemPrompt?: string;
    prompt?: string;
  };
  removeBase64Images?: boolean;
  maxAge?: number;
  proxy?: 'basic' | 'stealth' | 'auto';
  blockAds?: boolean;
  headers?: Record<string, string>;
  includeTags?: string[];
  excludeTags?: string[];
  actions?: BrowserAction[];
}

/**
 * Result of a Firecrawl scraping operation
 */
export interface FirecrawlScrapingResult {
  success: boolean;
  data?: {
    content: string;
    markdown: string;
    html: string;
    screenshot?: string;
    links?: string[];
    metadata: Record<string, unknown>;
  };
  error?: string;
}

// ============================================================================
// SEARCH TYPES
// ============================================================================

/**
 * Options for Firecrawl search operation
 */
export interface SearchOptions {
  query: string;
  limit?: number;
  sources?: Array<'web' | 'images' | 'news'>;
  categories?: Array<'github' | 'research' | 'pdf'>;
  country?: string;
  lang?: string;
  location?: string;
  timeout?: number;
  ignoreInvalidURLs?: boolean;
  tbs?: string;
  scrapeOptions?: {
    formats?: string[];
    onlyMainContent?: boolean;
    removeBase64Images?: boolean;
    blockAds?: boolean;
    waitFor?: number;
    parsers?: string[];
  };
}

/**
 * Result of Firecrawl search operation
 */
export interface SearchResult {
  success: boolean;
  data:
    | Array<{
        url: string;
        title?: string;
        description?: string;
        markdown?: string;
        html?: string;
        position?: number;
        category?: string;
      }>
    | {
        web?: Array<any>;
        images?: Array<any>;
        news?: Array<any>;
      };
  creditsUsed: number;
}

// ============================================================================
// MAP TYPES
// ============================================================================

/**
 * Options for Firecrawl map operation
 */
export interface MapOptions {
  url: string;
  search?: string;
  limit?: number;
  sitemap?: 'skip' | 'include' | 'only';
  includeSubdomains?: boolean;
  ignoreQueryParameters?: boolean;
  timeout?: number;
  location?: {
    country?: string;
    languages?: string[];
  };
}

/**
 * Result of Firecrawl map operation
 */
export interface MapResult {
  success: boolean;
  links: Array<{
    url: string;
    title?: string;
    description?: string;
  }>;
}

// ============================================================================
// CRAWL TYPES
// ============================================================================

/**
 * Options for Firecrawl crawl operation
 *
 * Note: v2 API renamed maxDepth to maxDiscoveryDepth, removed changeDetection
 */
export interface CrawlOptions {
  url: string;
  prompt?: string;
  limit?: number;
  maxDiscoveryDepth?: number;
  crawlEntireDomain?: boolean;
  allowSubdomains?: boolean;
  allowExternalLinks?: boolean;
  includePaths?: string[];
  excludePaths?: string[];
  ignoreQueryParameters?: boolean;
  sitemap?: 'include' | 'skip';
  delay?: number;
  maxConcurrency?: number;
  scrapeOptions?: FirecrawlScrapingOptions;
}

/**
 * Result of starting a crawl job
 */
export interface StartCrawlResult {
  success: boolean;
  id?: string;
  url?: string;
  error?: string;
}

/**
 * Result of checking crawl status
 */
export interface CrawlStatusResult {
  status: 'scraping' | 'completed' | 'failed' | 'cancelled';
  total: number;
  completed: number;
  creditsUsed: number;
  expiresAt: string;
  next?: string;
  data: Array<{
    markdown?: string;
    html?: string;
    rawHtml?: string;
    links?: string[];
    screenshot?: string;
    metadata?: {
      title?: string;
      description?: string;
      language?: string;
      sourceURL?: string;
      statusCode?: number;
      [key: string]: any;
    };
  }>;
}

/**
 * Result of cancelling a crawl job
 */
export interface CancelResult {
  status: 'cancelled';
}
