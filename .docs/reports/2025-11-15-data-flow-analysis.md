# Complete Data Flow: MCP Scrape Tool → Webhook Storage

## Overview

The data flow has **TWO INDEPENDENT STORAGE PATHS**:

1. **MCP Local Storage** (TypeScript): saveToStorage() → ResourceStorageFactory
2. **Webhook Persistent Storage** (Python): webhooks → store_content_async() → PostgreSQL

These are **COMPLETELY SEPARATE** and do NOT automatically synchronize.

---

## Complete Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ MCP CLIENT (Claude Code / External Tool User)                  │
└──────────────┬──────────────────────────────────────────────────┘
               │ scrape(url, ..., resultHandling)
               ▼
┌──────────────────────────────────────────────────────────────────┐
│ MCP SCRAPE TOOL (handleScrapeRequest)                           │
│ apps/mcp/tools/scrape/handler.ts                                │
├──────────────────────────────────────────────────────────────────┤
│ 1. Parse/validate args with Zod schema                         │
│ 2. Check for cached resources (checkCache)                     │
│ 3. Scrape content (scrapeContent)                              │
│ 4. Process content (processContent)                            │
│    ├─ Clean HTML → Markdown (if cleanScrape=true)             │
│    └─ Extract structured data (if extract provided)           │
│ 5. Save to local storage (if resultHandling != "returnOnly")  │
│ 6. Format & return response                                   │
└──────────────┬──────────────────────────────────────────────────┘
               │
        ┌──────┴──────────────────────────┐
        │                                  │
        ▼ (resultHandling={save*})        │
        │                                  │ (resultHandling=returnOnly)
   ┌────┴──────────────────┐              │
   │  saveToStorage()       │              │
   │ (apps/mcp/tools/scrape/│              │
   │  pipeline.ts line 450) │              │
   └────────┬──────────────┘              │
            │                             │
            ▼                             │
   ┌────────────────────────────────────┐│
   │ ResourceStorageFactory.create()    ││
   │ (apps/mcp/storage/factory.ts)      ││
   └────────┬─────────────────────────┬─┘│
            │                         │  │
    ┌───────┴──────────┬────────┬─────┴──┴─────┐
    │                  │        │              │
    ▼                  ▼        ▼              │
 MEMORY          FILESYSTEM  POSTGRES    (return response)
 (default)      (from env)   (optional)
 
 Each stores:
 - raw HTML
 - cleaned markdown (if cleanScrape)
 - extracted data (if extract)
 
 Metadata stored:
 - url
 - timestamp
 - source ("firecrawl", etc)
 - extract query (if provided)
 - contentLength, startIndex, maxChars
```

---

## PATH 1: MCP LOCAL STORAGE (saveToStorage)

### Function Signature
```typescript
async function saveToStorage(
  url: string,
  rawContent: string,
  cleanedContent: string | undefined,
  extractedContent: string | undefined,
  extract: string | undefined,
  source: string,
  startIndex: number,
  maxChars: number,
  wasTruncated: boolean
): Promise<{ raw?: string; cleaned?: string; extracted?: string } | null>
```

### Location
- **apps/mcp/tools/scrape/pipeline.ts** (lines 450-486)

### What Gets Saved

Called in `handleScrapeRequest()` (lines 198-208):
```typescript
savedUris = await saveToStorage(
  url,
  rawContent,        // ← Raw HTML from Firecrawl/native scraper
  cleaned,           // ← Markdown (if cleanScrape=true)
  extracted,         // ← Structured JSON (if extract provided)
  extract,           // ← The extraction query/schema used
  source,            // ← "firecrawl" or "native"
  startIndex,
  maxChars,
  wasTruncated
);
```

### Storage Implementation (3 backends)

**Storage Type Selection** (apps/mcp/storage/factory.ts):
- Env var: `MCP_RESOURCE_STORAGE` (default: "memory")
- Options: "memory", "filesystem", "postgres"

#### Backend 1: Memory Storage
**apps/mcp/storage/memory.ts**
- Stores resources in `Map<string, Resource>` (TTL-based)
- **VOLATILE**: Lost on server restart
- **No database interaction**

#### Backend 2: Filesystem Storage
**apps/mcp/storage/filesystem.ts**
- Writes to disk at `MCP_RESOURCE_FILESYSTEM_ROOT`
- URIs: `scraped://domain.com/article_2024-01-15T10:30:00Z`
- Folder structure:
  ```
  resources/
  ├── raw/
  │   └── domain.com/
  │       └── article_2024-01-15T10:30:00Z.txt
  ├── cleaned/
  │   └── domain.com/
  │       └── article_2024-01-15T10:30:00Z.txt
  └── extracted/
      └── domain.com/
          └── article_2024-01-15T10:30:00Z.json
  ```
