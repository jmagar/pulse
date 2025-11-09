# Firecrawl CRAWL Endpoint - Comprehensive API Research

**Date**: 2025-11-07
**Research Scope**: Firecrawl v2 CRAWL endpoint (`/v2/crawl`)
**Sources**: Official documentation, GitHub repository, blog posts
**Status**: Complete research with recommendations

---

## Executive Summary

The Firecrawl CRAWL endpoint is significantly more feature-rich than currently exposed in pulse-crawl. Our implementation captures ~40% of available parameters, missing several important categories:

- **Advanced scraping controls** (13 parameters)
- **Page interaction capabilities** (actions array)
- **Location/localization options** (country, languages)
- **Webhook notifications** (4 parameters)
- **Response handling** (zero data retention)
- **Natural language prompts** (new v2 feature)

**Recommendation**: Phased implementation prioritizing high-impact features first (see Priority Tiers below).

---

## Complete Firecrawl CRAWL API Reference

### 1. Core URL Management Parameters

| Parameter | Type         | Default  | Currently Exposed | Description                                                |
| --------- | ------------ | -------- | ----------------- | ---------------------------------------------------------- |
| `url`     | string (URI) | Required | ✅ Yes            | Base URL to start crawling from                            |
| `prompt`  | string       | Optional | ❌ No             | Natural language description of what to crawl (v2 feature) |

**Details**:

- `prompt` is new in Firecrawl v2 and generates optimal parameters automatically
- Example: `"Extract API documentation and reference guides"` → auto-generates `includePaths`, `maxDepth`, `crawlEntireDomain`
- Explicitly set parameters override prompt-generated values
- Can preview what parameters a prompt generates via `/crawl/params-preview` endpoint

---

### 2. Crawl Scope & Depth Parameters

| Parameter            | Type    | Default  | Currently Exposed             | Description                        |
| -------------------- | ------- | -------- | ----------------------------- | ---------------------------------- |
| `limit`              | integer | 10,000   | ✅ Yes (default: 100)         | Maximum pages to crawl             |
| `maxDiscoveryDepth`  | integer | Optional | ❌ No (exposed as `maxDepth`) | Max depth based on discovery order |
| `crawlEntireDomain`  | boolean | false    | ✅ Yes                        | Allow crawling sibling/parent URLs |
| `allowSubdomains`    | boolean | false    | ✅ Yes                        | Allow following subdomain links    |
| `allowExternalLinks` | boolean | false    | ✅ Yes                        | Allow following external websites  |

**Key Insights**:

- `maxDiscoveryDepth` is the correct parameter name (v2); our schema uses `maxDepth` which maps to this
- Root site + sitemapped pages = discovery depth 0
- When `sitemap: skip` and no `crawlEntireDomain`, only follows child URLs
- Pagination pages (page 2, 3, etc.) don't count as additional depth levels

---

### 3. URL Pattern Filtering Parameters

| Parameter               | Type     | Default  | Currently Exposed | Description                                           |
| ----------------------- | -------- | -------- | ----------------- | ----------------------------------------------------- |
| `includePaths`          | string[] | Optional | ✅ Yes            | Regex patterns for URLs to include only               |
| `excludePaths`          | string[] | Optional | ✅ Yes            | Regex patterns for URLs to exclude                    |
| `ignoreQueryParameters` | boolean  | true     | ✅ Yes            | Don't re-scrape same path with different query params |

**Details**:

- `includePaths` and `excludePaths` use URL pathname regex (not full URL)
- Example: `includePaths: ["blog/.*"]` matches `firecrawl.dev/blog/*` but not other paths
- These can be generated automatically from natural language prompts

---

### 4. Sitemap Handling Parameters

| Parameter | Type | Default   | Currently Exposed | Description                      |
| --------- | ---- | --------- | ----------------- | -------------------------------- |
| `sitemap` | enum | "include" | ✅ Yes            | Options: `"include"` or `"skip"` |

**Details**:

- **v2 improvement** over v1 (which was boolean)
- `"include"` (default): Uses sitemap AND discovers other pages
- `"skip"`: Ignores sitemap entirely, only crawls discovered links
- Sitemap pages start at discovery depth 0

---

### 5. Rate Limiting & Performance Parameters

| Parameter        | Type    | Default  | Currently Exposed | Description                                             |
| ---------------- | ------- | -------- | ----------------- | ------------------------------------------------------- |
| `delay`          | number  | Optional | ✅ Yes            | Delay in seconds between scrapes (respects rate limits) |
| `maxConcurrency` | integer | Optional | ✅ Yes            | Max concurrent scrapes for this crawl                   |

