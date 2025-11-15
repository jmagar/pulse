/**
 * @fileoverview MCP server factory and client interfaces
 *
 * This module provides the main factory function for creating configured
 * MCP servers with all tools and resources registered. It also defines
 * interfaces for scraping clients and provides default implementations.
 *
 * @module shared/server
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { registerResources, registerTools } from "./tools/registration.js";
import { env } from "./config/environment.js";
import type { IStrategyConfigClient } from "./scraping/strategies/learned/index.js";
import { FilesystemStrategyConfigClient } from "./scraping/strategies/learned/index.js";
import { NativeScrapingClient } from "./scraping/clients/native/native-scrape-client.js";
import type {
  FirecrawlConfig,
  BatchScrapeOptions,
  BatchScrapeStartResult,
  CrawlStatusResult,
  BatchScrapeCancelResult,
  CrawlErrorsResult,
  CrawlOptions as FirecrawlCrawlOptions,
  StartCrawlResult,
  CancelResult,
  ActiveCrawlsResult,
  MapOptions as FirecrawlMapOptions,
  MapResult,
  SearchOptions as FirecrawlSearchOptions,
  SearchResult,
} from "@firecrawl/client";

/**
 * Interface for Firecrawl API client
 *
 * Defines the contract for interacting with Firecrawl's API for
 * advanced web scraping with JavaScript rendering and anti-bot bypass.
 */
export interface IFirecrawlClient {
  scrape(
    url: string,
    options?: Record<string, unknown>,
  ): Promise<{
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
  }>;

  batchScrape?: (
    options: BatchScrapeOptions,
  ) => Promise<BatchScrapeStartResult>;

  getBatchScrapeStatus?: (jobId: string) => Promise<CrawlStatusResult>;

  cancelBatchScrape?: (
    jobId: string,
  ) => Promise<BatchScrapeCancelResult>;

  getBatchScrapeErrors?: (
    jobId: string,
  ) => Promise<CrawlErrorsResult>;

  // Crawl operations
  startCrawl?: (options: FirecrawlCrawlOptions) => Promise<StartCrawlResult>;
  getCrawlStatus?: (jobId: string) => Promise<CrawlStatusResult>;
  cancelCrawl?: (jobId: string) => Promise<CancelResult>;
  getCrawlErrors?: (jobId: string) => Promise<CrawlErrorsResult>;
  listActiveCrawls?: () => Promise<ActiveCrawlsResult>;

  // Map and search operations
  map?: (options: FirecrawlMapOptions) => Promise<MapResult>;
  search?: (options: FirecrawlSearchOptions) => Promise<SearchResult>;

  // Extract operation
  extract?: (options: {
    urls: string[];
    prompt?: string;
    schema?: Record<string, unknown>;
    scrapeOptions?: Record<string, unknown>;
    timeout?: number;
  }) => Promise<{
    success: boolean;
    data?: Array<Record<string, unknown>>;
    error?: string;
  }>;
}

/**
 * Interface for native HTTP fetcher
 *
 * Defines the contract for basic HTTP scraping using native fetch API.
 * Provides a simple, fast scraping method for public websites.
 */
export interface INativeFetcher {
  scrape(
    url: string,
    options?: { timeout?: number } & RequestInit,
  ): Promise<{
    success: boolean;
    status?: number;
    data?: string;
    error?: string;
  }>;
}

/**
 * Default implementation of native HTTP fetcher
 *
 * Uses the enhanced NativeScrapingClient to perform basic HTTP scraping
 * operations. This is the fastest scraping method and works for most
 * public websites without JavaScript rendering requirements.
 *
 * @example
 * ```typescript
 * const fetcher = new NativeFetcher();
 * const result = await fetcher.scrape('https://example.com', {
 *   timeout: 30000
 * });
 * ```
 */
export class NativeFetcher implements INativeFetcher {
  private client = new NativeScrapingClient();

