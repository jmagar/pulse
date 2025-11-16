"""
Scrape API endpoint router.

POST /api/v2/scrape - Multi-stage web scraping with caching
"""
import base64
from datetime import datetime, timezone
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import verify_api_secret
from api.schemas.scrape import (
    BatchData,
    BatchError,
    BatchErrorsData,
    SavedUris,
    ScrapeData,
    ScrapeErrorDetail,
    ScrapeMetadata,
    ScrapeRequest,
    ScrapeResponse,
)
from config import settings
from infra.database import get_db_session
from services.scrape_cache import ScrapeCacheService
from utils.logging import get_logger

router = APIRouter()
logger = get_logger(__name__)


def _format_iso_timestamp(dt: datetime) -> str:
    """Format datetime as ISO 8601 string with Z suffix."""
    return dt.strftime("%Y-%m-%dT%H:%M:%S") + "Z"


def _build_saved_uri(url: str, tier: str, timestamp: datetime) -> str:
    """Build URI for saved content."""
    timestamp_str = _format_iso_timestamp(timestamp)
    return f"scrape://{url}/{tier}_{timestamp_str}"


async def _call_firecrawl_scrape(
    url: str,
    request: ScrapeRequest
) -> dict:
    """
    Call Firecrawl API for single URL scrape.

    Args:
        url: URL to scrape
        request: Original scrape request

    Returns:
        Firecrawl API response data

    Raises:
        HTTPException: If Firecrawl API call fails
    """
    firecrawl_url = f"{settings.firecrawl_api_url}/v1/scrape"

    # Build Firecrawl request payload
    payload: dict = {
        "url": url,
        "formats": request.formats,
        "onlyMainContent": request.onlyMainContent,
        "timeout": request.timeout,
    }

    # Optional parameters
    if request.includeTags:
        payload["includeTags"] = request.includeTags
    if request.excludeTags:
        payload["excludeTags"] = request.excludeTags
    if request.waitFor:
        payload["waitFor"] = request.waitFor
    if request.headers:
        payload["headers"] = request.headers
    if request.actions:
        payload["actions"] = [action.model_dump(exclude_none=True) for action in request.actions]

    async with httpx.AsyncClient(timeout=float(request.timeout) / 1000.0 + 10.0) as client:
        try:
            response = await client.post(
                firecrawl_url,
                json=payload,
                headers={"Authorization": f"Bearer {settings.firecrawl_api_key}"}
            )

            if response.status_code != 200:
                logger.error(
                    "Firecrawl API error",
                    url=url,
                    status_code=response.status_code,
                    response_text=response.text
                )
                raise HTTPException(
                    status_code=500,
                    detail=f"Firecrawl API error: {response.status_code} {response.text}"
                )

            data = response.json()

            if not data.get("success"):
                error_msg = data.get("error", "Unknown error")
                logger.error("Firecrawl scrape failed", url=url, error=error_msg)
                raise HTTPException(
                    status_code=500,
                    detail=f"Firecrawl scrape failed: {error_msg}"
                )

            return data["data"]

        except httpx.TimeoutException as e:
            logger.error("Firecrawl API timeout", url=url, timeout=request.timeout)
            raise HTTPException(
                status_code=408,
                detail=f"Scraping timeout after {request.timeout}ms"
            ) from e
        except httpx.HTTPError as e:
            logger.error("Firecrawl HTTP error", url=url, error=str(e))
            raise HTTPException(
                status_code=500,
                detail=f"Firecrawl HTTP error: {str(e)}"
            ) from e


async def _call_firecrawl_batch_start(
    urls: list[str],
    request: ScrapeRequest
) -> dict:
    """Call Firecrawl API to start batch scrape."""
    firecrawl_url = f"{settings.firecrawl_api_url}/v1/batch/scrape"

    payload: dict = {
        "urls": urls,
        "formats": request.formats,
        "onlyMainContent": request.onlyMainContent,
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            firecrawl_url,
            json=payload,
            headers={"Authorization": f"Bearer {settings.firecrawl_api_key}"}
        )

        if response.status_code != 200:
            raise HTTPException(
                status_code=500,
                detail=f"Firecrawl batch start failed: {response.status_code}"
            )

        return response.json()


async def _call_firecrawl_batch_status(job_id: str) -> dict:
    """Get batch scrape status from Firecrawl."""
    firecrawl_url = f"{settings.firecrawl_api_url}/v1/batch/scrape/{job_id}"

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(
            firecrawl_url,
            headers={"Authorization": f"Bearer {settings.firecrawl_api_key}"}
        )

        if response.status_code != 200:
            raise HTTPException(
                status_code=500,
                detail=f"Firecrawl batch status failed: {response.status_code}"
            )

        return response.json()


async def _call_firecrawl_batch_cancel(job_id: str) -> dict:
    """Cancel batch scrape job."""
    firecrawl_url = f"{settings.firecrawl_api_url}/v1/batch/scrape/{job_id}"

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.delete(
            firecrawl_url,
            headers={"Authorization": f"Bearer {settings.firecrawl_api_key}"}
        )

        if response.status_code != 200:
            raise HTTPException(
                status_code=500,
                detail=f"Firecrawl batch cancel failed: {response.status_code}"
            )

        return response.json()


