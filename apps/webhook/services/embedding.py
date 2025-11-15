"""HuggingFace Text Embeddings Inference (TEI) client."""

import logging
from typing import cast

import httpx
from tenacity import (
    before_log,
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from utils.logging import get_logger

logger = get_logger(__name__)


class EmbeddingService:
    """Client for HuggingFace Text Embeddings Inference API."""

    def __init__(self, tei_url: str, api_key: str | None = None, timeout: float = 30.0) -> None:
        """
        Initialize the embedding service.

        Args:
            tei_url: TEI server URL (e.g., 'http://localhost:52104')
            api_key: Optional API key for authentication
            timeout: Request timeout in seconds
        """
        self.tei_url = tei_url.rstrip("/")
        self.timeout = timeout
        self.api_key = api_key

        # Build headers for lazy client creation
        self._headers = {}
        if api_key:
            self._headers["Authorization"] = f"Bearer {api_key}"

        # Lazy initialization - client created on first use
        self._client: httpx.AsyncClient | None = None

        logger.info(
            "Embedding service initialized",
            tei_url=self.tei_url,
            has_api_key=bool(api_key),
        )

    @property
    def client(self) -> httpx.AsyncClient:
        """
        Get the HTTP client, creating it lazily if needed.

        Lazy initialization ensures the client is created in a thread
        with an active event loop, avoiding potential issues.
        """
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=self.timeout, headers=self._headers)
            logger.debug("HTTP client created on first use")
        return self._client

    async def close(self) -> None:
        """Close the HTTP client."""
        if self._client is not None:
            await self._client.aclose()
            logger.info("Embedding service closed")
        else:
            logger.debug("Embedding service close called but client was never created")

    async def health_check(self) -> bool:
        """
        Check if TEI server is healthy.

        Returns:
            True if healthy, False otherwise
        """
        try:
            response = await self.client.get(f"{self.tei_url}/health")
            is_healthy = response.status_code == 200
            logger.debug("TEI health check", healthy=is_healthy, status=response.status_code)
            return is_healthy
        except Exception as e:
            logger.error("TEI health check failed", error=str(e))
            return False

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type(httpx.HTTPError),
        before=before_log(logger, logging.WARNING),  # type: ignore[arg-type]
        reraise=True,
    )
    async def embed_single(self, text: str) -> list[float]:
        """
        Embed a single text with automatic retry on HTTP errors.

        Args:
            text: Text to embed

        Returns:
            Embedding vector

        Raises:
            ValueError: If text is empty or TEI returns empty embedding
            httpx.HTTPError: If request fails after 3 retry attempts

        Notes:
            Retries up to 3 times with exponential backoff (2-10 seconds)
            on HTTP errors. Logs a warning before each retry attempt.
        """
        if not text or not text.strip():
            error_msg = "Empty text provided for embedding"
            logger.error(error_msg)
            raise ValueError(error_msg)

        try:
            response = await self.client.post(
                f"{self.tei_url}/embed",
                json={"inputs": text},
            )
            response.raise_for_status()

            raw_result = cast(list[list[float]], response.json())

            if not raw_result or not raw_result[0]:
                error_msg = "TEI returned empty embedding"
                logger.error(error_msg, text_length=len(text))
                raise ValueError(error_msg)

            embedding: list[float] = raw_result[0]

            logger.debug(
                "Generated single embedding",
                text_length=len(text),
                embedding_dim=len(embedding),
            )

            return embedding

        except httpx.HTTPError as e:
            logger.error(
                "Failed to generate embedding",
                error=str(e),
                status=e.response.status_code if hasattr(e, "response") else None,
            )
            raise

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type(httpx.HTTPError),
        before=before_log(logger, logging.WARNING),  # type: ignore[arg-type]
        reraise=True,
    )
    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        """
        Embed multiple texts in a batch with automatic retry on HTTP errors.

        Args:
            texts: List of texts to embed

        Returns:
            List of embedding vectors

        Raises:
            ValueError: If texts are empty or TEI returns empty embeddings
            httpx.HTTPError: If request fails after 3 retry attempts

        Notes:
            Retries up to 3 times with exponential backoff (2-10 seconds)
            on HTTP errors. Logs a warning before each retry attempt.
        """
        if not texts:
            error_msg = "Empty text list provided for batch embedding"
            logger.error(error_msg)
            raise ValueError(error_msg)

        # Filter out empty texts
        valid_texts = [t for t in texts if t and t.strip()]
        if not valid_texts:
            error_msg = "All texts in batch are empty"
            logger.error(error_msg)
            raise ValueError(error_msg)

        try:
            response = await self.client.post(
                f"{self.tei_url}/embed",
                json={"inputs": valid_texts},
            )
            response.raise_for_status()

            embeddings = cast(list[list[float]], response.json())

            if not embeddings or any(not emb for emb in embeddings):
                error_msg = "TEI returned empty embeddings for batch"
                logger.error(error_msg, batch_size=len(valid_texts))
                raise ValueError(error_msg)

            logger.info(
                "Generated batch embeddings",
                batch_size=len(valid_texts),
                embedding_dim=len(embeddings[0]),
            )

            return embeddings

        except httpx.HTTPError as e:
            logger.error(
                "Failed to generate batch embeddings",
                batch_size=len(valid_texts),
                error=str(e),
                status=e.response.status_code if hasattr(e, "response") else None,
            )
            raise

    async def embed(self, text_or_texts: str | list[str]) -> list[float] | list[list[float]]:
        """
        Embed text(s) - auto-detects single vs batch.

        Args:
            text_or_texts: Single text string or list of texts

        Returns:
            Single embedding vector or list of vectors
        """
        if isinstance(text_or_texts, str):
            return await self.embed_single(text_or_texts)
        else:
            return await self.embed_batch(text_or_texts)
