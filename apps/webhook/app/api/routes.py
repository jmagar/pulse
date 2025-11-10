"""
API route handlers.

Implements the REST API endpoints for document indexing and search.
"""

import hashlib
import hmac
import time
from datetime import datetime, timezone
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from fastapi.responses import JSONResponse
from pydantic import TypeAdapter, ValidationError
from rq import Queue
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import (
    get_bm25_engine,
    get_embedding_service,
    get_indexing_service,
    get_rq_queue,
    get_search_orchestrator,
    get_vector_store,
    verify_api_secret,
    verify_webhook_signature,
)
from app.config import settings
from app.database import get_db_session
from app.models import (
    ChangeDetectionPayload,
    FirecrawlWebhookEvent,
    HealthStatus,
    IndexDocumentRequest,
    IndexDocumentResponse,
    IndexStats,
    SearchRequest,
    SearchResponse,
    SearchResult,
)
from app.rate_limit import limiter
from app.services.bm25_engine import BM25Engine
from app.services.embedding import EmbeddingService
from app.services.indexing import IndexingService
from app.services.search import SearchOrchestrator
from app.services.vector_store import VectorStore
from app.services.webhook_handlers import (
    WebhookHandlerError,
    handle_firecrawl_event,
)
from app.utils.logging import get_logger

logger = get_logger(__name__)

WEBHOOK_EVENT_ADAPTER: TypeAdapter[FirecrawlWebhookEvent] = TypeAdapter(FirecrawlWebhookEvent)

router = APIRouter()


@router.post(
    "/api/index",
    response_model=IndexDocumentResponse,
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(verify_api_secret)],
    deprecated=True,
    description="DEPRECATED: Use /api/webhook/firecrawl instead.",
)
@limiter.limit("10/minute")
async def index_document(
    request: Request,
    document: IndexDocumentRequest,
    queue: Annotated[Queue, Depends(get_rq_queue)],
) -> IndexDocumentResponse:
    """
    Queue a document for async indexing.

    Rate limit: 10 requests per minute per IP address.

    This endpoint accepts documents from Firecrawl and queues them
    for background processing.
    """
    request_start = time.perf_counter()

    logger.info(
        "Indexing request received",
        url=document.url,
        markdown_length=len(document.markdown),
        has_title=bool(document.title),
        has_description=bool(document.description),
    )

    try:
        # Check queue status before enqueueing
        queue_length_before = len(queue)

        # Enqueue indexing job
        job = queue.enqueue(
            "app.worker.index_document_job",
            document.model_dump(),
            job_timeout="10m",
        )

        # Check queue status after enqueueing
        queue_length_after = len(queue)

        duration_ms = (time.perf_counter() - request_start) * 1000
        logger.info(
            "Indexing job queued successfully",
            job_id=job.id,
            url=document.url,
            queue_position=queue_length_before + 1,
            queue_length_before=queue_length_before,
            queue_length_after=queue_length_after,
            duration_ms=round(duration_ms, 2),
        )

        return IndexDocumentResponse(
            job_id=job.id,
            status="queued",
            message=f"Document queued for indexing: {document.url}",
        )

    except Exception as e:
        duration_ms = (time.perf_counter() - request_start) * 1000
        logger.error(
            "Failed to queue indexing job",
            url=document.url,
            error=str(e),
            error_type=type(e).__name__,
            duration_ms=round(duration_ms, 2),
            exc_info=True,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to queue document: {str(e)}",
        )


