# Profile Crawl MCP Tool - Design Document

**Date:** 2025-11-13
**Status:** Design Complete
**Dependencies:** Timing Instrumentation (completed in feat/mcp-resources-and-worker-improvements)

## Overview

Create an MCP tool that enables Claude to debug and profile crawl performance by querying the metrics API built in the timing instrumentation feature. This tool provides comprehensive diagnostics including performance breakdowns, error analysis, and actionable insights.

## Motivation

After triggering a crawl with the `crawl` tool, users need visibility into:
- **Performance bottlenecks** - Which operations are slow? Where should we optimize?
- **Failure analysis** - Which pages failed? What errors occurred?
- **Progress monitoring** - Is the crawl still running? How many pages indexed?
- **Optimization guidance** - What configuration changes would improve performance?

The `profile_crawl` tool gives Claude this diagnostic capability, enabling intelligent debugging and performance tuning.

## Architecture

### Tool Overview

**Name:** `profile_crawl`

**Purpose:** Query crawl lifecycle metrics and operational performance data

**Integration:** Calls the webhook metrics API (`GET /api/metrics/crawls/{crawl_id}`)

**Response Format:** Plain-text diagnostic report optimized for Claude analysis

### Parameters

```typescript
interface ProfileOptions {
  crawl_id: string;           // Required: Firecrawl job/crawl identifier
  include_details?: boolean;  // Optional: Include per-page operation breakdowns (default: false)
  error_offset?: number;      // Optional: Error pagination offset (default: 0)
  error_limit?: number;       // Optional: Max errors per page (default: 5, max: 50)
}
```

### HTTP Client Pattern

Following the `query` tool pattern:

```typescript
export class ProfileClient {
  private baseUrl: string;
  private apiSecret: string;
  private timeout: number;

  constructor(config: ProfileConfig) {
    this.baseUrl = config.baseUrl;         // MCP_WEBHOOK_BASE_URL
    this.apiSecret = config.apiSecret;     // MCP_WEBHOOK_API_SECRET
    this.timeout = config.timeout ?? 30000;
  }

  async getMetrics(
    crawl_id: string,
    include_per_page: boolean
  ): Promise<CrawlMetricsResponse> {
    const url = `${this.baseUrl}/api/metrics/crawls/${crawl_id}`;
    const params = include_per_page ? '?include_per_page=true' : '';

    const response = await fetch(`${url}${params}`, {
      headers: {
        'X-API-Secret': this.apiSecret,
      },
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Crawl not found: ${crawl_id}`);
      }
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }
}
```

## Response Formatting

### Basic Report (include_details: false)

```
Crawl Performance Profile: abc123
URL: https://example.com
Status: completed ✓ (succeeded)
Duration: 5 minutes 23 seconds (323,000ms)

Pages Processed: 25 total
├─ Indexed: 24 pages
└─ Failed: 1 page

Performance Breakdown (aggregate):
├─ Chunking:   5,000ms (1.5%)
├─ Embedding: 15,000ms (4.6%)
├─ Qdrant:     8,000ms (2.5%)
└─ BM25:       3,000ms (0.9%)

Indexing time: 31,000ms total
Per-page average: 1,291ms/page

End-to-end latency: 305,000ms (from MCP request to completion)

⚠️ Errors Encountered: 3 operations failed (showing 5 most recent)

Chunking Errors (1):
├─ /broken-page (2025-11-13 22:03:15 EST)
│  └─ Error: Request timeout after 60000ms

Embedding Errors (2):
├─ /long-document (2025-11-13 22:04:02 EST)
│  └─ Error: Embedding batch size exceeded: 8192 tokens (max: 8000)
├─ /special-chars (2025-11-13 22:04:45 EST)
│  └─ Error: Invalid UTF-8 sequence in text

💡 Insights:
- Embedding accounts for 48% of indexing time (15s / 31s)
- Average 600ms/page for embeddings suggests batch size could be optimized
- 1 page failed during chunking (timeout) - consider increasing CHUNK_TIMEOUT
```

### Detailed Report (include_details: true)

Adds per-page breakdown:

```
Slowest Pages (top 10 by total indexing time):
1. /long-article (3,500ms)
   ├─ Chunking:   600ms
   ├─ Embedding: 2,100ms
   ├─ Qdrant:     600ms
   └─ BM25:       200ms

