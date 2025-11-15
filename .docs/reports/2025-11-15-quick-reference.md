# Data Flow Quick Reference

## One-Sentence Summary
**MCP scrape tool has TWO independent storage paths that don't synchronize: local MCP storage (saveToStorage) and webhook persistent storage (PostgreSQL), resulting in single-URL scrapes not being stored in the searchable webhook database.**

---

## The Two Storage Paths

### Path 1: MCP Local Storage
```
User calls scrape(url)
    ↓
MCP Scrape Tool
    ↓
saveToStorage() → ResourceStorageFactory.create()
    ↓
One of:
├─ Memory (default, volatile)
├─ Filesystem (disk-based)
└─ Postgres (optional, not enabled by default)
```

**Files**: 
- Entry: `/compose/pulse/apps/mcp/tools/scrape/handler.ts` (line 35)
- Save: `/compose/pulse/apps/mcp/tools/scrape/pipeline.ts` (line 450)
- Storage: `/compose/pulse/apps/mcp/storage/factory.ts`

**What's saved**: raw HTML, cleaned markdown (if cleanScrape=true), extracted JSON (if extract provided)

**When saved**: When user calls scrape with `resultHandling != "returnOnly"`

---

### Path 2: Webhook Persistent Storage
```
Firecrawl webhook event (crawl.page, batch_scrape.page)
    ↓
_handle_page_event()
    ↓
asyncio.create_task(store_content_async())
    ↓
store_scraped_content()
    ↓
INSERT ... ON CONFLICT DO NOTHING
    ↓
PostgreSQL webhook.scraped_content table
```

**Files**:
- Proxy: `/compose/pulse/apps/webhook/api/routers/firecrawl_proxy.py` (line 205)
- Handler: `/compose/pulse/apps/webhook/services/webhook_handlers.py` (line 71)
- Storage: `/compose/pulse/apps/webhook/services/content_storage.py` (line 20)
- Model: `/compose/pulse/apps/webhook/domain/models.py` (line 205)

**What's saved**: markdown, html, links (JSONB), screenshot, metadata

**When saved**: Automatically when Firecrawl sends webhook events (batch/crawl only, NOT single scrape)

---

## Critical Gap #1: Single-URL Scrape Missing from Webhook DB

| Step | Action | Result |
|------|--------|--------|
| 1 | User calls `scrape(url)` via MCP | ✓ Request received |
| 2 | MCP calls WebhookBridgeClient | ✓ Routed to webhook |
| 3 | Webhook creates CrawlSession | ✓ DB entry created |
| 4 | Webhook proxies to Firecrawl | ✓ Scrape executed |
| 5 | Firecrawl returns content | ✓ Content available |
| 6 | Webhook returns to MCP | ✓ User gets content |
| 7 | MCP saves to local storage | ✓ Saved locally |
| 8 | Firecrawl sends webhook event? | **✗ NO** (single scrape) |
| 9 | Content saved to webhook DB? | **✗ NO** |

**Why**: Firecrawl only sends webhook events for batch and multi-page operations. Single scrapes return inline and don't trigger webhooks.

**Impact**: Content is searchable via MCP search tool but NOT via webhook API.

---

## Critical Gap #2: Storage Silos

| Backend | Trigger | Transport | Visibility | Searchable |
|---------|---------|-----------|------------|------------|
| **MCP** | User action (scrape call) | Memory/disk/postgres | Local to MCP | MCP search tool only |
| **Webhook** | Automatic (webhook events) | PostgreSQL | Cross-service | Webhook API only |

**Problem**: No synchronization. Content stored in one backend is invisible to the other.

---

## What's Actually Stored

### For Single-URL Scrape
- **MCP**: ✓ raw HTML, cleaned markdown, extracted JSON
- **Webhook**: ✗ Nothing (no webhook event from Firecrawl)

### For Multi-Page Crawl
- **MCP**: ✗ Nothing (not stored directly)
- **Webhook**: ✓ markdown, html, links per page

### Result
- Can search webhook DB for crawl results ✓
- Can search webhook DB for single-URL scrape results ✗
- Can search MCP storage for scrape results ✓
- Can search MCP storage for crawl results ✗

---

## Content Format Mismatch

**MCP stores**:
```
{
  url,
  source,
  timestamp,
  extract,           // The query used for extraction
  contentLength,
  startIndex,
  maxChars,
  wasTruncated,
  contentType
}
```

**Webhook stores**:
```
{
  url,
  source_url,
  content_source,    // "firecrawl_scrape" | "firecrawl_crawl" | "firecrawl_batch"
  markdown,
  html,
  links,
  screenshot,
  extra_metadata {
    statusCode,
    openGraph,
    dublinCore,
    language,
    country,
    ...
  },
  content_hash
}
```

**Issue**: Different schemas. Can't query across both backends.

---

## Environment Configuration

```bash
# MCP Storage Backend Selection
MCP_RESOURCE_STORAGE="memory"  # or "filesystem" or "postgres"

# For Filesystem Storage
MCP_RESOURCE_FILESYSTEM_ROOT="/path/to/resources"

# For Postgres Storage (if enabled)
# Uses same DATABASE_URL as webhook service

# Webhook Bridge URL (used by MCP)
MCP_WEBHOOK_BASE_URL="http://pulse_webhook:52100"

# Webhook Service
WEBHOOK_DATABASE_URL="postgresql://user:pass@pulse_postgres:5432/pulse"
```

**Current Status**: MCP_RESOURCE_STORAGE defaults to "memory" (volatile on restart)

---

## Key Code Snippets

