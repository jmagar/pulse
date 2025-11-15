# Timing Instrumentation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add crawl lifecycle tracking with aggregate timing metrics for complete performance observability.

**Architecture:** Extend existing TimingContext infrastructure to support crawl_id parameter, create CrawlSession table for lifecycle tracking, aggregate OperationMetric data into session summaries, expose metrics via REST API.

**Tech Stack:** FastAPI, SQLAlchemy (async), Alembic migrations, pytest, PostgreSQL

---

## Prerequisites

**Before starting:**

```bash
# Verify database is up
docker ps | grep pulse_postgres

# Verify webhook service is running
docker ps | grep pulse_webhook

# Check current migration status
cd apps/webhook
uv run alembic current
```

**Expected:** Services running, migrations up to date.

---

## Phase 1: Database Schema (TDD with Migrations)

### Task 1: Test CrawlSession Model Creation

**Files:**
- Create: `apps/webhook/tests/unit/test_crawl_session_model.py`
- Create migration (later): `apps/webhook/alembic/versions/XXXX_add_crawl_sessions.py`
- Modify: `apps/webhook/domain/models.py:114` (add after ChangeEvent)

**Step 1: Write failing test for CrawlSession creation**

```bash
cat > apps/webhook/tests/unit/test_crawl_session_model.py << 'EOF'
"""Unit tests for CrawlSession model."""

import pytest
from datetime import datetime, UTC
from sqlalchemy import select

from domain.models import CrawlSession


@pytest.mark.asyncio
async def test_crawl_session_creation(db_session):
    """Test creating a CrawlSession with required fields."""
    session = CrawlSession(
        crawl_id="test_crawl_123",
        crawl_url="https://example.com",
        started_at=datetime.now(UTC),
        status="in_progress",
    )
    db_session.add(session)
    await db_session.commit()

    result = await db_session.execute(
        select(CrawlSession).where(CrawlSession.crawl_id == "test_crawl_123")
    )
    fetched = result.scalar_one()

    assert fetched.crawl_id == "test_crawl_123"
    assert fetched.status == "in_progress"
    assert fetched.total_pages == 0
    assert fetched.total_chunking_ms == 0.0
    assert fetched.success is None
EOF
```

**Step 2: Run test to verify it fails**

```bash
cd apps/webhook
uv run pytest tests/unit/test_crawl_session_model.py::test_crawl_session_creation -v
```

**Expected output:**
```
ImportError: cannot import name 'CrawlSession' from 'domain.models'
```

**Step 3: Implement CrawlSession model**

Add after line 114 in `apps/webhook/domain/models.py`:

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

    # Crawl identification
    crawl_id: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    crawl_url: Mapped[str] = mapped_column(String(500), nullable=False)

    # Lifecycle timestamps
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Status tracking
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="in_progress", index=True)
    success: Mapped[bool | None] = mapped_column(Boolean, nullable=True)

    # Page statistics
    total_pages: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    pages_indexed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    pages_failed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Aggregate timing in milliseconds
    total_chunking_ms: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    total_embedding_ms: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    total_qdrant_ms: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    total_bm25_ms: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    # Crawl duration
    duration_ms: Mapped[float | None] = mapped_column(Float, nullable=True)

    # End-to-end tracking
    initiated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    e2e_duration_ms: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Metadata
    extra_metadata: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=func.now())

    def __repr__(self) -> str:
        return f"<CrawlSession(crawl_id={self.crawl_id}, status={self.status}, pages={self.total_pages})>"
