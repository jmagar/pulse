"""
Service pool for sharing expensive services across worker jobs.

This module provides a singleton service pool that maintains persistent
instances of services that are expensive to initialize (tokenizers, HTTP clients,
database connections). This dramatically improves worker performance by avoiding
repeated initialization overhead.

Performance Impact:
- Without pool: 1-5 seconds per job for initialization
- With pool: ~0.001 seconds per job (1000x improvement)
"""

import threading
from typing import ClassVar

from config import settings
from services.bm25_engine import BM25Engine
from services.embedding import EmbeddingService
from services.indexing import IndexingService
from services.vector_store import VectorStore
from utils.logging import get_logger
from utils.text_processing import TextChunker

logger = get_logger(__name__)


class ServicePool:
    """
    Singleton service pool for reusing expensive services across worker jobs.

    This pool maintains persistent instances of:
    - TextChunker: Tokenizer loaded once, reused for all jobs
    - EmbeddingService: HTTP client with connection pooling
    - VectorStore: Qdrant client with persistent connections
    - BM25Engine: BM25 index loaded once

    Thread-safe: Uses double-checked locking pattern.
    """

    _instance: ClassVar["ServicePool | None"] = None
    _lock: ClassVar[threading.Lock] = threading.Lock()

    def __init__(self) -> None:
        """
        Initialize service pool (private - use get_instance() instead).

        This is called only once during the lifetime of the worker process.
        """
        logger.info("Initializing service pool...")

        # Initialize text chunker (loads tokenizer - EXPENSIVE ~1-5s)
        logger.info("Loading tokenizer for text chunking...")
        self.text_chunker = TextChunker(
            model_name=settings.embedding_model,
            max_tokens=settings.max_chunk_tokens,
            overlap_tokens=settings.chunk_overlap_tokens,
        )
        logger.info("Text chunker initialized")

        # Initialize embedding service (creates HTTP client with connection pooling)
        logger.info("Initializing embedding service...")
        self.embedding_service = EmbeddingService(
            tei_url=settings.tei_url,
            api_key=settings.tei_api_key,
        )
        logger.info("Embedding service initialized")

        # Initialize vector store (creates Qdrant client)
        logger.info("Initializing vector store...")
        self.vector_store = VectorStore(
            url=settings.qdrant_url,
            collection_name=settings.qdrant_collection,
            vector_dim=settings.vector_dim,
            timeout=int(settings.qdrant_timeout),
        )
        logger.info("Vector store initialized")

        # Initialize BM25 engine (loads index if exists)
        logger.info("Initializing BM25 engine...")
        self.bm25_engine = BM25Engine(
            k1=settings.bm25_k1,
            b=settings.bm25_b,
        )
        logger.info("BM25 engine initialized")

        logger.info("Service pool initialization complete")

    @classmethod
    def get_instance(cls) -> "ServicePool":
        """
        Get the singleton service pool instance.

        Thread-safe using double-checked locking pattern.
        First call initializes the pool, subsequent calls return cached instance.

        Returns:
            ServicePool: Singleton instance

        Example:
            ```python
            pool = ServicePool.get_instance()
            indexing_service = IndexingService(
                text_chunker=pool.text_chunker,
                embedding_service=pool.embedding_service,
                vector_store=pool.vector_store,
                bm25_engine=pool.bm25_engine,
            )
            ```
        """
        # Fast path: instance already exists
        if cls._instance is not None:
            return cls._instance

        # Slow path: need to create instance
        with cls._lock:
            # Double-check: another thread might have created it
            if cls._instance is None:
                logger.info("Creating service pool singleton...")
                cls._instance = cls()
                logger.info("Service pool singleton created")
            return cls._instance

    def get_indexing_service(self) -> IndexingService:
        """
        Create an IndexingService using pooled services.

        Note: IndexingService itself is lightweight (no initialization overhead),
        so we create fresh instances. The expensive services are reused from pool.

        Returns:
            IndexingService: New indexing service with pooled dependencies

        Example:
            ```python
            pool = ServicePool.get_instance()
            indexing_service = pool.get_indexing_service()
            result = await indexing_service.index_document(document)
            ```
        """
        return IndexingService(
            text_chunker=self.text_chunker,
            embedding_service=self.embedding_service,
            vector_store=self.vector_store,
            bm25_engine=self.bm25_engine,
        )

    async def close(self) -> None:
        """
        Close all services in the pool.

        Should be called on worker shutdown to cleanup resources gracefully.
        """
        logger.info("Closing service pool...")

        try:
            await self.embedding_service.close()
            logger.info("Embedding service closed")
        except Exception:
            logger.exception("Failed to close embedding service")

        try:
            await self.vector_store.close()
            logger.info("Vector store closed")
        except Exception:
            logger.exception("Failed to close vector store")

        logger.info("Service pool closed")

    @classmethod
    def reset(cls) -> None:
        """
        Reset the singleton instance (for testing only).

        This allows tests to create fresh service pools for isolation.
        Should NEVER be called in production code.
        """
        with cls._lock:
            if cls._instance is not None:
                # Note: Cannot close async services from sync method
                # Tests should call close() before reset()
                cls._instance = None
                logger.debug("Service pool reset")
