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
    Fire-and-forget async storage of content with metrics tracking.

    Records success/failure in operation_metrics table for monitoring.

    Args:
        crawl_session_id: job_id from CrawlSession
        documents: List of Firecrawl Document objects
        content_source: Source type
    """
    from infra.database import get_db_context
    from utils.timing import TimingContext

    async with TimingContext(
        operation_type="content_storage",
        operation_name="store_batch",
        crawl_id=crawl_session_id,
        metadata={"document_count": len(documents), "source": content_source}
    ) as ctx:
        try:
            stored_count = 0
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
                    stored_count += 1
                # Auto-commits on context exit

            # Update metadata with success details
            ctx.metadata["stored_count"] = stored_count

        except Exception as e:
            # Mark as failure in metrics
            ctx.success = False
            ctx.error_message = str(e)

            # Still log for immediate visibility
            logger.error(
                "Content storage failed",
                crawl_session_id=crawl_session_id,
                document_count=len(documents),
                error=str(e),
                error_type=type(e).__name__,
                exc_info=True
            )


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
    crawl_session_id: str,
    limit: int = 100,
    offset: int = 0
) -> list[ScrapedContent]:
    """
    Retrieve content for a crawl session with pagination.

    Returns content ordered by database insertion time (created_at),
    not scrape time (scraped_at), to ensure stable pagination ordering.

    Args:
        session: Database session
        crawl_session_id: job_id of CrawlSession (String field)
        limit: Maximum results to return (default 100, max 1000)
        offset: Number of results to skip (default 0)

    Returns:
        List of ScrapedContent instances
    """
    result = await session.execute(
        select(ScrapedContent)
        .where(ScrapedContent.crawl_session_id == crawl_session_id)
        .order_by(ScrapedContent.created_at.asc())
        .limit(limit)
        .offset(offset)
    )
    return list(result.scalars().all())