2. /technical-doc (3,200ms)
   ├─ Chunking:   800ms
   ├─ Embedding: 1,900ms
   ├─ Qdrant:     350ms
   └─ BM25:       150ms

...
```

### Error Pagination

When errors exceed `error_limit`:

```
⚠️ Errors Encountered: 47 operations failed (showing 5 of 47)

[First 5 errors listed]

📄 42 more errors available. Use error_offset=5 to see next page.
```

### Failed Crawl Format

When crawl status is "failed":

```
❌ Crawl Failed
URL: https://example.com
Error: Rate limit exceeded (429 Too Many Requests)

Timeline:
├─ Started:   2025-11-13 22:00:00 EST
├─ Failed:    2025-11-13 22:01:23 EST
└─ Duration:  1m 23s before failure

Pages Processed Before Failure: 5 pages
Last successful page: /intro
```

### In-Progress Crawl Format

When crawl status is "in_progress":

```
🔄 Crawl In Progress: abc123
URL: https://example.com
Started: 2025-11-13 22:00:00 EST
Running for: 2 minutes 15 seconds

Current Progress:
├─ Pages indexed: 12
├─ Pages failed: 0
└─ Estimated completion: ~3 minutes remaining

Recent Operations (last 5 pages):
1. /page-12 - indexed (1,200ms)
2. /page-11 - indexed (980ms)
3. /page-10 - indexed (1,450ms)
...

💡 Use profile_crawl again in a few minutes to see final results.
```

## File Structure

```
apps/mcp/tools/profile/
├── index.ts              # Tool factory and exports
├── schema.ts             # Zod schemas and input schema builder
├── schema.test.ts        # Schema validation tests
├── client.ts             # HTTP client for metrics API
├── client.test.ts        # Client unit tests
├── response.ts           # Format diagnostic reports
├── response.test.ts      # Response formatting tests
├── types.ts              # TypeScript types for API responses
├── registration.ts       # Tool registration logic
└── registration.test.ts  # Registration tests
```

## Implementation Details

### Schema Definition

**File:** `apps/mcp/tools/profile/schema.ts`

```typescript
import { z } from "zod";

/**
 * Parameter descriptions for profile tool
 */
export const PARAM_DESCRIPTIONS = {
  crawl_id: 'Firecrawl crawl/job identifier returned by the crawl tool',
  include_details: 'Include per-page operation breakdowns and detailed performance metrics. Default: false',
  error_offset: 'Error pagination offset (0-based). Use to page through errors when total exceeds error_limit. Default: 0',
  error_limit: 'Maximum number of errors to return per page (1-50). Default: 5',
};

/**
 * Profile tool options schema
 */
export const profileOptionsSchema = z.object({
  crawl_id: z.string().min(1).describe(PARAM_DESCRIPTIONS.crawl_id),
  include_details: z.boolean().optional().default(false)
    .describe(PARAM_DESCRIPTIONS.include_details),
  error_offset: z.number().int().min(0).optional().default(0)
    .describe(PARAM_DESCRIPTIONS.error_offset),
  error_limit: z.number().int().min(1).max(50).optional().default(5)
    .describe(PARAM_DESCRIPTIONS.error_limit),
});

export type ProfileOptions = z.infer<typeof profileOptionsSchema>;

