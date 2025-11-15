# Crawl Status Display Fix

## Issue
User reported: "it should NOT be saying crawl complete when its still crawling"

## Investigation

### 1. Scraped Firecrawl API Documentation
**Source:** https://docs.firecrawl.dev/api-reference/endpoint/crawl-get

**Key findings:**
- `status`: Can be `scraping`, `completed`, `failed`, or `cancelled`
- `next`: URL for next 10MB batch (present when data > 10MB OR crawl incomplete)
- `completed`: Number of pages successfully crawled
- `total`: Total pages attempted

### 2. Examined Response Formatter
**File:** `/compose/pulse/apps/mcp/shared/mcp/tools/crawl/response.ts:23-48`

**Problem identified:**
```typescript
// Old logic - line 29
let statusText = `Crawl Status: ${statusResult.status}\n...`;

if (statusResult.next) {
  statusText += `\n\nPagination URL: ${statusResult.next}`;
}
```

**Root cause:** Code displayed `status: 'completed'` directly without checking if `next` field exists. A crawl with `status === 'completed'` but `next !== undefined` means:
- Job finished discovering pages ✅
- BUT data pagination still required ⚠️

## Solution

Added logic to distinguish between:
1. **Truly complete:** `status === 'completed' && !next`
2. **Pagination pending:** `status === 'completed' && next`
3. **Still crawling:** `status === 'scraping'`

**Changes made:**
```typescript
// Lines 28-34: Detect true completion
const isTrulyComplete = statusResult.status === 'completed' && !statusResult.next;
const statusLabel = isTrulyComplete
  ? 'Completed'
  : statusResult.status === 'completed' && statusResult.next
    ? 'Completed (pagination required)'
    : statusResult.status.charAt(0).toUpperCase() + statusResult.status.slice(1);

// Lines 39-41: Clear warning when pagination needed
if (statusResult.next) {
  statusText += `\n\n⚠️ Data pagination required!\n...`;
}
```

## Result
Status display now accurately reflects:
- `Completed` - Job done, all data retrieved
- `Completed (pagination required)` - Job done, but 10MB+ data needs pagination
- `Scraping` - Job still running

**File modified:** `/compose/pulse/apps/mcp/shared/mcp/tools/crawl/response.ts`
