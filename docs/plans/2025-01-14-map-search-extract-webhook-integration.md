# Map/Search/Extract Tools Webhook Integration Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor map and search tools to use WebhookBridgeClient (like scrape/crawl tools) and create new extract tool for structured data extraction.

**Architecture:** Replace direct SDK client instantiation with dependency injection pattern. Map, search, and extract tools will receive clients from factory, routing all operations through webhook bridge at `http://pulse_webhook:52100` for automatic session tracking and indexing.

**Tech Stack:** TypeScript, @firecrawl/client types, WebhookBridgeClient, MCP SDK, Zod schemas

---

## Context

**Current State:**
- Scrape/crawl tools use `WebhookBridgeClient` via dependency injection ✅
- Map/search tools instantiate `FirecrawlMapClient`/`FirecrawlSearchClient` directly ❌
- Extract tool doesn't exist yet ❌
- Webhook bridge has all proxy endpoints ready (`/v2/map`, `/v2/search`, `/v2/extract`) ✅

**Goal State:**
- All tools use WebhookBridgeClient for unified session tracking
- Extract tool available in MCP for structured data extraction
- Zero direct Firecrawl SDK instantiation

---

## Task 1: Add map() and search() methods to WebhookBridgeClient

**Files:**
- Modify: `apps/mcp/server.ts:137-426` (WebhookBridgeClient class)
- Reference: `apps/mcp/tools/map/pipeline.ts:1-37` (MapOptions types)
- Reference: `apps/mcp/tools/search/pipeline.ts:1-27` (SearchOptions types)

**Step 1: Add imports for map/search types**

Update imports section in `apps/mcp/server.ts` (add to existing type imports around line 17-28):

```typescript
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
  MapOptions as FirecrawlMapOptions,    // ADD THIS
  MapResult,                              // ADD THIS
  SearchOptions as FirecrawlSearchOptions, // ADD THIS
  SearchResult,                           // ADD THIS
} from "@firecrawl/client";
```

**Step 2: Add map() and search() to IFirecrawlClient interface**

In `apps/mcp/server.ts`, extend the `IFirecrawlClient` interface (around line 68-74):

```typescript
export interface IFirecrawlClient {
  scrape(url: string, options?: Record<string, unknown>): Promise<{...}>;
  batchScrape?: (options: BatchScrapeOptions) => Promise<BatchScrapeStartResult>;
  getBatchScrapeStatus?: (jobId: string) => Promise<CrawlStatusResult>;
  cancelBatchScrape?: (jobId: string) => Promise<BatchScrapeCancelResult>;
  getBatchScrapeErrors?: (jobId: string) => Promise<CrawlErrorsResult>;

  // Crawl operations
  startCrawl?: (options: FirecrawlCrawlOptions) => Promise<StartCrawlResult>;
  getCrawlStatus?: (jobId: string) => Promise<CrawlStatusResult>;
  cancelCrawl?: (jobId: string) => Promise<CancelResult>;
  getCrawlErrors?: (jobId: string) => Promise<CrawlErrorsResult>;
  listActiveCrawls?: () => Promise<ActiveCrawlsResult>;

  // Map and search operations - ADD THESE
  map?: (options: FirecrawlMapOptions) => Promise<MapResult>;
  search?: (options: FirecrawlSearchOptions) => Promise<SearchResult>;
}
```

**Step 3: Implement map() method in WebhookBridgeClient**

Add to `WebhookBridgeClient` class in `apps/mcp/server.ts` (after crawl methods, around line 415):

```typescript
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
```

**Step 4: Implement search() method in WebhookBridgeClient**

Add to `WebhookBridgeClient` class in `apps/mcp/server.ts` (after map method):

```typescript
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
```

**Step 5: Run type check**

```bash
cd apps/mcp
pnpm typecheck
```

Expected: No errors (types should match SDK interfaces)

**Step 6: Commit**

```bash
git add apps/mcp/server.ts
git commit -m "feat(mcp): add map/search methods to WebhookBridgeClient

- Add MapOptions, MapResult, SearchOptions, SearchResult type imports
- Extend IFirecrawlClient interface with map() and search() methods
- Implement map() and search() in WebhookBridgeClient
- Both methods route to webhook bridge at /v2/map and /v2/search"
```

