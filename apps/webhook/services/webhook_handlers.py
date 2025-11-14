"""Handlers for Firecrawl webhook events."""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, cast

from rq import Queue
from sqlalchemy import func, select

from api.schemas.indexing import IndexDocumentRequest
from api.schemas.webhook import (
    FirecrawlDocumentPayload,
    FirecrawlLifecycleEvent,
    FirecrawlPageEvent,
)
from config import settings
from domain.models import CrawlSession, OperationMetric
from infra.database import get_db_context
from services.auto_watch import create_watch_for_url
from utils.logging import get_logger

logger = get_logger(__name__)

PAGE_EVENT_TYPES = {"crawl.page", "batch_scrape.page"}
LIFECYCLE_EVENT_TYPES = {
    "crawl.started",
    "crawl.completed",
    "crawl.failed",
    "batch_scrape.started",
    "batch_scrape.completed",
    "extract.started",
    "extract.completed",
    "extract.failed",
}


@dataclass(slots=True)
class WebhookHandlerError(Exception):
    """Exception raised when webhook handling fails."""

    status_code: int
    detail: str

    def __str__(self) -> str:  # pragma: no cover - inherited behavior adequate
        return f"{self.status_code}: {self.detail}"


async def handle_firecrawl_event(
    event: FirecrawlPageEvent | FirecrawlLifecycleEvent | Any,
    queue: Queue,
) -> dict[str, Any]:
    """Dispatch Firecrawl webhook events to the appropriate handler."""

    event_type = getattr(event, "type", None)

    if event_type in PAGE_EVENT_TYPES:
        return await _handle_page_event(event, queue)

    if event_type in LIFECYCLE_EVENT_TYPES:
        return await _handle_lifecycle_event(event)

    logger.warning("Unsupported Firecrawl event type", event_type=event_type)
    raise WebhookHandlerError(status_code=400, detail=f"Unsupported event type: {event_type}")


async def _handle_page_event(
    event: FirecrawlPageEvent | Any,
    queue: Queue,
) -> dict[str, Any]:
    """Process crawl page events with robust error handling."""

    try:
        documents = _coerce_documents(getattr(event, "data", []))
    except Exception as e:
        logger.error(
            "Failed to coerce documents from webhook data",
            event_id=getattr(event, "id", None),
            event_type=getattr(event, "type", None),
            error=str(e),
            error_type=type(e).__name__,
            data_sample=str(getattr(event, "data", [])[:1]),
        )
        raise WebhookHandlerError(status_code=422, detail=f"Invalid document structure: {str(e)}")

    if not documents:
        logger.info(
            "Page event received with no documents",
            event_id=getattr(event, "id", None),
            event_type=getattr(event, "type", None),
        )
        return {"status": "no_documents", "queued_jobs": 0, "job_ids": []}

    job_ids: list[str] = []
    failed_documents: list[dict[str, Any]] = []

    # Use Redis pipeline for atomic batch operations (5-10x faster)
    with queue.connection.pipeline() as pipe:
        for idx, document in enumerate(documents):
            try:
                index_payload = _document_to_index_payload(document)

                try:
                    job = queue.enqueue(
                        "worker.index_document_job",
                        index_payload,
                        job_timeout=settings.indexing_job_timeout,
                        pipeline=pipe,  # Use pipeline for batching
                    )
                    job_id = str(job.id) if job.id else None
                    if job_id:
                        job_ids.append(job_id)

                    logger.debug(
                        "Document queued from webhook",
                        event_id=getattr(event, "id", None),
                        job_id=job_id,
                        url=document.metadata.url,
                        document_index=idx,
                    )

                except Exception as queue_error:
                    logger.error(
                        "Failed to enqueue document",
                        event_id=getattr(event, "id", None),
                        url=document.metadata.url,
                        document_index=idx,
                        error=str(queue_error),
                        error_type=type(queue_error).__name__,
                    )
                    failed_documents.append(
                        {
                            "url": document.metadata.url,
                            "index": idx,
                            "error": str(queue_error),
                        }
                    )

            except Exception as transform_error:
                logger.error(
                    "Failed to transform document payload",
                    event_id=getattr(event, "id", None),
                    document_index=idx,
                    error=str(transform_error),
                    error_type=type(transform_error).__name__,
                )
                failed_documents.append(
                    {
                        "index": idx,
                        "error": str(transform_error),
                    }
                )

        # Execute pipeline atomically
        pipe.execute()

    # Log job creation success (after pipeline execution)
    logger.info(
        "Batch job enqueueing completed",
        event_id=getattr(event, "id", None),
        total_documents=len(documents),
        queued_jobs=len(job_ids),
        failed_jobs=len(failed_documents),
    )

    # Auto-watch creation moved to fire-and-forget asyncio tasks
    for document in documents:
        try:
            # Fire-and-forget auto-watch creation
            import asyncio
            asyncio.create_task(create_watch_for_url(document.metadata.url))
        except Exception as watch_error:
            logger.warning(
                "Auto-watch scheduling failed but indexing continues",
                url=document.metadata.url,
                error=str(watch_error),
            )

    result: dict[str, Any] = {
        "status": "queued" if job_ids else "failed",
        "queued_jobs": len(job_ids),
        "job_ids": job_ids,
    }

    if failed_documents:
        result["failed_documents"] = failed_documents
        logger.warning(
            "Some documents failed to queue",
            event_id=getattr(event, "id", None),
            successful=len(job_ids),
            failed=len(failed_documents),
        )

    return result


