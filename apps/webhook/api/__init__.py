"""
API router aggregation.

Combines all feature routers into a single router for the application.
"""

from fastapi import APIRouter


_router: APIRouter | None = None


def get_router() -> APIRouter:
    """
    Get or create the API router with lazy initialization.

    Lazy imports prevent circular dependency issues when services
    import schemas from api.schemas while routers import services.
    Router is only created on first access, not at module import time.

    Returns:
        APIRouter: Configured router with all feature routes
    """
    global _router

    if _router is not None:
        return _router

    from api.routers import (
        content,
        external_stats,
        firecrawl_proxy,
        health,
        indexing,
        metrics,
        scrape,
        search,
        webhook,
    )

    _router = APIRouter()

    # Include routers with their prefixes and tags
    _router.include_router(firecrawl_proxy.router, tags=["firecrawl-proxy"])
    _router.include_router(search.router, prefix="/api", tags=["search"])
    _router.include_router(scrape.router, prefix="/api", tags=["scrape"])
    _router.include_router(webhook.router, prefix="/api/webhook", tags=["webhooks"])
    _router.include_router(indexing.router, prefix="/api", tags=["indexing"])
    _router.include_router(content.router, tags=["content"])
    _router.include_router(health.router, tags=["health"])
    _router.include_router(metrics.router, tags=["metrics"])
    _router.include_router(external_stats.router, prefix="/api", tags=["external"])

    return _router


# Convenience: router property that calls get_router()
# This allows both `from api import router` and `from api import get_router`
def __getattr__(name: str) -> APIRouter:
    """Support legacy `from api import router` syntax."""
    if name == "router":
        return get_router()
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


__all__ = ["get_router"]
