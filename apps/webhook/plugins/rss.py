"""
RSS/Atom feed plugin for fetching feed content.

This plugin extracts articles from RSS and Atom feeds, transforming
them into documents suitable for RAG indexing.
"""

from datetime import datetime
from typing import Any

from api.schemas.indexing import IndexDocumentRequest
from plugins.base import BasePlugin
from utils.logging import get_logger

logger = get_logger(__name__)


class RSSPlugin(BasePlugin):
    """
    Plugin for fetching content from RSS and Atom feeds.
    
    Supports any URL that returns an RSS or Atom feed.
    This plugin has medium priority and will attempt to detect
    feeds by making a request and checking the content type.
    """

    def can_handle(self, url: str) -> bool:
        """
        Check if URL is likely an RSS/Atom feed.
        
        This does a simple heuristic check based on URL patterns.
        The actual feed detection happens during fetch_content.
        
        Args:
            url: URL to check
            
        Returns:
            True if URL matches common feed patterns
        """
        url_lower = url.lower()
        
        # Common RSS/Atom feed URL patterns
        feed_indicators = [
            "/feed",
            "/rss",
            "/atom",
            ".rss",
            ".atom",
            ".xml",
            "/feed.xml",
            "/rss.xml",
            "/atom.xml",
        ]
        
        return any(indicator in url_lower for indicator in feed_indicators)

    async def fetch_content(
        self,
        url: str,
        **kwargs: Any,
    ) -> IndexDocumentRequest:
        """
        Fetch and parse RSS/Atom feed.
        
        Args:
            url: Feed URL
            **kwargs: Additional options
                - limit: Maximum number of entries to include (default: 10)
                - include_content: Include full content if available (default: True)
                - include_summary: Include summary/description (default: True)
            
        Returns:
            IndexDocumentRequest with feed entries as markdown
            
        Raises:
            ValueError: If URL is not a valid feed
            Exception: If feed parsing fails
        """
        try:
            import feedparser
        except ImportError:
            raise ImportError(
                "feedparser is required for RSS plugin. "
                "Install with: pip install feedparser"
            )

        logger.info(
            "Fetching RSS/Atom feed",
            url=url,
        )

        limit = kwargs.get("limit", 10)
        include_content = kwargs.get("include_content", True)
        include_summary = kwargs.get("include_summary", True)

        try:
            # Parse the feed
            feed = feedparser.parse(url)
            
            # Check if feed was successfully parsed
            if feed.bozo and not feed.entries:
                error_msg = getattr(feed.bozo_exception, 'getMessage', lambda: str(feed.bozo_exception))()
                logger.error(
                    "Failed to parse feed",
                    url=url,
                    error=error_msg,
                )
                raise ValueError(f"Invalid feed format: {error_msg}")

            if not feed.entries:
                logger.warning(
                    "Feed has no entries",
                    url=url,
                )
                raise ValueError("Feed contains no entries")

            # Extract feed metadata
            feed_title = feed.feed.get("title", "Untitled Feed")
            feed_description = feed.feed.get("description", "")
            feed_link = feed.feed.get("link", url)

            # Build markdown content
            markdown_lines = [f"# {feed_title}\n"]
            
            if feed_description:
                markdown_lines.append(f"{feed_description}\n")
                
            markdown_lines.append(f"\n**Feed URL:** {url}\n")
            markdown_lines.append(f"**Website:** {feed_link}\n")
            
            # Add feed metadata if available
            if hasattr(feed.feed, "updated"):
                markdown_lines.append(f"**Last Updated:** {feed.feed.updated}\n")
                
            markdown_lines.append(f"\n## Entries ({min(limit, len(feed.entries))} of {len(feed.entries)})\n")

            # Process entries (limited by limit parameter)
            for i, entry in enumerate(feed.entries[:limit], 1):
                entry_title = entry.get("title", "Untitled")
                entry_link = entry.get("link", "")
                
                markdown_lines.append(f"\n### {i}. {entry_title}\n")
                
                if entry_link:
                    markdown_lines.append(f"**URL:** {entry_link}\n")
                
                # Add published date
                if hasattr(entry, "published"):
                    markdown_lines.append(f"**Published:** {entry.published}\n")
                elif hasattr(entry, "updated"):
                    markdown_lines.append(f"**Updated:** {entry.updated}\n")
                
                # Add author
                if hasattr(entry, "author"):
                    markdown_lines.append(f"**Author:** {entry.author}\n")
                
                markdown_lines.append("\n")
                
                # Add summary/description
                if include_summary and hasattr(entry, "summary"):
                    markdown_lines.append(f"{entry.summary}\n")
                
                # Add full content if available and requested
                if include_content and hasattr(entry, "content"):
                    # feedparser represents content as a list of dicts
                    for content_item in entry.content:
                        content_value = content_item.get("value", "")
                        if content_value:
                            # Strip HTML tags for cleaner markdown
                            # This is a basic strip - for production, use a proper HTML parser
                            import re
                            clean_content = re.sub(r'<[^>]+>', '', content_value)
                            markdown_lines.append(f"\n{clean_content}\n")
                            break  # Only use first content item

                markdown_lines.append("\n---\n")

            full_content = "\n".join(markdown_lines)

            logger.info(
                "RSS/Atom feed fetched successfully",
                url=url,
                feed_title=feed_title,
                entries_parsed=min(limit, len(feed.entries)),
                total_entries=len(feed.entries),
            )

            return IndexDocumentRequest(
                url=url,
                resolvedUrl=feed_link,
                title=feed_title,
                description=feed_description or f"RSS/Atom feed: {feed_title}",
                markdown=full_content,
                html="",
                statusCode=200,
                gcsPath=None,
                screenshotUrl=None,
                language=feed.feed.get("language"),
                country=None,
                isMobile=False,
            )

        except Exception as e:
            logger.error(
                "Error fetching RSS/Atom feed",
                url=url,
                error=str(e),
                error_type=type(e).__name__,
            )
            raise

    def get_priority(self) -> int:
        """
        Return medium priority for RSS/Atom feeds.
        
        Returns:
            Priority of 60 (medium priority for format-specific plugin)
        """
        return 60

    def get_name(self) -> str:
        """
        Return plugin name.
        
        Returns:
            Plugin name
        """
        return "RSS/Atom Feed Plugin"

    def get_supported_patterns(self) -> list[str]:
        """
        Get supported URL patterns.
        
        Returns:
            List of supported feed URL patterns
        """
        return [
            "*/feed",
            "*/rss",
            "*/atom",
            "*.rss",
            "*.atom",
            "*.xml",
        ]

    async def health_check(self) -> bool:
        """
        Check if feedparser library is available.
        
        Returns:
            True if library is importable, False otherwise
        """
        try:
            import feedparser
            return True
        except ImportError:
            logger.warning(
                "feedparser not available",
                plugin=self.get_name(),
            )
            return False
