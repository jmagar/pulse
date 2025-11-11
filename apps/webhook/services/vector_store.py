"""
Qdrant vector store client.

Handles all interactions with the Qdrant vector database.
"""

import logging
from collections.abc import Sequence
from typing import Any
from uuid import uuid4

import httpx
from qdrant_client import AsyncQdrantClient
from qdrant_client.models import (
    Distance,
    FieldCondition,
    Filter,
    MatchValue,
    PointStruct,
    VectorParams,
)
from tenacity import (
    before_log,
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from utils.logging import get_logger

logger = get_logger(__name__)


class VectorStore:
    """Qdrant vector store client."""

    def __init__(
        self,
        url: str,
        collection_name: str,
        vector_dim: int,
        timeout: int = 60,
    ) -> None:
        """
        Initialize the vector store.

        Args:
            url: Qdrant server URL
            collection_name: Name of the collection
            vector_dim: Vector dimensions
            timeout: Request timeout in seconds (default: 60)
        """
        self.url = url
        self.collection_name = collection_name
        self.vector_dim = vector_dim
        self.timeout = timeout
        self.client = AsyncQdrantClient(url=url, timeout=timeout)

        logger.info(
            "Vector store initialized",
            url=url,
            collection=collection_name,
            dim=vector_dim,
        )

    async def close(self) -> None:
        """Close the client."""
        await self.client.close()
        logger.info("Vector store client closed")

    async def health_check(self) -> bool:
        """
        Check if Qdrant is healthy.

        Returns:
            True if healthy, False otherwise
        """
        try:
            collections = await self.client.get_collections()
            logger.debug("Qdrant health check passed", collections=len(collections.collections))
            return True
        except Exception as e:
            error_message = str(e) or repr(e)
            logger.error("Qdrant health check failed", error=error_message)
            return False

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type(httpx.HTTPError),
        before=before_log(logger, logging.WARNING),  # type: ignore[arg-type]
        reraise=True,
    )
    async def ensure_collection(self) -> None:
        """
        Ensure the collection exists, create if it doesn't.

        Raises:
            Exception: If collection operations fail after 3 retry attempts

        Notes:
            Retries up to 3 times with exponential backoff (2-10 seconds)
            on HTTP errors. Logs a warning before each retry attempt.
        """
        try:
            collections = await self.client.get_collections()
            collection_names = [c.name for c in collections.collections]

            if self.collection_name in collection_names:
                logger.info("Collection already exists", collection=self.collection_name)
                return

            # Create collection
            await self.client.create_collection(
                collection_name=self.collection_name,
                vectors_config=VectorParams(
                    size=self.vector_dim,
                    distance=Distance.COSINE,
                ),
            )

            logger.info("Collection created", collection=self.collection_name)

        except Exception as e:
            error_message = str(e) or repr(e)
            logger.error("Failed to ensure collection", error=error_message)
            raise

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type(httpx.HTTPError),
        before=before_log(logger, logging.WARNING),  # type: ignore[arg-type]
        reraise=True,
    )
    async def index_chunks(
        self,
        chunks: list[dict[str, Any]],
        embeddings: list[list[float]],
        document_url: str,
    ) -> int:
        """
        Index document chunks with embeddings with automatic retry on HTTP errors.

        Args:
            chunks: List of chunk dictionaries from TextChunker
            embeddings: List of embedding vectors
            document_url: Source document URL

        Returns:
            Number of chunks indexed

        Raises:
            ValueError: If chunks and embeddings count mismatch
            Exception: If indexing fails after 3 retry attempts

        Notes:
            Retries up to 3 times with exponential backoff (2-10 seconds)
            on HTTP errors. Logs a warning before each retry attempt.
        """
        if len(chunks) != len(embeddings):
            raise ValueError(
                f"Chunks ({len(chunks)}) and embeddings ({len(embeddings)}) count mismatch"
            )

        points: list[PointStruct] = []
        for chunk, embedding in zip(chunks, embeddings):
            point_id = str(uuid4())

            # Build payload from chunk metadata
            payload = {
                "url": document_url,
                "text": chunk["text"],
                "chunk_index": chunk["chunk_index"],
                "token_count": chunk["token_count"],
            }

            # Add optional metadata
            for key in [
                "canonical_url",
                "title",
                "description",
                "domain",
                "language",
                "country",
                "isMobile",
            ]:
                if key in chunk:
                    payload[key] = chunk[key]

            point = PointStruct(
                id=point_id,
                vector=embedding,
                payload=payload,
            )
            points.append(point)

        # Upsert points
        try:
            await self.client.upsert(
                collection_name=self.collection_name,
                points=points,
            )

            logger.info(
                "Indexed chunks",
                collection=self.collection_name,
                chunks=len(points),
                url=document_url,
            )

            return len(points)

        except Exception as e:
            error_message = str(e) or repr(e)
            logger.error("Failed to index chunks", error=error_message, url=document_url)
            raise

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type(httpx.HTTPError),
        before=before_log(logger, logging.WARNING),  # type: ignore[arg-type]
        reraise=True,
    )
    async def search(
        self,
        query_vector: list[float],
        limit: int = 10,
        domain: str | None = None,
        language: str | None = None,
        country: str | None = None,
        is_mobile: bool | None = None,
    ) -> list[dict[str, Any]]:
        """
        Search for similar vectors with optional filters and automatic retry on HTTP errors.

        Args:
            query_vector: Query embedding vector
            limit: Maximum results
            domain: Filter by domain
            language: Filter by language code
            country: Filter by country code
            is_mobile: Filter by mobile flag

        Returns:
            List of search results with score and payload

        Raises:
            Exception: If search fails after 3 retry attempts

        Notes:
            Retries up to 3 times with exponential backoff (2-10 seconds)
            on HTTP errors. Logs a warning before each retry attempt.
        """
        # Build filter
        must_conditions: Sequence[FieldCondition] = []

        if domain:
            must_conditions = [
                *must_conditions,
                FieldCondition(key="domain", match=MatchValue(value=domain)),
            ]

        if language:
            must_conditions = [
                *must_conditions,
                FieldCondition(key="language", match=MatchValue(value=language)),
            ]

        if country:
            must_conditions = [
                *must_conditions,
                FieldCondition(key="country", match=MatchValue(value=country)),
            ]

        if is_mobile is not None:
            must_conditions = [
                *must_conditions,
                FieldCondition(key="isMobile", match=MatchValue(value=is_mobile)),
            ]

        query_filter = Filter(must=list(must_conditions)) if must_conditions else None

        # Search
        try:
            results = await self.client.search(
                collection_name=self.collection_name,
                query_vector=query_vector,
                query_filter=query_filter,
                limit=limit,
            )

            logger.info(
                "Vector search completed",
                results=len(results),
                filters=len(must_conditions),
            )

            # Convert to dict format
            return [
                {
                    "id": str(result.id),
                    "score": result.score,
                    "payload": result.payload,
                }
                for result in results
            ]

        except Exception as e:
            error_message = str(e) or repr(e)
            logger.error("Vector search failed", error=error_message)
            raise

    async def count_points(self) -> int:
        """
        Get total number of points in collection.

        Returns:
            Point count
        """
        try:
            collection_info = await self.client.get_collection(self.collection_name)
            count = collection_info.points_count or 0
            logger.debug("Point count retrieved", collection=self.collection_name, count=count)
            return count
        except Exception as e:
            error_message = str(e) or repr(e)
            logger.error("Failed to get point count", error=error_message)
            return 0
