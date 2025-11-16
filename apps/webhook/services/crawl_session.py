"""
Crawl session management service.

Handles creation and updates of CrawlSession records for tracking
Firecrawl operations across their lifecycle.
"""

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from domain.models import CrawlSession
from utils.logging import get_logger

logger = get_logger(__name__)


async def create_crawl_session(
    db: AsyncSession,
    job_id: str,
    operation_type: str,
    base_url: str,
    auto_index: bool = True,
    extra_metadata: dict[str, Any] | None = None,
) -> CrawlSession:
    """
    Create a new crawl session record.

    Args:
        db: Database session
        job_id: Firecrawl job ID from API response
        operation_type: Type of operation (scrape, scrape_batch, crawl, map, search, extract)
        base_url: Base URL being processed
        auto_index: Whether to automatically index results
        extra_metadata: Additional metadata to store

    Returns:
        Created CrawlSession instance
    """
    session = CrawlSession(
        job_id=job_id,
        operation_type=operation_type,
        base_url=base_url,
        started_at=datetime.now(UTC),
        status="pending",
        auto_index=auto_index,
        extra_metadata=extra_metadata or {},
    )

    db.add(session)
    await db.commit()
    await db.refresh(session)

    logger.info(
        "Created crawl session",
        job_id=job_id,
        operation_type=operation_type,
        base_url=base_url,
        auto_index=auto_index,
    )

    return session


async def get_crawl_session(db: AsyncSession, job_id: str) -> CrawlSession | None:
    """
    Get a crawl session by job ID.

    Args:
        db: Database session
        job_id: Firecrawl job ID

    Returns:
        CrawlSession if found, None otherwise
    """
    result = await db.execute(select(CrawlSession).where(CrawlSession.job_id == job_id))
    return result.scalar_one_or_none()


async def update_crawl_session_status(
    db: AsyncSession,
    job_id: str,
    status: str,
    total_urls: int | None = None,
    completed_urls: int | None = None,
    failed_urls: int | None = None,
    success: bool | None = None,
    error_message: str | None = None,
) -> CrawlSession | None:
    """
    Update crawl session status and progress.

    Args:
        db: Database session
        job_id: Firecrawl job ID
        status: New status (pending, scraping, completed, failed)
        total_urls: Total URLs in operation
        completed_urls: Successfully completed URLs
        failed_urls: Failed URLs
        success: Whether operation completed successfully
        error_message: Error message if failed

    Returns:
        Updated CrawlSession if found, None otherwise
    """
    session = await get_crawl_session(db, job_id)
    if not session:
        logger.warning("Crawl session not found for update", job_id=job_id)
        return None

    # Update fields
    session.status = status
    session.updated_at = datetime.now(UTC)

    if total_urls is not None:
        session.total_urls = total_urls
    if completed_urls is not None:
        session.completed_urls = completed_urls
    if failed_urls is not None:
        session.failed_urls = failed_urls
    if success is not None:
        session.success = success
    if error_message is not None:
        session.error_message = error_message

    # Set completed_at if status is terminal
    if status in ("completed", "failed", "cancelled"):
        session.completed_at = datetime.now(UTC)

        # Calculate duration if we have both timestamps
        if session.started_at and session.completed_at:
            duration = (session.completed_at - session.started_at).total_seconds() * 1000
            session.duration_ms = duration

    await db.commit()
    await db.refresh(session)

    logger.info(
        "Updated crawl session",
        job_id=job_id,
        status=status,
        total_urls=total_urls,
        completed_urls=completed_urls,
        failed_urls=failed_urls,
    )

    return session
