"""
Search and statistics API endpoints.

Handles document search and index statistics requests.
"""

import time
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Request, status

from api.deps import get_bm25_engine, get_search_orchestrator, get_vector_store, verify_api_secret
from api.schemas.health import IndexStats
from api.schemas.search import SearchRequest, SearchResponse, SearchResult
from app.services.bm25_engine import BM25Engine
from app.services.search import SearchOrchestrator
from app.services.vector_store import VectorStore
from app.utils.logging import get_logger
from infra.rate_limit import limiter

logger = get_logger(__name__)

router = APIRouter()


@router.post(
    "/search",
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
        filters: dict[str, Any] = (
            search_request.filters.model_dump() if search_request.filters else {}
        )
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


@router.get("/stats", response_model=IndexStats)
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
