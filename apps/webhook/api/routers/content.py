"""
Content retrieval API router.

Provides endpoints for retrieving stored Firecrawl scraped content
after the 1-hour expiration period.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import verify_api_secret
from api.schemas.content import ContentResponse
from infra.database import get_db_session
from services.content_storage import get_content_by_session, get_content_by_url

router = APIRouter(prefix="/api/content", tags=["content"])


@router.get("/by-url")
async def get_content_for_url(
    url: Annotated[str, Query(description="URL to retrieve content for")],
    limit: Annotated[int, Query(ge=1, le=100)] = 10,
    session: AsyncSession = Depends(get_db_session),
    _verified: None = Depends(verify_api_secret),
) -> list[ContentResponse]:
    """
    Retrieve all scraped versions of a URL (newest first).

    Returns up to `limit` versions of the scraped content for the given URL.
    Content is ordered by scraped_at timestamp descending (newest first).

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
    contents = await get_content_by_url(session, url, limit)

    if not contents:
        raise HTTPException(
            status_code=404, detail=f"No content found for URL: {url}"
        )

    return [
        ContentResponse(
            id=content.id,
            url=content.url,
            markdown=content.markdown,
            html=content.html,
            metadata=content.extra_metadata,
            scraped_at=content.scraped_at.isoformat(),
            crawl_session_id=content.crawl_session_id,
        )
        for content in contents
    ]


@router.get("/by-session/{session_id}")
async def get_content_for_session(
    session_id: str,
    limit: Annotated[int, Query(ge=1, le=1000)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
    session: AsyncSession = Depends(get_db_session),
    _verified: None = Depends(verify_api_secret),
) -> list[ContentResponse]:
    """
    Retrieve content for a crawl session with pagination.

    Returns up to `limit` items starting from `offset`.
    Content is ordered by scraped_at timestamp ascending (chronological).

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
    contents = await get_content_by_session(session, session_id, limit, offset)

    if not contents:
        raise HTTPException(
            status_code=404,
            detail=f"No content found for session: {session_id}",
        )

    return [
        ContentResponse(
            id=content.id,
            url=content.url,
            markdown=content.markdown,
            html=content.html,
            metadata=content.extra_metadata,
            scraped_at=content.scraped_at.isoformat(),
            crawl_session_id=content.crawl_session_id,
        )
        for content in contents
    ]