**Details**:

- `delay`: Useful for respecting website rate limits (e.g., 0.5 seconds between requests)
- `maxConcurrency`: Overrides team-level limits if set
- Best practices: Use together for large websites to avoid blocking

---

### 6. Scrape Options: Format Controls

| Parameter               | Type     | Default      | Currently Exposed | Description                     |
| ----------------------- | -------- | ------------ | ----------------- | ------------------------------- |
| `scrapeOptions.formats` | string[] | ["markdown"] | ✅ Yes (limited)  | Output formats for page content |

**Available Formats** (9 options):

- ✅ `"markdown"` (default) - Cleaned markdown content
- ✅ `"html"` - Full page HTML
- ✅ `"rawHtml"` - Complete page source (use sparingly)
- ✅ `"links"` - All URLs found on page
- ✅ `"screenshot"` - Browser-rendered PNG screenshot
- ❌ `"summary"` - AI-generated page summary
- ❌ `"images"` - Extract image URLs and metadata
- ❌ `"json"` - Structured data (requires schema)
- ❌ `"changeTracking"` - Monitor changes over time

**Currently Exposed**: Only basic 4 formats documented; missing summary, images, json, changeTracking

---

### 7. Scrape Options: Content Filtering

| Parameter                       | Type     | Default  | Currently Exposed | Description                              |
| ------------------------------- | -------- | -------- | ----------------- | ---------------------------------------- |
| `scrapeOptions.onlyMainContent` | boolean  | true     | ✅ Yes            | Exclude headers, navs, footers, sidebars |
| `scrapeOptions.includeTags`     | string[] | Optional | ✅ Yes            | Tags/classes/IDs to whitelist            |
| `scrapeOptions.excludeTags`     | string[] | Optional | ✅ Yes            | Tags/classes/IDs to blacklist            |

**Details**:

- `onlyMainContent: true` uses dom-to-semantic-markdown for intelligent extraction
- `includeTags`: Example `["code", "#page-header"]` (supports classes/IDs)
- `excludeTags`: Example `["h1", "h2", ".main-content"]`
- These are applied before format conversion

---

### 8. Scrape Options: Browser & Content Loading

| Parameter               | Type         | Default  | Currently Exposed | Description                                   |
| ----------------------- | ------------ | -------- | ----------------- | --------------------------------------------- |
| `scrapeOptions.waitFor` | integer (ms) | 0        | ❌ No             | Delay in milliseconds before scraping content |
| `scrapeOptions.timeout` | integer (ms) | Optional | ❌ No             | Request timeout in milliseconds               |
| `scrapeOptions.mobile`  | boolean      | false    | ❌ No             | Emulate mobile device for responsive content  |

**Details**:

- `waitFor`: For JavaScript-heavy pages, iframes, heavy media loading
- `timeout`: Prevents hanging on slow sites (e.g., `timeout: 10000` = 10 seconds)
- `mobile`: Useful when pages render differently on mobile (responsive design)
- These apply to ALL pages in the crawl

---

### 9. Scrape Options: Request & Security Controls

| Parameter                           | Type    | Default  | Currently Exposed | Description                                        |
| ----------------------------------- | ------- | -------- | ----------------- | -------------------------------------------------- |
| `scrapeOptions.headers`             | object  | Optional | ❌ No             | Custom request headers (cookies, user-agent, etc.) |
| `scrapeOptions.skipTlsVerification` | boolean | true     | ❌ No             | Skip TLS certificate verification                  |
| `scrapeOptions.proxy`               | enum    | "auto"   | ❌ No             | Proxy type: `"basic"`, `"stealth"`, `"auto"`       |

**Details**:

- `headers`: For authentication, custom user-agents, referrers
- `skipTlsVerification`: Useful for self-signed certs in testing
- `proxy`: Auto-selects best strategy; stealth mode for anti-bot
- All inherited by all pages in crawl

---

### 10. Scrape Options: Content Processing

| Parameter                          | Type     | Default | Currently Exposed | Description                                |
| ---------------------------------- | -------- | ------- | ----------------- | ------------------------------------------ |
| `scrapeOptions.blockAds`           | boolean  | true    | ❌ No             | Block ads and cookie popups                |
| `scrapeOptions.removeBase64Images` | boolean  | true    | ❌ No             | Remove base64-encoded images from output   |
| `scrapeOptions.storeInCache`       | boolean  | true    | ❌ No             | Store pages in Firecrawl index/cache       |
| `scrapeOptions.parsers`            | string[] | ["pdf"] | ❌ No             | File parsers: `"pdf"` extracts to markdown |

