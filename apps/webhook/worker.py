"""
Background worker for async document indexing.

DEPRECATED: This module is kept for backward compatibility only.
The worker now runs as a background thread within the FastAPI process.
See worker_thread.WorkerThreadManager for the new implementation.

To run worker standalone (not recommended):
    python -m worker

To run worker embedded in API (recommended):
    WEBHOOK_ENABLE_WORKER=true uvicorn main:app
"""

import asyncio
import sys
from typing import Any
from uuid import uuid4

from rq import Worker

from api.schemas.indexing import IndexDocumentRequest
from config import settings
from infra.redis import get_redis_connection
from services.embedding import EmbeddingService
from services.service_pool import ServicePool
from services.vector_store import VectorStore
from utils.logging import configure_logging, get_logger
from utils.timing import TimingContext

# Configure logging
configure_logging(settings.log_level)
logger = get_logger(__name__)


async def _index_document_async(document_dict: dict[str, Any]) -> dict[str, Any]:
    """
    Async implementation of document indexing with crawl_id propagation.

    Uses service pool for efficient resource reuse across jobs.

    Args:
        document_dict: Document data including optional crawl_id

    Returns:
        Indexing result
    """
    # Generate job ID for correlation
    job_id = str(uuid4())

    # Extract crawl_id BEFORE parsing (not in schema)
    crawl_id = document_dict.get("crawl_id")

    logger.info(
        "Starting indexing job",
        url=document_dict.get("url"),
        crawl_id=crawl_id,
    )

    try:
        # Parse with detailed error context
        try:
            document = IndexDocumentRequest(**document_dict)
        except Exception as parse_error:
            logger.error(
                "Failed to parse document payload",
                url=document_dict.get("url"),
                crawl_id=crawl_id,
                error=str(parse_error),
                error_type=type(parse_error).__name__,
                provided_keys=list(document_dict.keys()),
                sample_values={k: str(v)[:100] for k, v in list(document_dict.items())[:5]},
            )
            raise

        # Get services from pool (FAST - no initialization overhead)
        async with TimingContext(
            "worker",
            "get_service_pool",
            job_id=job_id,
            crawl_id=crawl_id,
            document_url=document.url,
            request_id=None,  # Worker operations have no HTTP request context
        ) as ctx:
            service_pool = ServicePool.get_instance()
            ctx.metadata = {"pool_exists": True}

        # Get indexing service from pool
        indexing_service = service_pool.get_indexing_service()

        # Ensure collection exists
        try:
            await service_pool.vector_store.ensure_collection()
        except Exception as coll_error:
            logger.error(
                "Failed to ensure Qdrant collection",
                collection=settings.qdrant_collection,
                error=str(coll_error),
                error_type=type(coll_error).__name__,
            )
            raise

        # Index document with timing
        async with TimingContext(
            "worker",
            "index_document",
            job_id=job_id,
            crawl_id=crawl_id,
            document_url=document.url,
            request_id=None,  # Worker operations have no HTTP request context
        ) as ctx:
            result = await indexing_service.index_document(
                document,
                job_id=job_id,
                crawl_id=crawl_id,
            )
            ctx.metadata = {
                "chunks_indexed": result.get("chunks_indexed", 0),
                "total_tokens": result.get("total_tokens", 0),
            }

        logger.info(
            "Indexing job completed",
            url=document.url,
            success=result.get("success"),
            chunks=result.get("chunks_indexed", 0),
        )

        return result

    except Exception as e:
        logger.error(
            "Indexing job failed",
            url=document_dict.get("url"),
            error=str(e),
            error_type=type(e).__name__,
            exc_info=True,  # Include full traceback
        )

        return {
            "success": False,
            "url": document_dict.get("url"),
            "error": str(e),
            "error_type": type(e).__name__,
        }


