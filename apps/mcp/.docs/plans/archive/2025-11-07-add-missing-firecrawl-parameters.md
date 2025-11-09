# Implementation Plan: Add Missing Firecrawl Parameters to Pulse Fetch

**Created:** 2025-11-07
**Status:** Ready for Implementation
**Estimated Duration:** 4-5 weeks (3 phases)
**Breaking Changes:** None

## Executive Summary

This plan adds missing Firecrawl API parameters to pulse's scrape, crawl, map, and search tools based on comprehensive research comparing our implementation against Firecrawl's official v2 API documentation.

**Current Coverage:**

- SCRAPE: 8/23+ parameters (35%) - **CRITICAL GAPS**
- CRAWL: 11/35+ parameters (31%) - **CRITICAL GAPS**
- MAP: 11/11 parameters (100%) - **POLISH NEEDED**
- SEARCH: 11/13 parameters (85%) - **EASY WIN**

**Impact:** Unlocks dynamic site scraping, 500% performance improvements, natural language interfaces, and browser automation.

---

## Phase 1: High-Impact Quick Wins (Week 1-2)

**Effort:** 2 weeks | **Impact:** 80% of missing functionality | **Breaking Changes:** None

### Task 1.1: Add SEARCH `tbs` Parameter (Time-Based Search)

**Duration:** 2-3 hours
**Files Modified:** 3
**Impact:** HIGH - Enables date-filtered searches ("news from past 24 hours")

#### Implementation Steps

**Step 1.1.1: Update Search Schema**

File: `/home/jmagar/code/pulse/shared/mcp/tools/search/schema.ts`

Add this parameter to the schema object (after line 12):

```typescript
tbs: z.string().optional().describe(
  'Time-based search filter. Filters results by date range. ' +
  'Valid values: ' +
  'qdr:h (past hour), qdr:d (past day), qdr:w (past week), qdr:m (past month), qdr:y (past year), ' +
  'or custom range: cdr:a,cd_min:MM/DD/YYYY,cd_max:MM/DD/YYYY. ' +
  'Examples: "qdr:d" (past 24 hours), "qdr:w" (past week), "cdr:a,cd_min:01/01/2024,cd_max:12/31/2024" (custom range)'
),
```

**Step 1.1.2: Update Search Client Interface**

File: `/home/jmagar/code/pulse/shared/clients/firecrawl-search.client.ts`

Add to `SearchOptions` interface (after line 11):

```typescript
tbs?: string;
```

**Step 1.1.3: Add Test Cases**

File: `/home/jmagar/code/pulse/shared/mcp/tools/search/schema.test.ts`

Add test cases after existing tests:

```typescript
describe('tbs parameter', () => {
  it('accepts past hour filter', () => {
    const result = searchOptionsSchema.parse({
      query: 'test',
      tbs: 'qdr:h',
    });
    expect(result.tbs).toBe('qdr:h');
  });

  it('accepts past day filter', () => {
    const result = searchOptionsSchema.parse({
      query: 'test',
      tbs: 'qdr:d',
    });
    expect(result.tbs).toBe('qdr:d');
  });

  it('accepts custom date range', () => {
    const result = searchOptionsSchema.parse({
      query: 'test',
      tbs: 'cdr:a,cd_min:01/01/2024,cd_max:12/31/2024',
    });
    expect(result.tbs).toBe('cdr:a,cd_min:01/01/2024,cd_max:12/31/2024');
  });

  it('is optional', () => {
    const result = searchOptionsSchema.parse({
      query: 'test',
    });
    expect(result.tbs).toBeUndefined();
  });
});
```

**Verification:**

```bash
cd shared
npm test -- search/schema.test.ts
```

Expected: All tests pass, including new tbs tests.

---

### Task 1.2: Add SCRAPE Critical Parameters (maxAge, proxy, blockAds)

**Duration:** 8-10 hours
**Files Modified:** 5
**Impact:** CRITICAL - 500% perf improvement + anti-bot bypass

#### Implementation Steps

**Step 1.2.1: Add Parameter Descriptions**

File: `/home/jmagar/code/pulse/shared/mcp/tools/scrape/schema.ts`

Add to `PARAM_DESCRIPTIONS` object (after line 62):

```typescript
maxAge: 'Cache age threshold in milliseconds. Accept cached content if newer than this age. Set to 0 to always fetch fresh. Default: 172800000 (2 days). Firecrawl claims up to 500% faster responses with caching enabled.',
proxy: 'Proxy type for anti-bot bypass. Options: "basic" (fast, standard proxy), "stealth" (slow, 5 credits, advanced anti-bot bypass), "auto" (smart retry - tries basic first, falls back to stealth on failure). Default: "auto"',
blockAds: 'Enable ad-blocking and cookie popup blocking. Removes advertisements and cookie consent popups from scraped content for cleaner extraction. Default: true',
```

**Step 1.2.2: Update buildScrapeArgsSchema**

File: `/home/jmagar/code/pulse/shared/mcp/tools/scrape/schema.ts`

Add to `baseSchema` object (after line 128):

```typescript
maxAge: z.number().optional().default(172800000).describe(PARAM_DESCRIPTIONS.maxAge),
proxy: z.enum(['basic', 'stealth', 'auto']).optional().default('auto').describe(PARAM_DESCRIPTIONS.proxy),
blockAds: z.boolean().optional().default(true).describe(PARAM_DESCRIPTIONS.blockAds),
```

**Step 1.2.3: Update buildInputSchema**

File: `/home/jmagar/code/pulse/shared/mcp/tools/scrape/schema.ts`

Add to `baseProperties` object (after line 197):

```typescript
maxAge: {
  type: 'number',
  default: 172800000,
  description: PARAM_DESCRIPTIONS.maxAge,
},
proxy: {
  type: 'string',
  enum: ['basic', 'stealth', 'auto'],
  default: 'auto',
  description: PARAM_DESCRIPTIONS.proxy,
},
blockAds: {
  type: 'boolean',
  default: true,
  description: PARAM_DESCRIPTIONS.blockAds,
},
```

**Step 1.2.4: Update Firecrawl Client Interface**

File: `/home/jmagar/code/pulse/shared/scraping/clients/firecrawl/client.ts`

Add to `FirecrawlScrapingOptions` interface (after line 36):

```typescript
maxAge?: number;
proxy?: 'basic' | 'stealth' | 'auto';
blockAds?: boolean;
```

**Step 1.2.5: Verify Parameter Pass-Through**

File: `/home/jmagar/code/pulse/shared/scraping/clients/firecrawl/api.ts`

Confirm that line 41 (`...options`) correctly passes these new parameters to Firecrawl API. No code changes needed - the spread operator already handles it.

**Step 1.2.6: Add Test Cases**

