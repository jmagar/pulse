/**
 * @fileoverview Helper functions for scraping operations
 *
 * Provides utility functions for content type detection and background
 * crawl initiation.
 *
 * @module shared/mcp/tools/scrape/helpers
 */

/**
 * Detect content type from content analysis
 *
 * Analyzes content string to determine MIME type by checking for HTML,
 * JSON, XML, or plain text patterns.
 *
 * @param content - Content string to analyze
 * @returns Detected MIME type
 */
export function detectContentType(content: string): string {
  // Check if content is HTML
  const htmlRegex =
    /<(!DOCTYPE\s+)?html[^>]*>|<head[^>]*>|<body[^>]*>|<div[^>]*>|<p[^>]*>|<h[1-6][^>]*>/i;
  if (htmlRegex.test(content.substring(0, 1000))) {
    return "text/html";
  }

  // Check if content is JSON
  try {
    JSON.parse(content);
    return "application/json";
  } catch {
    // Not JSON
  }

  // Check if content is XML
  const xmlRegex = /^\s*<\?xml[^>]*\?>|^\s*<[^>]+>/;
  if (xmlRegex.test(content)) {
    return "application/xml";
  }

  // Default to plain text
  return "text/plain";
}

/**
 * Initiate background crawl of base URL
 *
 * Starts an asynchronous Firecrawl crawl operation for the base URL
 * to discover and cache related pages. Fails silently if Firecrawl is
 * not available or crawl conditions aren't met.
 *
 * @param url - URL to extract base from and crawl
 * @param clients - Scraping clients with optional Firecrawl support
 */