- **Persistent but local only**
- **No cross-service access**

#### Backend 3: Postgres Storage
**apps/mcp/storage/postgres.ts**
- Connects via `PostgresResourceStorage`
- **Requires database URL env var**
- **Can theoretically be shared with webhook service**
- **NOT currently enabled** (MCP_RESOURCE_STORAGE not set to "postgres" in .env)

### Metadata Stored (via writeMulti)
```typescript
{
  url,                    // Source URL
  source,                 // "firecrawl" or "native"
  timestamp,              // ISO string
  extract,                // Query if extraction used
  contentLength,          // Raw HTML length
  startIndex,             // Pagination start
  maxChars,               // Pagination limit
  wasTruncated,           // Was response truncated
  contentType,            // HTML or markdown
}
```

### When Saved
- **Trigger**: User calls scrape with `resultHandling != "returnOnly"`
- **Options**: "saveAndReturn" (default) or "saveOnly"
- **NOT saved**: If `resultHandling="returnOnly"` or screenshot requested

---

## PATH 2: WEBHOOK → FIRECRAWL PROXY → CONTENT STORAGE

This path is **AUTOMATIC** when using MCP's `WebhookBridgeClient` for scraping.

### Step 1: MCP Calls WebhookBridgeClient.scrape()

**Location**: apps/mcp/server.ts (lines 179-223)

```typescript
async scrape(
  url: string,
  options?: Record<string, unknown>,
): Promise<{
  success: boolean;
  data?: { content, markdown, html, ... };
  error?: string;
}> {
  const response = await fetch(`${this.baseUrl}/v2/scrape`, {
    method: "POST",
    body: JSON.stringify({ url, ...options })
  });
  return response.json();
}
```

**Config**: 
- `baseUrl` = `MCP_WEBHOOK_BASE_URL` (default: `http://pulse_webhook:52100`)
- Set in `createMCPServer()` factory (line 488)

### Step 2: Webhook Proxy Endpoint

**Location**: apps/webhook/api/routers/firecrawl_proxy.py (lines 205-210)

```python
@router.post("/v2/scrape")
async def scrape_url(request: Request, db: AsyncSession = Depends(get_db_session)) -> Response:
    """Single URL scrape → proxy + session tracking + auto-index"""
    return await proxy_with_session_tracking(
        request, "/scrape", "scrape", db, "POST"
    )
```

**Proxy Flow**:
1. Receives POST from MCP with `{ url, formats, ... }`
2. **Does NOT persist request body** (only logged in debug mode)
3. Proxies to internal Firecrawl API: `http://firecrawl:3002/v2/scrape`
4. Gets response from Firecrawl
5. **If 2xx status**: Creates `CrawlSession` in DB
6. Adds `_webhook_meta` to response
7. Returns response to MCP