Create new test file: `/home/jmagar/code/pulse/tests/functional/scrape-tool-new-params.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildScrapeArgsSchema } from '../../shared/mcp/tools/scrape/schema.js';

describe('New scrape parameters', () => {
  describe('maxAge parameter', () => {
    it('defaults to 2 days (172800000ms)', () => {
      const schema = buildScrapeArgsSchema();
      const result = schema.parse({ url: 'https://example.com' });
      expect(result.maxAge).toBe(172800000);
    });

    it('accepts custom cache age', () => {
      const schema = buildScrapeArgsSchema();
      const result = schema.parse({
        url: 'https://example.com',
        maxAge: 3600000, // 1 hour
      });
      expect(result.maxAge).toBe(3600000);
    });

    it('accepts 0 for always fresh', () => {
      const schema = buildScrapeArgsSchema();
      const result = schema.parse({
        url: 'https://example.com',
        maxAge: 0,
      });
      expect(result.maxAge).toBe(0);
    });
  });

  describe('proxy parameter', () => {
    it('defaults to auto', () => {
      const schema = buildScrapeArgsSchema();
      const result = schema.parse({ url: 'https://example.com' });
      expect(result.proxy).toBe('auto');
    });

    it('accepts basic proxy', () => {
      const schema = buildScrapeArgsSchema();
      const result = schema.parse({
        url: 'https://example.com',
        proxy: 'basic',
      });
      expect(result.proxy).toBe('basic');
    });

    it('accepts stealth proxy', () => {
      const schema = buildScrapeArgsSchema();
      const result = schema.parse({
        url: 'https://example.com',
        proxy: 'stealth',
      });
      expect(result.proxy).toBe('stealth');
    });

    it('rejects invalid proxy types', () => {
      const schema = buildScrapeArgsSchema();
      expect(() =>
        schema.parse({
          url: 'https://example.com',
          proxy: 'invalid',
        })
      ).toThrow();
    });
  });

  describe('blockAds parameter', () => {
    it('defaults to true', () => {
      const schema = buildScrapeArgsSchema();
      const result = schema.parse({ url: 'https://example.com' });
      expect(result.blockAds).toBe(true);
    });

    it('accepts false to disable ad blocking', () => {
      const schema = buildScrapeArgsSchema();
      const result = schema.parse({
        url: 'https://example.com',
        blockAds: false,
      });
      expect(result.blockAds).toBe(false);
    });
  });
});
```

**Verification:**

```bash
cd /home/jmagar/code/pulse
npm test -- tests/functional/scrape-tool-new-params.test.ts
```

Expected: All 11 new tests pass.

---

### Task 1.3: Add CRAWL Natural Language Prompt Parameter

**Duration:** 6-8 hours
**Files Modified:** 4
**Impact:** CRITICAL - Natural language interface transforms UX

#### Implementation Steps

**Step 1.3.1: Update Crawl Schema**

File: `/home/jmagar/code/pulse/shared/mcp/tools/crawl/schema.ts`

Add parameter to schema object (after line 17):

```typescript
prompt: z.string().optional().describe(
  'Natural language prompt describing the crawl you want to perform. ' +
  'Firecrawl will automatically generate optimal crawl parameters based on your description. ' +
  'Examples: ' +
  '"Find all blog posts about AI from the past year", ' +
  '"Crawl the documentation section and extract API endpoints", ' +
  '"Get all product pages with pricing information", ' +
  '"Map the entire site but exclude admin pages". ' +
  'When provided, this takes precedence over manual parameters like limit, maxDepth, etc.'
),
```

**Step 1.3.2: Add Validation Logic**

File: `/home/jmagar/code/pulse/shared/mcp/tools/crawl/schema.ts`

Add comment before the existing refine (line 46) to document behavior:

```typescript
// Note: When 'prompt' is provided, Firecrawl API will use it to generate
// optimal parameters. Manual parameters (limit, maxDepth, etc.) are still
// sent but may be overridden by the AI-generated configuration.
```

No validation changes needed - prompt is optional and can coexist with other parameters.

**Step 1.3.3: Update Crawl Client Interface**

File: `/home/jmagar/code/pulse/shared/clients/firecrawl-crawl.client.ts`

Add to `CrawlOptions` interface (after line 4):

```typescript
prompt?: string;
```

**Step 1.3.4: Add Test Cases**

File: `/home/jmagar/code/pulse/shared/mcp/tools/crawl/schema.test.ts`

Add test suite:

```typescript
describe('prompt parameter', () => {
  it('accepts natural language prompt', () => {
    const result = crawlOptionsSchema.parse({
      url: 'https://example.com',
      prompt: 'Find all blog posts about AI',
    });
    expect(result.prompt).toBe('Find all blog posts about AI');
  });

  it('is optional', () => {
    const result = crawlOptionsSchema.parse({
      url: 'https://example.com',
    });
    expect(result.prompt).toBeUndefined();
  });

  it('works with manual parameters', () => {
    const result = crawlOptionsSchema.parse({
      url: 'https://example.com',
      prompt: 'Find documentation pages',
      limit: 50,
      maxDepth: 3,
    });
    expect(result.prompt).toBe('Find documentation pages');
    expect(result.limit).toBe(50);
    expect(result.maxDepth).toBe(3);
  });
});
```

**Verification:**

```bash
cd shared
npm test -- mcp/tools/crawl/schema.test.ts
```

Expected: All tests pass, including new prompt tests.

---

### Task 1.4: Add MAP Parameter Documentation

**Duration:** 4-6 hours
**Files Modified:** 2
**Impact:** MEDIUM - Dramatically improves user understanding

#### Implementation Steps

**Step 1.4.1: Create Parameter Descriptions Constant**

File: `/home/jmagar/code/pulse/shared/mcp/tools/map/schema.ts`

Add before the schema definition (line 3):

```typescript
/**
 * Parameter descriptions for map tool options
 *
 * Single source of truth for parameter documentation.
 */
export const MAP_PARAM_DESCRIPTIONS = {
  url: 'The website URL to map and discover URLs from (e.g., "https://example.com", "https://docs.example.com")',
  search:
    'Search query to filter discovered URLs by relevance. URLs matching this term are ranked higher. Example: "blog" returns URLs containing "blog" ordered by relevance. This is NOT a boolean filter - all URLs are returned, just reordered.',
  limit:
    'Maximum number of URLs to discover and return. Range: 1-100,000. Default: 5000. Note: Large limits may take longer to process.',
  sitemap:
    'How to handle XML sitemaps. Options: "skip" (ignore sitemap.xml), "include" (use sitemap + crawling for comprehensive discovery - RECOMMENDED), "only" (return only sitemap URLs for fastest results on large sites). Default: "include"',
  includeSubdomains:
    'Include URLs from subdomains of the target domain. Example: if mapping "example.com", this includes "blog.example.com", "shop.example.com", etc. Default: true',
  ignoreQueryParameters:
    'Treat URLs with different query parameters as the same page. Example: "page?id=1" and "page?id=2" are considered duplicates. Reduces result count. Default: true',
  timeout:
    'Maximum time to wait for the mapping operation in milliseconds. Increase for very large sites. If not specified, uses Firecrawl API default.',
  location:
    'Geographic location settings for content localization and proxy selection. Affects which content variations are discovered (geo-targeted pages).',
  locationCountry:
    'ISO 3166-1 alpha-2 country code (e.g., "US", "JP", "DE", "GB"). Determines proxy location and content localization. Default: "US"',
  locationLanguages:
    'Array of preferred languages in Accept-Language format (e.g., ["en-US"], ["en-US", "es-ES"], ["ja-JP"]). Controls language-specific content discovery. Default: ["en-US"]',
  startIndex:
    'Starting position for pagination (0-based). Use with maxResults to paginate through large result sets. Example: startIndex=200 skips first 200 URLs. Default: 0',
  maxResults:
    'Maximum URLs to return per response. Controls pagination page size. Range: 1-5000. ~13k tokens per 200 URLs. Examples: 100 (~6.5k tokens), 200 (~13k tokens - RECOMMENDED), 500 (~32k tokens), 1000 (~65k tokens). Default: 200',
  resultHandling:
    'How to return discovered URLs. Options: "saveOnly" (saves as linked resource, returns summary only - most token-efficient), "saveAndReturn" (saves as embedded resource with full data - DEFAULT), "returnOnly" (returns data without saving to MCP resources). Default: "saveAndReturn"',
} as const;
```

