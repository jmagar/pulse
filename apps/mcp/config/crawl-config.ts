/**
 * @fileoverview Crawl configuration and URL filtering
 *
 * Provides configuration for crawl operations including default
 * language path exclusions and discovery depth limits.
 *
 * @module shared/config/crawl-config
 */

import type { FirecrawlScrapingOptions } from "@firecrawl/client";

export const DEFAULT_LANGUAGE_EXCLUDES = [
  // European languages
  "^/de/", // German
  "^/es/", // Spanish
  "^/fr/", // French
  "^/it/", // Italian
  "^/pt/", // Portuguese
  "^/nl/", // Dutch
  "^/pl/", // Polish
  "^/sv/", // Swedish
  "^/no/", // Norwegian
  "^/nb/", // Norwegian Bokmål
  "^/da/", // Danish
  "^/fi/", // Finnish
  "^/cs/", // Czech
  "^/ru/", // Russian
  "^/uk/", // Ukrainian
  "^/tr/", // Turkish

  // Middle Eastern languages
  "^/ar/", // Arabic
  "^/he/", // Hebrew

  // Asian languages
  "^/ja/", // Japanese
  "^/ko/", // Korean
  "^/zh/", // Chinese
  "^/zh-CN/", // Simplified Chinese
  "^/zh-TW/", // Traditional Chinese
  "^/id/", // Indonesian
  "^/vi/", // Vietnamese
  "^/th/", // Thai
  "^/hi/", // Hindi

  // Regional variants
  "^/pt-BR/", // Brazilian Portuguese
  "^/es-MX/", // Mexican Spanish
  "^/fr-CA/", // Canadian French
  "^/en-GB/", // British English
  "^/en-UK/", // British English (alternative)
  "^/en-AU/", // Australian English
];

/**
 * Merge custom exclude patterns with the default language exclusions.
 *
 * Ensures defaults are always present and preserves insertion order without duplicates.
 */
export function mergeExcludePaths(customPaths?: string[]): string[] {
  const merged: string[] = [];
  const seen = new Set<string>();

  for (const pattern of DEFAULT_LANGUAGE_EXCLUDES) {
    if (!seen.has(pattern)) {
      merged.push(pattern);
      seen.add(pattern);
    }
  }

  for (const pattern of customPaths ?? []) {
    if (!pattern) continue;
    if (!seen.has(pattern)) {
      merged.push(pattern);
      seen.add(pattern);
    }
  }

  return merged;
}

export const DEFAULT_SCRAPE_OPTIONS: FirecrawlScrapingOptions = {
  formats: ["markdown", "html", "summary", "changeTracking", "links"],
  onlyMainContent: true,
  blockAds: true,
  removeBase64Images: true,
  parsers: [],
};

export function mergeScrapeOptions(
  customOptions?: FirecrawlScrapingOptions,
): FirecrawlScrapingOptions {
  return {
    ...DEFAULT_SCRAPE_OPTIONS,
    ...customOptions,
    formats: customOptions?.formats ?? DEFAULT_SCRAPE_OPTIONS.formats,
    parsers: customOptions?.parsers ?? [],
  };
}
