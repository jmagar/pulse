"""Redis connection factory and queue management."""
from redis import Redis
from rq import Queue

from app.config import settings


def get_redis_connection() -> Redis:
    """
    Create Redis connection from settings.

    Returns:
        Redis: Connected Redis client
    """
    return Redis.from_url(settings.redis_url)


def get_redis_queue(name: str = "default") -> Queue:
    """
    Get RQ queue for background jobs.

    Args:
        name: Queue name (default: "default")

    Returns:
        Queue: RQ queue instance
    """
    redis_conn = get_redis_connection()
    return Queue(name, connection=redis_conn)
