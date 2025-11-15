# Profile Crawl MCP Tool - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement `profile_crawl` MCP tool for debugging and profiling crawl performance

**Architecture:** HTTP client calls webhook metrics API, Zod schemas validate input, response formatter creates plain-text diagnostic reports

**Tech Stack:** TypeScript, Zod, Vitest, MCP SDK, Fetch API

---

## Prerequisites

**Before starting:**

```bash
# Verify you're in the correct directory
cd /compose/pulse/apps/mcp

# Check existing tool structure
ls tools/query
```

**Expected:** Directory structure with index.ts, schema.ts, client.ts, etc.

---

## Phase 1: Types and Schema (TDD)

### Task 1: Create Types File

**Files:**
- Create: `apps/mcp/tools/profile/types.ts`

**Step 1: Create types file with API response interfaces**

```typescript
/**
 * API response types matching webhook schemas
 */

export interface OperationTimingSummary {
  chunking_ms: number;
  embedding_ms: number;
  qdrant_ms: number;
  bm25_ms: number;
}

export interface PerPageMetric {
  url: string | null;
  operation_type: string;
  operation_name: string;
  duration_ms: number;
  success: boolean;
  timestamp: string;
}

export interface CrawlMetricsResponse {
  crawl_id: string;
  crawl_url: string;
  status: string;
  success: boolean | null;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  e2e_duration_ms: number | null;
  total_pages: number;
  pages_indexed: number;
  pages_failed: number;
  aggregate_timing: OperationTimingSummary;
  per_page_metrics?: PerPageMetric[];
  error_message: string | null;
  extra_metadata: Record<string, any> | null;
}
```

**Step 2: Commit**

```bash
git add apps/mcp/tools/profile/types.ts
git commit -m "feat(mcp): add types for profile_crawl tool

- Create OperationTimingSummary interface
- Create PerPageMetric interface
- Create CrawlMetricsResponse interface
- Match webhook API response schemas exactly"
```

---

### Task 2: Create Schema with Tests (TDD)

**Files:**
- Create: `apps/mcp/tools/profile/schema.ts`
- Create: `apps/mcp/tools/profile/schema.test.ts`

**Step 1: Write failing test for schema validation**

Create `apps/mcp/tools/profile/schema.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { profileOptionsSchema, buildProfileInputSchema } from "./schema.js";

describe("Profile Tool Schema", () => {
  describe("profileOptionsSchema", () => {
    it("should require crawl_id", () => {
      expect(() => profileOptionsSchema.parse({})).toThrow();
    });

    it("should reject empty crawl_id", () => {
      expect(() => profileOptionsSchema.parse({ crawl_id: "" })).toThrow();
    });

    it("should apply default values", () => {
      const result = profileOptionsSchema.parse({ crawl_id: "test123" });

      expect(result.crawl_id).toBe("test123");
      expect(result.include_details).toBe(false);
      expect(result.error_offset).toBe(0);
      expect(result.error_limit).toBe(5);
    });

    it("should accept all optional fields", () => {
      const input = {
        crawl_id: "abc123",
        include_details: true,
        error_offset: 10,
        error_limit: 20,
      };

      const result = profileOptionsSchema.parse(input);

      expect(result.include_details).toBe(true);
      expect(result.error_offset).toBe(10);
      expect(result.error_limit).toBe(20);
    });

    it("should enforce error_limit maximum of 50", () => {
      expect(() =>
        profileOptionsSchema.parse({ crawl_id: "test", error_limit: 100 })
      ).toThrow();
    });

    it("should enforce error_offset minimum of 0", () => {
      expect(() =>
        profileOptionsSchema.parse({ crawl_id: "test", error_offset: -1 })
      ).toThrow();
    });

    it("should enforce error_limit minimum of 1", () => {
      expect(() =>
        profileOptionsSchema.parse({ crawl_id: "test", error_limit: 0 })
      ).toThrow();
    });
  });

  describe("buildProfileInputSchema", () => {
    it("should return valid JSON schema", () => {
      const schema = buildProfileInputSchema();

      expect(schema.type).toBe("object");
      expect(schema.properties).toBeDefined();
      expect(schema.required).toEqual(["crawl_id"]);
    });

    it("should have all expected properties", () => {
      const schema = buildProfileInputSchema();

      expect(schema.properties?.crawl_id).toBeDefined();
      expect(schema.properties?.include_details).toBeDefined();
      expect(schema.properties?.error_offset).toBeDefined();
      expect(schema.properties?.error_limit).toBeDefined();
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd apps/mcp
npm test tools/profile/schema.test.ts
```

**Expected:** Test fails with "Cannot find module './schema.js'"

**Step 3: Implement schema**

Create `apps/mcp/tools/profile/schema.ts`:

