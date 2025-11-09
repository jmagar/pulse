# Fix MCP Tool Schema Generation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix empty JSON schema generation for search, map, and crawl MCP tools by implementing manual schema builders, eliminating the zodToJsonSchema cross-module boundary bug.

**Architecture:** Replace zodToJsonSchema() conversion with manual buildInputSchema() functions for each tool. This mirrors the proven pattern used by the scrape tool, avoiding the Dual-Package Hazard where zod-to-json-schema's instanceof checks fail on schemas imported from compiled dist directories.

**Tech Stack:** TypeScript, Zod (for runtime validation only), JSON Schema (manual construction), MCP SDK

---

## Background

### Root Cause Analysis

**Problem:** Search, map, and crawl tools return empty schemas (`{ "$schema": "..." }`) causing MCP clients to see no tools available.

**Root Cause:** When Zod schemas are compiled to `shared/dist/` and imported, they reference a different Zod instance than zod-to-json-schema uses. The library's internal `instanceof` checks fail, returning empty schemas.

**Evidence:**

```bash
# Test shows schemas exist but conversion fails
node .cache/test-zod-direct.js
# Simple schemas work: ✅
# Imported schemas fail: ❌ { "$schema": "..." }
```

**Solution:** Follow scrape tool's pattern - manual JSON Schema construction in buildInputSchema() functions.

---

## Task 1: Add buildInputSchema to Search Tool

**Files:**

- Modify: `shared/mcp/tools/search/schema.ts` (add buildInputSchema function)
- Modify: `shared/mcp/tools/search/index.ts:16` (replace zodToJsonSchema call)
- Test: Manual verification via `npm run build && node .cache/test-schemas.js`

### Step 1: Write buildInputSchema function in search schema.ts

Add after searchOptionsSchema definition (line 35):

```typescript
/**
 * Build JSON Schema for search tool input
 *
 * Manually constructs JSON Schema to avoid zodToJsonSchema cross-module
 * instanceof issues. Schemas imported from dist/ fail instanceof checks,
 * returning empty schemas.
 */
export const buildSearchInputSchema = () => {
  return {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        minLength: 1,
        description: 'Search query (required)',
      },
      limit: {
        type: 'number',
        minimum: 1,
        maximum: 100,
        default: 5,
        description: 'Maximum number of results to return per source',
      },
      sources: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['web', 'images', 'news'],
        },
        description: 'Which search sources to query (web, images, news)',
      },
      categories: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['github', 'research', 'pdf'],
        },
        description: 'Filter results by category (GitHub repos, research papers, PDFs)',
      },
      country: {
        type: 'string',
        description: 'Country code for localized results (e.g., "us", "gb")',
      },
      lang: {
        type: 'string',
        default: 'en',
        description: 'Language code for results (e.g., "en", "es")',
      },
      location: {
        type: 'string',
        description: 'Geographic location for localized results',
      },
      timeout: {
        type: 'number',
        minimum: 1,
        description: 'Request timeout in milliseconds',
      },
      ignoreInvalidURLs: {
        type: 'boolean',
        default: false,
        description: 'Skip results with invalid URLs',
      },
      tbs: {
        type: 'string',
        description:
          'Time-based search filter. Filters results by date range. ' +
          'Valid values: ' +
          'qdr:h (past hour), qdr:d (past day), qdr:w (past week), qdr:m (past month), qdr:y (past year), ' +
          'or custom range: cdr:a,cd_min:MM/DD/YYYY,cd_max:MM/DD/YYYY. ' +
          'Examples: "qdr:d" (past 24 hours), "qdr:w" (past week), "cdr:a,cd_min:01/01/2024,cd_max:12/31/2024" (custom range)',
      },
      scrapeOptions: {
        type: 'object',
        properties: {
          formats: {
            type: 'array',
            items: { type: 'string' },
            description: 'Content formats to extract (markdown, html, etc.)',
          },
          onlyMainContent: {
            type: 'boolean',
            description: 'Extract only main content, excluding nav/ads',
          },
          removeBase64Images: {
            type: 'boolean',
            default: true,
            description: 'Remove base64-encoded images from output',
          },
          blockAds: {
            type: 'boolean',
            default: true,
            description: 'Block advertisements and trackers',
          },
          waitFor: {
            type: 'number',
            description: 'Milliseconds to wait for page load',
          },
          parsers: {
            type: 'array',
            items: { type: 'string' },
            description: 'Custom parsers to apply',
          },
        },
        description: 'Options for scraping search result pages',
      },
    },
    required: ['query'],
  };
};
```

