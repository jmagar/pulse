# Firecrawl Persistence Service Research: Webhook Bridge Integration Patterns

## Summary

The webhook bridge **already captures Firecrawl metadata and tracks operations extensively**, but **does NOT persist actual content** (markdown, HTML). Content flows through the indexing pipeline and is stored in **Qdrant (vectors) and BM25 (keywords)** only. The webhook bridge provides comprehensive session tracking, metrics collection, and a proven integration pattern that can be extended for full content persistence.

**Key Finding:** Extend webhook bridge with PostgreSQL content storage rather than building a separate service.

## Key Components

### Session & Metrics Tracking
- `/compose/pulse/apps/webhook/services/crawl_session.py` - CrawlSession lifecycle management (create, update status, track progress)
- `/compose/pulse/apps/webhook/domain/models.py` - Data models: CrawlSession, OperationMetric, RequestMetric
- `/compose/pulse/apps/webhook/services/webhook_handlers.py` - Webhook event processing (page events, lifecycle events)
- `/compose/pulse/apps/webhook/api/routers/metrics.py` - Metrics query API (crawl analytics, operation timings)

### Firecrawl Integration
- `/compose/pulse/apps/webhook/api/routers/firecrawl_proxy.py` - **Unified v2 API proxy** with auto session tracking
- `/compose/pulse/apps/webhook/api/schemas/webhook.py` - Firecrawl webhook schemas (FirecrawlDocumentPayload, FirecrawlPageEvent)
- `/compose/pulse/apps/webhook/api/schemas/indexing.py` - IndexDocumentRequest schema (what gets indexed)

### Content Processing Pipeline
- `/compose/pulse/apps/webhook/services/indexing.py` - Orchestrates chunking → embedding → Qdrant → BM25 indexing
- `/compose/pulse/apps/webhook/worker.py` - Background job processor (Redis queue)
- `/compose/pulse/apps/webhook/services/vector_store.py` - Qdrant client (stores chunk vectors only)
- `/compose/pulse/apps/webhook/services/bm25_engine.py` - Keyword search engine (stores tokenized text only)

## Implementation Patterns

### 1. **Firecrawl Proxy with Auto Session Tracking**

**Pattern:** Transparent proxy that intercepts Firecrawl API calls and creates database sessions automatically.

**Implementation** (`firecrawl_proxy.py:31-112`):
```python
async def proxy_with_session_tracking(
    request: Request,
    endpoint_path: str,
    operation_type: str,  # scrape, crawl, map, search, extract
    db: AsyncSession,
    method: str = "POST",
) -> Response:
    # 1. Cache request body
    request_body = await request.json()

    # 2. Proxy to Firecrawl API
    response = await proxy_to_firecrawl(request, endpoint_path, method)

    # 3. If successful, create CrawlSession
    if 200 <= response.status_code < 300:
        response_data = json.loads(response.body)
        job_id = response_data.get("id") or response_data.get("jobId")

        if job_id:
            await create_crawl_session(
                db=db,
                job_id=job_id,
                operation_type=operation_type,
                base_url=request_body.get("url"),
                auto_index=True,
                extra_metadata={"request": request_body}
            )

            # Add metadata to response
            response_data["_webhook_meta"] = {
                "session_created": True,
                "auto_index": True,
            }

    return response
```

**Supported Endpoints:**
- POST `/v2/scrape` → session tracking
- POST `/v2/batch/scrape` → session tracking
- POST `/v2/crawl` → session tracking
- POST `/v2/map` → session tracking
- POST `/v2/search` → session tracking
- POST `/v2/extract` → session tracking
- GET `/v2/{operation}/{job_id}` → simple proxy (no tracking)

### 2. **Webhook Event Processing with Content Extraction**

**Pattern:** Webhook receives page events from Firecrawl, extracts content, and queues for indexing.

**Implementation** (`webhook_handlers.py:69-203`):
```python
async def _handle_page_event(event: FirecrawlPageEvent, queue: Queue):
    # Extract job_id (used as crawl_id)
    crawl_id = event.id

    # Parse documents from event.data
    documents = [FirecrawlDocumentPayload.model_validate(doc) for doc in event.data]

    # Queue each document for indexing
    for document in documents:
        index_payload = {
            "url": document.metadata.url,
            "title": document.metadata.title,
            "description": document.metadata.description,
            "markdown": document.markdown,  # <-- CONTENT HERE
            "html": document.html,           # <-- CONTENT HERE
            "statusCode": document.metadata.status_code,
            "crawl_id": crawl_id,            # <-- SESSION TRACKING
        }

        # Enqueue to Redis for background processing
        queue.enqueue("worker.index_document_job", index_payload)

    return {"status": "queued", "job_ids": [...]}
```

**Lifecycle Events** (`webhook_handlers.py:206-407`):
- `crawl.started` → Create CrawlSession with `status="in_progress"`
- `crawl.page` → Process and queue documents
- `crawl.completed` → Update session, aggregate metrics from OperationMetric table