```typescript
import { z } from "zod";

/**
 * Parameter descriptions for profile tool
 */
export const PARAM_DESCRIPTIONS = {
  crawl_id: 'Firecrawl crawl/job identifier returned by the crawl tool',
  include_details:
    'Include per-page operation breakdowns and detailed performance metrics. ' +
    'Use this to see which specific pages were slow or failed. Default: false',
  error_offset:
    'Error pagination offset (0-based). Use to page through errors when total ' +
    'exceeds error_limit. Default: 0',
  error_limit:
    'Maximum number of errors to return per page (1-50). Default: 5',
};

/**
 * Profile tool options schema
 */
export const profileOptionsSchema = z.object({
  crawl_id: z
    .string()
    .min(1)
    .describe(PARAM_DESCRIPTIONS.crawl_id),
  include_details: z
    .boolean()
    .optional()
    .default(false)
    .describe(PARAM_DESCRIPTIONS.include_details),
  error_offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .default(0)
    .describe(PARAM_DESCRIPTIONS.error_offset),
  error_limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .default(5)
    .describe(PARAM_DESCRIPTIONS.error_limit),
});

export type ProfileOptions = z.infer<typeof profileOptionsSchema>;

/**
 * Build JSON schema for profile tool input
 *
 * Manually constructs JSON Schema to avoid zodToJsonSchema cross-module
 * instanceof issues (same pattern as query tool).
 */
export function buildProfileInputSchema() {
  return {
    type: "object" as const,
    properties: {
      crawl_id: {
        type: "string",
        minLength: 1,
        description: PARAM_DESCRIPTIONS.crawl_id,
      },
      include_details: {
        type: "boolean",
        default: false,
        description: PARAM_DESCRIPTIONS.include_details,
      },
      error_offset: {
        type: "integer",
        minimum: 0,
        default: 0,
        description: PARAM_DESCRIPTIONS.error_offset,
      },
      error_limit: {
        type: "integer",
        minimum: 1,
        maximum: 50,
        default: 5,
        description: PARAM_DESCRIPTIONS.error_limit,
      },
    },
    required: ["crawl_id"],
  };
}
```

**Step 4: Run tests to verify they pass**

```bash
npm test tools/profile/schema.test.ts
```

**Expected:** All 9 tests pass

**Step 5: Commit**

```bash
git add apps/mcp/tools/profile/schema.ts apps/mcp/tools/profile/schema.test.ts
git commit -m "feat(mcp): add schema validation for profile_crawl tool

- Create profileOptionsSchema with Zod
- Validate crawl_id (required, non-empty)
- Validate optional parameters with defaults
- Enforce error_offset >= 0, error_limit 1-50
- Build JSON schema for MCP tool registration
- Add comprehensive test coverage (9 tests)"
```

---

## Phase 2: HTTP Client (TDD)

### Task 3: Create HTTP Client with Tests

**Files:**
- Create: `apps/mcp/tools/profile/client.ts`
- Create: `apps/mcp/tools/profile/client.test.ts`

**Step 1: Write failing tests for HTTP client**

Create `apps/mcp/tools/profile/client.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { ProfileClient } from "./client.js";

// Mock fetch globally
global.fetch = vi.fn();

describe("ProfileClient", () => {
  let client: ProfileClient;

  beforeEach(() => {
    client = new ProfileClient({
      baseUrl: "http://localhost:52100",
      apiSecret: "test-secret",
    });
    vi.clearAllMocks();
  });

  describe("getMetrics", () => {
    it("should make GET request to correct endpoint", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          crawl_id: "test123",
          crawl_url: "https://example.com",
          status: "completed",
        }),
      });

      await client.getMetrics("test123", false);

      expect(global.fetch).toHaveBeenCalledWith(
        "http://localhost:52100/api/metrics/crawls/test123",
        expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({
            "X-API-Secret": "test-secret",
          }),
        })
      );
    });

    it("should include query param when include_per_page is true", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ crawl_id: "test" }),
      });

      await client.getMetrics("test123", true);

      expect(global.fetch).toHaveBeenCalledWith(
        "http://localhost:52100/api/metrics/crawls/test123?include_per_page=true",
        expect.any(Object)
      );
    });

    it("should use custom timeout if provided", async () => {
      const customClient = new ProfileClient({
        baseUrl: "http://localhost:52100",
        apiSecret: "test-secret",
        timeout: 60000,
      });

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ crawl_id: "test" }),
      });

      await customClient.getMetrics("test123");

      const callArgs = (global.fetch as any).mock.calls[0];
      expect(callArgs[1].signal.timeout).toBe(60000);
    });

    it("should throw error for 404 response", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });

      await expect(client.getMetrics("unknown")).rejects.toThrow(
        "Crawl not found: unknown"
      );
    });

    it("should throw error for authentication failure", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
      });

      await expect(client.getMetrics("test")).rejects.toThrow(
        "Authentication failed"
      );
    });

    it("should throw error for forbidden access", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: "Forbidden",
      });

      await expect(client.getMetrics("test")).rejects.toThrow(
        "Authentication failed"
      );
    });

    it("should throw error for other API errors", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: async () => "Database connection failed",
      });

      await expect(client.getMetrics("test")).rejects.toThrow(
        "Metrics API error (500)"
      );
    });

    it("should parse JSON response correctly", async () => {
      const mockResponse = {
        crawl_id: "test123",
        crawl_url: "https://example.com",
        status: "completed",
        success: true,
        total_pages: 10,
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.getMetrics("test123");

      expect(result).toEqual(mockResponse);
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npm test tools/profile/client.test.ts
```

**Expected:** Fails with "Cannot find module './client.js'"

**Step 3: Implement HTTP client**

Create `apps/mcp/tools/profile/client.ts`:

```typescript
import type { CrawlMetricsResponse } from "./types.js";

export interface ProfileConfig {
  baseUrl: string;
  apiSecret: string;
  timeout?: number;
}

/**
 * HTTP client for webhook metrics API
 */
export class ProfileClient {
  private baseUrl: string;
  private apiSecret: string;
  private timeout: number;

  constructor(config: ProfileConfig) {
    this.baseUrl = config.baseUrl;
    this.apiSecret = config.apiSecret;
    this.timeout = config.timeout ?? 30000;
  }

  /**
   * Get crawl metrics from webhook API
   *
   * @param crawl_id - Firecrawl crawl/job identifier
   * @param include_per_page - Whether to include per-page operation details
   * @returns Crawl metrics response
   * @throws Error if crawl not found, authentication fails, or API error occurs
   */
  async getMetrics(
    crawl_id: string,
    include_per_page: boolean = false
  ): Promise<CrawlMetricsResponse> {
    const url = `${this.baseUrl}/api/metrics/crawls/${crawl_id}`;
    const params = include_per_page ? "?include_per_page=true" : "";

    const response = await fetch(`${url}${params}`, {
      method: "GET",
      headers: {
        "X-API-Secret": this.apiSecret,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(
          `Crawl not found: ${crawl_id}. The crawl may not have started yet, ` +
          `or the crawl_id may be invalid.`
        );
      }
      if (response.status === 401 || response.status === 403) {
        throw new Error("Authentication failed: Invalid API secret");
      }

      const errorText = await response.text().catch(() => response.statusText);
      throw new Error(`Metrics API error (${response.status}): ${errorText}`);
    }

    return await response.json();
  }
}
```

**Step 4: Run tests to verify they pass**

```bash
npm test tools/profile/client.test.ts
```

**Expected:** All 9 tests pass

**Step 5: Commit**

```bash
git add apps/mcp/tools/profile/client.ts apps/mcp/tools/profile/client.test.ts
git commit -m "feat(mcp): add HTTP client for profile_crawl tool

- Create ProfileClient class with getMetrics method
- GET /api/metrics/crawls/{crawl_id} endpoint
- Support include_per_page query parameter
- Handle 404, 401/403, and 500+ errors gracefully
- Configurable timeout with 30s default
- Comprehensive test coverage (9 tests)"
```

---

## Phase 3: Response Formatter (TDD)

### Task 4: Create Response Formatter with Tests (Part 1: Basic Formatting)

**Files:**
- Create: `apps/mcp/tools/profile/response.ts`
- Create: `apps/mcp/tools/profile/response.test.ts`

**Step 1: Write tests for basic response formatting**

Create `apps/mcp/tools/profile/response.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { formatProfileResponse, formatErrorResponse } from "./response.js";
import type { CrawlMetricsResponse } from "./types.js";

describe("Profile Tool Response Formatting", () => {
  const mockCompletedCrawl: CrawlMetricsResponse = {
    crawl_id: "test123",
    crawl_url: "https://example.com",
    status: "completed",
    success: true,
    started_at: "2025-11-13T22:00:00Z",
    completed_at: "2025-11-13T22:05:00Z",
    duration_ms: 300000,
    e2e_duration_ms: 305000,
    total_pages: 10,
    pages_indexed: 9,
    pages_failed: 1,
    aggregate_timing: {
      chunking_ms: 1000,
      embedding_ms: 5000,
      qdrant_ms: 2000,
      bm25_ms: 500,
    },
    error_message: null,
    extra_metadata: null,
  };

  describe("formatProfileResponse", () => {
    it("should format basic profile without details", () => {
      const result = formatProfileResponse(mockCompletedCrawl, {
        crawl_id: "test123",
        include_details: false,
        error_offset: 0,
        error_limit: 5,
      });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");
      const text = result.content[0].text;

      expect(text).toContain("test123");
      expect(text).toContain("completed ✓");
      expect(text).toContain("https://example.com");
      expect(text).toContain("10 total");
      expect(text).toContain("Indexed: 9");
      expect(text).toContain("Failed: 1");
    });

    it("should show performance breakdown", () => {
      const result = formatProfileResponse(mockCompletedCrawl, {
        crawl_id: "test123",
      });

      const text = result.content[0].text;
      expect(text).toContain("Performance Breakdown");
      expect(text).toContain("Chunking");
      expect(text).toContain("Embedding");
      expect(text).toContain("Qdrant");
      expect(text).toContain("BM25");
    });

    it("should calculate percentages correctly", () => {
      const result = formatProfileResponse(mockCompletedCrawl, {
        crawl_id: "test123",
      });

      const text = result.content[0].text;
      // Total: 8500ms, Embedding: 5000ms = 58.8%
      expect(text).toMatch(/Embedding.*58\.\d%/);
    });

    it("should format duration in human-readable format", () => {
      const result = formatProfileResponse(mockCompletedCrawl, {
        crawl_id: "test123",
      });

      const text = result.content[0].text;
      expect(text).toMatch(/Duration:.*5m \d+s/);
    });

    it("should show end-to-end latency", () => {
      const result = formatProfileResponse(mockCompletedCrawl, {
        crawl_id: "test123",
      });

      const text = result.content[0].text;
      expect(text).toContain("End-to-end latency");
      expect(text).toContain("305,000");
    });

    it("should format in-progress crawls", () => {
      const inProgress: CrawlMetricsResponse = {
        ...mockCompletedCrawl,
        status: "in_progress",
        success: null,
        completed_at: null,
        duration_ms: null,
      };

      const result = formatProfileResponse(inProgress, {
        crawl_id: "test123",
      });

      const text = result.content[0].text;
      expect(text).toContain("🔄");
      expect(text).toContain("in progress");
      expect(text).toContain("still in progress");
    });

    it("should format failed crawls", () => {
      const failed: CrawlMetricsResponse = {
        ...mockCompletedCrawl,
        status: "failed",
        success: false,
        error_message: "Rate limit exceeded",
      };

      const result = formatProfileResponse(failed, {
        crawl_id: "test123",
      });

      const text = result.content[0].text;
      expect(text).toContain("❌");
      expect(text).toContain("failed");
      expect(text).toContain("Rate limit exceeded");
    });
  });

  describe("formatErrorResponse", () => {
    it("should format error with message", () => {
      const error = new Error("Crawl not found: test123");
      const result = formatErrorResponse(error);

      expect(result.content[0].text).toContain("Profile error");
      expect(result.content[0].text).toContain("Crawl not found");
      expect(result.isError).toBe(true);
    });
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npm test tools/profile/response.test.ts
```

