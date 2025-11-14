"""Service for automatically creating changedetection.io watches."""

from __future__ import annotations

import asyncio
from typing import Any
from urllib.parse import urlparse

from clients.changedetection import ChangeDetectionClient
from config import settings
from utils.logging import get_logger

logger = get_logger(__name__)

# Limit concurrent watch creation to prevent overwhelming changedetection.io API
# which has a race condition in dictionary iteration under high concurrency
_watch_creation_semaphore = asyncio.Semaphore(5)


async def create_watch_for_url(
    url: str,
    check_interval: int | None = None,
    tag: str = "firecrawl-auto",
) -> dict[str, Any] | None:
    """Create changedetection.io watch for scraped URL.

    Idempotent: If watch already exists, returns existing watch.
    Gracefully handles errors by logging and returning None.

    Uses semaphore to limit concurrent API calls and prevent race conditions
    in changedetection.io's internal dictionary iteration.

    Args:
        url: URL that was scraped
        check_interval: Check interval in seconds (default: from settings)
        tag: Tag for categorizing watch

    Returns:
        dict: Watch details if created/found, None if skipped or failed
    """
    # Check if auto-watch is enabled
    if not settings.changedetection_enable_auto_watch:
        logger.debug("Auto-watch creation disabled", url=url)
        return None

    # Validate URL
    if not url or not _is_valid_url(url):
        logger.warning("Invalid URL for watch creation", url=url)
        return None

    # Limit concurrent API calls to prevent overwhelming changedetection.io
    async with _watch_creation_semaphore:
        try:
            client = ChangeDetectionClient()
            watch = await client.create_watch(
                url=url,
                check_interval=check_interval or settings.changedetection_default_check_interval,
                tag=tag,
            )

            logger.info(
                "Auto-created changedetection.io watch",
                url=url,
                watch_uuid=watch.get("uuid"),
            )

            return watch

        except Exception as e:
            logger.error(
                "Failed to create changedetection.io watch",
                url=url,
                error=str(e),
                error_type=type(e).__name__,
            )
            return None


def _is_valid_url(url: str) -> bool:
    """Validate URL format.

    Args:
        url: URL to validate

    Returns:
        bool: True if URL is valid, False otherwise
    """
    try:
        result = urlparse(url)
        return all([result.scheme, result.netloc])
    except Exception:
        return False