@router.post(
    "/api/search",
    response_model=SearchResponse,
    dependencies=[Depends(verify_api_secret)],
)
@limiter.limit("50/minute")
async def search_documents(
    request: Request,
    search_request: SearchRequest,
    orchestrator: Annotated[SearchOrchestrator, Depends(get_search_orchestrator)],
) -> SearchResponse:
    """
    Search indexed documents.

    Rate limit: 50 requests per minute per IP address.

    Supports multiple search modes:
    - hybrid: Vector + BM25 with RRF fusion
    - semantic: Vector similarity only
    - keyword/bm25: BM25 keyword search only
    """
    request_start = time.perf_counter()

    logger.info(
        "Received search request",
        query=search_request.query,
        query_length=len(search_request.query),
        mode=search_request.mode,
        limit=search_request.limit,
        has_filters=bool(search_request.filters),
    )

    try:
        # Extract filters
        filter_start = time.perf_counter()
        filters: dict[str, Any] = search_request.filters.model_dump() if search_request.filters else {}
        filter_duration_ms = round((time.perf_counter() - filter_start) * 1000, 2)

        logger.debug(
            "Filters extracted",
            duration_ms=filter_duration_ms,
            filter_count=len(filters),
        )

        # Execute search
        search_start = time.perf_counter()
        raw_results = await orchestrator.search(
            query=search_request.query,
            mode=search_request.mode,
            limit=search_request.limit,
            domain=filters.get("domain"),
            language=filters.get("language"),
            country=filters.get("country"),
            is_mobile=filters.get("is_mobile"),
        )
        search_duration_ms = round((time.perf_counter() - search_start) * 1000, 2)

        logger.info(
            "Search orchestration completed",
            duration_ms=search_duration_ms,
            raw_results_count=len(raw_results),
        )

        # Convert to response format
        conversion_start = time.perf_counter()
        results = []
        for result in raw_results:
            payload = result.get("payload") or result.get("metadata", {})

            # Extract text from both vector (payload) and BM25 (top-level) results
            # Vector results have text in payload, BM25 results have it at top-level
            text = payload.get("text") or result.get("text", "")

            results.append(
                SearchResult(
                    url=payload.get("url", ""),
                    title=payload.get("title"),
                    description=payload.get("description"),
                    text=text,
                    score=result.get("score") or result.get("rrf_score", 0.0),
                    metadata=payload,
                )
            )
        conversion_duration_ms = round((time.perf_counter() - conversion_start) * 1000, 2)

        logger.debug(
            "Results converted to response format",
            duration_ms=conversion_duration_ms,
            result_count=len(results),
        )

        total_duration_ms = round((time.perf_counter() - request_start) * 1000, 2)
        logger.info(
            "Search request completed successfully",
            query=search_request.query,
            mode=search_request.mode,
            results_returned=len(results),
            total_duration_ms=total_duration_ms,
            search_duration_ms=search_duration_ms,
            conversion_duration_ms=conversion_duration_ms,
        )

        return SearchResponse(
            results=results,
            total=len(results),
            query=search_request.query,
            mode=search_request.mode,
        )

    except Exception as e:
        total_duration_ms = round((time.perf_counter() - request_start) * 1000, 2)
        logger.error(
            "Search request failed",
            query=search_request.query,
            mode=search_request.mode,
            error=str(e),
            error_type=type(e).__name__,
            duration_ms=total_duration_ms,
            exc_info=True,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Search failed: {str(e)}",
        )


