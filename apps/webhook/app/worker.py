"""
Background worker for async document indexing.

This module runs as a separate process via RQ (Redis Queue).
"""

import asyncio
import sys
from typing import Any
from uuid import uuid4

from redis import Redis
from rq import Worker

from app.config import settings
from app.models import IndexDocumentRequest
from app.services.bm25_engine import BM25Engine
from app.services.embedding import EmbeddingService
from app.services.indexing import IndexingService
from app.services.vector_store import VectorStore
from app.utils.logging import configure_logging, get_logger
from app.utils.text_processing import TextChunker
from app.utils.timing import TimingContext

# Configure logging
configure_logging(settings.log_level)
logger = get_logger(__name__)


async def _index_document_async(document_dict: dict[str, Any]) -> dict[str, Any]:
    """
    Async implementation of document indexing with enhanced error logging.

    Args:
        document_dict: Document data as dictionary

    Returns:
        Indexing result
    """
    logger.info(
        "Starting indexing job",
        url=document_dict.get("url"),
        document_keys=list(document_dict.keys()),
    )

    # Generate job ID for correlation
    job_id = str(uuid4())

    # Initialize service references for cleanup
    embedding_service = None
    vector_store = None

    try:
        # Parse with detailed error context
        try:
            document = IndexDocumentRequest(**document_dict)
        except Exception as parse_error:
            logger.error(
                "Failed to parse document payload",
                url=document_dict.get("url"),
                error=str(parse_error),
                error_type=type(parse_error).__name__,
                provided_keys=list(document_dict.keys()),
                sample_values={k: str(v)[:100] for k, v in list(document_dict.items())[:5]},
            )
            raise

        # Initialize services (in worker context)
        text_chunker = TextChunker(
            model_name=settings.embedding_model,
            max_tokens=settings.max_chunk_tokens,
            overlap_tokens=settings.chunk_overlap_tokens,
        )

        embedding_service = EmbeddingService(
            tei_url=settings.tei_url,
            api_key=settings.tei_api_key,
        )

        vector_store = VectorStore(
            url=settings.qdrant_url,
            collection_name=settings.qdrant_collection,
            vector_dim=settings.vector_dim,
            timeout=int(settings.qdrant_timeout),
        )

        bm25_engine = BM25Engine(
            k1=settings.bm25_k1,
            b=settings.bm25_b,
        )

        indexing_service = IndexingService(
            text_chunker=text_chunker,
            embedding_service=embedding_service,
            vector_store=vector_store,
            bm25_engine=bm25_engine,
        )

        # Ensure collection exists
        try:
            await vector_store.ensure_collection()
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
            document_url=document.url,
        ) as ctx:
            result = await indexing_service.index_document(document, job_id=job_id)
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

    finally:
        # Always cleanup resources, even on exception
        if embedding_service is not None:
            try:
                await embedding_service.close()
                logger.debug("Embedding service closed")
            except Exception:
                logger.exception("Failed to close embedding service")

        if vector_store is not None:
            try:
                await vector_store.close()
                logger.debug("Vector store closed")
            except Exception:
                logger.exception("Failed to close vector store")


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
    """
    logger.info("Starting RQ worker", redis_url=settings.redis_url)

    # Validate external services before starting
    if not asyncio.run(_validate_external_services()):
        logger.error("External service validation failed - worker cannot start")
        logger.error("Please ensure TEI and Qdrant are running and accessible")
        sys.exit(1)

    logger.info("All external services validated successfully")

    # Connect to Redis
    redis_conn = Redis.from_url(settings.redis_url)

    # Create worker with specific queues
    worker = Worker(
        queues=["indexing"],
        connection=redis_conn,
        name="search-bridge-worker",
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
