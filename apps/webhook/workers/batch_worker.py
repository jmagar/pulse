"""
Batch worker for concurrent document indexing.

This module provides the BatchWorker class that processes multiple documents
concurrently using asyncio.gather() for maximum throughput on I/O-bound operations.
"""

import asyncio
from typing import Any
from uuid import uuid4

from api.schemas.indexing import IndexDocumentRequest
from services.service_pool import ServicePool
from utils.logging import get_logger

logger = get_logger(__name__)


async def _index_document_async(document_dict: dict[str, Any]) -> dict[str, Any]:
    """
    Index a single document asynchronously.

    This function is used by BatchWorker to process individual documents
    within a batch. It uses the service pool for efficient resource reuse.

    Args:
        document_dict: Document data including optional crawl_id

    Returns:
        Indexing result with success status, URL, and metadata

    Raises:
        Exception: If indexing fails (caught and converted to error dict)
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
        service_pool = ServicePool.get_instance()
        indexing_service = service_pool.get_indexing_service()

        # Ensure collection exists
        try:
            await service_pool.vector_store.ensure_collection()
        except Exception as coll_error:
            logger.error(
                "Failed to ensure Qdrant collection",
                error=str(coll_error),
                error_type=type(coll_error).__name__,
            )
            raise

        # Index document
        result = await indexing_service.index_document(
            document,
            job_id=job_id,
            crawl_id=crawl_id,
        )

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
            exc_info=True,
        )

        return {
            "success": False,
            "url": document_dict.get("url"),
            "error": str(e),
            "error_type": type(e).__name__,
        }


class BatchWorker:
    """
    Worker class for processing multiple documents concurrently.

    This class uses asyncio.gather() to process documents in parallel,
    maximizing throughput for I/O-bound operations like embedding generation
    and vector store indexing.

    Example:
        ```python
        batch_worker = BatchWorker()

        # Async usage
        results = await batch_worker.process_batch(documents)

        # Sync usage (for RQ jobs)
        results = batch_worker.process_batch_sync(documents)
        ```

    Attributes:
        None (stateless worker)
    """

    def __init__(self) -> None:
        """Initialize BatchWorker."""
        pass

    async def process_batch(self, documents: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """
        Process multiple documents concurrently using asyncio.gather().

        This method processes documents in parallel, maximizing throughput
        for I/O-bound operations (TEI embeddings, Qdrant indexing).

        Args:
            documents: List of document dictionaries to index

        Returns:
            List of indexing results in same order as input documents

        Example:
            ```python
            documents = [
                {"url": "https://example.com/1", "markdown": "Content 1"},
                {"url": "https://example.com/2", "markdown": "Content 2"},
            ]

            batch_worker = BatchWorker()
            results = await batch_worker.process_batch(documents)

            for result in results:
                if result["success"]:
                    print(f"Indexed {result['url']}: {result['chunks_indexed']} chunks")
                else:
                    print(f"Failed {result['url']}: {result['error']}")
            ```
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
        processed_results: list[dict[str, str | bool | Any | None]] = []
        for i, result in enumerate(results):
            if isinstance(result, BaseException):
                logger.error(
                    "Document indexing failed in batch",
                    url=documents[i].get("url"),
                    error=str(result),
                    error_type=type(result).__name__,
                )
                processed_results.append(
                    {
                        "success": False,
                        "url": documents[i].get("url"),
                        "error": str(result),
                        "error_type": type(result).__name__,
                    }
                )
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

    def process_batch_sync(self, documents: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """
        Synchronous wrapper for batch processing.

        This method allows batch processing to be used in synchronous contexts
        like RQ background jobs. It wraps the async implementation using
        asyncio.run().

        Args:
            documents: List of document dictionaries to index

        Returns:
            List of indexing results in same order as input documents

        Example:
            ```python
            # RQ job function
            def index_batch_job(documents):
                batch_worker = BatchWorker()
                return batch_worker.process_batch_sync(documents)

            # Queue the job
            queue.enqueue(index_batch_job, documents)
            ```
        """
        return asyncio.run(self.process_batch(documents))