@router.post(
    "/api/webhook/firecrawl",
    dependencies=[Depends(verify_webhook_signature)],
)
@limiter.exempt
async def webhook_firecrawl(
    request: Request,
    queue: Annotated[Queue, Depends(get_rq_queue)],
) -> JSONResponse:
    """
    Process Firecrawl webhook with comprehensive logging.

    Note: Rate limiting is disabled for this endpoint because:
    - It's an internal service within the Docker network
    - Signature verification provides security
    - Large crawls can send hundreds of webhooks rapidly
    """

    request_start = time.perf_counter()

    # Log raw payload
    payload = await request.json()
    logger.info(
        "Webhook received",
        event_type=payload.get("type"),
        event_id=payload.get("id"),
        success=payload.get("success"),
        data_count=len(payload.get("data", [])),
        has_top_metadata=bool(payload.get("metadata")),
        payload_keys=list(payload.keys()),
    )

    # Validate with detailed error context
    try:
        event = WEBHOOK_EVENT_ADAPTER.validate_python(payload)
        logger.info(
            "Webhook validation successful",
            event_type=event.type,
            event_id=event.id,
            data_items=len(event.data) if hasattr(event, "data") else 0,
        )
    except ValidationError as exc:
        validation_errors = exc.errors(include_context=True)

        # Log first data item structure for debugging
        sample_data = None
        if payload.get("data") and len(payload["data"]) > 0:
            sample_data = payload["data"][0]

        logger.error(
            "Webhook payload validation failed",
            event_type=payload.get("type"),
            event_id=payload.get("id"),
            error_count=len(validation_errors),
            validation_errors=validation_errors,
            payload_keys=list(payload.keys()),
            data_item_count=len(payload.get("data", [])),
            sample_data_keys=(
                list(sample_data.keys()) if sample_data and isinstance(sample_data, dict) else None
            ),
            sample_data_structure=str(sample_data)[:500] if sample_data else None,
        )

        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error": "Invalid webhook payload structure",
                "validation_errors": validation_errors,
                "hint": "Check data array structure matches Firecrawl API spec",
            },
        ) from exc

    # Process with error handling
    try:
        result = await handle_firecrawl_event(event, queue)
        duration_ms = (time.perf_counter() - request_start) * 1000

        logger.info(
            "Webhook processed successfully",
            event_type=event.type,
            event_id=event.id,
            result_status=result.get("status"),
            jobs_queued=result.get("queued_jobs", 0),
            has_failures=bool(result.get("failed_documents")),
            duration_ms=round(duration_ms, 2),
        )

    except WebhookHandlerError as exc:
        duration_ms = (time.perf_counter() - request_start) * 1000
        logger.error(
            "Webhook handler error",
            event_type=getattr(event, "type", None),
            event_id=getattr(event, "id", None),
            detail=exc.detail,
            status_code=exc.status_code,
            duration_ms=round(duration_ms, 2),
        )
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    status_code = (
        status.HTTP_202_ACCEPTED if result.get("status") == "queued" else status.HTTP_200_OK
    )

    return JSONResponse(status_code=status_code, content=result)


def _compute_diff_size(snapshot: str | None) -> int:
    """
    Compute the size of the snapshot content in bytes.

    <summary>
    Helper function to calculate diff size from snapshot content.
    </summary>

    <param name="snapshot">The snapshot content string</param>
    <returns>Size in bytes, or 0 if snapshot is None</returns>
    """
    return len(snapshot) if snapshot else 0


def _extract_changedetection_metadata(
    payload: ChangeDetectionPayload,
    signature: str,
    snapshot_size: int,
) -> dict[str, Any]:
    """
    Extract and structure metadata from changedetection webhook payload.

    <summary>
    Builds a comprehensive metadata dictionary with webhook signature,
    payload version, timestamps, and computed metrics.
    </summary>

    <param name="payload">The validated changedetection payload</param>
    <param name="signature">HMAC signature from X-Signature header</param>
    <param name="snapshot_size">Computed size of snapshot content</param>
    <returns>Structured metadata dictionary</returns>
    """
    return {
        "watch_title": payload.watch_title,
        "webhook_received_at": datetime.now(timezone.utc).isoformat(),
        "signature": signature,
        "diff_size": snapshot_size,
        "raw_payload_version": "1.0",
        "detected_at": payload.detected_at,
    }


