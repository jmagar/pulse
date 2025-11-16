"""
Tests for content storage service.

These tests verify the permanent storage of Firecrawl scraped content.
"""

import hashlib
from unittest.mock import AsyncMock, MagicMock

import pytest


@pytest.mark.asyncio
async def test_store_scraped_content_creates_record():
    """Test storing a single scraped document creates a record."""
    from domain.models import ScrapedContent
    from services.content_storage import store_scraped_content

    # Mock database session - INSERT ON CONFLICT returns new record
    markdown = "# Test Document\n\nThis is a test."
    content_hash = hashlib.sha256(markdown.encode("utf-8")).hexdigest()
    new_content = ScrapedContent(
        id=1,
        crawl_session_id="test-session-123",
        url="https://example.com/test",
        source_url="https://example.com/test",
        content_source="firecrawl_scrape",
        markdown=markdown,
        html="<h1>Test Document</h1><p>This is a test.</p>",
        content_hash=content_hash,
        extra_metadata={"sourceURL": "https://example.com/test"}
    )

    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = new_content  # INSERT succeeded
    mock_session.execute.return_value = mock_result

    document = {
        "markdown": markdown,
        "html": "<h1>Test Document</h1><p>This is a test.</p>",
        "metadata": {"sourceURL": "https://example.com/test"}
    }

    result = await store_scraped_content(
        session=mock_session,
        crawl_session_id="test-session-123",
        url="https://example.com/test",
        document=document,
        content_source="firecrawl_scrape"
    )

    # Verify correct record was returned
    assert result is new_content
    assert result.markdown == markdown
    assert result.html == "<h1>Test Document</h1><p>This is a test.</p>"
    assert result.content_hash == content_hash
    assert result.crawl_session_id == "test-session-123"
    assert result.url == "https://example.com/test"
    assert result.source_url == "https://example.com/test"
    assert result.content_source == "firecrawl_scrape"

    # Verify flush was called (new INSERT ON CONFLICT implementation)
    mock_session.flush.assert_called_once()


@pytest.mark.asyncio
async def test_store_scraped_content_deduplication():
    """Test that duplicate content is not stored twice."""
    from domain.models import ScrapedContent
    from services.content_storage import store_scraped_content

    # Create existing content record
    markdown = "# Test Document\n\nThis is a test."
    content_hash = hashlib.sha256(markdown.encode("utf-8")).hexdigest()
    existing_content = ScrapedContent(
        id=42,
        crawl_session_id="test-session-123",
        url="https://example.com/test",
        source_url="https://example.com/test",
        content_source="firecrawl_scrape",
        markdown=markdown,
        content_hash=content_hash,
        extra_metadata={}
    )

    # Mock database session for INSERT ON CONFLICT deduplication
    # First execute (INSERT ON CONFLICT) returns None (conflict occurred)
    # Second execute (SELECT existing) returns existing_content
    mock_session = AsyncMock()

    mock_insert_result = MagicMock()
    mock_insert_result.scalar_one_or_none.return_value = None  # Conflict

    mock_select_result = MagicMock()
    mock_select_result.scalar_one.return_value = existing_content

    # Mock execute to return different results for INSERT vs SELECT
    mock_session.execute.side_effect = [mock_insert_result, mock_select_result]

    document = {
        "markdown": markdown,
        "metadata": {"sourceURL": "https://example.com/test"}
    }

    result = await store_scraped_content(
        session=mock_session,
        crawl_session_id="test-session-123",
        url="https://example.com/test",
        document=document,
        content_source="firecrawl_scrape"
    )

    # Should return existing content (fetched via SELECT after conflict)
    assert result is existing_content
    assert result.id == 42

    # Verify two executes: INSERT ON CONFLICT, then SELECT
    assert mock_session.execute.call_count == 2


