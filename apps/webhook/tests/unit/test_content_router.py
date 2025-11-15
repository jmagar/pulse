"""
Unit tests for content router.

Tests the content API router logic without database integration.
"""

from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException

from api.routers.content import get_content_for_session, get_content_for_url
from domain.models import ScrapedContent


@pytest.mark.asyncio
async def test_get_content_for_url_returns_content():
    """Test get_content_for_url returns formatted response."""
    # Create mock session
    mock_session = AsyncMock()

    # Create mock content
    mock_content = MagicMock(spec=ScrapedContent)
    mock_content.id = 1
    mock_content.url = "https://example.com/test"
    mock_content.markdown = "# Test"
    mock_content.html = "<h1>Test</h1>"
    mock_content.extra_metadata = {"title": "Test Page"}
    mock_content.scraped_at.isoformat.return_value = "2025-01-15T00:00:00+00:00"
    mock_content.crawl_session_id = "test-session"

    # Mock the service function
    async def mock_get_content_by_url(session, url, limit):
        return [mock_content]

    # Patch the service function
    import api.routers.content as content_module

    original_func = content_module.get_content_by_url
    content_module.get_content_by_url = mock_get_content_by_url

    try:
        # Call the endpoint
        result = await get_content_for_url(
            url="https://example.com/test",
            limit=10,
            session=mock_session,
            _verified=None,
        )

        # Verify response
        assert len(result) == 1
        assert result[0].url == "https://example.com/test"
        assert result[0].markdown == "# Test"
        assert result[0].html == "<h1>Test</h1>"
        assert result[0].metadata == {"title": "Test Page"}
        assert result[0].crawl_session_id == "test-session"
    finally:
        content_module.get_content_by_url = original_func


@pytest.mark.asyncio
async def test_get_content_for_url_raises_404_when_empty():
    """Test get_content_for_url raises 404 when no content found."""
    mock_session = AsyncMock()

    # Mock the service function to return empty list
    async def mock_get_content_by_url(session, url, limit):
        return []

    import api.routers.content as content_module

    original_func = content_module.get_content_by_url
    content_module.get_content_by_url = mock_get_content_by_url

    try:
        with pytest.raises(HTTPException) as exc_info:
            await get_content_for_url(
                url="https://nonexistent.com",
                limit=10,
                session=mock_session,
                _verified=None,
            )

        assert exc_info.value.status_code == 404
        assert "No content found" in exc_info.value.detail
    finally:
        content_module.get_content_by_url = original_func


@pytest.mark.asyncio
async def test_get_content_for_session_returns_content():
    """Test get_content_for_session returns formatted response."""
    mock_session = AsyncMock()

    # Create mock content
    mock_content = MagicMock(spec=ScrapedContent)
    mock_content.id = 2
    mock_content.url = "https://example.com/page1"
    mock_content.markdown = "# Page 1"
    mock_content.html = None
    mock_content.extra_metadata = {}
    mock_content.scraped_at.isoformat.return_value = "2025-01-15T01:00:00+00:00"
    mock_content.crawl_session_id = "crawl-123"

    # Mock the service function
    async def mock_get_content_by_session(session, session_id):
        return [mock_content]

    import api.routers.content as content_module

    original_func = content_module.get_content_by_session
    content_module.get_content_by_session = mock_get_content_by_session

    try:
        # Call the endpoint
        result = await get_content_for_session(
            session_id="crawl-123", session=mock_session, _verified=None
        )

        # Verify response
        assert len(result) == 1
        assert result[0].url == "https://example.com/page1"
        assert result[0].crawl_session_id == "crawl-123"
    finally:
        content_module.get_content_by_session = original_func


@pytest.mark.asyncio
async def test_get_content_for_session_raises_404_when_empty():
    """Test get_content_for_session raises 404 when no content found."""
    mock_session = AsyncMock()

    # Mock the service function to return empty list
    async def mock_get_content_by_session(session, session_id):
        return []

    import api.routers.content as content_module

    original_func = content_module.get_content_by_session
    content_module.get_content_by_session = mock_get_content_by_session

    try:
        with pytest.raises(HTTPException) as exc_info:
            await get_content_for_session(
                session_id="nonexistent", session=mock_session, _verified=None
            )

        assert exc_info.value.status_code == 404
        assert "No content found" in exc_info.value.detail
    finally:
        content_module.get_content_by_session = original_func
