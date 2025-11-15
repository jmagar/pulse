# Implementation Plan: Complete Timing Instrumentation (FINAL)

**Date:** 2025-11-13 (Final revision after 2 rounds of agent verification)
**Status:** ✅ READY FOR IMPLEMENTATION
**Revision History:**
- v1: Original plan (task ordering issues)
- v2: Corrected plan (missing imports, FK, string lengths)
- **v3: FINAL** (all agent issues resolved)

---

## Agent Verification Summary

**Round 1 Issues:**
- ❌ Task ordering violations
- ❌ Missing `pages_crawled` field assumption
- ❌ Missing schemas

**Round 2 Issues:**
- ❌ Missing foreign key constraint
- ❌ String length mismatch (255 vs 100)
- ❌ Missing file-level imports (7 total)
- ❌ Missing test fixtures documentation

**All issues resolved in this final plan.**

---

## Pre-Implementation Checklist

Before starting, verify:
- [ ] Current branch: `main` (or create feature branch)
- [ ] Database migrations are up to date: `uv run alembic current`
- [ ] Webhook service is running: `docker ps | grep pulse_webhook`
- [ ] Tests pass: `cd apps/webhook && uv run pytest`

---

## Corrected Implementation Tasks

### **Phase 1: Database Schema Changes** (Non-Breaking)

#### Task 1.1: Create CrawlSession Model

**File:** `apps/webhook/domain/models.py`

Add after `ChangeEvent` class (line 114):

```python
class CrawlSession(Base):
    """
    Tracks complete crawl lifecycle with aggregate metrics.

    Records lifecycle from crawl.started → crawl.completed and aggregates
    per-page operation metrics for holistic performance analysis.
    """
    __tablename__ = "crawl_sessions"
    __table_args__ = {"schema": "webhook"}

    # Primary key
    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)

    # Crawl identification (CORRECTED: unique=True creates index automatically)
    crawl_id: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    crawl_url: Mapped[str] = mapped_column(String(500), nullable=False)

    # Lifecycle timestamps
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Status tracking
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="in_progress", index=True)
    success: Mapped[bool | None] = mapped_column(Boolean, nullable=True)

    # Page statistics (computed from operation metrics)
    total_pages: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    pages_indexed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    pages_failed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Aggregate timing in milliseconds (CORRECTED: default=0.0 instead of nullable)
    total_chunking_ms: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    total_embedding_ms: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    total_qdrant_ms: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    total_bm25_ms: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    # Crawl duration (completed_at - started_at)
    duration_ms: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Optional: MCP tool call tracking for end-to-end latency
    initiated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    e2e_duration_ms: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Firecrawl metadata and error tracking
    extra_metadata: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Record creation
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=func.now())

    def __repr__(self) -> str:
        return f"<CrawlSession(crawl_id={self.crawl_id}, status={self.status}, pages={self.total_pages})>"
```

**Migration:**
```bash
cd apps/webhook
uv run alembic revision --autogenerate -m "add_crawl_sessions_table"
uv run alembic upgrade head
```

**Verification:**
```bash
# Check table created with correct schema
docker exec pulse_postgres psql -U firecrawl -d pulse_postgres -c "\\d webhook.crawl_sessions"

# Verify indexes
docker exec pulse_postgres psql -U firecrawl -d pulse_postgres -c \
  "SELECT indexname, indexdef FROM pg_indexes WHERE schemaname='webhook' AND tablename='crawl_sessions';"
```

**Test Rollback:**
```bash
uv run alembic downgrade -1
uv run alembic upgrade head
```

---

#### Task 1.2: Add crawl_id to OperationMetric (CORRECTED)

**File:** `apps/webhook/domain/models.py`

Modify `OperationMetric` class (line 53), add after `job_id` field (line 74):

```python
class OperationMetric(Base):
    # ... existing fields ...
    job_id: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    # CORRECTED: String(255) to match CrawlSession.crawl_id length
    crawl_id: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    document_url: Mapped[str | None] = mapped_column(String(500), nullable=True, index=True)
    # ... rest of fields unchanged ...
```

**Migration:**
```bash
cd apps/webhook
uv run alembic revision --autogenerate -m "add_crawl_id_to_operation_metrics"
uv run alembic upgrade head
```

**Verification:**
```bash
# Check column added with correct type and index
docker exec pulse_postgres psql -U firecrawl -d pulse_postgres -c \
  "SELECT column_name, data_type, character_maximum_length FROM information_schema.columns WHERE table_schema='webhook' AND table_name='operation_metrics' AND column_name='crawl_id';"

# Verify index exists
docker exec pulse_postgres psql -U firecrawl -d pulse_postgres -c \
  "SELECT indexname FROM pg_indexes WHERE schemaname='webhook' AND tablename='operation_metrics' AND indexname LIKE '%crawl_id%';"
```

**Test Rollback:**
```bash
uv run alembic downgrade -1
uv run alembic upgrade head
```

---

#### Task 1.3: Add Foreign Key Constraint (NEW - CRITICAL)

**File:** `apps/webhook/alembic/versions/XXXX_add_crawl_fk_constraint.py` (manual migration)

Create manual migration:

```bash
cd apps/webhook
uv run alembic revision -m "add_foreign_key_crawl_id"
```

Edit the generated migration file:

```python
"""add_foreign_key_crawl_id

Revision ID: XXXX
Revises: YYYY  # Previous migration
Create Date: 2025-11-13
"""
from alembic import op

revision = 'XXXX'
down_revision = 'YYYY'  # ID from Task 1.2 migration
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add FK constraint from operation_metrics.crawl_id to crawl_sessions.crawl_id."""
    op.create_foreign_key(
        "fk_operation_metrics_crawl_id",
        "operation_metrics",
        "crawl_sessions",
        ["crawl_id"],
        ["crawl_id"],
        source_schema="webhook",
        referent_schema="webhook",
        ondelete="SET NULL",  # If crawl session deleted, set operation metrics to NULL
    )


def downgrade() -> None:
    """Remove FK constraint."""
    op.drop_constraint(
        "fk_operation_metrics_crawl_id",
        "operation_metrics",
        schema="webhook",
        type_="foreignkey"
    )
```

**Apply Migration:**
```bash
uv run alembic upgrade head
```

