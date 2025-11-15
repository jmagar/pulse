"""Unit tests for ContentCacheService."""

import pytest
from unittest.mock import AsyncMock, Mock

from redis import Redis
from sqlalchemy.ext.asyncio import AsyncSession

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