/**
 * Build JSON schema for profile tool input
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

### Types

**File:** `apps/mcp/tools/profile/types.ts`

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

### HTTP Client

**File:** `apps/mcp/tools/profile/client.ts`

```typescript
import type { CrawlMetricsResponse } from "./types.js";

export interface ProfileConfig {
  baseUrl: string;
  apiSecret: string;
  timeout?: number;
}

export class ProfileClient {
  private baseUrl: string;
  private apiSecret: string;
  private timeout: number;

  constructor(config: ProfileConfig) {
    this.baseUrl = config.baseUrl;
    this.apiSecret = config.apiSecret;
    this.timeout = config.timeout ?? 30000;
  }

  async getMetrics(
    crawl_id: string,
    include_per_page: boolean = false
  ): Promise<CrawlMetricsResponse> {
    const url = `${this.baseUrl}/api/metrics/crawls/${crawl_id}`;
    const params = include_per_page ? '?include_per_page=true' : '';

    const response = await fetch(`${url}${params}`, {
      method: 'GET',
      headers: {
        'X-API-Secret': this.apiSecret,
        'Content-Type': 'application/json',
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
        throw new Error('Authentication failed: Invalid API secret');
      }

      const errorText = await response.text().catch(() => response.statusText);
      throw new Error(`Metrics API error (${response.status}): ${errorText}`);
    }

    return await response.json();
  }
}
```

### Response Formatter

**File:** `apps/mcp/tools/profile/response.ts`

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
  return date.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }) + ' EST';
}

/**
 * Calculate percentage of total
 */
function percentage(part: number, total: number): string {
  if (total === 0) return "0.0%";
  return `${((part / total) * 100).toFixed(1)}%`;
}

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
    .filter(m => !m.success)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

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

  let output = `\n⚠️ Errors Encountered: ${errors.length} operation${errors.length === 1 ? '' : 's'} failed`;
  if (errors.length > error_limit) {
    output += ` (showing ${paginatedErrors.length} of ${errors.length})`;
  }
  output += '\n\n';

  // Format errors by type
  for (const [type, typeErrors] of errorsByType) {
    output += `${type.charAt(0).toUpperCase() + type.slice(1)} Errors (${typeErrors.length}):\n`;
    for (const error of typeErrors) {
      const url = error.url || '(unknown page)';
      const timestamp = formatTimestamp(error.timestamp);
      output += `├─ ${url} (${timestamp})\n`;
      output += `│  └─ Error: ${error.operation_name} failed\n`;
    }
    output += '\n';
  }

  // Pagination hint
  if (hasMore) {
    const remaining = errors.length - error_offset - error_limit;
    output += `📄 ${remaining} more error${remaining === 1 ? '' : 's'} available. `;
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

  let insights = '\n💡 Insights:\n';

  // Find slowest operation
  const operations = [
    { name: 'Chunking', ms: aggregate_timing.chunking_ms },
    { name: 'Embedding', ms: aggregate_timing.embedding_ms },
    { name: 'Qdrant', ms: aggregate_timing.qdrant_ms },
    { name: 'BM25', ms: aggregate_timing.bm25_ms },
  ];
  const slowest = operations.reduce((a, b) => a.ms > b.ms ? a : b);

  const slowestPercent = percentage(slowest.ms, totalIndexing);
  insights += `- ${slowest.name} accounts for ${slowestPercent} of indexing time `;
  insights += `(${slowest.ms.toLocaleString()}ms / ${totalIndexing.toLocaleString()}ms)\n`;

  // Per-page averages
  if (total_pages > 0) {
    const avgPerPage = Math.round(totalIndexing / total_pages);
    insights += `- Average ${avgPerPage.toLocaleString()}ms/page for indexing\n`;

    if (aggregate_timing.embedding_ms > 0) {
      const avgEmbedding = Math.round(aggregate_timing.embedding_ms / total_pages);
      insights += `- Average ${avgEmbedding.toLocaleString()}ms/page for embeddings`;
      if (avgEmbedding > 1000) {
        insights += ` - consider optimizing batch size`;
      }
      insights += '\n';
    }
  }

  // Failure rate
  if (metrics.pages_failed > 0) {
    const failureRate = percentage(metrics.pages_failed, total_pages);
    insights += `- ${failureRate} failure rate (${metrics.pages_failed}/${total_pages} pages)\n`;
  }

  return insights;
}

/**
 * Build detailed per-page section
 */