**Verification:**
```bash
# Verify FK constraint exists
docker exec pulse_postgres psql -U firecrawl -d pulse_postgres -c \
  "SELECT conname, contype, confupdtype, confdeltype FROM pg_constraint WHERE conname='fk_operation_metrics_crawl_id';"
```

**Test Rollback:**
```bash
uv run alembic downgrade -1
uv run alembic upgrade head
```

---

### **Phase 2: Infrastructure Updates** (Add Parameters Before Usage)

#### Task 2.1: Update TimingContext to Accept crawl_id

**File:** `apps/webhook/utils/timing.py`

Modify `TimingContext.__init__` (line 32):

```python
def __init__(
    self,
    operation_type: str,
    operation_name: str,
    request_id: str | None = None,
    job_id: str | None = None,
    crawl_id: str | None = None,  # NEW PARAMETER
    document_url: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    """
    Initialize timing context.

    Args:
        operation_type: Type of operation ('webhook', 'chunking', 'embedding', 'qdrant', 'bm25')
        operation_name: Specific operation name (e.g., 'crawl.page', 'embed_batch')
        request_id: Optional request ID for HTTP request correlation
        job_id: Optional job ID for worker correlation
        crawl_id: Optional crawl ID for crawl lifecycle correlation
        document_url: Optional document URL being processed
        metadata: Optional additional metadata
    """
    self.operation_type = operation_type
    self.operation_name = operation_name
    self.request_id = request_id
    self.job_id = job_id
    self.crawl_id = crawl_id  # NEW ATTRIBUTE
    self.document_url = document_url
    self.metadata = metadata or {}
    self.start_time: float = 0.0
    self.duration_ms: float = 0.0
    self.success: bool = True
    self.error_message: str | None = None
```

Modify `TimingContext.__aexit__` (line 106):

```python
async with get_db_context() as db:
    metric = OperationMetric(
        operation_type=self.operation_type,
        operation_name=self.operation_name,
        duration_ms=self.duration_ms,
        success=self.success,
        error_message=self.error_message,
        request_id=self.request_id,
        job_id=self.job_id,
        crawl_id=self.crawl_id,  # NEW FIELD
        document_url=self.document_url,
        extra_metadata=self.metadata,
    )
    db.add(metric)
    await db.commit()
```

**Test:**
```python
# Add to apps/webhook/tests/unit/test_timing_context.py
@pytest.mark.asyncio
async def test_timing_context_with_crawl_id(db_session):
    """Test TimingContext stores crawl_id correctly."""
    from utils.timing import TimingContext
    from domain.models import OperationMetric
    from sqlalchemy import select
    import asyncio

    async with TimingContext(
        "test_op",
        "test_name",
        crawl_id="test_crawl_123"
    ) as ctx:
        await asyncio.sleep(0.01)

    # Verify stored in database
    result = await db_session.execute(
        select(OperationMetric)
        .where(OperationMetric.operation_type == "test_op")
        .order_by(OperationMetric.timestamp.desc())
        .limit(1)
    )
    metric = result.scalar_one()
    assert metric.crawl_id == "test_crawl_123"
```

---

#### Task 2.2: Update IndexingService Signature

**File:** `apps/webhook/services/indexing.py`

Modify `index_document` method signature (line 50):

```python
async def index_document(
    self,
    document: IndexDocumentRequest,
    job_id: str | None = None,
    crawl_id: str | None = None,  # NEW PARAMETER
) -> dict[str, Any]:
    """
    Index a document from Firecrawl.

    Args:
        document: Document to index
        job_id: Optional job ID for correlation
        crawl_id: Optional crawl ID for lifecycle correlation

    Returns:
        Indexing result with statistics
    """
```

Update all `TimingContext` calls to pass `crawl_id`:

```python
# Line 104: Chunking
async with TimingContext(
    "chunking",
    "chunk_text",
    job_id=job_id,
    crawl_id=crawl_id,  # NEW
    document_url=document.url,
    request_id=None,
) as ctx:
    chunks = self.text_chunker.chunk_text(cleaned_markdown, metadata=chunk_metadata)
    ctx.metadata = {
        "chunks_created": len(chunks),
        "text_length": len(cleaned_markdown),
    }

# Line 137: Embedding
async with TimingContext(
    "embedding",
    "embed_batch",
    job_id=job_id,
    crawl_id=crawl_id,  # NEW
    document_url=document.url,
    request_id=None,
) as ctx:
    chunk_texts = [chunk["text"] for chunk in chunks]
    embeddings = await self.embedding_service.embed_batch(chunk_texts)
    ctx.metadata = {
        "batch_size": len(chunk_texts),
        "embedding_dim": len(embeddings[0]) if embeddings else 0,
    }

# Line 177: Qdrant (NOTE: Line number may be off by 1-2)
async with TimingContext(
    "qdrant",
    "index_chunks",
    job_id=job_id,
    crawl_id=crawl_id,  # NEW
    document_url=document.url,
    request_id=None,
) as ctx:
    indexed_count = await self.vector_store.index_chunks(
        chunks=chunks,
        embeddings=embeddings,
        document_url=document.url,
    )
    ctx.metadata = {
        "chunks_indexed": indexed_count,
        "collection": self.vector_store.collection_name,
    }

# Line 216: BM25 (NOTE: Line number may be off by 1-2)
async with TimingContext(
    "bm25",
    "index_document",
    job_id=job_id,
    crawl_id=crawl_id,  # NEW
    document_url=document.url,
    request_id=None,
) as ctx:
    await self.bm25_engine.index_document(
        url=document.url,
        text=cleaned_markdown,
        metadata=chunk_metadata,
    )
    ctx.metadata = {
        "doc_url": document.url,
        "text_length": len(cleaned_markdown),
    }
```

---

### **Phase 3: Event Handling** (Now Can Use Updated Infrastructure)

**IMPORTANT:** Add these imports to file header FIRST (before implementing handlers)

**File:** `apps/webhook/services/webhook_handlers.py`

Add after line 19 (`from utils.logging import get_logger`):

```python
# NEW IMPORTS FOR LIFECYCLE TRACKING
from datetime import UTC, datetime
from infra.database import get_db_context
from domain.models import CrawlSession, OperationMetric
from sqlalchemy import select, func
```

---

#### Task 3.1: Convert Lifecycle Handler to Async

**File:** `apps/webhook/services/webhook_handlers.py`

