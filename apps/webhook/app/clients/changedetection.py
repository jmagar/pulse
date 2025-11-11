"""Client for changedetection.io REST API."""

from __future__ import annotations

from typing import Any, cast

import httpx

from app.config import settings
from app.utils.logging import get_logger

logger = get_logger(__name__)


class ChangeDetectionClient:
    """Client for interacting with changedetection.io API."""

    def __init__(
        self,
        api_url: str | None = None,
        api_key: str | None = None,
        timeout: float = 30.0,
    ):
        """Initialize changedetection.io API client.

        Args:
            api_url: Base URL for changedetection.io API (default: from settings)
            api_key: API key for authentication (default: from settings)
            timeout: Request timeout in seconds
        """
        self.api_url = (api_url or settings.changedetection_api_url).rstrip("/")
        self.api_key = api_key or settings.changedetection_api_key
        self.timeout = timeout

    async def create_watch(
        self,
        url: str,
        check_interval: int | None = None,
        tag: str = "firecrawl-auto",
        webhook_url: str | None = None,
        title: str | None = None,
    ) -> dict[str, Any]:
        """Create a new watch in changedetection.io.

        Idempotent: If watch already exists for URL, returns existing watch.

        Args:
            url: URL to monitor for changes
            check_interval: Check interval in seconds (default: from settings)
            tag: Tag to categorize watch
            webhook_url: Webhook URL for notifications (default: internal webhook endpoint)
            title: Custom title for watch (default: URL)

        Returns:
            dict: Watch details including uuid, url, tag

        Raises:
            httpx.HTTPError: If API request fails
        """
        check_interval = check_interval or settings.changedetection_default_check_interval
        webhook_url = webhook_url or "json://firecrawl_webhook:52100/api/webhook/changedetection"
        title = title or url

        # Check if watch already exists
        existing_watch = await self.get_watch_by_url(url)
        if existing_watch:
            logger.info(
                "Watch already exists for URL",
                url=url,
                watch_uuid=existing_watch["uuid"],
            )
            return existing_watch

        # Create new watch
        payload = {
            "url": url,
            "tag": tag,
            "title": title,
            "time_between_check": {
                "weeks": None,
                "days": None,
                "hours": None,
                "minutes": None,
                "seconds": check_interval,
            },
            "notification_urls": [webhook_url],
            "notification_title": "{{ watch_title }} changed",
            "notification_body": """{
  "watch_id": "{{ watch_uuid }}",
  "watch_url": "{{ watch_url }}",
  "watch_title": "{{ watch_title }}",
  "detected_at": "{{ current_timestamp }}",
  "diff_url": "{{ diff_url }}",
  "snapshot": "{{ current_snapshot|truncate(500) }}"
}""",
            "notification_format": "JSON",
        }

        headers = {}
        if self.api_key:
            headers["x-api-key"] = self.api_key

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                response = await client.post(
                    f"{self.api_url}/api/v1/watch",
                    json=payload,
                    headers=headers,
                )

                if response.status_code == 409:
                    # Conflict: watch already exists, fetch and return it
                    logger.info("Watch creation returned 409, fetching existing watch", url=url)
                    existing = await self.get_watch_by_url(url)
                    if existing:
                        return existing
                    raise httpx.HTTPError(f"Watch exists but couldn't fetch it: {url}")

                response.raise_for_status()
                watch_data = cast(dict[str, Any], response.json())

                logger.info(
                    "Created changedetection.io watch",
                    url=url,
                    watch_uuid=watch_data.get("uuid"),
                    check_interval=check_interval,
                )

                return watch_data

            except httpx.HTTPError as e:
                logger.error(
                    "Failed to create changedetection.io watch",
                    url=url,
                    error=str(e),
                )
                raise

    async def get_watch_by_url(self, url: str) -> dict[str, Any] | None:
        """Fetch watch by URL.

        Args:
            url: URL to search for

        Returns:
            dict: Watch details if found, None otherwise

        Raises:
            httpx.HTTPError: If API request fails
        """
        headers = {}
        if self.api_key:
            headers["x-api-key"] = self.api_key

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                response = await client.get(
                    f"{self.api_url}/api/v1/watch",
                    headers=headers,
                )
                response.raise_for_status()
                watches = cast(list[dict[str, Any]], response.json())

                # Find watch matching URL
                for watch in watches:
                    if watch.get("url") == url:
                        return watch

                return None

            except httpx.HTTPError as e:
                logger.error(
                    "Failed to fetch changedetection.io watches",
                    error=str(e),
                )
                raise