  async scrape(
    url: string,
    options?: { timeout?: number } & RequestInit,
  ): Promise<{
    success: boolean;
    status?: number;
    data?: string;
    error?: string;
  }> {
    const result = await this.client.scrape(url, {
      timeout: options?.timeout,
      headers: options?.headers as Record<string, string>,
      method: options?.method as "GET" | "POST",
      body: options?.body as string,
    });

    return {
      success: result.success,
      status: result.statusCode,
      data: result.data,
      error: result.error,
    };
  }
}

/**
 * Webhook Bridge Firecrawl client implementation
 *
 * Routes all Firecrawl operations through the webhook bridge proxy at
 * http://pulse_webhook:52100/v2/*. This consolidates Firecrawl integration
 * in one place, enables automatic session tracking, and eliminates code
 * duplication between MCP and webhook services.
 *
 * @example
 * ```typescript
 * const client = new WebhookBridgeClient('http://pulse_webhook:52100');
 * const result = await client.scrape('https://example.com', {
 *   formats: ['markdown', 'html']
 * });
 * ```
 */
export class WebhookBridgeClient implements IFirecrawlClient {
  private baseUrl: string;

  constructor(baseUrl: string = "http://pulse_webhook:52100") {
    this.baseUrl = baseUrl.replace(/\/$/, ""); // Remove trailing slash
  }

  async scrape(
    url: string,
    options?: Record<string, unknown>,
  ): Promise<{
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
  }> {
    const response = await fetch(`${this.baseUrl}/v2/scrape`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, ...options }),
    });

    const result = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: result.error || `HTTP ${response.status}`,
      };
    }

    return {
      success: result.success !== false,
      data: result.data
        ? {
            content: result.data.markdown || result.data.html || "",
            markdown: result.data.markdown || "",
            html: result.data.html || "",
            screenshot: result.data.screenshot,
            links: result.data.links,
            metadata: result.data.metadata || {},
          }
        : undefined,
      error: result.error,
    };
  }

  async batchScrape(
    options: BatchScrapeOptions,
  ): Promise<BatchScrapeStartResult> {
    const response = await fetch(`${this.baseUrl}/v2/batch/scrape`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(options),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Batch scrape failed: ${error}`);
    }

    return response.json();
  }

  async getBatchScrapeStatus(jobId: string): Promise<CrawlStatusResult> {
    const response = await fetch(`${this.baseUrl}/v2/batch/scrape/${jobId}`, {
      method: "GET",
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Get batch scrape status failed: ${error}`);
    }

    return response.json();
  }

  async cancelBatchScrape(
    jobId: string,
  ): Promise<BatchScrapeCancelResult> {
    const response = await fetch(`${this.baseUrl}/v2/batch/scrape/${jobId}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Cancel batch scrape failed: ${error}`);
    }

    return response.json();
  }

  async getBatchScrapeErrors(jobId: string): Promise<CrawlErrorsResult> {
    const response = await fetch(
      `${this.baseUrl}/v2/batch/scrape/${jobId}/errors`,
      {
        method: "GET",
      },
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Get batch scrape errors failed: ${error}`);
    }

    return response.json();
  }

  async startCrawl(options: FirecrawlCrawlOptions): Promise<StartCrawlResult> {
    const response = await fetch(`${this.baseUrl}/v2/crawl`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(options),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Start crawl failed: ${error}`);
    }

    return response.json();
  }

  async getCrawlStatus(jobId: string): Promise<CrawlStatusResult> {
    const response = await fetch(`${this.baseUrl}/v2/crawl/${jobId}`, {
      method: "GET",
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Get crawl status failed: ${error}`);
    }

    return response.json();
  }

  async cancelCrawl(jobId: string): Promise<CancelResult> {
    const response = await fetch(`${this.baseUrl}/v2/crawl/${jobId}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Cancel crawl failed: ${error}`);
    }

    return response.json();
  }

  async getCrawlErrors(jobId: string): Promise<CrawlErrorsResult> {
    const response = await fetch(`${this.baseUrl}/v2/crawl/${jobId}/errors`, {
      method: "GET",
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Get crawl errors failed: ${error}`);
    }

    return response.json();
  }

  async listActiveCrawls(): Promise<ActiveCrawlsResult> {
    const response = await fetch(`${this.baseUrl}/v2/crawl/active`, {
      method: "GET",
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`List active crawls failed: ${error}`);
    }

    return response.json();
  }

  async map(options: FirecrawlMapOptions): Promise<MapResult> {
    const response = await fetch(`${this.baseUrl}/v2/map`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(options),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Map request failed: ${error}`);
    }

    return response.json();
  }

  async search(options: FirecrawlSearchOptions): Promise<SearchResult> {
    const response = await fetch(`${this.baseUrl}/v2/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(options),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Search request failed: ${error}`);
    }

    return response.json();
  }

  async extract(options: {
    urls: string[];
    prompt?: string;
    schema?: Record<string, unknown>;
    scrapeOptions?: Record<string, unknown>;
    timeout?: number;
  }): Promise<{
    success: boolean;
    data?: Array<Record<string, unknown>>;
    error?: string;
  }> {
    const response = await fetch(`${this.baseUrl}/v2/extract`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(options),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Extract request failed: ${error}`);
    }

    return response.json();
  }
}

