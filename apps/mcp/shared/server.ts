/**
 * @fileoverview MCP server factory and client interfaces
 *
 * This module provides the main factory function for creating configured
 * MCP servers with all tools and resources registered. It also defines
 * interfaces for scraping clients and provides default implementations.
 *
 * @module shared/server
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { registerResources, registerTools } from './mcp/registration.js';
import type { IStrategyConfigClient } from './scraping/strategies/learned/index.js';
import { FilesystemStrategyConfigClient } from './scraping/strategies/learned/index.js';
import { NativeScrapingClient } from './scraping/clients/native/native-scrape-client.js';
import type { CrawlRequestConfig } from './config/crawl-config.js';
import { FirecrawlClient as ActualFirecrawlClient } from './clients/firecrawl/client.js';
import type { FirecrawlConfig } from './clients/firecrawl/types.js';

/**
 * Interface for Firecrawl API client
 *
 * Defines the contract for interacting with Firecrawl's API for
 * advanced web scraping with JavaScript rendering and anti-bot bypass.
 */
export interface IFirecrawlClient {
  scrape(
    url: string,
    options?: Record<string, unknown>
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

  startCrawl?: (config: CrawlRequestConfig) => Promise<{
    success: boolean;
    crawlId?: string;
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
    options?: { timeout?: number } & RequestInit
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
    options?: { timeout?: number } & RequestInit
  ): Promise<{
    success: boolean;
    status?: number;
    data?: string;
    error?: string;
  }> {
    const result = await this.client.scrape(url, {
      timeout: options?.timeout,
      headers: options?.headers as Record<string, string>,
      method: options?.method as 'GET' | 'POST',
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
 * Default Firecrawl API client implementation
 *
 * Wrapper around the unified FirecrawlClient that adapts it to the
 * IFirecrawlClient interface. Provides access to Firecrawl's advanced
 * scraping capabilities including JavaScript rendering, anti-bot bypass,
 * and intelligent content extraction.
 *
 * @example
 * ```typescript
 * const client = new DefaultFirecrawlClient(process.env.FIRECRAWL_API_KEY);
 * const result = await client.scrape('https://example.com', {
 *   formats: ['markdown', 'html']
 * });
 * ```
 */
export class DefaultFirecrawlClient implements IFirecrawlClient {
  private client: ActualFirecrawlClient;

  constructor(apiKey: string, baseUrl?: string) {
    const config: FirecrawlConfig = { apiKey };
    if (baseUrl) {
      config.baseUrl = baseUrl;
    }
    this.client = new ActualFirecrawlClient(config);
  }

  async scrape(
    url: string,
    options?: Record<string, unknown>
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
    const result = await this.client.scrape(url, options);

    return {
      success: result.success,
      data: result.data
        ? {
            content: result.data.markdown || result.data.html || '',
            markdown: result.data.markdown || '',
            html: result.data.html || '',
            screenshot: result.data.screenshot,
            links: result.data.links,
            metadata: result.data.metadata || {},
          }
        : undefined,
      error: result.error,
    };
  }

  async startCrawl(config: CrawlRequestConfig): Promise<{
    success: boolean;
    crawlId?: string;
    error?: string;
  }> {
    const result = await this.client.startCrawl(config);

    return {
      success: result.success,
      crawlId: result.id,
      error: result.error,
    };
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
      name: '@pulsemcp/pulse-crawl',
      version: '0.0.1',
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
    }
  );

  const registerHandlers = async (
    server: Server,
    clientFactory?: ClientFactory,
    strategyConfigFactory?: StrategyConfigFactory
  ) => {
    // Use provided factory or create default clients
    const factory =
      clientFactory ||
      (() => {
        const firecrawlApiKey = process.env.FIRECRAWL_API_KEY;
        const firecrawlBaseUrl = process.env.FIRECRAWL_BASE_URL;

        const clients: IScrapingClients = {
          native: new NativeFetcher(),
        };

        if (firecrawlApiKey) {
          clients.firecrawl = new DefaultFirecrawlClient(firecrawlApiKey, firecrawlBaseUrl);
        }

        return clients;
      });

    // Use provided strategy config factory or create default
    const configFactory = strategyConfigFactory || (() => new FilesystemStrategyConfigClient());

    registerResources(server);
    registerTools(server, factory, configFactory);
  };

  return { server, registerHandlers };
}
