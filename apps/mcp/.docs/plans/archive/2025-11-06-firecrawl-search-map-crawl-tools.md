# Firecrawl Search, Map, and Crawl Tools Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add three new Firecrawl tools (search, map, crawl) to the Pulse Fetch MCP server following TDD principles and existing architectural patterns. The crawl tool consolidates start/status/cancel operations into a single tool to minimize token usage.

**Architecture:** Follow the established pattern from the scrape tool with client classes in `shared/clients/`, tool implementations in `shared/mcp/tools/`, and comprehensive test coverage. Each tool uses the existing FirecrawlConfig, error handling, storage integration, and response formatting patterns.

**Tech Stack:** TypeScript, Vitest, Zod, MCP SDK, Firecrawl API v2

---

## Implementation Status

**Last Updated:** 2025-11-06 15:58 EST

### ✅ Completed Tasks (13/17)

**Client Layer (Tasks 1-5):**

- **Task 1: Search Client - Test Setup** ✅ (Commit: b04294f)
  - Created FirecrawlSearchClient with initialization tests
  - Tests: 2 passing

- **Task 2: Search Client - Basic Search Method** ✅ (Commit: f01fdd3)
  - Implemented search() method with full type definitions
  - Tests: 4 passing (init + search)

- **Task 3: Map Client - Test Setup and Basic Map** ✅ (Commit: 456141d)
  - Created FirecrawlMapClient with complete map() implementation
  - Tests: 3 passing

- **Task 4: Crawl Client - Test Setup and Start Crawl** ✅ (Commit: 06adcd6)
  - Created FirecrawlCrawlClient with startCrawl() method
  - Tests: 2 passing

- **Task 5: Crawl Client - Get Status and Cancel** ✅ (Commit: d02f100)
  - Added getStatus() and cancel() methods to CrawlClient
  - Tests: 4 passing

**MCP Tool Layer (Tasks 6-13):**

- **Task 6: Search Tool - Schema and Pipeline Setup** ✅ (Commit: b993ce0)
  - Created searchOptionsSchema with Zod validation
  - Tests: 3 passing

- **Task 7: Search Tool - Pipeline Implementation** ✅ (Commit: b993ce0)
  - Implemented searchPipeline function
  - Tests: 2 passing

- **Task 8: Search Tool - Response Formatting** ✅ (Commit: b993ce0)
  - Created formatSearchResponse with multi-source support
  - Tests: 2 passing

- **Task 9: Search Tool - MCP Tool Registration** ✅ (Commit: b073440)
  - Implemented createSearchTool with handler
  - Fixed test assertion (case-insensitive match)
  - Tests: 2 passing

- **Task 10: Map Tool - Complete Implementation** ✅ (Commit: b073440)
  - Complete map tool with schema, pipeline, response, index
  - Support for sitemap and URL filtering
  - Tests: 5 passing

- **Task 11: Crawl Tool - Consolidated Implementation** ✅ (Commit: b073440)
  - Single tool handles start/status/cancel operations
  - Discriminated union schema for operation routing
  - Tests: 5 passing

- **Task 12: Register New Tools in Shared Module** ✅ (Commit: b073440)
  - Updated mcp/tools/index.ts with all 4 tools
  - All tools registered in ListTools and CallTool handlers

- **Task 13: Build and Integration Test** ✅ (Commit: b073440)
  - All modules build successfully
  - 78 tests passing across all modules
  - All 4 tools (scrape, search, map, crawl) operational

**Total Tests Passing:** 78 tests across clients, tools, and infrastructure

### ⏳ Remaining Tasks (4/17)

- Task 14: Integration Tests for New Tools
- Task 15: Manual Testing Scripts
- Task 16: Documentation Updates
- Task 17: Final Verification and Cleanup

---

## Prerequisites

**Before starting:**

- Review existing scrape tool implementation in `shared/mcp/tools/scrape/`
- Review existing FirecrawlScrapingClient in `shared/clients/firecrawl-scraping.client.ts`
- Ensure `FIRECRAWL_API_KEY` is set in `.env`
- Run `npm test` from project root to verify all existing tests pass

---

## Task 1: Search Client - Test Setup

**Files:**

- Create: `shared/clients/firecrawl-search.client.ts`
- Create: `shared/clients/firecrawl-search.client.test.ts`

**Step 1: Write the failing test for SearchClient initialization**

Create `shared/clients/firecrawl-search.client.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { FirecrawlSearchClient } from './firecrawl-search.client.js';
import type { FirecrawlConfig } from '../types.js';

describe('FirecrawlSearchClient', () => {
  let config: FirecrawlConfig;

  beforeEach(() => {
    config = {
      apiKey: 'fc-test-api-key',
      baseUrl: 'https://api.firecrawl.dev/v2',
    };
  });

  describe('initialization', () => {
    it('should create instance with valid config', () => {
      const client = new FirecrawlSearchClient(config);
      expect(client).toBeInstanceOf(FirecrawlSearchClient);
    });

    it('should throw error if API key is missing', () => {
      const invalidConfig = { ...config, apiKey: '' };
      expect(() => new FirecrawlSearchClient(invalidConfig)).toThrow('API key is required');
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd shared
npm test -- firecrawl-search.client.test.ts
```

Expected: FAIL - "Cannot find module './firecrawl-search.client.js'"

**Step 3: Write minimal SearchClient implementation**

Create `shared/clients/firecrawl-search.client.ts`:

```typescript
import type { FirecrawlConfig } from '../types.js';

export class FirecrawlSearchClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(config: FirecrawlConfig) {
    if (!config.apiKey || config.apiKey.trim() === '') {
      throw new Error('API key is required');
    }
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'https://api.firecrawl.dev/v2';
  }
}
```

**Step 4: Run test to verify it passes**

```bash
npm test -- firecrawl-search.client.test.ts
```

Expected: PASS (2 tests)

**Step 5: Commit**

```bash
git add shared/clients/firecrawl-search.client.ts shared/clients/firecrawl-search.client.test.ts
git commit -m "test: add SearchClient initialization tests

- Add test for valid config initialization
- Add test for missing API key validation"
```

---

## Task 2: Search Client - Basic Search Method

**Files:**

- Modify: `shared/clients/firecrawl-search.client.ts`
- Modify: `shared/clients/firecrawl-search.client.test.ts`
- Reference: `shared/clients/firecrawl-scraping.client.ts` (for fetch pattern)

**Step 1: Write the failing test for basic search**

Add to `shared/clients/firecrawl-search.client.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('FirecrawlSearchClient', () => {
  // ... existing tests ...

  describe('search', () => {
    it('should perform basic search and return results', async () => {
      const mockResponse = {
        success: true,
        data: [
          {
            url: 'https://example.com/page1',
            title: 'Example Page 1',
            description: 'Test description',
          },
        ],
        creditsUsed: 2,
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const client = new FirecrawlSearchClient(config);
      const result = await client.search({ query: 'test query', limit: 5 });

      expect(result).toEqual(mockResponse);
      expect(fetch).toHaveBeenCalledWith(
        'https://api.firecrawl.dev/v2/search',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer fc-test-api-key',
          }),
          body: JSON.stringify({ query: 'test query', limit: 5 }),
        })
      );
    });

    it('should handle API errors', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'Invalid API key',
      });

      const client = new FirecrawlSearchClient(config);
      await expect(client.search({ query: 'test' })).rejects.toThrow(
        'Firecrawl API error (401): Invalid API key'
      );
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npm test -- firecrawl-search.client.test.ts
```

Expected: FAIL - "client.search is not a function"

**Step 3: Write minimal search implementation**

Modify `shared/clients/firecrawl-search.client.ts`:

```typescript
export interface SearchOptions {
  query: string;
  limit?: number;
  sources?: Array<'web' | 'images' | 'news'>;
  categories?: Array<'github' | 'research' | 'pdf'>;
  country?: string;
  lang?: string;
  location?: string;
  timeout?: number;
  ignoreInvalidURLs?: boolean;
  scrapeOptions?: {
    formats?: string[];
    onlyMainContent?: boolean;
    removeBase64Images?: boolean;
    blockAds?: boolean;
    waitFor?: number;
    parsers?: string[];
  };
}

export interface SearchResult {
  success: boolean;
  data:
    | Array<{
        url: string;
        title?: string;
        description?: string;
        markdown?: string;
        html?: string;
        position?: number;
        category?: string;
      }>
    | {
        web?: Array<any>;
        images?: Array<any>;
        news?: Array<any>;
      };
  creditsUsed: number;
}

export class FirecrawlSearchClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(config: FirecrawlConfig) {
    if (!config.apiKey || config.apiKey.trim() === '') {
      throw new Error('API key is required');
    }
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'https://api.firecrawl.dev/v2';
  }

  async search(options: SearchOptions): Promise<SearchResult> {
    const response = await fetch(`${this.baseUrl}/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(options),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Firecrawl API error (${response.status}): ${errorText}`);
    }

    return response.json();
  }
}
```