@pytest.mark.asyncio
async def test_store_content_async(monkeypatch):
    """Test fire-and-forget async storage."""
    from services.content_storage import store_content_async

    # Track calls to store_scraped_content
    stored_docs = []

    async def mock_store(session, crawl_session_id, url, document, content_source):
        stored_docs.append({"url": url, "markdown": document.get("markdown", "")})
        return MagicMock(id=len(stored_docs))

    # Mock get_db_context
    class MockContextManager:
        async def __aenter__(self):
            return AsyncMock()

        async def __aexit__(self, *args):
            pass

    def mock_get_db_context():
        return MockContextManager()

    monkeypatch.setattr("services.content_storage.store_scraped_content", mock_store)
    monkeypatch.setattr("infra.database.get_db_context", mock_get_db_context)

    documents = [
        {"markdown": "# Doc 1", "metadata": {"sourceURL": "https://example.com/1"}},
        {"markdown": "# Doc 2", "metadata": {"sourceURL": "https://example.com/2"}},
    ]

    await store_content_async(
        crawl_session_id="test-session",
        documents=documents,
        content_source="firecrawl_batch"
    )

    # Verify all documents were stored
    assert len(stored_docs) == 2
    assert stored_docs[0]["url"] == "https://example.com/1"
    assert stored_docs[1]["url"] == "https://example.com/2"


@pytest.mark.asyncio
async def test_get_content_by_url():
    """Test retrieving content by URL."""
    from domain.models import ScrapedContent
    from services.content_storage import get_content_by_url

    # Create mock content records
    content1 = ScrapedContent(
        id=1,
        url="https://example.com/test",
        crawl_session_id="session-1",
        content_source="firecrawl_scrape",
        markdown="# Version 1",
        content_hash="hash1",
        extra_metadata={}
    )
    content2 = ScrapedContent(
        id=2,
        url="https://example.com/test",
        crawl_session_id="session-2",
        content_source="firecrawl_scrape",
        markdown="# Version 2",
        content_hash="hash2",
        extra_metadata={}
    )

    # Mock database session
    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_scalars = MagicMock()
    mock_scalars.all.return_value = [content2, content1]  # Newest first
    mock_result.scalars.return_value = mock_scalars
    mock_session.execute.return_value = mock_result

    results = await get_content_by_url(
        session=mock_session,
        url="https://example.com/test",
        limit=10
    )

    # Verify results are ordered newest first
    assert len(results) == 2
    assert results[0].id == 2
    assert results[1].id == 1


@pytest.mark.asyncio
async def test_get_content_by_session():
    """Test retrieving content by session ID."""
    from domain.models import ScrapedContent
    from services.content_storage import get_content_by_session

    # Create mock content records
    content1 = ScrapedContent(
        id=1,
        url="https://example.com/page1",
        crawl_session_id="session-123",
        content_source="firecrawl_crawl",
        markdown="# Page 1",
        content_hash="hash1",
        extra_metadata={}
    )
    content2 = ScrapedContent(
        id=2,
        url="https://example.com/page2",
        crawl_session_id="session-123",
        content_source="firecrawl_crawl",
        markdown="# Page 2",
        content_hash="hash2",
        extra_metadata={}
    )

    # Mock database session
    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_scalars = MagicMock()
    mock_scalars.all.return_value = [content1, content2]  # Oldest first
    mock_result.scalars.return_value = mock_scalars
    mock_session.execute.return_value = mock_result

    results = await get_content_by_session(
        session=mock_session,
        crawl_session_id="session-123"
    )

    # Verify results are ordered oldest first
    assert len(results) == 2
    assert results[0].id == 1
    assert results[1].id == 2