@router.post("/api/webhook/changedetection", status_code=202)
@limiter.exempt
async def handle_changedetection_webhook(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    queue: Annotated[Queue, Depends(get_rq_queue)],
    signature: str | None = Header(None, alias="X-Signature"),
) -> dict:
    """
    Handle webhook notifications from changedetection.io.

    Verifies HMAC signature, stores change event, and enqueues
    Firecrawl rescrape job for updated content.

    Note: Rate limiting is disabled for this endpoint because:
    - It's an internal service within the Docker network
    - Signature verification provides security
    - Change detection events are naturally rate-limited
    """
    # Verify HMAC signature BEFORE parsing payload
    if not signature:
        raise HTTPException(401, "Missing X-Signature header")

    body = await request.body()
    expected_sig = hmac.new(
        settings.webhook_secret.encode(),
        body,
        hashlib.sha256
    ).hexdigest()

    provided_sig = signature.replace("sha256=", "")

    if not hmac.compare_digest(expected_sig, provided_sig):
        logger.warning(
            "Invalid changedetection webhook signature",
        )
        raise HTTPException(401, "Invalid signature")

    # Parse and validate payload AFTER signature verification
    try:
        import json
        payload_dict = json.loads(body)
        payload = ChangeDetectionPayload(**payload_dict)
    except Exception as e:
        logger.error("Failed to parse changedetection payload", error=str(e))
        raise HTTPException(400, f"Invalid payload: {str(e)}")

    logger.info(
        "Received changedetection webhook",
        watch_id=payload.watch_id,
        watch_url=payload.watch_url,
    )

    # Store change event in database
    from app.models.timing import ChangeEvent

    # Compute metadata
    snapshot_size = _compute_diff_size(payload.snapshot)
    metadata = _extract_changedetection_metadata(payload, signature, snapshot_size)

    change_event = ChangeEvent(
        watch_id=payload.watch_id,
        watch_url=payload.watch_url,
        detected_at=datetime.fromisoformat(payload.detected_at.replace("Z", "+00:00")),
        diff_summary=payload.snapshot[:500] if payload.snapshot else None,
        snapshot_url=payload.diff_url,
        rescrape_status="queued",
        extra_metadata=metadata,
    )

    db.add(change_event)
    await db.commit()
    await db.refresh(change_event)

    # Enqueue rescrape job
    from app.api.dependencies import get_redis_connection

    redis_client = get_redis_connection()
    rescrape_queue = Queue("indexing", connection=redis_client)

    job = rescrape_queue.enqueue(
        "app.jobs.rescrape.rescrape_changed_url",
        change_event.id,
        job_timeout="10m",
    )

    # Update event with job ID
    change_event.rescrape_job_id = job.id
    await db.commit()

    logger.info(
        "Enqueued rescrape job for changed URL",
        job_id=job.id,
        watch_url=payload.watch_url,
        change_event_id=change_event.id,
    )

    return {
        "status": "queued",
        "job_id": job.id,
        "change_event_id": change_event.id,
        "url": payload.watch_url,
    }


@router.get("/health", response_model=HealthStatus)
async def health_check(
    embedding_service: Annotated[EmbeddingService, Depends(get_embedding_service)],
    vector_store: Annotated[VectorStore, Depends(get_vector_store)],
) -> HealthStatus:
    """
    Health check endpoint.

    Verifies that all required services are accessible.
    """
    logger.debug("Health check requested")

    services = {}

    # Check Redis (via connection test)
    try:
        from app.api.dependencies import get_redis_connection

        redis_conn = get_redis_connection()
        redis_conn.ping()
        services["redis"] = "healthy"
    except Exception as e:
        logger.error("Redis health check failed", error=str(e))
        services["redis"] = f"unhealthy: {str(e)}"

    # Check Qdrant
    try:
        qdrant_healthy = await vector_store.health_check()
        services["qdrant"] = "healthy" if qdrant_healthy else "unhealthy"
    except Exception as e:
        logger.error("Qdrant health check failed", error=str(e))
        services["qdrant"] = f"unhealthy: {str(e)}"

    # Check TEI
    try:
        tei_healthy = await embedding_service.health_check()
        services["tei"] = "healthy" if tei_healthy else "unhealthy"
    except Exception as e:
        logger.error("TEI health check failed", error=str(e))
        services["tei"] = f"unhealthy: {str(e)}"

    # Overall status
    all_healthy = all(s == "healthy" for s in services.values())
    overall_status = "healthy" if all_healthy else "degraded"

    logger.info("Health check completed", status=overall_status, services=services)

    return HealthStatus(
        status=overall_status,
        services=services,
        timestamp=datetime.utcnow().isoformat(),
    )