**Expected:** Fails with "Cannot find module './response.js'"

**Step 3: Implement basic response formatter (Part 1)**

Create `apps/mcp/tools/profile/response.ts`:

```typescript
import type { CrawlMetricsResponse, PerPageMetric } from "./types.js";
import type { ProfileOptions } from "./schema.js";

interface ToolResponse {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

/**
 * Format duration in human-readable format
 */
function formatDuration(ms: number | null): string {
  if (ms === null) return "N/A";

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s (${ms.toLocaleString()}ms)`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s (${ms.toLocaleString()}ms)`;
  }
  return `${seconds}s (${ms.toLocaleString()}ms)`;
}

/**
 * Format timestamp in EST
 */
function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  return (
    date.toLocaleString("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }) + " EST"
  );
}

/**
 * Calculate percentage of total
 */
function percentage(part: number, total: number): string {
  if (total === 0) return "0.0%";
  return `${((part / total) * 100).toFixed(1)}%`;
}

/**
 * Format profile response for Claude
 */
export function formatProfileResponse(
  metrics: CrawlMetricsResponse,
  options: ProfileOptions
): ToolResponse {
  const lines: string[] = [];

  // Header
  lines.push(`Crawl Performance Profile: ${metrics.crawl_id}`);
  lines.push(`URL: ${metrics.crawl_url}`);

  // Status
  const statusIcon =
    metrics.status === "completed"
      ? "✓"
      : metrics.status === "failed"
      ? "❌"
      : "🔄";
  const successText =
    metrics.success === true
      ? "(succeeded)"
      : metrics.success === false
      ? "(failed)"
      : "";
  lines.push(`Status: ${metrics.status} ${statusIcon} ${successText}`);

  // Timestamps
  lines.push(`Started: ${formatTimestamp(metrics.started_at)}`);
  if (metrics.completed_at) {
    lines.push(`Completed: ${formatTimestamp(metrics.completed_at)}`);
  }
  if (metrics.duration_ms !== null) {
    lines.push(`Duration: ${formatDuration(metrics.duration_ms)}`);
  }

  // Pages
  lines.push("");
  lines.push(`Pages Processed: ${metrics.total_pages} total`);
  lines.push(`├─ Indexed: ${metrics.pages_indexed} pages`);
  lines.push(`└─ Failed: ${metrics.pages_failed} pages`);

  // Performance breakdown
  const { aggregate_timing } = metrics;
  const totalIndexing =
    aggregate_timing.chunking_ms +
    aggregate_timing.embedding_ms +
    aggregate_timing.qdrant_ms +
    aggregate_timing.bm25_ms;

  if (totalIndexing > 0) {
    lines.push("");
    lines.push("Performance Breakdown (aggregate):");
    lines.push(
      `├─ Chunking:   ${aggregate_timing.chunking_ms.toLocaleString()}ms (${percentage(
        aggregate_timing.chunking_ms,
        totalIndexing
      )})`
    );
    lines.push(
      `├─ Embedding: ${aggregate_timing.embedding_ms.toLocaleString()}ms (${percentage(
        aggregate_timing.embedding_ms,
        totalIndexing
      )})`
    );
    lines.push(
      `├─ Qdrant:     ${aggregate_timing.qdrant_ms.toLocaleString()}ms (${percentage(
        aggregate_timing.qdrant_ms,
        totalIndexing
      )})`
    );
    lines.push(
      `└─ BM25:       ${aggregate_timing.bm25_ms.toLocaleString()}ms (${percentage(
        aggregate_timing.bm25_ms,
        totalIndexing
      )})`
    );

    lines.push("");
    lines.push(`Indexing time: ${totalIndexing.toLocaleString()}ms total`);
    if (metrics.total_pages > 0) {
      const avgPerPage = Math.round(totalIndexing / metrics.total_pages);
      lines.push(`Per-page average: ${avgPerPage.toLocaleString()}ms/page`);
    }
  }

  // End-to-end latency
  if (metrics.e2e_duration_ms !== null) {
    lines.push("");
    lines.push(
      `End-to-end latency: ${formatDuration(metrics.e2e_duration_ms)} (from MCP request to completion)`
    );
  }

  // Crawl-level error
  if (metrics.error_message) {
    lines.push("");
    lines.push(`❌ Crawl Error: ${metrics.error_message}`);
  }

  // In-progress hint
  if (metrics.status === "in_progress") {
    lines.push("");
    lines.push(
      "💡 Crawl is still in progress. Use profile_crawl again to see updated metrics."
    );
  }

  return {
    content: [
      {
        type: "text",
        text: lines.join("\n"),
      },
    ],
  };
}

/**
 * Format error response
 */
export function formatErrorResponse(error: Error): ToolResponse {
  return {
    content: [
      {
        type: "text",
        text: `Profile error: ${error.message}`,
      },
    ],
    isError: true,
  };
}
```

**Step 4: Run tests to verify they pass**

```bash
npm test tools/profile/response.test.ts
```

**Expected:** All 8 tests pass

**Step 5: Commit**

