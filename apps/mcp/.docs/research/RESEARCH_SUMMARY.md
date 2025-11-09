# Firecrawl Search Endpoint Research - Executive Summary

**November 7, 2025**

---

## Key Findings

### Implementation Status: 85% Complete

Your Pulse Fetch search implementation covers **11 out of 13** major Firecrawl search endpoint parameters.

#### What's Implemented ✅

- Core search (query, limit)
- Multi-source search (web, images, news)
- Category filtering (github, research, pdf)
- Geographic targeting (country, location)
- Performance controls (timeout, ignoreInvalidURLs)
- Basic content scraping (6 scrapeOptions)
- API authentication and headers

#### What's Missing ❌

- **TBS (Time-Based Search)** - Filter by time period (past day/week/month/year or custom date range)
  - Priority: HIGH - Common need for news/research searches
  - Effort: EASY - Single parameter addition

#### What's Incomplete ⚠️

- **Lang parameter** - Exists in client but not explicitly in schema
  - Priority: LOW - Mostly works as-is
  - Effort: TRIVIAL - One line change
- **Advanced scrapeOptions** - 6/10+ options exposed
  - Priority: MEDIUM - Niche features (proxy modes, screenshots, actions)
  - Effort: MEDIUM - Multiple optional fields

---

## Quick Reference: The 13 Parameters

| #   | Parameter         | Type    | Exposed? | Notes                        |
| --- | ----------------- | ------- | -------- | ---------------------------- |
| 1   | query             | string  | ✅       | Required search term         |
| 2   | limit             | number  | ✅       | Default 5, max 100           |
| 3   | sources           | array   | ✅       | web, images, news            |
| 4   | categories        | array   | ✅       | github, research, pdf        |
| 5   | country           | string  | ✅       | ISO code, default US         |
| 6   | location          | string  | ✅       | Geographic string            |
| 7   | **tbs**           | string  | ❌       | **MISSING - Time filtering** |
| 8   | timeout           | number  | ✅       | Milliseconds                 |
| 9   | ignoreInvalidURLs | boolean | ✅       | Skip broken URLs             |
| 10  | scrapeOptions     | object  | ⚠️       | 6/10+ options                |
| 11  | lang              | string  | 🔶       | In client, not schema        |
| 12  | Authorization     | header  | ✅       | Bearer token                 |
| 13  | Content-Type      | header  | ✅       | application/json             |

---

## Recommended Action Plan

### Priority 1: Add TBS Parameter (1-2 hours)

**Value**: HIGH - Enables date-filtered searches
**Effort**: EASY - Add 1 field to schema

**Implementation**:

```typescript
// In /shared/mcp/tools/search/schema.ts
tbs: z.string().optional(),
  // Supports: 'qdr:h|d|w|m|y' or 'cdr:1,cd_min:MM/DD/YYYY,cd_max:MM/DD/YYYY'
```

**Impact**: Users can now search:

- "AI news from past 24 hours"
- "Research papers from January 2024"
- "GitHub updates from past week"

**Documentation Examples to Add**:

```json
{
  "query": "machine learning",
  "tbs": "qdr:w",
  "categories": ["research"],
  "limit": 10
}
```

---

### Priority 2: Enhance Documentation (1 hour)

**Value**: HIGH - Better user understanding
**Effort**: EASY - Writing examples

**Add to SEARCH.md**:

1. TBS parameter table with values
2. Examples for each TBS format
3. Cost implications section
4. Best practices section
5. Query operator examples

---

### Priority 3: Expose Lang Parameter (10 minutes)

**Value**: LOW-MEDIUM - Consistency
**Effort**: TRIVIAL - Already works

**Why**: Lang field exists in client but not explicitly in schema. Makes it discoverable.

---

### Priority 4: Advanced Features (Future)

**Value**: MEDIUM - Edge cases only
**Effort**: MEDIUM-HIGH

**Consider for future if users request**:

- Stealth proxy mode (+4 credits, helps with anti-bot)
- Actions (click, scroll, wait before scraping)
- Screenshots extraction
- Table extraction
- HTML tag inclusion

---

## Cost Analysis

### Current Costs

```
Basic search (no scraping):     2 credits per 10 results
With scraping:                   Standard scrape costs per result
```

### If Advanced Features Added (Future)

