"""
Document indexing API endpoints.

Handles document indexing requests (legacy and test endpoints).
"""

import time
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from rq import Queue

from api.deps import get_indexing_service, get_rq_queue, verify_api_secret
from api.schemas.indexing import IndexDocumentRequest, IndexDocumentResponse
from infra.rate_limit import limiter
from services.indexing import IndexingService
from utils.logging import get_logger

logger = get_logger(__name__)

router = APIRouter()


@router.post(
    "/index",
    response_model=IndexDocumentResponse,
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(verify_api_secret)],
    deprecated=True,
    description="DEPRECATED: Use /api/webhook/firecrawl instead.",
)
@limiter.limit("1000/minute")  # Temporarily increased for bulk doc indexing
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
            "worker.index_document_job",
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


@router.post("/test-index", dependencies=[Depends(verify_api_secret)])
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