function buildPerPageSection(metrics: CrawlMetricsResponse): string {
  if (!metrics.per_page_metrics || metrics.per_page_metrics.length === 0) {
    return "";
  }

  // Calculate total time per URL
  const urlTotals = new Map<string, number>();
  for (const metric of metrics.per_page_metrics) {
    if (!metric.url || !metric.success) continue;
    const current = urlTotals.get(metric.url) || 0;
    urlTotals.set(metric.url, current + metric.duration_ms);
  }

  // Sort by total time (slowest first)
  const sorted = Array.from(urlTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  if (sorted.length === 0) {
    return "";
  }

  let output = '\nSlowest Pages (top 10 by total indexing time):\n';

  for (let i = 0; i < sorted.length; i++) {
    const [url, totalMs] = sorted[i];
    output += `${i + 1}. ${url} (${totalMs.toLocaleString()}ms)\n`;

    // Find operations for this URL
    const urlOps = metrics.per_page_metrics
      .filter(m => m.url === url && m.success)
      .sort((a, b) => b.duration_ms - a.duration_ms);

    for (const op of urlOps) {
      const icon = op === urlOps[urlOps.length - 1] ? '└─' : '├─';
      output += `   ${icon} ${op.operation_type}: ${op.duration_ms.toLocaleString()}ms\n`;
    }
    output += '\n';
  }

  return output;
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
    metrics.status === 'completed' ? '✓' :
    metrics.status === 'failed' ? '❌' :
    '🔄';
  const successText = metrics.success === true ? '(succeeded)' :
                      metrics.success === false ? '(failed)' :
                      '';
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
  lines.push('');
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
    lines.push('');
    lines.push('Performance Breakdown (aggregate):');
    lines.push(`├─ Chunking:   ${aggregate_timing.chunking_ms.toLocaleString()}ms (${percentage(aggregate_timing.chunking_ms, totalIndexing)})`);
    lines.push(`├─ Embedding: ${aggregate_timing.embedding_ms.toLocaleString()}ms (${percentage(aggregate_timing.embedding_ms, totalIndexing)})`);
    lines.push(`├─ Qdrant:     ${aggregate_timing.qdrant_ms.toLocaleString()}ms (${percentage(aggregate_timing.qdrant_ms, totalIndexing)})`);
    lines.push(`└─ BM25:       ${aggregate_timing.bm25_ms.toLocaleString()}ms (${percentage(aggregate_timing.bm25_ms, totalIndexing)})`);

    lines.push('');
    lines.push(`Indexing time: ${totalIndexing.toLocaleString()}ms total`);
    if (metrics.total_pages > 0) {
      const avgPerPage = Math.round(totalIndexing / metrics.total_pages);
      lines.push(`Per-page average: ${avgPerPage.toLocaleString()}ms/page`);
    }
  }

  // End-to-end latency
  if (metrics.e2e_duration_ms !== null) {
    lines.push('');
    lines.push(`End-to-end latency: ${formatDuration(metrics.e2e_duration_ms)} (from MCP request to completion)`);
  }

  // Crawl-level error
  if (metrics.error_message) {
    lines.push('');
    lines.push(`❌ Crawl Error: ${metrics.error_message}`);
  }

  // Per-page details
  if (options.include_details) {
    const perPageSection = buildPerPageSection(metrics);
    if (perPageSection) {
      lines.push(perPageSection);
    }
  }

  // Errors
  const errorSection = buildErrorSection(metrics, options);
  if (errorSection) {
    lines.push(errorSection);
  }

  // Insights
  const insights = buildInsights(metrics);
  if (insights) {
    lines.push(insights);
  }

  // In-progress hint
  if (metrics.status === 'in_progress') {
    lines.push('');
    lines.push('💡 Crawl is still in progress. Use profile_crawl again to see updated metrics.');
  }

  return {
    content: [
      {
        type: "text",
        text: lines.join('\n'),
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

### Tool Factory

**File:** `apps/mcp/tools/profile/index.ts`

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
export type { ProfileConfig, ProfileOptions } from "./schema.js";
export type { CrawlMetricsResponse } from "./types.js";
```

## Testing Strategy

### Unit Tests

**Schema Tests (`schema.test.ts`):**
```typescript
import { describe, it, expect } from 'vitest';
import { profileOptionsSchema } from './schema.js';

describe('profileOptionsSchema', () => {
  it('requires crawl_id', () => {
    expect(() => profileOptionsSchema.parse({})).toThrow();
  });

  it('validates crawl_id is non-empty', () => {
    expect(() => profileOptionsSchema.parse({ crawl_id: '' })).toThrow();
  });

  it('applies default values', () => {
    const result = profileOptionsSchema.parse({ crawl_id: 'abc123' });
    expect(result.include_details).toBe(false);
    expect(result.error_offset).toBe(0);
    expect(result.error_limit).toBe(5);
  });

  it('enforces error_limit max of 50', () => {
    expect(() =>
      profileOptionsSchema.parse({ crawl_id: 'abc', error_limit: 100 })
    ).toThrow();
  });

  it('enforces error_offset minimum of 0', () => {
    expect(() =>
      profileOptionsSchema.parse({ crawl_id: 'abc', error_offset: -1 })
    ).toThrow();
  });
});
```

**Response Tests (`response.test.ts`):**
```typescript
import { describe, it, expect } from 'vitest';
import { formatProfileResponse } from './response.js';
import type { CrawlMetricsResponse } from './types.js';

describe('formatProfileResponse', () => {
  const mockMetrics: CrawlMetricsResponse = {
    crawl_id: 'test123',
    crawl_url: 'https://example.com',
    status: 'completed',
    success: true,
    started_at: '2025-11-13T22:00:00Z',
    completed_at: '2025-11-13T22:05:00Z',
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

  it('formats basic profile without details', () => {
    const result = formatProfileResponse(mockMetrics, {
      crawl_id: 'test123',
      include_details: false,
      error_offset: 0,
      error_limit: 5,
    });

    expect(result.content[0].text).toContain('test123');
    expect(result.content[0].text).toContain('completed ✓');
    expect(result.content[0].text).toContain('10 total');
    expect(result.content[0].text).toContain('Indexed: 9');
  });

  it('calculates performance percentages correctly', () => {
    const result = formatProfileResponse(mockMetrics, {
      crawl_id: 'test123',
    });

    const text = result.content[0].text;
    // Total indexing: 8500ms, embedding: 5000ms = 58.8%
    expect(text).toContain('Embedding');
    expect(text).toMatch(/58\.\d%/);
  });

  it('shows error section when per_page_metrics included', () => {
    const metricsWithErrors: CrawlMetricsResponse = {
      ...mockMetrics,
      per_page_metrics: [
        {
          url: '/failed-page',
          operation_type: 'chunking',
          operation_name: 'chunk_text',
          duration_ms: 0,
          success: false,
          timestamp: '2025-11-13T22:01:00Z',
        },
      ],
    };

    const result = formatProfileResponse(metricsWithErrors, {
      crawl_id: 'test123',
      include_details: true,
    });

    expect(result.content[0].text).toContain('⚠️ Errors Encountered');
    expect(result.content[0].text).toContain('/failed-page');
    expect(result.content[0].text).toContain('Chunking Errors');
  });

  it('paginates errors correctly', () => {
    const errors = Array.from({ length: 20 }, (_, i) => ({
      url: `/page-${i}`,
      operation_type: 'embedding',
      operation_name: 'embed_batch',
      duration_ms: 0,
      success: false,
      timestamp: `2025-11-13T22:${String(i).padStart(2, '0')}:00Z`,
    }));

    const metricsWithManyErrors: CrawlMetricsResponse = {
      ...mockMetrics,
      per_page_metrics: errors,
    };

    const result = formatProfileResponse(metricsWithManyErrors, {
      crawl_id: 'test123',
      include_details: true,
      error_offset: 0,
      error_limit: 5,
    });

    const text = result.content[0].text;
    expect(text).toContain('20 operations failed');
    expect(text).toContain('showing 5 of 20');
    expect(text).toContain('15 more errors available');
    expect(text).toContain('error_offset=5');
  });

  it('formats in-progress crawls', () => {
    const inProgressMetrics: CrawlMetricsResponse = {
      ...mockMetrics,
      status: 'in_progress',
      success: null,
      completed_at: null,
      duration_ms: null,
    };

    const result = formatProfileResponse(inProgressMetrics, {
      crawl_id: 'test123',
    });

    expect(result.content[0].text).toContain('🔄');
    expect(result.content[0].text).toContain('in progress');
  });

  it('formats failed crawls with error message', () => {
    const failedMetrics: CrawlMetricsResponse = {
      ...mockMetrics,
      status: 'failed',
      success: false,
      error_message: 'Rate limit exceeded',
    };

    const result = formatProfileResponse(failedMetrics, {
      crawl_id: 'test123',
    });

    expect(result.content[0].text).toContain('❌');
    expect(result.content[0].text).toContain('Rate limit exceeded');
  });
});
```

**Client Tests (`client.test.ts`):**
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProfileClient } from './client.js';

// Mock fetch
global.fetch = vi.fn();

describe('ProfileClient', () => {
  let client: ProfileClient;

  beforeEach(() => {
    client = new ProfileClient({
      baseUrl: 'http://localhost:52100',
      apiSecret: 'test-secret',
    });
    vi.clearAllMocks();
  });

  it('makes GET request to correct endpoint', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ crawl_id: 'test' }),
    });

    await client.getMetrics('test123', false);

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:52100/api/metrics/crawls/test123',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          'X-API-Secret': 'test-secret',
        }),
      })
    );
  });

  it('includes query param when include_per_page is true', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ crawl_id: 'test' }),
    });

    await client.getMetrics('test123', true);

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:52100/api/metrics/crawls/test123?include_per_page=true',
      expect.any(Object)
    );
  });

  it('throws error for 404 response', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    await expect(client.getMetrics('unknown')).rejects.toThrow(
      'Crawl not found: unknown'
    );
  });

  it('throws error for authentication failure', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    });

    await expect(client.getMetrics('test')).rejects.toThrow(
      'Authentication failed'
    );
  });

  it('throws error for other API errors', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: async () => 'Database connection failed',
    });

    await expect(client.getMetrics('test')).rejects.toThrow(
      'Metrics API error (500)'
    );
  });
});
```

### Integration Tests

**Test against real webhook API:**

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { ProfileClient } from './client.js';
import { createCrawlSession, createOperationMetrics } from '../../../test/fixtures.js';

describe('ProfileClient integration', () => {
  let client: ProfileClient;
  let testCrawlId: string;

  beforeAll(async () => {
    // Setup test environment
    client = new ProfileClient({
      baseUrl: process.env.WEBHOOK_BASE_URL || 'http://localhost:52100',
      apiSecret: process.env.WEBHOOK_API_SECRET || 'test-secret',
    });

    // Create test data
    testCrawlId = await createCrawlSession({
      crawl_url: 'https://test.example.com',
      total_pages: 5,
      pages_indexed: 4,
      pages_failed: 1,
    });

    await createOperationMetrics(testCrawlId, [
      { operation_type: 'chunking', duration_ms: 100, success: true },
      { operation_type: 'embedding', duration_ms: 500, success: true },
      { operation_type: 'qdrant', duration_ms: 200, success: false },
    ]);
  });

  it('fetches metrics for valid crawl_id', async () => {
    const metrics = await client.getMetrics(testCrawlId, false);

    expect(metrics.crawl_id).toBe(testCrawlId);
    expect(metrics.total_pages).toBe(5);
    expect(metrics.pages_indexed).toBe(4);
    expect(metrics.pages_failed).toBe(1);
  });

  it('includes per-page metrics when requested', async () => {
    const metrics = await client.getMetrics(testCrawlId, true);

    expect(metrics.per_page_metrics).toBeDefined();
    expect(metrics.per_page_metrics!.length).toBeGreaterThan(0);
  });

  it('throws 404 for non-existent crawl', async () => {
    await expect(
      client.getMetrics('nonexistent-crawl-id')
    ).rejects.toThrow('Crawl not found');
  });
});
```

## Tool Registration

**Update:** `apps/mcp/tools/registration.ts`

```typescript
import { createProfileTool } from "./profile/index.js";

export interface ToolsConfig {
  // ... existing config ...
  webhookBaseUrl?: string;
  webhookApiSecret?: string;
}

export function registerTools(server: Server, config: ToolsConfig) {
  // ... existing tool registrations ...

  // Register profile_crawl tool if webhook config available
  if (config.webhookBaseUrl && config.webhookApiSecret) {
    const profileTool = createProfileTool({
      baseUrl: config.webhookBaseUrl,
      apiSecret: config.webhookApiSecret,
    });
    server.tool(profileTool);
    logger.info("Registered profile_crawl tool");
  } else {
    logger.warn("Skipping profile_crawl tool: webhook config not provided");
  }
}
```

## Environment Configuration

**Required environment variables:**

```bash
# Already configured for query tool
MCP_WEBHOOK_BASE_URL=http://pulse_webhook:52100
MCP_WEBHOOK_API_SECRET=<your-secret>
```

No additional configuration needed - reuses existing webhook connection.

## Usage Examples

### Basic Usage

```typescript
// After triggering a crawl
const crawlResult = await crawl({
  url: "https://docs.example.com",
  // ...
});

// Profile the crawl
const profile = await profile_crawl({
  crawl_id: crawlResult.id,
});
```

### Detailed Analysis

```typescript
// Get detailed per-page breakdown
const detailedProfile = await profile_crawl({
  crawl_id: "abc123",
  include_details: true,
});
```

### Error Investigation

```typescript
// Page through errors
const errors = await profile_crawl({
  crawl_id: "abc123",
  include_details: true,
  error_offset: 0,
  error_limit: 10,
});

// Next page
const moreErrors = await profile_crawl({
  crawl_id: "abc123",
  include_details: true,
  error_offset: 10,
  error_limit: 10,
});
```

### Progress Monitoring

```typescript
// Check in-progress crawl
const status = await profile_crawl({
  crawl_id: "running-crawl-id",
});
// Returns current progress with "in_progress" status
```

## Success Criteria

1. **Tool Registration** ✓
   - Tool appears in MCP tool list
   - Proper input schema validation
   - Environment variables configured

2. **API Integration** ✓
   - Successfully calls webhook metrics API
   - Handles authentication correctly
   - Proper error handling for all HTTP status codes

3. **Response Formatting** ✓
   - Plain-text diagnostic report
   - Performance breakdown with percentages
   - Error section with pagination
   - Actionable insights

4. **Error Handling** ✓
   - 404 for unknown crawl_id
   - 401/403 for auth failures
   - Network timeout handling
   - Graceful degradation for missing data

5. **Testing** ✓
   - Unit tests for schema, client, response formatting
   - Integration tests against real webhook API
   - Edge cases covered (in-progress, failed, empty metrics)

## Future Enhancements

### Phase 2 Features (Post-MVP)

1. **Comparative Analysis**
   - Compare multiple crawl profiles
   - Identify performance regressions
   - Trend analysis over time

2. **Real-time Monitoring**
   - WebSocket support for live progress
   - Streaming updates during crawl
   - Real-time error notifications

3. **Advanced Insights**
   - ML-based anomaly detection
   - Performance prediction
   - Automatic optimization suggestions

4. **Export Capabilities**
   - Export metrics to CSV/JSON
   - Integration with Grafana/Datadog
   - Historical performance reports

## Dependencies

- **Timing Instrumentation** (completed) - Provides metrics API
- **MCP SDK** - Tool registration and types
- **Zod** - Schema validation
- **TypeScript** - Type safety

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Webhook API unavailable | Tool fails completely | Return helpful error message, suggest checking service status |
| Large per-page datasets | Response size exceeds token limits | Implement smart truncation, pagination for details |
| Clock skew in timestamps | Confusing duration calculations | Use server-side timestamps consistently |
| Missing error context | Hard to debug failures | Store full error messages in OperationMetric |

## Rollout Plan

1. **Implementation** (1-2 days)
   - Create tool files following design
   - Write unit tests
   - Local testing

2. **Integration** (1 day)
   - Register tool in MCP server
   - Integration tests with webhook API
   - End-to-end testing with real crawls

3. **Documentation** (half day)
   - Update CLAUDE.md with tool usage
   - Add examples to README
   - Document environment variables

4. **Deployment** (coordinated with timing instrumentation)
   - Deploy to staging
   - Verify metrics collection works
   - Deploy to production

## Open Questions

None - design is complete and ready for implementation.

---

**Design Status:** ✅ Complete
**Next Step:** Create implementation plan with TDD workflow
