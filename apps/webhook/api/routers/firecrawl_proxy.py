"""
Firecrawl v2 API proxy router.

Implements transparent proxying of all Firecrawl v2 endpoints with:
- Auto-indexing of scraped content
- Crawl session tracking in database
- Performance metrics collection
- Request/response logging
"""

import json
from typing import Any

import httpx
from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from infra.database import get_db_session
from config import settings
from services.crawl_session import create_crawl_session
from utils.logging import get_logger

logger = get_logger(__name__)

router = APIRouter()

# Firecrawl API base URL (internal Docker network)
FIRECRAWL_BASE_URL = "http://firecrawl:3002/v2"


async def proxy_with_session_tracking(
    request: Request,
    endpoint_path: str,
    operation_type: str,
    db: AsyncSession,
    method: str = "POST",
) -> Response:
    """
    Proxy a job-starting request to Firecrawl and create a crawl session.

    Args:
        request: FastAPI request object
        endpoint_path: Path to proxy to (e.g., "/scrape")
        operation_type: Type of operation (scrape, scrape_batch, crawl, map, search, extract)
        db: Database session
        method: HTTP method (POST for job-starting endpoints)

    Returns:
        Response from Firecrawl API with _webhook_meta added
    """
    # Cache request body before proxying (since Request.body() can only be read once)
    try:
        request_body_bytes = await request.body()
        request_body = json.loads(request_body_bytes) if request_body_bytes else {}
    except Exception:
        request_body = {}

    # First, proxy the request to Firecrawl
    response = await proxy_to_firecrawl(request, endpoint_path, method)

    # If successful (2xx status), parse response and create crawl session
    if 200 <= response.status_code < 300:
        try:
            # Parse response body
            response_data = json.loads(response.body)

            # Extract job_id from response (different endpoints may use different keys)
            job_id = response_data.get("id") or response_data.get("jobId")

            if job_id:
                # Extract base_url from cached request body
                base_url = (
                    request_body.get("url")
                    or request_body.get("urls", [""])[0]
                    or "unknown"
                )

                # Create crawl session
                await create_crawl_session(
                    db=db,
                    job_id=job_id,
                    operation_type=operation_type,
                    base_url=base_url,
                    auto_index=True,  # Default to auto-indexing
                    extra_metadata={"request": request_body},
                )

                # Add webhook metadata to response
                response_data["_webhook_meta"] = {
                    "session_created": True,
                    "auto_index": True,
                    "operation_type": operation_type,
                }

                # Return modified response
                return Response(
                    content=json.dumps(response_data),
                    status_code=response.status_code,
                    headers=dict(response.headers),
                    media_type="application/json",
                )

        except Exception as e:
            logger.error(
                "Failed to create crawl session",
                endpoint=endpoint_path,
                error=str(e),
            )
            # Return original response if session creation fails
            # (don't fail the proxied request)

    return response


async def proxy_to_firecrawl(
    request: Request,
    endpoint_path: str,
    method: str = "GET",
) -> Response:
    """
    Proxy a request to the Firecrawl API.

    Args:
        request: FastAPI request object
        endpoint_path: Path to proxy to (e.g., "/scrape")
        method: HTTP method (GET, POST, DELETE)

    Returns:
        Response from Firecrawl API
    """
    url = f"{FIRECRAWL_BASE_URL}{endpoint_path}"

    # Get request body if present
    try:
        body = await request.json() if await request.body() else None
    except Exception:
        body = None

    # Forward headers (exclude host and content-length)
    headers = {
        k: v
        for k, v in request.headers.items()
        if k.lower() not in ("host", "content-length")
    }

    # Add Firecrawl API key
    if settings.firecrawl_api_key:
        headers["Authorization"] = f"Bearer {settings.firecrawl_api_key}"

    logger.info(
        "Proxying request to Firecrawl",
        method=method,
        path=endpoint_path,
        url=url,
    )

    async with httpx.AsyncClient(timeout=120.0) as client:
        try:
            if method == "GET":
                response = await client.get(url, headers=headers)
            elif method == "POST":
                response = await client.post(url, json=body, headers=headers)
            elif method == "DELETE":
                response = await client.delete(url, headers=headers)
            else:
                return Response(
                    content='{"error": "Method not allowed"}',
                    status_code=status.HTTP_405_METHOD_NOT_ALLOWED,
                    media_type="application/json",
                )

            logger.info(
                "Firecrawl response received",
                status_code=response.status_code,
                path=endpoint_path,
            )

            return Response(
                content=response.content,
                status_code=response.status_code,
                headers=dict(response.headers),
                media_type=response.headers.get("content-type", "application/json"),
            )

        except httpx.TimeoutException:
            logger.error("Firecrawl request timeout", path=endpoint_path)
            return Response(
                content='{"error": "Firecrawl API timeout"}',
                status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                media_type="application/json",
            )
        except httpx.HTTPError as e:
            logger.error(
                "Firecrawl HTTP error",
                path=endpoint_path,
                error=str(e),
            )
            return Response(
                content=f'{{"error": "Firecrawl API error: {str(e)}"}}',
                status_code=status.HTTP_502_BAD_GATEWAY,
                media_type="application/json",
            )


# Core Operations
@router.post("/v2/scrape")
async def scrape_url(request: Request, db: AsyncSession = Depends(get_db_session)) -> Response:
    """Single URL scrape → proxy + session tracking + auto-index"""
    return await proxy_with_session_tracking(
        request, "/scrape", "scrape", db, "POST"
    )


