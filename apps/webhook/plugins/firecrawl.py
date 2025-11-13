"""
Firecrawl plugin for web scraping via Firecrawl API.

This plugin serves as the default fallback for any URLs that aren't
handled by more specific plugins. It wraps the existing Firecrawl
integration and maintains backward compatibility.
"""

from typing import TYPE_CHECKING, Any

from plugins.base import BasePlugin

if TYPE_CHECKING:
    from api.schemas.indexing import IndexDocumentRequest

try:
    from utils.logging import get_logger

    logger = get_logger(__name__)
except ImportError:
    import logging

    logger = logging.getLogger(__name__)


class FirecrawlPlugin(BasePlugin):
    """
    Plugin for scraping web content via Firecrawl API.

    This is typically used as the default/fallback plugin since it can
    handle any URL. More specific plugins (YouTube, Reddit, etc.) should
    have higher priority.
    """

    def can_handle(self, url: str) -> bool:
        """
        Firecrawl can handle any HTTP/HTTPS URL.

        Args:
            url: URL to check

        Returns:
            True if URL starts with http:// or https://
        """
        return url.startswith("http://") or url.startswith("https://")

    async def fetch_content(
        self,
        url: str,
        **kwargs: Any,
    ) -> "IndexDocumentRequest":
        """
        Fetch content via Firecrawl API.

        Note: This is a placeholder implementation. In practice, this
        should trigger a Firecrawl scrape job and wait for/queue the result.
        The actual implementation will depend on how Firecrawl integration
        is structured in the existing codebase.

        Args:
            url: URL to scrape
            **kwargs: Additional options (e.g., wait_for_selectors, formats)

        Returns:
            IndexDocumentRequest with scraped content

        Raises:
            NotImplementedError: This is a placeholder - real implementation
                                 should integrate with existing Firecrawl flow
        """
        # TODO: Integrate with existing Firecrawl webhook/scraping flow
        # This might involve:
        # 1. Triggering a Firecrawl scrape job
        # 2. Waiting for webhook callback OR polling for completion
        # 3. Transforming Firecrawl response to IndexDocumentRequest

        logger.info(
            "Firecrawl plugin invoked",
            url=url,
            kwargs=kwargs,
        )

        raise NotImplementedError(
            "Firecrawl plugin should use existing webhook flow. "
            "Use the plugin system for new sources, but keep Firecrawl "
            "as the webhook-based flow it currently is."
        )

    def get_priority(self) -> int:
        """
        Return low priority since this is a fallback plugin.

        Returns:
            Priority of 10 (low priority fallback)
        """
        return 10

    def get_name(self) -> str:
        """
        Return plugin name.

        Returns:
            Plugin name
        """
        return "Firecrawl Web Scraper"

    def get_supported_patterns(self) -> list[str]:
        """
        Get supported URL patterns.

        Returns:
            List of supported patterns (any HTTP/HTTPS URL)
        """
        return ["http://*", "https://*"]