**Step 4: Run test to verify it passes**

```bash
npm test -- firecrawl-search.client.test.ts
```

Expected: PASS (4 tests)

**Step 5: Commit**

```bash
git add shared/clients/firecrawl-search.client.ts shared/clients/firecrawl-search.client.test.ts
git commit -m "feat: add search method to SearchClient

- Implement basic search with configurable options
- Add error handling for API failures
- Add comprehensive TypeScript types"
```

---

## Task 3: Map Client - Test Setup and Basic Map

**Files:**

- Create: `shared/clients/firecrawl-map.client.ts`
- Create: `shared/clients/firecrawl-map.client.test.ts`

**Step 1: Write the failing test for MapClient**

Create `shared/clients/firecrawl-map.client.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FirecrawlMapClient } from './firecrawl-map.client.js';
import type { FirecrawlConfig } from '../types.js';

describe('FirecrawlMapClient', () => {
  let config: FirecrawlConfig;

  beforeEach(() => {
    config = {
      apiKey: 'fc-test-api-key',
      baseUrl: 'https://api.firecrawl.dev/v2',
    };
  });

  describe('initialization', () => {
    it('should create instance with valid config', () => {
      const client = new FirecrawlMapClient(config);
      expect(client).toBeInstanceOf(FirecrawlMapClient);
    });
  });

  describe('map', () => {
    it('should map website URLs and return links', async () => {
      const mockResponse = {
        success: true,
        links: [
          {
            url: 'https://example.com/page1',
            title: 'Page 1',
            description: 'Description 1',
          },
          {
            url: 'https://example.com/page2',
            title: 'Page 2',
          },
        ],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const client = new FirecrawlMapClient(config);
      const result = await client.map({ url: 'https://example.com', limit: 100 });

      expect(result).toEqual(mockResponse);
      expect(fetch).toHaveBeenCalledWith(
        'https://api.firecrawl.dev/v2/map',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer fc-test-api-key',
          }),
          body: JSON.stringify({ url: 'https://example.com', limit: 100 }),
        })
      );
    });

    it('should handle search parameter for filtering', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, links: [] }),
      });

      const client = new FirecrawlMapClient(config);
      await client.map({ url: 'https://example.com', search: 'docs', limit: 50 });

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({ url: 'https://example.com', search: 'docs', limit: 50 }),
        })
      );
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npm test -- firecrawl-map.client.test.ts
```

Expected: FAIL - "Cannot find module './firecrawl-map.client.js'"

**Step 3: Write minimal MapClient implementation**

Create `shared/clients/firecrawl-map.client.ts`:

```typescript
import type { FirecrawlConfig } from '../types.js';

export interface MapOptions {
  url: string;
  search?: string;
  limit?: number;
  sitemap?: 'skip' | 'include' | 'only';
  includeSubdomains?: boolean;
  ignoreQueryParameters?: boolean;
  timeout?: number;
  location?: {
    country?: string;
    languages?: string[];
  };
}

export interface MapResult {
  success: boolean;
  links: Array<{
    url: string;
    title?: string;
    description?: string;
  }>;
}

export class FirecrawlMapClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(config: FirecrawlConfig) {
    if (!config.apiKey || config.apiKey.trim() === '') {
      throw new Error('API key is required');
    }
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'https://api.firecrawl.dev/v2';
  }

  async map(options: MapOptions): Promise<MapResult> {
    const response = await fetch(`${this.baseUrl}/map`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(options),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Firecrawl API error (${response.status}): ${errorText}`);
    }

    return response.json();
  }
}
```

**Step 4: Run test to verify it passes**

```bash
npm test -- firecrawl-map.client.test.ts
```

Expected: PASS (3 tests)

**Step 5: Commit**

```bash
git add shared/clients/firecrawl-map.client.ts shared/clients/firecrawl-map.client.test.ts
git commit -m "feat: add MapClient for URL discovery

- Implement map method with filtering options
- Add support for sitemap and subdomain configuration
- Add TypeScript types for map options and results"
```

---

## Task 4: Crawl Client - Test Setup and Start Crawl

**Files:**

- Create: `shared/clients/firecrawl-crawl.client.ts`
- Create: `shared/clients/firecrawl-crawl.client.test.ts`

**Step 1: Write the failing test for CrawlClient start**

Create `shared/clients/firecrawl-crawl.client.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FirecrawlCrawlClient } from './firecrawl-crawl.client.js';
import type { FirecrawlConfig } from '../types.js';