```bash
git add apps/mcp/tools/profile/response.ts apps/mcp/tools/profile/response.test.ts
git commit -m "feat(mcp): add response formatter for profile_crawl tool (part 1)

- Create formatProfileResponse with basic formatting
- Format header with crawl ID, URL, status
- Format timestamps in EST timezone
- Show performance breakdown with percentages
- Calculate per-page averages
- Handle in-progress, completed, and failed states
- Format errors with clear messaging
- Add 8 comprehensive tests"
```

---

### Task 5: Add Error Section and Insights (Part 2)

**Files:**
- Modify: `apps/mcp/tools/profile/response.ts`
- Modify: `apps/mcp/tools/profile/response.test.ts`

**Step 1: Add tests for error section and insights**

Add to `apps/mcp/tools/profile/response.test.ts`:

```typescript
describe("Error section", () => {
  it("should show errors when per_page_metrics included", () => {
    const withErrors: CrawlMetricsResponse = {
      ...mockCompletedCrawl,
      per_page_metrics: [
        {
          url: "/failed-page",
          operation_type: "chunking",
          operation_name: "chunk_text",
          duration_ms: 0,
          success: false,
          timestamp: "2025-11-13T22:01:00Z",
        },
        {
          url: "/another-fail",
          operation_type: "embedding",
          operation_name: "embed_batch",
          duration_ms: 0,
          success: false,
          timestamp: "2025-11-13T22:02:00Z",
        },
      ],
    };

    const result = formatProfileResponse(withErrors, {
      crawl_id: "test123",
      include_details: true,
    });

    const text = result.content[0].text;
    expect(text).toContain("⚠️ Errors Encountered");
    expect(text).toContain("2 operations failed");
    expect(text).toContain("/failed-page");
    expect(text).toContain("/another-fail");
    expect(text).toContain("Chunking Errors");
    expect(text).toContain("Embedding Errors");
  });

  it("should paginate errors correctly", () => {
    const errors = Array.from({ length: 20 }, (_, i) => ({
      url: `/page-${i}`,
      operation_type: "embedding",
      operation_name: "embed_batch",
      duration_ms: 0,
      success: false,
      timestamp: `2025-11-13T22:${String(i).padStart(2, "0")}:00Z`,
    }));

    const withManyErrors: CrawlMetricsResponse = {
      ...mockCompletedCrawl,
      per_page_metrics: errors,
    };

    const result = formatProfileResponse(withManyErrors, {
      crawl_id: "test123",
      include_details: true,
      error_offset: 0,
      error_limit: 5,
    });

    const text = result.content[0].text;
    expect(text).toContain("20 operations failed");
    expect(text).toContain("showing 5 of 20");
    expect(text).toContain("15 more errors available");
    expect(text).toContain("error_offset=5");
  });

  it("should sort errors by timestamp (most recent first)", () => {
    const withErrors: CrawlMetricsResponse = {
      ...mockCompletedCrawl,
      per_page_metrics: [
        {
          url: "/old-error",
          operation_type: "chunking",
          operation_name: "chunk_text",
          duration_ms: 0,
          success: false,
          timestamp: "2025-11-13T22:01:00Z",
        },
        {
          url: "/recent-error",
          operation_type: "chunking",
          operation_name: "chunk_text",
          duration_ms: 0,
          success: false,
          timestamp: "2025-11-13T22:05:00Z",
        },
      ],
    };

    const result = formatProfileResponse(withErrors, {
      crawl_id: "test123",
      include_details: true,
    });

    const text = result.content[0].text;
    const recentIndex = text.indexOf("/recent-error");
    const oldIndex = text.indexOf("/old-error");
    expect(recentIndex).toBeLessThan(oldIndex);
  });
});

describe("Insights section", () => {
  it("should show insights for completed crawls", () => {
    const result = formatProfileResponse(mockCompletedCrawl, {
      crawl_id: "test123",
    });

    const text = result.content[0].text;
    expect(text).toContain("💡 Insights");
  });

  it("should identify slowest operation", () => {
    const result = formatProfileResponse(mockCompletedCrawl, {
      crawl_id: "test123",
    });

    const text = result.content[0].text;
    // Embedding is slowest at 5000ms
    expect(text).toMatch(/Embedding accounts for.*of indexing time/);
  });

  it("should show failure rate if pages failed", () => {
    const result = formatProfileResponse(mockCompletedCrawl, {
      crawl_id: "test123",
    });

    const text = result.content[0].text;
    expect(text).toMatch(/10\.0% failure rate.*\(1\/10 pages\)/);
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npm test tools/profile/response.test.ts
```

**Expected:** New tests fail (error section and insights not implemented)

**Step 3: Implement error section and insights**

Add to `apps/mcp/tools/profile/response.ts` (before formatProfileResponse return):