---

## Task 2: Refactor map tool to use client factory

**Files:**
- Modify: `apps/mcp/tools/map/index.ts:1-44`
- Reference: `apps/mcp/tools/scrape/handler.ts:1-100` (factory pattern example)

**Step 1: Update map tool to accept client from factory**

Replace the entire `createMapTool` function in `apps/mcp/tools/map/index.ts`:

```typescript
import type { IScrapingClients } from "../../types.js";  // ADD THIS
import { mapOptionsSchema, buildMapInputSchema } from "./schema.js";
import { mapPipeline } from "./pipeline.js";
import { formatMapResponse } from "./response.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

export function createMapTool(clients: IScrapingClients): Tool {  // CHANGE PARAM
  return {
    name: "map",
    description:
      "Discover URLs from a website using Firecrawl. Fast URL discovery (8x faster than crawl) with optional search filtering, sitemap integration, and subdomain handling. " +
      "Supports pagination for large result sets. Use startIndex and maxResults to retrieve results in chunks. " +
      'Default returns 200 URLs per request (≈13k tokens, under 15k token budget). Set resultHandling to "saveOnly" for token-efficient responses.',
    inputSchema: buildMapInputSchema(),

    handler: async (args: unknown) => {
      try {
        const validatedArgs = mapOptionsSchema.parse(args);

        // Get map client from injected clients
        const mapClient = clients.firecrawl;
        if (!mapClient || typeof mapClient.map !== "function") {
          throw new Error("Map operation not supported by Firecrawl client");
        }

        const result = await mapPipeline(mapClient, validatedArgs);
        return formatMapResponse(
          result,
          validatedArgs.url,
          validatedArgs.startIndex,
          validatedArgs.maxResults,
          validatedArgs.resultHandling,
        );
      } catch (error) {
        return {
          content: [
            {
              type: "text",
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

**Step 2: Update map pipeline to accept generic client**

Replace type imports in `apps/mcp/tools/map/pipeline.ts`:

```typescript
import type {
  MapOptions as ClientMapOptions,
  MapResult,
} from "@firecrawl/client";
import type { MapOptions } from "./schema.js";

// CHANGE: Accept any client with map() method instead of FirecrawlMapClient
export async function mapPipeline(
  client: { map: (options: ClientMapOptions) => Promise<MapResult> },
  options: MapOptions,
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

  console.log(
    "[DEBUG] Map pipeline options:",
    JSON.stringify(clientOptions, null, 2),
  );
  const result = await client.map(clientOptions);
  console.log(
    "[DEBUG] Map pipeline result:",
    JSON.stringify(
      { success: result.success, linksCount: result.links?.length || 0 },
      null,
      2,
    ),
  );
  return result;
}
```

**Step 3: Run type check**

```bash
cd apps/mcp
pnpm typecheck
```

Expected: No errors

**Step 4: Commit**

```bash
git add apps/mcp/tools/map/index.ts apps/mcp/tools/map/pipeline.ts
git commit -m "refactor(mcp): map tool uses client factory pattern

- Change createMapTool to accept IScrapingClients instead of FirecrawlConfig
- Get map client from injected clients.firecrawl
- Update mapPipeline to accept generic client with map() method
- Remove direct FirecrawlMapClient instantiation"
```

---

## Task 3: Refactor search tool to use client factory

**Files:**
- Modify: `apps/mcp/tools/search/index.ts:1-36`
- Modify: `apps/mcp/tools/search/pipeline.ts:1-27`

**Step 1: Update search tool to accept client from factory**

Replace the entire `createSearchTool` function in `apps/mcp/tools/search/index.ts`:

```typescript
import type { IScrapingClients } from "../../types.js";  // ADD THIS
import { searchOptionsSchema, buildSearchInputSchema } from "./schema.js";
import { searchPipeline } from "./pipeline.js";
import { formatSearchResponse } from "./response.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

