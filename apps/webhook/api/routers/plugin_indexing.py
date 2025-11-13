"""
Plugin-based indexing API endpoints.

Provides endpoints for ingesting content from various sources
(YouTube, Reddit, RSS, etc.) using the plugin system.
"""

from functools import lru_cache
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from rq import Queue

from api.deps import get_rq_queue
from services.plugin_ingestion import PluginIngestionService
from utils.logging import get_logger

logger = get_logger(__name__)

router = APIRouter()


class IngestURLRequest(BaseModel):
    """Request to ingest content from a URL."""

    url: str = Field(
        description="URL to ingest content from (YouTube, Reddit, RSS, etc.)",
        examples=["https://youtube.com/watch?v=dQw4w9WgXcQ"],
    )
    options: dict[str, Any] = Field(
        default_factory=dict,
        description="Plugin-specific options",
        examples=[{"languages": ["en"], "include_comments": True}],
    )


class IngestURLsRequest(BaseModel):
    """Request to ingest content from multiple URLs."""

    urls: list[str] = Field(
        description="List of URLs to ingest",
        examples=[
            [
                "https://youtube.com/watch?v=abc123",
                "https://reddit.com/r/test/comments/xyz",
            ]
        ],
    )
    options: dict[str, Any] = Field(
        default_factory=dict,
        description="Plugin-specific options",
    )


class IngestURLResponse(BaseModel):
    """Response for single URL ingestion."""

    status: str = Field(description="Status of the ingestion")
    job_id: str | None = Field(description="Job ID for tracking")
    url: str = Field(description="URL that was ingested")
    plugin: str = Field(description="Plugin that handled the URL")
    title: str = Field(description="Title of the content")


class IngestURLsResponse(BaseModel):
    """Response for multiple URL ingestion."""

    total: int = Field(description="Total number of URLs")
    successful: int = Field(description="Number of successfully queued URLs")
    failed: int = Field(description="Number of failed URLs")
    results: list[dict[str, Any]] = Field(description="Successful ingestion results")
    errors: list[dict[str, Any]] = Field(description="Failed ingestion errors")


class PluginInfo(BaseModel):
    """Information about a registered plugin."""

    name: str = Field(description="Plugin name")
    priority: int = Field(description="Plugin priority (higher checked first)")
    patterns: list[str] = Field(description="URL patterns this plugin handles")
    is_default: bool = Field(description="Whether this is the default/fallback plugin")


class PluginHealthResponse(BaseModel):
    """Health status of registered plugins."""

    plugins: dict[str, bool] = Field(description="Map of plugin names to health status")


# Create a singleton service instance
@lru_cache(maxsize=1)
def get_plugin_service() -> PluginIngestionService:
    """Get or create the plugin ingestion service instance."""
    return PluginIngestionService()


@router.post(
    "/ingest",
    response_model=IngestURLResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Ingest content from a URL",
    description=(
        "Ingest content from various sources using the plugin system. "
        "The appropriate plugin is automatically selected based on the URL. "
        "Supported sources: YouTube videos, Reddit posts/subreddits, RSS feeds, "
        "and general web pages via Firecrawl."
    ),
)
async def ingest_url(
    request: IngestURLRequest,
    queue: Annotated[Queue, Depends(get_rq_queue)],
    service: Annotated[PluginIngestionService, Depends(get_plugin_service)],
) -> IngestURLResponse:
    """
    Ingest content from a single URL.

    The system automatically detects the source type and uses the appropriate
    plugin to fetch and index the content.

    Examples:
    - YouTube: `https://youtube.com/watch?v=VIDEO_ID`
    - Reddit post: `https://reddit.com/r/SUBREDDIT/comments/POST_ID/...`
    - Reddit subreddit: `https://reddit.com/r/SUBREDDIT`
    - RSS feed: `https://example.com/feed.xml`
    - Web page: Any other HTTP/HTTPS URL (via Firecrawl)
    """
    logger.info(
        "Received plugin ingestion request",
        url=request.url,
        options=request.options,
    )

    try:
        result = await service.ingest_url(
            url=request.url,
            queue=queue,
            **request.options,
        )

        return IngestURLResponse(**result)

    except ValueError as e:
        logger.error(
            "Invalid URL for plugin ingestion",
            url=request.url,
            error=str(e),
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    except Exception as e:
        logger.error(
            "Plugin ingestion failed",
            url=request.url,
            error=str(e),
            error_type=type(e).__name__,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to ingest URL: {str(e)}",
        )


@router.post(
    "/ingest/batch",
    response_model=IngestURLsResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Ingest content from multiple URLs",
    description=(
        "Batch ingest content from multiple URLs. Each URL is processed "
        "independently and uses the appropriate plugin based on its source type."
    ),
)
async def ingest_urls(
    request: IngestURLsRequest,
    queue: Annotated[Queue, Depends(get_rq_queue)],
    service: Annotated[PluginIngestionService, Depends(get_plugin_service)],
) -> IngestURLsResponse:
    """
    Ingest content from multiple URLs in batch.

    Each URL is processed independently. Failures for individual URLs
    do not prevent other URLs from being processed.
    """
    logger.info(
        "Received batch plugin ingestion request",
        url_count=len(request.urls),
    )

    try:
        result = await service.ingest_urls(
            urls=request.urls,
            queue=queue,
            **request.options,
        )

        return IngestURLsResponse(**result)

    except Exception as e:
        logger.error(
            "Batch plugin ingestion failed",
            url_count=len(request.urls),
            error=str(e),
            error_type=type(e).__name__,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to ingest URLs: {str(e)}",
        )


@router.get(
    "/plugins",
    response_model=list[PluginInfo],
    summary="List registered plugins",
    description="Get information about all registered content source plugins.",
)
async def list_plugins(
    service: Annotated[PluginIngestionService, Depends(get_plugin_service)],
) -> list[PluginInfo]:
    """
    List all registered plugins with their metadata.

    Returns:
        List of plugin information including name, priority, and supported patterns
    """
    plugins = service.get_plugin_info()
    return [PluginInfo(**plugin) for plugin in plugins]


@router.get(
    "/plugins/health",
    response_model=PluginHealthResponse,
    summary="Check plugin health",
    description="Validate health of all registered plugins.",
)
async def check_plugin_health(
    service: Annotated[PluginIngestionService, Depends(get_plugin_service)],
) -> PluginHealthResponse:
    """
    Check health status of all registered plugins.

    This validates that plugin dependencies (e.g., youtube-transcript-api, praw)
    are available and working.

    Returns:
        Dictionary mapping plugin names to health status (True = healthy)
    """
    health = await service.validate_plugins()
    return PluginHealthResponse(plugins=health)