**Details**:

- `blockAds`: Improves content quality and reduces output size
- `removeBase64Images`: Significantly reduces payload for image-heavy pages
- `storeInCache`: Disable for sensitive data (enterprise feature)
- `parsers`: Currently only `"pdf"` is available; extracts PDF content to markdown

---

### 11. Scrape Options: Location & Localization

| Parameter                          | Type         | Default           | Currently Exposed | Description                                      |
| ---------------------------------- | ------------ | ----------------- | ----------------- | ------------------------------------------------ |
| `scrapeOptions.location.country`   | string       | "US"              | ❌ No             | ISO 3166-1 alpha-2 country code                  |
| `scrapeOptions.location.languages` | string[]     | Optional          | ❌ No             | Preferred languages (e.g., `["en-US", "fr-FR"]`) |
| `scrapeOptions.maxAge`             | integer (ms) | 172,800,000 (48h) | ❌ No             | Cache max age before re-scrape                   |

**Details**:

- `country`: Changes region-specific content, pricing, availability
- `languages`: Helps sites serve translated content (must match Accept-Language header format)
- `maxAge`: Prevents re-scraping cached pages (172.8M ms = 48 hours by default)

---

### 12. Scrape Options: Page Actions (Cloud-only)

| Parameter               | Type  | Default  | Currently Exposed | Description                                              |
| ----------------------- | ----- | -------- | ----------------- | -------------------------------------------------------- |
| `scrapeOptions.actions` | array | Optional | ❌ No             | Pre-scrape page interactions (click, scroll, wait, etc.) |

**Supported Actions** (9 types):

```json
{
  "type": "wait",
  "milliseconds": 2000
}
```

Wait for specified time before next action.

```json
{
  "type": "click",
  "selector": "button.load-more"
}
```

Click element matching CSS selector. Chain multiple clicks for pagination.

```json
{
  "type": "scroll",
  "direction": "down",
  "amount": 3
}
```

Scroll page. Example: Scroll through lazy-loaded content before scraping.

```json
{
  "type": "write",
  "text": "search query"
}
```

Type text into focused input. Use with click action to target fields.

```json
{
  "type": "press",
  "key": "ENTER"
}
```

Press keyboard key. Common uses: ENTER for search, TAB for navigation.

```json
{
  "type": "screenshot"
}
```

Take browser screenshot. Returns temporary URL (24h expiry).

```json
{
  "type": "executeJavascript",
  "code": "return document.title"
}
```

Execute arbitrary JavaScript. Useful for extracting dynamic data.

```json
{
  "type": "pdf"
}
```

Generate PDF of current page state.

**Example Use Case**:

```json
[
  { "type": "wait", "milliseconds": 2000 },
  { "type": "click", "selector": "textarea[title='Search']" },
  { "type": "write", "text": "firecrawl" },
  { "type": "press", "key": "ENTER" },
  { "type": "wait", "milliseconds": 3000 },
  { "type": "screenshot" }
]
```

**Important**: Actions are applied BEFORE content scraping on each page.

---

### 13. Webhook Notification Parameters

| Parameter          | Type         | Default  | Currently Exposed | Description                                                   |
| ------------------ | ------------ | -------- | ----------------- | ------------------------------------------------------------- |
| `webhook.url`      | string (URI) | Required | ❌ No             | Webhook endpoint for crawl events                             |
| `webhook.headers`  | object       | Optional | ❌ No             | Custom headers for webhook requests                           |
| `webhook.metadata` | object       | Optional | ❌ No             | Custom data included in all webhook payloads                  |
| `webhook.events`   | string[]     | (all)    | ❌ No             | Event types: `"started"`, `"page"`, `"completed"`, `"failed"` |

**Details**:

- Webhooks trigger on specified events (default: all)
- `"started"`: Crawl job initiated
- `"page"`: New page completed (streaming updates)
- `"completed"`: All pages finished
- `"failed"`: Job failed
- Useful for long-running crawls to avoid polling

---

### 14. Response & Data Retention

| Parameter           | Type    | Default | Currently Exposed | Description                           |
| ------------------- | ------- | ------- | ----------------- | ------------------------------------- |
| `zeroDataRetention` | boolean | false   | ❌ No             | Don't store data on Firecrawl servers |