describe('FirecrawlCrawlClient', () => {
  let config: FirecrawlConfig;

  beforeEach(() => {
    config = {
      apiKey: 'fc-test-api-key',
      baseUrl: 'https://api.firecrawl.dev/v2',
    };
  });

  describe('initialization', () => {
    it('should create instance with valid config', () => {
      const client = new FirecrawlCrawlClient(config);
      expect(client).toBeInstanceOf(FirecrawlCrawlClient);
    });
  });

  describe('startCrawl', () => {
    it('should start crawl and return job ID', async () => {
      const mockResponse = {
        success: true,
        id: 'crawl-job-123',
        url: 'https://api.firecrawl.dev/v2/crawl/crawl-job-123',
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const client = new FirecrawlCrawlClient(config);
      const result = await client.startCrawl({
        url: 'https://example.com',
        limit: 100,
      });

      expect(result).toEqual(mockResponse);
      expect(fetch).toHaveBeenCalledWith(
        'https://api.firecrawl.dev/v2/crawl',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer fc-test-api-key',
          }),
          body: expect.stringContaining('https://example.com'),
        })
      );
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npm test -- firecrawl-crawl.client.test.ts
```

Expected: FAIL - "Cannot find module './firecrawl-crawl.client.js'"

**Step 3: Write minimal CrawlClient with startCrawl**

Create `shared/clients/firecrawl-crawl.client.ts`:

```typescript
import type { FirecrawlConfig } from '../types.js';

export interface CrawlOptions {
  url: string;
  limit?: number;
  maxDepth?: number;
  crawlEntireDomain?: boolean;
  allowSubdomains?: boolean;
  allowExternalLinks?: boolean;
  includePaths?: string[];
  excludePaths?: string[];
  ignoreQueryParameters?: boolean;
  sitemap?: 'include' | 'skip';
  delay?: number;
  maxConcurrency?: number;
  scrapeOptions?: {
    formats?: string[];
    onlyMainContent?: boolean;
    includeTags?: string[];
    excludeTags?: string[];
  };
}

export interface StartCrawlResult {
  success: boolean;
  id: string;
  url: string;
}

export class FirecrawlCrawlClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(config: FirecrawlConfig) {
    if (!config.apiKey || config.apiKey.trim() === '') {
      throw new Error('API key is required');
    }
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'https://api.firecrawl.dev/v2';
  }

  async startCrawl(options: CrawlOptions): Promise<StartCrawlResult> {
    const response = await fetch(`${this.baseUrl}/crawl`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(options),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Firecrawl API error (${response.status}): ${errorText}`);
    }

    return response.json();
  }
}
```

**Step 4: Run test to verify it passes**

```bash
npm test -- firecrawl-crawl.client.test.ts
```

Expected: PASS (2 tests)

**Step 5: Commit**

```bash
git add shared/clients/firecrawl-crawl.client.ts shared/clients/firecrawl-crawl.client.test.ts
git commit -m "feat: add CrawlClient with startCrawl method

- Implement startCrawl to initiate crawl jobs
- Add comprehensive crawl options interface
- Return job ID for status tracking"
```

---

## Task 5: Crawl Client - Get Status and Cancel

**Files:**

- Modify: `shared/clients/firecrawl-crawl.client.ts`
- Modify: `shared/clients/firecrawl-crawl.client.test.ts`

**Step 1: Write the failing test for getStatus and cancel**

Add to `shared/clients/firecrawl-crawl.client.test.ts`:

```typescript
describe('FirecrawlCrawlClient', () => {
  // ... existing tests ...

  describe('getStatus', () => {
    it('should get crawl status and return results', async () => {
      const mockResponse = {
        status: 'scraping',
        total: 100,
        completed: 50,
        creditsUsed: 50,
        expiresAt: '2025-11-06T12:00:00Z',
        data: [
          {
            markdown: '# Page content',
            metadata: { title: 'Test Page', sourceURL: 'https://example.com/page1' },
          },
        ],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const client = new FirecrawlCrawlClient(config);
      const result = await client.getStatus('crawl-job-123');

      expect(result).toEqual(mockResponse);
      expect(fetch).toHaveBeenCalledWith(
        'https://api.firecrawl.dev/v2/crawl/crawl-job-123',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer fc-test-api-key',
          }),
        })
      );
    });
  });

  describe('cancel', () => {
    it('should cancel crawl job', async () => {
      const mockResponse = {
        status: 'cancelled',
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const client = new FirecrawlCrawlClient(config);
      const result = await client.cancel('crawl-job-123');

      expect(result).toEqual(mockResponse);
      expect(fetch).toHaveBeenCalledWith(
        'https://api.firecrawl.dev/v2/crawl/crawl-job-123',
        expect.objectContaining({
          method: 'DELETE',
        })
      );
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npm test -- firecrawl-crawl.client.test.ts
```

Expected: FAIL - "client.getStatus is not a function"

**Step 3: Write getStatus and cancel methods**

Add to `shared/clients/firecrawl-crawl.client.ts`:

```typescript
export interface CrawlStatusResult {
  status: 'scraping' | 'completed' | 'failed' | 'cancelled';
  total: number;
  completed: number;
  creditsUsed: number;
  expiresAt: string;
  next?: string;
  data: Array<{
    markdown?: string;
    html?: string;
    rawHtml?: string;
    links?: string[];
    screenshot?: string;
    metadata?: {
      title?: string;
      description?: string;
      language?: string;
      sourceURL?: string;
      statusCode?: number;
      [key: string]: any;
    };
  }>;
}

export interface CancelResult {
  status: 'cancelled';
}

export class FirecrawlCrawlClient {
  // ... existing code ...

  async getStatus(jobId: string): Promise<CrawlStatusResult> {
    const response = await fetch(`${this.baseUrl}/crawl/${jobId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Firecrawl API error (${response.status}): ${errorText}`);
    }

    return response.json();
  }

  async cancel(jobId: string): Promise<CancelResult> {
    const response = await fetch(`${this.baseUrl}/crawl/${jobId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Firecrawl API error (${response.status}): ${errorText}`);
    }

    return response.json();
  }
}
```

**Step 4: Run test to verify it passes**

```bash
npm test -- firecrawl-crawl.client.test.ts
```

Expected: PASS (4 tests)

**Step 5: Commit**

```bash
git add shared/clients/firecrawl-crawl.client.ts shared/clients/firecrawl-crawl.client.test.ts
git commit -m "feat: add getStatus and cancel methods to CrawlClient

- Implement getStatus for tracking crawl progress
- Implement cancel for stopping in-progress crawls
- Add comprehensive type definitions for responses"
```

---

## Task 6: Search Tool - Schema and Pipeline Setup

**Files:**

- Create: `shared/mcp/tools/search/index.ts`
- Create: `shared/mcp/tools/search/schema.ts`
- Create: `shared/mcp/tools/search/pipeline.ts`
- Create: `shared/mcp/tools/search/response.ts`

**Step 1: Write the failing test for search schema**

Create `shared/mcp/tools/search/schema.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { searchOptionsSchema } from './schema.js';

describe('Search Schema', () => {
  it('should validate basic search options', () => {
    const result = searchOptionsSchema.safeParse({
      query: 'test query',
      limit: 10,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.query).toBe('test query');
      expect(result.data.limit).toBe(10);
    }
  });

  it('should reject invalid limit', () => {
    const result = searchOptionsSchema.safeParse({
      query: 'test',
      limit: 150, // Max is 100
    });

    expect(result.success).toBe(false);
  });

  it('should validate search with scrape options', () => {
    const result = searchOptionsSchema.safeParse({
      query: 'test',
      scrapeOptions: {
        formats: ['markdown', 'html'],
        onlyMainContent: true,
      },
    });

    expect(result.success).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npm test -- schema.test.ts
```

Expected: FAIL - "Cannot find module './schema.js'"

**Step 3: Write search schema**

Create `shared/mcp/tools/search/schema.ts`:

```typescript
import { z } from 'zod';

export const searchOptionsSchema = z.object({
  query: z.string().min(1, 'Query is required'),
  limit: z.number().int().min(1).max(100).optional().default(5),
  sources: z.array(z.enum(['web', 'images', 'news'])).optional(),
  categories: z.array(z.enum(['github', 'research', 'pdf'])).optional(),
  country: z.string().optional(),
  lang: z.string().optional().default('en'),
  location: z.string().optional(),
  timeout: z.number().int().positive().optional(),
  ignoreInvalidURLs: z.boolean().optional().default(false),
  scrapeOptions: z
    .object({
      formats: z.array(z.string()).optional(),
      onlyMainContent: z.boolean().optional(),
      removeBase64Images: z.boolean().optional().default(true),
      blockAds: z.boolean().optional().default(true),
      waitFor: z.number().int().optional(),
      parsers: z.array(z.string()).optional(),
    })
    .optional(),
});

export type SearchOptions = z.infer<typeof searchOptionsSchema>;
```

**Step 4: Run test to verify it passes**

```bash
npm test -- schema.test.ts
```

Expected: PASS (3 tests)

**Step 5: Commit**

```bash
git add shared/mcp/tools/search/schema.ts shared/mcp/tools/search/schema.test.ts
git commit -m "feat: add search tool schema with validation

- Define searchOptionsSchema with Zod
- Add validation for all search parameters
- Add tests for schema validation"
```

---

## Task 7: Search Tool - Pipeline Implementation

**Files:**

- Create: `shared/mcp/tools/search/pipeline.ts`
- Create: `shared/mcp/tools/search/pipeline.test.ts`

**Step 1: Write the failing test for search pipeline**

Create `shared/mcp/tools/search/pipeline.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { searchPipeline } from './pipeline.js';
import { FirecrawlSearchClient } from '../../../clients/firecrawl-search.client.js';

vi.mock('../../../clients/firecrawl-search.client.js');

describe('Search Pipeline', () => {
  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      search: vi.fn(),
    };
  });

  it('should execute search and return results', async () => {
    mockClient.search.mockResolvedValue({
      success: true,
      data: [{ url: 'https://example.com', title: 'Test', description: 'Desc' }],
      creditsUsed: 2,
    });

    const result = await searchPipeline(mockClient, {
      query: 'test query',
      limit: 5,
    });

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
    expect(mockClient.search).toHaveBeenCalledWith({
      query: 'test query',
      limit: 5,
    });
  });

  it('should handle search errors', async () => {
    mockClient.search.mockRejectedValue(new Error('API error'));

    await expect(searchPipeline(mockClient, { query: 'test' })).rejects.toThrow('API error');
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npm test -- pipeline.test.ts
```

Expected: FAIL - "Cannot find module './pipeline.js'"

**Step 3: Write search pipeline**

Create `shared/mcp/tools/search/pipeline.ts`:

```typescript
import type {
  FirecrawlSearchClient,
  SearchOptions as ClientSearchOptions,
  SearchResult,
} from '../../../clients/firecrawl-search.client.js';
import type { SearchOptions } from './schema.js';

export async function searchPipeline(
  client: FirecrawlSearchClient,
  options: SearchOptions
): Promise<SearchResult> {
  const clientOptions: ClientSearchOptions = {
    query: options.query,
    limit: options.limit,
    sources: options.sources,
    categories: options.categories,
    country: options.country,
    lang: options.lang,
    location: options.location,
    timeout: options.timeout,
    ignoreInvalidURLs: options.ignoreInvalidURLs,
    scrapeOptions: options.scrapeOptions,
  };

  return await client.search(clientOptions);
}
```

**Step 4: Run test to verify it passes**

```bash
npm test -- pipeline.test.ts
```

Expected: PASS (2 tests)

**Step 5: Commit**

```bash
git add shared/mcp/tools/search/pipeline.ts shared/mcp/tools/search/pipeline.test.ts
git commit -m "feat: add search pipeline implementation

- Create searchPipeline to orchestrate search execution
- Add error handling and type mapping
- Add comprehensive tests"
```

---

## Task 8: Search Tool - Response Formatting

**Files:**

- Create: `shared/mcp/tools/search/response.ts`
- Create: `shared/mcp/tools/search/response.test.ts`

**Step 1: Write the failing test for response formatting**

Create `shared/mcp/tools/search/response.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { formatSearchResponse } from './response.js';

describe('Search Response Formatting', () => {
  it('should format basic search results', () => {
    const searchResult = {
      success: true,
      data: [
        {
          url: 'https://example.com/page1',
          title: 'Page 1',
          description: 'Description 1',
        },
        {
          url: 'https://example.com/page2',
          title: 'Page 2',
          description: 'Description 2',
        },
      ],
      creditsUsed: 2,
    };

    const response = formatSearchResponse(searchResult, 'test query');

    expect(response.content).toHaveLength(2);
    expect(response.content[0].type).toBe('text');
    expect(response.content[0].text).toContain('Found 2 results');
    expect(response.content[1].type).toBe('resource');
  });

  it('should format multi-source results', () => {
    const searchResult = {
      success: true,
      data: {
        web: [{ url: 'https://example.com', title: 'Web Result' }],
        images: [{ imageUrl: 'https://example.com/img.jpg', title: 'Image' }],
        news: [{ url: 'https://news.com', title: 'News Item' }],
      },
      creditsUsed: 5,
    };

    const response = formatSearchResponse(searchResult, 'test');

    expect(response.content.length).toBeGreaterThan(1);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npm test -- response.test.ts
```

Expected: FAIL - "Cannot find module './response.js'"

**Step 3: Write response formatter**

Create `shared/mcp/tools/search/response.ts`:

```typescript
import type { SearchResult } from '../../../clients/firecrawl-search.client.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export function formatSearchResponse(result: SearchResult, query: string): CallToolResult {
  const content: CallToolResult['content'] = [];

  // Determine if results are in simple or multi-source format
  const isMultiSource = !Array.isArray(result.data);

  if (isMultiSource) {
    const data = result.data as any;
    const webCount = data.web?.length || 0;
    const imageCount = data.images?.length || 0;
    const newsCount = data.news?.length || 0;
    const total = webCount + imageCount + newsCount;

    content.push({
      type: 'text',
      text: `Found ${total} results for "${query}" (${webCount} web, ${imageCount} images, ${newsCount} news)\nCredits used: ${result.creditsUsed}`,
    });

    // Format each source type
    if (data.web?.length > 0) {
      content.push({
        type: 'resource',
        resource: {
          uri: `pulse://search/web/${Date.now()}`,
          name: `Web Results: ${query}`,
          mimeType: 'application/json',
          text: JSON.stringify(data.web, null, 2),
        },
      });
    }

    if (data.images?.length > 0) {
      content.push({
        type: 'resource',
        resource: {
          uri: `pulse://search/images/${Date.now()}`,
          name: `Image Results: ${query}`,
          mimeType: 'application/json',
          text: JSON.stringify(data.images, null, 2),
        },
      });
    }

    if (data.news?.length > 0) {
      content.push({
        type: 'resource',
        resource: {
          uri: `pulse://search/news/${Date.now()}`,
          name: `News Results: ${query}`,
          mimeType: 'application/json',
          text: JSON.stringify(data.news, null, 2),
        },
      });
    }
  } else {
    const results = result.data as any[];
    content.push({
      type: 'text',
      text: `Found ${results.length} results for "${query}"\nCredits used: ${result.creditsUsed}`,
    });

    content.push({
      type: 'resource',
      resource: {
        uri: `pulse://search/results/${Date.now()}`,
        name: `Search Results: ${query}`,
        mimeType: 'application/json',
        text: JSON.stringify(results, null, 2),
      },
    });
  }

  return { content, isError: false };
}
```

**Step 4: Run test to verify it passes**

```bash
npm test -- response.test.ts
```

Expected: PASS (2 tests)

**Step 5: Commit**

```bash
git add shared/mcp/tools/search/response.ts shared/mcp/tools/search/response.test.ts
git commit -m "feat: add search response formatting

- Format both simple and multi-source results
- Create MCP-compatible resources
- Include summary text with credit usage"
```

---

## Task 9: Search Tool - MCP Tool Registration

**Files:**

- Create: `shared/mcp/tools/search/index.ts`
- Create: `shared/mcp/tools/search/index.test.ts`
- Modify: `shared/mcp/tools/index.ts`

**Step 1: Write the failing test for search tool**

Create `shared/mcp/tools/search/index.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSearchTool } from './index.js';
import type { FirecrawlConfig } from '../../../types.js';

