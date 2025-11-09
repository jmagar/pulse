"""
Timing middleware for FastAPI.

Captures request-level timing metrics and stores them in PostgreSQL.
"""

import time
from collections.abc import Awaitable, Callable
from uuid import uuid4

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

from app.database import get_db_context
from app.models.timing import RequestMetric
from app.utils.logging import get_logger

logger = get_logger(__name__)


class TimingMiddleware(BaseHTTPMiddleware):
    """
    Middleware to track request timing and store metrics.

    For each request:
    - Records start time
    - Generates unique request ID
    - Processes request through chain
    - Records end time and stores metrics to database
    - Adds X-Request-ID and X-Process-Time headers to response
    """

    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        """
        Process request and record timing metrics.

        Args:
            request: Incoming HTTP request
            call_next: Next middleware/handler in chain

        Returns:
            Response with timing headers
        """
        # Generate request ID
        request_id = str(uuid4())
        request.state.request_id = request_id

        # Start timing
        start_time = time.perf_counter()

        # Process request
        try:
            response = await call_next(request)
            status_code = response.status_code
        except Exception as exc:
            # Record error
            duration_ms = (time.perf_counter() - start_time) * 1000
            logger.error(
                "Request failed",
                method=request.method,
                path=request.url.path,
                error=str(exc),
                duration_ms=round(duration_ms, 2),
                request_id=request_id,
            )

            # Store error metric
            await self._store_metric(
                request=request,
                request_id=request_id,
                status_code=500,
                duration_ms=duration_ms,
            )

            # Re-raise
            raise

        # Calculate duration
        duration_ms = (time.perf_counter() - start_time) * 1000

        # Add timing headers
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Process-Time"] = f"{duration_ms:.2f}"

        # Log request
        logger.info(
            "Request completed",
            method=request.method,
            path=request.url.path,
            status_code=status_code,
            duration_ms=round(duration_ms, 2),
            request_id=request_id,
        )

        # Store metric (non-blocking)
        await self._store_metric(
            request=request,
            request_id=request_id,
            status_code=status_code,
            duration_ms=duration_ms,
        )

        return response

    async def _store_metric(
        self,
        request: Request,
        request_id: str,
        status_code: int,
        duration_ms: float,
    ) -> None:
        """
        Store request metric to database.

        Args:
            request: HTTP request
            request_id: Unique request ID
            status_code: HTTP status code
            duration_ms: Request duration in milliseconds
        """
        try:
            # Extract client info
            client_ip = None
            if request.client:
                client_ip = request.client.host

            user_agent = request.headers.get("user-agent")

            # Build metadata
            metadata = {
                "query_params": dict(request.query_params),
                "path_params": request.path_params,
            }

            # Store to database
            async with get_db_context() as db:
                metric = RequestMetric(
                    method=request.method,
                    path=request.url.path,
                    status_code=status_code,
                    duration_ms=duration_ms,
                    request_id=request_id,
                    client_ip=client_ip,
                    user_agent=user_agent,
                    extra_metadata=metadata,
                )
                db.add(metric)
                await db.commit()

        except Exception as e:
            # Don't fail the request if metrics storage fails
            logger.warning(
                "Failed to store request metric",
                error=str(e),
                request_id=request_id,
            )
