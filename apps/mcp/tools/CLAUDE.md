# Tools - MCP Tool Implementations

MCP tool definitions for Pulse Fetch server.

## Current Tools

### [scrape.ts](scrape.ts)

Scrapes a single webpage with advanced content extraction.

**Key Features**:

- Smart strategy selection (native → firecrawl fallback)
- Content cleaning (HTML-to-Markdown)
- LLM-powered extraction
- Automatic caching as MCP resources
- Multi-tier storage (raw/cleaned/extracted)
- Pagination support (maxChars, startIndex)

**Parameters**: url (required), timeout (60s), maxChars (100k), startIndex (0), saveResult (true), forceRescrape (false), cleanScrape (true), extract (LLM query, conditional on `LLM_PROVIDER`)

**Cache Behavior**:

- `saveResult: true` (default) - Save to resource storage
- `forceRescrape: true` - Bypass cache, fetch fresh
- Otherwise: Return cached if exists

**Content Processing Pipeline**:

1. Check cache (unless forceRescrape)
2. Select scraping strategy
3. Fetch content (native or Firecrawl)
4. Clean HTML → Markdown (if cleanScrape)
5. Extract with LLM (if extract query)
6. Save multi-tier (raw/cleaned/extracted)
7. Return content (paginated if needed)

**Error Handling**:

- Strategy fallback on failure
- Detailed diagnostics in errors
- Timing information per strategy

## Future Tools (Planned)

### crawl

Multi-page crawling. Params: url, maxPages, includePaths, excludePaths, maxDepth

### map

Site structure mapping. Params: url, ignoreSitemap, includeSubdomains

### search

Semantic search across cached scrapes. Params: query, limit, filter

## Tool Registration

Registered in [../index.ts](../index.ts) via `registerTools()`.
Uses `ListToolsRequestSchema` and `CallToolRequestSchema` handlers.

## Testing

Tests in [../../tests/functional/scrape-tool.test.ts](../../tests/functional/scrape-tool.test.ts)

Mock pattern uses `ClientFactory` for dependency injection.
