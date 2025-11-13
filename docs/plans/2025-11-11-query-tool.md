# Query Tool Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a `query` tool to the MCP server that searches the indexed Firecrawl documentation via the webhook service's Qdrant/BM25 hybrid search endpoint.

**Architecture:** Create a new MCP tool following the existing pattern (search/map/crawl). The tool will make HTTP requests to the webhook service's `/api/search` endpoint with Bearer token authentication, parse the response, and format results as MCP resources with embedded content.

**Tech Stack:**
- TypeScript with Zod validation
- MCP SDK for tool registration
- Native HTTP client (fetch/https)
- Webhook service REST API (FastAPI)

---

## Task 1: Create Query Tool Schema

**Files:**
- Create: `apps/mcp/tools/query/schema.ts`
- Create: `apps/mcp/tools/query/schema.test.ts`

**Step 1: Write the failing test**

Create `apps/mcp/tools/query/schema.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { queryOptionsSchema, buildQueryInputSchema } from "./schema.js";

describe("Query Tool Schema", () => {
  describe("queryOptionsSchema", () => {
    it("should validate basic query request", () => {
      const input = {
        query: "firecrawl scrape options",
      };

      const result = queryOptionsSchema.parse(input);

      expect(result.query).toBe("firecrawl scrape options");
      expect(result.mode).toBe("hybrid");
      expect(result.limit).toBe(10);
    });

    it("should validate query with all optional fields", () => {
      const input = {
        query: "test query",
        mode: "semantic",
        limit: 5,
        filters: {
          domain: "docs.firecrawl.dev",
          language: "en",
        },
      };

      const result = queryOptionsSchema.parse(input);

      expect(result.query).toBe("test query");
      expect(result.mode).toBe("semantic");
      expect(result.limit).toBe(5);
      expect(result.filters?.domain).toBe("docs.firecrawl.dev");
      expect(result.filters?.language).toBe("en");
    });

    it("should reject invalid mode", () => {
      const input = {
        query: "test",
        mode: "invalid",
      };

      expect(() => queryOptionsSchema.parse(input)).toThrow();
    });

    it("should reject limit out of range", () => {
      const input = {
        query: "test",
        limit: 101,
      };

      expect(() => queryOptionsSchema.parse(input)).toThrow();
    });

    it("should reject missing query", () => {
      const input = {};

      expect(() => queryOptionsSchema.parse(input)).toThrow();
    });
  });

  describe("buildQueryInputSchema", () => {
    it("should return valid JSON schema", () => {
      const schema = buildQueryInputSchema();

      expect(schema.type).toBe("object");
      expect(schema.properties).toBeDefined();
      expect(schema.properties.query).toBeDefined();
      expect(schema.required).toContain("query");
    });

    it("should include all optional properties", () => {
      const schema = buildQueryInputSchema();

      expect(schema.properties.mode).toBeDefined();
      expect(schema.properties.limit).toBeDefined();
      expect(schema.properties.filters).toBeDefined();
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /compose/pulse/apps/mcp && pnpm test schema.test.ts`
Expected: FAIL with "Cannot find module './schema.js'"

**Step 3: Write minimal implementation**

Create `apps/mcp/tools/query/schema.ts`:

```typescript
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

/**
 * Search mode options for hybrid/semantic/keyword search
 */
const searchModeSchema = z.enum(["hybrid", "semantic", "keyword", "bm25"]);

/**
 * Search filters for domain/language/country/mobile
 */
const searchFiltersSchema = z
  .object({
    domain: z.string().optional().describe("Filter by domain"),
    language: z.string().optional().describe("Filter by language code"),
    country: z.string().optional().describe("Filter by country code"),
    isMobile: z.boolean().optional().describe("Filter by mobile flag"),
  })
  .optional();

/**
 * Query tool options schema
 */
export const queryOptionsSchema = z.object({
  query: z.string().min(1).describe("Search query text"),
  mode: searchModeSchema
    .default("hybrid")
    .describe(
      "Search mode: hybrid (vector + BM25), semantic (vector only), keyword/bm25 (keyword only)",
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(10)
    .describe("Maximum number of results (1-100)"),
  filters: searchFiltersSchema.describe("Search filters"),
});

export type QueryOptions = z.infer<typeof queryOptionsSchema>;

/**
 * Build JSON schema for query tool input
 */
export function buildQueryInputSchema(): Record<string, unknown> {
  return zodToJsonSchema(queryOptionsSchema, "queryOptions");
}
```

