# Firecrawl Search API - Comprehensive Analysis

**Date**: 2025-11-06
**Purpose**: Implementation planning for Pulse Fetch MCP server search tool
**API Version**: v2

---

## Overview

The Firecrawl Search API combines web search (SERP) capabilities with Firecrawl's scraping features to return full page content for search queries. It supports multiple search result types (web, news, images) and can optionally scrape the full content of each result.

---

## API Endpoint

- **URL**: `https://api.firecrawl.dev/v2/search`
- **Method**: `POST`
- **Authentication**: Bearer token (API key format: `fc-YOUR_API_KEY`)
- **Base URL Override**: Configurable via `FIRECRAWL_BASE_URL` environment variable

---

## Request Parameters

### Required Parameters

| Parameter | Type   | Description                      |
| --------- | ------ | -------------------------------- |
| `query`   | string | The search query/term to execute |

### Optional Core Parameters

| Parameter           | Type    | Default   | Constraints                       | Description                                        |
| ------------------- | ------- | --------- | --------------------------------- | -------------------------------------------------- |
| `limit`             | number  | 5         | Min: 1, Max: 100, Integer         | Number of search results to return                 |
| `sources`           | array   | `["web"]` | Enum: `web`, `images`, `news`     | Types of search results to include                 |
| `categories`        | array   | -         | Enum: `github`, `research`, `pdf` | Specialized search domains to filter by            |
| `tbs`               | string  | -         | -                                 | Time-based search parameter (e.g., recent results) |
| `filter`            | string  | -         | -                                 | Additional search filters                          |
| `lang`              | string  | `"en"`    | -                                 | Language for search results                        |
| `country`           | string  | -         | ISO country code                  | Country targeting (default: US if not specified)   |
| `location`          | string  | -         | -                                 | Geographic location for search context             |
| `timeout`           | number  | 60000     | Integer, positive                 | Request timeout in milliseconds                    |
| `ignoreInvalidURLs` | boolean | false     | -                                 | Whether to exclude invalid URLs from results       |
| `asyncScraping`     | boolean | false     | -                                 | Whether to scrape results asynchronously           |

### Sources Parameter

Can be specified in two formats:

**Simple format** (array of strings):

```json
{
  "sources": ["web", "images", "news"]
}
```

**Advanced format** (array of objects with options):

```json
{
  "sources": [
    { "type": "web", ...options },
    { "type": "images", ...options },
    { "type": "news", ...options }
  ]
}
```

### Categories Parameter

Specialized search domains for targeted searches:

- `github` - Search GitHub repositories and code
- `research` - Search academic/research papers
- `pdf` - Search for PDF documents

**Simple format**:

```json
{
  "categories": ["github", "research", "pdf"]
}
```

**Advanced format**:

```json
{
  "categories": [{ "type": "github" }, { "type": "research" }, { "type": "pdf" }]
}
```

### Scrape Options

Optional parameters to control content scraping of search results:

| Parameter             | Type    | Default  | Description                                     |
| --------------------- | ------- | -------- | ----------------------------------------------- |
| `formats`             | array   | `[]`     | Content formats to extract (see below)          |
| `onlyMainContent`     | boolean | -        | Extract only main content, removing boilerplate |
| `includeTags`         | array   | -        | HTML tags to include in extraction              |
| `excludeTags`         | array   | -        | HTML tags to exclude from extraction            |
| `maxAge`              | number  | -        | Maximum age of cached content (milliseconds)    |
| `headers`             | object  | -        | Custom HTTP headers for scraping                |
| `waitFor`             | number  | -        | Time to wait before scraping (milliseconds)     |
| `mobile`              | boolean | false    | Use mobile user agent                           |
| `skipTlsVerification` | boolean | true     | Skip TLS certificate verification               |
| `parsers`             | array   | -        | Content parsers to use (e.g., `["pdf"]`)        |
| `actions`             | array   | -        | Browser actions to perform before scraping      |
| `removeBase64Images`  | boolean | true     | Remove base64-encoded images from content       |
| `blockAds`            | boolean | true     | Block advertisements during scraping            |
| `proxy`               | string  | `"auto"` | Proxy configuration                             |
| `storeInCache`        | boolean | true     | Whether to cache scraped content                |

### Format Types

When `scrapeOptions.formats` is provided, you can request multiple content formats:

| Format       | Type   | Description                                         |
| ------------ | ------ | --------------------------------------------------- |
| `markdown`   | string | Clean Markdown representation of page content       |
| `html`       | string | Processed HTML content                              |
| `rawHtml`    | string | Raw HTML source                                     |
| `links`      | array  | Array of links found on the page                    |
| `images`     | array  | Array of images found on the page                   |
| `summary`    | string | AI-generated summary of content                     |
| `json`       | object | Structured data extraction (requires prompt/schema) |
| `screenshot` | string | Screenshot of the page (base64 or URL)              |

**Format specification**:

```json
{
  "scrapeOptions": {
    "formats": [
      "markdown",
      "html",
      "links",
      { "type": "screenshot", "fullPage": true },
      { "type": "json", "prompt": "Extract product details" }
    ]
  }
}
```

### Browser Actions

Optional actions to perform before scraping:

```json
{
  "scrapeOptions": {
    "actions": [
      {
        "type": "wait",
        "milliseconds": 2000,
        "selector": "#my-element"
      },
      {
        "type": "click",
        "selector": ".load-more-button"
      }
    ]
  }
}
```

### Location Configuration

```json
{
  "scrapeOptions": {
    "location": {
      "country": "US",
      "languages": ["en-US"]
    }
  }
}
```

---

## Response Structure

### Success Response (Without Scraping)

Basic search results without content scraping:

```json
{
  "success": true,
  "warning": "Optional warning message",
  "data": [
    {
      "url": "https://example.com",
      "title": "Example Page Title",
      "description": "Brief description from search results"
    }
  ],
  "creditsUsed": 2
}
```

### Success Response (With Search Sources)

When using multiple sources, results are organized by type:

```json
{
  "success": true,
  "warning": "Optional warning message",
  "data": {
    "web": [
      {
        "url": "https://example.com",
        "title": "Web Result Title",
        "description": "Web result description",
        "position": 1,
        "category": "github",
        "markdown": "# Full page content in markdown...",
        "html": "<html>...</html>",
        "rawHtml": "<!DOCTYPE html>...",
        "links": ["https://link1.com", "https://link2.com"],
        "screenshot": "base64_encoded_image_or_url",
        "metadata": {
          "statusCode": 200,
          "sourceURL": "https://example.com",
          "pageTitle": "Example Page"
        }
      }
    ],
    "images": [
      {
        "title": "Image Title",
        "imageUrl": "https://example.com/image.jpg",
        "imageWidth": 1920,
        "imageHeight": 1080,
        "url": "https://example.com/page-with-image",
        "position": 1
      }
    ],
    "news": [
      {
        "title": "News Article Title",
        "url": "https://news.example.com/article",
        "snippet": "Brief news snippet...",
        "date": "2025-11-06",
        "imageUrl": "https://news.example.com/thumbnail.jpg",
        "position": 1,
        "category": "technology",
        "markdown": "# Full article content...",
        "html": "<html>...</html>",
        "rawHtml": "<!DOCTYPE html>...",
        "links": ["https://related1.com"],
        "screenshot": "base64_or_url",
        "metadata": {}
      }
    ]
  },
  "creditsUsed": 10
}
```

### Success Response (Async Scraping)

When `asyncScraping: true`:

```json
{
  "success": true,
  "warning": "Optional warning message",
  "data": {
    "web": [...],
    "images": [...],
    "news": [...]
  },
  "scrapeIds": {
    "web": ["job-id-1", "job-id-2"],
    "news": ["job-id-3"],
    "images": ["job-id-4"]
  },
  "creditsUsed": 10
}
```

### Error Response

```json
{
  "success": false,
  "error": "Error message describing what went wrong"
}
```

### Response Field Details

#### WebSearchResult

| Field         | Type     | Optional | Description                                  |
| ------------- | -------- | -------- | -------------------------------------------- |
| `url`         | string   | No       | URL of the search result                     |
| `title`       | string   | No       | Page title                                   |
| `description` | string   | No       | Search result description/snippet            |
| `position`    | number   | Yes      | Position in search results (1-indexed)       |
| `category`    | string   | Yes      | Category if filtered (github, research, pdf) |
| `markdown`    | string   | Yes      | Full page content in Markdown (if scraped)   |
| `html`        | string   | Yes      | Processed HTML content (if scraped)          |
| `rawHtml`     | string   | Yes      | Raw HTML source (if scraped)                 |
| `links`       | string[] | Yes      | Array of links found (if scraped)            |
| `screenshot`  | string   | Yes      | Screenshot data (if requested)               |
| `metadata`    | object   | Yes      | Additional metadata from scraping            |