**Details**:

- Enterprise-only feature (requires contacting support)
- Useful for HIPAA, PCI-DSS, or other compliance requirements
- Data never persisted to Firecrawl infrastructure
- Still returns data in response; just not stored

---

### 15. Response Format (Pagination)

New in v2: Response includes pagination support

| Field     | Type    | Description                  |
| --------- | ------- | ---------------------------- |
| `success` | boolean | Whether request succeeded    |
| `id`      | string  | Crawl job ID                 |
| `url`     | string  | Status check URL             |
| `data`    | array   | Page data (paginated)        |
| `next`    | string  | URL for next page of results |

**Pagination Details**:

- Large crawls may be paginated across multiple API calls
- Use `next` field to fetch additional pages
- Each page contains up to 500 results
- Continue fetching until `next` is absent

---

## Gap Analysis: Current vs Available Parameters

### Implemented (11 parameters)

✅ Core: `url`
✅ Scope: `limit`, `crawlEntireDomain`, `allowSubdomains`, `allowExternalLinks`
✅ Filtering: `includePaths`, `excludePaths`, `ignoreQueryParameters`
✅ Sitemap: `sitemap`
✅ Performance: `delay`, `maxConcurrency`
✅ Scrape: `scrapeOptions.formats` (basic), `scrapeOptions.onlyMainContent`, `scrapeOptions.includeTags`, `scrapeOptions.excludeTags`

### Missing: Critical High-Impact (6 parameters)

❌ **Natural Language Prompts**: `prompt` (v2 feature, generates optimal parameters)
❌ **Browser Loading**: `scrapeOptions.waitFor`, `scrapeOptions.timeout` (for JS-heavy sites)
❌ **Page Actions**: `scrapeOptions.actions` (click, scroll, interact with dynamic content)
❌ **Advanced Content Filtering**: `scrapeOptions.blockAds`, `scrapeOptions.removeBase64Images`
❌ **Request Security**: `scrapeOptions.headers` (auth, custom UA)
❌ **Response Handling**: Pagination support (`.next` field)

### Missing: Important Mid-Tier (8 parameters)

❌ **Location/Localization**: `scrapeOptions.location.country`, `scrapeOptions.location.languages`, `scrapeOptions.maxAge`
❌ **Content Processing**: `scrapeOptions.parsers` (PDF extraction)
❌ **Advanced Security**: `scrapeOptions.skipTlsVerification`, `scrapeOptions.proxy` (anti-bot)
❌ **Cache Control**: `scrapeOptions.storeInCache`
❌ **Mobile Emulation**: `scrapeOptions.mobile`

### Missing: Enterprise/Specialized (5 parameters)

❌ **Webhooks**: `webhook.*` (notifications for long-running crawls)
❌ **Data Retention**: `zeroDataRetention` (compliance feature)
❌ **Format Options**: `"summary"`, `"images"`, `"json"`, `"changeTracking"` formats

---

## Recommended Implementation Plan

### Phase 1: High-Value Core Features (Priority 1)

**Impact**: 80% of use cases covered
**Effort**: Medium
**Timeline**: 1-2 sprints

1. **Natural Language Prompts** (`prompt` parameter)
   - Allows users to describe what to crawl in English
   - Firecrawl auto-generates optimal parameters
   - Dramatically improves UX
   - Add `/crawl/params-preview` endpoint support to let users preview generated params

2. **Page Interaction Actions** (`scrapeOptions.actions`)
   - Unlock crawling of dynamic/interactive sites
   - Support click, scroll, wait, write, press, screenshot actions
   - Enables: pagination, form submission, lazy-loaded content
   - Impacts: e-commerce, SPA, gated content

3. **Browser Loading Controls** (`scrapeOptions.waitFor`, `scrapeOptions.timeout`)
   - Essential for JavaScript-heavy sites
   - Prevents timing-related failures
   - Low implementation complexity

4. **Response Pagination** (`.next` field support)
   - Large crawls return paginated results
   - Need to expose pagination in tool output
   - Add helper to fetch all pages automatically if requested

### Phase 2: Content Quality Features (Priority 2)

**Impact**: 60% improvement in content quality
**Effort**: Low
**Timeline**: 1 sprint

5. **Content Processing**
   - `scrapeOptions.blockAds` (default: true) - reduces noise
   - `scrapeOptions.removeBase64Images` (default: true) - reduces payload
   - `scrapeOptions.parsers: ["pdf"]` - extract PDFs to markdown