Change function signature (line 195):

```python
# BEFORE:
def _handle_lifecycle_event(
    event: FirecrawlLifecycleEvent | Any,
) -> dict[str, Any]:

# AFTER:
async def _handle_lifecycle_event(  # NOW ASYNC
    event: FirecrawlLifecycleEvent | Any,
) -> dict[str, Any]:
```

Update caller (line 58):

```python
# BEFORE:
if event_type in LIFECYCLE_EVENT_TYPES:
    return _handle_lifecycle_event(event)

# AFTER:
if event_type in LIFECYCLE_EVENT_TYPES:
    return await _handle_lifecycle_event(event)  # AWAIT NOW
```

---

#### Task 3.2: Implement Crawl Start Handler

**File:** `apps/webhook/services/webhook_handlers.py`

Add after `_handle_lifecycle_event` (line 218):

```python
async def _record_crawl_start(crawl_id: str, event: FirecrawlLifecycleEvent) -> None:
    """
    Record crawl start in CrawlSession table.

    Args:
        crawl_id: Firecrawl crawl/job identifier
        event: Lifecycle start event
    """
    # Extract URL from event metadata
    crawl_url = event.metadata.get("url", "unknown")

    # Check for MCP-provided initiation timestamp
    initiated_at_str = event.metadata.get("initiated_at")
    initiated_at = None
    if initiated_at_str:
        try:
            # Parse ISO 8601 timestamp from MCP
            initiated_at = datetime.fromisoformat(initiated_at_str.replace("Z", "+00:00"))
        except Exception as e:
            logger.warning(
                "Failed to parse initiated_at timestamp",
                value=initiated_at_str,
                error=str(e),
            )

    try:
        async with get_db_context() as db:
            # Check if session already exists (handle restart/duplicate events)
            result = await db.execute(
                select(CrawlSession).where(CrawlSession.crawl_id == crawl_id)
            )
            existing = result.scalar_one_or_none()

            if existing:
                logger.info(
                    "Crawl session already exists, skipping creation",
                    crawl_id=crawl_id,
                    status=existing.status,
                )
                return

            session = CrawlSession(
                crawl_id=crawl_id,
                crawl_url=crawl_url,
                started_at=datetime.now(UTC),
                initiated_at=initiated_at,
                status="in_progress",
                extra_metadata=event.metadata,
            )
            db.add(session)
            await db.commit()

        logger.info(
            "Crawl session started",
            crawl_id=crawl_id,
            crawl_url=crawl_url,
            has_initiated_timestamp=initiated_at is not None,
        )

    except Exception as e:
        # Don't fail the webhook if session tracking fails
        logger.error(
            "Failed to record crawl start",
            crawl_id=crawl_id,
            error=str(e),
            error_type=type(e).__name__,
        )
```

Update `_handle_lifecycle_event` to call handler (line 195):

```python
async def _handle_lifecycle_event(
    event: FirecrawlLifecycleEvent | Any,
) -> dict[str, Any]:
    """Process lifecycle events with crawl session tracking."""

    event_type = getattr(event, "type", None)
    crawl_id = getattr(event, "id", None)

    # NEW: Record lifecycle events in database
    if event_type == "crawl.started":
        await _record_crawl_start(crawl_id, event)
    elif event_type == "crawl.completed":
        await _record_crawl_complete(crawl_id, event)
    elif event_type == "crawl.failed":
        await _record_crawl_failed(crawl_id, event)

    # Existing logging and return
    if getattr(event, "success", True):
        logger.info("Lifecycle event processed", event_type=event_type, event_id=crawl_id)
    else:
        logger.error(
            "Lifecycle event indicates failure",
            event_type=event_type,
            event_id=crawl_id,
            error=getattr(event, "error", None),
        )

    return {"status": "acknowledged", "event_type": event_type}
```

---

#### Task 3.3: Implement Crawl Complete Handler (CORRECTED)

**File:** `apps/webhook/services/webhook_handlers.py`

Add after `_record_crawl_start`:

```python
async def _record_crawl_complete(crawl_id: str, event: FirecrawlLifecycleEvent) -> None:
    """
    Update CrawlSession with completion data and aggregate metrics.

    CORRECTED: Queries OperationMetric table for actual page count since
    Firecrawl does not provide pages_crawled in completion events.

    Args:
        crawl_id: Firecrawl crawl/job identifier
        event: Lifecycle completion event
    """
    try:
        async with get_db_context() as db:
            # Fetch existing session
            result = await db.execute(
                select(CrawlSession).where(CrawlSession.crawl_id == crawl_id)
            )
            session = result.scalar_one_or_none()

            if not session:
                logger.warning(
                    "Crawl completed but no session found",
                    crawl_id=crawl_id,
                    hint="crawl.started event may have been missed",
                )
                return

            # Update completion timestamp and status
            completed_at = datetime.now(UTC)
            session.completed_at = completed_at
            session.status = "completed"
            session.success = getattr(event, "success", True)
            session.duration_ms = (completed_at - session.started_at).total_seconds() * 1000

            # Calculate end-to-end duration if MCP timestamp available
            if session.initiated_at:
                session.e2e_duration_ms = (
                    completed_at - session.initiated_at
                ).total_seconds() * 1000

            # CORRECTED: Query actual page count from operation metrics
            # Use worker-level operations to avoid counting sub-operations
            page_count_result = await db.execute(
                select(func.count(func.distinct(OperationMetric.document_url)))
                .select_from(OperationMetric)
                .where(OperationMetric.crawl_id == crawl_id)
                .where(OperationMetric.operation_type == "worker")
                .where(OperationMetric.operation_name == "index_document")
                .where(OperationMetric.document_url.isnot(None))
            )
            session.total_pages = page_count_result.scalar() or 0

            # Count successful vs failed indexing operations
            success_count_result = await db.execute(
                select(func.count(func.distinct(OperationMetric.document_url)))
                .select_from(OperationMetric)
                .where(OperationMetric.crawl_id == crawl_id)
                .where(OperationMetric.operation_type == "worker")
                .where(OperationMetric.operation_name == "index_document")
                .where(OperationMetric.success == True)
                .where(OperationMetric.document_url.isnot(None))
            )
            session.pages_indexed = success_count_result.scalar() or 0
            session.pages_failed = session.total_pages - session.pages_indexed

            # Aggregate operation timings by type (only successful operations)
            aggregate_result = await db.execute(
                select(
                    OperationMetric.operation_type,
                    func.sum(OperationMetric.duration_ms).label("total_ms"),
                )
                .where(OperationMetric.crawl_id == crawl_id)
                .where(OperationMetric.success == True)
                .group_by(OperationMetric.operation_type)
            )

            for row in aggregate_result:
                if row.operation_type == "chunking":
                    session.total_chunking_ms = row.total_ms
                elif row.operation_type == "embedding":
                    session.total_embedding_ms = row.total_ms
                elif row.operation_type == "qdrant":
                    session.total_qdrant_ms = row.total_ms
                elif row.operation_type == "bm25":
                    session.total_bm25_ms = row.total_ms

            await db.commit()

            logger.info(
                "Crawl session completed",
                crawl_id=crawl_id,
                duration_ms=session.duration_ms,
                e2e_duration_ms=session.e2e_duration_ms,
                pages_total=session.total_pages,
                pages_indexed=session.pages_indexed,
                pages_failed=session.pages_failed,
                chunking_ms=session.total_chunking_ms,
                embedding_ms=session.total_embedding_ms,
                qdrant_ms=session.total_qdrant_ms,
                bm25_ms=session.total_bm25_ms,
            )

    except Exception as e:
        logger.error(
            "Failed to record crawl completion",
            crawl_id=crawl_id,
            error=str(e),
            error_type=type(e).__name__,
            exc_info=True,
        )
```

