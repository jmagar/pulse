# Map Tool Language Path Filtering Implementation

**Date:** 2025-11-10
**Branch:** `feat/map-language-filtering`
**Commit:** `82b8669`

## Summary

Implemented automatic filtering of multilingual documentation paths in the map tool to focus results on English/default language content.

## Problem Identified

Found hardcoded domain-specific language exclusions in [apps/mcp/shared/config/crawl-config.ts](../../apps/mcp/shared/config/crawl-config.ts):

```typescript
const DOMAIN_LANGUAGE_EXCLUDES: Record<string, string[]> = {
  'docs.firecrawl.dev': ['^/es/', '^/fr/', '^/ja/', '^/pt-BR/', '^/zh/'],
  'docs.claude.com': ['^/de/', '^/es/', '^/fr/', '^/id/', '^/it/', ...],
  'docs.unraid.net': ['^/de/', '^/es/', '^/fr/', '^/zh/'],
};
```

**Issue:** AI misunderstood requirements and created domain-specific overrides when only one default list was needed.

## Solution Implemented

### 1. Simplified Language Exclusions

**File:** [apps/mcp/shared/config/crawl-config.ts](../../apps/mcp/shared/config/crawl-config.ts)

- Removed `DOMAIN_LANGUAGE_EXCLUDES` object
- Renamed `UNIVERSAL_LANGUAGE_EXCLUDES` to `DEFAULT_LANGUAGE_EXCLUDES`
- Exported constant for use in other modules
- Expanded to 33 language patterns:
  - European (16): de, es, fr, it, pt, nl, pl, sv, no, nb, da, fi, cs, ru, uk, tr
  - Middle Eastern (2): ar, he
  - Asian (9): ja, ko, zh, zh-CN, zh-TW, id, vi, th, hi
  - Regional variants (6): pt-BR, es-MX, fr-CA, en-GB, en-UK, en-AU

### 2. Map Tool Filtering

**File:** [apps/mcp/shared/mcp/tools/map/response.ts](../../apps/mcp/shared/mcp/tools/map/response.ts)

Added `shouldExcludeUrl()` helper function (lines 8-20):
```typescript
function shouldExcludeUrl(url: string, excludePatterns: readonly string[]): boolean {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname;
    return excludePatterns.some((pattern) => {
      const regex = new RegExp(pattern);
      return regex.test(path);
    });
  } catch {
    return false; // Don't exclude invalid URLs
  }
}
```

Filter implementation in `formatMapResponse()` (lines 31-35):
```typescript
const totalLinksBeforeFilter = result.links.length;
const filteredLinks = result.links.filter(link => !shouldExcludeUrl(link.url, DEFAULT_LANGUAGE_EXCLUDES));
const totalLinks = filteredLinks.length;
const excludedCount = totalLinksBeforeFilter - totalLinks;
```

Summary display (lines 63-65):
```typescript
if (excludedCount > 0) {
  summaryLines.push(`Language paths excluded: ${excludedCount}`);
}
```

### 3. Test Coverage

**File:** [apps/mcp/shared/mcp/tools/map/response.test.ts](../../apps/mcp/shared/mcp/tools/map/response.test.ts)

Added comprehensive test suite (lines 162-232):
- Filter common language paths (de, es, fr, ja, zh-CN)
- Filter regional variants (pt-BR, es-MX, en-GB)
- Show exclusion count only when URLs are filtered
- Verify filtered results are correct

**Test Results:** All 14 tests passing ✓

## Files Modified

1. `apps/mcp/shared/config/crawl-config.ts` - Language exclusions configuration
2. `apps/mcp/shared/mcp/tools/map/response.ts` - Filtering logic
3. `apps/mcp/shared/mcp/tools/map/response.test.ts` - Test coverage

## Example Output

```
Map Results for https://docs.example.com
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total URLs discovered: 50
Language paths excluded: 25
Unique domains: 1
URLs with titles: 100%
Showing: 1-50 of 50
```

## Verification

```bash
pnpm test shared/mcp/tools/map/response.test.ts
# ✓ 14 tests passed
```

## Next Steps

- PR created: https://github.com/jmagar/pulse/compare/main...feat/map-language-filtering
- Ready for review and merge
