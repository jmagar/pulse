"""
Plugin-based ingestion service.

This service uses the plugin registry to automatically route URLs to the
appropriate content source plugin (YouTube, Reddit, RSS, etc.) and ingest
the content into the RAG pipeline.
"""

from typing import Any

from rq import Queue

from api.schemas.indexing import IndexDocumentRequest
from plugins.registry import PluginRegistry
from plugins.youtube import YouTubePlugin
from plugins.reddit import RedditPlugin
from plugins.rss import RSSPlugin
from plugins.firecrawl import FirecrawlPlugin
from utils.logging import get_logger

logger = get_logger(__name__)


class PluginIngestionService:
    """
    Service for plugin-based content ingestion.
    
    This service:
    1. Maintains a plugin registry
    2. Routes URLs to appropriate plugins
    3. Fetches content via plugins
    4. Queues content for indexing
    
    Example:
        >>> service = PluginIngestionService()
        >>> await service.ingest_url("https://youtube.com/watch?v=abc", queue)
    """

    def __init__(self, registry: PluginRegistry | None = None) -> None:
        """
        Initialize the plugin ingestion service.
        
        Args:
            registry: Optional pre-configured plugin registry.
                     If None, a default registry will be created.
        """
        self.registry = registry or self._create_default_registry()
        logger.info(
            "Plugin ingestion service initialized",
            plugin_count=self.registry.get_plugin_count(),
        )

    def _create_default_registry(self) -> PluginRegistry:
        """
        Create a default plugin registry with standard plugins.
        
        Returns:
            Configured plugin registry
        """
        registry = PluginRegistry()
        
        # Register plugins in priority order
        # Higher priority plugins are checked first
        
        # Specific source plugins (high priority)
        registry.register(YouTubePlugin())
        registry.register(RedditPlugin())
        
        # Format-based plugins (medium priority)
        registry.register(RSSPlugin())
        
        # Fallback plugin (low priority, default)
        registry.register(FirecrawlPlugin(), is_default=True)
        
        logger.info(
            "Default plugin registry created",
            plugins=registry.list_plugins(),
        )
        
        return registry

    async def ingest_url(
        self,
        url: str,
        queue: Queue,
        **kwargs: Any,
    ) -> dict[str, Any]:
        """
        Ingest content from a URL using the appropriate plugin.
        
        This method:
        1. Finds the appropriate plugin for the URL
        2. Fetches content via the plugin
        3. Queues the content for indexing
        
        Args:
            url: URL to ingest content from
            queue: RQ queue for indexing jobs
            **kwargs: Plugin-specific options
            
        Returns:
            Result dictionary with status and job information
            
        Raises:
            ValueError: If no plugin can handle the URL
            Exception: If content fetching or queuing fails
            
        Example:
            >>> result = await service.ingest_url(
            ...     "https://youtube.com/watch?v=abc123",
            ...     queue
            ... )
            >>> print(result["status"])
            "queued"
        """
        logger.info(
            "Ingesting URL via plugin",
            url=url,
        )

        # Find appropriate plugin
        plugin = self.registry.get_plugin_for_url(url)
        
        if plugin is None:
            logger.error(
                "No plugin available for URL",
                url=url,
            )
            raise ValueError(f"No plugin available to handle URL: {url}")

        logger.info(
            "Plugin selected for URL",
            url=url,
            plugin=plugin.get_name(),
            priority=plugin.get_priority(),
        )

        try:
            # Fetch content via plugin
            document = await plugin.fetch_content(url, **kwargs)
            
            logger.info(
                "Content fetched via plugin",
                url=url,
                plugin=plugin.get_name(),
                title=document.title,
                markdown_length=len(document.markdown),
            )

            # Queue document for indexing
            job = queue.enqueue(
                "worker.index_document_job",
                document.model_dump(by_alias=True),
                job_timeout="10m",
            )
            
            job_id = str(job.id) if job.id else None
            
            logger.info(
                "Document queued for indexing",
                url=url,
                plugin=plugin.get_name(),
                job_id=job_id,
            )

            return {
                "status": "queued",
                "job_id": job_id,
                "url": url,
                "plugin": plugin.get_name(),
                "title": document.title,
            }

        except Exception as e:
            logger.error(
                "Failed to ingest URL via plugin",
                url=url,
                plugin=plugin.get_name(),
                error=str(e),
                error_type=type(e).__name__,
            )
            raise

    async def ingest_urls(
        self,
        urls: list[str],
        queue: Queue,
        **kwargs: Any,
    ) -> dict[str, Any]:
        """
        Ingest content from multiple URLs.
        
        Args:
            urls: List of URLs to ingest
            queue: RQ queue for indexing jobs
            **kwargs: Plugin-specific options
            
        Returns:
            Result dictionary with success/failure counts and job IDs
            
        Example:
            >>> urls = [
            ...     "https://youtube.com/watch?v=abc",
            ...     "https://reddit.com/r/test/comments/xyz",
            ... ]
            >>> result = await service.ingest_urls(urls, queue)
            >>> print(result["successful"])
            2
        """
        logger.info(
            "Ingesting multiple URLs",
            url_count=len(urls),
        )

        successful = []
        failed = []

        for url in urls:
            try:
                result = await self.ingest_url(url, queue, **kwargs)
                successful.append(result)
            except Exception as e:
                logger.error(
                    "Failed to ingest URL in batch",
                    url=url,
                    error=str(e),
                )
                failed.append({
                    "url": url,
                    "error": str(e),
                })

        logger.info(
            "Batch ingestion complete",
            total=len(urls),
            successful=len(successful),
            failed=len(failed),
        )

        return {
            "total": len(urls),
            "successful": len(successful),
            "failed": len(failed),
            "results": successful,
            "errors": failed,
        }

    def get_plugin_info(self) -> list[dict[str, Any]]:
        """
        Get information about all registered plugins.
        
        Returns:
            List of plugin metadata dictionaries
            
        Example:
            >>> plugins = service.get_plugin_info()
            >>> for plugin in plugins:
            ...     print(f"{plugin['name']}: {plugin['patterns']}")
        """
        return self.registry.list_plugins()

    async def validate_plugins(self) -> dict[str, bool]:
        """
        Validate health of all registered plugins.
        
        Returns:
            Dictionary mapping plugin names to health status
            
        Example:
            >>> health = await service.validate_plugins()
            >>> print(health)
            {"YouTube Transcript Plugin": True, "Reddit Plugin": False}
        """
        return await self.registry.validate_plugins()