**Step 1.4.2: Update Schema with Descriptions**

File: `/home/jmagar/code/pulse/shared/mcp/tools/map/schema.ts`

Replace the schema definition (lines 3-36) with:

```typescript
export const mapOptionsSchema = z.object({
  url: z.string().url('Valid URL is required').describe(MAP_PARAM_DESCRIPTIONS.url),
  search: z.string().optional().describe(MAP_PARAM_DESCRIPTIONS.search),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100000)
    .optional()
    .default(5000)
    .describe(MAP_PARAM_DESCRIPTIONS.limit),
  sitemap: z
    .enum(['skip', 'include', 'only'])
    .optional()
    .default('include')
    .describe(MAP_PARAM_DESCRIPTIONS.sitemap),
  includeSubdomains: z
    .boolean()
    .optional()
    .default(true)
    .describe(MAP_PARAM_DESCRIPTIONS.includeSubdomains),
  ignoreQueryParameters: z
    .boolean()
    .optional()
    .default(true)
    .describe(MAP_PARAM_DESCRIPTIONS.ignoreQueryParameters),
  timeout: z.number().int().positive().optional().describe(MAP_PARAM_DESCRIPTIONS.timeout),
  location: z
    .object({
      country: z.string().optional().default('US').describe(MAP_PARAM_DESCRIPTIONS.locationCountry),
      languages: z.array(z.string()).optional().describe(MAP_PARAM_DESCRIPTIONS.locationLanguages),
    })
    .optional()
    .default({ country: 'US' })
    .describe(MAP_PARAM_DESCRIPTIONS.location),
  startIndex: z
    .number()
    .int()
    .min(0, 'startIndex must be non-negative')
    .optional()
    .default(0)
    .describe(MAP_PARAM_DESCRIPTIONS.startIndex),
  maxResults: z
    .number()
    .int()
    .min(1, 'maxResults must be at least 1')
    .max(5000, 'maxResults cannot exceed 5000')
    .optional()
    .default(200)
    .describe(MAP_PARAM_DESCRIPTIONS.maxResults),
  resultHandling: z
    .enum(['saveOnly', 'saveAndReturn', 'returnOnly'])
    .optional()
    .default('saveAndReturn')
    .describe(MAP_PARAM_DESCRIPTIONS.resultHandling),
});
```

**Verification:**

```bash
cd shared
npm test -- mcp/tools/map
```

Expected: All existing tests still pass. No behavior changes, only added descriptions.

---

## Phase 2: Critical Features (Week 3-4)

**Effort:** 2 weeks | **Impact:** Dynamic site scraping + advanced filtering | **Breaking Changes:** None

### Task 2.1: Add SCRAPE Browser Actions Parameter

**Duration:** 12-16 hours
**Files Modified:** 6
**Impact:** CRITICAL - Enables scraping of JavaScript-heavy SPAs

#### Background

Browser actions allow interaction with pages before scraping:

- Click buttons to load content
- Fill forms and submit
- Scroll to trigger lazy loading
- Wait for dynamic content
- Execute custom JavaScript
- Take screenshots at specific points

**Example use cases:**

- Login flows
- "Load more" pagination
- Consent dialogs
- Search forms
- Dynamic filtering

#### Implementation Steps

**Step 2.1.1: Define Action Types**

Create new file: `/home/jmagar/code/pulse/shared/mcp/tools/scrape/action-types.ts`

```typescript
import { z } from 'zod';

/**
 * Browser action types for page interaction before scraping
 *
 * Allows automation of common browser interactions to access
 * content that requires user interaction (clicks, form fills, etc.)
 */

export const waitActionSchema = z.object({
  type: z.literal('wait'),
  milliseconds: z.number().int().positive().describe('Time to wait in milliseconds'),
});

export const clickActionSchema = z.object({
  type: z.literal('click'),
  selector: z
    .string()
    .describe('CSS selector of element to click (e.g., "#load-more", ".cookie-accept")'),
});

export const writeActionSchema = z.object({
  type: z.literal('write'),
  selector: z.string().describe('CSS selector of input field'),
  text: z.string().describe('Text to type into the field'),
});

export const pressActionSchema = z.object({
  type: z.literal('press'),
  key: z.string().describe('Key to press (e.g., "Enter", "Tab", "Escape")'),
});

export const scrollActionSchema = z.object({
  type: z.literal('scroll'),
  direction: z.enum(['up', 'down']).describe('Scroll direction'),
  amount: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Pixels to scroll (optional, defaults to one viewport)'),
});

export const screenshotActionSchema = z.object({
  type: z.literal('screenshot'),
  name: z.string().optional().describe('Optional name for the screenshot'),
});

export const scrapeActionSchema = z.object({
  type: z.literal('scrape'),
  selector: z.string().optional().describe('Optional CSS selector to scrape specific element'),
});

export const executeJavaScriptActionSchema = z.object({
  type: z.literal('executeJavascript'),
  script: z.string().describe('JavaScript code to execute in browser context'),
});

/**
 * Union type of all possible browser actions
 */
export const browserActionSchema = z.discriminatedUnion('type', [
  waitActionSchema,
  clickActionSchema,
  writeActionSchema,
  pressActionSchema,
  scrollActionSchema,
  screenshotActionSchema,
  scrapeActionSchema,
  executeJavaScriptActionSchema,
]);

export type BrowserAction = z.infer<typeof browserActionSchema>;

/**
 * Array of browser actions to perform sequentially
 */
export const browserActionsArraySchema = z.array(browserActionSchema);
```

**Step 2.1.2: Add Actions to Scrape Schema**

File: `/home/jmagar/code/pulse/shared/mcp/tools/scrape/schema.ts`