```typescript
/**
 * Build error section from per-page metrics
 */
function buildErrorSection(
  metrics: CrawlMetricsResponse,
  options: ProfileOptions
): string {
  if (!metrics.per_page_metrics || metrics.per_page_metrics.length === 0) {
    return "";
  }

  // Filter to failed operations
  const errors = metrics.per_page_metrics
    .filter((m) => !m.success)
    .sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

  if (errors.length === 0) {
    return "";
  }

  // Apply pagination
  const { error_offset = 0, error_limit = 5 } = options;
  const paginatedErrors = errors.slice(error_offset, error_offset + error_limit);
  const hasMore = errors.length > error_offset + error_limit;

  // Group by operation type
  const errorsByType = new Map<string, PerPageMetric[]>();
  for (const error of paginatedErrors) {
    const type = error.operation_type;
    if (!errorsByType.has(type)) {
      errorsByType.set(type, []);
    }
    errorsByType.get(type)!.push(error);
  }

  let output = `\n⚠️ Errors Encountered: ${errors.length} operation${
    errors.length === 1 ? "" : "s"
  } failed`;
  if (errors.length > error_limit) {
    output += ` (showing ${paginatedErrors.length} of ${errors.length})`;
  }
  output += "\n\n";

  // Format errors by type
  for (const [type, typeErrors] of errorsByType) {
    output += `${type.charAt(0).toUpperCase() + type.slice(1)} Errors (${
      typeErrors.length
    }):\n`;
    for (const error of typeErrors) {
      const url = error.url || "(unknown page)";
      const timestamp = formatTimestamp(error.timestamp);
      output += `├─ ${url} (${timestamp})\n`;
      output += `│  └─ Error: ${error.operation_name} failed\n`;
    }
    output += "\n";
  }

  // Pagination hint
  if (hasMore) {
    const remaining = errors.length - error_offset - error_limit;
    output += `📄 ${remaining} more error${remaining === 1 ? "" : "s"} available. `;
    output += `Use error_offset=${error_offset + error_limit} to see next page.\n`;
  }

  return output;
}

/**
 * Build performance insights section
 */
function buildInsights(metrics: CrawlMetricsResponse): string {
  const { aggregate_timing, total_pages, duration_ms } = metrics;
  const totalIndexing =
    aggregate_timing.chunking_ms +
    aggregate_timing.embedding_ms +
    aggregate_timing.qdrant_ms +
    aggregate_timing.bm25_ms;

  if (totalIndexing === 0) {
    return "";
  }

  let insights = "\n💡 Insights:\n";

  // Find slowest operation
  const operations = [
    { name: "Chunking", ms: aggregate_timing.chunking_ms },
    { name: "Embedding", ms: aggregate_timing.embedding_ms },
    { name: "Qdrant", ms: aggregate_timing.qdrant_ms },
    { name: "BM25", ms: aggregate_timing.bm25_ms },
  ];
  const slowest = operations.reduce((a, b) => (a.ms > b.ms ? a : b));

  const slowestPercent = percentage(slowest.ms, totalIndexing);
  insights += `- ${slowest.name} accounts for ${slowestPercent} of indexing time `;
  insights += `(${slowest.ms.toLocaleString()}ms / ${totalIndexing.toLocaleString()}ms)\n`;

  // Per-page averages
  if (total_pages > 0) {
    const avgPerPage = Math.round(totalIndexing / total_pages);
    insights += `- Average ${avgPerPage.toLocaleString()}ms/page for indexing\n`;

    if (aggregate_timing.embedding_ms > 0) {
      const avgEmbedding = Math.round(
        aggregate_timing.embedding_ms / total_pages
      );
      insights += `- Average ${avgEmbedding.toLocaleString()}ms/page for embeddings`;
      if (avgEmbedding > 1000) {
        insights += ` - consider optimizing batch size`;
      }
      insights += "\n";
    }
  }

  // Failure rate
  if (metrics.pages_failed > 0) {
    const failureRate = percentage(metrics.pages_failed, total_pages);
    insights += `- ${failureRate} failure rate (${metrics.pages_failed}/${total_pages} pages)\n`;
  }

  return insights;
}
```

Then in `formatProfileResponse`, add before the in-progress hint:

```typescript
  // Errors (after crawl-level error section)
  const errorSection = buildErrorSection(metrics, options);
  if (errorSection) {
    lines.push(errorSection);
  }

  // Insights
  const insights = buildInsights(metrics);
  if (insights) {
    lines.push(insights);
  }
```

**Step 4: Run tests to verify they pass**

```bash
npm test tools/profile/response.test.ts
```

**Expected:** All 14 tests pass

**Step 5: Commit**

```bash
git add apps/mcp/tools/profile/response.ts apps/mcp/tools/profile/response.test.ts
git commit -m "feat(mcp): add error section and insights to profile_crawl (part 2)

- Build error section with pagination
- Group errors by operation type
- Sort errors by timestamp (most recent first)
- Show pagination hints when errors exceed limit
- Generate performance insights
- Identify slowest operation with percentage
- Calculate per-page averages
- Show failure rate if pages failed
- Add 6 new tests (14 total)"
```

---

## Phase 4: Tool Registration

### Task 6: Create Tool Factory and Registration

**Files:**
- Create: `apps/mcp/tools/profile/index.ts`
- Create: `apps/mcp/tools/profile/index.test.ts`
- Modify: `apps/mcp/tools/registration.ts`

**Step 1: Write test for tool factory**

Create `apps/mcp/tools/profile/index.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { createProfileTool } from "./index.js";

describe("createProfileTool", () => {
  it("should create tool with correct name", () => {
    const tool = createProfileTool({
      baseUrl: "http://localhost:52100",
      apiSecret: "test-secret",
    });

    expect(tool.name).toBe("profile_crawl");
  });

  it("should have description", () => {
    const tool = createProfileTool({
      baseUrl: "http://localhost:52100",
      apiSecret: "test-secret",
    });

    expect(tool.description).toBeTruthy();
    expect(tool.description).toContain("debug");
    expect(tool.description).toContain("performance");
  });

  it("should have input schema", () => {
    const tool = createProfileTool({
      baseUrl: "http://localhost:52100",
      apiSecret: "test-secret",
    });

    expect(tool.inputSchema).toBeDefined();
    expect(tool.inputSchema.type).toBe("object");
    expect(tool.inputSchema.required).toContain("crawl_id");
  });

  it("should have handler function", () => {
    const tool = createProfileTool({
      baseUrl: "http://localhost:52100",
      apiSecret: "test-secret",
    });

    expect(tool.handler).toBeDefined();
    expect(typeof tool.handler).toBe("function");
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npm test tools/profile/index.test.ts
```