### Step 2: Update search index.ts to use buildSearchInputSchema

Replace line 16 in `shared/mcp/tools/search/index.ts`:

```typescript
// Before:
inputSchema: zodToJsonSchema(searchOptionsSchema as any) as any,

// After:
inputSchema: buildSearchInputSchema(),
```

Update imports at top of file:

```typescript
// Before:
import { searchOptionsSchema } from './schema.js';
import { zodToJsonSchema } from 'zod-to-json-schema';

// After:
import { searchOptionsSchema, buildSearchInputSchema } from './schema.js';
// Remove: import { zodToJsonSchema } from 'zod-to-json-schema';
```

### Step 3: Rebuild and test search schema

```bash
cd shared && npm run build
node .cache/test-schemas.js
```

**Expected output:**

```
=== SEARCH TOOL ===
Name: search
Description length: 159
Schema type: object
Schema has properties: true
✅ Search schema fixed
```

### Step 4: Commit search tool fix

```bash
git add shared/mcp/tools/search/schema.ts shared/mcp/tools/search/index.ts
git commit -m "fix(search): replace zodToJsonSchema with manual schema builder

- Add buildSearchInputSchema() function to avoid cross-module instanceof bug
- Remove zodToJsonSchema dependency from search tool
- Fixes empty schema generation causing 'no tools available' error"
```

---

## Task 2: Add buildInputSchema to Map Tool

**Files:**

- Modify: `shared/mcp/tools/map/schema.ts` (add buildInputSchema function)
- Modify: `shared/mcp/tools/map/index.ts:18` (replace zodToJsonSchema call)
- Test: Manual verification via `npm run build && node .cache/test-schemas.js`

### Step 1: Write buildInputSchema function in map schema.ts

Add after mapOptionsSchema definition (around line 90):

```typescript
/**
 * Build JSON Schema for map tool input
 *
 * Manually constructs JSON Schema to avoid zodToJsonSchema cross-module
 * instanceof issues. Schemas imported from dist/ fail instanceof checks,
 * returning empty schemas.
 */
export const buildMapInputSchema = () => {
  return {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        format: 'uri',
        description: 'Base URL to discover links from',
      },
      search: {
        type: 'string',
        description: 'Optional search query to filter discovered URLs',
      },
      startIndex: {
        type: 'number',
        minimum: 0,
        default: 0,
        description: 'Starting index for pagination (0-based)',
      },
      maxResults: {
        type: 'number',
        minimum: 1,
        maximum: 5000,
        default: 200,
        description: 'Maximum URLs to return (1-5000, default 200 for ~13k tokens)',
      },
      sitemap: {
        type: 'string',
        enum: ['include', 'only', 'exclude'],
        description:
          'How to handle sitemap URLs: include (mix with crawled), only (sitemap only), exclude (ignore sitemap)',
      },
      includeSubdomains: {
        type: 'boolean',
        default: false,
        description: 'Include URLs from subdomains of the base domain',
      },
      limit: {
        type: 'number',
        minimum: 1,
        maximum: 10000,
        description: 'Deprecated: Use maxResults instead',
      },
      resultHandling: {
        type: 'string',
        enum: ['saveOnly', 'saveAndReturn', 'returnOnly'],
        default: 'saveAndReturn',
        description:
          'How to handle results:\n' +
          '- saveOnly: Save as resource, return only link (token-efficient)\n' +
          '- saveAndReturn: Save and embed full content (default)\n' +
          '- returnOnly: Return inline without saving',
      },
    },
    required: ['url'],
  };
};
```

### Step 2: Update map index.ts to use buildMapInputSchema

Replace line 18 in `shared/mcp/tools/map/index.ts`:

```typescript
// Before:
inputSchema: zodToJsonSchema(mapOptionsSchema as any) as any,

// After:
inputSchema: buildMapInputSchema(),
```

Update imports at top of file:

```typescript
// Before:
import { mapOptionsSchema } from './schema.js';
import { zodToJsonSchema } from 'zod-to-json-schema';

// After:
import { mapOptionsSchema, buildMapInputSchema } from './schema.js';
// Remove: import { zodToJsonSchema } from 'zod-to-json-schema';
```

### Step 3: Rebuild and test map schema

```bash
cd shared && npm run build
node .cache/test-schemas.js
```

**Expected output:**

```
=== MAP TOOL ===
Name: map
Description length: 408
Schema type: object
Schema has properties: true
✅ Map schema fixed
```

### Step 4: Commit map tool fix

```bash
git add shared/mcp/tools/map/schema.ts shared/mcp/tools/map/index.ts
git commit -m "fix(map): replace zodToJsonSchema with manual schema builder

- Add buildMapInputSchema() function to avoid cross-module instanceof bug
- Remove zodToJsonSchema dependency from map tool
- Fixes empty schema generation causing 'no tools available' error"
```

---

## Task 3: Add buildInputSchema to Crawl Tool

**Files:**

- Modify: `shared/mcp/tools/crawl/schema.ts` (add buildInputSchema function)
- Modify: `shared/mcp/tools/crawl/index.ts:16` (replace zodToJsonSchema call)
- Test: Manual verification via `npm run build && node .cache/test-schemas.js`

### Step 1: Write buildInputSchema function in crawl schema.ts

Add after crawlOptionsSchema definition (around line 165):

```typescript
/**
 * Build JSON Schema for crawl tool input
 *
 * Manually constructs JSON Schema to avoid zodToJsonSchema cross-module
 * instanceof issues. Schemas imported from dist/ fail instanceof checks,
 * returning empty schemas.
 */
export const buildCrawlInputSchema = () => {
  return {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        format: 'uri',
        description: 'URL to start crawling from (for starting new crawl)',
      },
      jobId: {
        type: 'string',
        description: 'Crawl job ID (for status check or cancellation)',
      },
      cancel: {
        type: 'boolean',
        default: false,
        description: 'Set to true with jobId to cancel a running crawl',
      },
      maxDepth: {
        type: 'number',
        minimum: 0,
        maximum: 10,
        description: 'Maximum crawl depth (0 = single page, default based on limit)',
      },
      limit: {
        type: 'number',
        minimum: 1,
        maximum: 100000,
        default: 100,
        description: 'Maximum pages to crawl (1-100000, default 100)',
      },
      allowBackwardLinks: {
        type: 'boolean',
        default: false,
        description: 'Allow following links to parent pages',
      },
      allowExternalLinks: {
        type: 'boolean',
        default: false,
        description: 'Allow following links to external domains',
      },
      ignoreSitemap: {
        type: 'boolean',
        default: true,
        description: 'Ignore sitemap when crawling',
      },
      scrapeOptions: {
        type: 'object',
        properties: {
          formats: {
            type: 'array',
            items: { type: 'string' },
            description: 'Content formats to extract (markdown, html, etc.)',
          },
          onlyMainContent: {
            type: 'boolean',
            description: 'Extract only main content, excluding nav/ads',
          },
          removeBase64Images: {
            type: 'boolean',
            default: true,
            description: 'Remove base64-encoded images from output',
          },
          blockAds: {
            type: 'boolean',
            default: true,
            description: 'Block advertisements and trackers',
          },
          waitFor: {
            type: 'number',
            description: 'Milliseconds to wait for page load',
          },
        },
        description: 'Options for scraping crawled pages',
      },
      webhook: {
        type: 'string',
        format: 'uri',
        description: 'Webhook URL to notify when crawl completes',
      },
      excludePaths: {
        type: 'array',
        items: { type: 'string' },
        description: 'URL patterns to exclude from crawl',
      },
      includePaths: {
        type: 'array',
        items: { type: 'string' },
        description: 'URL patterns to include in crawl (whitelist)',
      },
      maxRetries: {
        type: 'number',
        minimum: 0,
        maximum: 10,
        description: 'Maximum retries for failed page fetches',
      },
      allowBackwardCrawling: {
        type: 'boolean',
        description: 'Deprecated: Use allowBackwardLinks instead',
      },
      allowExternalContentLinks: {
        type: 'boolean',
        description: 'Deprecated: Use allowExternalLinks instead',
      },
    },
    // Note: url and jobId are mutually exclusive, but JSON Schema
    // can't express XOR at root level for Anthropic API compatibility.
    // Validation happens in Zod schema via .refine()
  };
};
```

