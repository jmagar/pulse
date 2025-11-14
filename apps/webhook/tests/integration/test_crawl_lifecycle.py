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
