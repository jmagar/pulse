"""
Tests for content storage service.

These tests verify the permanent storage of Firecrawl scraped content.
"""

import hashlib
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock

import pytest


@pytest.mark.asyncio
async def test_store_scraped_content_creates_record():
    """Test storing a single scraped document creates a record."""
    from services.content_storage import store_scraped_content

    # Mock database session
    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None  # No existing content
    mock_session.execute.return_value = mock_result

    document = {
        "markdown": "# Test Document\n\nThis is a test.",
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

    # Verify record was created with correct fields
    assert result.markdown == "# Test Document\n\nThis is a test."
    assert result.html == "<h1>Test Document</h1><p>This is a test.</p>"
    assert result.content_hash is not None
    assert result.crawl_session_id == "test-session-123"
    assert result.url == "https://example.com/test"
    assert result.source_url == "https://example.com/test"
    assert result.content_source == "firecrawl_scrape"

    # Verify session methods were called
    mock_session.add.assert_called_once()
    mock_session.flush.assert_called_once()


@pytest.mark.asyncio
async def test_store_scraped_content_deduplication():
    """Test that duplicate content is not stored twice."""
    from services.content_storage import store_scraped_content
    from domain.models import ScrapedContent

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

    # Mock database session to return existing content
    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = existing_content
    mock_session.execute.return_value = mock_result

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

    # Should return existing content without creating new record
    assert result is existing_content
    assert result.id == 42
    mock_session.add.assert_not_called()
    mock_session.flush.assert_not_called()


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
    from services.content_storage import get_content_by_url
    from domain.models import ScrapedContent

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
    from services.content_storage import get_content_by_session
    from domain.models import ScrapedContent

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
