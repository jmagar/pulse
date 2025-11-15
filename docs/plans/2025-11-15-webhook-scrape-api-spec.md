# Webhook Scrape API Specification

**Version:** 1.0.0
**Date:** 2025-11-15
**Author:** Claude Code
**Status:** Design Phase

## Overview

This document specifies the Webhook Scrape API endpoint that will replace the MCP server's direct scraping logic. The webhook service will provide identical functionality to the MCP scrape tool, enabling the MCP server to become a thin wrapper.

## Design Principles

1. **Functional Parity**: Webhook API must support 100% of MCP scrape tool functionality
2. **Cache-First**: Leverage existing webhook cache infrastructure for scraped content
3. **Storage Integration**: Store scraped content in PostgreSQL with same schema as webhooks
4. **Backward Compatibility**: MCP tool behavior remains unchanged from user perspective
5. **Separation of Concerns**: Webhook handles all scraping/cleaning/extraction/storage; MCP handles only protocol translation

## API Endpoint

### POST /api/v2/scrape

Main endpoint for all scrape operations (single URL, batch, status checks).

## Request Schema

### Single URL Scrape (Start Command)

```json
{
  "command": "start",
  "url": "https://example.com/article",
  "timeout": 60000,
  "maxChars": 100000,
  "startIndex": 0,
  "resultHandling": "saveAndReturn",
  "forceRescrape": false,
  "cleanScrape": true,
  "maxAge": 172800000,
  "proxy": "auto",
  "blockAds": true,
  "headers": {
    "User-Agent": "MyBot/1.0",
    "Cookie": "session=abc123"
  },
  "waitFor": 3000,
  "includeTags": ["article", ".post"],
  "excludeTags": ["#ad", ".sidebar"],
  "formats": ["markdown", "html", "screenshot"],
  "parsers": [
    {
      "type": "pdf",
      "maxPages": 100
    }
  ],
  "onlyMainContent": true,
  "actions": [
    {
      "type": "wait",
      "milliseconds": 2000
    },
    {
      "type": "click",
      "selector": "#cookie-accept"
    },
    {
      "type": "scrape",
      "selector": "#main-content"
    }
  ],
  "extract": "the author name and publication date"
}
```

### Batch Scrape (Start Command)

```json
{
  "command": "start",
  "urls": [
    "https://example.com/page1",
    "https://example.com/page2",
    "https://example.com/page3"
  ],
  "timeout": 60000,
  "proxy": "auto",
  "formats": ["markdown", "html"]
}
```

### Batch Status Query

```json
{
  "command": "status",
  "jobId": "fc-batch-abc123"
}
```

### Batch Cancel

```json
{
  "command": "cancel",
  "jobId": "fc-batch-abc123"
}
```

### Batch Errors

```json
{
  "command": "errors",
  "jobId": "fc-batch-abc123"
}
```

## Request Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `command` | enum | No | `"start"` | Operation: `"start"`, `"status"`, `"cancel"`, `"errors"` |
| `url` | string (URL) | Conditional | - | Single URL to scrape (required for single-URL start) |
| `urls` | array[string] | Conditional | - | Multiple URLs for batch scrape (required for batch start) |
| `jobId` | string | Conditional | - | Job ID for status/cancel/errors commands |
| `timeout` | number | No | 60000 | Page load timeout in milliseconds |
| `maxChars` | number | No | 100000 | Maximum characters to return in response |
| `startIndex` | number | No | 0 | Starting character position for pagination |
| `resultHandling` | enum | No | `"saveAndReturn"` | `"saveOnly"`, `"saveAndReturn"`, `"returnOnly"` |
| `forceRescrape` | boolean | No | false | Bypass cache and fetch fresh |
| `cleanScrape` | boolean | No | true | Convert HTML to semantic Markdown |
| `maxAge` | number | No | 172800000 | Cache age threshold (2 days default) |
| `proxy` | enum | No | `"auto"` | `"basic"`, `"stealth"`, `"auto"` |
| `blockAds` | boolean | No | true | Block ads and cookie popups |
| `headers` | object | No | - | Custom HTTP headers |
| `waitFor` | number | No | - | Milliseconds to wait before scraping |
| `includeTags` | array[string] | No | - | HTML tags/classes/IDs to include |
| `excludeTags` | array[string] | No | - | HTML tags/classes/IDs to exclude |
| `formats` | array[enum] | No | `["markdown", "html"]` | Output formats (see formats table) |
| `parsers` | array[object] | No | `[]` | PDF parsing config |
| `onlyMainContent` | boolean | No | true | Extract only main content area |
| `actions` | array[object] | No | - | Browser automation actions |
| `extract` | string | No | - | Natural language extraction query (LLM) |