describe('Search Tool', () => {
  let config: FirecrawlConfig;

  beforeEach(() => {
    config = {
      apiKey: 'fc-test-key',
      baseUrl: 'https://api.firecrawl.dev/v2',
    };
  });

  it('should create search tool with proper structure', () => {
    const tool = createSearchTool(config);

    expect(tool.name).toBe('search');
    expect(tool.description).toContain('search the web');
    expect(tool.inputSchema).toBeDefined();
    expect(typeof tool.handler).toBe('function');
  });

  it('should execute search through handler', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: [{ url: 'https://example.com', title: 'Test' }],
        creditsUsed: 2,
      }),
    });

    const tool = createSearchTool(config);
    const result = await tool.handler({ query: 'test', limit: 5 });

    expect(result.isError).toBe(false);
    expect(result.content).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npm test -- index.test.ts
```

Expected: FAIL - "Cannot find module './index.js'"

**Step 3: Write search tool registration**

Create `shared/mcp/tools/search/index.ts`:

```typescript
import { FirecrawlSearchClient } from '../../../clients/firecrawl-search.client.js';
import type { FirecrawlConfig } from '../../../types.js';
import { searchOptionsSchema } from './schema.js';
import { searchPipeline } from './pipeline.js';
import { formatSearchResponse } from './response.js';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export function createSearchTool(config: FirecrawlConfig): Tool {
  const client = new FirecrawlSearchClient(config);

  return {
    name: 'search',
    description:
      'Search the web using Firecrawl with optional content scraping. Supports web, image, and news search with filtering by category (GitHub, research papers, PDFs).',
    inputSchema: zodToJsonSchema(searchOptionsSchema, 'searchOptions'),

    handler: async (args: unknown) => {
      try {
        const validatedArgs = searchOptionsSchema.parse(args);
        const result = await searchPipeline(client, validatedArgs);
        return formatSearchResponse(result, validatedArgs.query);
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Search error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  };
}
```

**Step 4: Run test to verify it passes**

```bash
npm test -- index.test.ts
```

Expected: PASS (2 tests)

**Step 5: Commit**

```bash
git add shared/mcp/tools/search/index.ts shared/mcp/tools/search/index.test.ts
git commit -m "feat: add search tool MCP registration

- Create createSearchTool factory function
- Integrate schema, pipeline, and response formatting
- Add comprehensive error handling"
```

---

## Task 10: Map Tool - Complete Implementation

**Files:**

- Create: `shared/mcp/tools/map/index.ts`
- Create: `shared/mcp/tools/map/schema.ts`
- Create: `shared/mcp/tools/map/pipeline.ts`
- Create: `shared/mcp/tools/map/response.ts`
- Create: `shared/mcp/tools/map/index.test.ts`

**Step 1: Write the failing test for map tool**

Create `shared/mcp/tools/map/index.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMapTool } from './index.js';
import type { FirecrawlConfig } from '../../../types.js';

describe('Map Tool', () => {
  let config: FirecrawlConfig;

  beforeEach(() => {
    config = {
      apiKey: 'fc-test-key',
      baseUrl: 'https://api.firecrawl.dev/v2',
    };
  });

  it('should create map tool with proper structure', () => {
    const tool = createMapTool(config);

    expect(tool.name).toBe('map');
    expect(tool.description).toContain('Discover URLs');
    expect(tool.inputSchema).toBeDefined();
  });

  it('should execute map through handler', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        links: [
          { url: 'https://example.com/page1', title: 'Page 1' },
          { url: 'https://example.com/page2', title: 'Page 2' },
        ],
      }),
    });

    const tool = createMapTool(config);
    const result = await tool.handler({ url: 'https://example.com', limit: 100 });

    expect(result.isError).toBe(false);
    expect(result.content).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npm test -- map/index.test.ts
```

Expected: FAIL - "Cannot find module './index.js'"

**Step 3: Write map tool files**

Create `shared/mcp/tools/map/schema.ts`:

```typescript
import { z } from 'zod';

export const mapOptionsSchema = z.object({
  url: z.string().url('Valid URL is required'),
  search: z.string().optional(),
  limit: z.number().int().min(1).max(100000).optional().default(5000),
  sitemap: z.enum(['skip', 'include', 'only']).optional().default('include'),
  includeSubdomains: z.boolean().optional().default(true),
  ignoreQueryParameters: z.boolean().optional().default(true),
  timeout: z.number().int().positive().optional(),
  location: z
    .object({
      country: z.string().optional().default('US'),
      languages: z.array(z.string()).optional(),
    })
    .optional(),
});

export type MapOptions = z.infer<typeof mapOptionsSchema>;
```

Create `shared/mcp/tools/map/pipeline.ts`:

```typescript
import type {
  FirecrawlMapClient,
  MapOptions as ClientMapOptions,
  MapResult,
} from '../../../clients/firecrawl-map.client.js';
import type { MapOptions } from './schema.js';