async def _handle_lifecycle_event(event: FirecrawlLifecycleEvent | Any) -> dict[str, Any]:
    """Process lifecycle events with crawl session tracking."""

    event_type = getattr(event, "type", None)
    crawl_id = getattr(event, "id", None)

    # Record lifecycle events
    if event_type == "crawl.started":
        await _record_crawl_start(crawl_id, event)

    # Existing logging
    metadata = getattr(event, "metadata", {})
    error = getattr(event, "error", None)

    if event_type and event_type.endswith("failed"):
        logger.error(
            "Firecrawl crawl failed",
            event_id=crawl_id,
            error=error,
            metadata=metadata,
        )
    else:
        logger.info(
            "Firecrawl lifecycle event",
            event_id=crawl_id,
            event_type=event_type,
            metadata=metadata,
        )

    return {"status": "acknowledged", "event_type": event_type}


async def _record_crawl_start(crawl_id: str, event: FirecrawlLifecycleEvent) -> None:
    """
    Record crawl start in CrawlSession table.

    Args:
        crawl_id: Firecrawl crawl/job identifier
        event: Lifecycle start event
    """
    crawl_url = event.metadata.get("url", "unknown")

    # Parse MCP-provided timestamp if available
    initiated_at_str = event.metadata.get("initiated_at")
    initiated_at = None
    if initiated_at_str:
        try:
            initiated_at = datetime.fromisoformat(initiated_at_str.replace("Z", "+00:00"))
        except Exception as e:
            logger.warning(
                "Failed to parse initiated_at timestamp",
                value=initiated_at_str,
                error=str(e),
            )

    try:
        async with get_db_context() as db:
            # Check if session already exists
            result = await db.execute(
                select(CrawlSession).where(CrawlSession.crawl_id == crawl_id)
            )
            existing = result.scalar_one_or_none()

            if existing:
                logger.info(
                    "Crawl session already exists, skipping creation",
                    crawl_id=crawl_id,
                    status=existing.status,
                )
                return

            session = CrawlSession(
                crawl_id=crawl_id,
                crawl_url=crawl_url,
                started_at=datetime.now(UTC),
                initiated_at=initiated_at,
                status="in_progress",
                extra_metadata=event.metadata,
            )
            db.add(session)
            await db.commit()

        logger.info(
            "Crawl session started",
            crawl_id=crawl_id,
            crawl_url=crawl_url,
            has_initiated_timestamp=initiated_at is not None,
        )

    except Exception as e:
        logger.error(
            "Failed to record crawl start",
            crawl_id=crawl_id,
            error=str(e),
            error_type=type(e).__name__,
        )


def _coerce_documents(
    documents: Iterable[FirecrawlDocumentPayload | dict[str, Any]],
) -> list[FirecrawlDocumentPayload]:
    """Convert raw document payloads with individual error handling."""

    from pydantic import ValidationError

    coerced: list[FirecrawlDocumentPayload] = []

    for idx, document in enumerate(documents):
        try:
            if isinstance(document, FirecrawlDocumentPayload):
                coerced.append(document)
            else:
                validated = FirecrawlDocumentPayload.model_validate(document)
                coerced.append(validated)

        except ValidationError as e:
            logger.error(
                "Document validation failed in data array",
                document_index=idx,
                validation_errors=e.errors(include_context=True),
                document_keys=list(document.keys()) if isinstance(document, dict) else None,
                document_sample=str(document)[:500],
            )
            # Re-raise to fail the entire webhook - strict mode
            raise

    return coerced


def _document_to_index_payload(document: FirecrawlDocumentPayload) -> dict[str, Any]:
    """Flatten nested Firecrawl structure with defensive access."""
    try:
        url = document.metadata.url
        resolved_url = getattr(document.metadata, "source_url", None) or url

        logger.debug(
            "Transforming webhook document",
            url=url,
            has_markdown=document.markdown is not None,
            has_html=document.html is not None,
            status_code=document.metadata.status_code,
            markdown_length=len(document.markdown) if document.markdown else 0,
        )

        normalized = IndexDocumentRequest(
            url=url,
            resolvedUrl=resolved_url,
            title=getattr(document.metadata, "title", None),
            description=getattr(document.metadata, "description", None),
            markdown=document.markdown or "",
            html=document.html or "",
            statusCode=getattr(document.metadata, "status_code", 200),
            gcsPath=None,
            screenshotUrl=None,
            language=getattr(document.metadata, "language", None),
            country=getattr(document.metadata, "country", None),
            isMobile=False,
        )

        logger.info(
            "Document transformed successfully",
            url=url,
            markdown_length=len(document.markdown) if document.markdown else 0,
        )

        return cast(dict[str, Any], normalized.model_dump(by_alias=True))

    except AttributeError as e:
        logger.error(
            "Missing required field during document transformation",
            error=str(e),
            has_metadata=hasattr(document, "metadata"),
            metadata_attrs=dir(document.metadata) if hasattr(document, "metadata") else None,
        )
        raise
