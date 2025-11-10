/**
 * @fileoverview Crawl configuration and URL filtering
 *
 * Provides configuration for crawl operations including default
 * language path exclusions and discovery depth limits.
 *
 * @module shared/config/crawl-config
 */

const DEFAULT_MAX_DISCOVERY_DEPTH = 5;

export const DEFAULT_LANGUAGE_EXCLUDES = [
  // European languages
  '^/de/', // German
  '^/es/', // Spanish
  '^/fr/', // French
  '^/it/', // Italian
  '^/pt/', // Portuguese
  '^/nl/', // Dutch
  '^/pl/', // Polish
  '^/sv/', // Swedish
  '^/no/', // Norwegian
  '^/nb/', // Norwegian Bokmål
  '^/da/', // Danish
  '^/fi/', // Finnish
  '^/cs/', // Czech
  '^/ru/', // Russian
  '^/uk/', // Ukrainian
  '^/tr/', // Turkish

  // Middle Eastern languages
  '^/ar/', // Arabic
  '^/he/', // Hebrew

  // Asian languages
  '^/ja/', // Japanese
  '^/ko/', // Korean
  '^/zh/', // Chinese
  '^/zh-CN/', // Simplified Chinese
  '^/zh-TW/', // Traditional Chinese
  '^/id/', // Indonesian
  '^/vi/', // Vietnamese
  '^/th/', // Thai
  '^/hi/', // Hindi

  // Regional variants
  '^/pt-BR/', // Brazilian Portuguese
  '^/es-MX/', // Mexican Spanish
  '^/fr-CA/', // Canadian French
  '^/en-GB/', // British English
  '^/en-UK/', // British English (alternative)
  '^/en-AU/', // Australian English
];

/**
 * Configuration for Firecrawl crawl request
 *
 * Defines crawl parameters including base URL, path exclusions, and discovery depth.
 *
 * Note: v2 API renamed maxDepth to maxDiscoveryDepth, removed changeDetection
 */
export interface CrawlRequestConfig {
  url: string;
  excludePaths: string[];
  maxDiscoveryDepth: number;
}

/**
 * Build crawl configuration for a target URL
 *
 * Generates crawl configuration with default language path exclusions.
 * Returns null if URL is invalid.
 *
 * @param targetUrl - URL to generate crawl config for
 * @returns Crawl configuration or null if URL is invalid
 */
export function buildCrawlRequestConfig(targetUrl: string): CrawlRequestConfig | null {
  try {
    const parsed = new URL(targetUrl);
    const baseUrl = `${parsed.protocol}//${parsed.host}`;

    return {
      url: baseUrl,
      excludePaths: DEFAULT_LANGUAGE_EXCLUDES,
      maxDiscoveryDepth: DEFAULT_MAX_DISCOVERY_DEPTH,
    };
  } catch {
    return null;
  }
}

/**
 * Check if URL is suitable for crawling
 *
 * Validates that URL uses HTTP or HTTPS protocol.
 *
 * @param targetUrl - URL to validate
 * @returns True if URL is crawlable, false otherwise
 */
export function shouldStartCrawl(targetUrl: string): boolean {
  try {
    const parsed = new URL(targetUrl);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