**CrawlSession Creation** (lines 61-101):
```python
# Extract job_id from response
job_id = response_data.get("id") or response_data.get("jobId")

if job_id:
    base_url = request_body.get("url") or request_body.get("urls", [""])[0]
    
    await create_crawl_session(
        db=db,
        job_id=job_id,
        operation_type="scrape",        # ← Single scrape
        base_url=base_url,
        auto_index=True,                # ← Auto-index enabled
        extra_metadata={"request": request_body}
    )
```

**KEY POINT**: The **MCP-initiated scrape response is returned immediately**. Content is NOT stored at this point yet.

### Step 3: Firecrawl Executes Scrape

The actual Firecrawl container processes the scrape request independently.

### Step 4: Firecrawl Posts Webhook Event

**Event Type**: Based on operation
- Single scrape: Firecrawl doesn't send page event (single URL)
- Batch scrape: Sends `batch_scrape.page` event
- Crawl: Sends `crawl.page` event

**Webhook Endpoint**: apps/webhook/api/routers/webhook.py
```python
@router.post("/api/webhook/...")
async def handle_webhook(event: FirecrawlPageEvent | FirecrawlLifecycleEvent):
    # Triggers handle_firecrawl_event()
```

### Step 5: Page Event Handler Stores Content

**Location**: apps/webhook/services/webhook_handlers.py (lines 71-221)

```python
async def _handle_page_event(event: FirecrawlPageEvent, queue: Queue) -> dict:
    """Process crawl page events with crawl_id propagation."""
    
    crawl_id = event.id                          # Job ID
    documents = _coerce_documents(event.data)    # Page data
    
    # ↓ NEW: Fire-and-forget async storage (lines 110-116)
    asyncio.create_task(
        store_content_async(
            crawl_session_id=crawl_id,
            documents=document_dicts,
            content_source=_detect_content_source(event_type)
        )
    )
    
    # Also queue indexing jobs (separate from storage)
    for document in documents:
        queue.enqueue("worker.index_document_job", ...)
```

**Content Storage Call** (lines 102-116):
```python
content_source = _detect_content_source(event_type)
document_dicts = [_document_to_dict(doc) for doc in documents]

asyncio.create_task(
    store_content_async(
        crawl_session_id=crawl_id,
        documents=document_dicts,
        content_source=content_source
    )
)
```

**Async Storage** (apps/webhook/services/content_storage.py, lines 88-144):

```python
async def store_content_async(
    crawl_session_id: str,
    documents: list[dict[str, Any]],
    content_source: str
) -> None:
    """Fire-and-forget async storage of content with metrics tracking."""
    
    async with TimingContext(...) as ctx:
        try:
            async with get_db_context() as session:
                for document in documents:
                    url = document.get("metadata", {}).get("sourceURL", "")
                    
                    # ↓ This is where content is ACTUALLY STORED
                    await store_scraped_content(
                        session=session,
                        crawl_session_id=crawl_session_id,
                        url=url,
                        document=document,
                        content_source=content_source
                    )
                    stored_count += 1
```

### Step 6: Store in ScrapedContent Table

**Location**: apps/webhook/services/content_storage.py (lines 20-85)

**Table**: `webhook.scraped_content`

**Columns**:
```python
crawl_session_id    # FK to crawl_sessions.job_id (STRING, not UUID!)
url                 # Original URL
source_url          # Firecrawl metadata.sourceURL
content_source      # "firecrawl_scrape" | "firecrawl_batch" | "firecrawl_crawl"
markdown            # Converted HTML to markdown
html                # Original Firecrawl HTML
links               # JSONB array of links
screenshot          # Base64 screenshot (if provided)
extra_metadata      # JSONB: statusCode, openGraph, dublinCore, etc.
content_hash        # SHA256(markdown) for dedup
scraped_at          # When Firecrawl scraped it
created_at          # When stored in DB
updated_at          # Last modified
```