### Step 2: Update crawl index.ts to use buildCrawlInputSchema

Replace line 16 in `shared/mcp/tools/crawl/index.ts`:

```typescript
// Before:
inputSchema: zodToJsonSchema(crawlOptionsSchema as any) as any,

// After:
inputSchema: buildCrawlInputSchema(),
```

Update imports at top of file:

```typescript
// Before:
import { crawlOptionsSchema } from './schema.js';
import { zodToJsonSchema } from 'zod-to-json-schema';

// After:
import { crawlOptionsSchema, buildCrawlInputSchema } from './schema.js';
// Remove: import { zodToJsonSchema } from 'zod-to-json-schema';
```

### Step 3: Rebuild and test crawl schema

```bash
cd shared && npm run build
node .cache/test-schemas.js
```

**Expected output:**

```
=== CRAWL TOOL ===
Name: crawl
Description length: 124
Schema type: object
Schema has properties: true
✅ Crawl schema fixed
```

### Step 4: Commit crawl tool fix

```bash
git add shared/mcp/tools/crawl/schema.ts shared/mcp/tools/crawl/index.ts
git commit -m "fix(crawl): replace zodToJsonSchema with manual schema builder

- Add buildCrawlInputSchema() function to avoid cross-module instanceof bug
- Remove zodToJsonSchema dependency from crawl tool
- Fixes empty schema generation causing 'no tools available' error"
```

---

## Task 4: Verify All Tools Register Correctly

**Files:**

- Test: Run debug registration test
- Verify: All 4 tools show valid schemas

### Step 1: Rebuild entire shared package

```bash
cd shared && rm -rf dist && npm run build
```

**Expected:** Clean TypeScript compilation with no errors

### Step 2: Run registration test with debug output

```bash
DEBUG=true FIRECRAWL_API_KEY=test-key node .cache/test-registration.js
```

**Expected output:**

```
Creating MCP server...
Registering handlers...
[pulse] Registered tools:
[pulse]   1. scrape
[pulse]      Schema type: object
[pulse]   2. search
[pulse]      Schema type: object
[pulse]   3. map
[pulse]      Schema type: object
[pulse]   4. crawl
[pulse]      Schema type: object
Handlers registered successfully!
```

All tools should show `Schema type: object` (not `unknown`)

### Step 3: Run schema detail test

```bash
node .cache/test-schemas.js
```

**Expected output:**

```
=== SEARCH TOOL ===
Name: search
Schema type: object
Schema has properties: true
✅ PASS

=== MAP TOOL ===
Name: map
Schema type: object
Schema has properties: true
✅ PASS

=== CRAWL TOOL ===
Name: crawl
Schema type: object
Schema has properties: true
✅ PASS
```

### Step 4: Test server startup (local)

```bash
cd local && npm run build && npm start &
sleep 2
pkill -f "node.*local/dist/index.js"
```

**Expected:** Server starts without errors, logs show tools registered

### Step 5: Commit verification updates

```bash
git add .cache/test-*.js
git commit -m "test: add schema validation test scripts

- Add test-registration.js to verify MCP server tool registration
- Add test-schemas.js to validate tool schema generation
- Add test-zod-direct.js for debugging zodToJsonSchema issues"
```

---

## Task 5: Update Documentation

**Files:**

- Modify: `CHANGELOG.md` (add entry for bug fix)
- Modify: `shared/CLAUDE.md` (add learnings about zod-to-json-schema)

### Step 1: Add CHANGELOG entry

Prepend to `CHANGELOG.md`:

```markdown
## [0.3.1] - 2025-11-07

### Fixed

- **Critical:** Fixed empty JSON schema generation for search, map, and crawl tools
  - Root cause: zodToJsonSchema instanceof checks fail on schemas imported from compiled dist/
  - Solution: Implemented manual buildInputSchema() functions for each tool
  - Impact: MCP clients can now discover and use all 4 tools
  - Related: Dual-Package Hazard with Zod module instances across compilation boundaries

### Technical Details

- Replaced zodToJsonSchema() with manual JSON Schema construction
- Follows proven pattern from scrape tool
- Avoids cross-module instanceof validation failures
- No runtime behavior changes, only schema registration fix
```

