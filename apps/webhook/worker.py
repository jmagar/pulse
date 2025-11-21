"""
Standalone RQ worker entry point for webhook service.

This module provides the entry point for running RQ workers in dedicated
containers (pulse_webhook-worker). For embedded worker mode within the
FastAPI application, see worker_thread.py instead.

Usage:
    python -m worker
"""

import sys
from rq import Worker

from config import settings
from infra.redis import get_redis_connection
from utils.logging import get_logger


logger = get_logger(__name__)


def validate_startup() -> None:
    """
    Validate critical configuration and connectivity before starting worker.

    Raises:
        ValueError: If critical configuration is missing or invalid
        ConnectionError: If required services are unreachable
    """
    # Validate critical secrets
    if not settings.api_secret or len(settings.api_secret) < 32:
        msg = "WEBHOOK_API_SECRET must be at least 32 characters"
        raise ValueError(msg)

    if not settings.webhook_secret or len(settings.webhook_secret) < 32:
        msg = "WEBHOOK_SECRET must be at least 32 characters"
        raise ValueError(msg)

    # Test Redis connectivity
    logger.info("Testing Redis connectivity...")
    redis_conn = get_redis_connection()
    try:
        redis_conn.ping()
        logger.info("Redis connection healthy")
    except Exception as e:
        msg = f"Failed to connect to Redis: {e}"
        raise ConnectionError(msg) from e

    # Validate external service URLs
    if not settings.qdrant_url:
        msg = "WEBHOOK_QDRANT_URL is required"
        raise ValueError(msg)

    if not settings.tei_url:
        msg = "WEBHOOK_TEI_URL is required"
        raise ValueError(msg)

    logger.info(
        "Startup validation passed",
        qdrant_url=settings.qdrant_url,
        tei_url=settings.tei_url,
    )


def main() -> None:
    """
    Run standalone RQ worker for processing indexing jobs.

    This worker processes jobs from the "indexing" queue and runs
    indefinitely until terminated.
    """
    try:
        logger.info(
            "Starting standalone RQ worker",
            redis_url=settings.redis_url,
            worker_name="webhook-worker",
        )

        # Validate configuration and connectivity
        validate_startup()

        # Connect to Redis
        redis_conn = get_redis_connection()

        # Pre-initialize service pool for performance
        # This loads the tokenizer and creates service connections once
        # before any jobs are processed
        logger.info("Pre-initializing service pool...")
        from services.service_pool import ServicePool

        pool = ServicePool.get_instance()
        logger.info("Service pool ready for jobs")

        # Validate service pool health
        try:
            # Quick validation that services initialized correctly
            if not pool.text_chunker or not pool.embedding_service:
                msg = "Service pool initialization incomplete"
                raise RuntimeError(msg)
            logger.info("Service pool health check passed")
        except Exception as e:
            logger.error("Service pool health check failed", error=str(e))
            raise

        # Create and configure worker
        worker = Worker(
            queues=["indexing"],
            connection=redis_conn,
            name="webhook-worker",
        )

        logger.info("Worker initialized, listening for jobs on 'indexing' queue...")

        # Start processing jobs (blocks until termination signal)
        worker.work(with_scheduler=False)

    except KeyboardInterrupt:
        logger.info("Worker interrupted by user")
        sys.exit(0)
    except Exception:
        logger.exception("Worker crashed")
        sys.exit(1)


if __name__ == "__main__":
    main()
