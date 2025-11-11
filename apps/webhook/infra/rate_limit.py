"""
Rate limiting configuration.

Separated into its own module to avoid circular imports.
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

from config import settings

# Configure rate limiting
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["100/minute"],
    storage_uri=settings.redis_url,
)
