"""Redis-backed cache for scraped content with PostgreSQL fallback."""

from redis import Redis
from sqlalchemy.ext.asyncio import AsyncSession


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
