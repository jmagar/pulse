# Firecrawl Search Endpoint Audit

**Quick Reference - Missing Parameters & Recommendations**

---

## Overview

**Implementation Status**: 85% Complete (11/13 core parameters)

| Category              | Parameters                                                                       | Status |
| --------------------- | -------------------------------------------------------------------------------- | ------ |
| Implemented           | query, limit, sources, categories, country, location, timeout, ignoreInvalidURLs | ✅ 8/8 |
| Partially Implemented | scrapeOptions, lang                                                              | ⚠️ 2/3 |
| Missing               | tbs (time-based search)                                                          | ❌ 1/1 |

---

## Missing Parameters

### 1. TBS (Time-Based Search)

**Priority**: 🔴 HIGH
**Type**: `string` (optional)
**Where to Add**: `/shared/mcp/tools/search/schema.ts`

**Supported Values**:

```typescript
// Predefined ranges
'qdr:h'; // Past hour
'qdr:d'; // Past 24 hours
'qdr:w'; // Past week
'qdr:m'; // Past month
'qdr:y'; // Past year

// Custom date ranges
'cdr:1,cd_min:MM/DD/YYYY,cd_max:MM/DD/YYYY';
```

**Example Addition to Schema**:

```typescript
tbs: z.string().optional(),
  // Docs: https://docs.firecrawl.dev/features/search#time-based-search
```

**Use Cases**:

- Find recent news about a topic
- Search for articles from past week only
- Research papers from specific date range

---

## Partially Implemented Parameters

### 1. Lang Parameter

**Location**: Exists in client (`FirecrawlSearchClient`) but NOT in schema
**Priority**: 🟡 MEDIUM
**Type**: `string` (optional, default: "en")
**Where to Fix**: `/shared/mcp/tools/search/schema.ts`

**Current State**:

```typescript
// In client - WORKS
lang?: string;

// In schema - MISSING
// Not present in searchOptionsSchema!
```

**Action**: Make it explicit in schema even though it's passed through

---

### 2. ScrapeOptions - Incomplete

**Priority**: 🟡 MEDIUM
**Status**: 6/10+ options exposed

**Currently Exposed**:

- ✅ formats
- ✅ onlyMainContent
- ✅ removeBase64Images
- ✅ blockAds
- ✅ waitFor
- ✅ parsers

**Not Exposed** (but supported by Firecrawl):

- ❌ proxy ("basic" | "stealth") - adds 4 credits for stealth
- ❌ actions (array of interaction steps)
- ❌ extractScreenshots (boolean)
- ❌ includeTables (boolean)
- ❌ includeHtmlTags (boolean)
- ❌ wait (selector-based wait)

**Note**: Firecrawl docs say "Every option in scrape endpoint is supported" but not all are exposed

---

## Cost Implications

### Current Implementation Costs

```
Base search (no scraping): 2 credits per 10 results
With scraping: Standard scrape costs apply per result
```

### Potential Additional Costs (if advanced features added)

```
Stealth proxy: +4 credits per result
PDF parsing: +1 credit per page
JSON mode: +4 credits per result
Screenshots: Additional (not clearly documented)
```

---

## Quick Implementation Checklist

### Phase 1: TBS Addition (1-2 hours)

- [ ] Add to `/shared/mcp/tools/search/schema.ts`
  ```typescript
  tbs: z.string().optional(),
  ```
- [ ] Verify client passes it through (already does)
- [ ] Add test in `/shared/mcp/tools/search/index.test.ts`
- [ ] Add examples to `/docs/tools/SEARCH.md`
- [ ] Update README with time-based search examples

**Files to modify**: 3 files
**Tests needed**: 1 new test case

---

### Phase 2: Lang Exposure (10 minutes)

- [ ] Add explicit `lang` to schema in `/shared/mcp/tools/search/schema.ts`
  ```typescript
  lang: z.string().optional().default('en'),
  ```
- [ ] Update docs (optional - already working)

**Files to modify**: 1 file
**Tests needed**: None (already works)

---

### Phase 3: Advanced Features (3-4 hours - Future)

- [ ] Expand scrapeOptions with:
  - proxy
  - actions
  - extractScreenshots
  - includeTables
  - includeHtmlTags
- [ ] Add cost warnings to documentation
- [ ] Add comprehensive examples
- [ ] Test with real Firecrawl API

**Files to modify**: 2-3 files (schema, docs, tests)
**Tests needed**: Multiple new test cases

---

## Files Affected

### Core Implementation

- `/shared/mcp/tools/search/schema.ts` - Main schema definitions
- `/shared/clients/firecrawl-search.client.ts` - API client (mostly complete)
- `/shared/mcp/tools/search/index.ts` - Tool registration

### Documentation

- `/docs/tools/SEARCH.md` - Public tool documentation
- `/README.md` - Main project README (if needed)

### Testing

- `/shared/mcp/tools/search/index.test.ts` - Tool tests
- `/shared/mcp/tools/search/schema.test.ts` - Schema validation tests
- `/tests/manual/features/search.test.ts` - Manual integration tests

---

## API Reference Links

- **Official Docs**: https://docs.firecrawl.dev/features/search
- **API Reference**: https://docs.firecrawl.dev/api-reference/endpoint/search
- **Supported Locations**: https://firecrawl.dev/search_locations.json
- **Pricing**: https://www.firecrawl.dev/pricing

---

## Recommended Priority Order

1. **First**: Add TBS parameter (high value, easy to implement)
2. **Second**: Enhance documentation with examples
3. **Third**: Expose Lang parameter (consistency)
4. **Future**: Advanced scrapeOptions (if user requests)

---

## Before & After Example

### BEFORE (Current)

```json
{
  "query": "AI news",
  "limit": 5,
  "country": "US"
}
```

### AFTER (With TBS)

```json
{
  "query": "AI news",
  "limit": 5,
  "country": "US",
  "tbs": "qdr:d" // Past 24 hours only!
}
```

---

## Questions to Consider

1. **Should `lang` default to API default or expose explicitly?**
   - Recommendation: Expose explicitly for user control

2. **Should advanced scrapeOptions be added?**
   - Recommendation: Wait for user requests (niche features)

3. **Should document cost implications prominently?**
   - Recommendation: Yes, add cost section to SEARCH.md

4. **Should add examples for all TBS formats?**
   - Recommendation: Yes, include in documentation

---

## Summary

**What's Working**: Core search, multi-source, categories, geo-targeting
**What's Missing**: Time-based search (TBS parameter)
**What's Incomplete**: Advanced scraping options, language parameter not in schema

**Effort to Fix**:

- Quick win (TBS): 1-2 hours
- Nice to have (Lang): 10 minutes
- Future enhancement (Advanced): 3-4 hours

**Impact**: Enables date-filtered searches (moderate user need), exposes missing parameter, better consistency

**Next Step**: Add TBS parameter and update documentation
