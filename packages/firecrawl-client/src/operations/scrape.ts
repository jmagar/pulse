/**
 * @fileoverview Firecrawl scrape operation
 *
 * Provides enhanced content extraction using the Firecrawl API with
 * JavaScript rendering, anti-bot bypass, and intelligent content extraction.
 *
 * @module shared/clients/firecrawl/operations/scrape
 */

import type { FirecrawlScrapingOptions, FirecrawlScrapingResult } from '../types.js';

/**
 * Validate and cache the base URL at module load time
 */
const getBaseUrl = (): string => {
  const baseUrl = process.env.FIRECRAWL_BASE_URL || 'https://api.firecrawl.dev';

  // Validate baseUrl to prevent injection attacks
  if (baseUrl && (!/^https?:\/\/[^\\]+$/.test(baseUrl) || baseUrl.includes('..'))) {
    throw new Error('Invalid FIRECRAWL_BASE_URL');
  }

  return baseUrl;
};

const FIRECRAWL_BASE_URL = getBaseUrl();

/**
 * Scrape a webpage using Firecrawl API
 *
 * @param apiKey - Firecrawl API key
 * @param url - URL to scrape
 * @param options - Scraping options
 * @returns Scraping result with content and metadata
 */
export async function scrape(
  apiKey: string,
  url: string,
  options: FirecrawlScrapingOptions = {}
): Promise<FirecrawlScrapingResult> {
  try {
    const response = await fetch(`${FIRECRAWL_BASE_URL}/v1/scrape`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        url,
        formats: options.formats || ['markdown', 'html'],
        ...options,
      }),
    });

    if (!response.ok) {
      let errorDetail = '';
      try {
        const errorJson: any = await response.json();
        errorDetail = errorJson.error || errorJson.message || '';
      } catch {
        errorDetail = await response.text();
      }
      return {
        success: false,
        error: `Firecrawl API error: ${response.status} ${response.statusText}${errorDetail ? ` - ${errorDetail}` : ''}`,
      };
    }

    const result: any = await response.json();

    if (!result.success) {
      return {
        success: false,
        error: result.error || 'Firecrawl scraping failed',
      };
    }

    return {
      success: true,
      data: {
        content: result.data?.content || '',
        markdown: result.data?.markdown || '',
        html: result.data?.html || '',
        screenshot: result.data?.screenshot,
        links: result.data?.links,
        metadata: result.data?.metadata || {},
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown Firecrawl error',
    };
  }
}
