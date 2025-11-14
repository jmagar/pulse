# Profile Crawl Tool Documentation

> Updated: 00:53 AM | 11/14/2025

## Overview
The MCP **profile_crawl** tool provides comprehensive performance profiling and debugging for Firecrawl crawl jobs by querying the webhook service's lifecycle metrics API. It delivers plain-text diagnostic reports with timing breakdowns, error analysis, and actionable optimization insights—ideal for investigating bottlenecks, monitoring progress, or troubleshooting failed crawls.

| Attribute | Value |
| --- | --- |
| Tool name | `profile_crawl` |
| Location | `apps/mcp/tools/profile/index.ts` |
| Backend dependency | Webhook service (`apps/webhook`) |
| Default error limit | 5 most recent errors |
| Default internal URL | `http://pulse_webhook:52100` |

## Natural-Language Invocation
1. "Use the profile_crawl tool to analyze performance for crawl job `abc123`."
2. "Profile the crawl `xyz789` and show me detailed per-page metrics."
3. "Show me the errors from crawl `def456`, starting from error 10 (show next 10)."
4. "What's the slowest operation in crawl `ghi789`?"
5. "Give me performance insights and error analysis for the latest crawl."

The assistant converts these requests into the structured options below.

## Options Reference
(Schema: `apps/mcp/tools/profile/schema.ts`)