async def _handle_start_single_url(
    request: ScrapeRequest,
    session: AsyncSession
) -> ScrapeResponse:
    """Handle single URL scrape command."""
    url = str(request.url)

    cache_service = ScrapeCacheService()

    # Compute cache key
    cache_key = cache_service.compute_cache_key(
        url=url,
        extract=request.extract,
        cleanScrape=request.cleanScrape,
        onlyMainContent=request.onlyMainContent,
        includeTags=request.includeTags,
        excludeTags=request.excludeTags,
        formats=request.formats
    )

    # Check cache (unless force rescrape)
    if not request.forceRescrape:
        cached_entry = await cache_service.get_cached_scrape(
            session=session,
            cache_key=cache_key,
            max_age=request.maxAge
        )

        if cached_entry:
            logger.info("Returning cached scrape", url=url, cache_key=cache_key)

            # Determine content to return
            content = cached_entry.extracted_content or cached_entry.cleaned_content or cached_entry.raw_content

            # Calculate cache age
            cache_age = int((datetime.now(timezone.utc) - cached_entry.scraped_at).total_seconds() * 1000)

            # Build response
            saved_uris = SavedUris()
            if cached_entry.raw_content:
                saved_uris.raw = _build_saved_uri(url, "raw", cached_entry.scraped_at)
            if cached_entry.cleaned_content:
                saved_uris.cleaned = _build_saved_uri(url, "cleaned", cached_entry.scraped_at)
            if cached_entry.extracted_content:
                saved_uris.extracted = _build_saved_uri(url, "extracted", cached_entry.scraped_at)

            return ScrapeResponse(
                success=True,
                command="start",
                data=ScrapeData(
                    url=url,
                    content=content if request.resultHandling != "saveOnly" else None,
                    contentType=cached_entry.content_type or "text/markdown",
                    source=cached_entry.source,
                    cached=True,
                    cacheAge=cache_age,
                    timestamp=_format_iso_timestamp(cached_entry.scraped_at),
                    savedUris=saved_uris if request.resultHandling != "returnOnly" else None,
                    screenshot=base64.b64encode(cached_entry.screenshot).decode('ascii') if cached_entry.screenshot else None,
                    screenshotFormat=cached_entry.screenshot_format,
                    message="Content saved to cache" if request.resultHandling == "saveOnly" else None
                )
            )

    # Cache miss or force rescrape - call Firecrawl
    logger.info("Scraping URL", url=url, force_rescrape=request.forceRescrape)

    fc_data = await _call_firecrawl_scrape(url, request)

    # Extract content from Firecrawl response
    raw_content = fc_data.get("html") or fc_data.get("markdown", "")

    # Use Firecrawl's markdown directly when cleanScrape is true
    cleaned_content = fc_data.get("markdown") if request.cleanScrape else None

    screenshot_b64 = fc_data.get("screenshot")
    screenshot_bytes = base64.b64decode(screenshot_b64) if screenshot_b64 else None

    # Keep extract logic for now (will address in separate task)
    extracted_content = None
    if request.extract:
        # TODO: Route to Firecrawl /v2/extract instead
        logger.warning(
            "LLM extraction requested but not yet migrated to Firecrawl",
            url=url,
            extract_query=request.extract
        )

    # Save to cache (unless returnOnly)
    now = datetime.now(timezone.utc)
    if request.resultHandling != "returnOnly":
        await cache_service.save_scrape(
            session=session,
            url=url,
            raw_content=raw_content,
            cleaned_content=cleaned_content,
            extracted_content=extracted_content,
            extract_query=request.extract,
            source="firecrawl",
            cache_key=cache_key,
            max_age=request.maxAge,
            content_type="text/markdown" if request.cleanScrape else "text/html",
            strategy_used=request.proxy,
            scrape_options=request.model_dump(exclude_none=True),
            screenshot=screenshot_bytes,
            screenshot_format="image/png" if screenshot_bytes else None
        )
        await session.commit()

    # Build response
    final_content = extracted_content or cleaned_content or raw_content

    saved_uris = None
    metadata = None
    if request.resultHandling != "returnOnly":
        saved_uris = SavedUris()
        if raw_content:
            saved_uris.raw = _build_saved_uri(url, "raw", now)
        if cleaned_content:
            saved_uris.cleaned = _build_saved_uri(url, "cleaned", now)
        if extracted_content:
            saved_uris.extracted = _build_saved_uri(url, "extracted", now)

        metadata = ScrapeMetadata(
            rawLength=len(raw_content) if raw_content else None,
            cleanedLength=len(cleaned_content) if cleaned_content else None,
            extractedLength=len(extracted_content) if extracted_content else None,
            wasTruncated=False
        )

    return ScrapeResponse(
        success=True,
        command="start",
        data=ScrapeData(
            url=url,
            content=final_content if request.resultHandling != "saveOnly" else None,
            contentType="text/markdown" if request.cleanScrape else "text/html",
            source="firecrawl",
            cached=False,
            timestamp=_format_iso_timestamp(now),
            savedUris=saved_uris,
            metadata=metadata,
            screenshot=screenshot_b64,
            screenshotFormat="image/png" if screenshot_b64 else None,
            message="Content saved to cache" if request.resultHandling == "saveOnly" else None
        )
    )


