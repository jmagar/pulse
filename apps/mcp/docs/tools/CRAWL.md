# Crawl Tool

The `crawl` tool enables recursive website crawling with progress tracking and job management. A single consolidated tool handles start, status, and cancel operations.

## Features

- **Natural Language Prompts**: Describe what to crawl in plain English
- **Browser Automation**: Apply actions to every page in the crawl
- **Job Management**: Async crawling with status tracking
- **Path Filtering**: Include/exclude URLs with regex patterns
- **Depth Control**: Limit how deep the crawler follows links
- **Domain Scope**: Configure subdomain and external link behavior
- **Rate Limiting**: Respectful crawling with delays and concurrency limits

## Operations

### Start a Crawl

Provide `url` parameter to initiate a crawl job. Returns a job ID for tracking.

### Check Status

Provide `jobId` parameter to check progress and retrieve results.

### Cancel Crawl

Provide `jobId` + `cancel: true` to cancel an in-progress job.

## Workflow

```text
1. crawl({ url: "..." }) → returns jobId
2. crawl({ jobId: "..." }) → check progress (poll until complete)
3. Retrieve results from completed job
```

## Usage Examples

### Start a Crawl

```json
{
  "url": "https://example.com",
  "limit": 50,
  "scrapeOptions": {
    "formats": ["markdown"],
    "onlyMainContent": true
  }
}
```

**Response:**

```json
{
  "success": true,
  "id": "crawl-job-123",
  "url": "https://api.firecrawl.dev/v2/crawl/crawl-job-123"
}
```

### Check Status

```json
{
  "jobId": "crawl-job-123"
}
```

**Response:**

```json
{
  "status": "scraping",
  "total": 100,
  "completed": 50,
  "creditsUsed": 50,
  "expiresAt": "2025-11-07T12:00:00Z",
  "data": [...]
}
```

### Cancel Crawl

```json
{
  "jobId": "crawl-job-123",
  "cancel": true
}
```

**Response:**

```json
{
  "status": "cancelled"
}
```

## Parameters

### Operation Mode

The tool uses **XOR validation** - you must provide **exactly one** of these parameter groups:

**Mode 1: Start a New Crawl**

- `url` (required): string - Starting URL for the crawl

**Mode 2: Check Status or Cancel**

- `jobId` (required): string - Job ID from start response
- `cancel` (optional): boolean - Set true to cancel

### Start Crawl Parameters

| Parameter               | Type    | Required | Default   | Description                                              |
| ----------------------- | ------- | -------- | --------- | -------------------------------------------------------- |
| `url`                   | string  | Yes\*    | -         | Starting URL for the crawl                               |
| `prompt`                | string  | No       | -         | Natural language crawl description (AI-generated params) |
| `limit`                 | number  | No       | 100       | Maximum pages to crawl (1-100,000)                       |
| `maxDepth`              | number  | No       | -         | Maximum link traversal depth                             |
| `crawlEntireDomain`     | boolean | No       | false     | Crawl all pages in the domain                            |
| `allowSubdomains`       | boolean | No       | false     | Include subdomain URLs                                   |
| `allowExternalLinks`    | boolean | No       | false     | Follow external links                                    |
| `includePaths`          | array   | No       | -         | Include only URLs matching these patterns                |
| `excludePaths`          | array   | No       | -         | Exclude URLs matching these patterns                     |
| `ignoreQueryParameters` | boolean | No       | true      | Ignore URL query parameters                              |
| `sitemap`               | enum    | No       | 'include' | Sitemap handling: `include`, `skip`                      |
| `delay`                 | number  | No       | -         | Delay between requests (ms)                              |
| `maxConcurrency`        | number  | No       | -         | Maximum concurrent requests                              |
| `scrapeOptions`         | object  | No       | -         | Options for scraping each page                           |

\*Required when starting a crawl; cannot be provided with `jobId`.

### Status/Cancel Parameters

| Parameter | Type    | Required | Default | Description                      |
| --------- | ------- | -------- | ------- | -------------------------------- |
| `jobId`   | string  | Yes\*    | -       | Job ID from start crawl response |
| `cancel`  | boolean | No       | false   | Set to true to cancel the job    |

\*Required when checking status or canceling; cannot be provided with `url`.

### Scrape Options

| Option            | Type    | Default      | Description                            |
| ----------------- | ------- | ------------ | -------------------------------------- |
| `formats`         | array   | ["markdown"] | Content formats to extract             |
| `onlyMainContent` | boolean | true         | Extract only main content              |
| `includeTags`     | array   | -            | HTML tags to include                   |
| `excludeTags`     | array   | -            | HTML tags to exclude                   |
| `actions`         | array   | -            | Browser automation actions (see below) |

## Natural Language Crawling

