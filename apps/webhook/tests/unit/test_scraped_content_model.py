"""Unit tests for ScrapedContent model."""

from datetime import UTC, datetime

import pytest
from sqlalchemy import select

from domain.models import CrawlSession, ScrapedContent


@pytest.mark.asyncio
async def test_create_scraped_content(db_session):
    """Test creating a ScrapedContent record."""
    # First create a CrawlSession since ScrapedContent has FK constraint
    session = CrawlSession(
        job_id="test-job-123",
        base_url="https://example.com",
        operation_type="scrape",
        started_at=datetime.now(UTC),
        status="active"
    )
    db_session.add(session)
    await db_session.flush()

    content = ScrapedContent(
        crawl_session_id="test-job-123",
        url="https://example.com",
        content_source="firecrawl_scrape",
        markdown="# Test",
        content_hash="abc123"
    )

    db_session.add(content)
    await db_session.flush()

    assert content.id is not None
    assert content.url == "https://example.com"
    assert content.content_source == "firecrawl_scrape"
    assert content.markdown == "# Test"
    assert content.content_hash == "abc123"


@pytest.mark.asyncio
async def test_scraped_content_all_fields(db_session):
    """Test ScrapedContent with all optional fields populated."""
    session = CrawlSession(
        job_id="test-job-456",
        base_url="https://example.com",
        operation_type="crawl",
        started_at=datetime.now(UTC),
        status="active"
    )
    db_session.add(session)
    await db_session.flush()

    content = ScrapedContent(
        crawl_session_id="test-job-456",
        url="https://example.com/page1",
        source_url="https://example.com/source",
        content_source="firecrawl_crawl",
        markdown="# Page 1",
        html="<h1>Page 1</h1>",
        links={"internal": ["https://example.com/page2"], "external": []},
        screenshot="https://example.com/screenshot.png",
        extra_metadata={"statusCode": 200, "title": "Page 1"},
        content_hash="hash123"
    )

    db_session.add(content)
    await db_session.commit()

    result = await db_session.execute(
        select(ScrapedContent).where(ScrapedContent.url == "https://example.com/page1")
    )
    fetched = result.scalar_one()

    assert fetched.url == "https://example.com/page1"
    assert fetched.source_url == "https://example.com/source"
    assert fetched.content_source == "firecrawl_crawl"
    assert fetched.markdown == "# Page 1"
    assert fetched.html == "<h1>Page 1</h1>"
    assert fetched.links == {"internal": ["https://example.com/page2"], "external": []}
    assert fetched.screenshot == "https://example.com/screenshot.png"
    assert fetched.extra_metadata == {"statusCode": 200, "title": "Page 1"}
    assert fetched.content_hash == "hash123"
    assert fetched.scraped_at is not None
    assert fetched.created_at is not None
    assert fetched.updated_at is not None


@pytest.mark.asyncio
async def test_crawl_session_relationship(db_session):
    """Test relationship between CrawlSession and ScrapedContent."""
    session = CrawlSession(
        job_id="test-123",
        base_url="https://example.com",
        operation_type="crawl",
        started_at=datetime.now(UTC),
        status="active"
    )
    db_session.add(session)
    await db_session.flush()

    content1 = ScrapedContent(
        crawl_session_id=session.job_id,
        url="https://example.com/page1",
        content_source="firecrawl_crawl",
        markdown="# Page 1",
        content_hash="hash1"
    )
    content2 = ScrapedContent(
        crawl_session_id=session.job_id,
        url="https://example.com/page2",
        content_source="firecrawl_crawl",
        markdown="# Page 2",
        content_hash="hash2"
    )
    db_session.add(content1)
    db_session.add(content2)
    await db_session.commit()

    # Verify relationship
    result = await db_session.execute(
        select(CrawlSession).where(CrawlSession.job_id == "test-123")
    )
    loaded_session = result.scalar_one()

    assert len(loaded_session.scraped_contents) == 2
    assert loaded_session.scraped_contents[0].url == "https://example.com/page1"
    assert loaded_session.scraped_contents[1].url == "https://example.com/page2"


@pytest.mark.asyncio
async def test_cascade_delete(db_session):
    """Test that deleting CrawlSession cascades to ScrapedContent."""
    session = CrawlSession(
        job_id="test-cascade-123",
        base_url="https://example.com",
        operation_type="crawl",
        started_at=datetime.now(UTC),
        status="active"
    )
    db_session.add(session)
    await db_session.flush()

    content = ScrapedContent(
        crawl_session_id=session.job_id,
        url="https://example.com/page1",
        content_source="firecrawl_crawl",
        markdown="# Page 1",
        content_hash="hash1"
    )
    db_session.add(content)
    await db_session.commit()

    # Delete the session
    await db_session.delete(session)
    await db_session.commit()

    # Verify content was also deleted
    result = await db_session.execute(
        select(ScrapedContent).where(ScrapedContent.crawl_session_id == "test-cascade-123")
    )
    fetched = result.scalars().all()

    assert len(fetched) == 0