6. **Request Headers** (`scrapeOptions.headers`)
   - Support custom headers for auth, UA, referrers
   - Useful for authenticated scraping
   - Enable cookie-based auth crawling

7. **Proxy & Anti-Bot** (`scrapeOptions.proxy`)
   - `"auto"`, `"basic"`, `"stealth"` options
   - Helps bypass anti-bot mechanisms
   - Recommend stealth for aggressive sites

### Phase 3: Advanced Features (Priority 3)

**Impact**: 20% for specialized use cases
**Effort**: Low-Medium
**Timeline**: 1 sprint

8. **Location & Localization**
   - `scrapeOptions.location.country` (ISO codes)
   - `scrapeOptions.location.languages` (Accept-Language)
   - `scrapeOptions.maxAge` (cache control)
   - Useful for region-specific content, multi-language sites

9. **Webhook Notifications** (`webhook.*`)
   - Alternative to polling for status
   - Useful for long-running crawls
   - Reduce API calls via streaming updates

10. **Enterprise Features**
    - `zeroDataRetention` (pass-through to Firecrawl)
    - `scrapeOptions.storeInCache` (for sensitive data)
    - `scrapeOptions.skipTlsVerification` (testing)
    - `scrapeOptions.mobile` (responsive design testing)

11. **Advanced Format Options**
    - `"summary"` - AI page summary
    - `"images"` - image extraction
    - `"json"` - structured data with schema
    - `"changeTracking"` - monitor changes

---

## Implementation Strategy

### Schema Changes

**Current approach** (good):

- Flattened schema with optional fields
- `.refine()` for mutual exclusivity validation
- Avoids Anthropic API union type limitations

**Recommended additions**:

```typescript
// Phase 1
prompt?: string;  // Natural language crawl description

// Phase 1 - Actions
scrapeOptions?: {
  actions?: Array<{
    type: 'wait' | 'click' | 'scroll' | 'write' | 'press' | 'screenshot' | 'executeJavascript' | 'pdf';
    // Action-specific properties (milliseconds, selector, direction, etc.)
  }>;
  waitFor?: number;  // milliseconds
  timeout?: number;  // milliseconds

  // Phase 2
  headers?: Record<string, string>;
  blockAds?: boolean;
  removeBase64Images?: boolean;
  parsers?: string[];
  proxy?: 'auto' | 'basic' | 'stealth';

  // Phase 3
  location?: {
    country?: string;
    languages?: string[];
  };
  maxAge?: number;
  storeInCache?: boolean;
  skipTlsVerification?: boolean;
  mobile?: boolean;
};

// Phase 3
webhook?: {
  url: string;
  headers?: Record<string, string>;
  metadata?: Record<string, unknown>;
  events?: ('started' | 'page' | 'completed' | 'failed')[];
};
```

### Client Changes

**FirecrawlCrawlClient** needs minimal changes:

- Already passes all parameters to Firecrawl
- No client-side validation needed (Firecrawl validates)
- Just ensure new parameters are included in request body

### Response Handling

**Current limitation**: No pagination support
**Required changes**:

- Expose `.next` field in tool response
- Add optional `fetchAll: boolean` parameter to automatically paginate
- Return metadata showing pagination status

### Documentation

- Update tool description with new capabilities
- Add examples for each major feature
- Document parameter interactions and best practices
- Link to Firecrawl v2 API docs

---

## Best Practices from Firecrawl Documentation

### Crawl Depth Strategy

- Root + sitemap pages = discovery depth 0
- Each link hop = +1 depth
- `maxDiscoveryDepth: 2` for focused crawls, `3+` for comprehensive
- Pagination doesn't count toward depth

### URL Filtering

- Use `includePaths` for positive patterns (what to crawl)
- Use `excludePaths` for negative patterns (what to skip)
- Both accept regex: `/payments/.*` matches `/payments/` and subpaths
- Combine with `crawlEntireDomain` to control scope

### Content Quality

- Enable `onlyMainContent: true` (default) to exclude boilerplate
- Use `blockAds: true` (default) to reduce noise
- Set `timeout: 10000` for slow sites (prevents hanging)
- Chain actions with `wait` for dynamic content

### Performance

- `limit: 100` for testing, `limit: 10000` (default) for production
- `maxConcurrency` should match site rate limits (e.g., 2-5 for most sites)
- `delay: 0.5-1` for rate-limit-sensitive sites
- Webhook callbacks beat polling for status