---

#### Task 3.4: Implement Crawl Failed Handler

**File:** `apps/webhook/services/webhook_handlers.py`

Add after `_record_crawl_complete`:

```python
async def _record_crawl_failed(crawl_id: str, event: FirecrawlLifecycleEvent) -> None:
    """
    Mark CrawlSession as failed.

    Args:
        crawl_id: Firecrawl crawl/job identifier
        event: Lifecycle failure event
    """
    try:
        async with get_db_context() as db:
            result = await db.execute(
                select(CrawlSession).where(CrawlSession.crawl_id == crawl_id)
            )
            session = result.scalar_one_or_none()

            if not session:
                logger.warning(
                    "Crawl failed but no session found",
                    crawl_id=crawl_id,
                )
                return

            completed_at = datetime.now(UTC)
            session.completed_at = completed_at
            session.status = "failed"
            session.success = False
            session.error_message = getattr(event, "error", "Unknown error")
            session.duration_ms = (completed_at - session.started_at).total_seconds() * 1000

            await db.commit()

            logger.error(
                "Crawl session failed",
                crawl_id=crawl_id,
                error=session.error_message,
                duration_ms=session.duration_ms,
            )

    except Exception as e:
        logger.error(
            "Failed to record crawl failure",
            crawl_id=crawl_id,
            error=str(e),
            error_type=type(e).__name__,
        )
```

---

#### Task 3.5: Propagate crawl_id Through Page Events

**File:** `apps/webhook/services/webhook_handlers.py`

Modify `_handle_page_event` to extract and pass `crawl_id` (line 64-99):

```python
async def _handle_page_event(
    event: FirecrawlPageEvent | Any,
    queue: Queue,
) -> dict[str, Any]:
    """Process crawl page events with crawl_id propagation."""

    # Extract crawl_id from event
    crawl_id = getattr(event, "id", None)  # NEW

    try:
        documents = _coerce_documents(getattr(event, "data", []))
    except Exception as e:
        logger.error(
            "Failed to coerce documents from webhook data",
            event_id=getattr(event, "id", None),
            event_type=getattr(event, "type", None),
            error=str(e),
            error_type=type(e).__name__,
            data_sample=str(getattr(event, "data", [])[:1]),
        )
        raise WebhookHandlerError(status_code=422, detail=f"Invalid document structure: {str(e)}")

    if not documents:
        logger.info(
            "Page event received with no documents",
            event_id=getattr(event, "id", None),
            event_type=getattr(event, "type", None),
        )
        return {"status": "no_documents", "queued_jobs": 0, "job_ids": []}

    job_ids: list[str] = []
    failed_documents: list[dict[str, Any]] = []

    # Use Redis pipeline for atomic batch operations
    with queue.connection.pipeline() as pipe:
        for idx, document in enumerate(documents):
            try:
                index_payload = _document_to_index_payload(document)

                # NEW: Add crawl_id to payload
                if crawl_id:
                    index_payload["crawl_id"] = crawl_id

                try:
                    job = queue.enqueue(
                        "worker.index_document_job",
                        index_payload,  # Now contains crawl_id
                        job_timeout=settings.indexing_job_timeout,
                        pipeline=pipe,
                    )
                    job_id = str(job.id) if job.id else None
                    if job_id:
                        job_ids.append(job_id)

                    logger.debug(
                        "Document queued from webhook",
                        event_id=getattr(event, "id", None),
                        job_id=job_id,
                        url=document.metadata.url,
                        document_index=idx,
                        crawl_id=crawl_id,  # NEW LOG FIELD
                    )

                except Exception as queue_error:
                    # ... existing error handling ...
            except Exception as transform_error:
                # ... existing error handling ...

        # Execute pipeline
        pipe.execute()

    # ... rest of function unchanged ...
```

---

#### Task 3.6: Update Worker to Extract and Pass crawl_id

**File:** `apps/webhook/worker.py`

Modify `_index_document_async` (line 36):

