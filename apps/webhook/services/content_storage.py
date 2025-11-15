"""
Content storage service.

Provides permanent storage of Firecrawl scraped content in PostgreSQL.
"""

import hashlib
import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from domain.models import ScrapedContent

logger = logging.getLogger(__name__)


async def store_scraped_content(
    session: AsyncSession,
    crawl_session_id: str,
    url: str,
    document: dict[str, Any],
    content_source: str
) -> ScrapedContent:
    """
    Store scraped content permanently in PostgreSQL.

    Uses INSERT ... ON CONFLICT to handle race conditions atomically.
    If duplicate content exists (same session+url+hash), returns existing record.

    Args:
        session: Database session
        crawl_session_id: job_id from CrawlSession (String field)
        url: URL of scraped page
        document: Firecrawl Document object from webhook/API
        content_source: Source type (firecrawl_scrape, firecrawl_crawl, etc.)

    Returns:
        ScrapedContent instance (new or existing)
    """
    markdown = document.get("markdown", "")
    html = document.get("html")
    links = document.get("links", [])
    screenshot = document.get("screenshot")
    metadata = document.get("metadata", {})

    # Compute content hash for deduplication
    content_hash = hashlib.sha256(markdown.encode("utf-8")).hexdigest()

    # Use INSERT ... ON CONFLICT DO NOTHING with RETURNING
    # This is atomic and handles race conditions at database level
    stmt = pg_insert(ScrapedContent).values(
        crawl_session_id=crawl_session_id,
        url=url,
        source_url=metadata.get("sourceURL", url),
        content_source=content_source,
        markdown=markdown,
        html=html,
        links=links if links else None,
        screenshot=screenshot,
        extra_metadata=metadata,
        content_hash=content_hash
    ).on_conflict_do_nothing(
        constraint='uq_content_per_session_url'
    ).returning(ScrapedContent)

    result = await session.execute(stmt)
    content = result.scalar_one_or_none()

    if content:
        # Successfully inserted new record
        await session.flush()
        return content

    # Conflict occurred - fetch existing record
    existing = await session.execute(
        select(ScrapedContent).where(
            ScrapedContent.crawl_session_id == crawl_session_id,
            ScrapedContent.url == url,
            ScrapedContent.content_hash == content_hash
        )
    )
    return existing.scalar_one()


async def store_content_async(
    crawl_session_id: str,
    documents: list[dict[str, Any]],
    content_source: str
) -> None:
    """
    Fire-and-forget async storage of content (doesn't block webhook response).

    Args:
        crawl_session_id: job_id from CrawlSession
        documents: List of Firecrawl Document objects
        content_source: Source type
    """
    from infra.database import get_db_context

    try:
        async with get_db_context() as session:
            for document in documents:
                url = document.get("metadata", {}).get("sourceURL", "")
                await store_scraped_content(
                    session=session,
                    crawl_session_id=crawl_session_id,
                    url=url,
                    document=document,
                    content_source=content_source
                )
            # Auto-commits on context exit
    except Exception as e:
        # Log but don't raise (fire-and-forget)
        logger.error(f"Failed to store content for session {crawl_session_id}: {e}")


async def get_content_by_url(
    session: AsyncSession,
    url: str,
    limit: int = 10
) -> list[ScrapedContent]:
    """
    Retrieve all scraped versions of a URL (newest first).

    Args:
        session: Database session
        url: URL to lookup
        limit: Max results to return

    Returns:
        List of ScrapedContent instances
    """
    result = await session.execute(
        select(ScrapedContent)
        .where(ScrapedContent.url == url)
        .order_by(ScrapedContent.created_at.desc())
        .limit(limit)
    )
    return list(result.scalars().all())


async def get_content_by_session(
    session: AsyncSession,
    crawl_session_id: str
) -> list[ScrapedContent]:
    """
    Retrieve all content for a crawl session.

    Args:
        session: Database session
        crawl_session_id: job_id of CrawlSession (String field)

    Returns:
        List of ScrapedContent instances
    """
    result = await session.execute(
        select(ScrapedContent)
        .where(ScrapedContent.crawl_session_id == crawl_session_id)
        .order_by(ScrapedContent.created_at.asc())
    )
    return list(result.scalars().all())