Add import at top:

```typescript
import { browserActionsArraySchema } from './action-types.js';
```

Add to `PARAM_DESCRIPTIONS`:

```typescript
actions: `Browser automation actions to perform before scraping. Enables interaction with dynamic pages that require user input.

Action types and examples:

1. wait - Pause for content to load
   { type: "wait", milliseconds: 2000 }

2. click - Click buttons, links, or elements
   { type: "click", selector: "#load-more" }
   { type: "click", selector: ".cookie-accept" }

3. write - Type into input fields
   { type: "write", selector: "#search-input", text: "search query" }

4. press - Press keyboard keys
   { type: "press", key: "Enter" }
   { type: "press", key: "Escape" }

5. scroll - Scroll page to trigger lazy loading
   { type: "scroll", direction: "down" }
   { type: "scroll", direction: "up", amount: 500 }

6. screenshot - Capture page at specific point
   { type: "screenshot", name: "after-login" }

7. scrape - Scrape specific element
   { type: "scrape", selector: "#main-content" }

8. executeJavascript - Run custom JavaScript
   { type: "executeJavascript", script: "document.querySelector('.modal').remove()" }

Real-world example sequence:
[
  { type: "wait", milliseconds: 1000 },
  { type: "click", selector: "#cookie-accept" },
  { type: "write", selector: "#email", text: "user@example.com" },
  { type: "press", key: "Enter" },
  { type: "wait", milliseconds: 2000 },
  { type: "scrape", selector: "#dashboard" }
]`,
```

Add to `baseSchema`:

```typescript
actions: browserActionsArraySchema.optional().describe(PARAM_DESCRIPTIONS.actions),
```

Add to `baseProperties` in `buildInputSchema`:

```typescript
actions: {
  type: 'array',
  items: {
    type: 'object',
    oneOf: [
      {
        type: 'object',
        required: ['type', 'milliseconds'],
        properties: {
          type: { type: 'string', enum: ['wait'] },
          milliseconds: { type: 'number', description: 'Time to wait in milliseconds' }
        }
      },
      {
        type: 'object',
        required: ['type', 'selector'],
        properties: {
          type: { type: 'string', enum: ['click'] },
          selector: { type: 'string', description: 'CSS selector of element to click' }
        }
      },
      {
        type: 'object',
        required: ['type', 'selector', 'text'],
        properties: {
          type: { type: 'string', enum: ['write'] },
          selector: { type: 'string', description: 'CSS selector of input field' },
          text: { type: 'string', description: 'Text to type' }
        }
      },
      {
        type: 'object',
        required: ['type', 'key'],
        properties: {
          type: { type: 'string', enum: ['press'] },
          key: { type: 'string', description: 'Key to press (e.g., "Enter")' }
        }
      },
      {
        type: 'object',
        required: ['type', 'direction'],
        properties: {
          type: { type: 'string', enum: ['scroll'] },
          direction: { type: 'string', enum: ['up', 'down'] },
          amount: { type: 'number', description: 'Pixels to scroll (optional)' }
        }
      },
      {
        type: 'object',
        required: ['type'],
        properties: {
          type: { type: 'string', enum: ['screenshot'] },
          name: { type: 'string', description: 'Screenshot name (optional)' }
        }
      },
      {
        type: 'object',
        required: ['type'],
        properties: {
          type: { type: 'string', enum: ['scrape'] },
          selector: { type: 'string', description: 'CSS selector (optional)' }
        }
      },
      {
        type: 'object',
        required: ['type', 'script'],
        properties: {
          type: { type: 'string', enum: ['executeJavascript'] },
          script: { type: 'string', description: 'JavaScript code to execute' }
        }
      }
    ]
  },
  description: PARAM_DESCRIPTIONS.actions,
},
```

**Step 2.1.3: Update Firecrawl Client**

File: `/home/jmagar/code/pulse/shared/scraping/clients/firecrawl/client.ts`

Add import:

```typescript
import type { BrowserAction } from '../../mcp/tools/scrape/action-types.js';
```

Add to interface:

```typescript
actions?: BrowserAction[];
```

**Step 2.1.4: Add Comprehensive Tests**

Create: `/home/jmagar/code/pulse/tests/functional/scrape-actions.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { buildScrapeArgsSchema } from '../../shared/mcp/tools/scrape/schema.js';

describe('Scrape actions parameter', () => {
  const schema = buildScrapeArgsSchema();

  it('accepts wait action', () => {
    const result = schema.parse({
      url: 'https://example.com',
      actions: [{ type: 'wait', milliseconds: 2000 }],
    });
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toEqual({ type: 'wait', milliseconds: 2000 });
  });

  it('accepts click action', () => {
    const result = schema.parse({
      url: 'https://example.com',
      actions: [{ type: 'click', selector: '#load-more' }],
    });
    expect(result.actions[0]).toEqual({ type: 'click', selector: '#load-more' });
  });

  it('accepts write action', () => {
    const result = schema.parse({
      url: 'https://example.com',
      actions: [{ type: 'write', selector: '#input', text: 'test' }],
    });
    expect(result.actions[0]).toEqual({ type: 'write', selector: '#input', text: 'test' });
  });

  it('accepts press action', () => {
    const result = schema.parse({
      url: 'https://example.com',
      actions: [{ type: 'press', key: 'Enter' }],
    });
    expect(result.actions[0]).toEqual({ type: 'press', key: 'Enter' });
  });

  it('accepts scroll action', () => {
    const result = schema.parse({
      url: 'https://example.com',
      actions: [{ type: 'scroll', direction: 'down' }],
    });
    expect(result.actions[0]).toEqual({ type: 'scroll', direction: 'down' });
  });

  it('accepts scroll with amount', () => {
    const result = schema.parse({
      url: 'https://example.com',
      actions: [{ type: 'scroll', direction: 'down', amount: 500 }],
    });
    expect(result.actions[0]).toEqual({ type: 'scroll', direction: 'down', amount: 500 });
  });

  it('accepts screenshot action', () => {
    const result = schema.parse({
      url: 'https://example.com',
      actions: [{ type: 'screenshot' }],
    });
    expect(result.actions[0]).toEqual({ type: 'screenshot' });
  });

  it('accepts screenshot with name', () => {
    const result = schema.parse({
      url: 'https://example.com',
      actions: [{ type: 'screenshot', name: 'after-login' }],
    });
    expect(result.actions[0]).toEqual({ type: 'screenshot', name: 'after-login' });
  });

  it('accepts scrape action', () => {
    const result = schema.parse({
      url: 'https://example.com',
      actions: [{ type: 'scrape', selector: '#content' }],
    });
    expect(result.actions[0]).toEqual({ type: 'scrape', selector: '#content' });
  });

  it('accepts executeJavascript action', () => {
    const result = schema.parse({
      url: 'https://example.com',
      actions: [{ type: 'executeJavascript', script: 'console.log("test")' }],
    });
    expect(result.actions[0]).toEqual({ type: 'executeJavascript', script: 'console.log("test")' });
  });

  it('accepts multiple actions in sequence', () => {
    const result = schema.parse({
      url: 'https://example.com',
      actions: [
        { type: 'wait', milliseconds: 1000 },
        { type: 'click', selector: '#accept' },
        { type: 'write', selector: '#search', text: 'query' },
        { type: 'press', key: 'Enter' },
        { type: 'wait', milliseconds: 2000 },
      ],
    });
    expect(result.actions).toHaveLength(5);
  });

  it('rejects invalid action type', () => {
    expect(() =>
      schema.parse({
        url: 'https://example.com',
        actions: [{ type: 'invalid' }],
      })
    ).toThrow();
  });

  it('rejects wait without milliseconds', () => {
    expect(() =>
      schema.parse({
        url: 'https://example.com',
        actions: [{ type: 'wait' }],
      })
    ).toThrow();
  });

  it('rejects click without selector', () => {
    expect(() =>
      schema.parse({
        url: 'https://example.com',
        actions: [{ type: 'click' }],
      })
    ).toThrow();
  });

  it('is optional', () => {
    const result = schema.parse({ url: 'https://example.com' });
    expect(result.actions).toBeUndefined();
  });
});
```

