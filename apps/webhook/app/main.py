"""
FastAPI application entry point.

This is the main application that runs the Search Bridge REST API.
"""

import json
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.api.dependencies import cleanup_services, get_vector_store
from app.config import settings
from app.database import close_database, init_database
from app.middleware.timing import TimingMiddleware
from app.rate_limit import limiter
from app.utils.logging import configure_logging, get_logger

# Configure logging
configure_logging(settings.log_level)
logger = get_logger(__name__)


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

    logger.info("Search Bridge API ready")

    yield

    # Shutdown
    logger.info("Shutting down Search Bridge API")

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
from app.api.routes import router  # noqa: E402
from app.api.metrics_routes import router as metrics_router  # noqa: E402

app.include_router(router)
app.include_router(metrics_router)


@app.middleware("http")
async def log_firecrawl_webhook(request: Request, call_next: Any) -> Any:
    """Log incoming Firecrawl webhook payloads for debugging."""

    if request.url.path == "/api/webhook/firecrawl":
        body = await request.body()
        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            payload = None

        logger.warning(
            "Webhook request received", payload=payload, raw=body.decode("utf-8", errors="replace")
        )

        async def receive() -> dict[str, object]:
            return {"type": "http.request", "body": body, "more_body": False}

        response = await call_next(Request(request.scope, receive))
        logger.warning("Webhook response sent", status=response.status_code)
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
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=True,
        log_level=settings.log_level.lower(),
    )
