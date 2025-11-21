"""
Health check API endpoint.

Verifies that all required services are accessible.
"""

from typing import Annotated

from fastapi import APIRouter, Depends

from api.deps import get_embedding_service, get_vector_store, verify_api_secret
from api.schemas.health import HealthStatus
from services.embedding import EmbeddingService
from services.vector_store import VectorStore
from utils.logging import get_logger
from utils.time import format_est_timestamp

logger = get_logger(__name__)

router = APIRouter()


@router.get(
    "/health",
    response_model=HealthStatus,
)
# NOTE: Health endpoint is intentionally unauthenticated so that Docker
# health checks and infrastructure probes can verify liveness/readiness
# without requiring API credentials.
async def health_check(
    embedding_service: Annotated[EmbeddingService, Depends(get_embedding_service)],
    vector_store: Annotated[VectorStore, Depends(get_vector_store)],
) -> HealthStatus:
    """
    Health check endpoint.

    Verifies that all required services are accessible.
    """
    logger.debug("Health check requested")

    services = {}

    # Check Redis (via connection test)
    try:
        from api.deps import get_redis_connection

        redis_conn = get_redis_connection()
        redis_conn.ping()
        services["redis"] = "healthy"
    except Exception as e:
        logger.error("Redis health check failed", error=str(e))
        services["redis"] = f"unhealthy: {str(e)}"

    # Check Qdrant
    try:
        qdrant_healthy = await vector_store.health_check()
        services["qdrant"] = "healthy" if qdrant_healthy else "unhealthy"
    except Exception as e:
        logger.error("Qdrant health check failed", error=str(e))
        services["qdrant"] = f"unhealthy: {str(e)}"

    # Check TEI
    try:
        tei_healthy = await embedding_service.health_check()
        services["tei"] = "healthy" if tei_healthy else "unhealthy"
    except Exception as e:
        logger.error("TEI health check failed", error=str(e))
        services["tei"] = f"unhealthy: {str(e)}"

    # Overall status
    all_healthy = all(s == "healthy" for s in services.values())
    overall_status = "healthy" if all_healthy else "degraded"

    logger.info("Health check completed", status=overall_status, services=services)

    return HealthStatus(
        status=overall_status,
        services=services,
        timestamp=format_est_timestamp(),
    )