export async function mapPipeline(
  client: FirecrawlMapClient,
  options: MapOptions
): Promise<MapResult> {
  const clientOptions: ClientMapOptions = {
    url: options.url,
    search: options.search,
    limit: options.limit,
    sitemap: options.sitemap,
    includeSubdomains: options.includeSubdomains,
    ignoreQueryParameters: options.ignoreQueryParameters,
    timeout: options.timeout,
    location: options.location,
  };

  return await client.map(clientOptions);
}
```

Create `shared/mcp/tools/map/response.ts`:

```typescript
import type { MapResult } from '../../../clients/firecrawl-map.client.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export function formatMapResponse(result: MapResult, url: string): CallToolResult {
  const content: CallToolResult['content'] = [];

  content.push({
    type: 'text',
    text: `Discovered ${result.links.length} URLs from ${url}`,
  });

  content.push({
    type: 'resource',
    resource: {
      uri: `pulse://map/${new URL(url).hostname}/${Date.now()}`,
      name: `URL Map: ${url}`,
      mimeType: 'application/json',
      text: JSON.stringify(result.links, null, 2),
    },
  });

  return { content, isError: false };
}
```

Create `shared/mcp/tools/map/index.ts`:

```typescript
import { FirecrawlMapClient } from '../../../clients/firecrawl-map.client.js';
import type { FirecrawlConfig } from '../../../types.js';
import { mapOptionsSchema } from './schema.js';
import { mapPipeline } from './pipeline.js';
import { formatMapResponse } from './response.js';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export function createMapTool(config: FirecrawlConfig): Tool {
  const client = new FirecrawlMapClient(config);

  return {
    name: 'map',
    description:
      'Discover URLs from a website using Firecrawl. Fast URL discovery (8x faster than crawl) with optional search filtering, sitemap integration, and subdomain handling.',
    inputSchema: zodToJsonSchema(mapOptionsSchema, 'mapOptions'),

    handler: async (args: unknown) => {
      try {
        const validatedArgs = mapOptionsSchema.parse(args);
        const result = await mapPipeline(client, validatedArgs);
        return formatMapResponse(result, validatedArgs.url);
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Map error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  };
}
```

**Step 4: Run test to verify it passes**

```bash
npm test -- map/index.test.ts
```

Expected: PASS (2 tests)

**Step 5: Commit**

```bash
git add shared/mcp/tools/map/
git commit -m "feat: add map tool for URL discovery

- Implement complete map tool with schema, pipeline, response
- Add support for search filtering and sitemap options
- Add comprehensive tests"
```

---

## Task 11: Crawl Tool - Consolidated Implementation

**Files:**

- Create: `shared/mcp/tools/crawl/index.ts`
- Create: `shared/mcp/tools/crawl/schema.ts`
- Create: `shared/mcp/tools/crawl/pipeline.ts`
- Create: `shared/mcp/tools/crawl/response.ts`
- Create: `shared/mcp/tools/crawl/index.test.ts`

**Step 1: Write the failing test for consolidated crawl tool**

Create `shared/mcp/tools/crawl/index.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCrawlTool } from './index.js';
import type { FirecrawlConfig } from '../../../types.js';

describe('Crawl Tool', () => {
  let config: FirecrawlConfig;

  beforeEach(() => {
    config = {
      apiKey: 'fc-test-key',
      baseUrl: 'https://api.firecrawl.dev/v2',
    };
  });

  it('should create crawl tool with proper structure', () => {
    const tool = createCrawlTool(config);

    expect(tool.name).toBe('crawl');
    expect(tool.description).toContain('crawl');
    expect(tool.inputSchema).toBeDefined();
  });

  it('should start crawl when url is provided', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        id: 'crawl-job-123',
        url: 'https://api.firecrawl.dev/v2/crawl/crawl-job-123',
      }),
    });

    const tool = createCrawlTool(config);
    const result = await tool.handler({ url: 'https://example.com', limit: 100 });

    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain('crawl-job-123');
  });

  it('should check status when only jobId is provided', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'scraping',
        total: 100,
        completed: 50,
        creditsUsed: 50,
        expiresAt: '2025-11-06T12:00:00Z',
        data: [],
      }),
    });

    const tool = createCrawlTool(config);
    const result = await tool.handler({ jobId: 'crawl-job-123' });

    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain('Crawl Status:');
  });

  it('should cancel crawl when jobId and cancel=true', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'cancelled' }),
    });

    const tool = createCrawlTool(config);
    const result = await tool.handler({ jobId: 'crawl-job-123', cancel: true });

    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain('cancelled');
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npm test -- crawl/index.test.ts
```

Expected: FAIL - "Cannot find module './index.js'"

**Step 3: Write consolidated crawl schema**

Create `shared/mcp/tools/crawl/schema.ts`:

```typescript
import { z } from 'zod';

// Schema for starting a crawl (when url is provided)
const startCrawlSchema = z.object({
  url: z.string().url('Valid URL is required'),
  limit: z.number().int().min(1).max(100000).optional().default(100),
  maxDepth: z.number().int().min(1).optional(),
  crawlEntireDomain: z.boolean().optional().default(false),
  allowSubdomains: z.boolean().optional().default(false),
  allowExternalLinks: z.boolean().optional().default(false),
  includePaths: z.array(z.string()).optional(),
  excludePaths: z.array(z.string()).optional(),
  ignoreQueryParameters: z.boolean().optional().default(true),
  sitemap: z.enum(['include', 'skip']).optional().default('include'),
  delay: z.number().int().min(0).optional(),
  maxConcurrency: z.number().int().min(1).optional(),
  scrapeOptions: z
    .object({
      formats: z.array(z.string()).optional().default(['markdown']),
      onlyMainContent: z.boolean().optional().default(true),
      includeTags: z.array(z.string()).optional(),
      excludeTags: z.array(z.string()).optional(),
    })
    .optional(),
});

// Schema for checking status or canceling (when jobId is provided)
const jobOperationSchema = z.object({
  jobId: z.string().min(1, 'Job ID is required'),
  cancel: z.boolean().optional().default(false),
});

// Discriminated union: either url (start) or jobId (status/cancel)
export const crawlOptionsSchema = z
  .discriminatedUnion('jobId', [
    startCrawlSchema.extend({ jobId: z.undefined().optional() }),
    jobOperationSchema,
  ])
  .or(startCrawlSchema)
  .or(jobOperationSchema);

export type CrawlOptions = z.infer<typeof crawlOptionsSchema>;
```

**Step 4: Write consolidated crawl pipeline**

Create `shared/mcp/tools/crawl/pipeline.ts`:

```typescript
import type {
  FirecrawlCrawlClient,
  CrawlOptions as ClientCrawlOptions,
  StartCrawlResult,
  CrawlStatusResult,
  CancelResult,
} from '../../../clients/firecrawl-crawl.client.js';
import type { CrawlOptions } from './schema.js';