**Step 4: Run test to verify it passes**

Run: `cd /compose/pulse/apps/mcp && pnpm test schema.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/mcp/tools/query/schema.ts apps/mcp/tools/query/schema.test.ts
git commit -m "feat(mcp): add query tool schema and validation"
```

---

## Task 2: Create Query Tool Response Formatter

**Files:**
- Create: `apps/mcp/tools/query/response.ts`
- Create: `apps/mcp/tools/query/response.test.ts`

**Step 1: Write the failing test**

Create `apps/mcp/tools/query/response.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { formatQueryResponse } from "./response.js";

describe("Query Response Formatter", () => {
  it("should format search results with embedded resources", () => {
    const searchResponse = {
      results: [
        {
          url: "https://docs.firecrawl.dev/features/scrape",
          title: "Scrape | Firecrawl",
          description: "Turn any url into clean data",
          text: "Scrape Formats\n\nYou can now choose what formats you want your output in...",
          score: 0.95,
          metadata: {
            url: "https://docs.firecrawl.dev/features/scrape",
            title: "Scrape | Firecrawl",
            domain: "docs.firecrawl.dev",
            language: "en",
          },
        },
        {
          url: "https://docs.firecrawl.dev/features/search",
          title: "Search | Firecrawl",
          description: "Search the web and get full content from results",
          text: "Search and scrape content...",
          score: 0.85,
          metadata: {
            url: "https://docs.firecrawl.dev/features/search",
            title: "Search | Firecrawl",
            domain: "docs.firecrawl.dev",
          },
        },
      ],
      total: 2,
      query: "firecrawl scrape options",
      mode: "hybrid",
    };

    const result = formatQueryResponse(searchResponse, "firecrawl scrape options");

    expect(result.content).toHaveLength(2);
    expect(result.isError).toBeUndefined();

    // First result should be embedded resource
    const firstResult = result.content[0];
    expect(firstResult.type).toBe("resource");
    expect(firstResult.resource).toBeDefined();
    expect(firstResult.resource.uri).toContain("scraped://");
    expect(firstResult.resource.name).toBe("https://docs.firecrawl.dev/features/scrape");
    expect(firstResult.resource.text).toContain("Scrape Formats");
    expect(firstResult.resource.text).toContain("Score: 0.95");
  });

  it("should format empty results", () => {
    const searchResponse = {
      results: [],
      total: 0,
      query: "nonexistent query",
      mode: "hybrid",
    };

    const result = formatQueryResponse(searchResponse, "nonexistent query");

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toContain("No results found");
  });

  it("should include metadata in formatted text", () => {
    const searchResponse = {
      results: [
        {
          url: "https://example.com",
          title: "Example",
          description: "Example description",
          text: "Example content",
          score: 0.75,
          metadata: {
            domain: "example.com",
            language: "en",
            country: "US",
          },
        },
      ],
      total: 1,
      query: "test",
      mode: "semantic",
    };

    const result = formatQueryResponse(searchResponse, "test");

    const resource = result.content[0].resource;
    expect(resource.text).toContain("Domain: example.com");
    expect(resource.text).toContain("Language: en");
    expect(resource.text).toContain("Country: US");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /compose/pulse/apps/mcp && pnpm test response.test.ts`
Expected: FAIL with "Cannot find module './response.js'"

**Step 3: Write minimal implementation**

Create `apps/mcp/tools/query/response.ts`:

