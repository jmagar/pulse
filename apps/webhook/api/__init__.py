"""
API router aggregation.

Combines all feature routers into a single router for the application.
"""

from fastapi import APIRouter

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

router = APIRouter()

# Include routers with their prefixes and tags
router.include_router(firecrawl_proxy.router, tags=["firecrawl-proxy"])
router.include_router(search.router, prefix="/api", tags=["search"])
router.include_router(scrape.router, prefix="/api", tags=["scrape"])
router.include_router(webhook.router, prefix="/api/webhook", tags=["webhooks"])
router.include_router(indexing.router, prefix="/api", tags=["indexing"])
router.include_router(content.router, tags=["content"])
router.include_router(health.router, tags=["health"])
router.include_router(metrics.router, tags=["metrics"])
router.include_router(external_stats.router, prefix="/api", tags=["external"])

__all__ = ["router"]