export async function crawlPipeline(
  client: FirecrawlCrawlClient,
  options: CrawlOptions
): Promise<StartCrawlResult | CrawlStatusResult | CancelResult> {
  // Determine operation based on parameters
  if ('url' in options && options.url) {
    // Start crawl operation
    const clientOptions: ClientCrawlOptions = {
      url: options.url,
      limit: options.limit,
      maxDepth: options.maxDepth,
      crawlEntireDomain: options.crawlEntireDomain,
      allowSubdomains: options.allowSubdomains,
      allowExternalLinks: options.allowExternalLinks,
      includePaths: options.includePaths,
      excludePaths: options.excludePaths,
      ignoreQueryParameters: options.ignoreQueryParameters,
      sitemap: options.sitemap,
      delay: options.delay,
      maxConcurrency: options.maxConcurrency,
      scrapeOptions: options.scrapeOptions,
    };
    return await client.startCrawl(clientOptions);
  } else if ('jobId' in options && options.jobId) {
    // Cancel or status operation
    if (options.cancel) {
      return await client.cancel(options.jobId);
    } else {
      return await client.getStatus(options.jobId);
    }
  } else {
    throw new Error('Either url (to start crawl) or jobId (to check status/cancel) is required');
  }
}
```

**Step 5: Write consolidated response formatter**

Create `shared/mcp/tools/crawl/response.ts`:

```typescript
import type {
  StartCrawlResult,
  CrawlStatusResult,
  CancelResult,
} from '../../../clients/firecrawl-crawl.client.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export function formatCrawlResponse(
  result: StartCrawlResult | CrawlStatusResult | CancelResult
): CallToolResult {
  // Check which type of result we have
  if ('id' in result && 'url' in result) {
    // StartCrawlResult
    return {
      content: [
        {
          type: 'text',
          text: `Crawl job started successfully!\n\nJob ID: ${result.id}\nStatus URL: ${result.url}\n\nUse crawl tool with jobId "${result.id}" to check progress.`,
        },
      ],
      isError: false,
    };
  } else if ('status' in result && 'completed' in result) {
    // CrawlStatusResult
    const statusResult = result as CrawlStatusResult;
    const content: CallToolResult['content'] = [];

    content.push({
      type: 'text',
      text: `Crawl Status: ${statusResult.status}\nProgress: ${statusResult.completed}/${statusResult.total} pages\nCredits used: ${statusResult.creditsUsed}\nExpires at: ${statusResult.expiresAt}`,
    });

    if (statusResult.data.length > 0) {
      content.push({
        type: 'resource',
        resource: {
          uri: `pulse://crawl/results/${Date.now()}`,
          name: `Crawl Results (${statusResult.completed} pages)`,
          mimeType: 'application/json',
          text: JSON.stringify(statusResult.data, null, 2),
        },
      });
    }

    if (statusResult.next) {
      content.push({
        type: 'text',
        text: `\nMore results available. Use pagination URL: ${statusResult.next}`,
      });
    }

    return { content, isError: false };
  } else {
    // CancelResult
    return {
      content: [
        {
          type: 'text',
          text: `Crawl job cancelled successfully. Status: ${(result as CancelResult).status}`,
        },
      ],
      isError: false,
    };
  }
}
```

**Step 6: Write consolidated crawl tool**

Create `shared/mcp/tools/crawl/index.ts`:

```typescript
import { FirecrawlCrawlClient } from '../../../clients/firecrawl-crawl.client.js';
import type { FirecrawlConfig } from '../../../types.js';
import { crawlOptionsSchema } from './schema.js';
import { crawlPipeline } from './pipeline.js';
import { formatCrawlResponse } from './response.js';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export function createCrawlTool(config: FirecrawlConfig): Tool {
  const client = new FirecrawlCrawlClient(config);

  return {
    name: 'crawl',
    description:
      'Manage website crawling jobs. Start a crawl with url parameter, check status with jobId, or cancel with jobId + cancel=true.',
    inputSchema: zodToJsonSchema(crawlOptionsSchema, 'crawlOptions'),

    handler: async (args: unknown) => {
      try {
        const validatedArgs = crawlOptionsSchema.parse(args);
        const result = await crawlPipeline(client, validatedArgs);
        return formatCrawlResponse(result);
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Crawl error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  };
}
```

**Step 7: Run test to verify it passes**

```bash
npm test -- crawl/index.test.ts
```

Expected: PASS (4 tests)

**Step 8: Commit**

```bash
git add shared/mcp/tools/crawl/
git commit -m "feat: add consolidated crawl tool

- Single crawl tool handles start, status, and cancel
- Use url param to start crawl (returns job ID)
- Use jobId param to check status
- Use jobId + cancel=true to cancel crawl
- Reduces token usage vs separate tools"
```

---

## Task 12: Register New Tools in Shared Module

**Files:**

- Modify: `shared/mcp/tools/index.ts`
- Modify: `shared/index.ts`

**Step 1: Write the failing test for tool registration**

Add to `shared/mcp/tools/index.test.ts` (or create if doesn't exist):

```typescript
import { describe, it, expect } from 'vitest';
import { registerTools } from './index.js';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';

describe('Tool Registration', () => {
  it('should register all tools including new ones', () => {
    const mockServer = {
      setRequestHandler: vi.fn(),
    } as unknown as Server;

    const config = {
      apiKey: 'fc-test-key',
      baseUrl: 'https://api.firecrawl.dev/v2',
    };

    registerTools(mockServer, config);

    // Verify ListToolsRequestSchema handler was set
    expect(mockServer.setRequestHandler).toHaveBeenCalled();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npm test -- tools/index.test.ts
```

Expected: May pass or fail depending on existing implementation. Proceed to next step.

**Step 3: Update tool registration**

Modify `shared/mcp/tools/index.ts`:

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { FirecrawlConfig } from '../../types.js';
import { createScrapeTool } from './scrape/index.js';
import { createSearchTool } from './search/index.js';
import { createMapTool } from './map/index.js';
import { createCrawlTool } from './crawl/index.js';

export function registerTools(server: Server, config: FirecrawlConfig): void {
  const tools = [
    createScrapeTool(config),
    createSearchTool(config),
    createMapTool(config),
    createCrawlTool(config),
  ];

  // Register ListTools handler
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map(({ name, description, inputSchema }) => ({
      name,
      description,
      inputSchema,
    })),
  }));

  // Register CallTool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = tools.find((t) => t.name === request.params.name);

    if (!tool) {
      throw new Error(`Unknown tool: ${request.params.name}`);
    }

    return await tool.handler(request.params.arguments);
  });
}
```

**Step 4: Run test to verify it passes**

```bash
npm test -- tools/index.test.ts
```

Expected: PASS

**Step 5: Update shared module exports**

Modify `shared/index.ts`:

```typescript
export { registerResources } from './mcp/resources/index.js';
export { registerTools } from './mcp/tools/index.js';

// Export types
export type { FirecrawlConfig } from './types.js';

// Export clients for testing
export { FirecrawlScrapingClient } from './clients/firecrawl-scraping.client.js';
export { FirecrawlSearchClient } from './clients/firecrawl-search.client.js';
export { FirecrawlMapClient } from './clients/firecrawl-map.client.js';
export { FirecrawlCrawlClient } from './clients/firecrawl-crawl.client.js';
```

**Step 6: Commit**

```bash
git add shared/mcp/tools/index.ts shared/index.ts
git commit -m "feat: register new search, map, and crawl tools

- Update tool registration to include all 3 new tools
- Export new clients from shared module
- Update ListTools and CallTool handlers
- Total of 4 tools now registered (scrape, search, map, crawl)"
```

---

## Task 13: Build and Integration Test

**Files:**

- Run build process
- Test integration with local and remote servers

**Step 1: Build shared module**

```bash
cd shared
npm run build
```

Expected: Build succeeds with no errors

**Step 2: Build local module**

```bash
cd ../local
npm run build
```

Expected: Build succeeds with no errors

**Step 3: Test local server manually**

```bash
cd ../local
npm start
```

In another terminal:

```bash
# Test that server starts and responds
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | npx @modelcontextprotocol/inspector
```

Expected: Response includes all 4 tools (scrape, search, map, crawl)

**Step 4: Build remote module**

```bash
cd ../remote
npm run build
```

Expected: Build succeeds with no errors

**Step 5: Commit**

```bash
git add -A
git commit -m "build: verify all modules build successfully

- Shared module builds with new clients and tools
- Local module integrates new tools
- Remote module builds with updated shared dependency"
```

---

## Task 14: Integration Tests for New Tools

**Files:**

- Create: `tests/integration/search.integration.test.ts`
- Create: `tests/integration/map.integration.test.ts`
- Create: `tests/integration/crawl.integration.test.ts`

**Step 1: Write search integration test**

Create `tests/integration/search.integration.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestMCPClient } from '../helpers/test-client.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

describe('Search Tool Integration', () => {
  let client: TestMCPClient;

  beforeAll(async () => {
    // Assumes FIRECRAWL_API_KEY is set in environment
    client = new TestMCPClient();
    await client.connect();
  });

  afterAll(async () => {
    await client.disconnect();
  });

  it('should perform basic web search', async () => {
    const result = await client.callTool('search', {
      query: 'firecrawl documentation',
      limit: 3,
    });

    expect(result.content).toBeDefined();
    expect(result.isError).toBe(false);
  }, 30000);

  it('should search with multiple sources', async () => {
    const result = await client.callTool('search', {
      query: 'web scraping',
      sources: ['web', 'news'],
      limit: 5,
    });

    expect(result.content).toBeDefined();
    expect(result.isError).toBe(false);
  }, 30000);
});
```

**Step 2: Write map integration test**

Create `tests/integration/map.integration.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestMCPClient } from '../helpers/test-client.js';

describe('Map Tool Integration', () => {
  let client: TestMCPClient;

  beforeAll(async () => {
    client = new TestMCPClient();
    await client.connect();
  });

  afterAll(async () => {
    await client.disconnect();
  });

  it('should discover URLs from website', async () => {
    const result = await client.callTool('map', {
      url: 'https://firecrawl.dev',
      limit: 50,
    });

    expect(result.content).toBeDefined();
    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain('Discovered');
  }, 30000);

  it('should filter URLs with search parameter', async () => {
    const result = await client.callTool('map', {
      url: 'https://firecrawl.dev',
      search: 'docs',
      limit: 20,
    });

    expect(result.content).toBeDefined();
    expect(result.isError).toBe(false);
  }, 30000);
});
```

**Step 3: Write crawl integration test**

Create `tests/integration/crawl.integration.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestMCPClient } from '../helpers/test-client.js';

describe('Crawl Tool Integration', () => {
  let client: TestMCPClient;
  let jobId: string;

  beforeAll(async () => {
    client = new TestMCPClient();
    await client.connect();
  });

  afterAll(async () => {
    await client.disconnect();
  });

  it('should start a crawl job', async () => {
    const result = await client.callTool('crawl', {
      url: 'https://firecrawl.dev',
      limit: 5,
    });

    expect(result.content).toBeDefined();
    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain('Job ID:');

    // Extract job ID for subsequent tests
    const match = result.content[0].text.match(/Job ID: ([^\n]+)/);
    if (match) {
      jobId = match[1];
    }
  }, 30000);

  it('should check crawl status', async () => {
    if (!jobId) {
      console.log('Skipping: No job ID from previous test');
      return;
    }

    // Wait a bit for crawl to progress
    await new Promise((resolve) => setTimeout(resolve, 5000));

    const result = await client.callTool('crawl', {
      jobId,
    });

    expect(result.content).toBeDefined();
    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain('Crawl Status:');
  }, 30000);

  it('should cancel a crawl job', async () => {
    if (!jobId) {
      console.log('Skipping: No job ID from previous test');
      return;
    }

    const result = await client.callTool('crawl', {
      jobId,
      cancel: true,
    });

    expect(result.content).toBeDefined();
    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain('cancelled');
  }, 30000);
});
```

**Step 4: Run integration tests**

```bash
cd tests
npm test -- integration/
```

Expected: Tests may be skipped if FIRECRAWL_API_KEY not set, otherwise should pass

**Step 5: Commit**

```bash
git add tests/integration/
git commit -m "test: add integration tests for new tools

- Add search tool integration tests
- Add map tool integration tests
- Add crawl tool integration tests (start, status, cancel via single tool)
- Tests verify real API interaction"
```

---

## Task 15: Manual Testing Scripts

**Files:**

- Create: `tests/manual/search.manual.test.ts`
- Create: `tests/manual/map.manual.test.ts`
- Create: `tests/manual/crawl.manual.test.ts`
- Update: `tests/manual/package.json` (add scripts)

**Step 1: Create manual search test**

Create `tests/manual/search.manual.test.ts`:

```typescript
import { FirecrawlSearchClient } from '../../shared/clients/firecrawl-search.client.js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '../../.env' });

async function testSearch() {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    console.error('❌ FIRECRAWL_API_KEY not set in .env');
    process.exit(1);
  }

  console.log('🔍 Testing Firecrawl Search...\n');

  const client = new FirecrawlSearchClient({
    apiKey,
    baseUrl: 'https://api.firecrawl.dev/v2',
  });

  try {
    // Test 1: Basic search
    console.log('Test 1: Basic web search');
    const result1 = await client.search({
      query: 'web scraping best practices',
      limit: 3,
    });
    console.log(
      `✅ Found ${Array.isArray(result1.data) ? result1.data.length : 'multi-source'} results`
    );
    console.log(`   Credits used: ${result1.creditsUsed}\n`);

    // Test 2: Multi-source search
    console.log('Test 2: Multi-source search');
    const result2 = await client.search({
      query: 'artificial intelligence',
      sources: ['web', 'news'],
      limit: 5,
    });
    console.log(`✅ Multi-source search completed`);
    console.log(`   Credits used: ${result2.creditsUsed}\n`);

    // Test 3: Search with scraping
    console.log('Test 3: Search with content scraping');
    const result3 = await client.search({
      query: 'firecrawl documentation',
      limit: 2,
      scrapeOptions: {
        formats: ['markdown'],
        onlyMainContent: true,
      },
    });
    console.log(`✅ Search with scraping completed`);
    console.log(`   Credits used: ${result3.creditsUsed}\n`);

    console.log('✅ All search tests passed!');
  } catch (error) {
    console.error('❌ Search test failed:', error);
    process.exit(1);
  }
}

testSearch();
```

**Step 2: Create manual map test**

Create `tests/manual/map.manual.test.ts`:

```typescript
import { FirecrawlMapClient } from '../../shared/clients/firecrawl-map.client.js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '../../.env' });

async function testMap() {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    console.error('❌ FIRECRAWL_API_KEY not set in .env');
    process.exit(1);
  }

  console.log('🗺️  Testing Firecrawl Map...\n');

  const client = new FirecrawlMapClient({
    apiKey,
    baseUrl: 'https://api.firecrawl.dev/v2',
  });

  try {
    // Test 1: Basic URL mapping
    console.log('Test 1: Basic URL discovery');
    const startTime = Date.now();
    const result1 = await client.map({
      url: 'https://firecrawl.dev',
      limit: 100,
    });
    const duration = Date.now() - startTime;
    console.log(`✅ Discovered ${result1.links.length} URLs in ${duration}ms\n`);

    // Test 2: Map with search filter
    console.log('Test 2: URL discovery with search filter');
    const result2 = await client.map({
      url: 'https://firecrawl.dev',
      search: 'docs',
      limit: 50,
    });
    console.log(`✅ Found ${result2.links.length} URLs matching "docs"\n`);

    // Test 3: Map with sitemap only
    console.log('Test 3: Sitemap-only discovery');
    const result3 = await client.map({
      url: 'https://firecrawl.dev',
      sitemap: 'only',
      limit: 50,
    });
    console.log(`✅ Found ${result3.links.length} URLs from sitemap\n`);

    console.log('✅ All map tests passed!');
  } catch (error) {
    console.error('❌ Map test failed:', error);
    process.exit(1);
  }
}

testMap();
```

**Step 3: Create manual crawl test**

Create `tests/manual/crawl.manual.test.ts`:

```typescript
import { FirecrawlCrawlClient } from '../../shared/clients/firecrawl-crawl.client.js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '../../.env' });

async function testCrawl() {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    console.error('❌ FIRECRAWL_API_KEY not set in .env');
    process.exit(1);
  }

  console.log('🕷️  Testing Firecrawl Crawl...\n');

  const client = new FirecrawlCrawlClient({
    apiKey,
    baseUrl: 'https://api.firecrawl.dev/v2',
  });

  try {
    // Test 1: Start crawl
    console.log('Test 1: Start crawl job');
    const startResult = await client.startCrawl({
      url: 'https://firecrawl.dev',
      limit: 5,
      scrapeOptions: {
        formats: ['markdown'],
        onlyMainContent: true,
      },
    });
    console.log(`✅ Crawl job started: ${startResult.id}\n`);

    const jobId = startResult.id;

    // Test 2: Check status (poll until complete or max attempts)
    console.log('Test 2: Monitor crawl progress');
    let attempts = 0;
    const maxAttempts = 20;
    let statusResult;

    while (attempts < maxAttempts) {
      statusResult = await client.getStatus(jobId);
      console.log(
        `   Status: ${statusResult.status}, Progress: ${statusResult.completed}/${statusResult.total}`
      );

      if (statusResult.status === 'completed' || statusResult.status === 'failed') {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 3000));
      attempts++;
    }

    if (statusResult?.status === 'completed') {
      console.log(`✅ Crawl completed! Crawled ${statusResult.completed} pages\n`);
    } else if (statusResult?.status === 'failed') {
      console.log(`❌ Crawl failed\n`);
    } else {
      console.log(`⚠️  Crawl still in progress, cancelling...\n`);

      // Test 3: Cancel crawl
      const cancelResult = await client.cancel(jobId);
      console.log(`✅ Crawl cancelled: ${cancelResult.status}\n`);
    }

    console.log('✅ All crawl tests completed!');
  } catch (error) {
    console.error('❌ Crawl test failed:', error);
    process.exit(1);
  }
}

testCrawl();
```

**Step 4: Update manual test scripts**

Add to `tests/manual/package.json` scripts:

```json
{
  "scripts": {
    "test:search": "tsx search.manual.test.ts",
    "test:map": "tsx map.manual.test.ts",
    "test:crawl": "tsx crawl.manual.test.ts",
    "test:all-new": "npm run test:search && npm run test:map && npm run test:crawl"
  }
}
```

**Step 5: Commit**

```bash
git add tests/manual/
git commit -m "test: add manual tests for new tools

- Add manual search test with multiple scenarios
- Add manual map test with filtering options
- Add manual crawl test with job lifecycle
- Add npm scripts for easy execution"
```

---

## Task 16: Documentation Updates

**Files:**

- Update: `README.md`
- Create: `docs/tools/SEARCH.md`
- Create: `docs/tools/MAP.md`
- Create: `docs/tools/CRAWL.md`
- Update: `CHANGELOG.md`

**Step 1: Update README with new tools**

Update `README.md` to include new tools in the features section:

```markdown
## Tools

Pulse Fetch provides the following MCP tools:

### `scrape`

Fetch and scrape web content using Firecrawl with intelligent fallback strategies.

### `search`

Search the web using Firecrawl with optional content scraping. Supports web, image, and news search with category filtering (GitHub, research papers, PDFs).

**Parameters:**

- `query` (required): Search term
- `limit` (optional): Number of results (1-100, default: 5)
- `sources` (optional): Result types - `["web", "images", "news"]`
- `categories` (optional): Filters - `["github", "research", "pdf"]`
- `scrapeOptions` (optional): Enable content extraction for results

### `map`

Discover URLs from a website rapidly (8x faster than crawling). Perfect for generating sitemaps or finding links before targeted scraping.

**Parameters:**

- `url` (required): Website to map
- `search` (optional): Filter URLs by keyword
- `limit` (optional): Max URLs (1-100,000, default: 5,000)
- `sitemap` (optional): Sitemap handling - `"skip"`, `"include"`, `"only"`

### `crawl`

Manage recursive website crawling jobs. Single tool handles start, status, and cancel operations.

**Start a crawl:**

- `url` (required): Starting URL
- `limit` (optional): Max pages (default: 100)
- `maxDepth` (optional): Link traversal depth
- `includePaths`/`excludePaths` (optional): Path filters

**Check status:**

- `jobId` (required): Job ID to check

**Cancel crawl:**

- `jobId` (required): Job ID to cancel
- `cancel` (required): Set to `true`
```

**Step 2: Create search documentation**

Create `docs/tools/SEARCH.md`:

````markdown
# Search Tool

The `search` tool enables web searching with optional content scraping using Firecrawl's search API.

## Features

- **Multi-source search**: Web, images, and news
- **Category filtering**: GitHub repositories, research papers, PDFs
- **Content scraping**: Optionally scrape full content of search results
- **Geographic targeting**: Country and language preferences

## Usage

### Basic Search

```json
{
  "query": "web scraping best practices",
  "limit": 10
}
```
````

### Multi-Source Search

```json
{
  "query": "machine learning",
  "sources": ["web", "news"],
  "limit": 5
}
```

### Search with Content Scraping

```json
{
  "query": "firecrawl documentation",
  "limit": 3,
  "scrapeOptions": {
    "formats": ["markdown", "html"],
    "onlyMainContent": true
  }
}
```

### Category-Filtered Search

```json
{
  "query": "web scraping library",
  "categories": ["github"],
  "limit": 10
}
```

## Parameters

See inline documentation for complete parameter reference.

## Response Format

Returns search results as MCP resources with metadata including credits used.

## Rate Limits

- Base cost: 2 credits per 10 results (without scraping)
- Additional credits for content scraping based on formats requested
- See Firecrawl pricing documentation for details

````

**Step 3: Create map documentation**

Create `docs/tools/MAP.md`:

```markdown
# Map Tool

The `map` tool rapidly discovers URLs from a website, providing fast sitemap generation and link discovery.

## Features

- **High performance**: 8x faster than crawling for URL discovery
- **Search filtering**: Find URLs containing specific keywords
- **Sitemap integration**: Use, skip, or exclusively use sitemaps
- **Subdomain handling**: Include or exclude subdomains
- **Large scale**: Support for up to 100,000 URLs per request

## Usage

### Basic URL Discovery

```json
{
  "url": "https://example.com",
  "limit": 100
}
````

### Filtered Discovery

```json
{
  "url": "https://example.com",
  "search": "documentation",
  "limit": 50
}
```

### Sitemap-Only Discovery

```json
{
  "url": "https://example.com",
  "sitemap": "only",
  "limit": 1000
}
```

## Performance

Typical performance: ~1.4 seconds to discover 1,200+ links

Use `map` when you need:

- Quick website structure overview
- URL discovery before selective scraping
- Sitemap generation
- Link validation

## Response Format

Returns array of discovered URLs with optional titles and descriptions.

````

**Step 4: Create crawl documentation**

Create `docs/tools/CRAWL.md`:

```markdown
# Crawl Tool

The `crawl` tool enables recursive website crawling with progress tracking and job management. A single consolidated tool handles start, status, and cancel operations.

## Operations

### Start a Crawl
Provide `url` parameter to initiate a crawl job. Returns a job ID for tracking.

### Check Status
Provide `jobId` parameter to check progress and retrieve results.

### Cancel Crawl
Provide `jobId` + `cancel: true` to cancel an in-progress job.

## Workflow

````

1. crawl({ url: "..." }) → returns jobId
2. crawl({ jobId: "..." }) → check progress (poll until complete)
3. Retrieve results from completed job

````

## Usage Examples

### Start a Crawl

```json
{
  "url": "https://example.com",
  "limit": 50,
  "scrapeOptions": {
    "formats": ["markdown"],
    "onlyMainContent": true
  }
}
````

### Check Status

```json
{
  "jobId": "crawl-job-123"
}
```

### Cancel Crawl

```json
{
  "jobId": "crawl-job-123",
  "cancel": true
}
```

## Advanced Options

- **Path filtering**: Use `includePaths` and `excludePaths` with regex
- **Depth control**: Set `maxDepth` to limit link traversal
- **Domain scope**: Control with `crawlEntireDomain` and `allowSubdomains`
- **Rate limiting**: Use `delay` between requests

## Performance Considerations

- Default limit: 10,000 pages (configurable up to 100,000)
- Results paginated if > 10MB
- Job results expire after time specified in response
- Credits consumed based on pages crawled and formats requested

````

**Step 5: Update CHANGELOG**

Update `CHANGELOG.md`:

```markdown
## [Unreleased]

### Added
- **Search tool**: Web search with multi-source support (web, images, news)
- **Map tool**: Fast URL discovery (8x faster than crawling)
- **Crawl tool**: Consolidated recursive website crawling with job management
  - Start crawl with `url` parameter
  - Check status with `jobId` parameter
  - Cancel with `jobId` + `cancel: true`
- New client classes: `FirecrawlSearchClient`, `FirecrawlMapClient`, `FirecrawlCrawlClient`
- Comprehensive test coverage for all new tools
- Manual testing scripts for each tool
- Complete documentation for new features

### Changed
- Extended tool registration to support 4 total tools (was 1)
- Updated shared module exports to include new clients
- Consolidated crawl operations into single tool to reduce token usage
````

**Step 6: Commit**

```bash
git add README.md docs/tools/ CHANGELOG.md
git commit -m "docs: add documentation for new tools

- Update README with search, map, and crawl tools
- Add detailed tool documentation in docs/tools/
- Update CHANGELOG with new features
- Include usage examples and best practices"
```

---

## Task 17: Final Verification and Cleanup

**Files:**

- Run full test suite
- Verify builds
- Test end-to-end

**Step 1: Run all tests**

```bash
npm test
```

Expected: All tests pass

**Step 2: Build all modules**

```bash
cd shared && npm run build && cd ../local && npm run build && cd ../remote && npm run build && cd ..
```

Expected: All builds succeed

**Step 3: Test with MCP Inspector (if available)**

```bash
cd local
npm start
```

In another terminal:

```bash
npx @modelcontextprotocol/inspector
```

Test each tool manually through the inspector.

**Step 4: Run manual tests**

```bash
cd tests/manual
npm run test:all-new
```

Expected: All manual tests pass (requires valid FIRECRAWL_API_KEY)

**Step 5: Final commit**

```bash
git add -A
git commit -m "chore: final verification of new tools implementation

- All tests passing
- All modules building successfully
- Manual tests verified with real API
- Ready for review"
```

---

## Summary

This implementation plan adds three major features to Pulse Fetch:

1. **Search Tool** - Web search with multi-source support and content scraping
2. **Map Tool** - Fast URL discovery for sitemap generation and link finding
3. **Crawl Tool** - Consolidated recursive website crawling with job management (single tool handles start, status, cancel)

**Total: 3 new tools added (4 tools total including existing scrape)**

### Key Achievements

- ✅ Full TDD approach with RED-GREEN-REFACTOR cycle
- ✅ Comprehensive test coverage (unit, integration, manual)
- ✅ Following existing architectural patterns
- ✅ Complete documentation
- ✅ Type-safe implementation with Zod schemas
- ✅ Error handling and diagnostics
- ✅ MCP protocol compliance

### File Structure Created

```
shared/
├── clients/
│   ├── firecrawl-search.client.ts
│   ├── firecrawl-map.client.ts
│   └── firecrawl-crawl.client.ts
├── mcp/tools/
│   ├── search/ (schema, pipeline, response, index)
│   ├── map/ (schema, pipeline, response, index)
│   └── crawl/ (schema, pipeline, response, index)
tests/
├── integration/ (3 new test files)
└── manual/ (3 new test files)
docs/tools/ (3 new documentation files)
```

### Credits Used

All tools reuse the existing `FIRECRAWL_API_KEY` environment variable. No additional configuration required.

---

## Plan Execution Options

Plan complete and saved to `docs/plans/2025-11-06-firecrawl-search-map-crawl-tools.md`.

**Two execution options:**

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
