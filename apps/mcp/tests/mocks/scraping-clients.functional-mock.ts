import type {
  INativeFetcher,
  IFirecrawlClient,
  IScrapingClients,
} from '../../shared/server.js';
import type { CrawlRequestConfig } from '../../shared/config/crawl-config.js';

export interface MockNativeFetcher extends INativeFetcher {
  setMockResponse(response: {
    success: boolean;
    status?: number;
    data?: string;
    error?: string;
  }): void;
}

export interface MockFirecrawlClient extends IFirecrawlClient {
  setMockResponse(response: {
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
    crawl?: {
      success: boolean;
      crawlId?: string;
      error?: string;
    };
  }): void;

  getLastCrawlConfig(): CrawlRequestConfig | undefined;
  getCrawlCalls(): CrawlRequestConfig[];
  resetCrawlCalls(): void;
}

export function createMockNativeFetcher(): MockNativeFetcher {
  let mockResponse: {
    success: boolean;
    status?: number;
    data?: string;
    error?: string;
  } = {
    success: true,
    status: 200,
    data: 'Mock native content',
  };

  return {
    async scrape(_url: string, _options?: { timeout?: number } & RequestInit): Promise<{
      success: boolean;
      status?: number;
      data?: string;
      error?: string;
    }> {
      return mockResponse;
    },
    setMockResponse(response) {
      mockResponse = response;
    },
  };
}

export function createMockFirecrawlClient(): MockFirecrawlClient {
  let mockResponse: {
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
    crawl?: {
      success: boolean;
      crawlId?: string;
      error?: string;
    };
  } = {
    success: true,
    data: {
      content: 'Mock Firecrawl content',
      markdown: '# Mock Firecrawl content',
      html: '<h1>Mock Firecrawl content</h1>',
      metadata: { source: 'firecrawl' },
    },
  };
  const crawlCalls: CrawlRequestConfig[] = [];

  return {
    async scrape(_url: string, _options?: Record<string, unknown>): Promise<{
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
      return mockResponse;
    },
    async startCrawl(config: CrawlRequestConfig): Promise<{
      success: boolean;
      crawlId?: string;
      error?: string;
    }> {
      crawlCalls.push(config);
      return mockResponse.crawl || { success: true, crawlId: 'mock-crawl-id' };
    },
    setMockResponse(response) {
      mockResponse = response;
    },
    getLastCrawlConfig() {
      return crawlCalls[crawlCalls.length - 1];
    },
    getCrawlCalls() {
      return [...crawlCalls];
    },
    resetCrawlCalls() {
      crawlCalls.length = 0;
    },
  };
}

export function createMockScrapingClients(): {
  clients: IScrapingClients;
  mocks: {
    native: MockNativeFetcher;
    firecrawl: MockFirecrawlClient;
  };
} {
  const native = createMockNativeFetcher();
  const firecrawl = createMockFirecrawlClient();

  return {
    clients: {
      native,
      firecrawl,
    },
    mocks: {
      native,
      firecrawl,
    },
  };
}