**Expected:** Fails with "Cannot find module './index.js'"

**Step 3: Implement tool factory**

Create `apps/mcp/tools/profile/index.ts`:

```typescript
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { ProfileClient } from "./client.js";
import { profileOptionsSchema, buildProfileInputSchema } from "./schema.js";
import { formatProfileResponse, formatErrorResponse } from "./response.js";

export interface ProfileConfig {
  baseUrl: string;
  apiSecret: string;
  timeout?: number;
}

/**
 * Create profile_crawl tool for debugging crawl performance
 */
export function createProfileTool(config: ProfileConfig): Tool {
  const client = new ProfileClient(config);

  return {
    name: "profile_crawl",
    description:
      "Debug and profile crawl performance by querying lifecycle metrics. " +
      "Returns comprehensive diagnostics including performance breakdowns, error analysis, " +
      "and optimization insights. Use this after triggering a crawl to understand bottlenecks, " +
      "investigate failures, or monitor progress.",
    inputSchema: buildProfileInputSchema(),

    handler: async (args: unknown) => {
      try {
        const validatedArgs = profileOptionsSchema.parse(args);
        const metrics = await client.getMetrics(
          validatedArgs.crawl_id,
          validatedArgs.include_details
        );
        return formatProfileResponse(metrics, validatedArgs);
      } catch (error) {
        return formatErrorResponse(
          error instanceof Error ? error : new Error(String(error))
        );
      }
    },
  };
}

// Re-export types for consumers
export type { ProfileConfig };
export type { ProfileOptions } from "./schema.js";
export type { CrawlMetricsResponse } from "./types.js";
```

**Step 4: Run tests to verify they pass**

```bash
npm test tools/profile/index.test.ts
```

**Expected:** All 4 tests pass

**Step 5: Update tool registration**

Modify `apps/mcp/tools/registration.ts`:

Add import at top:
```typescript
import { createProfileTool } from "./profile/index.js";
```

Add after query tool registration (around line 80):
```typescript
  // Register profile_crawl tool if webhook config available
  if (config.webhookBaseUrl && config.webhookApiSecret) {
    const profileTool = createProfileTool({
      baseUrl: config.webhookBaseUrl,
      apiSecret: config.webhookApiSecret,
    });
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (request.params.name === "profile_crawl") {
        return await profileTool.handler(request.params.arguments ?? {});
      }
      // ... existing handlers
    });
    logger.info("Registered profile_crawl tool");
  } else {
    logger.warn("Skipping profile_crawl tool: webhook config not provided");
  }
```

**Step 6: Run all profile tool tests**

```bash
npm test tools/profile/
```

**Expected:** All tests pass (schema: 9, client: 9, response: 14, index: 4 = 36 tests)

**Step 7: Commit**

```bash
git add apps/mcp/tools/profile/index.ts \
        apps/mcp/tools/profile/index.test.ts \
        apps/mcp/tools/registration.ts
git commit -m "feat(mcp): add profile_crawl tool factory and registration

- Create createProfileTool factory function
- Integrate ProfileClient, schema, and response formatter
- Add tool handler with error handling
- Register tool in MCP server
- Require webhook config (baseUrl, apiSecret)
- Log registration status
- Add 4 factory tests (36 tests total for profile tool)"
```

---

## Phase 5: Integration Testing

### Task 7: Add Integration Tests

**Files:**
- Create: `apps/mcp/tools/profile/integration.test.ts`

**Step 1: Create integration tests**

Create `apps/mcp/tools/profile/integration.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createProfileTool } from "./index.js";

/**
 * Integration tests for profile_crawl tool
 *
 * These tests require:
 * - Webhook service running at WEBHOOK_BASE_URL
 * - Valid WEBHOOK_API_SECRET
 * - Test crawl session in database
 *
 * Skip if environment not configured:
 * npm test -- --run --testNamePattern="^((?!integration).)*$"
 */

const WEBHOOK_BASE_URL = process.env.WEBHOOK_BASE_URL || "http://localhost:52100";
const WEBHOOK_API_SECRET = process.env.WEBHOOK_API_SECRET || "";
const SKIP_INTEGRATION = !WEBHOOK_API_SECRET || WEBHOOK_BASE_URL.includes("localhost");

describe.skipIf(SKIP_INTEGRATION)("ProfileTool Integration", () => {
  let tool: ReturnType<typeof createProfileTool>;

  beforeAll(() => {
    tool = createProfileTool({
      baseUrl: WEBHOOK_BASE_URL,
      apiSecret: WEBHOOK_API_SECRET,
    });
  });

  it("should handle unknown crawl_id gracefully", async () => {
    const result = await tool.handler({
      crawl_id: "nonexistent-crawl-id-12345",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Crawl not found");
  });

  // Note: Real crawl tests would require creating test data in database
  // or using a known test crawl_id. Example:
  //
  // it("should fetch real crawl metrics", async () => {
  //   const result = await tool.handler({
  //     crawl_id: "real-test-crawl-id",
  //   });
  //
  //   expect(result.isError).toBeUndefined();
  //   expect(result.content[0].text).toContain("Crawl Performance Profile");
  // });
});
```

**Step 2: Run integration tests**

