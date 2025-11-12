"""
API router aggregation.

Combines all feature routers into a single router for the application.
"""

from fastapi import APIRouter

from api.routers import health, indexing, metrics, plugin_indexing, search, webhook

router = APIRouter()

# Include routers with their prefixes and tags
router.include_router(search.router, prefix="/api", tags=["search"])
router.include_router(webhook.router, prefix="/api/webhook", tags=["webhooks"])
router.include_router(indexing.router, prefix="/api", tags=["indexing"])
router.include_router(plugin_indexing.router, prefix="/api/plugin", tags=["plugin-ingestion"])
router.include_router(health.router, tags=["health"])
router.include_router(metrics.router, tags=["metrics"])

__all__ = ["router"]
