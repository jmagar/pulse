# Firecrawl CRAWL Endpoint - Research Summary & Recommendations

**Research Date**: 2025-11-07
**Status**: Complete

---

## Overview

pulse currently exposes ~40% of Firecrawl's CRAWL endpoint capabilities. This document summarizes key findings and provides prioritized recommendations for enhancement.

---

## Current Implementation Status

### ✅ Implemented (11 parameters)

- **Core**: `url`
- **Scope**: `limit`, `crawlEntireDomain`, `allowSubdomains`, `allowExternalLinks`
- **Filtering**: `includePaths`, `excludePaths`, `ignoreQueryParameters`
- **Sitemap**: `sitemap` enum
- **Performance**: `delay`, `maxConcurrency`
- **Scrape Options**: `formats`, `onlyMainContent`, `includeTags`, `excludeTags`

---

## Critical Gaps (Must-Have)

### 1. **Natural Language Prompts** ⭐⭐⭐

- **Firecrawl Param**: `prompt: string`
- **Impact**: Dramatically improves UX; users describe crawl in English
- **Example**: `"Crawl API documentation pages, skip blog posts"`
- **How It Works**: Firecrawl auto-generates optimal parameters from prompt
- **Effort**: Low (just add parameter)
- **Benefit**: Game-changer for accessibility

### 2. **Page Interaction Actions** ⭐⭐⭐

- **Firecrawl Param**: `scrapeOptions.actions: array`
- **Impact**: Unlocks dynamic/interactive site crawling (SPAs, pagination, lazy loading)
- **Supported Actions**:
  - `click(selector)` - Click buttons, links
  - `scroll(direction, amount)` - Scroll through content
  - `wait(milliseconds)` - Wait for content load
  - `write(text)` - Type in forms
  - `press(key)` - Press keyboard keys
  - `screenshot()` - Capture rendered page
  - `executeJavascript(code)` - Run arbitrary JS
  - `pdf()` - Generate PDF
- **Example Use**: Click "Load More" button 5 times, then scrape
- **Effort**: Medium (complex schema definition)
- **Benefit**: Essential for modern web

### 3. **Browser Loading Controls** ⭐⭐⭐

- **Firecrawl Params**: `scrapeOptions.waitFor`, `scrapeOptions.timeout`
- **Impact**: Prevents failures on slow/JS-heavy sites
- **Details**:
  - `waitFor: 2000` - Wait 2 seconds for page load
  - `timeout: 10000` - Give up after 10 seconds
- **Effort**: Very Low (just 2 number fields)
- **Benefit**: Critical reliability improvement

### 4. **Pagination Support** ⭐⭐⭐

- **Firecrawl Response**: `.next` field for result pages
- **Impact**: Large crawls need pagination to avoid truncation
- **Current Gap**: Tool doesn't expose pagination mechanism
- **Solution**:
  - Return `.next` field in response
  - Add optional `fetchAll: true` to auto-paginate
- **Effort**: Low (response handling)
- **Benefit**: Handles large-scale crawls

---

## High-Value Additions (Should-Have)

### 5. **Request Headers** (`scrapeOptions.headers`)

- **Purpose**: Custom auth, user-agents, referrers, cookies
- **Use Case**: Scraping authenticated/protected content
- **Effort**: Low
- **Priority**: Medium (2nd phase)

### 6. **Content Filtering**

- **Params**: `scrapeOptions.blockAds`, `scrapeOptions.removeBase64Images`
- **Impact**: Significantly reduces output size and improves quality
- **Defaults**: Both `true` (good)
- **Effort**: Low (already handled server-side)
- **Priority**: Medium (2nd phase)

### 7. **Anti-Bot Proxy** (`scrapeOptions.proxy`)

- **Options**: `"auto"` (default), `"basic"`, `"stealth"`
- **Use Case**: Bypass anti-scraping measures
- **Effort**: Low
- **Priority**: Medium (2nd phase)