async def process_batch_async(documents: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Process multiple documents concurrently using asyncio.gather().

    This function processes documents in parallel, maximizing throughput
    for I/O-bound operations (TEI embeddings, Qdrant indexing).

    Args:
        documents: List of document dictionaries to index

    Returns:
        List of indexing results (same order as input)
    """
    if not documents:
        return []

    logger.info("Starting batch processing", batch_size=len(documents))

    # Create tasks for all documents
    tasks = [_index_document_async(doc) for doc in documents]

    # Execute concurrently with asyncio.gather()
    # return_exceptions=True ensures one failure doesn't stop the batch
    results = await asyncio.gather(*tasks, return_exceptions=True)

    # Convert exceptions to error dicts
    processed_results = []
    for i, result in enumerate(results):
        if isinstance(result, Exception):
            logger.error(
                "Document indexing failed in batch",
                url=documents[i].get("url"),
                error=str(result),
                error_type=type(result).__name__,
            )
            processed_results.append({
                "success": False,
                "url": documents[i].get("url"),
                "error": str(result),
                "error_type": type(result).__name__,
            })
        else:
            processed_results.append(result)

    success_count = sum(1 for r in processed_results if r.get("success"))
    logger.info(
        "Batch processing complete",
        total=len(documents),
        success=success_count,
        failed=len(documents) - success_count,
    )

    return processed_results


def index_document_job(document_dict: dict[str, Any]) -> dict[str, Any]:
    """
    Background job to index a document.

    This is the actual job function that RQ executes.
    RQ requires synchronous functions, so this wraps the async implementation.

    Args:
        document_dict: Document data as dictionary

    Returns:
        Indexing result
    """
    # RQ expects a synchronous function, so we use asyncio.run() to execute the async code
    return asyncio.run(_index_document_async(document_dict))


def index_document_batch_job(documents: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Background job to index multiple documents in a batch.

    This is the batch job function that RQ executes for multiple documents.
    RQ requires synchronous functions, so this wraps the async batch implementation.

    Args:
        documents: List of document dictionaries to index

    Returns:
        List of indexing results (same order as input)
    """
    # Use BatchWorker for batch processing
    from workers.batch_worker import BatchWorker

    batch_worker = BatchWorker()
    return batch_worker.process_batch_sync(documents)


async def _validate_external_services() -> bool:
    """
    Validate that all required external services are accessible.

    Returns:
        True if all services are healthy, False otherwise
    """
    logger.info("Validating external services...")
    all_healthy = True

    # Check TEI
    embedding_service = EmbeddingService(tei_url=settings.tei_url)
    try:
        if await embedding_service.health_check():
            logger.info("✓ TEI service is healthy", url=settings.tei_url)
        else:
            logger.error("✗ TEI service is unhealthy", url=settings.tei_url)
            all_healthy = False
    except Exception:
        logger.exception("✗ Failed to connect to TEI", url=settings.tei_url)
        all_healthy = False
    finally:
        await embedding_service.close()

    # Check Qdrant
    vector_store = VectorStore(
        url=settings.qdrant_url,
        collection_name=settings.qdrant_collection,
        vector_dim=settings.vector_dim,
        timeout=int(settings.qdrant_timeout),
    )
    try:
        if await vector_store.health_check():
            logger.info("✓ Qdrant service is healthy", url=settings.qdrant_url)
        else:
            logger.error("✗ Qdrant service is unhealthy", url=settings.qdrant_url)
            all_healthy = False
    except Exception:
        logger.exception("✗ Failed to connect to Qdrant", url=settings.qdrant_url)
        all_healthy = False
    finally:
        await vector_store.close()

    return all_healthy


def run_worker() -> None:
    """
    Run the RQ worker.

    This is the main entry point for the worker process.
    The worker processes both individual document jobs (index_document_job)
    and batch jobs (index_document_batch_job) which uses BatchWorker for
    concurrent processing via asyncio.gather().
    """
    logger.info("Starting RQ worker", redis_url=settings.redis_url)

    # Validate external services before starting
    if not asyncio.run(_validate_external_services()):
        logger.error("External service validation failed - worker cannot start")
        logger.error("Please ensure TEI and Qdrant are running and accessible")
        sys.exit(1)

    logger.info("All external services validated successfully")

    # Connect to Redis
    redis_conn = get_redis_connection()

    # Create worker with unique name (hostname ensures uniqueness across replicas)
    import socket
    worker_name = f"search-bridge-worker-{socket.gethostname()}"

    worker = Worker(
        queues=["indexing"],
        connection=redis_conn,
        name=worker_name,
    )

    logger.info("Worker initialized, listening for jobs...")

    try:
        worker.work()
    except KeyboardInterrupt:
        logger.info("Worker interrupted by user")
        sys.exit(0)
    except Exception as e:
        logger.error("Worker error", error=str(e))
        sys.exit(1)


if __name__ == "__main__":
    run_worker()
