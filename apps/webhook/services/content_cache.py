"""Redis-backed cache for scraped content with PostgreSQL fallback."""

import json
from typing import Any

from redis import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from domain.models import ScrapedContent
from utils.logging import get_logger

logger = get_logger(__name__)


class ContentCacheService:
    """Redis-backed cache for scraped content with PostgreSQL fallback.

    Provides a two-tier caching strategy:
    - L1: Redis for fast in-memory lookups with TTL
    - L2: PostgreSQL for persistent storage and fallback
    """

    def __init__(
        self, redis: Redis, db: AsyncSession, default_ttl: int = 3600
    ) -> None:
        """Initialize content cache service.

        Args:
            redis: Redis connection for caching
            db: Async database session for PostgreSQL queries
            default_ttl: Default TTL for cache entries in seconds (default: 1 hour)
        """
        self.redis = redis
        self.db = db
        self.default_ttl = default_ttl

    def _cache_key_url(self, url: str) -> str:
        """Generate Redis cache key for URL lookup."""
        return f"content:url:{url}"

    async def get_by_url(
        self,
        url: str,
        limit: int = 10,
        ttl: int | None = None,
    ) -> list[dict[str, Any]]:
        """Get content by URL with Redis caching.

        Args:
            url: The URL to fetch content for
            limit: Maximum number of results (default: 10)
            ttl: Cache TTL override (default: use default_ttl)

        Returns:
            List of content dictionaries (newest first)

        Cache Strategy:
        1. Check Redis cache
        2. If hit: Return cached data
        3. If miss: Query PostgreSQL, cache result, return
        """
        cache_key = self._cache_key_url(url)
        cache_ttl = ttl or self.default_ttl

        # 1. Try Redis cache
        cached = self.redis.get(cache_key)
        if cached:
            logger.debug("Cache hit for URL", url=url, cache_key=cache_key)
            return json.loads(cached.decode())

        logger.debug("Cache miss for URL", url=url, cache_key=cache_key)

        # 2. Query PostgreSQL
        result = await self.db.execute(
            select(ScrapedContent)
            .where(ScrapedContent.url == url)
            .order_by(ScrapedContent.created_at.desc())
            .limit(limit)
        )
        contents = result.scalars().all()

        # 3. Convert to dict and cache
        content_dicts = [self._content_to_dict(c) for c in contents]

        if content_dicts:
            self.redis.setex(
                cache_key,
                cache_ttl,
                json.dumps(content_dicts, default=str),
            )
            logger.debug(
                "Cached content for URL",
                url=url,
                count=len(content_dicts),
                ttl=cache_ttl,
            )

        return content_dicts

    def _content_to_dict(self, content: ScrapedContent) -> dict[str, Any]:
        """Convert ScrapedContent model to dictionary."""
        return {
            "id": content.id,
            "url": content.url,
            "source_url": content.source_url,
            "markdown": content.markdown,
            "html": content.html,
            "links": content.links,
            "screenshot": content.screenshot,
            "metadata": content.extra_metadata,
            "content_source": content.content_source,
            "scraped_at": content.scraped_at.isoformat() if content.scraped_at else None,
            "created_at": content.created_at.isoformat() if content.created_at else None,
            "crawl_session_id": content.crawl_session_id,
        }