```bash
# Skip integration tests (default for CI)
npm test tools/profile/integration.test.ts

# Run integration tests (requires services)
WEBHOOK_BASE_URL=http://localhost:52100 \
WEBHOOK_API_SECRET=your-secret \
npm test tools/profile/integration.test.ts
```

**Expected:** Tests skipped in local environment (or pass if services configured)

**Step 3: Commit**

```bash
git add apps/mcp/tools/profile/integration.test.ts
git commit -m "test(mcp): add integration tests for profile_crawl tool

- Add integration test for unknown crawl_id
- Skip tests if webhook service not configured
- Document environment variable requirements
- Placeholder for real crawl metric tests"
```

---

## Phase 6: Documentation and Final Verification

### Task 8: Update Documentation

**Files:**
- Modify: `apps/mcp/CLAUDE.md`
- Modify: `apps/mcp/README.md`

**Step 1: Update CLAUDE.md**

Add to `apps/mcp/CLAUDE.md` in the "MCP Tools" section:

```markdown
### profile_crawl

**Purpose:** Debug and profile crawl performance

**Parameters:**
- `crawl_id` (required): Firecrawl job/crawl identifier
- `include_details` (optional, default: false): Include per-page operation breakdowns
- `error_offset` (optional, default: 0): Error pagination offset
- `error_limit` (optional, default: 5, max: 50): Max errors per page

**Returns:** Plain-text diagnostic report with:
- Performance breakdown with percentages
- Aggregate timing metrics
- Error analysis (paginated)
- Actionable insights and recommendations
- Support for in-progress, completed, and failed crawls

**Usage:**
```typescript
// After triggering a crawl
const crawlResult = await crawl({ url: "https://example.com" });

// Profile the crawl
const profile = await profile_crawl({ crawl_id: crawlResult.id });

// Get detailed breakdown
const details = await profile_crawl({
  crawl_id: crawlResult.id,
  include_details: true,
});

// Page through errors
const errors = await profile_crawl({
  crawl_id: crawlResult.id,
  error_offset: 5,
  error_limit: 10,
});
```

**Environment Variables:**
- `MCP_WEBHOOK_BASE_URL`: Webhook service URL (e.g., http://pulse_webhook:52100)
- `MCP_WEBHOOK_API_SECRET`: API authentication secret
```

**Step 2: Update README.md**

Add to `apps/mcp/README.md` in the "Tools" section:

```markdown
#### profile_crawl

Query crawl performance metrics and debug issues.

**Use cases:**
- Performance analysis: "Why is this crawl slow?"
- Failure investigation: "Which pages failed and why?"
- Progress monitoring: "How many pages indexed so far?"
- Optimization: "What operations are bottlenecks?"

**Examples:**
- `profile_crawl({ crawl_id: "abc123" })` - Basic performance profile
- `profile_crawl({ crawl_id: "abc123", include_details: true })` - Detailed breakdown
- `profile_crawl({ crawl_id: "abc123", error_offset: 10 })` - Page through errors
```

**Step 3: Commit documentation**

```bash
git add apps/mcp/CLAUDE.md apps/mcp/README.md
git commit -m "docs(mcp): add profile_crawl tool documentation

- Add tool description to CLAUDE.md
- Document parameters and usage examples
- Add use cases to README.md
- Document environment variables"
```

---

## Phase 7: Final Verification

### Task 9: Run Full Test Suite and Build

**Step 1: Run all tests**

```bash
cd apps/mcp
npm test
```

**Expected:** All tests pass (including profile tool: 37 tests)

**Step 2: Build the project**

```bash
npm run build
```

**Expected:** Build succeeds with no TypeScript errors

**Step 3: Verify tool registration**

```bash
# Start MCP server (requires services running)
npm run dev

# In another terminal, check tool list
# (would use MCP client to list tools)
```

**Expected:** `profile_crawl` appears in tool list

**Step 4: Manual testing (optional)**

```bash
# Create test crawl session in database (using webhook API)
curl -X POST http://localhost:52100/api/webhook/crawl \
  -H "X-API-Secret: $WEBHOOK_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"data": [...], "id": "test-crawl-123", ...}'

# Query metrics via MCP tool
# (would use MCP client to call profile_crawl)
```

**Step 5: Final commit**

```bash
git add .
git commit -m "chore(mcp): verify profile_crawl tool implementation

- All 37 tests passing
- Build succeeds with no errors
- Tool registered successfully
- Ready for production use"
```

---

## Success Criteria

After completing all tasks, verify:

1. **Types and Schema** ✓
   - Types match webhook API response exactly
   - Schema validates all parameters correctly
   - JSON schema builds without errors
   - 9 schema tests passing

2. **HTTP Client** ✓
   - Makes GET request to correct endpoint
   - Handles authentication with X-API-Secret header
   - Includes query parameter when needed
   - Error handling for 404, 401/403, 500+
   - 9 client tests passing

3. **Response Formatting** ✓
   - Plain-text diagnostic report
   - Performance breakdown with percentages
   - Error section with pagination
   - Insights with actionable recommendations
   - 14 response tests passing

4. **Tool Registration** ✓
   - Tool factory creates valid MCP tool
   - Handler integrates all components
   - Registered in MCP server
   - 4 factory tests passing

5. **Integration** ✓
   - Integration tests for error cases
   - All 37 tests passing
   - Build succeeds
   - Documentation updated

6. **Code Quality** ✓
   - Type hints on all functions
   - Comprehensive error handling
   - Clear, descriptive naming
   - Following existing tool patterns

---

## Plan Complete

**Plan saved to:** `docs/plans/2025-11-13-profile-crawl-tool-implementation.md`

**Two execution options:**

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
