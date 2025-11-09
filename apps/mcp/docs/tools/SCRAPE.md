# Scrape Tool

The `scrape` tool fetches and extracts content from a single webpage with advanced features including browser automation, LLM-powered extraction, and multi-tier caching.

## Features

- **Smart Strategy Selection**: Native fetch with Firecrawl fallback
- **Browser Automation**: 8 action types for dynamic page interaction
- **LLM Extraction**: Natural language content queries (optional)
- **Content Cleaning**: HTML-to-Markdown with intelligent filtering
- **Multi-Tier Caching**: Raw, cleaned, and extracted content storage
- **Screenshot Capture**: Visual page snapshots
- **Flexible Storage**: Memory or filesystem backends

## Quick Start

### Basic Scraping

```json
{
  "url": "https://example.com/article"
}
```

### With LLM Extraction

```json
{
  "url": "https://example.com/article",
  "extract": "the article title, author, and publication date"
}
```

### With Browser Actions

```json
{
  "url": "https://example.com/search",
  "actions": [
    { "type": "write", "selector": "#search", "text": "my query" },
    { "type": "press", "key": "Enter" },
    { "type": "wait", "milliseconds": 2000 }
  ]
}
```

## Parameters

| Parameter         | Type     | Required | Default              | Description                                            |
| ----------------- | -------- | -------- | -------------------- | ------------------------------------------------------ |
| `url`             | string   | Yes      | -                    | Webpage URL to scrape (auto-adds https://)             |
| `timeout`         | number   | No       | 60000                | Max page load time in milliseconds                     |
| `maxChars`        | number   | No       | 100000               | Max characters to return (pagination)                  |
| `startIndex`      | number   | No       | 0                    | Starting character position (pagination)               |
| `resultHandling`  | enum     | No       | "saveAndReturn"      | Result mode: `saveOnly`, `saveAndReturn`, `returnOnly` |
| `forceRescrape`   | boolean  | No       | false                | Bypass cache and fetch fresh                           |
| `cleanScrape`     | boolean  | No       | true                 | Convert HTML to semantic Markdown                      |
| `maxAge`          | number   | No       | 172800000            | Accept cache if newer than this (ms, default: 2 days)  |
| `proxy`           | enum     | No       | "auto"               | Proxy mode: `basic`, `stealth`, `auto`                 |
| `blockAds`        | boolean  | No       | true                 | Block ads and cookie popups                            |
| `headers`         | object   | No       | -                    | Custom HTTP headers                                    |
| `waitFor`         | number   | No       | -                    | Wait before scraping (ms, for SPAs)                    |
| `includeTags`     | string[] | No       | -                    | Whitelist: tags/classes/IDs to include                 |
| `excludeTags`     | string[] | No       | -                    | Blacklist: tags/classes/IDs to exclude                 |
| `formats`         | string[] | No       | ["markdown", "html"] | Output formats                                         |
| `onlyMainContent` | boolean  | No       | true                 | Extract only main content area                         |
| `actions`         | array    | No       | -                    | Browser automation actions (see below)                 |
| `extract`         | string   | No       | -                    | Natural language extraction query\*                    |

\*Only available when `LLM_PROVIDER` and `LLM_API_KEY` environment variables are set.

### Formats Options

- `markdown` - Clean Markdown conversion
- `html` - Processed HTML
- `rawHtml` - Original HTML source
- `links` - Extracted links
- `images` - Image URLs
- `screenshot` - Page screenshot (requires FIRECRAWL_API_KEY)
- `summary` - AI-generated summary
- `branding` - Brand information

### Result Handling Modes

| Mode            | Saves Resource | Returns Content   | Use Case                                        |
| --------------- | -------------- | ----------------- | ----------------------------------------------- |
| `saveAndReturn` | ✅ Yes         | ✅ Yes (embedded) | Default: get content AND save for later         |
| `saveOnly`      | ✅ Yes         | ❌ No (link only) | Token-efficient: large content, reference later |
| `returnOnly`    | ❌ No          | ✅ Yes (text)     | Temporary: no need to save                      |

### Proxy Modes

| Mode      | Speed    | Cost        | Anti-Bot | Description                                         |
| --------- | -------- | ----------- | -------- | --------------------------------------------------- |
| `basic`   | Fast     | 1 credit    | Standard | Regular proxy, works for most sites                 |
| `stealth` | Slow     | 5 credits   | Advanced | Advanced anti-bot bypass, use for protected sites   |
| `auto`    | Adaptive | 1-5 credits | Smart    | Tries basic first, falls back to stealth on failure |

## Browser Actions

Execute actions on the page before scraping to handle dynamic content, login forms, modals, etc.

### Action Types

#### 1. wait - Pause for Content Loading

```json
{ "type": "wait", "milliseconds": 2000 }
```

**Use when:** Waiting for AJAX, animations, lazy loading

#### 2. click - Click Elements

```json
{ "type": "click", "selector": "#load-more-button" }
```

**Use when:** Load more content, close modals, expand sections

#### 3. write - Type into Input Fields

```json
{ "type": "write", "selector": "#email", "text": "user@example.com" }
```

**Use when:** Fill forms, search boxes, login fields

#### 4. press - Press Keyboard Keys

```json
{ "type": "press", "key": "Enter" }
```

**Supported keys:** Enter, Tab, Escape, ArrowDown, ArrowUp, etc.

#### 5. scroll - Scroll Page

```json
{ "type": "scroll", "direction": "down", "amount": 500 }
```

**Use when:** Trigger lazy loading, infinite scroll, load images

#### 6. screenshot - Capture Page State

```json
{ "type": "screenshot", "name": "after-login" }
```

**Returns:** Named screenshot in response

#### 7. scrape - Extract Specific Element

```json
{ "type": "scrape", "selector": "#article-content" }
```

**Returns:** Content from selected element only

#### 8. executeJavascript - Run Custom JS

```json
{ "type": "executeJavascript", "script": "document.querySelector('.modal').remove()" }
```

**Use when:** Remove elements, trigger functions, modify page

### Multi-Step Action Example

```json
{
  "url": "https://protected-site.com/data",
  "actions": [
    { "type": "click", "selector": ".accept-cookies" },
    { "type": "wait", "milliseconds": 500 },
    { "type": "write", "selector": "#username", "text": "demo" },
    { "type": "write", "selector": "#password", "text": "password" },
    { "type": "click", "selector": "#login-button" },
    { "type": "wait", "milliseconds": 3000 },
    { "type": "scroll", "direction": "down", "amount": 1000 }
  ]
}
```

## LLM Extraction

Extract specific information using natural language queries. Content is cleaned first, then LLM processes the Markdown.

### Setup

Set environment variables:

```bash
# Anthropic (recommended)
LLM_PROVIDER=anthropic
LLM_API_KEY=sk-ant-...

# OpenAI
LLM_PROVIDER=openai
LLM_API_KEY=sk-...

# OpenAI-compatible (Together, Groq, etc.)
LLM_PROVIDER=openai-compatible
LLM_API_KEY=...
LLM_API_BASE_URL=https://api.together.xyz/v1
```

### Extraction Query Examples

**Simple Information:**

```json
{
  "url": "https://blog.example.com/post",
  "extract": "the author name and publication date"
}
```

**Formatted Summary:**

```json
{
  "url": "https://news.example.com/article",
  "extract": "summarize the main points in 3 bullet points"
}
```

**Structured Data:**

```json
{
  "url": "https://shop.example.com/product/123",
  "extract": "extract product details as JSON with fields: name, price, description, rating"
}
```

**Complex Analysis:**

```json
{
  "url": "https://reviews.example.com/product",
  "extract": "analyze customer reviews, categorize by sentiment (positive/negative/neutral), and count each category"
}
```

### Supported LLM Providers

| Provider            | Default Model            | Notes                      |
| ------------------- | ------------------------ | -------------------------- |
| `anthropic`         | claude-sonnet-4-20250514 | Recommended, best quality  |
| `openai`            | gpt-4.1-mini             | Good balance of speed/cost |
| `openai-compatible` | -                        | Set `LLM_MODEL` manually   |

Override default model:

```bash
LLM_MODEL=claude-3-5-sonnet-20241022
```

## Caching System

### Multi-Tier Storage

Content is saved in three tiers for debugging and reuse:

1. **raw/** - Original fetched content
2. **cleaned/** - Markdown-converted content
3. **extracted/** - LLM-extracted information

All tiers share filename: `{domain}-{hash}.json`

### Cache Lookup

- **Cache key:** URL + extract query (both must match)
- **Max age:** Accept cached content if newer than `maxAge` (default: 2 days)
- **Bypass:** Set `forceRescrape: true` or `maxAge: 0`
- **Screenshots:** Always bypass cache

### Storage Backends

**Memory (default):**

```bash
MCP_RESOURCE_STORAGE=memory
```

- Fast, no disk I/O
- Lost on restart
- URI: `pulse://scraped/{timestamp}`

**Filesystem:**

```bash
MCP_RESOURCE_STORAGE=filesystem
MCP_RESOURCE_FILESYSTEM_ROOT=/path/to/storage
```

- Persistent across restarts
- Organized in subdirectories
- URI: `pulse://scraped/extracted/{domain}-{hash}`

## Response Format

### saveAndReturn Mode (default)

```json
{
  "content": [
    {
      "type": "resource",
      "resource": {
        "uri": "pulse://scraped/extracted/example.com-abc123",
        "name": "https://example.com",
        "mimeType": "text/markdown",
        "text": "Full extracted content..."
      }
    }
  ]
}
```

### saveOnly Mode

```json
{
  "content": [
    {
      "type": "resource_link",
      "uri": "pulse://scraped/extracted/example.com-abc123",
      "name": "https://example.com",
      "description": "Extracted information using query: \"...\""
    }
  ]
}
```

### returnOnly Mode

```json
{
  "content": [
    {
      "type": "text",
      "text": "Scraped content here..."
    }
  ]
}
```

### With Screenshot

```json
{
  "content": [
    {
      "type": "image",
      "data": "base64-encoded-png-data",
      "mimeType": "image/png"
    },
    {
      "type": "resource",
      "resource": {
        "uri": "scraped://example.com/page_2025-01-15T10:30:00Z",
        "name": "https://example.com/page",
        "mimeType": "text/plain",
        "text": "Scraped content here..."
      }
    }
  ]
}
```

## Scraping Strategies

### Two-Tier Fallback

1. **Native Fetch** (free, fast)
   - Built-in HTTP client
   - No JavaScript rendering
   - Works for static sites

2. **Firecrawl API** (requires API key)
   - JavaScript rendering
   - Anti-bot bypass
   - Screenshot support

### Strategy Selection

**Cost Mode (default):**

```bash
OPTIMIZE_FOR=cost
```

- Try native first
- Fall back to Firecrawl on failure
- Learns successful strategies per URL pattern

**Speed Mode:**

```bash
OPTIMIZE_FOR=speed
```

- Skip native, use Firecrawl only
- Faster for known protected sites

### Strategy Learning

The system learns successful strategies:

- Extracts URL patterns (e.g., "github.com/_/blob/_")
- Saves to strategy database
- Future requests use learned strategy
- Falls back on new patterns

## Environment Variables

### Required for Firecrawl Features

```bash
FIRECRAWL_API_KEY=fc-...           # Firecrawl API access
```

### Optional Configuration

```bash
# Firecrawl
FIRECRAWL_BASE_URL=https://api.firecrawl.dev  # Custom endpoint

# Storage
MCP_RESOURCE_STORAGE=memory        # memory|filesystem
MCP_RESOURCE_FILESYSTEM_ROOT=/path # Required for filesystem

# LLM Extraction (enables extract parameter)
LLM_PROVIDER=anthropic             # anthropic|openai|openai-compatible
LLM_API_KEY=sk-...                 # Provider API key
LLM_API_BASE_URL=...               # For openai-compatible only
LLM_MODEL=...                      # Override default model

# Optimization
OPTIMIZE_FOR=cost                  # cost|speed
```

## Error Handling

### Authentication Errors

```
Failed to scrape https://example.com

Diagnostics:
- Strategies attempted: firecrawl
- Strategy errors:
  - firecrawl: Authentication failed (401)

Check your FIRECRAWL_API_KEY environment variable.
```

### Detailed Diagnostics

All errors include:

- **Strategies attempted:** List of strategies tried
- **Strategy errors:** Specific error for each strategy
- **Timing:** Duration of each attempt

### Graceful Degradation

- **Cleaning fails** → Returns raw content
- **Extraction fails** → Returns cleaned content with error note
- **Cache fails** → Proceeds with fresh scrape
- **Storage fails** → Still returns content to user

## Advanced Examples

### Pagination Through Large Documents

First chunk:

```json
{
  "url": "https://example.com/long-article",
  "maxChars": 50000,
  "startIndex": 0
}
```

Second chunk (if truncated):

```json
{
  "url": "https://example.com/long-article",
  "maxChars": 50000,
  "startIndex": 50000
}
```

### Login and Scrape Protected Content

```json
{
  "url": "https://app.example.com/dashboard",
  "headers": {
    "Cookie": "session=abc123; user=demo"
  },
  "actions": [{ "type": "wait", "milliseconds": 2000 }]
}
```

### Scrape Dynamic Content with Infinite Scroll

```json
{
  "url": "https://feed.example.com",
  "actions": [
    { "type": "scroll", "direction": "down", "amount": 1000 },
    { "type": "wait", "milliseconds": 1000 },
    { "type": "scroll", "direction": "down", "amount": 1000 },
    { "type": "wait", "milliseconds": 1000 },
    { "type": "scroll", "direction": "down", "amount": 1000 }
  ],
  "extract": "list all article titles and URLs"
}
```

### Extract Structured Data

```json
{
  "url": "https://shop.example.com/product/123",
  "cleanScrape": true,
  "extract": "extract as JSON: {name: string, price: number, inStock: boolean, reviews: {rating: number, count: number}}"
}
```

### Custom Content Filtering

```json
{
  "url": "https://blog.example.com/post",
  "includeTags": [".article-body", "h1", "h2", "p"],
  "excludeTags": [".sidebar", ".comments", "#ad"],
  "onlyMainContent": true
}
```

## Performance Tips

### Cost Optimization

1. **Use native when possible:** Set `OPTIMIZE_FOR=cost`
2. **Enable caching:** Default `maxAge` is 2 days
3. **Use basic proxy:** Avoid `stealth` unless needed
4. **Filter content:** Use `includeTags`/`excludeTags` to reduce size
5. **Clean scraping:** Keep `cleanScrape: true` (reduces 50-90%)

### Speed Optimization

1. **Skip native:** Set `OPTIMIZE_FOR=speed`
2. **Cache aggressively:** Increase `maxAge` to 7+ days
3. **Use saveOnly:** Reduces token usage for large content
4. **Disable cleaning:** Set `cleanScrape: false` if you need raw HTML

### Token Budget

- **Typical page:** 5,000-20,000 tokens (cleaned)
- **Large article:** 50,000-100,000 tokens (use pagination)
- **Screenshot:** ~10,000 tokens per image
- **saveOnly mode:** ~100 tokens (returns link only)

## Troubleshooting

### "Authentication failed" Error

**Cause:** Missing or invalid `FIRECRAWL_API_KEY`

**Solution:**

```bash
export FIRECRAWL_API_KEY=fc-your-key-here
```

### "Extract parameter not available"

**Cause:** LLM not configured

**Solution:**

```bash
export LLM_PROVIDER=anthropic
export LLM_API_KEY=sk-ant-your-key
```

### Content Too Short or Missing

**Causes:**

- Page uses JavaScript rendering
- Content behind login/paywall
- Anti-bot protection

**Solutions:**

1. Add `waitFor` for JS loading
2. Use `actions` for interaction
3. Set `proxy: "stealth"` for anti-bot
4. Include authentication `headers`

### Screenshots Not Working

**Cause:** Requires Firecrawl API (native fetch doesn't support screenshots)

**Solution:** Ensure `FIRECRAWL_API_KEY` is set

### Cache Not Working

**Causes:**

- Different `extract` query (cache key includes extract)
- `forceRescrape: true` set
- `resultHandling: "saveOnly"` (bypasses lookup)
- Content older than `maxAge`

**Solution:** Check cache key matches and maxAge setting

## Comparison: Scrape vs Crawl vs Map vs Search

| Feature             | Scrape                   | Crawl              | Map           | Search         |
| ------------------- | ------------------------ | ------------------ | ------------- | -------------- |
| **Pages**           | Single                   | Multiple           | Multiple      | Multiple       |
| **Content**         | Full                     | Full               | URLs only     | Search results |
| **Speed**           | Fast                     | Moderate           | Fastest       | Fast           |
| **Browser Actions** | ✅ Yes                   | ✅ Yes (per-page)  | ❌ No         | ❌ No          |
| **LLM Extract**     | ✅ Yes                   | ❌ No              | ❌ No         | ❌ No          |
| **Caching**         | ✅ Multi-tier            | ❌ No              | ❌ No         | ❌ No          |
| **Job Tracking**    | ❌ No                    | ✅ Yes             | ❌ No         | ❌ No          |
| **Use Case**        | Single page + extraction | Multi-page content | URL discovery | Web search     |

**When to use:**

- **Scrape:** Single page, need extraction or browser interaction
- **Crawl:** Related pages, entire site section
- **Map:** Quick site structure, URL list
- **Search:** Find pages across the web
