"""Background job for rescraping changed URLs."""

from datetime import UTC, datetime
from typing import Any, cast

import httpx
from rq import get_current_job
from sqlalchemy import select, update

from config import settings
from infra.database import get_db_context
from api.schemas.indexing import IndexDocumentRequest
from domain.models import ChangeEvent
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
    Rescrape URL that was detected as changed by changedetection.io.

    Args:
        change_event_id: ID of change event in webhook.change_events table

    Returns:
        dict: Rescrape result with status and indexed document ID

    Raises:
        ValueError: If change event not found
        Exception: If Firecrawl API or indexing fails
    """
    job = get_current_job()
    job_id = job.id if job else None

    logger.info("Starting rescrape job", change_event_id=change_event_id, job_id=job_id)

    async with get_db_context() as session:
        # Fetch change event
        result = await session.execute(select(ChangeEvent).where(ChangeEvent.id == change_event_id))
        change_event = result.scalar_one_or_none()

        if not change_event:
            raise ValueError(f"Change event {change_event_id} not found")

        # Update job ID
        if job_id:
            await session.execute(
                update(ChangeEvent)
                .where(ChangeEvent.id == change_event_id)
                .values(rescrape_job_id=job_id, rescrape_status="in_progress")
            )
            await session.commit()

        try:
            # Call Firecrawl API
            logger.info(
                "Calling Firecrawl API",
                url=change_event.watch_url,
                job_id=job_id,
            )

            firecrawl_url = getattr(settings, "firecrawl_api_url", "http://firecrawl:3002")
            firecrawl_key = getattr(settings, "firecrawl_api_key", "self-hosted-no-auth")

            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(
                    f"{firecrawl_url}/v2/scrape",
                    json={
                        "url": change_event.watch_url,
                        "formats": ["markdown", "html"],
                        "onlyMainContent": True,
                    },
                    headers={"Authorization": f"Bearer {firecrawl_key}"},
                )
                response.raise_for_status()
                scrape_data = cast(dict[str, Any], response.json())

            if not scrape_data.get("success"):
                raise Exception(f"Firecrawl scrape failed: {scrape_data}")

            # Index in search (Qdrant + BM25)
            logger.info("Indexing scraped content", url=change_event.watch_url)

            data = scrape_data.get("data", {})
            doc_id = await _index_document_helper(
                url=change_event.watch_url,
                text=data.get("markdown", ""),
                metadata={
                    "change_event_id": change_event_id,
                    "watch_id": change_event.watch_id,
                    "detected_at": format_est_timestamp(change_event.detected_at),
                    "title": data.get("metadata", {}).get("title"),
                    "description": data.get("metadata", {}).get("description"),
                },
            )

            # Update change event
            await session.execute(
                update(ChangeEvent)
                .where(ChangeEvent.id == change_event_id)
                .values(
                    rescrape_status="completed",
                    indexed_at=datetime.now(UTC),
                    extra_metadata={
                        **(change_event.extra_metadata or {}),
                        "document_id": doc_id,
                        "firecrawl_status": scrape_data.get("status"),
                    },
                )
            )
            await session.commit()

            logger.info(
                "Rescrape completed successfully",
                change_event_id=change_event_id,
                document_id=doc_id,
            )

            return {
                "status": "success",
                "change_event_id": change_event_id,
                "document_id": doc_id,
                "url": change_event.watch_url,
            }

        except Exception as e:
            # Update failure status
            logger.error(
                "Rescrape failed",
                change_event_id=change_event_id,
                error=str(e),
            )

            await session.execute(
                update(ChangeEvent)
                .where(ChangeEvent.id == change_event_id)
                .values(
                    rescrape_status=f"failed: {str(e)[:200]}",
                    extra_metadata={
                        **(change_event.extra_metadata or {}),
                        "error": str(e),
                        "failed_at": format_est_timestamp(),
                    },
                )
            )
            await session.commit()
            raise