### 3. **CrawlSession Data Model**

**Pattern:** Track complete operation lifecycle with aggregate metrics.

**Schema** (`models.py:117-182`):
```python
class CrawlSession(Base):
    __tablename__ = "crawl_sessions"
    __table_args__ = {"schema": "webhook"}

    # Identification
    id: UUID (primary key)
    job_id: str (unique, from Firecrawl API)
    base_url: str
    operation_type: str  # scrape, crawl, map, search, extract

    # Lifecycle
    started_at: datetime
    completed_at: datetime | None
    status: str  # pending, in_progress, completed, failed
    success: bool | None

    # Statistics (URL-based, v2 API)
    total_urls: int
    completed_urls: int
    failed_urls: int

    # Legacy statistics (page-based, v1 API)
    total_pages: int
    pages_indexed: int
    pages_failed: int

    # Aggregate timing (milliseconds)
    total_chunking_ms: float
    total_embedding_ms: float
    total_qdrant_ms: float
    total_bm25_ms: float
    duration_ms: float | None
    e2e_duration_ms: float | None  # Including API call overhead

    # Configuration
    auto_index: bool
    expires_at: datetime | None

    # Metadata
    extra_metadata: JSONB (stores original request params)
    error_message: str | None
```

**Update Flow** (`crawl_session.py:84-151`):
```python
async def update_crawl_session_status(
    db: AsyncSession,
    job_id: str,
    status: str,
    total_urls: int | None = None,
    completed_urls: int | None = None,
    success: bool | None = None,
    error_message: str | None = None,
):
    session = await get_crawl_session(db, job_id)
    session.status = status
    session.updated_at = datetime.now(UTC)

    # Set terminal timestamps
    if status in ("completed", "failed", "cancelled"):
        session.completed_at = datetime.now(UTC)
        session.duration_ms = (session.completed_at - session.started_at).total_seconds() * 1000

    await db.commit()
```

### 4. **Operation Metrics Collection**

**Pattern:** Record granular timing metrics for every operation, linked to crawl sessions.

**Schema** (`models.py:53-84`):
```python
class OperationMetric(Base):
    __tablename__ = "operation_metrics"
    __table_args__ = {"schema": "webhook"}

    id: UUID
    timestamp: datetime
    operation_type: str  # chunking, embedding, qdrant, bm25, worker
    operation_name: str  # chunk_text, embed_batch, index_chunks, index_document
    duration_ms: float
    success: bool
    error_message: str | None

    # Correlation IDs
    request_id: str | None  # HTTP request correlation
    job_id: str | None      # Worker job correlation
    crawl_id: str | None    # Firecrawl session correlation (FK to CrawlSession.job_id)
    document_url: str | None

    extra_metadata: JSONB
```

**Usage in Indexing Pipeline** (`indexing.py:104-119`):
```python
async with TimingContext(
    "chunking",           # operation_type
    "chunk_text",         # operation_name
    job_id=job_id,
    crawl_id=crawl_id,    # Links to CrawlSession
    document_url=document.url,
) as ctx:
    chunks = self.text_chunker.chunk_text(cleaned_markdown, metadata=chunk_metadata)
    ctx.metadata = {
        "chunks_created": len(chunks),
        "text_length": len(cleaned_markdown),
    }
# Automatically records OperationMetric row on exit
```

### 5. **Content Flow (Current State)**

**Current:** Content passes through but is NOT persisted in PostgreSQL.

```
Firecrawl API
    ↓ (webhook or proxy)
webhook_handlers.py
    ↓ (extract markdown/html)
IndexDocumentRequest
    ↓ (queue to Redis)
worker.py (index_document_job)
    ↓
indexing.py
    ├→ Chunk markdown → embeddings → Qdrant (vectors only)
    └→ Tokenize markdown → BM25 engine (keywords only)

RESULT: No full content retrieval possible
```

**Data Stored:**
- **Qdrant:** Chunk vectors (384-dim embeddings) + chunk metadata (url, title, text snippet)
- **BM25:** Tokenized keywords + metadata (url, title, domain)
- **PostgreSQL webhook schema:** Session tracking, metrics, NO content

## Considerations

### What Already Exists
1. **Comprehensive session tracking** - CrawlSession tracks every Firecrawl operation with full lifecycle
2. **Metrics collection** - OperationMetric captures timing for every indexing step
3. **Firecrawl integration** - Unified v2 proxy handles all operation types transparently
4. **Webhook event handling** - Processes page events and lifecycle events from Firecrawl
5. **Content extraction** - Already parses markdown/html from Firecrawl responses
6. **Job tracking** - Links crawl sessions to operation metrics via `crawl_id` foreign key

### What's Missing for Content Persistence
1. **Content storage table** - No PostgreSQL table to store markdown/html
2. **Content retrieval API** - No endpoint to fetch original scraped content
3. **Deduplication logic** - No handling for re-scrapes of same URL
4. **Retention policy** - No automatic cleanup of old content
5. **Compression** - No JSONB compression for large HTML/markdown payloads

