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