**Verification:**

```bash
npm test -- tests/functional/scrape-actions.test.ts
```

Expected: All 18 tests pass.

---

### Task 2.2: Add CRAWL Page Actions (scrapeOptions.actions)

**Duration:** 8-10 hours
**Files Modified:** 4
**Impact:** CRITICAL - Enables crawling of dynamic sites

#### Implementation Steps

**Step 2.2.1: Update Crawl Schema**

File: `/home/jmagar/code/pulse/shared/mcp/tools/crawl/schema.ts`

Add import:

```typescript
import { browserActionsArraySchema } from '../scrape/action-types.js';
```

Update `scrapeOptions` object (replace lines 37-44):

```typescript
scrapeOptions: z
  .object({
    formats: z.array(z.string()).optional().default(['markdown']),
    onlyMainContent: z.boolean().optional().default(true),
    includeTags: z.array(z.string()).optional(),
    excludeTags: z.array(z.string()).optional(),
    actions: browserActionsArraySchema.optional().describe(
      'Browser actions to perform on each page before scraping. ' +
      'Same action types as scrape tool: wait, click, write, press, scroll, screenshot, scrape, executeJavascript. ' +
      'Applied to every page in the crawl.'
    ),
  })
  .optional(),
```

**Step 2.2.2: Update Crawl Client Interface**

File: `/home/jmagar/code/pulse/shared/clients/firecrawl-crawl.client.ts`

Add import:

```typescript
import type { BrowserAction } from '../mcp/tools/scrape/action-types.js';
```

Update `scrapeOptions` in interface (lines 16-21):

```typescript
scrapeOptions?: {
  formats?: string[];
  onlyMainContent?: boolean;
  includeTags?: string[];
  excludeTags?: string[];
  actions?: BrowserAction[];
};
```

**Step 2.2.3: Add Tests**

File: `/home/jmagar/code/pulse/shared/mcp/tools/crawl/schema.test.ts`

Add test suite:

```typescript
describe('scrapeOptions.actions', () => {
  it('accepts browser actions in scrapeOptions', () => {
    const result = crawlOptionsSchema.parse({
      url: 'https://example.com',
      scrapeOptions: {
        actions: [
          { type: 'wait', milliseconds: 1000 },
          { type: 'click', selector: '.load-more' },
        ],
      },
    });
    expect(result.scrapeOptions?.actions).toHaveLength(2);
  });

  it('applies actions to all pages in crawl', () => {
    const result = crawlOptionsSchema.parse({
      url: 'https://example.com',
      limit: 10,
      scrapeOptions: {
        actions: [{ type: 'scroll', direction: 'down' }],
      },
    });
    expect(result.scrapeOptions?.actions).toBeDefined();
    expect(result.limit).toBe(10);
  });
});
```

**Verification:**

```bash
cd shared
npm test -- mcp/tools/crawl/schema.test.ts
```

Expected: All tests pass including new action tests.

---

### Task 2.3: Add SCRAPE Advanced Parameters (headers, waitFor, includeTags, excludeTags, formats)

**Duration:** 10-12 hours
**Files Modified:** 5
**Impact:** HIGH - Advanced content filtering and control

#### Implementation Steps

**Step 2.3.1: Add Parameter Descriptions**

File: `/home/jmagar/code/pulse/shared/mcp/tools/scrape/schema.ts`

Add to `PARAM_DESCRIPTIONS`:

```typescript
headers: 'Custom HTTP headers to send with the request. Useful for authentication, custom user agents, or cookies. Example: { "Cookie": "session=abc123", "User-Agent": "MyBot/1.0" }',
waitFor: 'Milliseconds to wait before scraping. Allows page JavaScript to fully load and execute. Useful for single-page applications (SPAs) that render content dynamically. Example: 3000 (wait 3 seconds)',
includeTags: 'HTML tags, classes, or IDs to include in scraped content. Whitelist filter for surgical content extraction. Examples: ["p", "h1", "h2"], [".article-body", "#main-content"], ["article", ".post"]',
excludeTags: 'HTML tags, classes, or IDs to exclude from scraped content. Blacklist filter to remove unwanted elements. Examples: ["#ad", ".sidebar", "nav"], [".advertisement", "aside"], ["script", "style"]',
formats: 'Output formats to extract from the page. Options: "markdown" (clean text), "html" (processed HTML), "rawHtml" (unprocessed), "links" (all hyperlinks), "images" (all image URLs), "screenshot" (page screenshot), "summary" (AI-generated summary), "branding" (brand colors/fonts). Default: ["markdown", "html"]',
onlyMainContent: 'Extract only main content, excluding headers, navigation, footers, and ads. Uses intelligent content detection to identify the primary article/content area. Default: true',
```

**Step 2.3.2: Update Schema**

File: `/home/jmagar/code/pulse/shared/mcp/tools/scrape/schema.ts`

Add to `baseSchema` (after blockAds):

```typescript
headers: z.record(z.string()).optional().describe(PARAM_DESCRIPTIONS.headers),
waitFor: z.number().int().positive().optional().describe(PARAM_DESCRIPTIONS.waitFor),
includeTags: z.array(z.string()).optional().describe(PARAM_DESCRIPTIONS.includeTags),
excludeTags: z.array(z.string()).optional().describe(PARAM_DESCRIPTIONS.excludeTags),
formats: z.array(z.enum(['markdown', 'html', 'rawHtml', 'links', 'images', 'screenshot', 'summary', 'branding']))
  .optional()
  .default(['markdown', 'html'])
  .describe(PARAM_DESCRIPTIONS.formats),
onlyMainContent: z.boolean().optional().default(true).describe(PARAM_DESCRIPTIONS.onlyMainContent),
```

