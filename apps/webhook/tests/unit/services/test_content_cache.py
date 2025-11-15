"""Unit tests for ContentCacheService."""

import json
from datetime import datetime, UTC
import pytest
from unittest.mock import AsyncMock, Mock

from redis import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from domain.models import ScrapedContent
from services.content_cache import ContentCacheService


def test_content_cache_service_init():
    """Test ContentCacheService constructor."""
    redis_mock = Mock(spec=Redis)
    db_mock = AsyncMock(spec=AsyncSession)

    service = ContentCacheService(redis_mock, db_mock, default_ttl=7200)

    assert service.redis == redis_mock
    assert service.db == db_mock
    assert service.default_ttl == 7200


def test_content_cache_service_init_default_ttl():
    """Test ContentCacheService constructor with default TTL."""
    redis_mock = Mock(spec=Redis)
    db_mock = AsyncMock(spec=AsyncSession)

    service = ContentCacheService(redis_mock, db_mock)

    assert service.redis == redis_mock
    assert service.db == db_mock
    assert service.default_ttl == 3600


@pytest.mark.asyncio
async def test_get_by_url_cache_hit():
    """Test get_by_url returns cached data without DB query."""
    redis_mock = Mock(spec=Redis)
    db_mock = AsyncMock(spec=AsyncSession)

    cached_data = json.dumps([{"id": 1, "url": "https://example.com", "markdown": "cached"}])
    redis_mock.get.return_value = cached_data.encode()

    service = ContentCacheService(redis_mock, db_mock)
    result = await service.get_by_url("https://example.com")

    redis_mock.get.assert_called_once_with("content:url:https://example.com")
    db_mock.execute.assert_not_called()
    assert result == [{"id": 1, "url": "https://example.com", "markdown": "cached"}]


@pytest.mark.asyncio
async def test_get_by_url_cache_miss():
    """Test get_by_url queries DB and caches result on cache miss."""
    redis_mock = Mock(spec=Redis)
    db_mock = AsyncMock(spec=AsyncSession)

    # Mock cache miss
    redis_mock.get.return_value = None

    # Mock DB result
    mock_content = Mock(spec=ScrapedContent)
    mock_content.id = 2
    mock_content.url = "https://example.com"
    mock_content.source_url = None
    mock_content.markdown = "from db"
    mock_content.html = "<p>from db</p>"
    mock_content.links = []
    mock_content.screenshot = None
    mock_content.extra_metadata = {}
    mock_content.content_source = "firecrawl_scrape"
    mock_content.scraped_at = datetime(2025, 1, 15, 12, 0, 0, tzinfo=UTC)
    mock_content.created_at = datetime(2025, 1, 15, 12, 0, 0, tzinfo=UTC)
    mock_content.crawl_session_id = "job-123"

    # Create proper mock chain for SQLAlchemy result
    mock_scalars = Mock()
    mock_scalars.all.return_value = [mock_content]

    mock_result = Mock()
    mock_result.scalars.return_value = mock_scalars

    db_mock.execute = AsyncMock(return_value=mock_result)

    service = ContentCacheService(redis_mock, db_mock, default_ttl=7200)
    result = await service.get_by_url("https://example.com")

    # Verify cache checked first
    redis_mock.get.assert_called_once_with("content:url:https://example.com")

    # Verify DB queried
    db_mock.execute.assert_called_once()

    # Verify result cached
    expected_cache_value = json.dumps([{
        "id": 2,
        "url": "https://example.com",
        "source_url": None,
        "markdown": "from db",
        "html": "<p>from db</p>",
        "links": [],
        "screenshot": None,
        "metadata": {},
        "content_source": "firecrawl_scrape",
        "scraped_at": "2025-01-15T12:00:00+00:00",
        "created_at": "2025-01-15T12:00:00+00:00",
        "crawl_session_id": "job-123"
    }])
    redis_mock.setex.assert_called_once_with(
        "content:url:https://example.com",
        7200,
        expected_cache_value
    )

    assert len(result) == 1
    assert result[0]["id"] == 2
    assert result[0]["markdown"] == "from db"
