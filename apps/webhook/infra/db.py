"""Backward-compatible Redis DB shim.

Provides `get_redis_connection` for legacy imports (`infra.db`) by
forwarding to the new `infra.redis` implementation.
"""

from redis import Redis

from config import settings


def get_redis_connection() -> Redis:
    """Return Redis connection using current settings.

    This keeps older worker entrypoints importing ``infra.db`` working while
    the canonical implementation lives in ``infra.redis``.
    """

    return Redis.from_url(settings.redis_url)
