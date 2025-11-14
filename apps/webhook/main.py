"""
FastAPI application entry point.

This is the main application that runs the Search Bridge REST API.
"""

import asyncio
import json
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from api.deps import cleanup_services, get_vector_store
from api.middleware.timing import TimingMiddleware
from config import settings
from infra.database import close_database, init_database
from infra.rate_limit import limiter
from utils.content_metrics import summarize_firecrawl_payload
from utils.logging import configure_logging, get_logger

# Configure logging
configure_logging(settings.log_level)
logger = get_logger(__name__)


async def run_cleanup_scheduler() -> None:
    """
    Run zombie job cleanup every 5 minutes.

    This scheduler marks old in_progress rescrape jobs as failed to prevent
    resource leaks from crashed/timed-out jobs.
    """
    logger.info("Starting cleanup scheduler (runs every 5 minutes)")

    while True:
        try:
            await asyncio.sleep(5 * 60)  # 5 minutes

            # Run zombie job cleanup
            from workers.cleanup import cleanup_zombie_jobs

            logger.info("Running scheduled zombie job cleanup")
            await cleanup_zombie_jobs(max_age_minutes=15)

        except asyncio.CancelledError:
            logger.info("Cleanup scheduler cancelled")
            break
        except Exception as e:
            logger.error("Cleanup scheduler error", error=str(e))
            # Wait 1 minute before retrying on error
            await asyncio.sleep(60)


async def run_retention_scheduler() -> None:
    """
    Run data retention policy daily at 2 AM EST.

    This scheduler enforces the 90-day retention policy by deleting old metrics.
    Runs continuously in the background as a separate async task.
    """
    logger.info("Starting retention scheduler (runs daily at 2 AM EST)")

    while True:
        try:
            # Calculate seconds until next 2 AM EST
            est_tz = timezone(timedelta(hours=-5))
            now = datetime.now(est_tz)
            next_run = now.replace(hour=2, minute=0, second=0, microsecond=0)

            # If we're past 2 AM today, schedule for 2 AM tomorrow
            if next_run <= now:
                next_run += timedelta(days=1)

            wait_seconds = (next_run - now).total_seconds()
            logger.info(
                "Next retention run scheduled",
                next_run=next_run.isoformat(),
                wait_hours=wait_seconds / 3600,
            )

            await asyncio.sleep(wait_seconds)

            # Run retention policy
            from workers.retention import enforce_retention_policy

            logger.info("Running scheduled retention policy enforcement")
            await enforce_retention_policy(retention_days=90)

        except asyncio.CancelledError:
            logger.info("Retention scheduler cancelled")
            break
        except Exception as e:
            logger.error("Retention scheduler error", error=str(e))
            # Wait 1 hour before retrying on error
            await asyncio.sleep(3600)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None]:
    """
    Application lifespan manager.

    Handles startup and shutdown tasks.
    """
    # Startup
    logger.info("Starting Search Bridge API", version="0.1.0", port=settings.port)

    # Initialize database for timing metrics
    try:
        await init_database()
        logger.info("Timing metrics database initialized")
    except Exception as e:
        logger.error("Failed to initialize timing metrics database", error=str(e))
        # Don't fail startup - metrics are non-critical

    # Log CORS configuration for security awareness
    cors_origins_str = ", ".join(settings.cors_origins)
    if "*" in settings.cors_origins:
        logger.warning(
            "CORS configured to allow ALL origins (*) - this is insecure for production!",
            cors_origins=cors_origins_str,
        )
    else:
        logger.info("CORS configured with allowed origins", cors_origins=cors_origins_str)

    # Ensure Qdrant collection exists
    try:
        vector_store = get_vector_store()
        await vector_store.ensure_collection()
        logger.info("Qdrant collection verified")
    except Exception as e:
        logger.error("Failed to ensure Qdrant collection", error=str(e))
        # Don't fail startup - collection might be created later

    # Start background worker thread if enabled
    worker_manager = None
    if settings.enable_worker:
        from worker_thread import WorkerThreadManager

        logger.info("Starting background worker thread...")
        worker_manager = WorkerThreadManager()
        try:
            worker_manager.start()
            app.state.worker_manager = worker_manager
            logger.info("Background worker started successfully")
        except Exception as e:
            logger.error("Failed to start background worker", error=str(e))
            # Don't fail startup - API can run without worker
    else:
        logger.info("Background worker disabled (WEBHOOK_ENABLE_WORKER=false)")

    # Start cleanup scheduler
    cleanup_task = asyncio.create_task(run_cleanup_scheduler())
    logger.info("Cleanup scheduler started")

    # Start retention scheduler
    retention_task = asyncio.create_task(run_retention_scheduler())
    logger.info("Retention scheduler started")

    logger.info("Search Bridge API ready")

    yield

    # Shutdown
    logger.info("Shutting down Search Bridge API")

    # Stop cleanup scheduler
    try:
        cleanup_task.cancel()
        await cleanup_task
        logger.info("Cleanup scheduler stopped successfully")
    except asyncio.CancelledError:
        logger.info("Cleanup scheduler cancelled")
    except Exception:
        logger.exception("Failed to stop cleanup scheduler")

    # Stop retention scheduler
    try:
        retention_task.cancel()
        await retention_task
        logger.info("Retention scheduler stopped successfully")
    except asyncio.CancelledError:
        logger.info("Retention scheduler cancelled")
    except Exception:
        logger.exception("Failed to stop retention scheduler")

    # Stop background worker if running
    if worker_manager is not None:
        try:
            worker_manager.stop()
            logger.info("Background worker stopped successfully")
        except Exception:
            logger.exception("Failed to stop background worker")

    # Clean up async resources
    try:
        await cleanup_services()
        logger.info("Services cleaned up successfully")
    except Exception:
        logger.exception("Failed to clean up services")

    # Close database connections
    try:
        await close_database()
        logger.info("Database connections closed")
    except Exception:
        logger.exception("Failed to close database connections")


