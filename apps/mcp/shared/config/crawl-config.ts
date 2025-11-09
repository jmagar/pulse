/**
 * @fileoverview Crawl configuration and URL filtering
 *
 * Provides configuration for background crawl operations including
 * language path exclusions and discovery depth limits.
 *
 * @module shared/config/crawl-config
 */

const DEFAULT_MAX_DISCOVERY_DEPTH = 5;

const UNIVERSAL_LANGUAGE_EXCLUDES = [
  '^/de/',
  '^/es/',
  '^/fr/',
  '^/it/',
  '^/pt/',
  '^/pt-BR/',
  '^/ja/',
  '^/ko/',
  '^/zh/',
  '^/zh-CN/',
  '^/zh-TW/',
  '^/ru/',
  '^/id/',
];

const DOMAIN_LANGUAGE_EXCLUDES: Record<string, string[]> = {
  'docs.firecrawl.dev': ['^/es/', '^/fr/', '^/ja/', '^/pt-BR/', '^/zh/'],
  'docs.claude.com': [
    '^/de/',
    '^/es/',
    '^/fr/',
    '^/id/',
    '^/it/',
    '^/ja/',
    '^/ko/',
    '^/pt/',
    '^/ru/',
    '^/zh-CN/',
    '^/zh-TW/',
  ],
  'docs.unraid.net': ['^/de/', '^/es/', '^/fr/', '^/zh/'],
};

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
 * Generates crawl configuration with appropriate language path exclusions
 * based on the domain. Returns null if URL is invalid.
 *
 * @param targetUrl - URL to generate crawl config for
 * @returns Crawl configuration or null if URL is invalid
 */
export function buildCrawlRequestConfig(targetUrl: string): CrawlRequestConfig | null {
  try {
    const parsed = new URL(targetUrl);
    const baseUrl = `${parsed.protocol}//${parsed.host}`;
    const hostname = parsed.host.toLowerCase();

    const excludePaths = DOMAIN_LANGUAGE_EXCLUDES[hostname] ?? UNIVERSAL_LANGUAGE_EXCLUDES;

    return {
      url: baseUrl,
      excludePaths,
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