| Option | Type / Range | Default | Description |
| --- | --- | --- | --- |
| `crawl_id` | string | — | Required crawl identifier (returned by crawl tool's start command). |
| `include_details` | boolean | `false` | Include per-page timing metrics in the response (increases output size). |
| `error_offset` | integer ≥0 | `0` | Zero-based offset for error pagination (e.g., `10` shows errors 11-20). |
| `error_limit` | integer `1-50` | `5` | Number of errors to display per request (capped at 50). |

## Configuration
| Variable | Scope | Default | Notes |
| --- | --- | --- | --- |
| `WEBHOOK_BASE_URL` | root `.env` | `http://pulse_webhook:52100` | Internal docker URL used by the MCP server |
| `WEBHOOK_API_SECRET` | root `.env` | _required_ | Bearer token forwarded to the webhook service |
| `MCP_WEBHOOK_BASE_URL` | `apps/mcp/.env` (standalone) | `http://localhost:50108` | Override when running MCP outside docker |
| `MCP_WEBHOOK_API_SECRET` | `apps/mcp/.env` | _required_ | Secret for standalone override |

The MCP server checks `MCP_WEBHOOK_*` first and falls back to the root `WEBHOOK_*` values. Missing secrets prevent the tool from registering.

## Response Format
`apps/mcp/tools/profile/response.ts` emits a single plain-text diagnostic block:

```
=================================================================
CRAWL PROFILE: abc123
=================================================================

URL: https://docs.firecrawl.dev
Status: ✓ completed

TIMING SUMMARY
─────────────────────────────────────────────────────────────────
  Started:       08:45:23 AM EST (11/13/2025)
  Completed:     08:47:15 AM EST (11/13/2025)
  Duration:      112.5s
  E2E Latency:   118.2s (includes network + processing)

INDEXING STATS
─────────────────────────────────────────────────────────────────
  Pages
  ├─ Total processed: 47
  ├─ Successfully indexed: 45 (95.7%)
  └─ Failed: 2 (4.3%)

PERFORMANCE BREAKDOWN
─────────────────────────────────────────────────────────────────
  Aggregate Timing (all pages):
  ├─ Chunking:   1,234ms (12.3%)
  ├─ Embedding:  6,789ms (67.8%)
  ├─ Qdrant:     1,456ms (14.5%)
  └─ BM25:         523ms (5.2%)

  Per-page Averages:
  ├─ Chunking:   27.4ms/page
  ├─ Embedding:  150.9ms/page
  ├─ Qdrant:     32.4ms/page
  └─ BM25:       11.6ms/page

ERRORS (showing 2 of 2)
─────────────────────────────────────────────────────────────────
  embedding errors (2):
  ├─ [08:46:12] https://docs.firecrawl.dev/api/timeout
  │  Duration: 30,245ms | Failed after timeout
  └─ [08:46:45] https://docs.firecrawl.dev/api/rate-limit
     Duration: 15,123ms | Rate limit exceeded

PERFORMANCE INSIGHTS
─────────────────────────────────────────────────────────────────
  • Slowest operation: embedding (67.8% of total time)
  • Average embedding time: 150.9ms per page
  • Consider: Batch size optimization or parallel processing
  • Failure rate: 4.3% (2 of 47 pages failed)
```

### Response Sections
1. **Header** – Crawl ID, URL, status with icon (✓/❌/🔄)
2. **Timing Summary** – Start/end timestamps (EST), duration, end-to-end latency
3. **Indexing Stats** – Total/indexed/failed page counts with percentages
4. **Performance Breakdown** – Timing for each operation (chunking, embedding, Qdrant, BM25) with percentages and per-page averages
5. **Errors** (if any) – Most recent errors grouped by operation type, with pagination hints
6. **Performance Insights** – Actionable recommendations (slowest operation, failure rate, optimization suggestions)

## Usage Patterns

### Basic Profiling
After starting a crawl, profile its performance:
```
User: "Start a crawl of docs.firecrawl.dev"
Assistant: [uses crawl tool, gets job ID abc123]
User: "Profile that crawl"
Assistant: [uses profile_crawl tool with crawl_id: "abc123"]
```

### Detailed Analysis
Include per-page metrics for granular debugging:
```
User: "Profile crawl xyz789 with full details"
Assistant: [uses profile_crawl with include_details: true]
```

### Error Investigation
Paginate through errors for large crawls:
```
User: "Show me the first 5 errors from crawl def456"
Assistant: [uses profile_crawl with error_offset: 0, error_limit: 5]

User: "Show me the next 10 errors"
Assistant: [uses profile_crawl with error_offset: 5, error_limit: 10]
```

### Performance Optimization
Identify bottlenecks and get recommendations:
```
User: "What's slowing down crawl ghi789?"
Assistant: [uses profile_crawl tool, responds with insights section highlighting slowest operation and optimization suggestions]
```

## Deployment Checklist
1. Ensure the webhook service is running and reachable (Docker: `pulse_webhook:52100`).
2. Populate `WEBHOOK_BASE_URL`/`WEBHOOK_API_SECRET` (or MCP overrides) in `.env`.
3. Restart the MCP server and confirm the startup banner lists the profile_crawl tool.

## Testing
| Command | Purpose |
| --- | --- |
| `cd apps/mcp && pnpm test tools/profile` | Schema, client, response, handler, and registration tests (36 tests) |
| `cd apps/mcp && pnpm test:run` | Full MCP server test suite |

Test coverage:
- **Schema** (`schema.test.ts`): 9 tests – input validation, defaults, constraints
- **HTTP Client** (`client.test.ts`): 8 tests – endpoint calls, error handling, timeouts
- **Response Formatter** (`response.test.ts`): 14 tests – formatting, error pagination, insights generation
- **Tool Factory** (`index.test.ts`): 4 tests – tool creation, handler logic
- **Integration** (`integration.test.ts`): 1 test – live webhook service interaction

## Troubleshooting
| Symptom | Likely Cause | Resolution |
| --- | --- | --- |
| MCP server startup logs `WEBHOOK_API_SECRET is required for the profile_crawl tool` | Secret missing from `.env` or MCP overrides | Add `WEBHOOK_BASE_URL` + `WEBHOOK_API_SECRET`, restart server |
| Tool returns `Query error: 401 Unauthorized` | Invalid webhook secret | Regenerate secret in webhook service and update `.env` |
| Tool returns `Crawl not found: {crawl_id}` | Invalid crawl ID or crawl not yet indexed | Verify crawl ID from crawl tool's start command; wait for indexing to complete |
| Integration tests skipped | Webhook service not running | Start webhook service with `docker compose up pulse_webhook` |
| No performance insights shown | Crawl still in progress | Wait for crawl to complete; insights only shown for completed crawls |

## Implementation Details

### File Structure
```
apps/mcp/tools/profile/
├── types.ts                  # TypeScript interfaces for webhook API responses
├── schema.ts                 # Zod validation schema + JSON schema builder
├── schema.test.ts           # Schema validation tests (9 tests)
├── client.ts                # HTTP client for webhook metrics API
├── client.test.ts          # Client tests (8 tests)
├── response.ts             # Plain-text formatter with error pagination & insights
├── response.test.ts        # Response formatting tests (14 tests)
├── index.ts                # Tool factory function + MCP registration
├── index.test.ts           # Tool factory tests (4 tests)
└── integration.test.ts     # Live webhook service tests (1 test)
```

### Webhook API Integration
The tool queries `GET /api/metrics/crawls/{crawl_id}` with optional `include_per_page` query parameter. Response schema:

```typescript
interface CrawlMetricsResponse {
  crawl_id: string;
  crawl_url: string;
  status: "completed" | "failed" | "in_progress";
  success: boolean | null;
  started_at: string;              // ISO 8601 timestamp
  completed_at: string | null;
  duration_ms: number | null;
  e2e_duration_ms: number | null;  // End-to-end latency
  total_pages: number;
  pages_indexed: number;
  pages_failed: number;
  aggregate_timing: {              // Sum across all pages
    chunking_ms: number;
    embedding_ms: number;
    qdrant_ms: number;
    bm25_ms: number;
  };
  per_page_metrics?: Array<{       // Only if include_details=true
    url: string | null;
    operation_type: string;
    operation_name: string;
    duration_ms: number;
    success: boolean;
    timestamp: string;
  }>;
  error_message: string | null;
  extra_metadata: Record<string, any> | null;
}
```

## Related References
- Design document: `docs/plans/2025-11-13-profile-crawl-tool-design.md`
- Implementation plan: `docs/plans/2025-11-13-profile-crawl-tool-implementation.md`
- Implementation code: `apps/mcp/tools/profile/` (all test files included)
- Webhook metrics API: `apps/webhook/api/routers/metrics.py`
- Monorepo overview: `docs/ARCHITECTURE_DIAGRAM.md`