**Insertion Logic** (INSERT ON CONFLICT):
```python
# Unique constraint: uq_content_per_session_url
# (crawl_session_id, url, content_hash)

stmt = pg_insert(ScrapedContent).values(...).on_conflict_do_nothing(
    constraint='uq_content_per_session_url'
).returning(ScrapedContent)

result = await session.execute(stmt)
content = result.scalar_one_or_none()

if content:
    # New insert successful
    return content
else:
    # Duplicate - return existing
    existing = await session.execute(
        select(ScrapedContent).where(
            crawl_session_id == crawl_session_id,
            url == url,
            content_hash == content_hash
        )
    )
    return existing.scalar_one()
```

**Content Source Detection** (lines 508-524):
```python
def _detect_content_source(event_type: str | None) -> str:
    if event_type == "crawl.page":
        return "firecrawl_crawl"
    elif event_type == "batch_scrape.page":
        return "firecrawl_batch"
    else:
        return "firecrawl_unknown"
```

---

## CRITICAL GAPS & DUPLICATION

### Gap 1: Single-URL Scrape NOT Stored in Webhook DB

**Scenario**: User calls MCP scrape with single URL via WebhookBridgeClient

**What Happens**:
1. MCP sends POST /v2/scrape to webhook
2. Webhook **creates CrawlSession** with job_id
3. Webhook **proxies to Firecrawl**
4. Firecrawl executes scrape ✓
5. Firecrawl returns result ✓
6. Webhook returns to MCP ✓
7. **MISSING**: Firecrawl doesn't send webhook event for single scrapes
8. **RESULT**: Content is NOT stored in `scraped_content` table ✗

**Why**: Single scrapes don't trigger Firecrawl webhooks. Webhooks are only sent for:
- Batch operations (batch_scrape.page, batch_scrape.completed)
- Multi-page crawls (crawl.page, crawl.completed)
- Extractions (extract.page, extract.completed)

### Gap 2: MCP Storage is Invisible to Webhook Service

**Scenario**: User saves scrape result locally in MCP

**What Happens**:
1. MCP scrape tool calls `saveToStorage()` ✓
2. Content stored in **MCP storage** (memory/filesystem) ✓
3. Webhook service **has NO ACCESS** to this data ✗
4. Webhook cannot search/index this content ✗

**Why**: 
- MCP uses ResourceStorageFactory (memory/filesystem/postgres)
- Webhook uses PostgreSQL `scraped_content` table
- No synchronization between them

### Gap 3: Different Content Formats Stored

**MCP Storage saves**:
- Raw HTML (from scraper)
- Cleaned markdown (if cleanScrape=true)
- Extracted JSON (if extract provided)
- **No deduplication** (each variant stored separately)

**Webhook Storage saves**:
- Markdown (from Firecrawl payload)
- HTML (from Firecrawl payload)
- Links (JSONB array)
- Screenshot (base64)
- **Deduplicated** by content_hash (SHA256 of markdown)

**Result**: Different content schemas! Webhook can't search MCP content.

### Gap 4: Webhook Auto-Indexing is Optional

**For webhook-stored content**:
- `auto_index=True` by default (line 83, firecrawl_proxy.py)
- Content goes to embedding/search pipelines

**For MCP-only storage**:
- Content stays in local storage
- User must manually call webhook search API
- No automatic indexing

### Gap 5: Metadata Mismatch

**MCP saves**:
- url, source, timestamp, extract, contentLength, startIndex, maxChars, wasTruncated, contentType

**Webhook saves**:
- url, source_url, content_source, statusCode, openGraph, dublinCore, language, country, etc.

**Result**: Different queries needed for different backends.

---

## CONTENT VARIANTS NOT BEING SAVED

### Missing in MCP Storage
- ✗ **Links** (extracted URLs) - MCP doesn't store these
- ✗ **Screenshot** - MCP doesn't persist unless saved separately
- ✗ **Deduplication** - Each variant stored independently