export function createSearchTool(clients: IScrapingClients): Tool {  // CHANGE PARAM
  return {
    name: "search",
    description:
      "Search the web using Firecrawl with optional content scraping. Supports web, image, and news search with filtering by category (GitHub, research papers, PDFs).",
    inputSchema: buildSearchInputSchema(),

    handler: async (args: unknown) => {
      try {
        const validatedArgs = searchOptionsSchema.parse(args);

        // Get search client from injected clients
        const searchClient = clients.firecrawl;
        if (!searchClient || typeof searchClient.search !== "function") {
          throw new Error("Search operation not supported by Firecrawl client");
        }

        const result = await searchPipeline(searchClient, validatedArgs);
        return formatSearchResponse(result, validatedArgs.query);
      } catch (error) {
        return {
          content: [
            {
              type: "text",
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

**Step 2: Update search pipeline to accept generic client**

Replace type imports in `apps/mcp/tools/search/pipeline.ts`:

```typescript
import type {
  SearchOptions as ClientSearchOptions,
  SearchResult,
} from "@firecrawl/client";
import type { SearchOptions } from "./schema.js";

// CHANGE: Accept any client with search() method instead of FirecrawlSearchClient
export async function searchPipeline(
  client: { search: (options: ClientSearchOptions) => Promise<SearchResult> },
  options: SearchOptions,
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
    tbs: options.tbs,
    scrapeOptions: options.scrapeOptions,
  };

  return await client.search(clientOptions);
}
```

**Step 3: Run type check**

```bash
cd apps/mcp
pnpm typecheck
```

Expected: No errors

**Step 4: Commit**

```bash
git add apps/mcp/tools/search/index.ts apps/mcp/tools/search/pipeline.ts
git commit -m "refactor(mcp): search tool uses client factory pattern

- Change createSearchTool to accept IScrapingClients instead of FirecrawlConfig
- Get search client from injected clients.firecrawl
- Update searchPipeline to accept generic client with search() method
- Remove direct FirecrawlSearchClient instantiation"
```

---

## Task 4: Update tool registration to pass clients to map/search

**Files:**
- Modify: `apps/mcp/tools/registration.ts:65-90`

**Step 1: Update map and search tool registration**

Find the tool registration section in `apps/mcp/tools/registration.ts` (around line 70-90) and update:

```typescript
// Map tool
const mapTool = factory(
  "map",
  () => createMapTool(clients),  // CHANGE: Pass clients instead of config
  "URL discovery and sitemap exploration",
);
if (mapTool) tools.push(mapTool);

// Search tool
const searchTool = factory(
  "search",
  () => createSearchTool(clients),  // CHANGE: Pass clients instead of config
  "Web search with content scraping",
);
if (searchTool) tools.push(searchTool);
```

**Step 2: Run type check**

```bash
cd apps/mcp
pnpm typecheck
```

Expected: No errors

**Step 3: Commit**

```bash
git add apps/mcp/tools/registration.ts
git commit -m "fix(mcp): pass clients to map/search tool factories

- Update createMapTool call to pass clients instead of config
- Update createSearchTool call to pass clients instead of config
- Completes refactoring to use dependency injection pattern"
```

---

## Task 5: Create extract tool schema

**Files:**
- Create: `apps/mcp/tools/extract/schema.ts`
- Reference: `apps/mcp/tools/map/schema.ts` (similar pattern)

**Step 1: Create extract schema file**

Create `apps/mcp/tools/extract/schema.ts`:

```typescript
import { z } from "zod";

/**
 * Schema for extract tool options
 */
export const extractOptionsSchema = z.object({
  urls: z
    .array(z.string().url())
    .min(1)
    .describe("URLs to extract structured data from"),

  prompt: z
    .string()
    .optional()
    .describe("Natural language prompt describing what data to extract"),

  schema: z
    .record(z.unknown())
    .optional()
    .describe("JSON schema defining the structure of data to extract"),

  scrapeOptions: z
    .object({
      formats: z.array(z.string()).optional(),
      onlyMainContent: z.boolean().optional(),
      includeTags: z.array(z.string()).optional(),
      excludeTags: z.array(z.string()).optional(),
      waitFor: z.number().optional(),
    })
    .optional()
    .describe("Options for scraping before extraction"),

  timeout: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Request timeout in milliseconds"),
});

export type ExtractOptions = z.infer<typeof extractOptionsSchema>;

/**
 * Build JSON schema for extract tool input
 */
export function buildExtractInputSchema() {
  return {
    type: "object",
    properties: {
      urls: {
        type: "array",
        items: { type: "string", format: "uri" },
        minItems: 1,
        description: "URLs to extract structured data from",
      },
      prompt: {
        type: "string",
        description: "Natural language prompt describing what data to extract",
      },
      schema: {
        type: "object",
        description: "JSON schema defining the structure of data to extract",
      },
      scrapeOptions: {
        type: "object",
        properties: {
          formats: { type: "array", items: { type: "string" } },
          onlyMainContent: { type: "boolean" },
          includeTags: { type: "array", items: { type: "string" } },
          excludeTags: { type: "array", items: { type: "string" } },
          waitFor: { type: "number" },
        },
        description: "Options for scraping before extraction",
      },
      timeout: {
        type: "number",
        description: "Request timeout in milliseconds",
      },
    },
    required: ["urls"],
  } as const;
}
```

**Step 2: Run type check**

```bash
cd apps/mcp
pnpm typecheck
```

Expected: No errors

**Step 3: Commit**

```bash
git add apps/mcp/tools/extract/schema.ts
git commit -m "feat(mcp): add extract tool schema

- Define ExtractOptions Zod schema with urls, prompt, schema, scrapeOptions
- Support both prompt-based and schema-based extraction
- Build JSON schema for MCP tool input validation"
```

---

## Task 6: Create extract tool pipeline

**Files:**
- Create: `apps/mcp/tools/extract/pipeline.ts`
- Reference: `apps/mcp/tools/search/pipeline.ts` (similar pattern)

**Step 1: Create extract pipeline file**

Create `apps/mcp/tools/extract/pipeline.ts`:

```typescript
import type {
  ExtractOptions as ClientExtractOptions,
  ExtractResult,
} from "@firecrawl/client";
import type { ExtractOptions } from "./schema.js";

/**
 * Execute extract operation using Firecrawl client
 */
export async function extractPipeline(
  client: { extract: (options: ClientExtractOptions) => Promise<ExtractResult> },
  options: ExtractOptions,
): Promise<ExtractResult> {
  const clientOptions: ClientExtractOptions = {
    urls: options.urls,
    prompt: options.prompt,
    schema: options.schema,
    timeout: options.timeout,
  };

  // Add scrapeOptions if provided
  if (options.scrapeOptions) {
    clientOptions.scrapeOptions = options.scrapeOptions;
  }

  console.log(
    "[DEBUG] Extract pipeline options:",
    JSON.stringify(
      { ...clientOptions, schema: clientOptions.schema ? "provided" : "none" },
      null,
      2,
    ),
  );

  const result = await client.extract(clientOptions);

  console.log(
    "[DEBUG] Extract pipeline result:",
    JSON.stringify(
      {
        success: result.success,
        dataCount: result.data?.length || 0,
      },
      null,
      2,
    ),
  );

  return result;
}
```

**Step 2: Run type check**

```bash
cd apps/mcp
pnpm typecheck
```

Expected: Type error - `ExtractOptions` and `ExtractResult` not exported from `@firecrawl/client`

**Step 3: Add extract types to @firecrawl/client package**

Check if `packages/firecrawl-client/src/index.ts` exports extract types. If not, this is expected - the Firecrawl SDK might not have extract types yet. For now, define them inline in pipeline.ts:

```typescript
// Define extract types inline (Firecrawl SDK may not have these yet)
export interface ExtractResult {
  success: boolean;
  data?: Array<Record<string, unknown>>;
  error?: string;
}

interface ClientExtractOptions {
  urls: string[];
  prompt?: string;
  schema?: Record<string, unknown>;
  scrapeOptions?: {
    formats?: string[];
    onlyMainContent?: boolean;
    includeTags?: string[];
    excludeTags?: string[];
    waitFor?: number;
  };
  timeout?: number;
}

/**
 * Execute extract operation using Firecrawl client
 */
export async function extractPipeline(
  client: { extract: (options: ClientExtractOptions) => Promise<ExtractResult> },
  options: ExtractOptions,
): Promise<ExtractResult> {
  // ... rest of implementation
}
```

**Step 4: Commit**

```bash
git add apps/mcp/tools/extract/pipeline.ts
git commit -m "feat(mcp): add extract tool pipeline

- Define ExtractResult and ClientExtractOptions types inline
- Implement extractPipeline to call client.extract()
- Add debug logging for options and results
- Support both prompt-based and schema-based extraction"
```

---

## Task 7: Create extract tool response formatter

**Files:**
- Create: `apps/mcp/tools/extract/response.ts`
- Reference: `apps/mcp/tools/search/response.ts` (similar pattern)

**Step 1: Create extract response formatter**

Create `apps/mcp/tools/extract/response.ts`:

```typescript
import type { ExtractResult } from "./pipeline.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

/**
 * Format extract result for MCP response
 */
export function formatExtractResponse(
  result: ExtractResult,
  urls: string[],
): CallToolResult {
  if (!result.success || !result.data) {
    return {
      content: [
        {
          type: "text",
          text: `Extract failed: ${result.error || "No data extracted"}`,
        },
      ],
      isError: true,
    };
  }

  // Format extracted data as JSON
  const formattedData = JSON.stringify(result.data, null, 2);

  return {
    content: [
      {
        type: "text",
        text: `# Extracted Data from ${urls.length} URL(s)\n\n\`\`\`json\n${formattedData}\n\`\`\`\n\n**Extracted:** ${result.data.length} items`,
      },
    ],
  };
}
```

**Step 2: Run type check**

```bash
cd apps/mcp
pnpm typecheck
```

Expected: No errors

**Step 3: Commit**

```bash
git add apps/mcp/tools/extract/response.ts
git commit -m "feat(mcp): add extract tool response formatter

- Format extracted data as JSON code block
- Show count of extracted items
- Handle errors gracefully"
```

---

## Task 8: Create extract tool main file

**Files:**
- Create: `apps/mcp/tools/extract/index.ts`
- Reference: `apps/mcp/tools/search/index.ts` (similar pattern)

**Step 1: Create extract tool main file**

Create `apps/mcp/tools/extract/index.ts`:

```typescript
import type { IScrapingClients } from "../../types.js";
import { extractOptionsSchema, buildExtractInputSchema } from "./schema.js";
import { extractPipeline } from "./pipeline.js";
import { formatExtractResponse } from "./response.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

export function createExtractTool(clients: IScrapingClients): Tool {
  return {
    name: "extract",
    description:
      "Extract structured data from web pages using Firecrawl. " +
      "Provide a natural language prompt describing what to extract, or a JSON schema for the desired structure. " +
      "Supports extraction from multiple URLs in a single request.",
    inputSchema: buildExtractInputSchema(),

    handler: async (args: unknown) => {
      try {
        const validatedArgs = extractOptionsSchema.parse(args);

        // Get extract client from injected clients
        const extractClient = clients.firecrawl;
        if (!extractClient || typeof extractClient.extract !== "function") {
          throw new Error("Extract operation not supported by Firecrawl client");
        }

        const result = await extractPipeline(extractClient, validatedArgs);
        return formatExtractResponse(result, validatedArgs.urls);
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Extract error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  };
}
```

**Step 2: Run type check**

```bash
cd apps/mcp
pnpm typecheck
```

Expected: No errors

**Step 3: Commit**

```bash
git add apps/mcp/tools/extract/index.ts
git commit -m "feat(mcp): add extract tool implementation

- Create extract tool that accepts IScrapingClients
- Validate options with Zod schema
- Call extractPipeline and format response
- Handle errors gracefully"
```

---

## Task 9: Add extract() method to WebhookBridgeClient

**Files:**
- Modify: `apps/mcp/server.ts:17-28` (imports)
- Modify: `apps/mcp/server.ts:68-74` (IFirecrawlClient interface)
- Modify: `apps/mcp/server.ts:400-420` (WebhookBridgeClient implementation)

**Step 1: Add extract type imports**

Update imports in `apps/mcp/server.ts`:

```typescript
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
  // Note: ExtractOptions/ExtractResult defined in tools/extract/pipeline.ts
  // since SDK may not have them yet
} from "@firecrawl/client";
```

**Step 2: Add extract() to IFirecrawlClient interface**

```typescript
export interface IFirecrawlClient {
  // ... existing methods ...

  // Map and search operations
  map?: (options: FirecrawlMapOptions) => Promise<MapResult>;
  search?: (options: FirecrawlSearchOptions) => Promise<SearchResult>;

  // Extract operation - ADD THIS
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
```

**Step 3: Implement extract() in WebhookBridgeClient**

Add to `WebhookBridgeClient` class (after search method):

```typescript
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
```

**Step 4: Run type check**

```bash
cd apps/mcp
pnpm typecheck
```

Expected: No errors

**Step 5: Commit**

```bash
git add apps/mcp/server.ts
git commit -m "feat(mcp): add extract() method to WebhookBridgeClient

- Add extract() to IFirecrawlClient interface
- Implement extract() in WebhookBridgeClient
- Route to webhook bridge at /v2/extract
- Support prompt-based and schema-based extraction"
```

---

## Task 10: Register extract tool in tool registration

**Files:**
- Modify: `apps/mcp/tools/registration.ts:1-150`

**Step 1: Import extract tool**

Add import at top of `apps/mcp/tools/registration.ts`:

```typescript
import { createExtractTool } from "./extract/index.js";  // ADD THIS
```

**Step 2: Register extract tool**

Add to tool registration section (after search tool, around line 95):

```typescript
// Extract tool
const extractTool = factory(
  "extract",
  () => createExtractTool(clients),
  "Structured data extraction from web pages",
);
if (extractTool) tools.push(extractTool);
```

**Step 3: Run type check**

```bash
cd apps/mcp
pnpm typecheck
```

Expected: No errors

**Step 4: Commit**

```bash
git add apps/mcp/tools/registration.ts
git commit -m "feat(mcp): register extract tool

- Import createExtractTool
- Add extract tool to registration with factory pattern
- Tool now available in MCP server"
```

---

## Task 11: Update registration test expectations

**Files:**
- Modify: `apps/mcp/tools/registration.test.ts:98-150`

**Step 1: Update test expectations for 7 tools**

Find test expectations in `apps/mcp/tools/registration.test.ts` and update counts:

```typescript
it("should record successful tool registrations", async () => {
  // ... setup ...

  const tools = registrationTracker.getToolRegistrations();
  expect(tools.length).toBe(7);  // CHANGE: 6 → 7 (added extract)
  expect(tools.every((t) => t.success)).toBe(true);
});

it("should record all tool names correctly", async () => {
  // ... setup ...

  const tools = registrationTracker.getToolRegistrations();
  const toolNames = tools.map((t) => t.name);

  expect(toolNames).toContain("scrape");
  expect(toolNames).toContain("search");
  expect(toolNames).toContain("map");
  expect(toolNames).toContain("crawl");
  expect(toolNames).toContain("query");
  expect(toolNames).toContain("profile_crawl");
  expect(toolNames).toContain("extract");  // ADD THIS
});

it("should continue registration if one tool fails", async () => {
  // ... setup ...

  const tools = registrationTracker.getToolRegistrations();

  // Should have exactly 7 tool registration attempts  // CHANGE: 6 → 7
  expect(tools.length).toBe(7);

  // ... rest of test ...
});
```

**Step 2: Run tests**

```bash
cd apps/mcp
pnpm test tools/registration.test.ts
```

Expected: All registration tests pass

**Step 3: Commit**

```bash
git add apps/mcp/tools/registration.test.ts
git commit -m "test(mcp): update registration tests for extract tool

- Update tool count expectations from 6 to 7
- Add extract to expected tool names
- All registration tests passing"
```

---

## Task 12: Run full test suite

**Files:**
- None (validation step)

**Step 1: Run all MCP tests**

```bash
cd apps/mcp
pnpm test
```

Expected:
- All new tests pass
- Extract tool available and functional
- Map/search tools route through WebhookBridgeClient
- Pre-existing 8 test failures remain (unrelated)

**Step 2: Run type check**

```bash
cd apps/mcp
pnpm typecheck
```

Expected: No type errors

**Step 3: Build MCP server**

```bash
cd apps/mcp
pnpm build
```

Expected: Build succeeds with no errors

---

## Task 13: End-to-end verification

**Files:**
- None (manual testing)

**Step 1: Start services**

```bash
pnpm services:up
```

Wait for all services to be healthy.

**Step 2: Verify webhook bridge is running**

```bash
docker logs pulse_webhook --tail 20
```

Expected: "Uvicorn running on http://0.0.0.0:52100"

**Step 3: Verify MCP server starts**

```bash
docker logs pulse_mcp --tail 20
```

Expected: MCP server running, tools registered including extract

**Step 4: Test map tool through MCP**

Use MCP inspector or Claude to call map tool:

```json
{
  "url": "https://example.com",
  "limit": 10
}
```

Expected: Returns list of URLs, webhook bridge creates crawl_session

**Step 5: Test search tool through MCP**

```json
{
  "query": "firecrawl web scraping",
  "limit": 5
}
```

Expected: Returns search results, webhook bridge creates crawl_session

**Step 6: Test extract tool through MCP**

```json
{
  "urls": ["https://example.com"],
  "prompt": "Extract the main heading and description"
}
```

Expected: Returns extracted structured data

**Step 7: Verify crawl_sessions created**

```bash
docker exec pulse_postgres psql -U firecrawl -d pulse_postgres -c "SELECT job_id, operation_type, base_url FROM webhook.crawl_sessions ORDER BY created_at DESC LIMIT 5;"
```

Expected: See map, search, extract sessions created automatically

**Step 8: Final commit**

```bash
git add .
git commit -m "feat(mcp): complete map/search/extract webhook integration

Summary:
- Refactored map and search tools to use client factory pattern
- Created new extract tool for structured data extraction
- All tools now route through WebhookBridgeClient
- Automatic session tracking for all Firecrawl operations
- Zero direct SDK client instantiation

Changes:
- Added map(), search(), extract() methods to WebhookBridgeClient
- Refactored createMapTool and createSearchTool to accept clients
- Created extract tool with schema, pipeline, response, and main files
- Updated tool registration for all three tools
- Updated tests to expect 7 tools (was 6)

Testing:
- All unit tests passing (389/397, 8 pre-existing failures)
- End-to-end verification complete
- Webhook bridge creates crawl_sessions for all operations

Related: Firecrawl API consolidation plan
Session: .docs/sessions/2025-01-14-mcp-webhook-bridge-refactoring.md"
```

---

## Success Criteria

**Functional:**
- ✅ Map tool routes through WebhookBridgeClient
- ✅ Search tool routes through WebhookBridgeClient
- ✅ Extract tool created and functional
- ✅ All three tools create crawl_sessions automatically
- ✅ No direct SDK client instantiation

**Code Quality:**
- ✅ All tools use dependency injection pattern
- ✅ Type-safe with proper TypeScript types
- ✅ Tests updated and passing
- ✅ Clean git history with descriptive commits

**Architecture:**
- ✅ Single Firecrawl integration point (webhook bridge)
- ✅ Automatic session tracking for all operations
- ✅ Consistent behavior across all MCP tools

---

## Notes

**Extract Tool Considerations:**
- Firecrawl SDK may not have ExtractOptions/ExtractResult types yet
- Defined types inline in pipeline.ts as temporary solution
- When SDK updates, migrate to imported types

**Testing Strategy:**
- Unit tests for schema, pipeline, response formatting
- Integration tests verify webhook bridge routing
- E2E tests confirm crawl_session creation

**Rollback Plan:**
If issues arise, revert commits in reverse order. Map/search tools can temporarily use old pattern while debugging.