# Create FastAPI application
app = FastAPI(
    title="Firecrawl Search Bridge",
    description="Semantic search service for Firecrawl web scraping",
    version="0.1.0",
    lifespan=lifespan,
)

# Add rate limiter to app state
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)  # type: ignore[arg-type]

# Add timing middleware (must be BEFORE SlowAPI middleware to capture full request time)
app.add_middleware(TimingMiddleware)

# Add SlowAPI middleware to enforce rate limits
app.add_middleware(SlowAPIMiddleware)

# Add CORS middleware (required for cross-device access from Firecrawl)
# SECURITY NOTE: The allowed origins are configured via SEARCH_BRIDGE_CORS_ORIGINS
# Production environments should NEVER use "*" - always specify exact origins
# Example: SEARCH_BRIDGE_CORS_ORIGINS="https://app.example.com,https://admin.example.com"
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routes (imported here to avoid circular dependency)
from api import router as api_router  # noqa: E402

app.include_router(api_router)


@app.middleware("http")
async def log_pulse_webhook(request: Request, call_next: Any) -> Any:
    """Log incoming Firecrawl webhook payloads for debugging."""

    if request.url.path == "/api/webhook/firecrawl":
        body = await request.body()
        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            payload = None

        if isinstance(payload, dict):
            summary = summarize_firecrawl_payload(payload)
            logger.info(
                "Webhook request received",
                event_type=summary.get("event_type"),
                event_id=summary.get("event_id"),
                data_count=summary.get("data_count"),
                metrics=summary,
                body_bytes=len(body),
            )
        else:
            logger.info(
                "Webhook request received (invalid JSON)",
                body_bytes=len(body),
            )

        async def receive() -> dict[str, object]:
            return {"type": "http.request", "body": body, "more_body": False}

        response = await call_next(Request(request.scope, receive))
        logger.info("Webhook response sent", status=response.status_code)
        return response

    return await call_next(request)


# Root endpoint
@app.get("/")
async def root() -> JSONResponse:
    """Root endpoint with service info."""
    return JSONResponse(
        content={
            "service": "Firecrawl Search Bridge",
            "version": "0.1.0",
            "status": "running",
            "docs": "/docs",
            "health": "/health",
        }
    )


# Global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Handle uncaught exceptions."""
    logger.error(
        "Unhandled exception",
        path=request.url.path,
        error=str(exc),
        error_type=type(exc).__name__,
    )

    return JSONResponse(
        status_code=500,
        content={
            "detail": "Internal server error",
            "error": str(exc),
        },
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        reload=True,
        log_level=settings.log_level.lower(),
    )