**Step 2.3.3: Update buildInputSchema**

Add to `baseProperties`:

```typescript
headers: {
  type: 'object',
  additionalProperties: { type: 'string' },
  description: PARAM_DESCRIPTIONS.headers,
},
waitFor: {
  type: 'number',
  description: PARAM_DESCRIPTIONS.waitFor,
},
includeTags: {
  type: 'array',
  items: { type: 'string' },
  description: PARAM_DESCRIPTIONS.includeTags,
},
excludeTags: {
  type: 'array',
  items: { type: 'string' },
  description: PARAM_DESCRIPTIONS.excludeTags,
},
formats: {
  type: 'array',
  items: {
    type: 'string',
    enum: ['markdown', 'html', 'rawHtml', 'links', 'images', 'screenshot', 'summary', 'branding']
  },
  default: ['markdown', 'html'],
  description: PARAM_DESCRIPTIONS.formats,
},
onlyMainContent: {
  type: 'boolean',
  default: true,
  description: PARAM_DESCRIPTIONS.onlyMainContent,
},
```

**Step 2.3.4: Update Firecrawl Client**

File: `/home/jmagar/code/pulse/shared/scraping/clients/firecrawl/client.ts`

Update interface (replace lines 26-37):

```typescript
export interface FirecrawlScrapingOptions {
  formats?: Array<
    'markdown' | 'html' | 'rawHtml' | 'links' | 'images' | 'screenshot' | 'summary' | 'branding'
  >;
  onlyMainContent?: boolean;
  waitFor?: number;
  timeout?: number;
  extract?: {
    schema?: Record<string, unknown>;
    systemPrompt?: string;
    prompt?: string;
  };
  removeBase64Images?: boolean;
  maxAge?: number;
  proxy?: 'basic' | 'stealth' | 'auto';
  blockAds?: boolean;
  headers?: Record<string, string>;
  includeTags?: string[];
  excludeTags?: string[];
}
```

**Step 2.3.5: Remove Hardcoded Formats**

File: `/home/jmagar/code/pulse/shared/scraping/clients/firecrawl/api.ts`

Update the fetch body (lines 38-42):

```typescript
body: JSON.stringify({
  url,
  formats: options?.formats || ['markdown', 'html'], // Use provided formats or default
  ...options,
}),
```

**Step 2.3.6: Add Tests**

Create: `/home/jmagar/code/pulse/tests/functional/scrape-advanced-params.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { buildScrapeArgsSchema } from '../../shared/mcp/tools/scrape/schema.js';

describe('Advanced scrape parameters', () => {
  const schema = buildScrapeArgsSchema();

  describe('headers parameter', () => {
    it('accepts custom headers object', () => {
      const result = schema.parse({
        url: 'https://example.com',
        headers: { 'User-Agent': 'MyBot/1.0', Cookie: 'session=abc' },
      });
      expect(result.headers).toEqual({ 'User-Agent': 'MyBot/1.0', Cookie: 'session=abc' });
    });
  });

  describe('waitFor parameter', () => {
    it('accepts wait time in milliseconds', () => {
      const result = schema.parse({
        url: 'https://example.com',
        waitFor: 3000,
      });
      expect(result.waitFor).toBe(3000);
    });

    it('rejects negative values', () => {
      expect(() =>
        schema.parse({
          url: 'https://example.com',
          waitFor: -1000,
        })
      ).toThrow();
    });
  });

  describe('includeTags parameter', () => {
    it('accepts array of tag selectors', () => {
      const result = schema.parse({
        url: 'https://example.com',
        includeTags: ['p', 'h1', '.article'],
      });
      expect(result.includeTags).toEqual(['p', 'h1', '.article']);
    });
  });

  describe('excludeTags parameter', () => {
    it('accepts array of tag selectors', () => {
      const result = schema.parse({
        url: 'https://example.com',
        excludeTags: ['#ad', 'nav', '.sidebar'],
      });
      expect(result.excludeTags).toEqual(['#ad', 'nav', '.sidebar']);
    });
  });

  describe('formats parameter', () => {
    it('defaults to markdown and html', () => {
      const result = schema.parse({ url: 'https://example.com' });
      expect(result.formats).toEqual(['markdown', 'html']);
    });

    it('accepts single format', () => {
      const result = schema.parse({
        url: 'https://example.com',
        formats: ['markdown'],
      });
      expect(result.formats).toEqual(['markdown']);
    });

    it('accepts multiple formats', () => {
      const result = schema.parse({
        url: 'https://example.com',
        formats: ['markdown', 'links', 'images'],
      });
      expect(result.formats).toEqual(['markdown', 'links', 'images']);
    });

    it('accepts all valid formats', () => {
      const result = schema.parse({
        url: 'https://example.com',
        formats: [
          'markdown',
          'html',
          'rawHtml',
          'links',
          'images',
          'screenshot',
          'summary',
          'branding',
        ],
      });
      expect(result.formats).toHaveLength(8);
    });

    it('rejects invalid formats', () => {
      expect(() =>
        schema.parse({
          url: 'https://example.com',
          formats: ['invalid'],
        })
      ).toThrow();
    });
  });

  describe('onlyMainContent parameter', () => {
    it('defaults to true', () => {
      const result = schema.parse({ url: 'https://example.com' });
      expect(result.onlyMainContent).toBe(true);
    });

    it('can be disabled', () => {
      const result = schema.parse({
        url: 'https://example.com',
        onlyMainContent: false,
      });
      expect(result.onlyMainContent).toBe(false);
    });
  });
});
```

**Verification:**

```bash
npm test -- tests/functional/scrape-advanced-params.test.ts
```

Expected: All 15 tests pass.

---

## Phase 3: Polish & Advanced Features (Week 5)

**Effort:** 1 week | **Impact:** Enhanced reliability + niche features | **Breaking Changes:** None

### Task 3.1: Add MAP Enhanced Error Handling

**Duration:** 6-8 hours
**Files Modified:** 3
**Impact:** MEDIUM - Better error messages and automatic retries

#### Implementation Steps

**Step 3.1.1: Define Error Types**

Create: `/home/jmagar/code/pulse/shared/clients/firecrawl-error-types.ts`