```

**Step 4: Create migration**

```bash
cd apps/webhook
uv run alembic revision --autogenerate -m "add_crawl_sessions_table"
```

**Expected:** Migration file created in `alembic/versions/`

**Step 5: Apply migration**

```bash
uv run alembic upgrade head
```

**Step 6: Run test to verify it passes**

```bash
uv run pytest tests/unit/test_crawl_session_model.py::test_crawl_session_creation -v
```

**Expected output:**
```
PASSED
```

**Step 7: Commit**

```bash
git add apps/webhook/domain/models.py \
        apps/webhook/tests/unit/test_crawl_session_model.py \
        apps/webhook/alembic/versions/*_add_crawl_sessions_table.py
git commit -m "feat(webhook): add CrawlSession model for lifecycle tracking

- Create crawl_sessions table in webhook schema
- Track crawl start/completion with aggregate metrics
- Add unit test for model creation
- Migration includes indexes on crawl_id, started_at, status"
```

---

### Task 2: Test crawl_id Column Addition to OperationMetric

**Files:**
- Create: `apps/webhook/tests/unit/test_operation_metric_crawl_id.py`
- Modify: `apps/webhook/domain/models.py:74` (add crawl_id field)
- Create migration: `apps/webhook/alembic/versions/XXXX_add_crawl_id_to_operation_metrics.py`

**Step 1: Write failing test**

```bash
cat > apps/webhook/tests/unit/test_operation_metric_crawl_id.py << 'EOF'
"""Unit tests for OperationMetric crawl_id field."""

import pytest
from datetime import datetime, UTC
from sqlalchemy import select

from domain.models import OperationMetric


@pytest.mark.asyncio
async def test_operation_metric_with_crawl_id(db_session):
    """Test OperationMetric stores crawl_id correctly."""
    metric = OperationMetric(
        operation_type="chunking",
        operation_name="chunk_text",
        duration_ms=150.5,
        success=True,
        crawl_id="test_crawl_abc",
        document_url="https://example.com/page1",
    )
    db_session.add(metric)
    await db_session.commit()

    result = await db_session.execute(
        select(OperationMetric).where(OperationMetric.crawl_id == "test_crawl_abc")
    )
    fetched = result.scalar_one()

    assert fetched.crawl_id == "test_crawl_abc"
    assert fetched.operation_type == "chunking"
EOF
```

**Step 2: Run test to verify it fails**

```bash
cd apps/webhook
uv run pytest tests/unit/test_operation_metric_crawl_id.py::test_operation_metric_with_crawl_id -v
```

**Expected:**
```
TypeError: __init__() got an unexpected keyword argument 'crawl_id'
```

**Step 3: Add crawl_id field to OperationMetric**

Modify `apps/webhook/domain/models.py` after line 74 (after job_id):

```python
    job_id: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    crawl_id: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    document_url: Mapped[str | None] = mapped_column(String(500), nullable=True, index=True)
```

**Step 4: Create migration**

```bash
uv run alembic revision --autogenerate -m "add_crawl_id_to_operation_metrics"
```

**Step 5: Apply migration**

```bash
uv run alembic upgrade head
```

**Step 6: Run test to verify it passes**

```bash
uv run pytest tests/unit/test_operation_metric_crawl_id.py::test_operation_metric_with_crawl_id -v
```

**Expected:**
```
PASSED
```

**Step 7: Commit**

```bash
git add apps/webhook/domain/models.py \
        apps/webhook/tests/unit/test_operation_metric_crawl_id.py \
        apps/webhook/alembic/versions/*_add_crawl_id_to_operation_metrics.py
git commit -m "feat(webhook): add crawl_id to OperationMetric for correlation

- Add crawl_id column to operation_metrics table
- Index crawl_id for fast lookups
- String(255) matches CrawlSession.crawl_id length
- Test verifies storage and retrieval"
```

---

### Task 3: Test Foreign Key Constraint

**Files:**
- Create: `apps/webhook/tests/unit/test_crawl_fk_constraint.py`
- Create manual migration: `apps/webhook/alembic/versions/XXXX_add_crawl_fk.py`

**Step 1: Write test for FK constraint**

```bash
cat > apps/webhook/tests/unit/test_crawl_fk_constraint.py << 'EOF'
"""Unit tests for crawl_id foreign key constraint."""

import pytest
from datetime import datetime, UTC
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from domain.models import CrawlSession, OperationMetric


@pytest.mark.asyncio
async def test_operation_metric_fk_constraint_valid(db_session):
    """Test OperationMetric with valid crawl_id reference."""
    # Create crawl session first
    session = CrawlSession(
        crawl_id="fk_test_crawl",
        crawl_url="https://example.com",
        started_at=datetime.now(UTC),
        status="in_progress",
    )
    db_session.add(session)
    await db_session.commit()

    # Create operation metric referencing crawl
    metric = OperationMetric(
        operation_type="embedding",
        operation_name="embed_batch",
        duration_ms=200.0,
        success=True,
        crawl_id="fk_test_crawl",
    )
    db_session.add(metric)
    await db_session.commit()

    # Verify stored
    result = await db_session.execute(
        select(OperationMetric).where(OperationMetric.crawl_id == "fk_test_crawl")
    )
    fetched = result.scalar_one()
    assert fetched.crawl_id == "fk_test_crawl"


@pytest.mark.asyncio
async def test_operation_metric_fk_cascade_on_delete(db_session):
    """Test SET NULL behavior when crawl session deleted."""
    # Create crawl session
    session = CrawlSession(
        crawl_id="cascade_test",
        crawl_url="https://example.com",
        started_at=datetime.now(UTC),
        status="in_progress",
    )
    db_session.add(session)
    await db_session.commit()

    # Create operation metric
    metric = OperationMetric(
        operation_type="qdrant",
        operation_name="index_chunks",
        duration_ms=100.0,
        success=True,
        crawl_id="cascade_test",
    )
    db_session.add(metric)
    await db_session.commit()

    metric_id = metric.id

    # Delete crawl session
    await db_session.delete(session)
    await db_session.commit()

    # Verify metric still exists with NULL crawl_id
    result = await db_session.execute(
        select(OperationMetric).where(OperationMetric.id == metric_id)
    )
    fetched = result.scalar_one()
    assert fetched.crawl_id is None
EOF
```

**Step 2: Run tests to verify they fail**

```bash
cd apps/webhook
uv run pytest tests/unit/test_crawl_fk_constraint.py -v
```

**Expected:** Both tests PASS (no FK constraint yet, so no enforcement)

**Step 3: Create manual migration for FK**

```bash
uv run alembic revision -m "add_foreign_key_crawl_id"
```

Edit the generated file:

```python
"""add_foreign_key_crawl_id

Revision ID: <auto-generated>
Revises: <previous-revision>
Create Date: <auto-generated>
"""
from alembic import op

revision = '<auto-generated>'
down_revision = '<previous-revision>'
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
        ondelete="SET NULL",
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

**Step 4: Apply migration**

```bash
uv run alembic upgrade head
```

**Step 5: Run tests to verify they pass**

```bash
uv run pytest tests/unit/test_crawl_fk_constraint.py -v
```

**Expected:**
```
test_operation_metric_fk_constraint_valid PASSED
test_operation_metric_fk_cascade_on_delete PASSED
```

**Step 6: Commit**

```bash
git add apps/webhook/tests/unit/test_crawl_fk_constraint.py \
        apps/webhook/alembic/versions/*_add_foreign_key_crawl_id.py
git commit -m "feat(webhook): add foreign key constraint for crawl_id

- FK from operation_metrics.crawl_id to crawl_sessions.crawl_id
- SET NULL on delete (preserve operation metrics)
- Tests verify constraint enforcement and cascade behavior"
```

---

## Phase 2: Infrastructure Updates (TDD)

### Task 4: Test TimingContext with crawl_id

**Files:**
- Create: `apps/webhook/tests/unit/test_timing_context_crawl_id.py`
- Modify: `apps/webhook/utils/timing.py:32` (add crawl_id parameter)

**Step 1: Write failing test**

```bash
cat > apps/webhook/tests/unit/test_timing_context_crawl_id.py << 'EOF'
"""Unit tests for TimingContext crawl_id parameter."""

import pytest
import asyncio
from sqlalchemy import select

from utils.timing import TimingContext
from domain.models import OperationMetric


@pytest.mark.asyncio
async def test_timing_context_stores_crawl_id(db_session):
    """Test TimingContext stores crawl_id in database."""
    async with TimingContext(
        "test_op",
        "test_name",
        crawl_id="timing_test_123"
    ) as ctx:
        await asyncio.sleep(0.01)

    # Verify stored in database
    result = await db_session.execute(
        select(OperationMetric)
        .where(OperationMetric.operation_type == "test_op")
        .where(OperationMetric.crawl_id == "timing_test_123")
        .order_by(OperationMetric.timestamp.desc())
        .limit(1)
    )
    metric = result.scalar_one()
    assert metric.crawl_id == "timing_test_123"
    assert metric.operation_name == "test_name"
    assert metric.duration_ms > 0
EOF
```

**Step 2: Run test to verify it fails**

```bash
cd apps/webhook
uv run pytest tests/unit/test_timing_context_crawl_id.py::test_timing_context_stores_crawl_id -v
```

**Expected:**
```
TypeError: __init__() got an unexpected keyword argument 'crawl_id'
```

**Step 3: Add crawl_id parameter to TimingContext**

Modify `apps/webhook/utils/timing.py` __init__ method (line 32):

```python
    def __init__(
        self,
        operation_type: str,
        operation_name: str,
        request_id: str | None = None,
        job_id: str | None = None,
        crawl_id: str | None = None,  # NEW
        document_url: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        """
        Initialize timing context.

        Args:
            operation_type: Type of operation ('webhook', 'chunking', 'embedding', 'qdrant', 'bm25')
            operation_name: Specific operation name (e.g., 'crawl.page', 'embed_batch')
            request_id: Optional request ID for correlation
            job_id: Optional job ID for worker correlation
            crawl_id: Optional crawl ID for lifecycle correlation
            document_url: Optional document URL being processed
            metadata: Optional additional metadata
        """
        self.operation_type = operation_type
        self.operation_name = operation_name
        self.request_id = request_id
        self.job_id = job_id
        self.crawl_id = crawl_id  # NEW
        self.document_url = document_url
        self.metadata = metadata or {}
        self.start_time: float = 0.0
        self.duration_ms: float = 0.0
        self.success: bool = True
        self.error_message: str | None = None
```

**Step 4: Update __aexit__ to store crawl_id**

Modify line 107 in `apps/webhook/utils/timing.py`:

```python
                metric = OperationMetric(
                    operation_type=self.operation_type,
                    operation_name=self.operation_name,
                    duration_ms=self.duration_ms,
                    success=self.success,
                    error_message=self.error_message,
                    request_id=self.request_id,
                    job_id=self.job_id,
                    crawl_id=self.crawl_id,  # NEW
                    document_url=self.document_url,
                    extra_metadata=self.metadata,
                )
```

**Step 5: Run test to verify it passes**

```bash
uv run pytest tests/unit/test_timing_context_crawl_id.py::test_timing_context_stores_crawl_id -v
```

**Expected:**
```
PASSED
```

**Step 6: Commit**

```bash
git add apps/webhook/utils/timing.py \
        apps/webhook/tests/unit/test_timing_context_crawl_id.py
git commit -m "feat(webhook): add crawl_id parameter to TimingContext

- Accept crawl_id in TimingContext constructor
- Store crawl_id in OperationMetric records
- Test verifies end-to-end storage and retrieval
- Enables correlation of operations to crawl sessions"
```

---

### Task 5: Test IndexingService with crawl_id Propagation

**Files:**
- Create: `apps/webhook/tests/unit/test_indexing_service_crawl_id.py`
- Modify: `apps/webhook/services/indexing.py:50` (add crawl_id parameter)

**Step 1: Write failing integration test**

```bash
cat > apps/webhook/tests/unit/test_indexing_service_crawl_id.py << 'EOF'
"""Unit tests for IndexingService crawl_id propagation."""

import pytest
from sqlalchemy import select

from services.indexing import IndexingService
from domain.models import OperationMetric
from api.schemas.indexing import IndexDocumentRequest, DocumentMetadata


@pytest.mark.asyncio
async def test_indexing_service_propagates_crawl_id(db_session):
    """Test IndexingService passes crawl_id to all TimingContexts."""
    # Create test document
    doc = IndexDocumentRequest(
        url="https://example.com/test",
        markdown="# Test Document\n\nSome content here.",
        metadata=DocumentMetadata(
            url="https://example.com/test",
            title="Test Page",
        ),
    )

    # Index with crawl_id
    from infra.services import ServicePool
    pool = ServicePool.get_instance()
    indexing_service = pool.get_indexing_service()

    await indexing_service.index_document(
        doc,
        job_id="test_job_123",
        crawl_id="indexing_test_crawl"
    )

    # Verify all operations have crawl_id
    result = await db_session.execute(
        select(OperationMetric)
        .where(OperationMetric.crawl_id == "indexing_test_crawl")
        .where(OperationMetric.job_id == "test_job_123")
    )
    metrics = result.scalars().all()

    # Should have metrics for: chunking, embedding, qdrant, bm25
    assert len(metrics) >= 4

    operation_types = {m.operation_type for m in metrics}
    assert "chunking" in operation_types
    assert "embedding" in operation_types
    assert "qdrant" in operation_types or "bm25" in operation_types
EOF
```

**Step 2: Run test to verify it fails**

```bash
cd apps/webhook
uv run pytest tests/unit/test_indexing_service_crawl_id.py::test_indexing_service_propagates_crawl_id -v
```

**Expected:**
```
TypeError: index_document() got an unexpected keyword argument 'crawl_id'
```

**Step 3: Add crawl_id parameter to IndexingService.index_document**

Modify `apps/webhook/services/indexing.py` method signature (around line 50):

```python
    async def index_document(
        self,
        document: IndexDocumentRequest,
        job_id: str | None = None,
        crawl_id: str | None = None,  # NEW
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

**Step 4: Update all TimingContext calls in index_document**

Find all `TimingContext` calls in the method and add `crawl_id=crawl_id`:

```python
        # Line ~104: Chunking
        async with TimingContext(
            "chunking",
            "chunk_text",
            job_id=job_id,
            crawl_id=crawl_id,  # NEW
            document_url=document.url,
            request_id=None,
        ) as ctx:

        # Line ~137: Embedding
        async with TimingContext(
            "embedding",
            "embed_batch",
            job_id=job_id,
            crawl_id=crawl_id,  # NEW
            document_url=document.url,
            request_id=None,
        ) as ctx:

        # Line ~177: Qdrant
        async with TimingContext(
            "qdrant",
            "index_chunks",
            job_id=job_id,
            crawl_id=crawl_id,  # NEW
            document_url=document.url,
            request_id=None,
        ) as ctx:

        # Line ~216: BM25
        async with TimingContext(
            "bm25",
            "index_document",
            job_id=job_id,
            crawl_id=crawl_id,  # NEW
            document_url=document.url,
            request_id=None,
        ) as ctx:
```

**Step 5: Run test to verify it passes**

```bash
uv run pytest tests/unit/test_indexing_service_crawl_id.py::test_indexing_service_propagates_crawl_id -v
```

**Expected:**
```
PASSED
```

**Step 6: Commit**

```bash
git add apps/webhook/services/indexing.py \
        apps/webhook/tests/unit/test_indexing_service_crawl_id.py
git commit -m "feat(webhook): propagate crawl_id through IndexingService

- Add crawl_id parameter to index_document method
- Pass crawl_id to all TimingContext instances
- Enables tracking all indexing operations per crawl
- Test verifies all operation types receive crawl_id"
```

---

## Phase 3: Lifecycle Event Handling (TDD)

### Task 6: Test Crawl Start Event Handler

**Files:**
- Create: `apps/webhook/tests/integration/test_crawl_lifecycle.py`
- Modify: `apps/webhook/services/webhook_handlers.py:195` (convert to async, add handlers)

**Step 1: Write failing test for crawl start**

```bash
cat > apps/webhook/tests/integration/test_crawl_lifecycle.py << 'EOF'
"""Integration tests for crawl lifecycle tracking."""

import pytest
from datetime import datetime, UTC
from sqlalchemy import select

from api.schemas.webhook import FirecrawlLifecycleEvent
from domain.models import CrawlSession
from services.webhook_handlers import _record_crawl_start


@pytest.mark.asyncio
async def test_record_crawl_start_creates_session(db_session):
    """Test _record_crawl_start creates CrawlSession."""
    event = FirecrawlLifecycleEvent(
        id="test_crawl_start_123",
        type="crawl.started",
        success=True,
        metadata={"url": "https://example.com"},
    )

    await _record_crawl_start("test_crawl_start_123", event)

    # Verify session created
    result = await db_session.execute(
        select(CrawlSession).where(CrawlSession.crawl_id == "test_crawl_start_123")
    )
    session = result.scalar_one()

    assert session.crawl_id == "test_crawl_start_123"
    assert session.crawl_url == "https://example.com"
    assert session.status == "in_progress"
    assert session.success is None
    assert session.started_at is not None


@pytest.mark.asyncio
async def test_record_crawl_start_idempotent(db_session):
    """Test duplicate crawl.started events don't create duplicates."""
    event = FirecrawlLifecycleEvent(
        id="idempotent_crawl",
        type="crawl.started",
        success=True,
        metadata={"url": "https://example.com"},
    )

    # Call twice
    await _record_crawl_start("idempotent_crawl", event)
    await _record_crawl_start("idempotent_crawl", event)

    # Verify only one session
    result = await db_session.execute(
        select(CrawlSession).where(CrawlSession.crawl_id == "idempotent_crawl")
    )
    sessions = result.scalars().all()
    assert len(sessions) == 1
EOF
```

**Step 2: Run test to verify it fails**

```bash
cd apps/webhook
uv run pytest tests/integration/test_crawl_lifecycle.py::test_record_crawl_start_creates_session -v
```

**Expected:**
```
ImportError: cannot import name '_record_crawl_start'
```

**Step 3: Add imports to webhook_handlers.py**

Add after line 19 in `apps/webhook/services/webhook_handlers.py`:

```python
# NEW IMPORTS FOR LIFECYCLE TRACKING
from datetime import UTC, datetime
from infra.database import get_db_context
from domain.models import CrawlSession, OperationMetric
from sqlalchemy import select, func
```

**Step 4: Convert _handle_lifecycle_event to async**

Modify line 195 in `apps/webhook/services/webhook_handlers.py`:

```python
async def _handle_lifecycle_event(event: FirecrawlLifecycleEvent | Any) -> dict[str, Any]:
    """Log lifecycle events and acknowledge reception."""
```

Update caller at line 58:

```python
    if event_type in LIFECYCLE_EVENT_TYPES:
        return await _handle_lifecycle_event(event)  # Add await
```

**Step 5: Implement _record_crawl_start**

Add after _handle_lifecycle_event (line 218):

```python
async def _record_crawl_start(crawl_id: str, event: FirecrawlLifecycleEvent) -> None:
    """
    Record crawl start in CrawlSession table.

    Args:
        crawl_id: Firecrawl crawl/job identifier
        event: Lifecycle start event
    """
    crawl_url = event.metadata.get("url", "unknown")

    # Parse MCP-provided timestamp if available
    initiated_at_str = event.metadata.get("initiated_at")
    initiated_at = None
    if initiated_at_str:
        try:
            initiated_at = datetime.fromisoformat(initiated_at_str.replace("Z", "+00:00"))
        except Exception as e:
            logger.warning(
                "Failed to parse initiated_at timestamp",
                value=initiated_at_str,
                error=str(e),
            )

    try:
        async with get_db_context() as db:
            # Check if session already exists
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
        logger.error(
            "Failed to record crawl start",
            crawl_id=crawl_id,
            error=str(e),
            error_type=type(e).__name__,
        )
```

**Step 6: Call handler from _handle_lifecycle_event**

Update _handle_lifecycle_event to call handler:

```python
async def _handle_lifecycle_event(event: FirecrawlLifecycleEvent | Any) -> dict[str, Any]:
    """Process lifecycle events with crawl session tracking."""

    event_type = getattr(event, "type", None)
    crawl_id = getattr(event, "id", None)

    # Record lifecycle events
    if event_type == "crawl.started":
        await _record_crawl_start(crawl_id, event)

    # Existing logging
    metadata = getattr(event, "metadata", {})
    error = getattr(event, "error", None)

    if event_type and event_type.endswith("failed"):
        logger.error(
            "Firecrawl crawl failed",
            event_id=crawl_id,
            error=error,
            metadata=metadata,
        )
    else:
        logger.info(
            "Firecrawl lifecycle event",
            event_id=crawl_id,
            event_type=event_type,
            metadata=metadata,
        )

    return {"status": "acknowledged", "event_type": event_type}
```

**Step 7: Run tests to verify they pass**

```bash
uv run pytest tests/integration/test_crawl_lifecycle.py -v
```

**Expected:**
```
test_record_crawl_start_creates_session PASSED
test_record_crawl_start_idempotent PASSED
```

**Step 8: Commit**

```bash
git add apps/webhook/services/webhook_handlers.py \
        apps/webhook/tests/integration/test_crawl_lifecycle.py
git commit -m "feat(webhook): implement crawl start lifecycle tracking

- Convert _handle_lifecycle_event to async
- Add _record_crawl_start handler for crawl.started events
- Create CrawlSession records with idempotency
- Parse MCP-provided initiated_at timestamps
- Tests verify session creation and duplicate handling"
```

---

### Task 7: Test Crawl Completion Handler

**Files:**
- Modify: `apps/webhook/tests/integration/test_crawl_lifecycle.py` (add test)
- Modify: `apps/webhook/services/webhook_handlers.py` (add _record_crawl_complete)

**Step 1: Write failing test**

Add to `apps/webhook/tests/integration/test_crawl_lifecycle.py`:

```python
@pytest.mark.asyncio
async def test_record_crawl_complete_aggregates_metrics(db_session):
    """Test _record_crawl_complete calculates aggregate metrics."""
    from services.webhook_handlers import _record_crawl_complete

    # Create crawl session
    session = CrawlSession(
        crawl_id="complete_test_crawl",
        crawl_url="https://example.com",
        started_at=datetime.now(UTC),
        status="in_progress",
    )
    db_session.add(session)
    await db_session.commit()

    # Create some operation metrics
    from domain.models import OperationMetric

    metrics = [
        OperationMetric(
            operation_type="worker",
            operation_name="index_document",
            crawl_id="complete_test_crawl",
            document_url="https://example.com/page1",
            duration_ms=500.0,
            success=True,
        ),
        OperationMetric(
            operation_type="chunking",
            operation_name="chunk_text",
            crawl_id="complete_test_crawl",
            duration_ms=100.0,
            success=True,
        ),
        OperationMetric(
            operation_type="embedding",
            operation_name="embed_batch",
            crawl_id="complete_test_crawl",
            duration_ms=200.0,
            success=True,
        ),
    ]
    for m in metrics:
        db_session.add(m)
    await db_session.commit()

    # Complete the crawl
    event = FirecrawlLifecycleEvent(
        id="complete_test_crawl",
        type="crawl.completed",
        success=True,
        metadata={},
    )

    await _record_crawl_complete("complete_test_crawl", event)

    # Verify session updated
    result = await db_session.execute(
        select(CrawlSession).where(CrawlSession.crawl_id == "complete_test_crawl")
    )
    updated = result.scalar_one()

    assert updated.status == "completed"
    assert updated.success is True
    assert updated.completed_at is not None
    assert updated.duration_ms is not None
    assert updated.total_pages == 1  # One distinct document_url
    assert updated.total_chunking_ms == 100.0
    assert updated.total_embedding_ms == 200.0
```

**Step 2: Run test to verify it fails**

```bash
cd apps/webhook
uv run pytest tests/integration/test_crawl_lifecycle.py::test_record_crawl_complete_aggregates_metrics -v
```

**Expected:**
```
ImportError: cannot import name '_record_crawl_complete'
```

**Step 3: Implement _record_crawl_complete**

Add after _record_crawl_start in `apps/webhook/services/webhook_handlers.py`:

```python
async def _record_crawl_complete(crawl_id: str, event: FirecrawlLifecycleEvent) -> None:
    """
    Update CrawlSession with completion data and aggregate metrics.

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

            # Calculate end-to-end duration if available
            if session.initiated_at:
                session.e2e_duration_ms = (
                    completed_at - session.initiated_at
                ).total_seconds() * 1000

            # Query actual page count from operation metrics
            page_count_result = await db.execute(
                select(func.count(func.distinct(OperationMetric.document_url)))
                .select_from(OperationMetric)
                .where(OperationMetric.crawl_id == crawl_id)
                .where(OperationMetric.operation_type == "worker")
                .where(OperationMetric.operation_name == "index_document")
                .where(OperationMetric.document_url.isnot(None))
            )
            session.total_pages = page_count_result.scalar() or 0

            # Count successful vs failed
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

            # Aggregate operation timings by type
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

**Step 4: Update _handle_lifecycle_event to call handler**

```python
    if event_type == "crawl.started":
        await _record_crawl_start(crawl_id, event)
    elif event_type == "crawl.completed":
        await _record_crawl_complete(crawl_id, event)  # NEW
```

**Step 5: Run test to verify it passes**

```bash
uv run pytest tests/integration/test_crawl_lifecycle.py::test_record_crawl_complete_aggregates_metrics -v
```

**Expected:**
```
PASSED
```

**Step 6: Commit**

```bash
git add apps/webhook/services/webhook_handlers.py \
        apps/webhook/tests/integration/test_crawl_lifecycle.py
git commit -m "feat(webhook): implement crawl completion with metric aggregation

- Add _record_crawl_complete handler for crawl.completed events
- Query distinct document URLs for accurate page counts
- Aggregate operation timings by type (chunking, embedding, qdrant, bm25)
- Calculate crawl duration and end-to-end latency
- Test verifies metric aggregation and status transitions"
```

---

### Task 8: Test crawl_id Propagation Through Worker

**Files:**
- Create: `apps/webhook/tests/integration/test_worker_crawl_id.py`
- Modify: `apps/webhook/services/webhook_handlers.py:64` (extract and pass crawl_id)
- Modify: `apps/webhook/worker.py:36` (extract and pass crawl_id)

**Step 1: Write failing integration test**

```bash
cat > apps/webhook/tests/integration/test_worker_crawl_id.py << 'EOF'
"""Integration tests for crawl_id propagation through worker."""

import pytest
from sqlalchemy import select

from domain.models import OperationMetric
from worker import _index_document_async


@pytest.mark.asyncio
async def test_worker_propagates_crawl_id(db_session):
    """Test worker passes crawl_id to IndexingService."""
    document_dict = {
        "url": "https://example.com/worker-test",
        "markdown": "# Worker Test\n\nContent here.",
        "metadata": {
            "url": "https://example.com/worker-test",
            "title": "Worker Test",
        },
        "crawl_id": "worker_test_crawl",  # NEW
    }

    result = await _index_document_async(document_dict)

    assert result.get("success") is True

    # Verify operations have crawl_id
    db_result = await db_session.execute(
        select(OperationMetric)
        .where(OperationMetric.crawl_id == "worker_test_crawl")
        .where(OperationMetric.document_url == "https://example.com/worker-test")
    )
    metrics = db_result.scalars().all()

    assert len(metrics) >= 2  # At least worker + one operation
    assert all(m.crawl_id == "worker_test_crawl" for m in metrics)
EOF
```

**Step 2: Run test to verify it fails**

```bash
cd apps/webhook
uv run pytest tests/integration/test_worker_crawl_id.py::test_worker_propagates_crawl_id -v
```

**Expected:** Test passes but asserts fail (no crawl_id in metrics)

**Step 3: Update _handle_page_event to extract and pass crawl_id**

Modify `apps/webhook/services/webhook_handlers.py` _handle_page_event (line 64):

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
        # ... existing error handling ...

    # ... existing code ...

    with queue.connection.pipeline() as pipe:
        for idx, document in enumerate(documents):
            try:
                index_payload = _document_to_index_payload(document)

                # NEW: Add crawl_id to payload
                if crawl_id:
                    index_payload["crawl_id"] = crawl_id

                # ... rest of queueing logic ...
```

**Step 4: Update worker._index_document_async to extract crawl_id**

Modify `apps/webhook/worker.py` _index_document_async (line 36):

```python
async def _index_document_async(document_dict: dict[str, Any]) -> dict[str, Any]:
    """
    Async implementation of document indexing with crawl_id propagation.

    Args:
        document_dict: Document data including optional crawl_id

    Returns:
        Indexing result
    """
    # Generate job ID
    job_id = str(uuid4())

    # NEW: Extract crawl_id BEFORE parsing (not in schema)
    crawl_id = document_dict.get("crawl_id")

    logger.info(
        "Starting indexing job",
        url=document_dict.get("url"),
        crawl_id=crawl_id,  # NEW
    )

    try:
        # Parse document
        try:
            document = IndexDocumentRequest(**document_dict)
        except Exception as parse_error:
            logger.error(
                "Failed to parse document payload",
                url=document_dict.get("url"),
                crawl_id=crawl_id,  # NEW
                error=str(parse_error),
            )
            raise

        # ... existing service pool code ...

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
                crawl_id=crawl_id,  # NEW
            )
            # ... rest of method ...
```

**Step 5: Run test to verify it passes**

```bash
uv run pytest tests/integration/test_worker_crawl_id.py::test_worker_propagates_crawl_id -v
```

**Expected:**
```
PASSED
```

**Step 6: Commit**

```bash
git add apps/webhook/services/webhook_handlers.py \
        apps/webhook/worker.py \
        apps/webhook/tests/integration/test_worker_crawl_id.py
git commit -m "feat(webhook): propagate crawl_id through page events to worker

- Extract crawl_id from FirecrawlPageEvent in handler
- Add crawl_id to job payload for worker
- Worker extracts crawl_id before schema parsing
- Pass crawl_id to IndexingService and TimingContext
- Test verifies end-to-end propagation through queue"
```

---

## Phase 4: API Endpoints (TDD)

### Task 9: Test Crawl Metrics Response Schemas

**Files:**
- Create: `apps/webhook/api/schemas/metrics.py`
- Create: `apps/webhook/tests/unit/test_metrics_schemas.py`
- Modify: `apps/webhook/api/schemas/__init__.py`

**Step 1: Write failing test for schemas**

```bash
cat > apps/webhook/tests/unit/test_metrics_schemas.py << 'EOF'
"""Unit tests for metrics response schemas."""

import pytest
from datetime import datetime, UTC

from api.schemas.metrics import (
    OperationTimingSummary,
    PerPageMetric,
    CrawlMetricsResponse,
)


def test_operation_timing_summary_defaults():
    """Test OperationTimingSummary has correct defaults."""
    summary = OperationTimingSummary()
    assert summary.chunking_ms == 0.0
    assert summary.embedding_ms == 0.0
    assert summary.qdrant_ms == 0.0
    assert summary.bm25_ms == 0.0


def test_crawl_metrics_response_complete():
    """Test CrawlMetricsResponse with all fields."""
    response = CrawlMetricsResponse(
        crawl_id="test_123",
        crawl_url="https://example.com",
        status="completed",
        success=True,
        started_at=datetime.now(UTC),
        completed_at=datetime.now(UTC),
        duration_ms=5000.0,
        total_pages=10,
        pages_indexed=9,
        pages_failed=1,
        aggregate_timing=OperationTimingSummary(
            chunking_ms=500.0,
            embedding_ms=1500.0,
        ),
    )

    assert response.crawl_id == "test_123"
    assert response.total_pages == 10
    assert response.aggregate_timing.chunking_ms == 500.0
EOF
```

**Step 2: Run test to verify it fails**

```bash
cd apps/webhook
uv run pytest tests/unit/test_metrics_schemas.py -v
```

**Expected:**
```
ModuleNotFoundError: No module named 'api.schemas.metrics'
```

**Step 3: Create metrics schemas**

```bash
cat > apps/webhook/api/schemas/metrics.py << 'EOF'
"""Response schemas for metrics API endpoints."""

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
    operation_type: str = Field(..., description="Operation type")
    operation_name: str = Field(..., description="Operation name")
    duration_ms: float = Field(..., description="Duration in milliseconds")
    success: bool = Field(..., description="Whether operation succeeded")
    timestamp: datetime = Field(..., description="When operation occurred")


class CrawlMetricsResponse(BaseModel):
    """Comprehensive metrics for a crawl session."""

    crawl_id: str = Field(..., description="Firecrawl crawl identifier")
    crawl_url: str = Field(..., description="Base URL that was crawled")
    status: str = Field(..., description="Crawl status")
    success: bool | None = Field(None, description="Whether crawl succeeded")

    started_at: datetime = Field(..., description="When crawl started")
    completed_at: datetime | None = Field(None, description="When crawl completed")
    duration_ms: float | None = Field(None, description="Crawl duration in milliseconds")
    e2e_duration_ms: float | None = Field(None, description="End-to-end duration from MCP")

    total_pages: int = Field(..., description="Total pages processed")
    pages_indexed: int = Field(..., description="Successfully indexed pages")
    pages_failed: int = Field(..., description="Failed pages")

    aggregate_timing: OperationTimingSummary = Field(..., description="Aggregate operation timings")

    per_page_metrics: list[PerPageMetric] | None = Field(None, description="Per-page details")

    error_message: str | None = Field(None, description="Error message if failed")
    extra_metadata: dict[str, Any] | None = Field(None, description="Additional metadata")


class CrawlListResponse(BaseModel):
    """List of recent crawl sessions."""

    crawls: list[CrawlMetricsResponse] = Field(..., description="List of crawl sessions")
    total: int = Field(..., description="Total number of crawls matching query")
EOF
```

**Step 4: Update __init__.py exports**

Add to `apps/webhook/api/schemas/__init__.py`:

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

**Step 5: Run test to verify it passes**

```bash
uv run pytest tests/unit/test_metrics_schemas.py -v
```

**Expected:**
```
PASSED (3 tests)
```

**Step 6: Commit**

```bash
git add apps/webhook/api/schemas/metrics.py \
        apps/webhook/api/schemas/__init__.py \
        apps/webhook/tests/unit/test_metrics_schemas.py
git commit -m "feat(webhook): add metrics response schemas

- Create OperationTimingSummary for aggregate timings
- Create CrawlMetricsResponse for detailed crawl metrics
- Create CrawlListResponse for paginated results
- Add PerPageMetric for optional detailed breakdowns
- Tests verify schema validation and defaults"
```

---

### Task 10: Test GET /api/metrics/crawls/{crawl_id} Endpoint

**Files:**
- Create: `apps/webhook/tests/integration/test_metrics_api.py`
- Modify: `apps/webhook/api/routers/metrics.py:166` (add endpoint)

**Step 1: Write failing API test**

```bash
cat > apps/webhook/tests/integration/test_metrics_api.py << 'EOF'
"""Integration tests for crawl metrics API endpoints."""

import pytest
from httpx import AsyncClient
from datetime import datetime, UTC

from domain.models import CrawlSession
from config import settings


@pytest.mark.asyncio
async def test_get_crawl_metrics_success(client: AsyncClient, db_session):
    """Test GET /api/metrics/crawls/{crawl_id} returns metrics."""
    # Create test session
    session = CrawlSession(
        crawl_id="api_test_crawl",
        crawl_url="https://example.com",
        started_at=datetime.now(UTC),
        completed_at=datetime.now(UTC),
        status="completed",
        success=True,
        total_pages=5,
        pages_indexed=4,
        pages_failed=1,
        duration_ms=3000.0,
        total_embedding_ms=800.0,
        total_qdrant_ms=500.0,
    )
    db_session.add(session)
    await db_session.commit()

    # Request metrics
    headers = {"X-API-Secret": settings.api_secret}
    response = await client.get(
        "/api/metrics/crawls/api_test_crawl",
        headers=headers
    )

    assert response.status_code == 200
    data = response.json()
    assert data["crawl_id"] == "api_test_crawl"
    assert data["status"] == "completed"
    assert data["total_pages"] == 5
    assert data["aggregate_timing"]["embedding_ms"] == 800.0


@pytest.mark.asyncio
async def test_get_crawl_metrics_not_found(client: AsyncClient):
    """Test GET /api/metrics/crawls/{crawl_id} returns 404 for unknown crawl."""
    headers = {"X-API-Secret": settings.api_secret}
    response = await client.get(
        "/api/metrics/crawls/nonexistent_crawl",
        headers=headers
    )

    assert response.status_code == 404
EOF
```

**Step 2: Run test to verify it fails**

```bash
cd apps/webhook
uv run pytest tests/integration/test_metrics_api.py::test_get_crawl_metrics_success -v
```

**Expected:**
```
404 (endpoint doesn't exist yet)
```

**Step 3: Add endpoint to metrics router**

Add imports to `apps/webhook/api/routers/metrics.py` (after line 17):

```python
from fastapi import HTTPException  # NEW
from api.schemas.metrics import (
    CrawlMetricsResponse,
    CrawlListResponse,
    OperationTimingSummary,
    PerPageMetric,
)
from domain.models import CrawlSession  # Add to existing import
```

Add endpoint after line 166:

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
```

**Step 4: Run tests to verify they pass**

```bash
uv run pytest tests/integration/test_metrics_api.py -v
```

**Expected:**
```
test_get_crawl_metrics_success PASSED
test_get_crawl_metrics_not_found PASSED
```

**Step 5: Commit**

```bash
git add apps/webhook/api/routers/metrics.py \
        apps/webhook/tests/integration/test_metrics_api.py
git commit -m "feat(webhook): add GET /api/metrics/crawls/{crawl_id} endpoint

- Fetch CrawlSession by crawl_id
- Return comprehensive metrics with aggregate timings
- Optional per-page operation details via query param
- Return 404 for unknown crawl_id
- Tests verify success and error cases"
```

---

## Phase 5: Deployment & Verification

### Task 11: Manual Verification Checklist

**Files:**
- None (manual testing)

**Step 1: Apply all migrations in production**

```bash
docker exec pulse_webhook bash -c "cd /app && uv run alembic upgrade head"
```

**Expected:** Migrations applied successfully

**Step 2: Verify tables created**

```bash
docker exec pulse_postgres psql -U firecrawl -d pulse_postgres -c \
  "SELECT table_name FROM information_schema.tables WHERE table_schema='webhook' AND table_name IN ('crawl_sessions', 'operation_metrics');"
```

**Expected:**
```
 table_name
------------------
 crawl_sessions
 operation_metrics
```

**Step 3: Restart webhook service**

```bash
docker compose restart pulse_webhook pulse_webhook-worker
```

**Step 4: Trigger real crawl via MCP**

Use Claude with MCP tools to trigger a crawl, then check database:

```bash
docker exec pulse_postgres psql -U firecrawl -d pulse_postgres -c \
  "SELECT crawl_id, status, total_pages, duration_ms FROM webhook.crawl_sessions ORDER BY started_at DESC LIMIT 1;"
```

**Expected:** Recent crawl session with metrics populated

**Step 5: Query metrics API**

```bash
CRAWL_ID="<from-previous-query>"
curl -H "X-API-Secret: ${WEBHOOK_API_SECRET}" \
  http://localhost:50108/api/metrics/crawls/${CRAWL_ID}
```

**Expected:** JSON response with aggregate timings

**Step 6: Document completion**

Create `.docs/sessions/2025-11-13-timing-instrumentation-completion.md`:

```markdown
# Timing Instrumentation Implementation - Completion

**Date:** 2025-11-13
**Duration:** <hours>
**Status:** ✅ Complete

## Summary

Implemented complete crawl lifecycle tracking with aggregate timing metrics.

## Commits

- feat(webhook): add CrawlSession model for lifecycle tracking
- feat(webhook): add crawl_id to OperationMetric for correlation
- feat(webhook): add foreign key constraint for crawl_id
- feat(webhook): add crawl_id parameter to TimingContext
- feat(webhook): propagate crawl_id through IndexingService
- feat(webhook): implement crawl start lifecycle tracking
- feat(webhook): implement crawl completion with metric aggregation
- feat(webhook): propagate crawl_id through page events to worker
- feat(webhook): add metrics response schemas
- feat(webhook): add GET /api/metrics/crawls/{crawl_id} endpoint

## Verification

- All unit tests passing: <count>
- All integration tests passing: <count>
- Database migrations applied successfully
- Real crawl tracked end-to-end
- Metrics API returns correct aggregates

## Known Issues

None
```

---

## Success Criteria

After completing all tasks, verify:

1. **Database Schema**
   - `crawl_sessions` table exists with correct columns and indexes
   - `operation_metrics.crawl_id` column exists with FK constraint
   - Migrations reversible (test with `alembic downgrade -1`)

2. **Functionality**
   - crawl.started events create CrawlSession records
   - crawl.completed events aggregate metrics correctly
   - Operation metrics store crawl_id throughout pipeline
   - API returns accurate metrics for crawl sessions

3. **Test Coverage**
   - All unit tests passing (models, schemas, timing context)
   - All integration tests passing (lifecycle, worker, API)
   - Manual verification with real crawl successful

4. **Code Quality**
   - Type hints on all new functions
   - Docstrings on all public methods
   - Commits atomic with clear messages
   - No hardcoded values or secrets

---

## Plan Complete

**Plan saved to:** `docs/plans/2025-11-13-timing-instrumentation-tdd.md`

**Two execution options:**

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