async def _handle_start_batch(request: ScrapeRequest) -> ScrapeResponse:
    """Handle batch scrape start command."""
    urls = [str(u) for u in request.urls] if request.urls else []

    logger.info("Starting batch scrape", url_count=len(urls))

    fc_response = await _call_firecrawl_batch_start(urls, request)

    job_id = fc_response.get("id")
    if not job_id:
        raise HTTPException(
            status_code=500,
            detail="Firecrawl batch response missing job ID"
        )

    return ScrapeResponse(
        success=True,
        command="start",
        data=BatchData(
            jobId=job_id,
            status="scraping",
            urls=len(urls),
            message=f"Batch scrape started for {len(urls)} URLs. Use jobId '{job_id}' to check status."
        )
    )


async def _handle_status(request: ScrapeRequest) -> ScrapeResponse:
    """Handle batch status command."""
    if not request.jobId:
        raise HTTPException(status_code=400, detail="jobId required for status command")

    logger.info("Getting batch status", job_id=request.jobId)

    fc_response = await _call_firecrawl_batch_status(request.jobId)

    total = fc_response.get("total", 0)
    completed = fc_response.get("completed", 0)
    percentage = int((completed / total * 100)) if total > 0 else 0

    return ScrapeResponse(
        success=True,
        command="status",
        data=BatchData(
            jobId=request.jobId,
            status=fc_response.get("status", "unknown"),
            total=total,
            completed=completed,
            creditsUsed=fc_response.get("creditsUsed"),
            expiresAt=fc_response.get("expiresAt"),
            message=f"Batch scrape progress: {completed}/{total} URLs completed ({percentage}%)"
        )
    )


async def _handle_cancel(request: ScrapeRequest) -> ScrapeResponse:
    """Handle batch cancel command."""
    if not request.jobId:
        raise HTTPException(status_code=400, detail="jobId required for cancel command")

    logger.info("Cancelling batch scrape", job_id=request.jobId)

    await _call_firecrawl_batch_cancel(request.jobId)

    return ScrapeResponse(
        success=True,
        command="cancel",
        data=BatchData(
            jobId=request.jobId,
            status="cancelled",
            message="Batch scrape cancelled"
        )
    )


async def _handle_errors(request: ScrapeRequest) -> ScrapeResponse:
    """Handle batch errors command."""
    if not request.jobId:
        raise HTTPException(status_code=400, detail="jobId required for errors command")

    logger.info("Getting batch errors", job_id=request.jobId)

    fc_response = await _call_firecrawl_batch_status(request.jobId)

    # Extract errors from Firecrawl response
    # Note: Actual error format may vary, this is a placeholder
    errors = []
    fc_errors = fc_response.get("errors", [])
    for error in fc_errors:
        errors.append(BatchError(
            url=error.get("url", "unknown"),
            error=error.get("error", "Unknown error"),
            timestamp=error.get("timestamp", datetime.now(timezone.utc).isoformat())
        ))

    return ScrapeResponse(
        success=True,
        command="errors",
        data=BatchErrorsData(
            jobId=request.jobId,
            errors=errors,
            message=f"Found {len(errors)} errors in batch scrape"
        )
    )


@router.post("/v2/scrape", response_model=ScrapeResponse, dependencies=[Depends(verify_api_secret)])
async def scrape_endpoint(
    request: ScrapeRequest,
    session: Annotated[AsyncSession, Depends(get_db_session)]
) -> ScrapeResponse:
    """
    Multi-stage web scraping endpoint with caching.

    Supports:
    - Single URL scraping with cache
    - HTML cleaning to Markdown
    - LLM extraction
    - Batch scraping (start, status, cancel, errors)

    Args:
        request: Scrape request with command and parameters
        session: Database session

    Returns:
        Scrape response with content or status

    Raises:
        HTTPException: On validation or scraping errors
    """
    try:
        # Route by command
        if request.command == "start":
            if request.url:
                return await _handle_start_single_url(request, session)
            elif request.urls:
                return await _handle_start_batch(request)
            else:
                raise HTTPException(
                    status_code=400,
                    detail="Either 'url' or 'urls' required for start command"
                )
        elif request.command == "status":
            return await _handle_status(request)
        elif request.command == "cancel":
            return await _handle_cancel(request)
        elif request.command == "errors":
            return await _handle_errors(request)
        else:
            raise HTTPException(status_code=400, detail=f"Unknown command: {request.command}")

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Scrape endpoint error", command=request.command, error=str(e))
        return ScrapeResponse(
            success=False,
            command=request.command,
            error=ScrapeErrorDetail(
                message=str(e),
                code="SCRAPE_FAILED",
                url=str(request.url) if request.url else None
            )
        )