### Formats Enum

| Format | Description | Notes |
|--------|-------------|-------|
| `markdown` | Clean semantic text | Default |
| `html` | Processed HTML | Default |
| `rawHtml` | Unprocessed HTML | Raw source |
| `links` | All hyperlinks | Array of URLs |
| `images` | All image URLs | Array of image sources |
| `screenshot` | Page screenshot | Base64 encoded PNG |
| `summary` | AI-generated summary | Requires LLM |
| `branding` | Brand colors/fonts | Design tokens |
| `changeTracking` | Track content changes | changedetection.io integration |

### Browser Actions Schema

```typescript
type BrowserAction =
  | { type: "wait"; milliseconds: number }
  | { type: "click"; selector: string }
  | { type: "write"; selector: string; text: string }
  | { type: "press"; key: string }
  | { type: "scroll"; direction: "up" | "down"; amount?: number }
  | { type: "screenshot"; name?: string }
  | { type: "scrape"; selector?: string }
  | { type: "executeJavascript"; script: string };
```

## Response Schemas

### Success Response (Single URL, returnOnly)

```json
{
  "success": true,
  "command": "start",
  "data": {
    "url": "https://example.com/article",
    "content": "Article content here...\n\nScraped at 2025-11-15T18:30:00Z using firecrawl",
    "contentType": "text/markdown",
    "source": "firecrawl",
    "cached": false,
    "timestamp": "2025-11-15T18:30:00Z",
    "screenshot": "iVBORw0KGgoAAAANSUhEUgAAA...",
    "screenshotFormat": "image/png"
  }
}
```

### Success Response (Single URL, saveAndReturn)

```json
{
  "success": true,
  "command": "start",
  "data": {
    "url": "https://example.com/article",
    "content": "Full article content...",
    "contentType": "text/markdown",
    "source": "firecrawl",
    "cached": false,
    "timestamp": "2025-11-15T18:30:00Z",
    "savedUris": {
      "raw": "scrape://example.com/article/raw_2025-11-15T18:30:00Z",
      "cleaned": "scrape://example.com/article/cleaned_2025-11-15T18:30:00Z",
      "extracted": "scrape://example.com/article/extracted_2025-11-15T18:30:00Z"
    },
    "metadata": {
      "rawLength": 45678,
      "cleanedLength": 12345,
      "extractedLength": 567,
      "wasTruncated": false
    }
  }
}
```

### Success Response (Single URL, saveOnly)

```json
{
  "success": true,
  "command": "start",
  "data": {
    "url": "https://example.com/article",
    "savedUris": {
      "raw": "scrape://example.com/article/raw_2025-11-15T18:30:00Z",
      "cleaned": "scrape://example.com/article/cleaned_2025-11-15T18:30:00Z"
    },
    "source": "firecrawl",
    "timestamp": "2025-11-15T18:30:00Z",
    "message": "Content saved to cache"
  }
}
```

### Cached Response

```json
{
  "success": true,
  "command": "start",
  "data": {
    "url": "https://example.com/article",
    "content": "Cached article content...",
    "contentType": "text/markdown",
    "source": "firecrawl",
    "cached": true,
    "cacheAge": 86400000,
    "timestamp": "2025-11-14T18:30:00Z",
    "savedUris": {
      "raw": "scrape://example.com/article/raw_2025-11-14T18:30:00Z",
      "cleaned": "scrape://example.com/article/cleaned_2025-11-14T18:30:00Z"
    }
  }
}
```

### Batch Start Response