### Anti-Bot & Reliability

- `proxy: "stealth"` for sites with aggressive blocking
- Custom `headers` for auth-required pages
- `waitFor: 2000-5000` for JS-heavy sites
- `scrapeOptions.mobile: true` for responsive-only content

---

## Testing Considerations

### Test Coverage Needed

1. **Natural Language Prompt Generation**
   - Verify `/crawl/params-preview` endpoint
   - Test various English descriptions
   - Ensure explicit parameters override generated ones

2. **Page Actions**
   - Click actions (selectors, visibility)
   - Scroll behavior (direction, amount)
   - Input/keystroke sequences
   - Screenshot capture
   - JavaScript execution

3. **Pagination**
   - Large crawls with `.next` pagination
   - Verify data continuity across pages
   - Test automatic vs manual pagination

4. **Content Filtering**
   - `blockAds` effectiveness
   - `removeBase64Images` payload reduction
   - `includeTags` / `excludeTags` accuracy

5. **Browser Controls**
   - `waitFor` impact on JS-heavy sites
   - `timeout` handling on slow servers
   - `mobile` viewport behavior

6. **Security & Headers**
   - Custom headers propagation
   - Cookie-based auth flows
   - TLS verification skip

7. \*\*Location Emupulse-crawl
   - Country code validation
   - Language preference effects
   - Cache age behavior

---

## Firecrawl v2 Advantages

### Natural Language API (v2 Exclusive)

- Users can describe crawl in English
- No need to understand technical parameters
- Significantly improves UX and adoption
- Reduces parameter misconfiguration

### Improved Sitemap Control

- v1: boolean sitemap flag
- v2: `"include"` (use + discover), `"skip"` (ignore)
- More control and clarity

### Params Preview Endpoint

- `/crawl/params-preview` shows what parameters prompt generates
- Users can refine prompt before committing to full crawl
- Reduces failed or suboptimal crawls

### Better Pagination

- Response `.next` field for large crawl results
- More reliable than scroll/offset patterns
- Supports efficient streaming

---

## Comparison to pulse-fetch MAP Tool

The CRAWL tool and MAP tool have complementary strengths:

| Feature       | CRAWL                              | MAP                          |
| ------------- | ---------------------------------- | ---------------------------- |
| **Discovery** | Follow links during scrape         | Fast URL mapping             |
| **Content**   | Full page content                  | URLs only                    |
| **Depth**     | Configurable (`maxDiscoveryDepth`) | Single-level or sitemap      |
| **Speed**     | Slower (scrapes each page)         | 8x faster than crawl         |
| **Use Case**  | Content extraction, RAG            | Site structure understanding |

**Best Practice**: Use MAP first to understand site structure, then CRAWL targeted sections.

---

## Summary: What We're Missing

**Quick Reference**:

| Category        | Missing                             | Impact                  | Priority |
| --------------- | ----------------------------------- | ----------------------- | -------- |
| UX              | Natural language prompts            | Ease of use             | 1        |
| Dynamic Content | Page actions (click, scroll, wait)  | Critical for modern web | 1        |
| Reliability     | Browser controls (waitFor, timeout) | Prevents failures       | 1        |
| Pagination      | Response `.next` field handling     | Large crawls            | 1        |
| Quality         | Ad blocking, image removal          | Content cleanliness     | 2        |
| Auth            | Custom request headers              | Authenticated sites     | 2        |
| Anti-Bot        | Proxy types, stealth mode           | Bypass blocking         | 2        |
| Advanced        | Webhooks, actions, formats          | Specialized use cases   | 3        |
| Enterprise      | Zero data retention                 | Compliance              | 3        |

---

## References

1. **Official Firecrawl Documentation**: https://docs.firecrawl.dev/api-reference/endpoint/crawl-post
2. **Firecrawl Blog**: https://www.firecrawl.dev/blog/mastering-the-crawl-endpoint-in-firecrawl
3. **GitHub Repository**: https://github.com/firecrawl/firecrawl
4. **v2 Features**: https://docs.firecrawl.dev/api-reference/endpoint/crawl-post#whats-new-in-v2

---

## Next Steps

1. **Review this research** with team
2. **Prioritize features** based on use cases
3. **Create implementation tasks** for Phase 1
4. **Design schema updates** to avoid breaking changes
5. **Build comprehensive tests** before implementation
6. **Update documentation** with examples and best practices
