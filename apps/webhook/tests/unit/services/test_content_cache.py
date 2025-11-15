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


@pytest.mark.asyncio
async def test_get_by_session_cache_hit():
    """Test get_by_session returns cached data without DB query."""
    redis_mock = Mock(spec=Redis)
    db_mock = AsyncMock(spec=AsyncSession)

    cached_data = json.dumps([
        {"id": 1, "url": "https://page1.com", "markdown": "cached page 1"},
        {"id": 2, "url": "https://page2.com", "markdown": "cached page 2"}
    ])
    redis_mock.get.return_value = cached_data.encode()

    service = ContentCacheService(redis_mock, db_mock)
    result = await service.get_by_session("session-123", limit=10, offset=0)

    redis_mock.get.assert_called_once_with("content:session:session-123:limit:10:offset:0")
    db_mock.execute.assert_not_called()  # Should NOT query DB on cache hit
    assert len(result) == 2
    assert result[0]["id"] == 1


@pytest.mark.asyncio
async def test_get_by_session_cache_miss():
    """Test get_by_session queries DB with pagination and caches result."""
    redis_mock = Mock(spec=Redis)
    db_mock = AsyncMock(spec=AsyncSession)

    # Mock cache miss
    redis_mock.get.return_value = None

    # Mock DB results with offset=10, limit=5
    mock_content1 = Mock(spec=ScrapedContent)
    mock_content1.id = 11
    mock_content1.url = "https://page11.com"
    mock_content1.source_url = None
    mock_content1.markdown = "page 11"
    mock_content1.html = None
    mock_content1.links = []
    mock_content1.screenshot = None
    mock_content1.extra_metadata = {}
    mock_content1.content_source = "firecrawl_crawl"
    mock_content1.scraped_at = datetime(2025, 1, 15, 12, 0, 0, tzinfo=UTC)
    mock_content1.created_at = datetime(2025, 1, 15, 12, 0, 0, tzinfo=UTC)
    mock_content1.crawl_session_id = "session-456"

    mock_content2 = Mock(spec=ScrapedContent)
    mock_content2.id = 12
    mock_content2.url = "https://page12.com"
    mock_content2.source_url = None
    mock_content2.markdown = "page 12"
    mock_content2.html = None
    mock_content2.links = []
    mock_content2.screenshot = None
    mock_content2.extra_metadata = {}
    mock_content2.content_source = "firecrawl_crawl"
    mock_content2.scraped_at = datetime(2025, 1, 15, 11, 0, 0, tzinfo=UTC)
    mock_content2.created_at = datetime(2025, 1, 15, 11, 0, 0, tzinfo=UTC)
    mock_content2.crawl_session_id = "session-456"

    # Create proper mock chain
    mock_scalars = Mock()
    mock_scalars.all.return_value = [mock_content1, mock_content2]

    mock_result = Mock()
    mock_result.scalars.return_value = mock_scalars

    db_mock.execute = AsyncMock(return_value=mock_result)

    service = ContentCacheService(redis_mock, db_mock, default_ttl=7200)
    result = await service.get_by_session("session-456", limit=5, offset=10)

    # Verify cache checked first
    redis_mock.get.assert_called_once_with("content:session:session-456:limit:5:offset:10")

    # Verify DB queried with correct pagination
    db_mock.execute.assert_called_once()

    # Verify result cached
    redis_mock.setex.assert_called_once()
    cache_key, ttl, cached_value = redis_mock.setex.call_args[0]
    assert cache_key == "content:session:session-456:limit:5:offset:10"
    assert ttl == 7200

    assert len(result) == 2
    assert result[0]["id"] == 11
    assert result[1]["id"] == 12


@pytest.mark.asyncio
async def test_invalidate_url_cache():
    """Test invalidate_url removes cached data for specific URL."""
    redis_mock = Mock(spec=Redis)
    redis_mock.delete = Mock(return_value=1)  # Sync, not async
    db_mock = AsyncMock(spec=AsyncSession)

    service = ContentCacheService(redis_mock, db_mock)

    await service.invalidate_url("https://example.com")

    # Should delete cache key
    redis_mock.delete.assert_called_once_with("content:url:https://example.com")


@pytest.mark.asyncio
async def test_invalidate_session_cache():
    """Test invalidate_session removes all cached pages for session."""
    redis_mock = Mock(spec=Redis)

    # Setup: Redis has multiple pages cached
    redis_mock.keys = Mock(return_value=[
        b"content:session:job-123:limit:10:offset:0",
        b"content:session:job-123:limit:10:offset:10",
        b"content:session:job-123:limit:10:offset:20",
    ])
    redis_mock.delete = Mock(return_value=3)

    db_mock = AsyncMock(spec=AsyncSession)

    service = ContentCacheService(redis_mock, db_mock)

    await service.invalidate_session("job-123")

    # Should find all keys matching pattern
    redis_mock.keys.assert_called_once_with("content:session:job-123:*")

    # Should delete all matching keys
    redis_mock.delete.assert_called_once()
    call_args = redis_mock.delete.call_args[0]
    assert len(call_args) == 3
    assert b"content:session:job-123:limit:10:offset:0" in call_args
    assert b"content:session:job-123:limit:10:offset:10" in call_args
    assert b"content:session:job-123:limit:10:offset:20" in call_args