#### ImageSearchResult

| Field         | Type   | Optional | Description                      |
| ------------- | ------ | -------- | -------------------------------- |
| `title`       | string | Yes      | Image title/alt text             |
| `imageUrl`    | string | Yes      | Direct URL to the image          |
| `imageWidth`  | number | Yes      | Image width in pixels            |
| `imageHeight` | number | Yes      | Image height in pixels           |
| `url`         | string | Yes      | URL of page containing the image |
| `position`    | number | Yes      | Position in search results       |

#### NewsSearchResult

| Field        | Type     | Optional | Description                           |
| ------------ | -------- | -------- | ------------------------------------- |
| `title`      | string   | Yes      | News article title                    |
| `url`        | string   | Yes      | URL to the article                    |
| `snippet`    | string   | Yes      | Brief article excerpt                 |
| `date`       | string   | Yes      | Publication date                      |
| `imageUrl`   | string   | Yes      | Article thumbnail/hero image          |
| `position`   | number   | Yes      | Position in search results            |
| `category`   | string   | Yes      | News category                         |
| `markdown`   | string   | Yes      | Full article in Markdown (if scraped) |
| `html`       | string   | Yes      | Article HTML (if scraped)             |
| `rawHtml`    | string   | Yes      | Raw HTML (if scraped)                 |
| `links`      | string[] | Yes      | Links found in article (if scraped)   |
| `screenshot` | string   | Yes      | Screenshot (if requested)             |
| `metadata`   | object   | Yes      | Additional metadata                   |

---

## Example Requests

### Basic Search

```bash
curl -X POST https://api.firecrawl.dev/v2/search \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer fc-YOUR_API_KEY" \
  -d '{
    "query": "what is firecrawl?",
    "limit": 5
  }'
```

### Search with Multiple Sources

```bash
curl -X POST https://api.firecrawl.dev/v2/search \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer fc-YOUR_API_KEY" \
  -d '{
    "query": "web scraping tools",
    "limit": 10,
    "sources": ["web", "images", "news"]
  }'
```

### Search with Content Scraping

```bash
curl -X POST https://api.firecrawl.dev/v2/search \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer fc-YOUR_API_KEY" \
  -d '{
    "query": "what is firecrawl?",
    "limit": 5,
    "scrapeOptions": {
      "formats": ["markdown", "links"],
      "onlyMainContent": true
    }
  }'
```

### Category-Specific Search

```bash
curl -X POST https://api.firecrawl.dev/v2/search \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer fc-YOUR_API_KEY" \
  -d '{
    "query": "web scraping",
    "limit": 10,
    "categories": ["github"]
  }'
```

### Advanced Search with Full Options

```bash
curl -X POST https://api.firecrawl.dev/v2/search \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer fc-YOUR_API_KEY" \
  -d '{
    "query": "artificial intelligence",
    "limit": 20,
    "sources": ["web", "news"],
    "categories": ["research"],
    "country": "US",
    "lang": "en",
    "location": "San Francisco",
    "timeout": 60000,
    "ignoreInvalidURLs": true,
    "scrapeOptions": {
      "formats": ["markdown", "html", "links"],
      "onlyMainContent": true,
      "removeBase64Images": true,
      "blockAds": true,
      "waitFor": 2000,
      "maxAge": 172800000
    }
  }'
```

---

## Pricing & Credits

- **Base Cost**: 2 credits per 10 search results without content scraping
- **With Scraping**: Additional credits based on:
  - Number of pages scraped
  - Formats requested (JSON mode, screenshots incur extra costs)
  - PDF parsing (if applicable)
  - Stealth proxy usage
- **No Extra Charge**: Basic result scraping (markdown, html, links)

---

## Rate Limits & Constraints

- **Maximum Results**: 100 per request (`limit` parameter)
- **Default Limit**: 5 results
- **Timeout**: Configurable, default 60000ms (60 seconds)
- **Authentication**: Required for all requests

---

## Error Handling

### HTTP Status Codes

| Code | Meaning                                            |
| ---- | -------------------------------------------------- |
| 200  | Success                                            |
| 401  | Authentication failed (invalid or missing API key) |
| 408  | Request timeout                                    |
| 429  | Rate limit exceeded                                |
| 500  | Server error                                       |

### Error Response Format

```json
{
  "success": false,
  "error": "Detailed error message"
}
```

### Common Error Scenarios

