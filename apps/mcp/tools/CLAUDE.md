# Tools - MCP Tool Implementations

MCP tool definitions for Pulse server with Firecrawl integration.

## Architecture Pattern

All tools follow a consistent 3-file pattern:

1. **index.ts**: Tool factory that creates MCP `Tool` object with name, description, schema, and handler
2. **schema.ts**: Zod schema for validation + JSON schema builder for MCP protocol
3. **pipeline.ts**: Business logic that orchestrates client calls
4. **response.ts**: Formats pipeline results into MCP `CallToolResult` (text/resource/error)

Error handling: All tools wrap in try/catch, parse args with Zod, return `isError: true` on failure.

## Current Tools

### scrape

Intelligently scrapes webpage content with caching, strategy selection, and batch operations.

**Key Features**:

- Single/batch scraping (auto-upgrades to Firecrawl batch when multiple URLs)
- Smart strategy selection (native → Firecrawl fallback)
- 3 result modes: `returnOnly`, `saveAndReturn`, `saveOnly`
- Automatic MCP resource caching
- Browser automation (wait, click, write, press, scroll, screenshot, scrape, executeJavascript)
- LLM-powered extraction (if LLM available)

**Commands**:

- `scrape <url>` — Single URL scrape (cached)
- `scrape <url1> <url2> ...` — Batch scrape (returns jobId)
- `scrape status <jobId>` — Check batch progress
- `scrape cancel <jobId>` — Cancel batch job
- `scrape errors <jobId>` — List batch errors

**Response Formats**:

- `returnOnly`: Plain text response, no caching
- `saveAndReturn`: Embedded MCP resource + content (default)
- `saveOnly`: Linked MCP resource reference only (token-efficient)

### crawl

Multi-page crawling with job-based architecture.

**Commands**:

- `crawl <url>` — Start crawl (with prompt, limit, excludePaths, etc.)
- `crawl status <jobId>` — Fetch job progress + data pagination hints
- `crawl cancel <jobId>` — Cancel crawl
- `crawl errors <jobId>` — List crawl errors + robots-blocked URLs
- `crawl list` — Enumerate active crawl jobs

**Features**:

- Natural language prompts for auto-config (Firecrawl generates optimal parameters)
- Pagination (warns when results exceed 10MB)
- Sitemap integration (include/skip)
- Browser actions support (same as scrape)
- Scrape format customization

### map

Fast site URL discovery (8x faster than crawl).

**Features**:

- URL extraction with pagination support
- Sitemap processing (include/skip/only)
- Subdomain handling
- Search filtering
- Result handling modes (saveOnly for token efficiency)
- Returns ~200 URLs per request (~13k tokens)

**Parameters**:

- `url` (required) - Base domain
- `maxResults` - URLs per request (1-5000, default 200)
- `startIndex` - Pagination offset
- `search` - Filter URLs by pattern
- `sitemap` - Sitemap strategy
- `includeSubdomains` - Include subdomains
- `resultHandling` - saveOnly/saveAndReturn/returnOnly

### search

Web search via Firecrawl with scraping integration.

**Features**:

- Web, image, news search
- Category filtering (GitHub, research papers, PDFs)
- Time-based filtering (past hour/day/week/month/year)
- Content scraping of results
- Location/language filtering

**Parameters**:

- `query` (required)
- `sources` - web/images/news
- `categories` - github/research/pdf
- `limit` - Results per source
- `tbs` - Time-based filter
- `scrapeOptions` - Content extraction

### query

Search indexed documentation via webhook service.

**Features**:

- Hybrid search (vector + BM25)
- Semantic-only search (vector)
- Keyword search (BM25)
- Pagination support
- Domain/language/country filtering

**Parameters**:

- `query` (required)
- `mode` - hybrid/semantic/keyword/bm25 (default: hybrid)
- `limit` - Results per page (1-100, default 5)
- `offset` - Pagination offset
- `filters` - domain, language, country

## Schema Validation

**Zod Pattern**:

```typescript
const schema = z
  .object({
    // Field definitions with .describe() for documentation
    url: z.string().url().describe("The URL to scrape"),
    // ... more fields
  })
  .superRefine((data, ctx) => {
    // Cross-field validation
    if (needsValidation) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Error message",
      });
    }
  })
  .transform((data) => ({
    // Normalize/resolve command logic
    command: resolveCommand(data),
  }));
```

**MCP JSON Schema**: Manually constructed (not zodToJsonSchema) to avoid instanceof issues across module boundaries. Built in `buildInputSchema()` functions.

## Pipeline Patterns

**Single-URL Scrape**:

1. Validate args with Zod
2. Check cache (unless forceRescrape)
3. Select strategy + scrape
4. Process content (clean HTML → Markdown)
5. Save to storage
6. Return paginated response

**Batch Scrape**:

1. Validate args
2. Create batch job via Firecrawl
3. Return jobId for polling
4. `status` → check progress
5. `cancel` → terminate job
6. `errors` → list failures

**Crawl/Map/Search**:

1. Validate args
2. Create Firecrawl client
3. Call pipeline (maps args → client options)
4. Format response (plain text for CLI ergonomics)

## Response Formatting

All tools return `CallToolResult`:

```typescript
{
  content: Array<{
    type: "text" | "resource" | "resource_link";
    text?: string;
    resource?: { uri, name, text };
    uri?: string;
  }>,
  isError?: boolean;
}
```

**Content Types**:

- `text`: Plain text (CLI-style)
- `resource`: Embedded MCP resource (full content)
- `resource_link`: Linked resource reference (uri + name only)

**Error Responses**: `{ content: [{ type: "text", text: "Error message" }], isError: true }`

## Configuration

**Environment Variables** (from root `.env`):

- `FIRECRAWL_API_KEY` - Firecrawl API key (optional, uses self-hosted if not set)
- `FIRECRAWL_BASE_URL` - Firecrawl service URL (default: `http://firecrawl:3002`)
- `WEBHOOK_BASE_URL` - Query tool service URL
- `WEBHOOK_API_SECRET` - Query tool authentication
- `LLM_PROVIDER` - Enables extraction (optional)

**Tool Registration** (in `registration.ts`):

1. Create Firecrawl config from env
2. Instantiate each tool with factory
3. Register with MCP server
4. Set up ListTools/CallTool handlers
5. Track registration success/failure

## Testing

Tests follow naming pattern: `[name]/[name].test.ts`

**Coverage**:

- Unit: Schema validation, response formatting
- Integration: Full pipeline with mocked clients
- E2E: Real service calls (optional)

**Test Pattern**:

```typescript
import { buildScrapeArgsSchema } from "./schema.js";

describe("scrape schema", () => {
  it("validates single URL", () => {
    const schema = buildScrapeArgsSchema();
    expect(() => schema.parse({ url: "example.com" })).not.toThrow();
  });
});
```

## Known Patterns

**Command Resolution**: scrape/crawl use `resolveCommand()` to infer command from args for backward compatibility:

- `cancel: true` → "cancel"
- `jobId` only → "status"
- `url` → "start"
- explicit `command` field

**URL Normalization**: Scrape tool preprocesses URLs, adding `https://` if no protocol specified.

**Pagination**: Map/crawl status support pagination (maxResults, startIndex, next cursors).

**Resource URIs**: Format is `service://domain/path_timestamp` (e.g., `scraped://example.com/article_2024-01-15T10:30:00Z`).