/**
 * Collection of available scraping clients
 *
 * Bundles native and optional Firecrawl clients for use by the scraping
 * strategy selector. The firecrawl client is only present when configured
 * with an API key.
 */
export interface IScrapingClients {
  /** Native HTTP fetcher (always available) */
  native: INativeFetcher;
  /** Firecrawl client (optional, requires API key) */
  firecrawl?: IFirecrawlClient;
}

/**
 * Factory function type for creating scraping clients
 *
 * Returns a collection of configured scraping clients. Used for dependency
 * injection to allow testing with mock clients.
 */
export type ClientFactory = () => IScrapingClients;

/**
 * Factory function type for creating strategy config clients
 *
 * Returns a client for loading and saving learned scraping strategies.
 * Used for dependency injection to allow testing with mock implementations.
 */
export type StrategyConfigFactory = () => IStrategyConfigClient;

/**
 * Create and configure an MCP server instance
 *
 * Factory function that creates a fully configured MCP server with all
 * tools and resources registered. Provides a registerHandlers function
 * for delayed registration with optional custom client factories.
 *
 * @returns Object containing the server instance and registerHandlers function
 *
 * @example
 * ```typescript
 * const { server, registerHandlers } = createMCPServer();
 * await registerHandlers(server);
 * // Server is now ready to handle requests
 * ```
 */
export function createMCPServer() {
  const server = new Server(
    {
      name: "@pulsemcp/pulse",
      version: "0.0.1",
    },
    {
      capabilities: {
        resources: {
          subscribe: false,
          listChanged: false,
        },
        tools: {
          listChanged: false,
        },
      },
    },
  );

  const registerHandlers = async (
    server: Server,
    clientFactory?: ClientFactory,
    strategyConfigFactory?: StrategyConfigFactory,
  ) => {
    // Use provided factory or create default clients
    const factory =
      clientFactory ||
      (() => {
        const webhookBridgeUrl = env.webhookBaseUrl;

        const clients: IScrapingClients = {
          native: new NativeFetcher(),
          // Use webhook bridge as Firecrawl proxy (always available)
          firecrawl: new WebhookBridgeClient(webhookBridgeUrl),
        };

        return clients;
      });

    // Use provided strategy config factory or create default
    const configFactory =
      strategyConfigFactory || (() => new FilesystemStrategyConfigClient());

    registerResources(server);
    registerTools(server, factory, configFactory);
  };

  return { server, registerHandlers };
}