@pytest.mark.asyncio
async def test_concurrent_duplicate_insert_handling(db_session):
    """Test that concurrent duplicate inserts are handled gracefully (ON CONFLICT)."""
    import asyncio

    from domain.models import CrawlSession, ScrapedContent
    from services.content_storage import store_scraped_content

    # Create crawl session
    crawl_session = CrawlSession(
        job_id="concurrent-test",
        base_url="https://example.com",
        status="processing",
    )
    db_session.add(crawl_session)
    await db_session.commit()

    # Identical document data
    document = {
        "markdown": "# Test Content",
        "html": "<h1>Test Content</h1>",
        "metadata": {"sourceURL": "https://example.com/page"},
    }

    # Simulate concurrent inserts (race condition scenario)
    async def insert_content():
        # Each coroutine gets its own session
        from infra.database import get_db_context
        async with get_db_context() as session:
            result = await store_scraped_content(
                session=session,
                crawl_session_id="concurrent-test",
                url="https://example.com/page",
                document=document,
                content_source="firecrawl_scrape"
            )
            await session.commit()
            return result

    # Launch two concurrent inserts
    results = await asyncio.gather(
        insert_content(),
        insert_content(),
        return_exceptions=False  # Should NOT raise exceptions
    )

    # Both should succeed (one inserts, one returns existing)
    assert len(results) == 2
    assert results[0] is not None
    assert results[1] is not None

    # Should have same ID (same record returned)
    assert results[0].id == results[1].id
    assert results[0].content_hash == results[1].content_hash

    # Verify only ONE record in database
    from sqlalchemy import func, select
    count_result = await db_session.execute(
        select(func.count(ScrapedContent.id)).where(
            ScrapedContent.crawl_session_id == "concurrent-test"
        )
    )
    count = count_result.scalar()
    assert count == 1, f"Expected 1 record, found {count}"


@pytest.mark.asyncio
async def test_storage_failure_metrics_recorded(db_session):
    """Test that storage failures are recorded in operation_metrics."""
    from sqlalchemy import select

    # Create crawl session
    from domain.models import CrawlSession, OperationMetric
    from services.content_storage import store_content_async
    crawl_session = CrawlSession(
        job_id="metrics-test",
        base_url="https://example.com",
        status="processing",
    )
    db_session.add(crawl_session)
    await db_session.commit()

    # Document with invalid data (will cause error)
    invalid_document = {
        "metadata": {},  # Missing sourceURL
        # Missing markdown field will cause hash error
    }

    # Call fire-and-forget storage (should not raise)
    await store_content_async(
        crawl_session_id="metrics-test",
        documents=[invalid_document],
        content_source="firecrawl_scrape"
    )

    # Give async operation time to complete
    import asyncio
    await asyncio.sleep(0.5)

    # Check operation_metrics table for failure record
    result = await db_session.execute(
        select(OperationMetric).where(
            OperationMetric.operation_type == "content_storage",
            OperationMetric.crawl_id == "metrics-test"
        )
    )
    metrics = result.scalars().all()

    assert len(metrics) == 1, "Expected 1 metric record"
    metric = metrics[0]
    assert metric.success is False, "Expected failure to be recorded"
    assert metric.error_message is not None, "Expected error message"
    assert "sourceURL" in metric.error_message or "markdown" in metric.error_message


@pytest.mark.asyncio
async def test_storage_success_metrics_recorded(db_session):
    """Test that successful storage is recorded in operation_metrics."""
    from sqlalchemy import select

    # Create crawl session
    from domain.models import CrawlSession, OperationMetric
    from services.content_storage import store_content_async
    crawl_session = CrawlSession(
        job_id="success-metrics-test",
        base_url="https://example.com",
        status="processing",
    )
    db_session.add(crawl_session)
    await db_session.commit()

    # Valid document
    document = {
        "markdown": "# Test",
        "metadata": {"sourceURL": "https://example.com/page"},
    }

    # Call fire-and-forget storage
    await store_content_async(
        crawl_session_id="success-metrics-test",
        documents=[document],
        content_source="firecrawl_scrape"
    )

    # Give async operation time to complete
    import asyncio
    await asyncio.sleep(0.5)

    # Check operation_metrics table for success record
    result = await db_session.execute(
        select(OperationMetric).where(
            OperationMetric.operation_type == "content_storage",
            OperationMetric.crawl_id == "success-metrics-test"
        )
    )
    metrics = result.scalars().all()

    assert len(metrics) == 1, "Expected 1 metric record"
    metric = metrics[0]
    assert metric.success is True, "Expected success to be recorded"
    assert metric.error_message is None, "Expected no error message"
    assert metric.extra_metadata.get("stored_count") == 1