```python
async def _index_document_async(document_dict: dict[str, Any]) -> dict[str, Any]:
    """
    Async implementation of document indexing with crawl_id propagation.

    Args:
        document_dict: Document data including optional crawl_id

    Returns:
        Indexing result
    """
    logger.info(
        "Starting indexing job",
        url=document_dict.get("url"),
        crawl_id=document_dict.get("crawl_id"),  # NEW LOG FIELD
    )

    # Generate job ID
    job_id = str(uuid4())

    # NEW: Extract crawl_id BEFORE parsing (not in IndexDocumentRequest schema)
    crawl_id = document_dict.get("crawl_id")

    try:
        # Parse document (crawl_id will be ignored by schema)
        try:
            document = IndexDocumentRequest(**document_dict)
        except Exception as parse_error:
            logger.error(
                "Failed to parse document payload",
                url=document_dict.get("url"),
                crawl_id=crawl_id,  # NEW LOG FIELD
                error=str(parse_error),
                error_type=type(parse_error).__name__,
                provided_keys=list(document_dict.keys()),
                sample_values={k: str(v)[:100] for k, v in list(document_dict.items())[:5]},
            )
            raise

        # Get services from pool
        async with TimingContext(
            "worker",
            "get_service_pool",
            job_id=job_id,
            crawl_id=crawl_id,  # NEW
            document_url=document.url,
            request_id=None,
        ) as ctx:
            service_pool = ServicePool.get_instance()
            ctx.metadata = {"pool_exists": True}

        # Get indexing service from pool
        indexing_service = service_pool.get_indexing_service()

        # Ensure collection exists
        try:
            await service_pool.vector_store.ensure_collection()
        except Exception as coll_error:
            logger.error(
                "Failed to ensure Qdrant collection",
                collection=settings.qdrant_collection,
                crawl_id=crawl_id,  # NEW LOG FIELD
                error=str(coll_error),
                error_type=type(coll_error).__name__,
            )
            raise

        # Index document with crawl_id
        async with TimingContext(
            "worker",
            "index_document",
            job_id=job_id,
            crawl_id=crawl_id,  # NEW
            document_url=document.url,
            request_id=None,
        ) as ctx:
            result = await indexing_service.index_document(
                document,
                job_id=job_id,
                crawl_id=crawl_id,  # NEW PARAMETER
            )
            ctx.metadata = {
                "chunks_indexed": result.get("chunks_indexed", 0),
                "total_tokens": result.get("total_tokens", 0),
            }

        logger.info(
            "Indexing job completed",
            url=document.url,
            crawl_id=crawl_id,  # NEW LOG FIELD
            success=result.get("success"),
            chunks=result.get("chunks_indexed", 0),
        )

        return result

    except Exception as e:
        logger.error(
            "Indexing job failed",
            url=document_dict.get("url"),
            crawl_id=crawl_id,  # NEW LOG FIELD
            error=str(e),
            error_type=type(e).__name__,
            exc_info=True,
        )

        return {
            "success": False,
            "url": document_dict.get("url"),
            "error": str(e),
            "error_type": type(e).__name__,
        }
```

---

### **Phase 4: API Endpoints** (Add Schemas and Routes)

#### Task 4.1: Create Response Schemas

**File:** `apps/webhook/api/schemas/metrics.py` (NEW FILE)

Create new file:

```python
"""
Response schemas for metrics API endpoints.

Provides structured responses for crawl session metrics and operation timings.
"""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class OperationTimingSummary(BaseModel):
    """Summary of operation timings for a crawl."""

    chunking_ms: float = Field(0.0, description="Total chunking time in milliseconds")
    embedding_ms: float = Field(0.0, description="Total embedding time in milliseconds")
    qdrant_ms: float = Field(0.0, description="Total Qdrant indexing time in milliseconds")
    bm25_ms: float = Field(0.0, description="Total BM25 indexing time in milliseconds")


class PerPageMetric(BaseModel):
    """Per-page operation timing detail."""

    url: str | None = Field(None, description="Document URL")
    operation_type: str = Field(..., description="Operation type (chunking, embedding, etc)")
    operation_name: str = Field(..., description="Operation name (chunk_text, embed_batch, etc)")
    duration_ms: float = Field(..., description="Duration in milliseconds")
    success: bool = Field(..., description="Whether operation succeeded")
    timestamp: datetime = Field(..., description="When operation occurred")


class CrawlMetricsResponse(BaseModel):
    """Comprehensive metrics for a crawl session."""

    crawl_id: str = Field(..., description="Firecrawl crawl identifier")
    crawl_url: str = Field(..., description="Base URL that was crawled")
    status: str = Field(..., description="Crawl status (in_progress, completed, failed)")
    success: bool | None = Field(None, description="Whether crawl succeeded")

    # Timing
    started_at: datetime = Field(..., description="When crawl started")
    completed_at: datetime | None = Field(None, description="When crawl completed")
    duration_ms: float | None = Field(None, description="Crawl duration in milliseconds")
    e2e_duration_ms: float | None = Field(
        None, description="End-to-end duration from MCP tool call (if available)"
    )

    # Statistics
    total_pages: int = Field(..., description="Total pages processed")
    pages_indexed: int = Field(..., description="Successfully indexed pages")
    pages_failed: int = Field(..., description="Failed pages")

    # Aggregate timings
    aggregate_timing: OperationTimingSummary = Field(
        ..., description="Aggregate operation timings"
    )

    # Optional: Per-page details
    per_page_metrics: list[PerPageMetric] | None = Field(
        None, description="Detailed per-page operation metrics"
    )

    # Metadata
    error_message: str | None = Field(None, description="Error message if failed")
    extra_metadata: dict[str, Any] | None = Field(None, description="Additional metadata")


class CrawlListResponse(BaseModel):
    """List of recent crawl sessions."""

    crawls: list[CrawlMetricsResponse] = Field(..., description="List of crawl sessions")
    total: int = Field(..., description="Total number of crawls matching query")
```

**Register schemas in `__init__.py`:**

**File:** `apps/webhook/api/schemas/__init__.py`

Add to exports:

```python
from api.schemas.metrics import (
    CrawlMetricsResponse,
    CrawlListResponse,
    OperationTimingSummary,
    PerPageMetric,
)

__all__ = [
    # ... existing exports ...
    "CrawlMetricsResponse",
    "CrawlListResponse",
    "OperationTimingSummary",
    "PerPageMetric",
]
```

---

#### Task 4.2: Add Metrics API Endpoints

**File:** `apps/webhook/api/routers/metrics.py`

Add imports after line 17:

```python
from fastapi import HTTPException  # NEW
from api.schemas.metrics import (
    CrawlMetricsResponse,
    CrawlListResponse,
    OperationTimingSummary,
    PerPageMetric,
)
from domain.models import CrawlSession  # Add to existing OperationMetric import
```

Add endpoints after line 166:

```python
@router.get("/crawls/{crawl_id}", response_model=CrawlMetricsResponse)
async def get_crawl_metrics(
    crawl_id: str,
    include_per_page: bool = False,
    db: AsyncSession = Depends(get_db_session),
) -> CrawlMetricsResponse:
    """
    Get comprehensive metrics for a specific crawl.

    Args:
        crawl_id: Firecrawl crawl identifier
        include_per_page: Whether to include per-page operation details
        db: Database session

    Returns:
        Crawl metrics with aggregate timings

    Raises:
        HTTPException: 404 if crawl not found
    """
    # Fetch crawl session
    result = await db.execute(select(CrawlSession).where(CrawlSession.crawl_id == crawl_id))
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(status_code=404, detail=f"Crawl not found: {crawl_id}")

    # Build aggregate timing summary
    aggregate_timing = OperationTimingSummary(
        chunking_ms=session.total_chunking_ms,
        embedding_ms=session.total_embedding_ms,
        qdrant_ms=session.total_qdrant_ms,
        bm25_ms=session.total_bm25_ms,
    )

    # Optionally fetch per-page metrics
    per_page_metrics = None
    if include_per_page:
        operations_result = await db.execute(
            select(OperationMetric)
            .where(OperationMetric.crawl_id == crawl_id)
            .order_by(OperationMetric.timestamp)
        )
        operations = operations_result.scalars().all()

        per_page_metrics = [
            PerPageMetric(
                url=op.document_url,
                operation_type=op.operation_type,
                operation_name=op.operation_name,
                duration_ms=op.duration_ms,
                success=op.success,
                timestamp=op.timestamp,
            )
            for op in operations
        ]

    return CrawlMetricsResponse(
        crawl_id=session.crawl_id,
        crawl_url=session.crawl_url,
        status=session.status,
        success=session.success,
        started_at=session.started_at,
        completed_at=session.completed_at,
        duration_ms=session.duration_ms,
        e2e_duration_ms=session.e2e_duration_ms,
        total_pages=session.total_pages,
        pages_indexed=session.pages_indexed,
        pages_failed=session.pages_failed,
        aggregate_timing=aggregate_timing,
        per_page_metrics=per_page_metrics,
        error_message=session.error_message,
        extra_metadata=session.extra_metadata,
    )


@router.get("/crawls", response_model=CrawlListResponse)
async def list_recent_crawls(
    limit: int = 10,
    status: str | None = None,
    db: AsyncSession = Depends(get_db_session),
) -> CrawlListResponse:
    """
    List recent crawl sessions with summary metrics.

    Args:
        limit: Maximum number of crawls to return (default: 10)
        status: Filter by status (in_progress, completed, failed)
        db: Database session

    Returns:
        List of crawl sessions with metrics
    """
    # Build query
    query = select(CrawlSession).order_by(CrawlSession.started_at.desc()).limit(limit)

    if status:
        query = query.where(CrawlSession.status == status)

    # Execute query
    result = await db.execute(query)
    sessions = result.scalars().all()

    # Count total (for pagination metadata)
    count_query = select(func.count()).select_from(CrawlSession)
    if status:
        count_query = count_query.where(CrawlSession.status == status)
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # Build response
    crawls = [
        CrawlMetricsResponse(
            crawl_id=s.crawl_id,
            crawl_url=s.crawl_url,
            status=s.status,
            success=s.success,
            started_at=s.started_at,
            completed_at=s.completed_at,
            duration_ms=s.duration_ms,
            e2e_duration_ms=s.e2e_duration_ms,
            total_pages=s.total_pages,
            pages_indexed=s.pages_indexed,
            pages_failed=s.pages_failed,
            aggregate_timing=OperationTimingSummary(
                chunking_ms=s.total_chunking_ms,
                embedding_ms=s.total_embedding_ms,
                qdrant_ms=s.total_qdrant_ms,
                bm25_ms=s.total_bm25_ms,
            ),
            per_page_metrics=None,  # Not included in list view
            error_message=s.error_message,
            extra_metadata=s.extra_metadata,
        )
        for s in sessions
    ]

    return CrawlListResponse(crawls=crawls, total=total)
```

**Verify router registration:**

```bash
# Verify metrics router is already registered in main.py
grep "metrics.router" apps/webhook/main.py
# Expected output: app.include_router(metrics.router)
```

---

### **Phase 5: Testing** (Comprehensive Coverage)

**Test fixtures are already available in `apps/webhook/tests/conftest.py`:**
- `db_session` (line 458) - Database session with automatic transaction rollback
- `client` - HTTP client for API testing (verify exists)

---

#### Task 5.1: Unit Tests for Models

**File:** `apps/webhook/tests/unit/test_crawl_session_model.py` (NEW FILE)

```python
"""Unit tests for CrawlSession model."""

import pytest
from datetime import datetime, UTC
from sqlalchemy import select

from domain.models import CrawlSession


@pytest.mark.asyncio
async def test_crawl_session_creation(db_session):
    """Test creating a CrawlSession."""
    session = CrawlSession(
        crawl_id="crawl_test_123",
        crawl_url="https://example.com",
        started_at=datetime.now(UTC),
        status="in_progress",
    )
    db_session.add(session)
    await db_session.commit()

    result = await db_session.execute(
        select(CrawlSession).where(CrawlSession.crawl_id == "crawl_test_123")
    )
    fetched = result.scalar_one()

    assert fetched.crawl_id == "crawl_test_123"
    assert fetched.status == "in_progress"
    assert fetched.total_pages == 0
    assert fetched.success is None
    assert fetched.total_chunking_ms == 0.0  # Corrected: default=0.0
    assert fetched.total_embedding_ms == 0.0


@pytest.mark.asyncio
async def test_crawl_session_lifecycle_transitions(db_session):
    """Test status transitions: in_progress → completed."""
    session = CrawlSession(
        crawl_id="crawl_lifecycle",
        crawl_url="https://example.com",
        started_at=datetime.now(UTC),
        status="in_progress",
    )
    db_session.add(session)
    await db_session.commit()

    # Update to completed
    result = await db_session.execute(
        select(CrawlSession).where(CrawlSession.crawl_id == "crawl_lifecycle")
    )
    session = result.scalar_one()
    session.status = "completed"
    session.completed_at = datetime.now(UTC)
    session.success = True
    await db_session.commit()

    # Verify
    result = await db_session.execute(
        select(CrawlSession).where(CrawlSession.crawl_id == "crawl_lifecycle")
    )
    updated = result.scalar_one()
    assert updated.status == "completed"
    assert updated.success is True
    assert updated.completed_at is not None


@pytest.mark.asyncio
async def test_crawl_session_unique_constraint(db_session):
    """Test unique constraint on crawl_id."""
    from sqlalchemy.exc import IntegrityError

    session1 = CrawlSession(
        crawl_id="duplicate_crawl",
        crawl_url="https://example.com",
        started_at=datetime.now(UTC),
        status="in_progress",
    )
    db_session.add(session1)
    await db_session.commit()

    # Try to create duplicate
    session2 = CrawlSession(
        crawl_id="duplicate_crawl",  # Same crawl_id
        crawl_url="https://other.com",
        started_at=datetime.now(UTC),
        status="in_progress",
    )
    db_session.add(session2)

    with pytest.raises(IntegrityError):
        await db_session.commit()
```

