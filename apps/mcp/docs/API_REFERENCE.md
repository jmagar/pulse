# API Reference

Complete API reference for Pulse Fetch MCP server tools and HTTP endpoints.

## Table of Contents

- [Tools Overview](#tools-overview)
- [SCRAPE Tool](#scrape-tool)
- [MAP Tool](#map-tool)
- [SEARCH Tool](#search-tool)
- [CRAWL Tool](#crawl-tool)
- [HTTP Endpoints](#http-endpoints-remote-mode)
- [Resource URIs](#resource-uris)
- [Error Responses](#error-responses)
- [Type Definitions](#type-definitions)

---

## Tools Overview

Pulse Fetch provides 4 MCP tools for web content retrieval:

| Tool       | Purpose                       | Speed   | Credits/Request |
| ---------- | ----------------------------- | ------- | --------------- |
| **scrape** | Single URL content extraction | ~1-2s   | 1               |
| **search** | Google search integration     | ~2-3s   | 1-3             |
| **map**    | URL discovery from websites   | ~5-10s  | 1               |
| **crawl**  | Multi-page deep crawling      | ~30-90s | 1 per page      |

All tools return **MCP CallToolResult** format:

```typescript
{
  content: ContentBlock[],  // Array of text, resource, or resource_link
  isError?: boolean         // true for errors
}
```

---

## SCRAPE Tool

Extract content from a single URL with intelligent strategy selection, caching, and optional LLM extraction.

### Parameters

#### Required

```typescript
{
  url: string; // URL to scrape (auto-normalized with https://)
}
```

#### Optional Core

```typescript
{
  timeout?: number              // Request timeout (ms, default: 60000)
  maxChars?: number             // Max content length (default: 100000)
  startIndex?: number           // Pagination start (default: 0)
  resultHandling?: "saveOnly" | "saveAndReturn" | "returnOnly"  // Default: "saveAndReturn"
  forceRescrape?: boolean       // Bypass cache (default: false)
  cleanScrape?: boolean         // HTML→Markdown conversion (default: true)
}
```

**Result Handling Modes:**

- `saveOnly`: Save to cache, return resource link only
- `saveAndReturn`: Save to cache AND return full content (embedded resource)
- `returnOnly`: Return content without caching

#### Firecrawl Options

```typescript
{
  maxAge?: number               // Cache freshness (ms, default: 172800000 / 2 days)
  proxy?: "basic" | "stealth" | "auto"  // Proxy mode (default: "auto")
  blockAds?: boolean            // Block advertisements (default: true)
  headers?: Record<string, string>  // Custom HTTP headers
  waitFor?: number              // Wait before scraping (ms)
  includeTags?: string[]        // CSS selectors to include
  excludeTags?: string[]        // CSS selectors to exclude
  formats?: Array<"markdown" | "html" | "rawHtml" | "links" | "images" | "screenshot" | "summary" | "branding">
                                // Content formats (default: ["markdown", "html"])
  onlyMainContent?: boolean     // Extract main content only (default: true)
}
```

**Firecrawl Configuration:**

The Firecrawl API base URL can be configured via environment variable for self-hosted instances:

```bash
FIRECRAWL_BASE_URL=https://api.firecrawl.dev  # Default
# Or for self-hosted:
FIRECRAWL_BASE_URL=https://firecrawl.yourcompany.com
```

#### Browser Actions

```typescript
{
  actions?: BrowserAction[]     // Array of browser automation actions
}
```

**Action types:**

```typescript
// Wait
{ type: "wait", milliseconds: number }

// Click element
{ type: "click", selector: string }

// Type text
{ type: "write", selector: string, text: string }

// Press key
{ type: "press", key: string }

// Scroll
{ type: "scroll", direction: "up" | "down", amount?: number }

// Screenshot
{ type: "screenshot", name?: string }

// Scrape element
{ type: "scrape", selector?: string }

// Execute JavaScript
{ type: "executeJavascript", script: string }
```

**Example:**

```json
{
  "url": "https://example.com/login",
  "actions": [
    { "type": "wait", "milliseconds": 1000 },
    { "type": "write", "selector": "#email", "text": "user@example.com" },
    { "type": "write", "selector": "#password", "text": "password123" },
    { "type": "click", "selector": "button[type=submit]" },
    { "type": "wait", "milliseconds": 2000 },
    { "type": "scrape" }
  ]
}
```

#### LLM Extraction

_Only available if LLM_PROVIDER configured_

```typescript
{
  extract?: string  // Natural language query for intelligent extraction
}
```

**Examples:**

```json
// Simple
{ "extract": "Extract the article title and author" }

// Formatted
{ "extract": "Create a bullet list of all product features mentioned" }

// Structured
{ "extract": "Extract pricing tiers as JSON with name, price, and features array" }

// Complex
{ "extract": "Analyze the blog post and create: 1) 3-sentence summary, 2) list of key takeaways, 3) list of mentioned tools/technologies" }
```

### Response Formats

#### saveAndReturn Mode (Default)

```typescript
{
  content: [{
    type: "resource",
    resource: {
      uri: "memory://cleaned/example.com_path_20250108123456789",
      name: "cleaned/example.com_2025-01-08",
      mimeType: "text/plain",
      text: "Full scraped content in Markdown..."
    }
  }],
  isError: false
}
```

#### saveOnly Mode

```typescript
{
  content: [{
    type: "resource_link",
    uri: "memory://cleaned/example.com_path_20250108123456789",
    name: "cleaned/example.com_2025-01-08",
    mimeType: "text/plain",
    description: "Scraped from https://example.com/path. Estimated 2500 tokens."
  }],
  isError: false
}
```

#### returnOnly Mode

```typescript
{
  content: [{
    type: "text",
    text: "Scraped content in Markdown...\n\n---\nScraped using: native"
  }],
  isError: false
}
```

### Examples

**Basic scrape:**

```json
{
  "url": "https://example.com/article"
}
```

**With extraction:**

```json
{
  "url": "https://example.com/pricing",
  "extract": "Extract all pricing tiers with features and costs"
}
```

**Advanced Firecrawl:**

```json
{
  "url": "https://protected-site.com",
  "proxy": "stealth",
  "waitFor": 3000,
  "formats": ["markdown", "screenshot"],
  "headers": {
    "Referer": "https://google.com"
  }
}
```

---

## MAP Tool

Fast URL discovery from websites (8x faster than crawl). Uses sitemaps and optional search API.

### Parameters

```typescript
{
  url: string,                      // Website URL (required)
  search?: string,                  // Filter URLs by search query
  limit?: number,                   // Max URLs (1-100000, deprecated - use maxResults)
  maxResults?: number,              // Max URLs per response (1-5000, default: 200)
  sitemap?: "skip" | "include" | "only",  // Sitemap strategy (default: "include")
  includeSubdomains?: boolean,      // Include subdomains (default: true)
  ignoreQueryParameters?: boolean,  // Remove query params (default: true)
  timeout?: number,                 // Request timeout (ms)
  location?: {
    country?: string,               // ISO 3166-1 alpha-2 code (default from MAP_DEFAULT_COUNTRY or "US")
    languages?: string[]            // Accept-Language values (default from MAP_DEFAULT_LANGUAGES or ["en-US"])
  },
  startIndex?: number,              // Pagination start (default: 0)
  resultHandling?: "saveOnly" | "saveAndReturn" | "returnOnly"  // Default: "saveAndReturn"
}
```

### Response Format

```typescript
{
  content: [
    {
      type: "text",
      text: "Map Results for https://example.com\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nTotal URLs discovered: 1234\nUnique domains: 5\nURLs with titles: 85%\nShowing: 1-200 of 1234\n\n[More results available. Use startIndex: 200 to continue]"
    },
    {
      type: "resource",
      resource: {
        uri: "pulse-crawl://map/example.com/1736346123456/page-0",
        name: "URL Map: https://example.com (200 URLs)",
        mimeType: "application/json",
        text: "[{\"url\":\"https://example.com/page1\",\"title\":\"Page 1\"},{\"url\":\"https://example.com/page2\",\"title\":\"Page 2\"}]"
      }
    }
  ],
  isError: false
}
```

### Token Usage Guide

| maxResults | Approx Tokens | Use Case                              |
| ---------- | ------------- | ------------------------------------- |
| 100        | ~6.5k         | Ultra-efficient                       |
| 200        | ~13k          | Default, balanced                     |
| 500        | ~32k          | Large sites                           |
| 1000       | ~65k          | Comprehensive (may exceed LLM limits) |

### Examples

**Basic map:**

```json
{
  "url": "https://example.com"
}
```

**Filtered search:**

```json
{
  "url": "https://docs.python.org",
  "search": "asyncio tutorial",
  "maxResults": 50
}
```

**Sitemap only:**

```json
{
  "url": "https://example.com",
  "sitemap": "only",
  "includeSubdomains": false
}
```

**Pagination:**

```json
{
  "url": "https://example.com",
  "startIndex": 200,
  "maxResults": 200
}
```

---

## SEARCH Tool

Google search integration with optional content scraping.

### Parameters

```typescript
{
  query: string,                    // Search query (required, min length: 1)
  limit?: number,                   // Results per source (1-100, default: 5)
  sources?: Array<"web" | "images" | "news">,  // Search sources
  categories?: Array<"github" | "research" | "pdf">,  // Specialized categories
  country?: string,                 // Country code for results
  lang?: string,                    // Language code (default: "en")
  location?: string,                // Geographic location
  timeout?: number,                 // Request timeout (ms)
  ignoreInvalidURLs?: boolean,      // Skip invalid URLs (default: false)
  tbs?: string,                     // Time-based search filter
  scrapeOptions?: {                 // Options for scraping result URLs
    formats?: string[],
    onlyMainContent?: boolean,
    removeBase64Images?: boolean,   // Default: true
    blockAds?: boolean,             // Default: true
    waitFor?: number,
    parsers?: string[]
  }
}
```

### Time-Based Search (tbs parameter)

**Quick filters:**

```json
{ "tbs": "qdr:h" }   // Past hour
{ "tbs": "qdr:d" }   // Past 24 hours
{ "tbs": "qdr:w" }   // Past week
{ "tbs": "qdr:m" }   // Past month
{ "tbs": "qdr:y" }   // Past year
```

**Custom date range:**

```json
{
  "tbs": "cdr:a,cd_min:01/01/2024,cd_max:12/31/2024"
}
```

### Response Format

**Multi-source search:**

```typescript
{
  content: [
    {
      type: "text",
      text: "Found 15 results for \"query\" (5 web, 5 images, 5 news)\nCredits used: 3"
    },
    {
      type: "resource",
      resource: {
        uri: "pulse-crawl://search/web/1736346123456",
        name: "Web Results: query",
        mimeType: "application/json",
        text: "[{\"title\":\"...\",\"url\":\"...\",\"description\":\"...\"}]"
      }
    },
    {
      type: "resource",
      resource: {
        uri: "pulse-crawl://search/images/1736346123456",
        name: "Image Results: query",
        mimeType: "application/json",
        text: "[{\"title\":\"...\",\"url\":\"...\",\"image\":\"...\"}]"
      }
    },
    {
      type: "resource",
      resource: {
        uri: "pulse-crawl://search/news/1736346123456",
        name: "News Results: query",
        mimeType: "application/json",
        text: "[{\"title\":\"...\",\"url\":\"...\",\"date\":\"...\"}]"
      }
    }
  ],
  isError: false
}
```

### Examples

**Basic search:**

```json
{
  "query": "MCP protocol documentation"
}
```

**Recent results:**

```json
{
  "query": "AI news",
  "sources": ["news"],
  "tbs": "qdr:w",
  "limit": 10
}
```

**GitHub search:**

```json
{
  "query": "typescript mcp server",
  "categories": ["github"],
  "limit": 20
}
```

---

## CRAWL Tool

Multi-page crawling with job management. Supports URL patterns, depth limits, and per-page scraping options.

### Parameters

**Mode 1: Start New Crawl** (provide `url`, omit `jobId`)

```typescript
{
  url: string,                      // Starting URL (required)
  prompt?: string,                  // AI-powered parameter generation
  limit?: number,                   // Max pages to crawl (1-100000, default: 100)
  maxDepth?: number,                // Max crawl depth (min: 1)
  crawlEntireDomain?: boolean,      // Crawl entire domain (default: false)
  allowSubdomains?: boolean,        // Include subdomains (default: false)
  allowExternalLinks?: boolean,     // Follow external links (default: false)
  includePaths?: string[],          // URL patterns to include (glob patterns)
  excludePaths?: string[],          // URL patterns to exclude (glob patterns)
  ignoreQueryParameters?: boolean,  // Remove query params (default: true)
  sitemap?: "include" | "skip",     // Use sitemap (default: "include")
  delay?: number,                   // Delay between requests (ms, min: 0)
  maxConcurrency?: number,          // Concurrent requests (min: 1)
  scrapeOptions?: {                 // Per-page scraping options
    formats?: string[],             // Default: ["markdown"]
    onlyMainContent?: boolean,      // Default: true
    includeTags?: string[],
    excludeTags?: string[],
    actions?: BrowserAction[]
  }
}
```

**Mode 2: Check Status/Cancel** (provide `jobId`, omit `url`)

```typescript
{
  jobId: string,                    // Job ID from start response (required)
  cancel?: boolean                  // Cancel the job (default: false)
}
```

### Response Formats

#### Start Crawl Response

```typescript
{
  content: [{
    type: "text",
    text: "Crawl job started successfully!\n\nJob ID: abc123-def456-789\nStatus URL: https://api.firecrawl.dev/v1/crawl/abc123-def456-789\n\nUse crawl tool with jobId \"abc123-def456-789\" to check progress."
  }],
  isError: false
}
```

#### Status Response

```typescript
{
  content: [
    {
      type: "text",
      text: "Crawl Status: scraping\nProgress: 50/100 pages\nCredits used: 150\nExpires at: 2025-01-08T15:30:00Z"
    },
    {
      type: "resource",
      resource: {
        uri: "pulse-crawl://crawl/results/1736346123456",
        name: "Crawl Results (50 pages)",
        mimeType: "application/json",
        text: "[{\"url\":\"...\",\"markdown\":\"...\",\"html\":\"...\"}]"
      }
    }
  ],
  isError: false
}
```

#### Cancel Response

```typescript
{
  content: [{
    type: "text",
    text: "Crawl job abc123-def456-789 has been cancelled."
  }],
  isError: false
}
```

### Examples

**Basic crawl:**

```json
{
  "url": "https://docs.example.com",
  "limit": 50
}
```

**With depth and patterns:**

```json
{
  "url": "https://docs.python.org",
  "maxDepth": 3,
  "includePaths": ["*/library/*", "*/tutorial/*"],
  "excludePaths": ["*/download/*"],
  "limit": 200
}
```

**Check status:**

```json
{
  "jobId": "abc123-def456-789"
}
```

**Cancel crawl:**

```json
{
  "jobId": "abc123-def456-789",
  "cancel": true
}
```

---

## HTTP Endpoints (Remote Mode)

Base URL: `http://localhost:3060` (configurable via PORT env var)

### Main MCP Endpoint

**POST /mcp**

Handle MCP tool calls and requests.

**Headers:**

```
Mcp-Session-Id: <uuid>
Content-Type: application/json
```

**Body:** JSON-RPC 2.0 format

```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "scrape",
    "arguments": {
      "url": "https://example.com"
    }
  },
  "id": 1
}
```

**Response:**

```json
{
  "jsonrpc": "2.0",
  "result": {
    "content": [...],
    "isError": false
  },
  "id": 1
}
```

---

**GET /mcp?sessionId={id}**

Optional SSE streaming for server-initiated messages.

**Query Parameters:**

- `sessionId`: Session identifier (UUID)

**Response:** `text/event-stream`

---

**DELETE /mcp**

Close session.

**Headers:**

```
Mcp-Session-Id: <uuid>
```

**Response:** 200 OK

---

### Health & Metrics Endpoints

**GET /health**

Basic health check.

**Response:**

```json
{
  "status": "healthy",
  "timestamp": "2025-01-08T12:34:56.789Z",
  "version": "0.3.0",
  "transport": "http-streaming"
}
```

---

**GET /metrics**

Console-formatted metrics (requires auth if `METRICS_AUTH_ENABLED=true`).

**Headers (if auth enabled):**

```
X-Metrics-Key: your-secret-key
```

**Query alternative:**

```
GET /metrics?key=your-secret-key
```

**Response:** Plain text

```
Total Requests: 1234
Successful: 1200
Failed: 34
Cache Hits: 890
Cache Misses: 344
```

---

**GET /metrics/json**

JSON-formatted metrics (requires auth if enabled).

**Response:**

```json
{
  "totalRequests": 1234,
  "successful": 1200,
  "failed": 34,
  "cacheHits": 890,
  "cacheMisses": 344,
  "uptime": 86400
}
```

---

**POST /metrics/reset**

Reset metrics counters (requires auth if enabled).

**Response:**

```json
{
  "success": true,
  "message": "Metrics reset successfully"
}
```

---

### OAuth Endpoints (Not Yet Implemented)

**POST /register**

OAuth registration endpoint.

**Status:** Returns 404 if `ENABLE_OAUTH≠true`, 501 if enabled

---

**GET /authorize**

OAuth authorization endpoint.

**Status:** Returns 404 if `ENABLE_OAUTH≠true`, 501 if enabled

---

## Resource URIs

### URI Formats

**Memory Storage:**

```
memory://<resourceType>/<sanitized_url>_<timestamp_digits>
```

Example:

```
memory://cleaned/example.com_path_20250108123456789
```

**Filesystem Storage:**

```
file://<base_path>/<resourceType>/<sanitized_url>_<timestamp_digits>.md
```

Example:

```
file:///var/data/resources/cleaned/example.com_path_20250108123456789.md
```

**Map Results:**

```
pulse-crawl://map/<hostname>/<timestamp>/page-<pageNumber>
```

Example:

```
pulse-crawl://map/example.com/1736346123456/page-0
```

**Search Results:**

```
pulse-crawl://search/<source>/<timestamp>
```

Examples:

```
pulse-crawl://search/web/1736346123456
pulse-crawl://search/images/1736346123456
pulse-crawl://search/news/1736346123456
```

**Crawl Results:**

```
pulse-crawl://crawl/results/<timestamp>
```

Example:

```
pulse-crawl://crawl/results/1736346123456
```

### Resource Types

**Multi-tier storage** (scrape tool only):

1. **raw**: Original fetched content (HTML/markdown from scraping strategy)
2. **cleaned**: HTML → Markdown conversion (if `cleanScrape: true`)
3. **extracted**: LLM-extracted content (if `extract` query provided)

All tiers share the same filename base with different `resourceType` in URI.

---

## Error Responses

### Standard Error Format

```typescript
{
  content: [{
    type: "text",
    text: "Error message with details"
  }],
  isError: true
}
```

### Validation Errors

**Zod validation failures:**

```typescript
{
  content: [{
    type: "text",
    text: "Invalid arguments: url: Invalid URL, timeout: Expected number, received string"
  }],
  isError: true
}
```

### Service Errors

**Firecrawl API errors:**

```typescript
{
  content: [{
    type: "text",
    text: "Firecrawl API error: 429 Too Many Requests - Rate limit exceeded. Please wait 60 seconds before retrying."
  }],
  isError: true
}
```

### Strategy Errors with Diagnostics

**Multi-strategy failure:**

```typescript
{
  content: [{
    type: "text",
    text: "Failed to scrape https://example.com: All strategies failed\n\nDiagnostics:\nStrategies attempted: native, firecrawl\n\nErrors:\n- native: Network timeout\n- firecrawl: API key invalid\n\nTiming:\n- native: 5000ms\n- firecrawl: 1200ms"
  }],
  isError: true
}
```

---

## Type Definitions

### Core Types

```typescript
// MCP CallToolResult
interface CallToolResult {
  content: ContentBlock[];
  isError?: boolean;
}

// Content Block Types
type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'resource'; resource: Resource }
  | { type: 'resource_link'; uri: string; name?: string; mimeType?: string; description?: string }
  | { type: 'image'; data: string; mimeType: string };

// Resource
interface Resource {
  uri: string;
  name?: string;
  mimeType?: string;
  description?: string;
  text?: string;
}
```

### Tool-Specific Types

```typescript
// Scrape Result
interface ScrapeResult {
  success: boolean;
  content?: string;
  source: 'native' | 'firecrawl';
  error?: string;
  metadata?: Record<string, unknown>;
}

// Scrape Diagnostics
interface ScrapeDiagnostics {
  strategiesAttempted: string[];
  strategyErrors: Record<string, string>;
  timing?: Record<string, number>;
}

// Result Handling
type ResultHandling = 'saveOnly' | 'saveAndReturn' | 'returnOnly';

// Browser Actions
type BrowserAction =
  | { type: 'wait'; milliseconds: number }
  | { type: 'click'; selector: string }
  | { type: 'write'; selector: string; text: string }
  | { type: 'press'; key: string }
  | { type: 'scroll'; direction: 'up' | 'down'; amount?: number }
  | { type: 'screenshot'; name?: string }
  | { type: 'scrape'; selector?: string }
  | { type: 'executeJavascript'; script: string };
```

### Storage Types

```typescript
// Resource Storage Interface
interface ResourceStorage {
  list(): Promise<ResourceData[]>;
  read(uri: string): Promise<ResourceContent>;
  write(url: string, content: string, metadata?: Partial<ResourceMetadata>): Promise<string>;
  writeMulti(data: MultiResourceWrite): Promise<MultiResourceUris>;
  exists(uri: string): Promise<boolean>;
  delete(uri: string): Promise<void>;
  findByUrl(url: string): Promise<ResourceData[]>;
  findByUrlAndExtract(url: string, extractPrompt?: string): Promise<ResourceData[]>;
}

// Resource Metadata
interface ResourceMetadata {
  url: string;
  timestamp: string;
  resourceType?: 'raw' | 'cleaned' | 'extracted';
  extractionPrompt?: string;
  contentType?: string;
  title?: string;
  description?: string;
  [key: string]: unknown;
}
```

---

## Next Steps

- **[Tool Documentation](tools/)** - Detailed guides for each tool
- **[Configuration](CONFIGURATION.md)** - Environment variables
- **[Troubleshooting](TROUBLESHOOTING.md)** - Common issues
- **[Development](DEVELOPMENT.md)** - Adding new features