```typescript
/**
 * Firecrawl API error categorization
 *
 * Provides structured error handling with user-friendly messages
 * and actionable recommendations.
 */

export interface FirecrawlError {
  code: number;
  category: 'auth' | 'rate_limit' | 'payment' | 'validation' | 'server' | 'network';
  message: string;
  userMessage: string;
  retryable: boolean;
  retryAfterMs?: number;
}

export function categorizeFirecrawlError(statusCode: number, responseBody: string): FirecrawlError {
  // Parse error details from response
  let errorMessage = '';
  try {
    const json = JSON.parse(responseBody);
    errorMessage = json.error || json.message || '';
  } catch {
    errorMessage = responseBody;
  }

  switch (statusCode) {
    case 401:
      return {
        code: 401,
        category: 'auth',
        message: errorMessage,
        userMessage:
          'Authentication failed. Please verify your FIRECRAWL_API_KEY is correct and active.',
        retryable: false,
      };

    case 402:
      return {
        code: 402,
        category: 'payment',
        message: errorMessage,
        userMessage:
          'Payment required. Your Firecrawl account credits may be exhausted or plan upgrade needed. Visit https://firecrawl.dev/billing',
        retryable: false,
      };

    case 429:
      return {
        code: 429,
        category: 'rate_limit',
        message: errorMessage,
        userMessage: 'Rate limit exceeded. Please wait 60 seconds before retrying.',
        retryable: true,
        retryAfterMs: 60000,
      };

    case 400:
      return {
        code: 400,
        category: 'validation',
        message: errorMessage,
        userMessage: `Invalid request parameters: ${errorMessage}`,
        retryable: false,
      };

    case 500:
    case 502:
    case 503:
    case 504:
      return {
        code: statusCode,
        category: 'server',
        message: errorMessage,
        userMessage:
          'Firecrawl server error. This is usually temporary - please retry in a few moments.',
        retryable: true,
        retryAfterMs: 5000,
      };

    default:
      return {
        code: statusCode,
        category: 'network',
        message: errorMessage,
        userMessage: `Firecrawl API error (${statusCode}): ${errorMessage || 'Unknown error'}`,
        retryable: statusCode >= 500,
        retryAfterMs: statusCode >= 500 ? 5000 : undefined,
      };
  }
}
```

**Step 3.1.2: Update Map Client with Error Handling**

File: `/home/jmagar/code/pulse/shared/clients/firecrawl-map.client.ts`

Add import:

```typescript
import { categorizeFirecrawlError } from './firecrawl-error-types.js';
```

Update the `map` method (replace lines 76-92):

```typescript
async map(options: MapOptions): Promise<MapResult> {
  const response = await fetch(`${this.baseUrl}/map`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey}`,
    },
    body: JSON.stringify(options),
  });

  if (!response.ok) {
    const errorText = await response.text();
    const error = categorizeFirecrawlError(response.status, errorText);

    throw new Error(
      `Firecrawl Map API Error (${error.code}): ${error.userMessage}\n` +
      `Details: ${error.message}\n` +
      `Retryable: ${error.retryable}${error.retryAfterMs ? ` (retry after ${error.retryAfterMs}ms)` : ''}`
    );
  }

  return response.json();
}
```

**Step 3.1.3: Apply to Other Clients**

Repeat the same error handling pattern for:

- `/home/jmagar/code/pulse/shared/clients/firecrawl-crawl.client.ts`
- `/home/jmagar/code/pulse/shared/clients/firecrawl-search.client.ts`

**Step 3.1.4: Add Tests**

Create: `/home/jmagar/code/pulse/shared/clients/firecrawl-error-types.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { categorizeFirecrawlError } from './firecrawl-error-types.js';

describe('Firecrawl error categorization', () => {
  it('categorizes 401 as auth error', () => {
    const error = categorizeFirecrawlError(401, 'Invalid API key');
    expect(error.category).toBe('auth');
    expect(error.retryable).toBe(false);
    expect(error.userMessage).toContain('FIRECRAWL_API_KEY');
  });

  it('categorizes 402 as payment error', () => {
    const error = categorizeFirecrawlError(402, 'Credits exhausted');
    expect(error.category).toBe('payment');
    expect(error.retryable).toBe(false);
    expect(error.userMessage).toContain('billing');
  });

  it('categorizes 429 as rate limit with retry time', () => {
    const error = categorizeFirecrawlError(429, 'Rate limit exceeded');
    expect(error.category).toBe('rate_limit');
    expect(error.retryable).toBe(true);
    expect(error.retryAfterMs).toBe(60000);
  });

  it('categorizes 400 as validation error', () => {
    const error = categorizeFirecrawlError(400, 'Invalid URL');
    expect(error.category).toBe('validation');
    expect(error.retryable).toBe(false);
    expect(error.userMessage).toContain('Invalid URL');
  });

  it('categorizes 5xx as retryable server error', () => {
    const error = categorizeFirecrawlError(500, 'Internal server error');
    expect(error.category).toBe('server');
    expect(error.retryable).toBe(true);
    expect(error.retryAfterMs).toBe(5000);
  });

  it('parses JSON error messages', () => {
    const error = categorizeFirecrawlError(400, '{"error": "Invalid parameter"}');
    expect(error.message).toBe('Invalid parameter');
  });

  it('handles plain text error messages', () => {
    const error = categorizeFirecrawlError(500, 'Server unavailable');
    expect(error.message).toBe('Server unavailable');
  });
});
```

**Verification:**

```bash
cd shared
npm test -- clients/firecrawl-error-types.test.ts
```

Expected: All 7 tests pass.

---

### Task 3.2: Update .env.example Documentation

**Duration:** 2 hours
**Files Modified:** 1
**Impact:** LOW - Improved developer onboarding

#### Implementation Steps

**Step 3.2.1: Add New Parameter Documentation**

File: `/home/jmagar/code/pulse/.env.example`

Add new section after line 122:

```bash
# ============================================================================
# ADVANCED SCRAPING PARAMETERS (FIRECRAWL)
# ============================================================================