### MCP Saves Content
```typescript
// apps/mcp/tools/scrape/pipeline.ts line 450
export async function saveToStorage(
  url: string,
  rawContent: string,
  cleanedContent: string | undefined,
  extractedContent: string | undefined,
  extract: string | undefined,
  source: string,
  startIndex: number,
  maxChars: number,
  wasTruncated: boolean
): Promise<{ raw?: string; cleaned?: string; extracted?: string } | null> {
  const storage = await ResourceStorageFactory.create();
  const uris = await storage.writeMulti({
    url,
    raw: rawContent,
    cleaned: cleanedContent,
    extracted: extractedContent,
    metadata: { url, source, timestamp, extract, ... }
  });
  return uris;
}
```

### Webhook Saves Content
```python
# apps/webhook/services/content_storage.py line 20
async def store_scraped_content(
    session: AsyncSession,
    crawl_session_id: str,
    url: str,
    document: dict[str, Any],
    content_source: str
) -> ScrapedContent:
    markdown = document.get("markdown", "")
    html = document.get("html")
    content_hash = hashlib.sha256(markdown.encode("utf-8")).hexdigest()
    
    # INSERT ... ON CONFLICT handles deduplication
    stmt = pg_insert(ScrapedContent).values(
        crawl_session_id=crawl_session_id,
        url=url,
        markdown=markdown,
        html=html,
        content_source=content_source,
        content_hash=content_hash,
        ...
    ).on_conflict_do_nothing(
        constraint='uq_content_per_session_url'
    ).returning(ScrapedContent)
```

### MCP Calls Webhook
```typescript
// apps/mcp/server.ts line 179
async scrape(
  url: string,
  options?: Record<string, unknown>
): Promise<{ success: boolean; data?; error? }> {
  const response = await fetch(`${this.baseUrl}/v2/scrape`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, ...options })
  });
  return response.json();
}
```

---

## What's NOT Being Saved

### In MCP Storage
- Links (extracted URLs)
- Screenshots (not persisted)
- Deduplication (each variant stored separately)

### In Webhook Storage
- Single-URL scrape content (no webhook event)
- LLM extraction results (local only)
- Cleaned variants (different processors)

### Entirely Missing
- Change tracking (version history)
- Content diffs (what changed)
- Extraction history (previous results)
- Unified search (across backends)

---

## How to Fix (Priority Order)

### Priority 1: Sync Single Scrapes
**What**: Modify `saveToStorage()` to also insert into webhook DB
**Files**: `/compose/pulse/apps/mcp/tools/scrape/pipeline.ts` (line 450)
**Benefit**: Single scrapes become searchable via webhook API

### Priority 2: Enable Shared Postgres
**What**: Set `MCP_RESOURCE_STORAGE=postgres` in `.env`
**Benefit**: Automatic synchronization between MCP and webhook

### Priority 3: Unify Schemas
**What**: Create migration layer to convert MCP variants to webhook format
**Benefit**: Single unified storage backend

### Priority 4: Auto-Index
**What**: Call webhook indexing API from `saveToStorage()`
**Benefit**: All content automatically searchable

### Priority 5: Change Tracking
**What**: Add `content_history` table to track versions
**Benefit**: User can see what changed between scrapes

---

## Test Cases to Verify

1. Single-URL scrape: Is content in webhook DB? ✗ (should be ✓)
2. Multi-page crawl: Is content in webhook DB? ✓ (working)
3. Crawl + scrape: Can search both? ✗ (different backends)
4. Content updated: Is old version preserved? ✗ (no history)
5. Single scrape searchable via webhook API? ✗ (missing data)

---

## Database Schema (Key Tables)

```
webhook.crawl_sessions (Parent)
├─ id (PK, UUID)
├─ job_id (STRING, UNIQUE) ← Matches Firecrawl job_id
├─ operation_type (STRING) ← "scrape", "crawl", "batch", "map", "search"
├─ base_url (STRING)
├─ status (STRING) ← "in_progress", "completed", "failed"
└─ timestamps (started_at, completed_at, initiated_at)

webhook.scraped_content (Child)
├─ id (PK, BIGINT)
├─ crawl_session_id (FK) ← Links to crawl_sessions.job_id
├─ url (TEXT)
├─ markdown (TEXT)
├─ html (TEXT)
├─ links (JSONB)
├─ content_hash (STRING, SHA256)
└─ Constraint: uq_content_per_session_url (crawl_session_id + url + hash)
```

---

## Files You Need to Understand

**Must Read**:
- `/compose/pulse/apps/mcp/tools/scrape/handler.ts` (entry point)
- `/compose/pulse/apps/mcp/tools/scrape/pipeline.ts` (saveToStorage)
- `/compose/pulse/apps/webhook/services/webhook_handlers.py` (page event handler)
- `/compose/pulse/apps/webhook/services/content_storage.py` (storage logic)

**Should Skim**:
- `/compose/pulse/apps/mcp/server.ts` (WebhookBridgeClient)
- `/compose/pulse/apps/webhook/api/routers/firecrawl_proxy.py` (proxy logic)
- `/compose/pulse/apps/webhook/domain/models.py` (database models)

---

## Executive Summary

You have **two separate content storage systems**:

1. **MCP Local Storage** (user-initiated, manual indexing)
   - Stores scrape results locally
   - Invisible to webhook service
   - Not automatically indexed

2. **Webhook Persistent Storage** (automatic, webhook-triggered)
   - Stores crawl/batch results
   - Visible across services
   - Auto-indexed

**The Problem**: Single-URL scrapes via MCP are stored locally but NOT in the webhook database, so they can't be searched via the webhook search API.

**The Fix**: Have `saveToStorage()` also insert into `webhook.scraped_content` table, and/or enable shared PostgreSQL storage for both systems.

---

Generated: 2025-11-15