@router.get("/v2/scrape/{job_id}")
async def get_scrape_status(request: Request, job_id: str) -> Response:
    """Scrape job status → proxy"""
    return await proxy_to_firecrawl(request, f"/scrape/{job_id}", "GET")


@router.post("/v2/batch/scrape")
async def batch_scrape(request: Request, db: AsyncSession = Depends(get_db_session)) -> Response:
    """Batch scrape → proxy + session tracking + auto-index"""
    return await proxy_with_session_tracking(
        request, "/batch/scrape", "scrape_batch", db, "POST"
    )


@router.get("/v2/batch/scrape/{job_id}")
async def get_batch_scrape_status(request: Request, job_id: str) -> Response:
    """Batch status → proxy"""
    return await proxy_to_firecrawl(request, f"/batch/scrape/{job_id}", "GET")


@router.delete("/v2/batch/scrape/{job_id}")
async def cancel_batch_scrape(request: Request, job_id: str) -> Response:
    """Cancel batch → proxy"""
    return await proxy_to_firecrawl(request, f"/batch/scrape/{job_id}", "DELETE")


@router.get("/v2/batch/scrape/{job_id}/errors")
async def get_batch_scrape_errors(request: Request, job_id: str) -> Response:
    """Batch scrape errors → proxy"""
    return await proxy_to_firecrawl(request, f"/batch/scrape/{job_id}/errors", "GET")


@router.post("/v2/crawl")
async def start_crawl(request: Request, db: AsyncSession = Depends(get_db_session)) -> Response:
    """Start crawl → proxy + session tracking + auto-index"""
    return await proxy_with_session_tracking(
        request, "/crawl", "crawl", db, "POST"
    )


@router.get("/v2/crawl/{job_id}")
async def get_crawl_status(request: Request, job_id: str) -> Response:
    """Crawl status → proxy"""
    return await proxy_to_firecrawl(request, f"/crawl/{job_id}", "GET")


@router.delete("/v2/crawl/{job_id}")
async def cancel_crawl(request: Request, job_id: str) -> Response:
    """Cancel crawl → proxy"""
    return await proxy_to_firecrawl(request, f"/crawl/{job_id}", "DELETE")


@router.get("/v2/crawl/{job_id}/errors")
async def get_crawl_errors(request: Request, job_id: str) -> Response:
    """Crawl errors → proxy"""
    return await proxy_to_firecrawl(request, f"/crawl/{job_id}/errors", "GET")


@router.post("/v2/crawl/params-preview")
async def preview_crawl_params(request: Request) -> Response:
    """Preview crawl params → proxy"""
    return await proxy_to_firecrawl(request, "/crawl/params-preview", "POST")


@router.get("/v2/crawl/ongoing")
async def list_ongoing_crawls(request: Request) -> Response:
    """List ongoing crawls → proxy"""
    return await proxy_to_firecrawl(request, "/crawl/ongoing", "GET")


@router.get("/v2/crawl/active")
async def list_active_crawls(request: Request) -> Response:
    """List active crawls → proxy"""
    return await proxy_to_firecrawl(request, "/crawl/active", "GET")


@router.post("/v2/map")
async def map_urls(request: Request, db: AsyncSession = Depends(get_db_session)) -> Response:
    """URL discovery → proxy + session tracking"""
    return await proxy_with_session_tracking(
        request, "/map", "map", db, "POST"
    )


@router.post("/v2/search")
async def web_search(request: Request, db: AsyncSession = Depends(get_db_session)) -> Response:
    """Web search → proxy + session tracking"""
    return await proxy_with_session_tracking(
        request, "/search", "search", db, "POST"
    )


# AI Features
@router.post("/v2/extract")
async def extract_data(request: Request, db: AsyncSession = Depends(get_db_session)) -> Response:
    """Extract structured data → proxy + session tracking"""
    return await proxy_with_session_tracking(
        request, "/extract", "extract", db, "POST"
    )


@router.get("/v2/extract/{job_id}")
async def get_extract_status(request: Request, job_id: str) -> Response:
    """Extraction status → proxy"""
    return await proxy_to_firecrawl(request, f"/extract/{job_id}", "GET")


# Account Management
@router.get("/v2/team/credit-usage")
async def get_credit_usage(request: Request) -> Response:
    """Current credits → proxy"""
    return await proxy_to_firecrawl(request, "/team/credit-usage", "GET")


@router.get("/v2/team/credit-usage/historical")
async def get_historical_credit_usage(request: Request) -> Response:
    """Credit history → proxy"""
    return await proxy_to_firecrawl(request, "/team/credit-usage/historical", "GET")


@router.get("/v2/team/token-usage")
async def get_token_usage(request: Request) -> Response:
    """Current tokens → proxy"""
    return await proxy_to_firecrawl(request, "/team/token-usage", "GET")


@router.get("/v2/team/token-usage/historical")
async def get_historical_token_usage(request: Request) -> Response:
    """Token history → proxy"""
    return await proxy_to_firecrawl(request, "/team/token-usage/historical", "GET")


# Monitoring
@router.get("/v2/team/queue-status")
async def get_queue_status(request: Request) -> Response:
    """Queue status → proxy"""
    return await proxy_to_firecrawl(request, "/team/queue-status", "GET")


@router.get("/v2/concurrency-check")
async def check_concurrency(request: Request) -> Response:
    """Concurrency limits → proxy"""
    return await proxy_to_firecrawl(request, "/concurrency-check", "GET")


# Experimental
@router.post("/v2/x402/search")
async def x402_search(request: Request) -> Response:
    """X402 micropayment search → proxy"""
    return await proxy_to_firecrawl(request, "/x402/search", "POST")