The `prompt` parameter enables you to describe your crawl using natural language instead of manually configuring parameters. Firecrawl's AI will automatically generate optimal crawl parameters based on your description.

### When to Use Prompt vs Manual Configuration

**Use `prompt` when:**

- You want a quick, intuitive way to describe your crawl needs
- You're not sure which specific parameters to use
- You want AI to optimize the crawl strategy for you
- Your requirements can be expressed naturally (e.g., "all blog posts from last year")

**Use manual parameters when:**

- You need precise control over crawl behavior
- You have specific technical requirements (e.g., exact regex patterns)
- You're fine-tuning an existing crawl configuration
- You need reproducible, deterministic behavior

**Note:** When `prompt` is provided, it takes precedence over manual parameters. Firecrawl may override or ignore manually specified parameters based on the AI-generated configuration.

### Examples

#### Blog Post Discovery

```json
{
  "url": "https://example.com",
  "prompt": "Find all blog posts about AI from the past year"
}
```

This automatically:

- Identifies blog post URL patterns
- Filters by date (past year)
- Focuses on AI-related content
- Sets appropriate limits and depth

#### Documentation Crawling

```json
{
  "url": "https://docs.example.com",
  "prompt": "Crawl the documentation section and extract API endpoints"
}
```

This automatically:

- Identifies documentation paths
- Extracts API endpoint information
- Excludes non-documentation pages
- Configures appropriate scrape options

#### Product Page Collection

```json
{
  "url": "https://shop.example.com",
  "prompt": "Get all product pages with pricing information"
}
```

This automatically:

- Identifies product page patterns
- Ensures pricing information is captured
- Excludes category/navigation pages
- Optimizes for structured data extraction

#### Selective Site Mapping

```json
{
  "url": "https://example.com",
  "prompt": "Map the entire site but exclude admin and archived pages"
}
```

This automatically:

- Sets up full domain crawling
- Identifies and excludes admin paths
- Filters out archived content
- Configures efficient crawl parameters

### Combining Prompt with Manual Parameters

You can provide both `prompt` and manual parameters. The prompt takes precedence, but manual parameters serve as hints or fallbacks:

```json
{
  "url": "https://docs.example.com",
  "prompt": "Crawl documentation excluding archived pages",
  "limit": 500,
  "delay": 1000
}
```

In this case:

- AI generates optimal path filtering from the prompt
- `limit` and `delay` may be used as hints or overridden
- The AI optimizes based on your natural language intent

### Comparison: Manual vs Prompt-Based Configuration

**Manual Configuration:**

```json
{
  "url": "https://blog.example.com",
  "includePaths": ["^/posts/.*", "^/articles/.*"],
  "excludePaths": ["^/posts/\\d{4}/0[1-6]/.*"],
  "limit": 200,
  "maxDepth": 3,
  "scrapeOptions": {
    "formats": ["markdown"],
    "onlyMainContent": true
  }
}
```

**Prompt-Based (Equivalent):**

```json
{
  "url": "https://blog.example.com",
  "prompt": "Crawl all blog posts and articles from July 2024 onwards, up to 200 pages"
}
```

The prompt-based approach is simpler but the manual approach gives you precise control over patterns and behavior.

## Browser Actions

**NEW FEATURE**: Apply browser automation actions to **every page** in the crawl (added recently).

### Supported Actions

The `actions` parameter in `scrapeOptions` supports the same 8 action types as the SCRAPE tool:

1. **wait**: `{ "type": "wait", "milliseconds": number }`
2. **click**: `{ "type": "click", "selector": string }`
3. **write**: `{ "type": "write", "selector": string, "text": string }`
4. **press**: `{ "type": "press", "key": string }`
5. **scroll**: `{ "type": "scroll", "direction": "up"|"down", "amount": number }`
6. **screenshot**: `{ "type": "screenshot", "name": string }`
7. **scrape**: `{ "type": "scrape", "selector": string }`
8. **executeJavascript**: `{ "type": "executeJavascript", "script": string }`

### Key Difference from SCRAPE Tool

**SCRAPE**: Actions run once on a single page
**CRAWL**: Actions run on **every page** in the crawl

This enables powerful workflows like:

- Close cookie banners on every page
- Expand "show more" sections across entire site
- Remove ads/popups from all crawled pages
- Take screenshots of every page

### Example: Close Modals on Every Page

```json
{
  "url": "https://example.com",
  "limit": 50,
  "scrapeOptions": {
    "formats": ["markdown"],
    "onlyMainContent": true,
    "actions": [
      { "type": "click", "selector": ".cookie-accept" },
      { "type": "wait", "milliseconds": 500 },
      {
        "type": "executeJavascript",
        "script": "document.querySelector('.newsletter-popup')?.remove()"
      }
    ]
  }
}
```

## Advanced Options

### Path Filtering

Use regex patterns to control which URLs are crawled:

```json
{
  "url": "https://docs.example.com",
  "includePaths": ["^/api/.*", "^/guides/.*"],
  "excludePaths": [".*\\.pdf$", "^/archive/.*"],
  "limit": 100
}
```

### Depth Control

Limit how deep the crawler follows links:

```json
{
  "url": "https://example.com",
  "maxDepth": 3,
  "limit": 500
}
```

### Domain Scope

Control subdomain and external link behavior:

```json
{
  "url": "https://example.com",
  "crawlEntireDomain": true,
  "allowSubdomains": true,
  "allowExternalLinks": false,
  "limit": 1000
}
```

### Rate Limiting

Add delays to be respectful of server resources:

```json
{
  "url": "https://example.com",
  "delay": 1000,
  "maxConcurrency": 3,
  "limit": 100
}
```

## Status Values

| Status      | Description                 |
| ----------- | --------------------------- |
| `scraping`  | Crawl is in progress        |
| `completed` | Crawl finished successfully |
| `failed`    | Crawl encountered an error  |
| `cancelled` | Crawl was cancelled by user |

## Response Data

### Start Crawl Response

```json
{
  "success": true,
  "id": "crawl-job-123",
  "url": "https://api.firecrawl.dev/v2/crawl/crawl-job-123"
}
```

### Status Response

```json
{
  "status": "completed",
  "total": 100,
  "completed": 100,
  "creditsUsed": 100,
  "expiresAt": "2025-11-07T12:00:00Z",
  "data": [
    {
      "markdown": "# Page content",
      "html": "<html>...</html>",
      "metadata": {
        "title": "Page Title",
        "description": "Page description",
        "sourceURL": "https://example.com/page1",
        "statusCode": 200
      }
    }
  ],
  "next": "https://api.firecrawl.dev/v2/crawl/crawl-job-123?page=2"
}
```

## Performance Considerations

- **Default limit**: 10,000 pages (configurable up to 100,000)
- **Results paginated**: If results exceed 10MB, use `next` URL for additional pages
- **Job expiration**: Results expire after the time specified in `expiresAt`
- **Credits**: Consumed based on pages crawled and formats requested
- **Monitoring**: Poll status every 3-5 seconds for progress updates

## Examples

### Crawl Documentation Site

```json
{
  "url": "https://docs.example.com",
  "includePaths": ["^/docs/.*"],
  "excludePaths": ["^/docs/archive/.*"],
  "limit": 200,
  "scrapeOptions": {
    "formats": ["markdown"],
    "onlyMainContent": true
  }
}
```

### Quick Shallow Crawl

```json
{
  "url": "https://example.com",
  "maxDepth": 2,
  "limit": 50,
  "delay": 500
}
```

### Full Site Crawl

```json
{
  "url": "https://example.com",
  "crawlEntireDomain": true,
  "allowSubdomains": true,
  "limit": 10000,
  "maxConcurrency": 5
}
```

### Crawl with Browser Actions

```json
{
  "url": "https://example.com",
  "limit": 100,
  "scrapeOptions": {
    "formats": ["markdown"],
    "onlyMainContent": true,
    "actions": [
      { "type": "wait", "milliseconds": 2000 },
      { "type": "scroll", "direction": "down", "amount": 1000 }
    ]
  }
}
```

## Environment Variables

**Required**:

- `FIRECRAWL_API_KEY` - Firecrawl API key

**Optional**:

- `FIRECRAWL_BASE_URL` - Custom base URL (default: `https://api.firecrawl.dev`)

## Tips

- Try the `prompt` parameter first for quick, intuitive crawling
- Start small and increase limits as needed
- Use `map` tool first to estimate page count
- Apply `includePaths` and `excludePaths` to focus on relevant content
- Monitor progress with regular status checks
- Cancel long-running jobs if they're not needed
- Use `maxDepth` to limit scope for large sites
- Add delays for respectful crawling
- Results are cached until expiration - retrieve them before they expire
- For complex requirements, use manual parameters instead of prompt for reproducibility

## Comparison: Map vs Crawl vs Scrape

| Feature              | Map           | Crawl              | Scrape              |
| -------------------- | ------------- | ------------------ | ------------------- |
| **Pages**            | Many          | Many               | Single              |
| **Content**          | URLs only     | Full content       | Full content        |
| **Speed**            | Fastest       | Moderate           | Fast                |
| **Job tracking**     | No            | Yes                | No                  |
| **Browser Actions**  | No            | Yes (per-page)     | Yes                 |
| **Natural Language** | No            | Yes (prompt)       | No                  |
| **Use case**         | URL discovery | Multi-page content | Single-page content |

**When to use:**

- **Map:** Quick site structure, URL list before selective scraping
- **Crawl:** Related pages, entire site sections, multi-page content extraction
- **Scrape:** Single page with LLM extraction or browser interaction