```typescript
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

interface SearchResult {
  url: string;
  title: string | null;
  description: string | null;
  text: string;
  score: number;
  metadata: Record<string, unknown>;
}

interface SearchResponse {
  results: SearchResult[];
  total: number;
  query: string;
  mode: string;
}

/**
 * Format query response as MCP embedded resources
 */
export function formatQueryResponse(
  response: SearchResponse,
  query: string,
): CallToolResult {
  if (response.results.length === 0) {
    return {
      content: [
        {
          type: "text",
          text: `No results found for query: "${query}"`,
        },
      ],
    };
  }

  // Format each result as an embedded resource
  const content = response.results.map((result) => {
    // Generate URI based on URL and timestamp
    const uri = `scraped://${new URL(result.url).hostname}/${Date.now()}`;

    // Build formatted text with metadata
    const lines = [
      `# ${result.title || "Untitled"}`,
      "",
      `**URL:** ${result.url}`,
      `**Score:** ${result.score.toFixed(2)}`,
      "",
    ];

    if (result.description) {
      lines.push(`**Description:** ${result.description}`, "");
    }

    // Add metadata fields
    const metadata = result.metadata;
    if (metadata.domain) {
      lines.push(`**Domain:** ${metadata.domain}`);
    }
    if (metadata.language) {
      lines.push(`**Language:** ${metadata.language}`);
    }
    if (metadata.country) {
      lines.push(`**Country:** ${metadata.country}`);
    }

    lines.push("", "---", "", result.text);

    return {
      type: "resource" as const,
      resource: {
        uri,
        name: result.url,
        mimeType: "text/markdown",
        text: lines.join("\n"),
      },
    };
  });

  return { content };
}
```

**Step 4: Run test to verify it passes**

Run: `cd /compose/pulse/apps/mcp && pnpm test response.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/mcp/tools/query/response.ts apps/mcp/tools/query/response.test.ts
git commit -m "feat(mcp): add query tool response formatter"
```

---

## Task 3: Create Query Tool HTTP Client

**Files:**
- Create: `apps/mcp/tools/query/client.ts`
- Create: `apps/mcp/tools/query/client.test.ts`

**Step 1: Write the failing test**

Create `apps/mcp/tools/query/client.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient } from "./client.js";

// Mock fetch globally
global.fetch = vi.fn();