```json
{
  "success": true,
  "command": "start",
  "data": {
    "jobId": "fc-batch-abc123",
    "urls": 25,
    "status": "scraping",
    "message": "Batch scrape started for 25 URLs. Use jobId 'fc-batch-abc123' to check status."
  }
}
```

### Batch Status Response

```json
{
  "success": true,
  "command": "status",
  "data": {
    "jobId": "fc-batch-abc123",
    "status": "scraping",
    "total": 25,
    "completed": 18,
    "creditsUsed": 54,
    "expiresAt": "2025-11-15T19:00:00Z",
    "message": "Batch scrape progress: 18/25 URLs completed (72%)"
  }
}
```

### Batch Cancel Response

```json
{
  "success": true,
  "command": "cancel",
  "data": {
    "jobId": "fc-batch-abc123",
    "status": "cancelled",
    "message": "Batch scrape cancelled"
  }
}
```

### Batch Errors Response

```json
{
  "success": true,
  "command": "errors",
  "data": {
    "jobId": "fc-batch-abc123",
    "errors": [
      {
        "url": "https://example.com/blocked",
        "error": "Robots.txt disallowed",
        "timestamp": "2025-11-15T18:32:15Z"
      },
      {
        "url": "https://example.com/404",
        "error": "404 Not Found",
        "timestamp": "2025-11-15T18:32:20Z"
      }
    ],
    "message": "Found 2 errors in batch scrape"
  }
}
```

### Error Response

```json
{
  "success": false,
  "command": "start",
  "error": {
    "message": "Failed to scrape https://example.com: Connection timeout",
    "code": "SCRAPE_TIMEOUT",
    "url": "https://example.com",
    "diagnostics": {
      "attemptedStrategies": ["firecrawl", "native"],
      "lastError": "Connection timeout after 60000ms",
      "retryCount": 3
    }
  }
}
```

### Validation Error Response

```json
{
  "success": false,
  "command": "start",
  "error": {
    "message": "Invalid arguments: url: Required; proxy: Invalid enum value",
    "code": "VALIDATION_ERROR",
    "validationErrors": [
      {
        "field": "url",
        "message": "Required"
      },
      {
        "field": "proxy",
        "message": "Invalid enum value. Expected 'basic' | 'stealth' | 'auto', received 'invalid'"
      }
    ]
  }
}
```

## Database Schema

### scrape_cache Table

```sql
CREATE TABLE webhook.scrape_cache (
    id BIGSERIAL PRIMARY KEY,
    url TEXT NOT NULL,
    url_hash TEXT NOT NULL UNIQUE,  -- SHA-256 hash for fast lookups

    -- Content versions
    raw_content TEXT,               -- Raw HTML/text from scraper
    cleaned_content TEXT,            -- Cleaned Markdown/text
    extracted_content TEXT,          -- LLM-extracted content
    extract_query TEXT,              -- LLM extraction query used

    -- Metadata
    source VARCHAR(50) NOT NULL,     -- 'firecrawl' | 'native'
    content_type VARCHAR(100),       -- MIME type
    content_length_raw INTEGER,
    content_length_cleaned INTEGER,
    content_length_extracted INTEGER,

    -- Screenshot
    screenshot BYTEA,                -- Base64 decoded binary
    screenshot_format VARCHAR(20),   -- 'image/png'

    -- Scraping details
    strategy_used VARCHAR(50),       -- Specific strategy that worked
    scrape_options JSONB,            -- Full request options for cache key

    -- Cache control
    scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,          -- Computed from maxAge
    cache_key TEXT NOT NULL,         -- Hash of (url + extract_query + key options)

    -- Tracking
    access_count INTEGER DEFAULT 0,
    last_accessed_at TIMESTAMPTZ,

    -- Indexes
    CONSTRAINT scrape_cache_url_hash_unique UNIQUE (url_hash),
    CONSTRAINT scrape_cache_cache_key_unique UNIQUE (cache_key)
);

CREATE INDEX idx_scrape_cache_url ON webhook.scrape_cache (url);
CREATE INDEX idx_scrape_cache_scraped_at ON webhook.scrape_cache (scraped_at DESC);
CREATE INDEX idx_scrape_cache_expires_at ON webhook.scrape_cache (expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX idx_scrape_cache_cache_key ON webhook.scrape_cache (cache_key);
```

