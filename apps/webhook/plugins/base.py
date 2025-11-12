"""
Base plugin interface for content ingestion.

All content source plugins must implement this interface to ensure
compatibility with the indexing pipeline.
"""

from abc import ABC, abstractmethod
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from api.schemas.indexing import IndexDocumentRequest


class BasePlugin(ABC):
    """
    Abstract base class for content ingestion plugins.

    Each plugin is responsible for:
    1. Identifying URLs it can handle via URL pattern matching
    2. Fetching content from the source
    3. Transforming source-specific data into IndexDocumentRequest format
    """

    @abstractmethod
    def can_handle(self, url: str) -> bool:
        """
        Determine if this plugin can handle the given URL.

        Args:
            url: The URL to check

        Returns:
            True if this plugin can handle the URL, False otherwise

        Example:
            >>> plugin.can_handle("https://youtube.com/watch?v=abc123")
            True
        """
        pass

    @abstractmethod
    async def fetch_content(
        self,
        url: str,
        **kwargs: Any,
    ) -> "IndexDocumentRequest":
        """
        Fetch and transform content from the source.

        This method should:
        1. Fetch content from the source URL
        2. Extract relevant text/metadata
        3. Return an IndexDocumentRequest for the indexing pipeline

        Args:
            url: The URL to fetch content from
            **kwargs: Plugin-specific options

        Returns:
            IndexDocumentRequest ready for indexing

        Raises:
            Exception: If content cannot be fetched or transformed

        Example:
            >>> document = await plugin.fetch_content("https://youtube.com/watch?v=abc123")
            >>> print(document.title)
            "Video Title"
        """
        pass

    @abstractmethod
    def get_priority(self) -> int:
        """
        Return the plugin's priority for URL matching.

        Higher priority plugins are checked first when routing URLs.
        Use this to ensure more specific plugins (e.g., YouTube) are
        checked before generic plugins (e.g., Firecrawl).

        Returns:
            Priority value (0-100, where 100 is highest priority)

        Recommended priorities:
            - Specific source plugins (YouTube, Reddit): 90-100
            - Generic format plugins (RSS, Atom): 50-70
            - Fallback scrapers (Firecrawl): 0-10
        """
        pass

    @abstractmethod
    def get_name(self) -> str:
        """
        Return the plugin's name for logging and identification.

        Returns:
            Human-readable plugin name

        Example:
            >>> plugin.get_name()
            "YouTube Transcript Plugin"
        """
        pass

    async def health_check(self) -> bool:
        """
        Check if the plugin's external dependencies are available.

        Override this method if your plugin depends on external APIs
        or services that should be validated before use.

        Returns:
            True if plugin is healthy and ready to use, False otherwise
        """
        return True

    def get_supported_patterns(self) -> list[str]:
        """
        Get list of URL patterns this plugin supports (for documentation).

        Returns:
            List of example URL patterns as strings

        Example:
            >>> plugin.get_supported_patterns()
            ["youtube.com/watch?v=*", "youtu.be/*"]
        """
        return []
