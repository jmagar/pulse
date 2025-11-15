"""Unit tests for crawl_id foreign key constraint."""

from datetime import UTC, datetime

import pytest
from sqlalchemy import select

from domain.models import CrawlSession, OperationMetric


@pytest.mark.asyncio
async def test_operation_metric_fk_constraint_valid(db_session):
    """Test OperationMetric with valid crawl_id reference."""
    # Create crawl session first
    session = CrawlSession(
        job_id="fk_test_crawl",
        base_url="https://example.com",
        operation_type="crawl",
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
        job_id="cascade_test",
        base_url="https://example.com",
        operation_type="crawl",
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