## Cache Key Algorithm

```python
def compute_cache_key(request: ScrapeRequest) -> str:
    """
    Compute deterministic cache key from request parameters.

    Cache invalidation factors:
    - URL (normalized)
    - extract query (LLM prompt)
    - Key scraping options that affect output
    """
    key_options = {
        "url": normalize_url(request.url),
        "extract": request.extract,
        "cleanScrape": request.cleanScrape,
        "onlyMainContent": request.onlyMainContent,
        "includeTags": sorted(request.includeTags or []),
        "excludeTags": sorted(request.excludeTags or []),
        "formats": sorted(request.formats),
    }

    json_str = json.dumps(key_options, sort_keys=True)
    return hashlib.sha256(json_str.encode()).hexdigest()
```

## Service Architecture

### ScrapeCacheService (apps/webhook/services/scrape_cache.py)

```python
class ScrapeCacheService:
    """Manage scrape cache storage and retrieval."""

    async def get_cached_scrape(
        self,
        cache_key: str,
        max_age: int
    ) -> Optional[ScrapeCacheEntry]:
        """Retrieve cached scrape if exists and not expired."""

    async def save_scrape(
        self,
        url: str,
        raw_content: str,
        cleaned_content: Optional[str],
        extracted_content: Optional[str],
        extract_query: Optional[str],
        source: str,
        cache_key: str,
        max_age: int,
        **metadata
    ) -> ScrapeCacheEntry:
        """Save scrape results to cache."""

    async def invalidate_url(self, url: str) -> int:
        """Invalidate all cache entries for a URL."""
```

### ContentProcessorService (apps/webhook/services/content_processor.py)

```python
class ContentProcessorService:
    """Process scraped content through cleaning and extraction."""

    async def clean_content(
        self,
        raw_html: str,
        url: str
    ) -> str:
        """Convert HTML to semantic Markdown."""

    async def extract_content(
        self,
        content: str,
        url: str,
        extract_query: str
    ) -> str:
        """Use LLM to extract requested information."""
```

### WebhookScrapeClient (apps/mcp/tools/scrape/webhook-client.ts)

```typescript
class WebhookScrapeClient {
  constructor(
    private webhookBaseUrl: string,
    private apiSecret: string
  ) {}

  async scrape(args: ScrapeArgs): Promise<ScrapeResponse> {
    // POST to /api/v2/scrape
    // Handle response transformation
  }

  async batchStatus(jobId: string): Promise<BatchStatusResponse> {
    // POST to /api/v2/scrape with command=status
  }

  async batchCancel(jobId: string): Promise<BatchCancelResponse> {
    // POST to /api/v2/scrape with command=cancel
  }

  async batchErrors(jobId: string): Promise<BatchErrorsResponse> {
    // POST to /api/v2/scrape with command=errors
  }
}
```

## MCP Integration

The MCP scrape tool handler will become:

```typescript
export async function handleScrapeRequest(
  args: unknown,
  webhookClient: WebhookScrapeClient
): Promise<ToolResponse> {
  try {
    // 1. Validate args with Zod
    const validatedArgs = ScrapeArgsSchema.parse(args);

    // 2. Call webhook API
    const webhookResponse = await webhookClient.scrape(validatedArgs);

    // 3. Transform webhook response to MCP ToolResponse format
    return transformWebhookToMcpResponse(webhookResponse);
  } catch (error) {
    return buildErrorResponse(error);
  }
}
```

## Response Transformation

```typescript
function transformWebhookToMcpResponse(
  webhookResponse: WebhookScrapeResponse
): ToolResponse {
  if (!webhookResponse.success) {
    return {
      content: [{
        type: "text",
        text: `Error: ${webhookResponse.error.message}`
      }],
      isError: true
    };
  }

  const { data } = webhookResponse;

  // returnOnly mode
  if (data.content && !data.savedUris) {
    return {
      content: [{
        type: "text",
        text: data.content
      }]
    };
  }

  // saveAndReturn mode
  if (data.content && data.savedUris) {
    return {
      content: [{
        type: "resource",
        resource: {
          uri: data.savedUris.cleaned || data.savedUris.raw,
          name: data.url,
          text: data.content
        }
      }]
    };
  }

  // saveOnly mode
  if (data.savedUris && !data.content) {
    return {
      content: [{
        type: "resource_link",
        uri: data.savedUris.cleaned || data.savedUris.raw,
        name: data.url
      }]
    };
  }

  // Batch command responses
  return {
    content: [{
      type: "text",
      text: data.message
    }]
  };
}
```

