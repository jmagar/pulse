"""
Timing utilities for tracking operation performance.

Provides context managers and decorators for timing operations.
"""

import time
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import Any
from uuid import uuid4

from infra.database import get_db_context
from domain.models import OperationMetric
from utils.logging import get_logger

logger = get_logger(__name__)


class TimingContext:
    """
    Context manager for timing operations with automatic database recording.

    Usage:
        ```python
        async with TimingContext("embedding", "embed_batch", document_url="https://example.com") as ctx:
            embeddings = await embedding_service.embed_batch(texts)
            ctx.metadata = {"batch_size": len(texts), "embedding_dim": len(embeddings[0])}
        ```
    """

    def __init__(
        self,
        operation_type: str,
        operation_name: str,
        request_id: str | None = None,
        job_id: str | None = None,
        crawl_id: str | None = None,
        document_url: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        """
        Initialize timing context.

        Args:
            operation_type: Type of operation ('webhook', 'chunking', 'embedding', 'qdrant', 'bm25')
            operation_name: Specific operation name (e.g., 'crawl.page', 'embed_batch')
            request_id: Optional request ID for correlation
            job_id: Optional job ID for worker correlation
            crawl_id: Optional crawl ID for lifecycle correlation
            document_url: Optional document URL being processed
            metadata: Optional additional metadata
        """
        self.operation_type = operation_type
        self.operation_name = operation_name
        self.request_id = request_id  # Can be None for worker operations
        self.job_id = job_id
        self.crawl_id = crawl_id
        self.document_url = document_url
        self.metadata = metadata or {}
        self.start_time: float = 0.0
        self.duration_ms: float = 0.0
        self.success: bool = True
        self.error_message: str | None = None

    async def __aenter__(self) -> "TimingContext":
        """Start timing."""
        self.start_time = time.perf_counter()
        log_kwargs = {
            "operation_type": self.operation_type,
            "operation_name": self.operation_name,
        }
        if self.request_id is not None:
            log_kwargs["request_id"] = self.request_id
        logger.debug("Operation started", **log_kwargs)
        return self

    async def __aexit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        """
        Stop timing and record to database.

        Args:
            exc_type: Exception type if error occurred
            exc_val: Exception value if error occurred
            exc_tb: Exception traceback if error occurred
        """
        self.duration_ms = (time.perf_counter() - self.start_time) * 1000

        if exc_type is not None:
            self.success = False
            self.error_message = str(exc_val)

        # Log timing
        log_level = "info" if self.success else "error"
        log_method = getattr(logger, log_level)
        log_kwargs = {
            "operation_type": self.operation_type,
            "operation_name": self.operation_name,
            "duration_ms": round(self.duration_ms, 2),
            "success": self.success,
            "error": self.error_message,
        }
        if self.request_id is not None:
            log_kwargs["request_id"] = self.request_id
        log_method("Operation completed", **log_kwargs)

        # Store to database (non-blocking - fire and forget)
        try:
            async with get_db_context() as db:
                metric = OperationMetric(
                    operation_type=self.operation_type,
                    operation_name=self.operation_name,
                    duration_ms=self.duration_ms,
                    success=self.success,
                    error_message=self.error_message,
                    request_id=self.request_id,
                    job_id=self.job_id,
                    crawl_id=self.crawl_id,
                    document_url=self.document_url,
                    extra_metadata=self.metadata,
                )
                db.add(metric)
                await db.commit()
        except Exception as db_error:
            # Don't fail the operation if metrics storage fails
            logger.warning(
                "Failed to store operation metric",
                error=str(db_error),
                operation_type=self.operation_type,
            )


@asynccontextmanager
async def time_operation(
    operation_type: str,
    operation_name: str,
    **kwargs: Any,
) -> AsyncGenerator[TimingContext]:
    """
    Async context manager for timing operations.

    Args:
        operation_type: Type of operation
        operation_name: Name of operation
        **kwargs: Additional arguments passed to TimingContext

    Yields:
        TimingContext: Timing context

    Example:
        ```python
        async with time_operation("qdrant", "index_chunks", document_url=url) as ctx:
            await vector_store.index_chunks(chunks, embeddings, url)
            ctx.metadata = {"chunks": len(chunks)}
        ```
    """
    ctx = TimingContext(operation_type, operation_name, **kwargs)
    async with ctx:
        yield ctx
