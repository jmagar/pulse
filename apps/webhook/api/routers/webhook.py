"""
Webhook API endpoints.

Handles incoming webhooks from Firecrawl and changedetection.io.
"""

import hashlib
import hmac
import json
import time
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Annotated, Any, cast

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from fastapi.responses import JSONResponse
from pydantic import TypeAdapter, ValidationError
from rq import Queue
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_redis_connection, get_rq_queue, verify_webhook_signature
from api.schemas.webhook import ChangeDetectionPayload, FirecrawlWebhookEvent
from config import settings
from services.webhook_handlers import WebhookHandlerError, handle_firecrawl_event
from utils.logging import get_logger
from utils.time import format_est_timestamp, parse_iso_timestamp
from domain.models import ChangeEvent
from infra.database import get_db_session
from infra.rate_limit import limiter

logger = get_logger(__name__)

WEBHOOK_EVENT_ADAPTER: TypeAdapter[FirecrawlWebhookEvent] = TypeAdapter(FirecrawlWebhookEvent)

router = APIRouter()
RouteCallable = Callable[..., Any]


def limiter_exempt(route_fn: RouteCallable) -> RouteCallable:
    """Typed wrapper around limiter.exempt to satisfy mypy."""
    return cast(RouteCallable, limiter.exempt(route_fn))  # type: ignore[no-untyped-call]


@router.post(
    "/firecrawl",
    dependencies=[],  # Remove dependency, we'll use it as parameter instead
)
@limiter_exempt
async def webhook_firecrawl(
    verified_body: Annotated[bytes, Depends(verify_webhook_signature)],
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

    # Parse verified body (no second read needed)
    payload = json.loads(verified_body)
    logger.info(
        "Webhook received",
        event_type=payload.get("type"),
        event_id=payload.get("id"),
        success=payload.get("success"),
        data_count=len(payload.get("data", [])),
        has_top_metadata=bool(payload.get("metadata")),
        payload_keys=list(payload.keys()),
    )

    # Handle failed events (e.g., canceled crawls) gracefully
    # These events may have incomplete metadata and should not be processed
    if payload.get("success") is False:
        logger.info(
            "Skipping failed event",
            event_type=payload.get("type"),
            event_id=payload.get("id"),
            reason="Event marked as unsuccessful (likely canceled crawl)",
        )
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={
                "status": "acknowledged",
                "message": "Failed event received and logged",
                "event_id": payload.get("id"),
            },
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
        "webhook_received_at": format_est_timestamp(),
        "signature": signature,
        "diff_size": snapshot_size,
        "raw_payload_version": "1.0",
        "detected_at": format_est_timestamp(parse_iso_timestamp(payload.detected_at)),
    }


@router.post("/changedetection", status_code=202)
@limiter_exempt
async def handle_changedetection_webhook(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    queue: Annotated[Queue, Depends(get_rq_queue)],
    signature: str | None = Header(None, alias="X-Signature"),
) -> dict[str, Any]:
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
    expected_sig = hmac.new(settings.webhook_secret.encode(), body, hashlib.sha256).hexdigest()

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
    # Compute metadata
    snapshot_size = _compute_diff_size(payload.snapshot)
    metadata = _extract_changedetection_metadata(payload, signature, snapshot_size)

    change_event = ChangeEvent(
        watch_id=payload.watch_id,
        watch_url=payload.watch_url,
        detected_at=parse_iso_timestamp(payload.detected_at),
        diff_summary=payload.snapshot[:500] if payload.snapshot else None,
        snapshot_url=payload.diff_url,
        rescrape_status="queued",
        extra_metadata=metadata,
    )

    db.add(change_event)
    await db.commit()
    await db.refresh(change_event)

    # Enqueue rescrape job
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