@router.get("/api/stats", response_model=IndexStats)
async def get_stats(
    vector_store: Annotated[VectorStore, Depends(get_vector_store)],
    bm25_engine: Annotated[BM25Engine, Depends(get_bm25_engine)],
) -> IndexStats:
    """
    Get index statistics.
    """
    logger.debug("Stats requested")

    try:
        # Get counts
        qdrant_points = await vector_store.count_points()
        bm25_documents = bm25_engine.get_document_count()

        stats = IndexStats(
            total_documents=bm25_documents,  # BM25 indexes full documents
            total_chunks=qdrant_points,  # Qdrant indexes chunks
            qdrant_points=qdrant_points,
            bm25_documents=bm25_documents,
            collection_name=vector_store.collection_name,
        )

        logger.info("Stats retrieved", stats=stats.model_dump())
        return stats

    except Exception as e:
        logger.error("Failed to get stats", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get stats: {str(e)}",
        )


@router.post("/api/test-index", dependencies=[Depends(verify_api_secret)])
@limiter.limit("5/minute")
async def test_index_document(
    request: Request,
    document: IndexDocumentRequest,
    indexing_service: Annotated[IndexingService, Depends(get_indexing_service)],
) -> dict[str, Any]:
    """
    Test endpoint for synchronous document indexing with detailed timing.

    Rate limit: 5 requests per minute per IP address.

    This endpoint processes the document immediately (no background job)
    and returns detailed step-by-step timing information for debugging.

    Use this to:
    - Test the indexing pipeline end-to-end
    - Debug performance issues
    - Verify configuration without checking worker logs
    """
    logger.info("Test indexing request", url=document.url)

    start_time = time.perf_counter()
    steps = []

    try:
        # Step 1: Document Parsing
        parse_start = time.perf_counter()
        parse_duration = round((time.perf_counter() - parse_start) * 1000, 2)
        steps.append(
            {
                "step": "parse_document",
                "duration_ms": parse_duration,
                "status": "success",
                "details": {
                    "url": document.url,
                    "markdown_length": len(document.markdown),
                    "has_title": bool(document.title),
                    "has_description": bool(document.description),
                },
            }
        )

        # Step 2: Index Document
        index_start = time.perf_counter()
        result = await indexing_service.index_document(document)
        index_duration = round((time.perf_counter() - index_start) * 1000, 2)
        steps.append(
            {
                "step": "index_document",
                "duration_ms": index_duration,
                "status": "success",
                "details": result,
            }
        )

        total_duration = round((time.perf_counter() - start_time) * 1000, 2)

        return {
            "status": "success",
            "url": document.url,
            "total_duration_ms": total_duration,
            "steps": steps,
            "summary": {
                "chunks_indexed": result.get("chunks_indexed", 0),
                "total_tokens": result.get("total_tokens", 0),
                "indexed_to_qdrant": result.get("chunks_indexed", 0) > 0,
                "indexed_to_bm25": result.get("total_tokens", 0) > 0,
            },
        }

    except Exception as e:
        total_duration = round((time.perf_counter() - start_time) * 1000, 2)
        logger.error(
            "Test indexing failed",
            url=document.url,
            error=str(e),
            error_type=type(e).__name__,
            duration_ms=total_duration,
            exc_info=True,
        )

        steps.append(
            {
                "step": "error",
                "duration_ms": total_duration,
                "status": "failed",
                "details": {
                    "error": str(e),
                    "error_type": type(e).__name__,
                },
            }
        )

        return {
            "status": "failed",
            "url": document.url,
            "total_duration_ms": total_duration,
            "steps": steps,
            "error": str(e),
            "error_type": type(e).__name__,
        }