### 8. **PDF Extraction** (`scrapeOptions.parsers: ["pdf"]`)

- **Impact**: Automatically extract PDF content to markdown
- **Effort**: Low (Firecrawl handles it)
- **Priority**: Medium (2nd phase)

---

## Advanced Features (Nice-to-Have)

### 9. **Location & Language**

- **Params**: `scrapeOptions.location.country`, `scrapeOptions.location.languages`
- **Use Case**: Region-specific content, multilingual sites
- **Effort**: Low
- **Priority**: Phase 3

### 10. **Webhook Notifications** (`webhook.*`)

- **Purpose**: Real-time updates instead of polling
- **Useful For**: Long-running crawls (1000+ pages)
- **Effort**: Medium (server-side)
- **Priority**: Phase 3

### 11. **Advanced Formats**

- **Missing**: `"summary"`, `"images"`, `"json"`, `"changeTracking"`
- **Effort**: Low (pass-through to Firecrawl)
- **Priority**: Phase 3

### 12. **Enterprise Features**

- **Params**: `zeroDataRetention`, `skipTlsVerification`, `mobile`, `storeInCache`
- **Use Case**: Compliance, testing, responsive design
- **Effort**: Low (mostly documentation)
- **Priority**: Phase 3

---

## Implementation Priority Matrix

### Phase 1: Critical Foundation (1-2 sprints)

Must-have for modern web crawling

1. ✅ Browser controls: `waitFor`, `timeout`
2. ✅ Natural language prompts: `prompt`
3. ✅ Page actions: `scrapeOptions.actions`
4. ✅ Pagination: Handle `.next` field

**Why together**: These 4 features unlock 80% of use cases

### Phase 2: Quality Improvements (1 sprint)

Significantly improve content extraction

5. Custom headers: `scrapeOptions.headers`
6. Content filtering: `blockAds`, `removeBase64Images`
7. Anti-bot proxy: `scrapeOptions.proxy`
8. PDF parsing: `scrapeOptions.parsers`

### Phase 3: Advanced (1 sprint)

Specialized use cases

9. Location control: `location.country`, `location.languages`
10. Webhooks: `webhook.*`
11. Mobile emulation: `scrapeOptions.mobile`
12. Advanced formats: `summary`, `images`, `json`, `changeTracking`

---

## Parameter Additions by Phase

### Phase 1

```typescript
// Schema additions
crawlOptionsSchema.extend({
  // Prompts (v2 feature)
  prompt: z.string().optional(),

  // Updated scrapeOptions
  scrapeOptions: z.object({
    // ... existing ...

    // Browser loading
    waitFor: z.number().int().min(0).optional(),
    timeout: z.number().int().min(0).optional(),

    // Page interactions
    actions: z.array(z.object({
      type: z.enum(['wait', 'click', 'scroll', 'write', 'press', 'screenshot', 'executeJavascript', 'pdf']),
      // Action-specific fields (see full schema doc)
    })).optional(),
  }).optional(),
})

// Response handling
response.next?: string;  // For pagination
```

### Phase 2

```typescript
scrapeOptions: z.object({
  // ... Phase 1 + existing ...

  // Headers & auth
  headers: z.record(z.string()).optional(),

  // Content filtering
  blockAds: z.boolean().optional(), // default: true
  removeBase64Images: z.boolean().optional(), // default: true

  // Anti-bot
  proxy: z.enum(['auto', 'basic', 'stealth']).optional(),

  // File parsing
  parsers: z.array(z.string()).optional(), // ["pdf"]
});
```

### Phase 3

```typescript
scrapeOptions: z.object({
  // ... Phase 1 + Phase 2 ...

  // Location
  location: z.object({
    country: z.string().optional(),
    languages: z.array(z.string()).optional(),
  }).optional(),

  // Advanced
  maxAge: z.number().optional(),
  storeInCache: z.boolean().optional(),
  skipTlsVerification: z.boolean().optional(),
  mobile: z.boolean().optional(),
})

// Top-level
webhook: z.object({
  url: z.string().url(),
  headers: z.record(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
  events: z.array(z.enum(['started', 'page', 'completed', 'failed'])).optional(),
}).optional()

zeroDataRetention: z.boolean().optional(),
```

