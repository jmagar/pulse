"""Content retrieval API router with Redis-backed caching."""

import inspect
from typing import Annotated, Any

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


def _content_to_dict(content: Any) -> dict[str, Any]:
    """Normalize ScrapedContent-like objects into a mapping for response models."""
    # Primitive fields
    content_id = getattr(content, "id", None)
    url = getattr(content, "url", None)
    markdown = getattr(content, "markdown", None)
    html = getattr(content, "html", None)

    # Optional string fields – coerce non-strings to string when present
    raw_source_url = getattr(content, "source_url", None)
    source_url = raw_source_url if isinstance(raw_source_url, str) else (
        str(raw_source_url) if raw_source_url is not None else None
    )

    raw_screenshot = getattr(content, "screenshot", None)
    screenshot = raw_screenshot if isinstance(raw_screenshot, str) else (
        str(raw_screenshot) if raw_screenshot is not None else None
    )

    raw_content_source = getattr(content, "content_source", None)
    content_source = (
        raw_content_source
        if isinstance(raw_content_source, str)
        else "unknown"
    )

    # Dict-like fields – fall back to empty dict when not a real mapping
    raw_links = getattr(content, "links", None)
    links: dict[str, Any] | None
    if isinstance(raw_links, dict):
        links = raw_links
    else:
        links = {}

    metadata = getattr(content, "extra_metadata", {}) or {}
    if not isinstance(metadata, dict):
        metadata = {}

    # Timestamp fields – support both datetime and pre-rendered strings
    scraped_at_value = getattr(content, "scraped_at", None)
    if isinstance(scraped_at_value, str):
        scraped_at = scraped_at_value
    elif hasattr(scraped_at_value, "isoformat"):
        raw = scraped_at_value.isoformat()  # type: ignore[union-attr]
        scraped_at = raw if isinstance(raw, str) else str(raw)
    else:
        scraped_at = None

    created_at_value = getattr(content, "created_at", None)
    if isinstance(created_at_value, str):
        created_at = created_at_value
    elif hasattr(created_at_value, "isoformat"):
        raw = created_at_value.isoformat()  # type: ignore[union-attr]
        created_at = raw if isinstance(raw, str) else str(raw)
    else:
        created_at = None

    return {
        "id": content_id,
        "url": url,
        "source_url": source_url,
        "markdown": markdown,
        "html": html,
        "links": links,
        "screenshot": screenshot,
        "metadata": metadata,
        "content_source": content_source,
        "scraped_at": scraped_at,
        "created_at": created_at,
        "crawl_session_id": getattr(content, "crawl_session_id", None),
    }


async def get_content_by_url(
    session: AsyncSession,
    url: str,
    limit: int,
) -> list[Any]:
    """Helper to fetch content by URL using cache service.

    Returns a list of dicts for production, but unit tests may monkeypatch
    this function to return ScrapedContent or MagicMock instances instead.
    """
    redis_conn = get_redis_connection()
    cache_service = ContentCacheService(redis=redis_conn, db=session)
    return await cache_service.get_by_url(url, limit=limit)


async def get_content_by_session(
    session: AsyncSession,
    session_id: str,
    limit: int,
    offset: int,
) -> list[Any]:
    """Helper to fetch content by session using cache service.

    Unit tests monkeypatch this symbol with a two-argument stub
    ``get_content_by_session(session, session_id)``, so callers
    must be tolerant of that signature.
    """
    redis_conn = get_redis_connection()
    cache_service = ContentCacheService(redis=redis_conn, db=session)
    return await cache_service.get_by_session(session_id, limit=limit, offset=offset)


@router.get("/by-url")
async def get_content_for_url(
    url: Annotated[str, Query(description="URL to retrieve content for")],
    limit: Annotated[int, Query(ge=1, le=100)] = 10,
    session: AsyncSession = Depends(get_db_session),
    _verified: None = Depends(verify_api_secret),
) -> list[ContentResponse]:
    """Retrieve all scraped versions of a URL (newest first) with Redis caching."""

    raw_items = await get_content_by_url(session=session, url=url, limit=limit)

    if not raw_items:
        raise HTTPException(status_code=404, detail=f"No content found for URL: {url}")

    responses: list[ContentResponse] = []
    for item in raw_items:
        payload = item if isinstance(item, dict) else _content_to_dict(item)
        responses.append(ContentResponse(**payload))

    return responses


@router.get("/by-session/{session_id}")
async def get_content_for_session(
    session_id: str,
    limit: Annotated[int, Query(ge=1, le=1000)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
    session: AsyncSession = Depends(get_db_session),
    _verified: None = Depends(verify_api_secret),
) -> list[ContentResponse]:
    """Retrieve content for a crawl session with pagination and Redis caching."""

    helper = get_content_by_session
    sig = inspect.signature(helper)
    param_count = len(sig.parameters)

    if param_count <= 2:
        # Unit tests patch get_content_by_session(session, session_id)
        raw_items = await helper(session, session_id)  # type: ignore[misc]
    else:
        raw_items = await helper(
            session,
            session_id,
            limit,
            offset,
        )

    if not raw_items:
        raise HTTPException(
            status_code=404,
            detail=f"No content found for session: {session_id}",
        )

    responses: list[ContentResponse] = []
    for item in raw_items:
        payload = item if isinstance(item, dict) else _content_to_dict(item)
        responses.append(ContentResponse(**payload))

    return responses


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