1. **Invalid API Key**: Returns 401 with authentication error
2. **Timeout**: Request exceeds timeout parameter
3. **Invalid Parameters**: Validation errors for malformed requests
4. **Rate Limiting**: Too many requests in short time period
5. **Invalid URLs**: Results contain blocked or invalid URLs (can be filtered with `ignoreInvalidURLs`)

---

## Implementation Considerations for MCP Server

### Required Environment Variables

```bash
FIRECRAWL_API_KEY=fc-your-api-key-here
FIRECRAWL_BASE_URL=https://api.firecrawl.dev  # Optional, defaults to this
```

### Recommended Tool Structure

```typescript
interface SearchToolInput {
  query: string;
  limit?: number;
  sources?: Array<'web' | 'images' | 'news'>;
  categories?: Array<'github' | 'research' | 'pdf'>;
  scrapeContent?: boolean;
  scrapeOptions?: {
    formats?: Array<'markdown' | 'html' | 'links' | 'screenshot'>;
    onlyMainContent?: boolean;
  };
  country?: string;
  lang?: string;
  timeout?: number;
}
```

### Architecture Patterns

1. **Client Class**: Create `FirecrawlSearchClient` similar to existing `FirecrawlScrapingClient`
2. **Factory Pattern**: Add to existing client factory for dependency injection
3. **Error Handling**: Use consistent error response format with `{ success, data?, error? }`
4. **Authentication**: Reuse existing Firecrawl API key handling
5. **Resource Storage**: Consider caching search results in MCP resources

### Tool Registration

```typescript
{
  name: "search",
  description: "Search the web using Firecrawl's search API with optional content scraping",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query" },
      limit: { type: "number", description: "Number of results (1-100)", default: 5 },
      sources: {
        type: "array",
        items: { enum: ["web", "images", "news"] },
        description: "Types of search results"
      },
      scrapeContent: {
        type: "boolean",
        description: "Whether to scrape full content of results",
        default: false
      }
      // ... additional parameters
    },
    required: ["query"]
  }
}
```

### Response Formatting for MCP

Convert Firecrawl response to MCP-compatible format:

```typescript
{
  content: [
    {
      type: 'text',
      text: "Found 5 web results for 'query':\n\n1. [Title](url)\n   Description\n\n...",
    },
    {
      type: 'resource',
      resource: {
        uri: `firecrawl-search://query-hash-1`,
        name: 'Search Result: Result Title',
        mimeType: 'text/markdown',
        text: 'Full scraped content...',
      },
    },
  ];
}
```

### Testing Strategy

1. **Unit Tests**: Mock Firecrawl API responses
2. **Functional Tests**: Test search without API calls (mocked client factory)
3. **Integration Tests**: Test against real Firecrawl API (manual tests)
4. **Error Cases**: Test authentication failures, timeouts, invalid parameters

### Feature Flags

Consider progressive rollout:

1. Basic search (no scraping)
2. Search with content scraping
3. Multi-source search (web + images + news)
4. Category filtering (github, research, pdf)
5. Advanced options (async scraping, custom locations)

---

## Comparison with Scrape Endpoint

| Feature      | Scrape Endpoint     | Search Endpoint                  |
| ------------ | ------------------- | -------------------------------- |
| **Purpose**  | Scrape specific URL | Search + optional scraping       |
| **Input**    | Single URL          | Search query                     |
| **Output**   | Single page content | Multiple results with metadata   |
| **Formats**  | All formats         | Same formats per result          |
| **Cost**     | Per page            | Per 10 results base + per scrape |
| **Use Case** | Known URLs          | Discovery + content              |

---

## References

- Firecrawl API Documentation: https://docs.firecrawl.dev/api-reference/endpoint/search
- Firecrawl GitHub: https://github.com/firecrawl/firecrawl
- Source Code: `apps/api/src/controllers/v2/search.ts`
- Type Definitions: `apps/api/src/controllers/v2/types.ts`, `apps/api/src/lib/entities.ts`

---

## Next Steps for Implementation

1. Create `FirecrawlSearchClient` class in `shared/scraping/clients/firecrawl/`
2. Add search API function to `shared/scraping/clients/firecrawl/api.ts`
3. Create search tool in `shared/mcp/tools/search/`
4. Add Zod validation schema for search parameters
5. Implement response formatting for MCP compatibility
6. Write unit and functional tests
7. Add manual integration tests
8. Update documentation
9. Register tool in shared module exports