---

## Key Insights from Documentation

### Natural Language = v2 Game-Changer

- Users can now say: "Crawl only blog articles, skip marketing pages"
- Firecrawl generates optimal `includePaths`, `excludePaths`, `maxDepth`
- Can preview generated params via `/crawl/params-preview` endpoint
- Makes the API much more accessible

### Sitemap v2 Improvement

- v1: `sitemap: boolean` (confusing)
- v2: `sitemap: "include" | "skip"` (clear)
- `"include"` (default): Use sitemap AND discover pages
- `"skip"`: Ignore sitemap, only follow discovered links

### Actions Enable Modern Web

- Click: pagination, "load more" buttons, dropdowns
- Scroll: lazy-loaded infinite scroll content
- Write + Press: form submission, searches
- Wait: for JS execution, async content
- Screenshot + executeJS: capture rendered state

### Pagination Matters at Scale

- Default `limit: 10,000` pages per crawl
- Response includes `next` field for additional pages
- Each page returns up to 500 results
- Without pagination support, large crawls get truncated

---

## Testing Strategy

**Phase 1 Requirements**:

1. Natural language prompt handling
2. Action execution (click, scroll, wait sequences)
3. Browser loading (waitFor, timeout)
4. Pagination (fetch all pages)

**Phase 2 Requirements**:

1. Custom header propagation
2. Ad/image filtering effectiveness
3. Proxy/stealth mode bypass verification
4. PDF extraction accuracy

**Phase 3 Requirements**:

1. Country/language emulation
2. Webhook event delivery
3. Mobile viewport rendering
4. Format variations (summary, images, json)
   pulse

---

## What Users Can Do Now

**Current capabilities** (already exposed):

- Basic crawling with URL patterns
- Multiple output formats (markdown, html, links, screenshot)
- Content filtering (onlyMainContent, tags)
- Rate limiting (delay, maxConcurrency)
- Crawl scope control (domain, subdomains, external)

**What they're missing**:

- Can't describe crawl in English (needs prompt)
- Can't interact with pages (no actions)
- Breaks on slow JS-heavy sites (no waitFor)
- Doesn't work at scale (no pagination)

---

## Quick Comparison to Competitors

| Feature                  | Firecrawl      | Competitors | pulse  |
| ------------------------ | -------------- | ----------- | ------------ |
| Natural language prompts | ✅ v2          | Limited     | ❌           |
| Page actions             | ✅ pulse | ❌          |
| Pagination               | ✅             | Limited     | ❌           |
| Multiple formats         | ✅             | ✅          | ✅ (partial) |
| Custom headers           | ✅             | ✅          | ❌           |
| Webhooks                 | ✅             | Limited     | ❌           |
| Anti-bot proxy           | ✅             | Limited     | ❌           |

## pulse

## Recommendation

### Start Phase 1 Immediately

The 4 Phase 1 features are critical for:

- Accessibility (natural language)
- Reliability (timeout, waitFor)
- Modern web support (actions)
- Scale (pagination)

### Timeline

- **Phase 1**: 1-2 sprints (~2-3 weeks)
- **Phase 2**: 1 sprint (~1 week)
- **Phase 3**: 1 sprint (~1 week)

### Long-term Vision

Complete Firecrawl API surface in pulse, making it the most comprehensive MCP wrapper for web data extraction.

---

## Full Research Document

See: `/home/jmagar/code/pulse/docs/plans/2025-11-07-firecrawl-crawl-api-comprehensive-research.md`

Contains:

- All 35+ parameters explained
- Detailed use cases and examples
- Best practices from Firecrawl docs
- Testing strategies
- Architecture recommendations