### Critical Edge Cases
1. **Re-scraping same URL** - Need strategy: overwrite, version, or keep latest only
2. **Large documents** - HTML can be 5MB+, need compression or external storage (S3/MinIO)
3. **Batch operations** - `batch_scrape` can queue 1000+ documents, need bulk insert optimization
4. **Failed scrapes** - Handle partial results (some pages succeed, some fail)
5. **Webhook race conditions** - `crawl.page` events may arrive before `crawl.started`

### Database Schema Considerations
1. **Foreign key constraint** - Link content table to CrawlSession via `job_id`
2. **URL deduplication** - Index on `(url, scraped_at)` for efficient queries
3. **JSONB vs TEXT** - Store metadata as JSONB, content as TEXT (better compression)
4. **Partitioning** - Consider time-based partitioning for retention cleanup
5. **Full-text search** - PostgreSQL tsvector for backup search (if Qdrant fails)

## Next Steps

### Recommended Architecture: Extend Webhook Bridge

**Why extend vs. new service:**
- Webhook bridge already intercepts ALL Firecrawl traffic (proxy + webhooks)
- CrawlSession provides perfect tracking foundation
- OperationMetric already links operations to sessions
- Indexing pipeline already extracts and cleans content
- Avoids duplication of Firecrawl client code

**Implementation Plan:**

1. **Add Content Storage Model** (`domain/models.py`)
   ```python
   class ScrapedContent(Base):
       __tablename__ = "scraped_contents"
       __table_args__ = {"schema": "webhook"}

       id: UUID (PK)
       job_id: str (FK to CrawlSession.job_id, indexed)
       url: str (indexed)
       resolved_url: str

       # Content
       markdown: TEXT (compressed)
       html: TEXT (compressed)

       # Metadata
       title: str | None
       description: str | None
       status_code: int
       language: str | None
       scraped_at: datetime (indexed)

       # Deduplication
       content_hash: str (SHA256 of markdown, indexed)

       extra_metadata: JSONB
   ```

2. **Modify Indexing Pipeline** (`services/indexing.py`)
   - Insert content row BEFORE chunking/embedding
   - Record `content_id` in OperationMetric for linkage
   - Handle duplicate URLs (update or create new version)

3. **Add Content Retrieval API** (`api/routers/content.py`)
   ```python
   GET /api/content/{job_id}/{url}  # Get specific page from crawl
   GET /api/content/latest/{url}    # Get most recent scrape of URL
   GET /api/content/search?q=...    # Full-text search in PostgreSQL
   ```

4. **Implement Retention Policy** (`workers/retention.py`)
   - Delete content older than X days (configurable)
   - Keep CrawlSession and metrics (smaller footprint)
   - Run as scheduled job (daily/weekly)

5. **Add Compression** (`utils/compression.py`)
   - GZIP compress markdown/html before INSERT
   - Decompress on retrieval
   - Store compressed size in metadata for monitoring

### Alternative: External Blob Storage (S3/MinIO)

If content size is prohibitive (>100GB), consider:
- Store metadata in PostgreSQL
- Store content blobs in MinIO (S3-compatible, self-hosted)
- Reference blob URL in `ScrapedContent.blob_url`
- Use presigned URLs for retrieval

**Trade-offs:**
- Pro: Unlimited storage, cheaper at scale
- Con: Extra infrastructure, slower retrieval, backup complexity

### Estimated Effort

**Extend Webhook Bridge (Recommended):**
- Content model + migration: 2 hours
- Modify indexing pipeline: 4 hours
- Content retrieval API: 3 hours
- Retention worker: 2 hours
- Testing + docs: 4 hours
- **Total: ~15 hours**

**External Blob Storage:**
- MinIO setup: 2 hours
- S3 client integration: 3 hours
- Content upload/download: 4 hours
- Presigned URL handling: 2 hours
- Testing + docs: 4 hours
- **Total: ~15 hours**

Both approaches have similar effort, but webhook bridge extension is simpler operationally (no new infrastructure).

---

## References

**Existing Code:**
- `/compose/pulse/apps/webhook/api/routers/firecrawl_proxy.py` - Unified v2 proxy
- `/compose/pulse/apps/webhook/services/crawl_session.py` - Session management
- `/compose/pulse/apps/webhook/services/webhook_handlers.py` - Event processing
- `/compose/pulse/apps/webhook/services/indexing.py` - Indexing pipeline
- `/compose/pulse/apps/webhook/domain/models.py` - Data models

**Database Migrations:**
- `/compose/pulse/apps/webhook/alembic/versions/413191e2eb2c_create_crawl_sessions_table.py` - Latest session schema
- `/compose/pulse/apps/webhook/alembic/versions/57f2f0e22bad_add_timing_metrics_tables.py` - Metrics schema

**Recent Commits:**
- `d0f2d0e9` - Implemented unified Firecrawl v2 proxy with auto session tracking
- `525c9719` - Created session log for web containerization