---

#### Task 5.2: Integration Tests for Lifecycle

**File:** `apps/webhook/tests/integration/test_crawl_lifecycle_tracking.py` (NEW FILE)

```python
"""Integration tests for crawl lifecycle tracking."""

import pytest
from datetime import datetime, UTC

from api.schemas.webhook import FirecrawlLifecycleEvent
from domain.models import CrawlSession
from services.webhook_handlers import _record_crawl_start, _record_crawl_complete
from sqlalchemy import select


@pytest.mark.asyncio
async def test_crawl_lifecycle_end_to_end(db_session):
    """
    Test complete crawl lifecycle: start → complete.

    Note: db_session fixture ensures DB is initialized, but handlers
    create their own database contexts internally via get_db_context().
    """

    # Create start event
    start_event = FirecrawlLifecycleEvent(
        id="crawl_integration_123",
        type="crawl.started",
        success=True,
        metadata={"url": "https://example.com"},
    )

    await _record_crawl_start("crawl_integration_123", start_event)

    # Verify session created
    result = await db_session.execute(
        select(CrawlSession).where(CrawlSession.crawl_id == "crawl_integration_123")
    )
    session = result.scalar_one()
    assert session.status == "in_progress"
    assert session.crawl_url == "https://example.com"

    # Create completion event
    complete_event = FirecrawlLifecycleEvent(
        id="crawl_integration_123",
        type="crawl.completed",
        success=True,
        metadata={},
    )

    await _record_crawl_complete("crawl_integration_123", complete_event)

    # Verify session completed
    result = await db_session.execute(
        select(CrawlSession).where(CrawlSession.crawl_id == "crawl_integration_123")
    )
    session = result.scalar_one()
    assert session.status == "completed"
    assert session.success is True
    assert session.completed_at is not None
    assert session.duration_ms is not None


@pytest.mark.asyncio
async def test_crawl_start_idempotency(db_session):
    """Test that duplicate crawl.started events don't create duplicates."""
    event = FirecrawlLifecycleEvent(
        id="crawl_idempotent",
        type="crawl.started",
        success=True,
        metadata={"url": "https://example.com"},
    )

    # Call twice
    await _record_crawl_start("crawl_idempotent", event)
    await _record_crawl_start("crawl_idempotent", event)

    # Verify only one session exists
    result = await db_session.execute(
        select(CrawlSession).where(CrawlSession.crawl_id == "crawl_idempotent")
    )
    sessions = result.scalars().all()
    assert len(sessions) == 1
```

---

#### Task 5.3: API Endpoint Tests

**File:** `apps/webhook/tests/integration/test_metrics_api_crawls.py` (NEW FILE)

```python
"""Integration tests for crawl metrics API endpoints."""

import pytest
from httpx import AsyncClient
from datetime import datetime, UTC

from domain.models import CrawlSession
from config import settings


@pytest.mark.asyncio
async def test_get_crawl_metrics(client: AsyncClient, db_session):
    """Test GET /api/metrics/crawls/{crawl_id}."""

    # Create test session
    session = CrawlSession(
        crawl_id="crawl_api_test",
        crawl_url="https://example.com",
        started_at=datetime.now(UTC),
        completed_at=datetime.now(UTC),
        status="completed",
        success=True,
        total_pages=10,
        pages_indexed=9,
        pages_failed=1,
        duration_ms=5000.0,
        total_embedding_ms=1500.0,
        total_qdrant_ms=800.0,
    )
    db_session.add(session)
    await db_session.commit()

    # Request metrics (with API secret header)
    headers = {"X-API-Secret": settings.api_secret}
    response = await client.get(
        "/api/metrics/crawls/crawl_api_test",
        headers=headers
    )

    assert response.status_code == 200
    data = response.json()
    assert data["crawl_id"] == "crawl_api_test"
    assert data["status"] == "completed"
    assert data["total_pages"] == 10
    assert data["aggregate_timing"]["embedding_ms"] == 1500.0


@pytest.mark.asyncio
async def test_get_crawl_metrics_not_found(client: AsyncClient):
    """Test GET /api/metrics/crawls/{crawl_id} for nonexistent crawl."""
    headers = {"X-API-Secret": settings.api_secret}
    response = await client.get(
        "/api/metrics/crawls/nonexistent",
        headers=headers
    )

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_list_recent_crawls(client: AsyncClient, db_session):
    """Test GET /api/metrics/crawls."""

    # Create multiple test sessions
    for i in range(3):
        session = CrawlSession(
            crawl_id=f"crawl_list_{i}",
            crawl_url=f"https://example{i}.com",
            started_at=datetime.now(UTC),
            status="completed",
            total_pages=i + 1,
        )
        db_session.add(session)
    await db_session.commit()

    # Request list (with API secret header)
    headers = {"X-API-Secret": settings.api_secret}
    response = await client.get(
        "/api/metrics/crawls?limit=10",
        headers=headers
    )

    assert response.status_code == 200
    data = response.json()
    assert data["total"] >= 3
    assert len(data["crawls"]) >= 3
```

---

## Testing Checklist

Run these commands in order:

```bash
cd apps/webhook

# 1. Run migrations
uv run alembic upgrade head

# 2. Verify tables created
docker exec pulse_postgres psql -U firecrawl -d pulse_postgres -c \
  "SELECT table_name FROM information_schema.tables WHERE table_schema='webhook' AND table_name IN ('crawl_sessions', 'operation_metrics');"

# 3. Verify indexes
docker exec pulse_postgres psql -U firecrawl -d pulse_postgres -c \
  "SELECT indexname FROM pg_indexes WHERE schemaname='webhook' AND tablename='crawl_sessions';"

# 4. Verify foreign key
docker exec pulse_postgres psql -U firecrawl -d pulse_postgres -c \
  "SELECT conname FROM pg_constraint WHERE conname='fk_operation_metrics_crawl_id';"

# 5. Run unit tests
uv run pytest tests/unit/test_crawl_session_model.py -v
uv run pytest tests/unit/test_timing_context.py::test_timing_context_with_crawl_id -v

# 6. Run integration tests
uv run pytest tests/integration/test_crawl_lifecycle_tracking.py -v

# 7. Run API tests
uv run pytest tests/integration/test_metrics_api_crawls.py -v

# 8. Test rollback
uv run alembic downgrade -3  # Rollback 3 migrations
uv run alembic upgrade head   # Reapply

# 9. Manual verification with real crawl
# (Trigger crawl via MCP, then query database)
docker exec pulse_postgres psql -U firecrawl -d pulse_postgres -c \
  "SELECT crawl_id, status, total_pages, duration_ms FROM webhook.crawl_sessions ORDER BY started_at DESC LIMIT 1;"

# 10. Query metrics endpoint
curl -H "X-API-Secret: your-secret" http://localhost:50108/api/metrics/crawls/{crawl_id}
```

---

## Deployment Instructions

### Step 1: Backup Database

```bash
docker exec pulse_postgres pg_dump -U firecrawl -d pulse_postgres -n webhook > webhook_backup_$(date +%Y%m%d_%H%M%S).sql
```

### Step 2: Run Migrations in Container

```bash
# Run migrations inside webhook container
docker exec pulse_webhook bash -c "cd /app && uv run alembic upgrade head"

# Verify migrations applied
docker exec pulse_postgres psql -U firecrawl -d pulse_postgres -c \
  "SELECT version_num FROM alembic_version;"
```

### Step 3: Restart Service

```bash
docker compose restart pulse_webhook pulse_webhook-worker
```

### Step 4: Verify Service Health

```bash
# Check service is running
curl http://localhost:50108/health

# Check new endpoints exist
curl -H "X-API-Secret: your-secret" http://localhost:50108/api/metrics/crawls
```

### Step 5: Monitor Logs

```bash
# Watch webhook logs for errors
docker logs -f pulse_webhook --tail 100

# Watch for lifecycle events
docker logs -f pulse_webhook | grep "Crawl session"
```

---

## Rollout Timeline

### Day 1: Schema & Infrastructure (4-6 hours)
- [ ] Phase 1: All 3 migration tasks
- [ ] Phase 2: TimingContext and IndexingService updates
- [ ] Test migrations and rollback
- [ ] Verify unit tests pass

### Day 2: Event Handling (4-6 hours)
- [ ] Phase 3: All 6 lifecycle handler tasks
- [ ] Test with mock webhook events
- [ ] Verify integration tests pass

### Day 3: API & Testing (4-6 hours)
- [ ] Phase 4: Schemas and endpoints
- [ ] Phase 5: All test suites
- [ ] Manual verification with real crawl

### Day 4: Deployment & Validation (2-4 hours)
- [ ] Backup database
- [ ] Deploy to production
- [ ] Monitor for 24 hours
- [ ] Document any issues

**Total Estimated Effort:** 14-22 hours

---

## Success Criteria

After implementation, these queries must work:

```sql
-- 1. Total crawl duration
SELECT crawl_id, duration_ms, e2e_duration_ms
FROM webhook.crawl_sessions
WHERE crawl_id = 'your-crawl-id';

-- 2. Embedding vs Qdrant timing comparison
SELECT crawl_id, total_embedding_ms, total_qdrant_ms,
       ROUND((total_embedding_ms / total_qdrant_ms) * 100, 2) as embedding_pct
FROM webhook.crawl_sessions
WHERE crawl_id = 'your-crawl-id';

-- 3. Average time per page
SELECT crawl_id, total_pages,
       ROUND(duration_ms / NULLIF(total_pages, 0), 2) as avg_ms_per_page
FROM webhook.crawl_sessions
WHERE crawl_id = 'your-crawl-id';

-- 4. All operations for a crawl (using FK relationship)
SELECT operation_type, operation_name,
       COUNT(*) as count,
       SUM(duration_ms) as total_ms
FROM webhook.operation_metrics
WHERE crawl_id = 'your-crawl-id'
GROUP BY operation_type, operation_name
ORDER BY total_ms DESC;

-- 5. Recent crawl performance
SELECT crawl_id, status, total_pages,
       ROUND(duration_ms / 1000.0, 2) as duration_sec,
       ROUND(total_embedding_ms / 1000.0, 2) as embedding_sec,
       ROUND(total_qdrant_ms / 1000.0, 2) as qdrant_sec
FROM webhook.crawl_sessions
WHERE status = 'completed'
ORDER BY started_at DESC
LIMIT 10;
```

---

## Changes from Previous Versions

### v3 (FINAL) Changes:

1. **Fixed duplicate index** - Removed `index=True` from unique crawl_id column
2. **Fixed string length mismatch** - Both use `String(255)` now
3. **Added foreign key constraint** - Task 1.3 (NEW)
4. **Fixed aggregate timing defaults** - `default=0.0` instead of nullable
5. **Added file-level imports** - All imports at top of webhook_handlers.py
6. **Fixed page counting** - Uses `func.count(func.distinct(document_url))`
7. **Added test for crawl_id** - TimingContext unit test
8. **Added idempotency test** - Duplicate start events handled
9. **Added API secret headers** - All API tests include authentication
10. **Added deployment instructions** - Container-based migration steps
11. **Added rollback testing** - Migration reversibility verified

---

## Post-Implementation Tasks

- [ ] Monitor crawl session creation rate (should match crawl starts)
- [ ] Monitor operation metrics crawl_id population (should be ~100%)
- [ ] Verify aggregate calculations are accurate
- [ ] Add Grafana dashboard for crawl metrics visualization
- [ ] Document API endpoints in OpenAPI docs
- [ ] Add alerting for failed crawls

---

**This final plan is production-ready and addresses all agent verification findings.**

**Approval Signatures:**
- Agent 1 (Plan Structure): ✅ Approved
- Agent 2 (Database Safety): ✅ Approved (after fixes)
- Agent 3 (Implementation Completeness): ✅ Approved (after fixes)
