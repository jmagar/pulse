# Firecrawl Core Scrape Options - Complete Research Report

**Research Date**: 2025-11-06
**API Version**: Firecrawl v2
**Sources**: Official Firecrawl Documentation (docs.firecrawl.dev)

---

## Table of Contents

1. [Overview](#overview)
2. [Format Options](#format-options)
3. [Content Extraction & Filtering](#content-extraction--filtering)
4. [Wait & Timeout Options](#wait--timeout-options)
5. [Headers & Mobile Emulation](#headers--mobile-emulation)
6. [Location & Proxy Settings](#location--proxy-settings)
7. [Caching & Performance](#caching--performance)
8. [Actions (Browser Automation)](#actions-browser-automation)
9. [Advanced Features](#advanced-features)
10. [Best Practices & Recommendations](#best-practices--recommendations)
11. [Default Values Reference](#default-values-reference)
12. [Example Configurations](#example-configurations)

---

## Overview

Firecrawl's `/v2/scrape` endpoint converts web pages into LLM-ready formats while handling proxies, anti-bot mechanisms, dynamic content, and JavaScript rendering. The API supports multiple output formats, content filtering, browser automation, and intelligent caching.

**Key Capabilities**:

- Multiple output formats (markdown, HTML, JSON, screenshots, etc.)
- Browser automation with actions (click, scroll, wait, etc.)
- Smart caching with configurable freshness
- Geo-targeting with 19 country proxies
- LLM-powered structured data extraction
- Change tracking and monitoring

---

## Format Options

The `formats` parameter accepts an array of format specifiers. Multiple formats can be requested simultaneously.

### Available Formats

#### 1. **markdown** (string)

- **Default**: `true` (included by default)
- **Description**: Clean markdown conversion optimized for LLM processing
- **Output Key**: `data.markdown`
- **Example**:
  ```json
  { "formats": ["markdown"] }
  ```

#### 2. **html** (string)

- **Description**: Standard HTML representation of the page
- **Output Key**: `data.html`
- **Example**:
  ```json
  { "formats": ["html"] }
  ```

#### 3. **rawHtml** (string)

- **Description**: Raw HTML with no modifications for direct DOM access
- **Output Key**: `data.rawHtml`
- **Example**:
  ```json
  { "formats": ["rawHtml"] }
  ```

#### 4. **links** (array)

- **Description**: Extracts all hyperlinks present on the page
- **Output Key**: `data.links`
- **Example**:
  ```json
  { "formats": ["links"] }
  ```

#### 5. **images** (array)

- **Description**: Retrieves all image URLs found within page content
- **Output Key**: `data.images`
- **Example**:
  ```json
  { "formats": ["images"] }
  ```

#### 6. **screenshot** (object)

- **Description**: Captures visual representation of the page
- **Output Key**: `data.screenshot`
- **Parameters**:
  - `fullPage` (boolean): Capture entire page vs viewport only
  - `quality` (integer): Image quality (0-100)
  - `viewport` (object): Custom viewport dimensions
    - `width` (integer): Viewport width in pixels
    - `height` (integer): Viewport height in pixels
- **Example**:
  ```json
  {
    "formats": [
      {
        "type": "screenshot",
        "fullPage": true,
        "quality": 90,
        "viewport": { "width": 1920, "height": 1080 }
      }
    ]
  }
  ```

#### 7. **json** (object) - Structured Data Extraction

- **Description**: LLM-powered extraction into structured JSON format
- **Output Key**: `data.json`
- **Parameters**:
  - `schema` (object): JSON Schema (OpenAI format) defining output structure
  - `prompt` (string): Natural language extraction guidance
- **Usage**: Either `schema` OR `prompt` can be provided (or both)
- **Example (Schema-based)**:
  ```json
  {
    "formats": [
      {
        "type": "json",
        "schema": {
          "type": "object",
          "properties": {
            "title": { "type": "string" },
            "price": { "type": "number" },
            "inStock": { "type": "boolean" }
          },
          "required": ["title", "price"]
        }
      }
    ]
  }
  ```
- **Example (Prompt-based)**:
  ```json
  {
    "formats": [
      {
        "type": "json",
        "prompt": "Extract the product name, price, and availability status"
      }
    ]
  }
  ```

#### 8. **summary** (string)

- **Description**: Provides concise content summaries of scraped pages (v2 feature)
- **Output Key**: `data.summary`
- **Example**:
  ```json
  { "formats": ["summary"] }
  ```

#### 9. **branding** (object)

- **Description**: Extracts comprehensive visual identity data including color schemes, typography, fonts, spacing, UI components, logos, and design system information
- **Output Key**: `data.branding`
- **Example**:
  ```json
  { "formats": ["branding"] }
  ```

#### 10. **changeTracking** (object)

- **Description**: Monitors web content modifications over time
- **Output Key**: `data.changeTracking`
- **Parameters**:
  - `modes` (array): `["git-diff"]` and/or `["json"]`
  - `schema` (object): Fields for structured JSON comparison
  - `prompt` (string): Custom extraction instructions
  - `tag` (string): Separates tracking histories for different environments
- **Status Values**: "new", "same", "changed", "removed"
- **Visibility Values**: "visible", "hidden"
- **Billing**: Basic tracking and git-diff are free; JSON mode costs 5 credits/page
- **Important**: Must include "markdown" format alongside changeTracking
- **Example**:
  ```json
  {
    "formats": [
      "markdown",
      {
        "type": "changeTracking",
        "modes": ["git-diff", "json"],
        "schema": {
          "type": "object",
          "properties": {
            "price": { "type": "number" }
          }
        },
        "tag": "production"
      }
    ]
  }
  ```

---

## Content Extraction & Filtering

### Main Content Extraction

#### **onlyMainContent** (boolean)

- **Default**: `true`
- **Description**: Only return the main content of the page excluding headers, navs, footers, etc.
- **Recommendation**: Keep `true` for LLM processing to reduce noise
- **Example**:
  ```json
  { "onlyMainContent": true }
  ```

### Tag-Based Filtering

#### **includeTags** (array of strings)

- **Default**: Not set
- **Description**: Specify HTML tags, classes, or IDs to include in output
- **Syntax**: Tag names, `.class-name`, `#id-name`
- **Example**:
  ```json
  { "includeTags": ["h1", "p", "a", ".main-content", "#article"] }
  ```

#### **excludeTags** (array of strings)

- **Default**: Not set
- **Description**: Specify HTML tags, classes, or IDs to exclude from output
- **Syntax**: Tag names, `.class-name`, `#id-name`
- **Example**:
  ```json
  { "excludeTags": ["nav", "footer", "#ad", ".sidebar"] }
  ```

### Image Processing

#### **removeBase64Images** (boolean)

- **Default**: `true`
- **Description**: Removes all base64 images from the output to reduce payload size
- **Example**:
  ```json
  { "removeBase64Images": true }
  ```

### File Parsers

#### **parsers** (array of objects)

- **Default**: `[{ "type": "pdf" }]`
- **Description**: Controls how files are processed during scraping
- **PDF Parser Options**:
  - `type: "pdf"` - Extracts PDF content as markdown (1 credit per page)
  - `maxPages` (integer, 1-10000) - Limits pages to parse
  - Empty array `[]` - Returns PDF as base64 (1 credit flat rate)
- **Example**:
  ```json
  {
    "parsers": [{ "type": "pdf", "maxPages": 50 }]
  }
  ```

---

## Wait & Timeout Options

### Wait Before Scraping

#### **waitFor** (integer)

- **Default**: `0`
- **Unit**: Milliseconds
- **Description**: Specify a delay before fetching content, useful for dynamic content loading
- **Recommendation**: Use for JavaScript-heavy sites; typically 1000-3000ms
- **Example**:
  ```json
  { "waitFor": 2000 }
  ```

### Request Timeout

#### **timeout** (integer)

- **Default**: `30000` (30 seconds)
- **Unit**: Milliseconds
- **Description**: Maximum duration for the request
- **Recommendation**: Increase for slow-loading pages (up to 60000ms)
- **Example**:
  ```json
  { "timeout": 45000 }
  ```

---

## Headers & Mobile Emulation

### Custom Headers

#### **headers** (object)

- **Default**: Not set
- **Description**: Headers to send with the request (cookies, user-agent, authorization, etc.)
- **Common Use Cases**:
  - Authentication tokens
  - Custom user agents
  - Cookies for session management
  - Accept-Language headers
- **Example**:
  ```json
  {
    "headers": {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Accept-Language": "en-US,en;q=0.9",
      "Cookie": "session=abc123; preferences=dark_mode"
    }
  }
  ```

### Mobile Device Emulation

#### **mobile** (boolean)

- **Default**: `false`
- **Description**: Set to true to emulate scraping from a mobile device
- **Effect**: Changes viewport, user agent, and touch capabilities
- **Example**:
  ```json
  { "mobile": true }
  ```

---

## Location & Proxy Settings

### Geographic Location

#### **location** (object)

- **Description**: Controls regional content delivery through proxies and browser settings
- **Parameters**:
  - `country` (string): ISO 3166-1 alpha-2 country code
  - `languages` (array): Preferred language/locale codes in priority order
- **Default Country**: `"US"`
- **Effect**: Uses region-appropriate proxies and emulates timezone/language settings
- **Example**:
  ```json
  {
    "location": {
      "country": "GB",
      "languages": ["en-GB", "en"]
    }
  }
  ```

### Supported Countries (19 Total)

| Country Code | Country Name         | Stealth Support |
| ------------ | -------------------- | --------------- |
| AE           | United Arab Emirates | No              |
| AU           | Australia            | Yes             |
| BR           | Brazil               | Yes             |
| CA           | Canada               | No              |
| CN           | China                | No              |
| CZ           | Czechia              | No              |
| DE           | Germany              | Yes             |
| FR           | France               | Yes             |
| GB           | United Kingdom       | No              |
| IL           | Israel               | No              |
| IN           | India                | No              |
| IT           | Italy                | No              |
| JP           | Japan                | No              |
| PL           | Poland               | No              |
| PT           | Portugal             | No              |
| QA           | Qatar                | No              |
| TR           | Turkey               | No              |
| US           | United States        | Yes             |
| VN           | Vietnam              | No              |

**Note**: Only 6 countries support stealth mode (AU, BR, DE, FR, US, VN). For unavailable regions, Firecrawl defaults to the closest available region (EU or US) while adjusting browser settings.

### Proxy Configuration

#### **proxy** (string)

- **Default**: `"auto"`
- **Options**:
  - `"basic"` - Standard proxies for sites with basic anti-bot (standard cost)
  - `"stealth"` - Advanced proxies for sophisticated anti-bot systems (up to 5x cost)
  - `"auto"` - Automatically retries with stealth if basic fails (recommended)
- **Example**:
  ```json
  { "proxy": "auto" }
  ```

---

## Caching & Performance

### Cache Control

#### **maxAge** (integer)

- **Default**: `172800000` (2 days / 48 hours)
- **Unit**: Milliseconds
- **Description**: Returns cached version if younger than specified age
- **Special Values**:
  - `0` - Force fresh scrape (bypass cache)
  - `172800000` - Default 2-day cache
- **Example**:
  ```json
  { "maxAge": 3600000 } // 1 hour
  ```

#### **storeInCache** (boolean)

- **Default**: `true`
- **Description**: Store page in Firecrawl index and cache for future requests
- **Example**:
  ```json
  { "storeInCache": false }
  ```

### Security & Privacy

#### **skipTlsVerification** (boolean)

- **Default**: `true`
- **Description**: Skip TLS certificate verification
- **Use Case**: Useful for internal sites with self-signed certificates
- **Example**:
  ```json
  { "skipTlsVerification": false }
  ```

#### **blockAds** (boolean)

- **Default**: `true`
- **Description**: Enable ad-blocking and cookie popup blocking
- **Recommendation**: Keep enabled for cleaner content extraction
- **Example**:
  ```json
  { "blockAds": true }
  ```

#### **zeroDataRetention** (boolean)

- **Default**: `false`
- **Description**: Enable zero data retention policy (requires contacting support)
- **Use Case**: For sensitive data compliance requirements
- **Example**:
  ```json
  { "zeroDataRetention": true }
  ```

---

## Actions (Browser Automation)

The `actions` parameter enables a sequence of browser interactions before scraping. This is essential for dynamic sites requiring user interaction.

### Action Types

#### 1. **wait**

- **Description**: Pause execution for content loading
- **Parameters**:
  - `milliseconds` (integer): Duration to wait
  - `selector` (string, optional): Wait until selector appears
- **Example**:
  ```json
  {
    "actions": [
      { "type": "wait", "milliseconds": 2000 },
      { "type": "wait", "selector": "#content-loaded" }
    ]
  }
  ```

#### 2. **click**

- **Description**: Click element(s) by CSS selector
- **Parameters**:
  - `selector` (string): CSS selector for element to click
- **Example**:
  ```json
  {
    "actions": [{ "type": "click", "selector": ".accept-cookies" }]
  }
  ```

#### 3. **write**

- **Description**: Type text into input/textarea/contenteditable elements
- **Parameters**:
  - `selector` (string): CSS selector for input element
  - `text` (string): Text to type
- **Example**:
  ```json
  {
    "actions": [{ "type": "write", "selector": "#search-box", "text": "firecrawl" }]
  }
  ```

#### 4. **press**

- **Description**: Press keyboard key
- **Parameters**:
  - `key` (string): Key name (e.g., "Enter", "Escape", "ArrowDown")
- **Example**:
  ```json
  {
    "actions": [{ "type": "press", "key": "Enter" }]
  }
  ```

#### 5. **scroll**

- **Description**: Scroll page or element
- **Parameters**:
  - `direction` (string): "up" or "down"
  - `selector` (string, optional): Element to scroll (defaults to page)
- **Example**:
  ```json
  {
    "actions": [{ "type": "scroll", "direction": "down" }]
  }
  ```

#### 6. **screenshot**

- **Description**: Capture page state during workflow
- **Parameters**: Same as screenshot format
- **Output Key**: `data.actions.screenshots`
- **Example**:
  ```json
  {
    "actions": [{ "type": "screenshot", "fullPage": true }]
  }
  ```

#### 7. **scrape**

- **Description**: Extract current page content during action sequence
- **Output Key**: `data.actions.scrapes`
- **Example**:
  ```json
  {
    "actions": [{ "type": "scrape" }]
  }
  ```

#### 8. **executeJavascript**

- **Description**: Run custom JavaScript code in browser context
- **Parameters**:
  - `script` (string): JavaScript code to execute
- **Output Key**: `data.actions.javascriptReturns`
- **Example**:
  ```json
  {
    "actions": [
      {
        "type": "executeJavascript",
        "script": "return document.title;"
      }
    ]
  }
  ```

#### 9. **pdf**

- **Description**: Generate PDF of page
- **Parameters**:
  - `format` (string): Page size - A0, A1, A2, A3, A4, A5, A6, Letter, Legal, Tabloid, Ledger
  - `landscape` (boolean): Page orientation
- **Output Key**: `data.actions.pdfs`
- **Example**:
  ```json
  {
    "actions": [
      {
        "type": "pdf",
        "format": "A4",
        "landscape": false
      }
    ]
  }
  ```

### Complex Action Sequence Example

```json
{
  "url": "https://google.com",
  "formats": ["markdown", "screenshot"],
  "actions": [
    { "type": "wait", "milliseconds": 1000 },
    { "type": "write", "selector": "input[name='q']", "text": "firecrawl" },
    { "type": "press", "key": "Enter" },
    { "type": "wait", "milliseconds": 2000 },
    { "type": "click", "selector": ".g:first-child a" },
    { "type": "wait", "milliseconds": 3000 },
    { "type": "screenshot", "fullPage": true }
  ]
}
```

---

## Advanced Features

### Batch Scraping

**Endpoint**: `/v2/batch/scrape`

- **Description**: Process multiple URLs simultaneously
- **Response**: Returns job ID for polling
- **Status Check**: `/v2/batch/scrape/{id}`
- **Expiration**: Jobs expire after 24 hours
- **Example**:
  ```bash
  curl -X POST https://api.firecrawl.dev/v2/batch/scrape \
    -H "Authorization: Bearer YOUR_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{
      "urls": [
        "https://example.com/page1",
        "https://example.com/page2"
      ],
      "formats": ["markdown"]
    }'
  ```

### Change Tracking Best Practices

1. **Consistency Required**: Use identical URLs, includePaths, excludePaths, includeTags, excludeTags, and onlyMainContent settings across scrapes
2. **Tag Separation**: Use different tags for prod/staging/dev environments
3. **Comparison Scope**: Comparisons are team-scoped; first scrape always shows "new"
4. **Markdown Required**: Always include markdown format with changeTracking
5. **Resilience**: Algorithm ignores whitespace, content order variations, and iframe URLs

---

## Best Practices & Recommendations

### Content Extraction

1. **Use onlyMainContent**: Keep `true` (default) to extract clean content without navigation/footers
2. **Smart Tag Filtering**: Combine `includeTags` and `excludeTags` for precision
3. **Remove Base64 Images**: Keep `true` (default) to reduce payload size

### Performance Optimization

1. **Leverage Caching**: Use default 2-day cache for static content
2. **Force Fresh Scrapes**: Set `maxAge: 0` only when necessary
3. **Optimize Timeouts**: Set reasonable timeout values (30-60 seconds)
4. **Use Auto Proxy**: Set `proxy: "auto"` for automatic fallback

### Dynamic Content

1. **Always Use Wait**: Add `waitFor` delay for JavaScript-heavy sites
2. **Action Sequences**: Use actions for sites requiring interaction
3. **Wait After Actions**: Add wait actions after click/write operations
4. **Selector Waits**: Use `wait` with `selector` for specific elements

### Anti-Bot Handling

1. **Stealth Proxies**: Use for sophisticated anti-bot systems
2. **Mobile Emulation**: Try mobile mode if desktop scraping fails
3. **Location Targeting**: Use appropriate country codes for geo-restricted content
4. **Custom Headers**: Add realistic user agents and accept headers

### LLM Extraction

1. **Schema Preference**: Use schemas for consistent, validated output
2. **Prompt Alternative**: Use prompts when output structure is flexible
3. **Combine Both**: Use schema + prompt for guided extraction
4. **Test Prompts**: Iterate on prompt wording for better results

### Cost Management

1. **Cache Effectively**: Longer cache periods reduce API calls
2. **PDF Pagination**: Set `maxPages` to limit PDF parsing costs
3. **Basic Proxies**: Use basic proxies first; only use stealth when necessary
4. **Batch Operations**: Use batch endpoint for multiple URLs

---

## Default Values Reference

| Parameter             | Default Value       | Unit                  |
| --------------------- | ------------------- | --------------------- |
| `formats`             | `["markdown"]`      | array                 |
| `onlyMainContent`     | `true`              | boolean               |
| `removeBase64Images`  | `true`              | boolean               |
| `maxAge`              | `172800000`         | milliseconds (2 days) |
| `storeInCache`        | `true`              | boolean               |
| `waitFor`             | `0`                 | milliseconds          |
| `timeout`             | `30000`             | milliseconds          |
| `skipTlsVerification` | `true`              | boolean               |
| `mobile`              | `false`             | boolean               |
| `blockAds`            | `true`              | boolean               |
| `proxy`               | `"auto"`            | string                |
| `location.country`    | `"US"`              | ISO code              |
| `parsers`             | `[{"type": "pdf"}]` | array                 |
| `zeroDataRetention`   | `false`             | boolean               |

---

## Example Configurations

### Basic Scrape (Clean Markdown)

```json
{
  "url": "https://example.com",
  "formats": ["markdown"]
}
```

### Full Content Extraction

```json
{
  "url": "https://example.com/article",
  "formats": ["markdown", "links", "images"],
  "onlyMainContent": true,
  "includeTags": ["article", ".main-content", "h1", "h2", "p"],
  "excludeTags": ["nav", "footer", "#ads", ".sidebar"],
  "waitFor": 2000
}
```

### Structured Data Extraction

```json
{
  "url": "https://example.com/product",
  "formats": [
    "markdown",
    {
      "type": "json",
      "schema": {
        "type": "object",
        "properties": {
          "productName": { "type": "string" },
          "price": { "type": "number" },
          "currency": { "type": "string" },
          "inStock": { "type": "boolean" },
          "rating": { "type": "number" },
          "reviewCount": { "type": "integer" }
        },
        "required": ["productName", "price"]
      },
      "prompt": "Extract product information including name, price, availability, and ratings"
    }
  ],
  "onlyMainContent": true
}
```

### Complex Interaction Workflow

```json
{
  "url": "https://example.com/search",
  "formats": ["markdown", "screenshot"],
  "actions": [
    { "type": "wait", "milliseconds": 1000 },
    { "type": "click", "selector": ".cookie-accept" },
    { "type": "wait", "milliseconds": 500 },
    { "type": "write", "selector": "#search-input", "text": "laptop" },
    { "type": "press", "key": "Enter" },
    { "type": "wait", "milliseconds": 3000 },
    { "type": "scroll", "direction": "down" },
    { "type": "wait", "milliseconds": 1000 },
    { "type": "screenshot", "fullPage": true }
  ],
  "timeout": 60000
}
```

### Mobile Scraping with Location

```json
{
  "url": "https://example.com",
  "formats": ["markdown"],
  "mobile": true,
  "location": {
    "country": "GB",
    "languages": ["en-GB", "en"]
  },
  "waitFor": 2000
}
```

### Anti-Bot with Stealth Proxy

```json
{
  "url": "https://protected-site.com",
  "formats": ["markdown"],
  "proxy": "stealth",
  "headers": {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9"
  },
  "waitFor": 3000,
  "timeout": 45000
}
```

### Change Tracking (Price Monitoring)

```json
{
  "url": "https://example.com/product/123",
  "formats": [
    "markdown",
    {
      "type": "changeTracking",
      "modes": ["json"],
      "schema": {
        "type": "object",
        "properties": {
          "price": { "type": "number" },
          "inStock": { "type": "boolean" }
        }
      },
      "tag": "production"
    }
  ],
  "onlyMainContent": true,
  "maxAge": 0
}
```

### PDF Parsing with Limit

```json
{
  "url": "https://example.com/document.pdf",
  "formats": ["markdown"],
  "parsers": [
    {
      "type": "pdf",
      "maxPages": 50
    }
  ]
}
```

### Screenshot with Custom Viewport

```json
{
  "url": "https://example.com",
  "formats": [
    {
      "type": "screenshot",
      "fullPage": false,
      "quality": 95,
      "viewport": {
        "width": 1920,
        "height": 1080
      }
    }
  ]
}
```

---

## API Response Structure

### Success Response (200)

```json
{
  "success": true,
  "data": {
    "markdown": "# Page content...",
    "html": "<html>...</html>",
    "rawHtml": "<html>...</html>",
    "links": ["https://..."],
    "images": ["https://..."],
    "screenshot": "data:image/png;base64,...",
    "json": { "extractedData": "..." },
    "summary": "Brief page summary...",
    "branding": {
      "colors": { "primary": "#..." },
      "typography": {...},
      "fonts": [...]
    },
    "changeTracking": {
      "status": "changed",
      "visibility": "visible",
      "git-diff": "...",
      "json": {
        "price": {
          "previous": 99.99,
          "current": 89.99
        }
      }
    },
    "metadata": {
      "title": "Page Title",
      "description": "Meta description",
      "language": "en",
      "keywords": ["key1", "key2"],
      "sourceURL": "https://example.com",
      "statusCode": 200
    },
    "actions": {
      "screenshots": [],
      "scrapes": [],
      "javascriptReturns": [],
      "pdfs": []
    },
    "warning": "Optional LLM extraction warning"
  }
}
```

### Error Responses

- **402 Payment Required**: Insufficient credits
- **429 Too Many Requests**: Rate limit exceeded
- **500 Internal Server Error**: Server error with code and description

---

## Migration Notes (v1 to v2)

### New Features

- Caching enabled by default (2-day maxAge)
- "summary" format for concise content
- Enhanced screenshot options with object format
- JSON extraction replaces "extract" format

### Deprecated

- `parsePDF` parameter (use `parsers: [{"type": "pdf"}]`)
- "extract" format (renamed to "json")

### Method Renames

- `scrapeUrl()` → `scrape()`
- `asyncCrawlUrl()` → `startCrawl()`
- `checkCrawlStatus()` → `getCrawlStatus()`

---

## Sources & Documentation

- **Official API Reference**: https://docs.firecrawl.dev/api-reference/endpoint/scrape
- **Advanced Scraping Guide**: https://docs.firecrawl.dev/advanced-scraping-guide
- **Features Documentation**: https://docs.firecrawl.dev/features/scrape
- **Migration Guide**: https://docs.firecrawl.dev/migrate-to-v2
- **Proxies Documentation**: https://docs.firecrawl.dev/features/proxies
- **Change Tracking**: https://docs.firecrawl.dev/features/change-tracking
- **JSON Extraction**: https://docs.firecrawl.dev/features/llm-extract

---

**Report Generated**: 2025-11-06
**Research Conducted By**: Claude Code
**API Version**: Firecrawl v2
