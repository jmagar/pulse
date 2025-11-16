"""
Content retrieval API router.

Provides endpoints for retrieving stored Firecrawl scraped content
with Redis caching for performance.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import verify_api_secret
from api.schemas.content import ContentResponse
from domain.models import ScrapedContent
from infra.database import get_db_session
from infra.redis import get_redis_connection
from services.content_cache import ContentCacheService

router = APIRouter(prefix="/api/content", tags=["content"])


@router.get("/by-url")
async def get_content_for_url(
    url: Annotated[str, Query(description="URL to retrieve content for")],
    limit: Annotated[int, Query(ge=1, le=100)] = 10,
    session: AsyncSession = Depends(get_db_session),
    _verified: None = Depends(verify_api_secret),
) -> list[ContentResponse]:
    """
    Retrieve all scraped versions of a URL (newest first) with Redis caching.

    Returns up to `limit` versions of the scraped content for the given URL.
    Content is ordered by scraped_at timestamp descending (newest first).
    Cache TTL: 1 hour (configurable).

    Args:
        url: The URL to retrieve content for
        limit: Maximum number of results to return (1-100, default 10)
        session: Database session (injected)
        _verified: API authentication (injected)

    Returns:
        List of ContentResponse objects

    Raises:
        HTTPException: 404 if no content found for URL
        HTTPException: 401 if authentication fails
    """
    # Create cache service
    redis_conn = get_redis_connection()
    cache_service = ContentCacheService(redis=redis_conn, db=session)

    # Get content (uses cache automatically)
    content_dicts = await cache_service.get_by_url(url, limit=limit)

    if not content_dicts:
        raise HTTPException(status_code=404, detail=f"No content found for URL: {url}")

    # Convert to response models
    return [ContentResponse(**c) for c in content_dicts]


@router.get("/by-session/{session_id}")
async def get_content_for_session(
    session_id: str,
    limit: Annotated[int, Query(ge=1, le=1000)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
    session: AsyncSession = Depends(get_db_session),
    _verified: None = Depends(verify_api_secret),
) -> list[ContentResponse]:
    """
    Retrieve content for a crawl session with pagination and Redis caching.

    Returns up to `limit` items starting from `offset`.
    Content is ordered by created_at timestamp ascending (insertion order).
    Cache TTL: 1 hour per page (configurable).

    Args:
        session_id: The crawl session ID (job_id from Firecrawl)
        limit: Maximum number of results to return (1-1000, default 100)
        offset: Number of results to skip (default 0)
        session: Database session (injected)
        _verified: API authentication (injected)

    Returns:
        List of ContentResponse objects

    Raises:
        HTTPException: 404 if no content found for session
        HTTPException: 401 if authentication fails
        HTTPException: 422 if parameters invalid

    Example:
        GET /api/content/by-session/abc123?limit=50&offset=100
    """
    # Create cache service
    redis_conn = get_redis_connection()
    cache_service = ContentCacheService(redis=redis_conn, db=session)

    # Get content (uses cache automatically)
    content_dicts = await cache_service.get_by_session(session_id, limit=limit, offset=offset)

    if not content_dicts:
        raise HTTPException(
            status_code=404,
            detail=f"No content found for session: {session_id}",
        )

    # Convert to response models
    return [ContentResponse(**c) for c in content_dicts]


@router.get("/{content_id}")
async def get_content_by_id(
    content_id: Annotated[int, Path(gt=0)],
    _verified: None = Depends(verify_api_secret),
    session: AsyncSession = Depends(get_db_session),
) -> ContentResponse:
    """
    Get scraped content by ID.

    Retrieves a single content item by its unique identifier.
    Useful for MCP read() method with content ID URIs.

    Args:
        content_id: Unique content identifier
        _verified: API authentication (injected)
        session: Database session (injected)

    Returns:
        Single ContentResponse

    Raises:
        HTTPException: 404 if content not found
        HTTPException: 401 if authentication fails
    """
    result = await session.execute(select(ScrapedContent).where(ScrapedContent.id == content_id))
    content = result.scalar_one_or_none()

    if not content:
        raise HTTPException(status_code=404, detail=f"Content {content_id} not found")

    return ContentResponse(
        id=content.id,
        url=content.url,
        source_url=content.source_url,
        markdown=content.markdown,
        html=content.html,
        links=content.links,
        screenshot=content.screenshot,
        metadata=content.extra_metadata,
        content_source=content.content_source,
        scraped_at=content.scraped_at.isoformat() if content.scraped_at else None,
        created_at=content.created_at.isoformat() if content.created_at else None,
        crawl_session_id=content.crawl_session_id,
    )