### Missing in Webhook Storage
- ✗ **Raw HTML** for single scrapes (no webhook event sent)
- ✗ **Extraction results** (Firecrawl extract operation needed)
- ✗ **Cleaned content variants** (Firecrawl doesn't send markdown cleaning)
- ✗ **Custom extraction schemas** (not passed through webhook)

### Missing Entirely
- ✗ **Change tracking** (is content different from previous scrape?)
- ✗ **Content diff** (what changed between versions?)
- ✗ **Extraction results for MCP scrapes** (extraction is local, not in webhook)
- ✗ **Cleaning results for webhook scrapes** (Firecrawl markdown isn't the same as MCP cleaned)

---

## DATA FLOW DIAGRAM (TEXT)

```
CALL 1: User scrapes via MCP with WebhookBridgeClient
┌─────────────────────────────────────────────────────────┐
│ Claude Code User                                        │
│ scrape("https://example.com", resultHandling="saveAndReturn")
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
         ┌──────────────────────────┐
         │ MCP Scrape Tool          │
         │ (handler.ts)             │
         └───────────┬──────────────┘
                     │
                     ├─→ checkCache() ← checks MCP storage
                     │
                     └─→ scrapeContent()
                            │
                            ├─→ scrapeWithStrategy()
                            │   (uses Firecrawl via WebhookBridgeClient)
                            │
                            └─→ Calls: POST http://pulse_webhook:52100/v2/scrape
                                      │
                                      ▼
                                ┌──────────────────────────────────────┐
                                │ Webhook Proxy (firecrawl_proxy.py)   │
                                │                                      │
                                │ 1. Create CrawlSession               │
                                │ 2. Proxy to Firecrawl API            │
                                │ 3. Return response                   │
                                └──────┬───────────────────────────────┘
                                       │
                                       ├─→ Creates CrawlSession (DB)
                                       │   (job_id, base_url, operation_type="scrape")
                                       │
                                       ├─→ Proxies to http://firecrawl:3002/v2/scrape
                                       │
                                       ▼
                                ┌──────────────────────────────────────┐
                                │ Firecrawl API (Container)            │
                                │ - Renders page                       │
                                │ - Extracts content                   │
                                │ - Returns HTML/markdown              │
                                └──────┬───────────────────────────────┘
                                       │
                                       └─→ Response back through proxy
                                           (NOT a webhook event for single scrape!)
                                
         MCP receives Firecrawl response
         │
         ├─→ processContent()
         │   ├─ cleanScrape: HTML → Markdown
         │   └─ extract: LLM extraction (if provided)
         │
         └─→ saveToStorage()
             │
             ├─→ Checks MCP_RESOURCE_STORAGE
             │
             └─→ Stores in:
                 ├─ Memory (default, volatile)
                 ├─ Filesystem (disk-based)
                 └─ Postgres (if enabled, not default)

RESULT: 
  ✓ Content returned to MCP user
  ✓ CrawlSession created in webhook DB
  ✗ Content NOT stored in webhook.scraped_content (no webhook event!)
  ✓ Content stored in MCP storage (if resultHandling != "returnOnly")
  ✗ Content NOT indexed by webhook search


────────────────────────────────────────────────────────────────


CALL 2: Multi-page crawl with webhooks
┌─────────────────────────────────────────────────────────┐
│ Claude Code User                                        │
│ crawl("https://example.com", limit=10)                  │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
         ┌──────────────────────────┐
         │ MCP Crawl Tool           │
         │ (crawl/handler.ts)       │
         └───────────┬──────────────┘
                     │
                     └─→ startCrawl() via WebhookBridgeClient
                            │
                            └─→ POST http://pulse_webhook:52100/v2/crawl
                                      │
                                      ▼
                                ┌──────────────────────────────────────┐
                                │ Webhook Proxy (firecrawl_proxy.py)   │
                                │ (lines 245-250)                      │
                                │                                      │
                                │ 1. Create CrawlSession               │
                                │ 2. Proxy to Firecrawl                │
                                │ 3. Return job_id                     │
                                └──────┬───────────────────────────────┘
                                       │
                                       ├─→ Creates CrawlSession
                                       │   (job_id, base_url, operation_type="crawl")
                                       │
                                       └─→ Proxies to http://firecrawl:3002/v2/crawl
                                           │
                                           ▼
                                      ┌──────────────────────────┐
                                      │ Firecrawl starts crawl   │
                                      │ Returns job_id           │
                                      └──────┬───────────────────┘
                                             │
         MCP returns job_id to user ←────────┘
         (user can check status, cancel, etc.)

BACKGROUND: Firecrawl crawls pages and posts webhooks
         │
         ├─→ Webhook Event: crawl.started
         │   └─→ _record_crawl_start() (line 232)
         │
         ├─→ Webhook Event: crawl.page (for each page)
         │   │
         │   └─→ _handle_page_event() (line 71)
         │       │
         │       ├─→ asyncio.create_task(store_content_async())
         │       │   │
         │       │   ├─→ Gets DB context
         │       │   │
         │       │   └─→ For each document:
         │       │       └─→ store_scraped_content()
         │       │           │
         │       │           └─→ INSERT ... ON CONFLICT DO NOTHING
         │       │               ├─ crawl_session_id (FK)
         │       │               ├─ url
         │       │               ├─ markdown
         │       │               ├─ html
         │       │               ├─ links (JSONB)
         │       │               ├─ screenshot
         │       │               ├─ extra_metadata (JSONB)
         │       │               └─ content_hash (dedup)
         │       │
         │       └─→ Fire indexing jobs to Redis queue
         │           (separate from storage)
         │
         └─→ Webhook Event: crawl.completed
             └─→ _record_crawl_complete() (line 325)
                 ├─ Update CrawlSession.status = "completed"
                 ├─ Calculate total_pages, pages_indexed
                 └─ Aggregate timing metrics

RESULT:
  ✓ Job_id returned to MCP immediately
  ✓ Crawl happens asynchronously
  ✓ Each page stored in webhook.scraped_content
  ✓ Each page indexed (if auto_index=true)
  ✗ MCP doesn't have access to per-page content
  ✗ MCP storage is NOT updated (different backend)
```

---

## SUMMARY TABLE

| Aspect | MCP Storage | Webhook Storage | Synchronized? |
|--------|-------------|-----------------|---------------|
| **Trigger** | User calls scrape with save* | Firecrawl webhook events | NO |
| **Transport** | ResourceStorageFactory (local) | PostgreSQL (persistent) | NO |
| **Scope** | Single requests (user-initiated) | All operations (auto-tracked) | NO |
| **Content Types** | raw, cleaned, extracted | markdown, html, links, screenshot | Different |
| **Deduplication** | None | content_hash (SHA256) | Different |
| **Indexing** | Manual (via search tool) | Automatic (if auto_index=true) | NO |
| **Query Capability** | MCP search tool | Webhook search API | NO |
| **Single-URL Scrape** | ✓ Stored (if resultHandling != "returnOnly") | ✗ Not stored (no webhook event) | NO |
| **Multi-URL Crawl** | ✗ Not stored directly | ✓ Stored per-page | NO |
| **Metadata** | Extraction query, pagination | Firecrawl metadata (OG, DC, etc) | Different |

---

## ACTION ITEMS TO FIX GAPS

1. **Sync MCP scrapes to webhook DB**: Have `saveToStorage()` also insert into `scraped_content`
2. **Enable postgres storage**: Set `MCP_RESOURCE_STORAGE=postgres` and use shared DB
3. **Unify content schemas**: Convert MCP variants to webhook schema
4. **Auto-index MCP content**: Trigger indexing from saveToStorage()
5. **Track change history**: Store diffs between scrape versions
6. **Store extraction results**: Save LLM extraction in webhook table
7. **Cache webhook content in MCP**: Hydrate MCP storage from webhook DB on startup

