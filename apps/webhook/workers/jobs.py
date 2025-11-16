"""Background job for rescraping changed URLs."""

from datetime import UTC, datetime
from typing import Any, cast

import httpx
from rq import get_current_job
from sqlalchemy import select, update

from api.schemas.indexing import IndexDocumentRequest
from config import settings
from domain.models import ChangeEvent
from infra.database import get_db_context
from services.service_pool import ServicePool
from utils.logging import get_logger
from utils.time import format_est_timestamp

logger = get_logger(__name__)


async def _index_document_helper(
    url: str,
    text: str,
    metadata: dict[str, Any],
) -> str:
    """
    Helper function to index a document using the IndexingService.

    Uses service pool for efficient resource reuse.

    Args:
        url: Document URL
        text: Document markdown content
        metadata: Document metadata

    Returns:
        Document URL as identifier
    """
    # Get services from pool (FAST - no initialization overhead)
    service_pool = ServicePool.get_instance()
    indexing_service = service_pool.get_indexing_service()

    # Ensure collection exists
    await service_pool.vector_store.ensure_collection()

    # Create IndexDocumentRequest
    document = IndexDocumentRequest(
        url=url,
        markdown=text,
        title=metadata.get("title", ""),
        description=metadata.get("description", ""),
        language="en",  # Default language
        country=None,
        is_mobile=False,
    )

    # Index document
    result = await indexing_service.index_document(document)

    if not result.get("success"):
        raise Exception(f"Indexing failed: {result.get('error')}")

    return url  # Return URL as document ID


async def rescrape_changed_url(change_event_id: int) -> dict[str, Any]:
    """
    Rescrape URL with proper transaction boundaries.

    TRANSACTION ISOLATION STRATEGY
    ==============================

    This function uses a THREE-TRANSACTION pattern to prevent zombie jobs
    while minimizing database lock contention during long HTTP operations.

    Transaction 1: Mark as in_progress (COMMIT IMMEDIATELY)
    -------------------------------------------------------
    - Updates rescrape_status = "in_progress"
    - Commits immediately (releases DB lock)
    - TRADE-OFF: Job is visible as "in_progress" but not actually running yet
    - WHY: Allows zombie cleanup cron to detect stuck jobs

    Phase 2: External Operations (NO DATABASE TRANSACTION)
    -------------------------------------------------------
    - Calls Firecrawl API (up to 120s timeout)
    - Indexes document in Qdrant
    - NO database locks held during this phase
    - TRADE-OFF: If process crashes here, job stuck in "in_progress"
    - MITIGATION: Zombie cleanup cron marks abandoned jobs as failed after 15min

    Transaction 3a/3b: Update Final Status (SEPARATE TRANSACTION)
    --------------------------------------------------------------
    - On success: Update to "completed" + metadata
    - On failure: Update to "failed" + error message
    - Each in separate transaction (commit on success, rollback on error)

    CONCURRENCY CONSIDERATIONS
    ==========================

    This pattern DOES NOT prevent duplicate processing if multiple workers
    start simultaneously. To prevent this, consider adding:

    1. Optimistic Locking:
       WHERE rescrape_status = "queued" AND id = change_event_id
       (only one worker succeeds if both try to claim)

    2. Worker ID Tracking:
       Store processing_worker_id to identify owner

    3. Row-Level Locking:
       SELECT ... FOR UPDATE (holds lock across all 3 phases)
       TRADE-OFF: Blocks other workers for 120+ seconds

    Current implementation optimizes for:
    - Low DB lock contention (important for high throughput)
    - Zombie job detection (important for reliability)
    - Simple failure recovery (no complex rollback logic)

    Args:
        change_event_id: ID of change event to rescrape

    Returns:
        dict with status, change_event_id, document_id, url

    Raises:
        ValueError: If change event not found
        Exception: If Firecrawl or indexing fails
    """
    job = get_current_job()
    job_id = job.id if job else None

    logger.info("Starting rescrape job", change_event_id=change_event_id, job_id=job_id)

    # TRANSACTION 1: Mark as in_progress (separate transaction)
    async with get_db_context() as session:
        result = await session.execute(select(ChangeEvent).where(ChangeEvent.id == change_event_id))
        change_event = result.scalar_one_or_none()

        if not change_event:
            raise ValueError(f"Change event {change_event_id} not found")

        watch_url = change_event.watch_url

        if job_id:
            await session.execute(
                update(ChangeEvent)
                .where(ChangeEvent.id == change_event_id)
                .values(rescrape_job_id=job_id, rescrape_status="in_progress")
            )
            await session.commit()  # Commit immediately

    # PHASE 2: Execute external operations (Firecrawl + indexing) - no DB changes
    # This phase can take 120+ seconds, so we intentionally do NOT hold a DB transaction
    try:
        # Call Firecrawl API (up to 120s timeout)
        logger.info("Calling Firecrawl API", url=watch_url, job_id=job_id)

        firecrawl_url = getattr(settings, "firecrawl_api_url", "http://firecrawl:3002")
        firecrawl_key = getattr(settings, "firecrawl_api_key", "self-hosted-no-auth")

        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                f"{firecrawl_url}/v2/scrape",
                json={
                    "url": watch_url,
                    "formats": ["markdown", "html"],
                    "onlyMainContent": True,
                },
                headers={"Authorization": f"Bearer {firecrawl_key}"},
            )
            response.raise_for_status()
            scrape_data = cast(dict[str, Any], response.json())

        if not scrape_data.get("success"):
            raise Exception(f"Firecrawl scrape failed: {scrape_data}")

        # Index in search
        logger.info("Indexing scraped content", url=watch_url)
        data = scrape_data.get("data", {})
        doc_id = await _index_document_helper(
            url=watch_url,
            text=data.get("markdown", ""),
            metadata={
                "change_event_id": change_event_id,
                "title": data.get("metadata", {}).get("title"),
                "description": data.get("metadata", {}).get("description"),
            },
        )

    except Exception as e:
        # TRANSACTION 3a: Update failure status (separate transaction)
        # If we fail here, we still update the database status to "failed"
        # This ensures the job doesn't remain in "in_progress" forever
        logger.error("Rescrape failed", change_event_id=change_event_id, error=str(e))

        async with get_db_context() as session:
            await session.execute(
                update(ChangeEvent)
                .where(ChangeEvent.id == change_event_id)
                .values(
                    rescrape_status=f"failed: {str(e)[:200]}",
                    extra_metadata={
                        "error": str(e),
                        "failed_at": format_est_timestamp(),
                    },
                )
            )
            await session.commit()
        raise

    # TRANSACTION 3b: Update success status (separate transaction)
    async with get_db_context() as session:
        await session.execute(
            update(ChangeEvent)
            .where(ChangeEvent.id == change_event_id)
            .values(
                rescrape_status="completed",
                indexed_at=datetime.now(UTC),
                extra_metadata={
                    "document_id": doc_id,
                    "firecrawl_status": scrape_data.get("status"),
                },
            )
        )
        await session.commit()

    logger.info(
        "Rescrape completed successfully", change_event_id=change_event_id, document_id=doc_id
    )

    return {
        "status": "success",
        "change_event_id": change_event_id,
        "document_id": doc_id,
        "url": watch_url,
    }