## Migration Strategy

1. **Phase 1**: Implement webhook scrape endpoint (Tasks 5-9)
   - Design API contract ✓ (this document)
   - Create database schema
   - Implement ScrapeCacheService
   - Implement ContentProcessorService
   - Implement /api/v2/scrape endpoint

2. **Phase 2**: Create MCP thin wrapper (Task 10)
   - Create WebhookScrapeClient
   - Replace handler logic with webhook calls
   - Transform responses to MCP format

3. **Phase 3**: Remove orphaned code (Task 11)
   - Delete apps/mcp/processing/
   - Delete apps/mcp/scraping/
   - Keep only schema validation and response transformation

## Testing Requirements

### Webhook Tests (apps/webhook/tests/)

- **Unit Tests**:
  - ScrapeCacheService cache key generation
  - ScrapeCacheService expiration logic
  - ContentProcessorService HTML cleaning
  - ContentProcessorService LLM extraction

- **Integration Tests**:
  - Full scrape flow: cache miss → scrape → clean → extract → save
  - Cache hit flow: retrieve from database
  - Batch scrape commands (start/status/cancel/errors)
  - Error handling and validation

### MCP Tests (apps/mcp/tests/)

- **Unit Tests**:
  - WebhookScrapeClient API calls
  - Response transformation logic
  - Error handling

- **Integration Tests**:
  - End-to-end scrape via MCP tool
  - Verify identical behavior to current implementation
  - All resultHandling modes work correctly

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Invalid request parameters |
| `SCRAPE_TIMEOUT` | 408 | Scraping operation timed out |
| `SCRAPE_FAILED` | 500 | All scraping strategies failed |
| `CACHE_ERROR` | 500 | Database cache operation failed |
| `EXTRACTION_FAILED` | 500 | LLM extraction failed |
| `BATCH_NOT_FOUND` | 404 | Batch job ID not found |
| `BATCH_EXPIRED` | 410 | Batch job expired |

## Performance Considerations

1. **Database Indexes**: Cache lookups by `cache_key` must be fast (<10ms)
2. **Content Storage**: Large HTML stored in TEXT columns (supports up to 1GB in PostgreSQL)
3. **Screenshot Storage**: BYTEA column for binary data (typically 50-500KB)
4. **Cache Eviction**: Background task to delete expired entries
5. **Connection Pooling**: Reuse webhook HTTP connections from MCP server

## Security

1. **SSRF Protection**: Validate URLs before scraping (already implemented in MCP)
2. **API Authentication**: Require `Authorization: Bearer <token>` header
3. **Rate Limiting**: Apply per-IP rate limits on /api/v2/scrape endpoint
4. **Content Size Limits**: Max 10MB raw content, max 1MB for extracted content
5. **SQL Injection**: Use parameterized queries for all database operations

## Monitoring

Log the following metrics:

- Scrape requests by command type
- Cache hit/miss ratio
- Scraping strategy success rates
- Average scrape duration
- Database query performance
- LLM extraction latency

## Success Criteria

✅ Webhook API supports all MCP scrape tool parameters
✅ Cache hit rate >80% for repeated URLs
✅ Average response time <500ms for cached content
✅ Average response time <5s for fresh scrapes
✅ Zero behavior changes from user perspective
✅ All existing MCP scrape tests pass
✅ Database schema supports all content types
✅ Batch scrape commands work identically

## Next Steps

1. Review this specification for completeness
2. Create database migration (Task 6)
3. Implement ScrapeCacheService (Task 7)
4. Implement ContentProcessorService (Task 8)
5. Implement /api/v2/scrape endpoint (Task 9)
6. Create WebhookScrapeClient (Task 10)
7. Remove orphaned MCP code (Task 11)
