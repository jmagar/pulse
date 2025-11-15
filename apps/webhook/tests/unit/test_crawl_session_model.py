"""Unit tests for CrawlSession model."""

from datetime import UTC, datetime

import pytest
from sqlalchemy import select

from domain.models import CrawlSession


@pytest.mark.asyncio
async def test_crawl_session_creation(db_session):
    """Test creating a CrawlSession with required fields."""
    session = CrawlSession(
        job_id="test_crawl_123",
        base_url="https://example.com",
        operation_type="crawl",
        started_at=datetime.now(UTC),
        status="in_progress",
    )
    db_session.add(session)
    await db_session.commit()

    result = await db_session.execute(
        select(CrawlSession).where(CrawlSession.job_id == "test_crawl_123")
    )
    fetched = result.scalar_one()

    assert fetched.job_id == "test_crawl_123"
    assert fetched.status == "in_progress"
    assert fetched.total_pages == 0
    assert fetched.total_chunking_ms == 0.0
    assert fetched.success is None
