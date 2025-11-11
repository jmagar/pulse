/**
 * @fileoverview Native scraping client implementation
 *
 * Provides basic HTTP fetching without external services using Node.js
 * native fetch API. Includes automatic content type detection and parsing
 * for HTML, PDF, and other document formats.
 *
 * @module shared/scraping/clients/native
 */

import { ContentParserFactory } from "../../../processing/parsing/index.js";

/**
 * Interface for native HTTP scraping client
 *
 * Defines the contract for basic HTTP scraping operations using
 * native fetch without external service dependencies.
 */
export interface INativeScrapingClient {
  scrape(
    url: string,
    options?: NativeScrapingOptions,
  ): Promise<NativeScrapingResult>;
}

/**
 * Configuration options for native scraping operations
 *
 * Controls HTTP request parameters including timeout, headers, method,
 * and body content for POST requests.
 */
export interface NativeScrapingOptions {
  timeout?: number;
  headers?: Record<string, string>;
  method?: "GET" | "POST";
  body?: string;
}

/**
 * Result of a native scraping operation
 *
 * Contains the scraped content, HTTP response metadata, and parsed content.
 * Includes status code, headers, and content type information for debugging.
 */
export interface NativeScrapingResult {
  success: boolean;
  data?: string;
  error?: string;
  statusCode?: number;
  headers?: Record<string, string>;
  contentType?: string;
  contentLength?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Native HTTP scraping client implementation
 *
 * Performs basic HTTP scraping using Node.js native fetch API with automatic
 * content type detection and parsing. Supports HTML, PDF, and other document
 * formats through pluggable parsers. Fastest scraping option but doesn't
 * handle JavaScript rendering or anti-bot measures.
 *
 * @example
 * ```typescript
 * const client = new NativeScrapingClient();
 * const result = await client.scrape('https://example.com', {
 *   timeout: 30000,
 *   headers: { 'Accept-Language': 'en-US' }
 * });
 * if (result.success) {
 *   console.log(result.data);
 * }
 * ```
 */
export class NativeScrapingClient implements INativeScrapingClient {
  private defaultHeaders: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (compatible; PulseMCP/1.0; +https://pulsemcp.com)",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    "Accept-Encoding": "gzip, deflate",
    "Cache-Control": "no-cache",
  };

  private parserFactory = new ContentParserFactory();

  async scrape(
    url: string,
    options: NativeScrapingOptions = {},
  ): Promise<NativeScrapingResult> {
    try {
      const controller = new AbortController();
      const timeoutId = options.timeout
        ? setTimeout(() => controller.abort(), options.timeout)
        : null;

      const response = await fetch(url, {
        method: options.method || "GET",
        headers: {
          ...this.defaultHeaders,
          ...options.headers,
        },
        body: options.body,
        signal: controller.signal,
      });

      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
          statusCode: response.status,
          headers: responseHeaders,
        };
      }

      // Get content type for routing to appropriate parser
      const contentType = response.headers.get("content-type") || "text/plain";

      // Determine if we need binary handling
      const isBinary = this.parserFactory.requiresBinaryHandling(contentType);

      // Fetch content as ArrayBuffer or text based on content type
      const rawData = isBinary
        ? await response.arrayBuffer()
        : await response.text();

      // Parse content through appropriate parser
      const parsed = await this.parserFactory.parse(rawData, contentType);

      return {
        success: true,
        data: parsed.content,
        statusCode: response.status,
        headers: responseHeaders,
        contentType,
        contentLength:
          rawData instanceof ArrayBuffer ? rawData.byteLength : rawData.length,
        metadata: parsed.metadata,
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return {
          success: false,
          error: "Request timeout",
        };
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}