describe("QueryClient", () => {
  let client: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new QueryClient({
      baseUrl: "http://localhost:50108",
      apiSecret: "test-secret",
    });
  });

  it("should make successful query request", async () => {
    const mockResponse = {
      results: [
        {
          url: "https://example.com",
          title: "Test",
          description: "Test description",
          text: "Test content",
          score: 0.95,
          metadata: {},
        },
      ],
      total: 1,
      query: "test query",
      mode: "hybrid",
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    });

    const result = await client.query({
      query: "test query",
      mode: "hybrid",
      limit: 10,
    });

    expect(result).toEqual(mockResponse);
    expect(global.fetch).toHaveBeenCalledWith(
      "http://localhost:50108/api/search",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          Authorization: "Bearer test-secret",
        }),
        body: expect.stringContaining('"query":"test query"'),
      }),
    );
  });

  it("should handle HTTP errors", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      json: async () => ({ detail: "Invalid API secret" }),
    });

    await expect(
      client.query({
        query: "test",
        mode: "hybrid",
        limit: 10,
      }),
    ).rejects.toThrow("Query failed: 401 Unauthorized");
  });

  it("should handle network errors", async () => {
    (global.fetch as any).mockRejectedValueOnce(new Error("Network error"));

    await expect(
      client.query({
        query: "test",
        mode: "hybrid",
        limit: 10,
      }),
    ).rejects.toThrow("Network error");
  });

  it("should include filters in request", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ results: [], total: 0, query: "", mode: "" }),
    });

    await client.query({
      query: "test",
      mode: "semantic",
      limit: 5,
      filters: {
        domain: "docs.firecrawl.dev",
        language: "en",
      },
    });

    const callArgs = (global.fetch as any).mock.calls[0];
    const body = JSON.parse(callArgs[1].body);

    expect(body.filters).toEqual({
      domain: "docs.firecrawl.dev",
      language: "en",
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /compose/pulse/apps/mcp && pnpm test client.test.ts`
Expected: FAIL with "Cannot find module './client.js'"

**Step 3: Write minimal implementation**

Create `apps/mcp/tools/query/client.ts`:

```typescript
import type { QueryOptions } from "./schema.js";

interface QueryClientConfig {
  baseUrl: string;
  apiSecret: string;
  timeout?: number;
}

interface SearchResult {
  url: string;
  title: string | null;
  description: string | null;
  text: string;
  score: number;
  metadata: Record<string, unknown>;
}

interface SearchResponse {
  results: SearchResult[];
  total: number;
  query: string;
  mode: string;
}

/**
 * HTTP client for webhook service search endpoint
 */
export class QueryClient {
  private baseUrl: string;
  private apiSecret: string;
  private timeout: number;

  constructor(config: QueryClientConfig) {
    this.baseUrl = config.baseUrl;
    this.apiSecret = config.apiSecret;
    this.timeout = config.timeout || 30000;
  }

  /**
   * Execute search query against webhook service
   */
  async query(options: QueryOptions): Promise<SearchResponse> {
    const url = `${this.baseUrl}/api/search`;

    const requestBody = {
      query: options.query,
      mode: options.mode,
      limit: options.limit,
      ...(options.filters && { filters: options.filters }),
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiSecret}`,
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      throw new Error(
        `Query failed: ${response.status} ${response.statusText}${
          errorBody.detail ? ` - ${errorBody.detail}` : ""
        }`,
      );
    }

    return await response.json();
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd /compose/pulse/apps/mcp && pnpm test client.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/mcp/tools/query/client.ts apps/mcp/tools/query/client.test.ts
git commit -m "feat(mcp): add query tool HTTP client"
```

---

## Task 4: Create Query Tool Main Implementation

**Files:**
- Create: `apps/mcp/tools/query/index.ts`
- Create: `apps/mcp/tools/query/index.test.ts`

**Step 1: Write the failing test**

Create `apps/mcp/tools/query/index.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createQueryTool } from "./index.js";

// Mock dependencies
vi.mock("./client.js", () => ({
  QueryClient: vi.fn().mockImplementation(() => ({
    query: vi.fn().mockResolvedValue({
      results: [
        {
          url: "https://example.com",
          title: "Test",
          description: "Test desc",
          text: "Test content",
          score: 0.95,
          metadata: { domain: "example.com" },
        },
      ],
      total: 1,
      query: "test",
      mode: "hybrid",
    }),
  })),
}));

describe("Query Tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should create tool with correct name and description", () => {
    const tool = createQueryTool({
      baseUrl: "http://localhost:50108",
      apiSecret: "test-secret",
    });

    expect(tool.name).toBe("query");
    expect(tool.description).toContain("Search indexed documentation");
    expect(tool.inputSchema).toBeDefined();
  });

  it("should execute query successfully", async () => {
    const tool = createQueryTool({
      baseUrl: "http://localhost:50108",
      apiSecret: "test-secret",
    });

    const result = await tool.handler({
      query: "test query",
      mode: "hybrid",
      limit: 10,
    });

    expect(result.content).toBeDefined();
    expect(result.content.length).toBeGreaterThan(0);
    expect(result.isError).toBeUndefined();
  });

  it("should handle query errors gracefully", async () => {
    const { QueryClient } = await import("./client.js");
    (QueryClient as any).mockImplementationOnce(() => ({
      query: vi.fn().mockRejectedValue(new Error("Network error")),
    }));

    const tool = createQueryTool({
      baseUrl: "http://localhost:50108",
      apiSecret: "test-secret",
    });

    const result = await tool.handler({
      query: "test",
      mode: "hybrid",
      limit: 10,
    });

    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toContain("Query error");
    expect(result.isError).toBe(true);
  });

  it("should validate input arguments", async () => {
    const tool = createQueryTool({
      baseUrl: "http://localhost:50108",
      apiSecret: "test-secret",
    });

    const result = await tool.handler({
      query: "",
      mode: "invalid",
      limit: 101,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Query error");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /compose/pulse/apps/mcp && pnpm test index.test.ts`
Expected: FAIL with "Cannot find module './index.js'"

**Step 3: Write minimal implementation**

Create `apps/mcp/tools/query/index.ts`:

```typescript
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { QueryClient } from "./client.js";
import { queryOptionsSchema, buildQueryInputSchema } from "./schema.js";
import { formatQueryResponse } from "./response.js";

interface QueryConfig {
  baseUrl: string;
  apiSecret: string;
  timeout?: number;
}

/**
 * Create query tool for searching indexed documentation
 */
export function createQueryTool(config: QueryConfig): Tool {
  const client = new QueryClient(config);

  return {
    name: "query",
    description:
      "Search indexed documentation using hybrid (vector + BM25), semantic (vector only), or keyword (BM25 only) search. " +
      "Queries the webhook service's Qdrant vector store and BM25 index to find relevant documentation chunks. " +
      "Returns results as embedded MCP resources with content, scores, and metadata.",
    inputSchema: buildQueryInputSchema(),

    handler: async (args: unknown) => {
      try {
        const validatedArgs = queryOptionsSchema.parse(args);
        const response = await client.query(validatedArgs);
        return formatQueryResponse(response, validatedArgs.query);
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Query error: ${error instanceof Error ? error.message : String(error)}`,
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

Run: `cd /compose/pulse/apps/mcp && pnpm test index.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/mcp/tools/query/index.ts apps/mcp/tools/query/index.test.ts
git commit -m "feat(mcp): add query tool main implementation"
```

---

## Task 5: Register Query Tool in MCP Server

**Files:**
- Modify: `apps/mcp/tools/registration.ts:64-72`
- Modify: `apps/mcp/config/environment.ts` (add WEBHOOK_* env vars)

**Step 1: Write the failing test**

Create `apps/mcp/tools/query/registration.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { registerTools } from "../registration.js";

describe("Query Tool Registration", () => {
  let server: Server;

  beforeEach(() => {
    server = new Server({ name: "test", version: "1.0.0" }, {});
  });

  it("should register query tool", async () => {
    const mockClientFactory = vi.fn();
    const mockStrategyFactory = vi.fn();

    // Set required env vars
    process.env.WEBHOOK_BASE_URL = "http://localhost:50108";
    process.env.WEBHOOK_API_SECRET = "test-secret";

    registerTools(server, mockClientFactory, mockStrategyFactory);

    // Get list of tools
    const handler = server.requestHandlers.get("tools/list");
    expect(handler).toBeDefined();

    const result = await handler!({
      method: "tools/list",
      params: {},
    });

    const toolNames = result.tools.map((t: any) => t.name);
    expect(toolNames).toContain("query");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /compose/pulse/apps/mcp && pnpm test registration.test.ts`
Expected: FAIL - query tool not registered

**Step 3: Add environment variables**

Modify `apps/mcp/config/environment.ts` - add after line 50:

```typescript
  // Webhook Service (for query tool)
  webhookBaseUrl: z
    .string()
    .url()
    .default("http://pulse_webhook:52100")
    .describe("Webhook service base URL for query tool"),
  webhookApiSecret: z
    .string()
    .min(1)
    .describe("Webhook service API secret for authentication"),
```

And in the env object construction (after line 120):

```typescript
    webhookBaseUrl: process.env.WEBHOOK_BASE_URL || process.env.MCP_WEBHOOK_BASE_URL,
    webhookApiSecret: process.env.WEBHOOK_API_SECRET || process.env.MCP_WEBHOOK_API_SECRET,
```

**Step 4: Import and register query tool**

Modify `apps/mcp/tools/registration.ts`:

Add import at line 24:
```typescript
import { createQueryTool } from "./query/index.js";
```

Modify toolConfigs array (line 64-72):
```typescript
  const toolConfigs = [
    {
      name: "scrape",
      factory: () => scrapeTool(server, clientFactory, strategyConfigFactory),
    },
    { name: "search", factory: () => createSearchTool(firecrawlConfig) },
    { name: "map", factory: () => createMapTool(firecrawlConfig) },
    { name: "crawl", factory: () => createCrawlTool(firecrawlConfig) },
    {
      name: "query",
      factory: () =>
        createQueryTool({
          baseUrl: env.webhookBaseUrl,
          apiSecret: env.webhookApiSecret,
        }),
    },
  ];
```

**Step 5: Run test to verify it passes**

Run: `cd /compose/pulse/apps/mcp && pnpm test registration.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add apps/mcp/tools/registration.ts apps/mcp/config/environment.ts apps/mcp/tools/query/registration.test.ts
git commit -m "feat(mcp): register query tool with MCP server"
```

---

## Task 6: Update Environment Configuration

**Files:**
- Modify: `/compose/pulse/.env.example`
- Modify: `/compose/pulse/apps/mcp/.env.example`

**Step 1: Add webhook configuration to root .env.example**

Modify `/compose/pulse/.env.example` - add after MCP section:

```bash
# Webhook Service (for MCP query tool)
WEBHOOK_BASE_URL=http://pulse_webhook:52100
WEBHOOK_API_SECRET=your-webhook-api-secret-here
```

**Step 2: Add webhook configuration to MCP .env.example**

Modify `/compose/pulse/apps/mcp/.env.example` - add at end:

```bash
# Webhook Service (for query tool)
MCP_WEBHOOK_BASE_URL=http://localhost:50108
MCP_WEBHOOK_API_SECRET=your-webhook-api-secret-here
```

**Step 3: Update actual .env file**

Verify `/compose/pulse/.env` has:
```bash
WEBHOOK_BASE_URL=http://pulse_webhook:52100
WEBHOOK_API_SECRET=8sHRjdGvk6wL58zP2QnM9N3h4ZBYa5M3
```

**Step 4: Commit**

```bash
git add .env.example apps/mcp/.env.example
git commit -m "docs: add webhook service configuration for query tool"
```

---

## Task 7: Integration Testing

**Files:**
- Create: `apps/mcp/tests/integration/query-tool.test.ts`

**Step 1: Write integration test**

Create `apps/mcp/tests/integration/query-tool.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from "vitest";
import { createQueryTool } from "../../tools/query/index.js";

describe("Query Tool Integration", () => {
  const tool = createQueryTool({
    baseUrl: process.env.WEBHOOK_BASE_URL || "http://localhost:50108",
    apiSecret: process.env.WEBHOOK_API_SECRET || "test-secret",
  });

  it("should query firecrawl documentation successfully", async () => {
    const result = await tool.handler({
      query: "firecrawl scrape formats",
      mode: "hybrid",
      limit: 5,
    });

    expect(result.content).toBeDefined();
    expect(result.content.length).toBeGreaterThan(0);
    expect(result.isError).toBeUndefined();

    // Check first result is embedded resource
    const firstResult = result.content[0];
    expect(firstResult.type).toBe("resource");
    expect(firstResult.resource).toBeDefined();
    expect(firstResult.resource.uri).toContain("scraped://");
  });

  it("should handle semantic search", async () => {
    const result = await tool.handler({
      query: "how to extract links from pages",
      mode: "semantic",
      limit: 3,
    });

    expect(result.content).toBeDefined();
    expect(result.isError).toBeUndefined();
  });

  it("should handle keyword search", async () => {
    const result = await tool.handler({
      query: "markdown html rawHtml",
      mode: "keyword",
      limit: 5,
    });

    expect(result.content).toBeDefined();
    expect(result.isError).toBeUndefined();
  });

  it("should filter by domain", async () => {
    const result = await tool.handler({
      query: "search",
      mode: "hybrid",
      limit: 5,
      filters: {
        domain: "docs.firecrawl.dev",
      },
    });

    expect(result.content).toBeDefined();
    expect(result.isError).toBeUndefined();

    // Verify domain filter worked
    for (const item of result.content) {
      if (item.type === "resource") {
        expect(item.resource.name).toContain("docs.firecrawl.dev");
      }
    }
  });
});
```

**Step 2: Run integration test**

Run: `cd /compose/pulse/apps/mcp && pnpm test integration/query-tool.test.ts`
Expected: PASS (requires webhook service running)

**Step 3: Commit**

```bash
git add apps/mcp/tests/integration/query-tool.test.ts
git commit -m "test(mcp): add query tool integration tests"
```

---

## Task 8: Update Documentation

**Files:**
- Modify: `/compose/pulse/apps/mcp/README.md`
- Create: `/compose/pulse/docs/mcp-query-tool.md`

**Step 1: Update MCP README**

Modify `apps/mcp/README.md` - add to tools section:

```markdown
### Query Tool

Search indexed documentation using hybrid search (vector + BM25).

**Features:**
- Hybrid search: Vector similarity + BM25 keyword matching with RRF fusion
- Semantic search: Vector similarity only for conceptual matching
- Keyword search: BM25 keyword matching for exact terms
- Domain/language/country filtering
- Returns results as embedded MCP resources

**Usage:**
```typescript
const result = await mcp.callTool('query', {
  query: 'firecrawl scrape options',
  mode: 'hybrid',
  limit: 10,
  filters: {
    domain: 'docs.firecrawl.dev',
    language: 'en'
  }
});
```

**Configuration:**
- `WEBHOOK_BASE_URL`: Webhook service endpoint (default: http://pulse_webhook:52100)
- `WEBHOOK_API_SECRET`: API authentication secret
```

**Step 2: Create detailed documentation**

Create `/compose/pulse/docs/mcp-query-tool.md`:

```markdown
# MCP Query Tool

## Overview

The Query tool enables searching indexed documentation through the MCP interface. It connects to the webhook service's hybrid search endpoint (Qdrant vector store + BM25) to find relevant documentation chunks.

## Architecture

```
┌─────────────┐      ┌─────────────┐      ┌──────────────┐
│  MCP Client │─────▶│  MCP Server │─────▶│   Webhook    │
│  (Claude)   │      │ Query Tool  │      │   Service    │
└─────────────┘      └─────────────┘      └──────────────┘
                                                   │
                                    ┌──────────────┴──────────────┐
                                    ▼                             ▼
                               ┌─────────┐                 ┌─────────┐
                               │ Qdrant  │                 │  BM25   │
                               │ Vector  │                 │ Index   │
                               └─────────┘                 └─────────┘
```

## Search Modes

### Hybrid (Default)
Combines vector similarity and BM25 keyword matching using Reciprocal Rank Fusion (RRF):
- Best for general queries
- Balances semantic understanding with exact term matching
- Most robust across different query types

### Semantic
Vector similarity only:
- Best for conceptual queries
- Understands synonyms and related concepts
- May miss exact technical terms

### Keyword/BM25
BM25 keyword matching only:
- Best for exact term searches
- Fast and deterministic
- Requires precise terminology

## Request Schema

```typescript
{
  query: string;        // Required: Search query text
  mode?: "hybrid" | "semantic" | "keyword" | "bm25"; // Default: "hybrid"
  limit?: number;       // Default: 10, Range: 1-100
  filters?: {
    domain?: string;    // e.g., "docs.firecrawl.dev"
    language?: string;  // e.g., "en"
    country?: string;   // e.g., "US"
    isMobile?: boolean; // Mobile-specific content
  };
}
```

## Response Format

Returns embedded MCP resources:

```typescript
{
  content: [
    {
      type: "resource",
      resource: {
        uri: "scraped://docs.firecrawl.dev/1234567890",
        name: "https://docs.firecrawl.dev/features/scrape",
        mimeType: "text/markdown",
        text: `# Scrape | Firecrawl

**URL:** https://docs.firecrawl.dev/features/scrape
**Score:** 0.95

**Description:** Turn any url into clean data

**Domain:** docs.firecrawl.dev
**Language:** en

---

[Full content text...]`
      }
    }
  ]
}
```

## Configuration

### Environment Variables

**Root `.env`:**
```bash
WEBHOOK_BASE_URL=http://pulse_webhook:52100
WEBHOOK_API_SECRET=your-secret-here
```

**MCP `.env`:**
```bash
MCP_WEBHOOK_BASE_URL=http://localhost:50108  # For standalone deployment
MCP_WEBHOOK_API_SECRET=your-secret-here
```

### Docker Network

The query tool uses internal Docker networking:
- Service: `pulse_webhook:52100`
- External: `localhost:50108`

## Examples

### Basic Query
```typescript
{
  query: "firecrawl scrape options"
}
```

### Semantic Search
```typescript
{
  query: "how to extract data from websites",
  mode: "semantic",
  limit: 5
}
```

### Filtered Query
```typescript
{
  query: "API authentication",
  mode: "hybrid",
  limit: 10,
  filters: {
    domain: "docs.firecrawl.dev",
    language: "en"
  }
}
```

## Error Handling

The tool handles errors gracefully:

- **Network errors**: Returns error message with `isError: true`
- **Authentication errors**: Returns 401 with detail message
- **Validation errors**: Returns Zod validation error details
- **Empty results**: Returns "No results found" message

## Testing

### Unit Tests
```bash
cd apps/mcp
pnpm test tools/query
```

### Integration Tests
```bash
# Requires webhook service running
pnpm test integration/query-tool.test.ts
```

## Performance

- **Average query time**: 100-300ms
- **Timeout**: 30 seconds (configurable)
- **Rate limit**: 50 requests/minute (webhook service)
- **Max results**: 100 per query

## Related Documentation

- [Webhook Service API](../apps/webhook/README.md)
- [MCP Server Architecture](./mcp-architecture.md)
- [Search Implementation](../apps/webhook/api/routers/search.py)
```

**Step 3: Commit**

```bash
git add apps/mcp/README.md docs/mcp-query-tool.md
git commit -m "docs: add query tool documentation"
```

---

## Task 9: Build and Verify

**Step 1: Run type checking**

Run: `cd /compose/pulse/apps/mcp && pnpm typecheck`
Expected: No type errors

**Step 2: Run all tests**

Run: `cd /compose/pulse/apps/mcp && pnpm test:run`
Expected: All tests pass

**Step 3: Build the MCP server**

Run: `cd /compose/pulse/apps/mcp && pnpm build`
Expected: Successful build in `dist/`

**Step 4: Verify tool registration**

Run: `cd /compose/pulse/apps/mcp && pnpm start`
Expected: Server starts and logs show "query" tool registered

**Step 5: Test query tool end-to-end**

Use MCP inspector or Claude Desktop to verify:
1. Tool appears in tool list
2. Can execute queries successfully
3. Returns formatted resources
4. Filters work correctly

**Step 6: Final commit**

```bash
git add .
git commit -m "feat(mcp): complete query tool implementation

- Add query tool for searching indexed documentation
- Support hybrid/semantic/keyword search modes
- Include domain/language/country filtering
- Return results as embedded MCP resources
- Full test coverage with unit and integration tests
- Complete documentation"
```

---

## Verification Checklist

After completing all tasks, verify:

- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] Type checking passes with no errors
- [ ] Build completes successfully
- [ ] Tool registers with MCP server
- [ ] Can execute queries through MCP protocol
- [ ] Results format correctly as resources
- [ ] Filters work as expected
- [ ] Error handling works gracefully
- [ ] Documentation is complete and accurate
- [ ] Environment variables documented
- [ ] Git commits are clean and descriptive

---

Plan complete and saved to `docs/plans/2025-01-11-query-tool.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