```
Stealth proxy mode:              +4 credits per result
PDF parsing:                     +1 credit per page
JSON mode extraction:            +4 credits per result
Screenshots:                     Additional (not fully documented)
```

---

## Files Involved

### Core Implementation (3 files)

- `/shared/mcp/tools/search/schema.ts` - Add TBS field
- `/shared/clients/firecrawl-search.client.ts` - Add TBS to interface
- `/shared/mcp/tools/search/index.ts` - Tool registration (no changes needed)

### Documentation (1 file)

- `/docs/tools/SEARCH.md` - Add examples and best practices

### Testing (1 file)

- `/shared/mcp/tools/search/index.test.ts` - Add test cases

### Optional (1 file)

- `/CHANGELOG.md` - Document new feature

---

## Examples: Before & After

### Example 1: Recent News

**Current (Can't filter by date)**:

```json
{
  "query": "AI breakthroughs",
  "sources": ["news"],
  "limit": 10
}
```

**After Adding TBS**:

```json
{
  "query": "AI breakthroughs",
  "sources": ["news"],
  "tbs": "qdr:d", // Only past 24 hours
  "limit": 10
}
```

---

### Example 2: Specific Date Range

**Current (Can't do this)**:

````jsonpulse-crawl
{
  "query": "2024 AI research",
  "categories": ["research"],
  "limit": 5
}
```pulse-crawl

**After Adding TBS**:

```json
{
  "query": "AI transformpulse-crawl
  "categories": ["research"],
  "tbs": "cdr:1,cd_min:01/01/2024,cd_max:12/31/2024",
  "limit": 5
}
````

---

## Detailed Documentation

Three detailed documents have been created:

1. **`/home/jmagar/code/pulse-fetch/.docs/sessions/2025-11-07-firecrawl-search-endpoint-research.md`**
   - Complete parameter analysis
   - All 13 parameters documented
   - Use cases and best practices
   - Implementation roadmap

2. **`/home/jmagar/code/pulse-fetch/.docs/SEARCH_ENDPOINT_AUDIT.md`**
   - Quick reference guide
   - Missing parameters checklist
   - Implementation checklist
   - Priority rankings

3. **`/home/jmagar/code/pulse-fetch/.docs/SEARCH_IMPLEMENTATION_GUIDE.md`**
   - Ready-to-implement code snippets
   - Exact file locations
   - Test cases to add
   - Verification steps

---

## Best Practices from Firecrawl

1. **Combine country + location** for best results
2. **Start with small limits** (3-5) to conserve credits
3. **Use category filters** for more relevant results
4. **Optimize costs**:
   - Set `parsers: []` if you don't need PDF content
   - Use `proxy: "basic"` not "stealth" when possible
   - Limit results with `limit` parameter
5. **Use `ignoreInvalidURLs: true`** when piping to scrape/crawl
6. **Use TBS for time-sensitive searches** (news, recent updates, trending)
7. **Leverage Google-style operators** in query:
   - `site:github.com` - Limit to specific site
   - `inurl:api` - Results containing "api" in URL
   - `intitle:"web scraping"` - Exact title match
   - `imagesize:1920x1080` - Image dimension filters

---

## Firecrawl API Resources

- **Search Documentation**: https://docs.firecrawl.dev/features/search
- **Search API Reference**: https://docs.firecrawl.dev/api-reference/endpoint/search
- **Supported Locations**: https://firecrawl.dev/search_locations.json
- **Pricing**: https://www.firecrawl.dev/pricing
- **Official Docs Home**: https://docs.firecrawl.dev

---

## Conclusion

**Your implementation is solid and production-ready** for standard use cases. The main opportunity is adding the TBS (time-based search) parameter, which is:

- **Easy to implement** (1-2 hours)
- **High value for users** (date-filtered searches)
- **Well-documented** (Firecrawl provides clear examples)

No critical gaps exist. The system works well as-is, and improvements are all additive (no breaking changes needed).

---

## Next Steps

1. Review the detailed research document
2. Decide on implementation scope (Priority 1 only? Plus Priority 2?)
3. Use the implementation guide for exact code changes
4. Run tests and verify with Firecrawl API
5. Update CHANGELOG.md
6. Document in session logs

**Estimated Total Time**: 1.5-2 hours for Priority 1 + 2
