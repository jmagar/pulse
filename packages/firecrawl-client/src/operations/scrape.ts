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
 * Scrape a webpage using Firecrawl API
 *
 * @param apiKey - Firecrawl API key
 * @param baseUrl - Base URL for Firecrawl API
 * @param url - URL to scrape
 * @param options - Scraping options
 * @returns Scraping result with content and metadata
 */
export async function scrape(
  apiKey: string,
  baseUrl: string,
  url: string,
  options: FirecrawlScrapingOptions = {}
): Promise<FirecrawlScrapingResult> {
  try {
    // Build headers - skip Authorization for self-hosted deployments without auth
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Only add Authorization header if API key is not a self-hosted placeholder
    if (apiKey && apiKey !== 'self-hosted-no-auth') {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const response = await fetch(`${baseUrl}/scrape`, {
      method: 'POST',
      headers,
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