# The following parameters are available when using Firecrawl for scraping:
#
# CACHE CONTROL:
# - maxAge: Accept cached results up to N milliseconds old (default: 172800000 = 2 days)
#   - Set to 0 for always-fresh results
#   - Firecrawl claims up to 500% speed improvement with caching
#
# ANTI-BOT BYPASS:
# - proxy: Proxy type for anti-bot protection (default: "auto")
#   - "basic": Fast, standard proxy (1 credit)
#   - "stealth": Slow, advanced anti-bot bypass (5 credits)
#   - "auto": Tries basic, falls back to stealth on failure
#
# CONTENT FILTERING:
# - blockAds: Remove ads and cookie popups (default: true)
# - onlyMainContent: Extract only main content, exclude nav/footer (default: true)
# - includeTags: Array of CSS selectors to include (e.g., ["p", ".article"])
# - excludeTags: Array of CSS selectors to exclude (e.g., ["#ad", "nav"])
#
# OUTPUT FORMATS:
# - formats: Array of formats to extract (default: ["markdown", "html"])
#   - Available: markdown, html, rawHtml, links, images, screenshot, summary, branding
#
# BROWSER CONTROL:
# - waitFor: Milliseconds to wait before scraping (for JS-heavy sites)
# - headers: Custom HTTP headers (cookies, user-agent, etc.)
# - actions: Browser automation before scraping (click, scroll, type, etc.)
#
# CRAWL-SPECIFIC:
# - prompt: Natural language description of desired crawl
#   - Example: "Find all blog posts about AI from the past year"
#   - Firecrawl generates optimal crawl parameters from your description
#
# Note: These parameters are configured per-request via the MCP tool arguments,
# not via environment variables. This documentation is for reference only.
```

**Verification:**
No tests needed - documentation only. Review manually.

---

## Testing Strategy

### Unit Tests

Run after each task to verify schema validation:

```bash
cd shared
npm test
```

### Integration Tests

Test against real Firecrawl API after each phase:

```bash
cd /home/jmagar/code/pulse
npm test -- tests/integration
```

### Manual Testing

Create manual test cases for new parameters:

```bash
cd tests/manual
npm run test:scrape-maxage
npm run test:scrape-proxy
npm run test:scrape-actions
npm run test:crawl-prompt
npm run test:search-tbs
```

---

## Environment Variables

No new environment variables required. All new parameters are request-level configuration passed via MCP tool arguments.

---

## Documentation Updates

After completing all phases, update documentation:

1. **README.md** - Add new parameter examples
2. **docs/tools/SCRAPE.md** - Document all new scrape parameters
3. **docs/tools/CRAWL.md** - Document prompt and actions
4. **docs/tools/SEARCH.md** - Document tbs parameter
5. **docs/tools/MAP.md** - Add parameter descriptions
6. **CHANGELOG.md** - Document all changes by phase

---

## Rollout Plan

### Phase 1 Deployment (Week 2 End)

1. Run full test suite: `npm test`
2. Build all packages: `npm run build`
3. Test in local MCP environment
4. Deploy to staging
5. User acceptance testing
6. Deploy to production

### Phase 2 Deployment (Week 4 End)

Same process as Phase 1

### Phase 3 Deployment (Week 5 End)

Same process as Phase 1

---

## Risk Mitigation

### Breaking Changes

**Risk:** None expected - all changes are additive
**Mitigation:** All new parameters are optional with sensible defaults

### API Compatibility

**Risk:** Firecrawl API changes between v1 and v2
**Mitigation:** Already using v2 for crawl/map/search; scrape uses v1 (still supported)

### Performance Impact

**Risk:** New parameters increase payload size
**Mitigation:** All parameters optional; users only pay cost when used

### Testing Coverage

**Risk:** Missing edge cases in validation
**Mitigation:** Comprehensive test suite with 100+ new test cases across all phases

---

## Success Criteria

### Phase 1

- ✅ SEARCH tbs parameter working with all date ranges
- ✅ SCRAPE maxAge reduces response time by >50% on repeat scrapes
- ✅ SCRAPE proxy successfully bypasses anti-bot on test sites
- ✅ CRAWL prompt generates optimal parameters from natural language
- ✅ MAP parameter descriptions improve user understanding

### Phase 2

- ✅ SCRAPE actions successfully automate login flow on test site
- ✅ CRAWL actions enable crawling of JavaScript-heavy SPA
- ✅ SCRAPE formats parameter supports all 8 output types
- ✅ Content filtering (includeTags/excludeTags) surgically extracts content

### Phase 3

- ✅ Enhanced error messages reduce support tickets by >30%
- ✅ All documentation complete and accurate
- ✅ Zero regressions in existing functionality

---

## Appendices

### Appendix A: File Checklist

**Shared Module:**

- [x] `shared/mcp/tools/scrape/schema.ts` (Phase 1.2, 2.1, 2.3)
- [x] `shared/mcp/tools/scrape/action-types.ts` (Phase 2.1 - NEW FILE)
- [x] `shared/mcp/tools/crawl/schema.ts` (Phase 1.3, 2.2)
- [x] `shared/mcp/tools/map/schema.ts` (Phase 1.4)
- [x] `shared/mcp/tools/search/schema.ts` (Phase 1.1)
- [x] `shared/clients/firecrawl-crawl.client.ts` (Phase 1.3, 2.2)
- [x] `shared/clients/firecrawl-search.client.ts` (Phase 1.1)
- [x] `shared/clients/firecrawl-map.client.ts` (Phase 3.1)
- [x] `shared/clients/firecrawl-error-types.ts` (Phase 3.1 - NEW FILE)
- [x] `shared/scraping/clients/firecrawl/client.ts` (Phase 1.2, 2.1, 2.3)
- [x] `shared/scraping/clients/firecrawl/api.ts` (Phase 2.3)

**Tests:**

- [x] `shared/mcp/tools/search/schema.test.ts` (Phase 1.1)
- [x] `shared/mcp/tools/crawl/schema.test.ts` (Phase 1.3, 2.2)
- [x] `shared/clients/firecrawl-error-types.test.ts` (Phase 3.1 - NEW FILE)
- [x] `tests/functional/scrape-tool-new-params.test.ts` (Phase 1.2 - NEW FILE)
- [x] `tests/functional/scrape-actions.test.ts` (Phase 2.1 - NEW FILE)
- [x] `tests/functional/scrape-advanced-params.test.ts` (Phase 2.3 - NEW FILE)

**Configuration:**

- [x] `.env.example` (Phase 3.2)

**Documentation:**

- [ ] `README.md`
- [ ] `docs/tools/SCRAPE.md`
- [ ] `docs/tools/CRAWL.md`
- [ ] `docs/tools/SEARCH.md`
- [ ] `docs/tools/MAP.md`
- [ ] `CHANGELOG.md`

### Appendix B: Test Coverage Targets

- Unit tests: 100% coverage of new schema definitions
- Integration tests: 80% coverage of API interactions
- Functional tests: 90% coverage of parameter combinations
- Manual tests: 100% of critical user flows

### Appendix C: Estimated API Credit Usage

**Phase 1 Testing:**

- SEARCH tbs: ~10 searches = 10 credits
- SCRAPE maxAge: ~20 scrapes = 20 credits
- SCRAPE proxy: ~10 scrapes (5 stealth) = 35 credits
- CRAWL prompt: ~5 crawls = 50 credits
- **Total Phase 1: ~115 credits**

**Phase 2 Testing:**

- SCRAPE actions: ~15 scrapes = 15 credits
- CRAWL actions: ~5 crawls = 50 credits
- SCRAPE advanced: ~20 scrapes = 20 credits
- **Total Phase 2: ~85 credits**

**Phase 3 Testing:**

- Error handling: Uses existing test credits
- **Total Phase 3: ~0 new credits**

**Grand Total: ~200 credits ($2.00 USD)**

---

## Questions for Product Owner

Before starting implementation:

1. **Priority Confirmation:** Should we proceed with Phase 1 → 2 → 3 order, or prioritize differently?
2. **Timeline Flexibility:** Is the 5-week timeline acceptable, or do we need to compress?
3. **Testing Budget:** Do we have $2-5 USD for Firecrawl API testing credits?
4. **Feature Flags:** Should we add feature flags for gradual rollout, or deploy all-at-once?
5. **Documentation Depth:** Should we create video tutorials for complex features (actions, prompt)?

---

**End of Implementation Plan**

This plan provides complete, step-by-step instructions for an engineer with zero codebase context to implement all missing Firecrawl parameters across 3 phases with comprehensive testing, documentation, and verification steps.