### Step 2: Add learnings to shared/CLAUDE.md

Add to the "Claude Learnings" section:

```markdown
### Zod Schema Export and Cross-Module Boundaries

- **The Dual-Package Hazard**: When Zod schemas are compiled to dist/ and imported, they reference a different Zod instance than libraries like zod-to-json-schema use. The library's internal `instanceof` checks fail, returning empty schemas: `{ "$schema": "..." }`
- **Symptom**: Tools show as registered but clients see "no tools available" because inputSchema has no properties
- **Root Cause**: Multiple Zod module instances in module graph (one in source, one in dist, one in zod-to-json-schema)
- **instanceof Failure**: Zod uses prototype-based instanceof which fails across module boundaries, even with same version
- **Solution**: Manual JSON Schema construction via buildInputSchema() functions, avoiding zodToJsonSchema() entirely
- **Testing**: Simple schemas work (same module), imported schemas fail (cross-module)
- **Pattern**: Follow scrape tool's proven buildInputSchema() approach for all MCP tools
- **Future**: Zod v4 will use Symbol.hasInstance for cross-module instanceof, but manual construction is still more reliable
```

### Step 3: Commit documentation

```bash
git add CHANGELOG.md shared/CLAUDE.md
git commit -m "docs: document zod-to-json-schema cross-module issue and fix

- Add CHANGELOG entry for v0.3.1 bug fix
- Document Dual-Package Hazard learnings in CLAUDE.md
- Explain instanceof failure across module boundaries"
```

---

## Task 6: Clean Up Test Files and Dependencies

**Files:**

- Remove: Test scripts in `.cache/`
- Remove: Unused zod-to-json-schema imports from package.json (if not used elsewhere)

### Step 1: Remove test scripts

```bash
rm .cache/test-*.js
git add -A
```

### Step 2: Check if zod-to-json-schema is still needed

```bash
grep -r "zod-to-json-schema" shared/mcp/tools/*/index.ts
```

**Expected:** No matches (we removed all usages)

### Step 3: Verify scrape tool still works

The scrape tool uses buildInputSchema() and never used zodToJsonSchema, so no changes needed.

```bash
grep "zodToJsonSchema" shared/mcp/tools/scrape/index.ts
```

**Expected:** No match

### Step 4: Final verification build

```bash
npm run build --workspace=shared
npm run build --workspace=local
npm run build --workspace=remote
```

**Expected:** All builds succeed with no errors

### Step 5: Commit cleanup

```bash
git add .cache/ shared/package.json
git commit -m "chore: remove zodToJsonSchema debug scripts

- Remove temporary test scripts from .cache/
- All tools now use manual schema builders
- Ready for production deployment"
```

---

## Testing Checklist

After completing all tasks, verify:

- [ ] `npm run build` succeeds in all workspaces
- [ ] Debug registration test shows all 4 tools with `Schema type: object`
- [ ] Local server starts without errors
- [ ] MCP Inspector can discover all 4 tools
- [ ] Tool schemas have properties (not empty)
- [ ] No TypeScript compilation errors
- [ ] CHANGELOG documents the fix
- [ ] CLAUDE.md captures learnings

---

## Rollback Plan

If issues arise:

```bash
# Restore previous working state
git log --oneline -10
git revert <commit-hash>

# Or reset completely
git reset --hard HEAD~6
```

---

## Success Criteria

1. **Schema Generation**: All 4 tools return valid JSON schemas with properties
2. **Server Registration**: Debug output shows `Schema type: object` for all tools
3. **MCP Client**: Tools discoverable in MCP Inspector
4. **No Regressions**: Scrape tool continues working
5. **Documentation**: CHANGELOG and learnings documented
6. **Clean Build**: No TypeScript errors or warnings

---

## Additional Resources

- **Zod instanceof Issue**: https://github.com/colinhacks/zod/issues/2241
- **MCP SDK Transform Issue**: https://github.com/modelcontextprotocol/typescript-sdk/issues/702
- **Scrape Tool Pattern**: `shared/mcp/tools/scrape/schema.ts:252` (buildInputSchema reference)
- **Test Scripts**: `.cache/test-*.js` for debugging schema issues
