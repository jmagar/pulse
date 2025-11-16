"""
Shared dependencies for API routes.

Implements dependency injection for FastAPI.
"""

import hashlib
import hmac
import re
import secrets
from types import SimpleNamespace
from typing import Annotated, Any
from uuid import uuid4

from fastapi import Depends, Header, HTTPException, Request, status
from redis import Redis
from rq import Queue

from config import settings
from services.bm25_engine import BM25Engine
from services.embedding import EmbeddingService
from services.indexing import IndexingService
from services.search import SearchOrchestrator
from services.vector_store import VectorStore
from utils.logging import get_logger
from utils.text_processing import TextChunker

logger = get_logger(__name__)

__all__ = [
    "verify_api_secret",
    "verify_webhook_signature",
    "get_text_chunker",
    "get_embedding_service",
    "get_vector_store",
    "get_bm25_engine",
    "get_redis_connection",
    "get_rq_queue",
    "get_indexing_service",
    "get_search_orchestrator",
    "cleanup_services",
]

# Global instances (lazy-loaded)
_text_chunker: TextChunker | None = None
_embedding_service: Any = None
_vector_store: Any = None
_bm25_engine: Any = None
_indexing_service: Any = None
_search_orchestrator: Any = None
_redis_conn: Any = None
_rq_queue: Any = None


class _StubRedis:
    def ping(self) -> bool:
        return True

    def close(self) -> None:
        return None


class _StubQueue:
    def enqueue(self, *args, **kwargs):
        job_id = kwargs.get("job_id") or f"stub-job-{uuid4().hex[:8]}"
        return SimpleNamespace(id=job_id)


class _StubVectorStore:
    collection_name = "test-collection"

    async def ensure_collection(self) -> None:  # pragma: no cover - trivial
        return None

    async def health_check(self) -> bool:
        return True

    async def count_points(self) -> int:
        return 1

    async def close(self) -> None:
        return None


class _StubEmbeddingService:
    async def health_check(self) -> bool:
        return True

    async def close(self) -> None:
        return None


class _StubIndexingService:
    async def index_document(self, document: Any, job_id: str | None = None) -> dict[str, Any]:
        url = getattr(document, "url", None) or document.get("url")
        return {
            "success": True,
            "url": url,
            "chunks_indexed": 1,
            "job_id": job_id or f"stub-job-{uuid4().hex[:6]}",
        }


class _StubSearchOrchestrator:
    async def search(
        self, query: str, mode: str, limit: int, **kwargs: Any
    ) -> list[dict[str, Any]]:
        return [
            {
                "id": f"stub-{mode}",
                "score": 0.99,
                "payload": {
                    "url": f"https://example.com/{mode}",
                    "title": f"{mode.title()} Result",
                    "description": f"Stub result for {query}",
                },
            }
        ]


class _StubBM25Engine:
    def get_document_count(self) -> int:
        return 1


def get_text_chunker() -> TextChunker:
    """Get or create TextChunker instance."""
    global _text_chunker
    if _text_chunker is None:
        if settings.test_mode:
            # Use lightweight stub to avoid loading HF models during tests
            class _StubTextChunker:
                def chunk_text(
                    self, text: str, metadata: dict[str, Any] | None = None
                ) -> list[dict[str, Any]]:
                    return [{"text": text, "metadata": metadata or {}}]

            _text_chunker = _StubTextChunker()  # type: ignore[assignment]
        else:
            _text_chunker = TextChunker(
                model_name=settings.embedding_model,
                max_tokens=settings.max_chunk_tokens,
                overlap_tokens=settings.chunk_overlap_tokens,
            )
    return _text_chunker


def get_embedding_service() -> EmbeddingService:
    """Get or create EmbeddingService instance."""
    global _embedding_service
    if _embedding_service is None:
        if settings.test_mode:
            _embedding_service = _StubEmbeddingService()
        else:
            _embedding_service = EmbeddingService(
                tei_url=settings.tei_url,
                api_key=settings.tei_api_key,
            )
    return _embedding_service  # type: ignore[return-value]


def get_vector_store() -> VectorStore:
    """Get or create VectorStore instance."""
    global _vector_store
    if _vector_store is None:
        if settings.test_mode:
            _vector_store = _StubVectorStore()
        else:
            _vector_store = VectorStore(
                url=settings.qdrant_url,
                collection_name=settings.qdrant_collection,
                vector_dim=settings.vector_dim,
                timeout=int(settings.qdrant_timeout),
            )
    return _vector_store  # type: ignore[return-value]


def get_bm25_engine() -> BM25Engine:
    """Get or create BM25Engine instance."""
    global _bm25_engine
    if _bm25_engine is None:
        if settings.test_mode:
            _bm25_engine = _StubBM25Engine()
        else:
            _bm25_engine = BM25Engine(
                k1=settings.bm25_k1,
                b=settings.bm25_b,
            )
    return _bm25_engine  # type: ignore[return-value]


def get_indexing_service(
    text_chunker: Annotated[TextChunker, Depends(get_text_chunker)],
    embedding_service: Annotated[EmbeddingService, Depends(get_embedding_service)],
    vector_store: Annotated[VectorStore, Depends(get_vector_store)],
    bm25_engine: Annotated[BM25Engine, Depends(get_bm25_engine)],
) -> IndexingService:
    """Get or create IndexingService instance."""
    global _indexing_service
    if _indexing_service is None:
        if settings.test_mode:
            _indexing_service = _StubIndexingService()
        else:
            _indexing_service = IndexingService(
                text_chunker=text_chunker,
                embedding_service=embedding_service,
                vector_store=vector_store,
                bm25_engine=bm25_engine,
            )
    return _indexing_service  # type: ignore[return-value]


def get_search_orchestrator(
    embedding_service: Annotated[EmbeddingService, Depends(get_embedding_service)],
    vector_store: Annotated[VectorStore, Depends(get_vector_store)],
    bm25_engine: Annotated[BM25Engine, Depends(get_bm25_engine)],
) -> SearchOrchestrator:
    """Get or create SearchOrchestrator instance."""
    global _search_orchestrator
    if _search_orchestrator is None:
        if settings.test_mode:
            _search_orchestrator = _StubSearchOrchestrator()
        else:
            _search_orchestrator = SearchOrchestrator(
                embedding_service=embedding_service,
                vector_store=vector_store,
                bm25_engine=bm25_engine,
                rrf_k=settings.rrf_k,
            )
    return _search_orchestrator  # type: ignore[return-value]


def get_redis_connection() -> Redis:
    """Get or create Redis connection."""
    global _redis_conn
    if _redis_conn is None:
        if settings.test_mode:
            _redis_conn = _StubRedis()
        else:
            _redis_conn = Redis.from_url(settings.redis_url, decode_responses=True)
            logger.info("Redis connection established")
    return _redis_conn  # type: ignore[return-value]


def get_rq_queue(redis_conn: Annotated[Redis, Depends(get_redis_connection)]) -> Queue:
    """Get or create RQ queue."""
    global _rq_queue
    if _rq_queue is None:
        if settings.test_mode:
            _rq_queue = _StubQueue()
        else:
            _rq_queue = Queue(connection=redis_conn, name="indexing")
            logger.info("RQ queue initialized")
    return _rq_queue  # type: ignore[return-value]


async def cleanup_services() -> None:
    """
    Clean up all singleton services.

    This should be called during application shutdown to properly close
    async resources like HTTP clients and database connections.

    This function is idempotent and can be safely called multiple times.
    """
    global _text_chunker, _embedding_service, _vector_store, _bm25_engine
    global _indexing_service, _search_orchestrator, _redis_conn, _rq_queue

    # Close embedding service (async HTTP client)
    if _embedding_service is not None:
        try:
            await _embedding_service.close()
            logger.info("Embedding service closed")
        except Exception:
            logger.exception("Failed to close embedding service")
        finally:
            _embedding_service = None

    # Close vector store (async Qdrant client)
    if _vector_store is not None:
        try:
            await _vector_store.close()
            logger.info("Vector store closed")
        except Exception:
            logger.exception("Failed to close vector store")
        finally:
            _vector_store = None

    # Close Redis connection (synchronous - use thread to avoid blocking)
    if _redis_conn is not None:
        try:
            import asyncio

            # Run synchronous close() in thread pool to avoid blocking event loop
            await asyncio.to_thread(_redis_conn.close)
            logger.info("Redis connection closed")
        except Exception:
            logger.exception("Failed to close Redis connection")
        finally:
            _redis_conn = None
            _rq_queue = None  # RQ queue depends on Redis connection

    # Reset remaining singletons (no explicit cleanup needed)
    _text_chunker = None
    _bm25_engine = None
    _indexing_service = None
    _search_orchestrator = None


async def verify_api_secret(
    authorization: Annotated[str | None, Header()] = None,
) -> None:
    """
    Verify API secret from Authorization header.

    Supports standard Bearer token format: "Bearer <token>"
    Also accepts raw token for backwards compatibility.

    Args:
        authorization: Authorization header (format: "Bearer <token>" or just "<token>")

    Raises:
        HTTPException: If authorization is missing or invalid
    """
    if not authorization:
        logger.warning("API request without authorization")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Extract token (support both "Bearer <token>" and raw token)
    api_secret = authorization
    if authorization.startswith("Bearer "):
        api_secret = authorization[7:]  # Remove "Bearer " prefix

    if not secrets.compare_digest(api_secret, settings.api_secret):
        logger.warning("Invalid API secret provided")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )


_SIGNATURE_PATTERN = re.compile(r"^sha256=([0-9a-fA-F]{64})$")


def _parse_firecrawl_signature_header(signature_header: str) -> str:
    """Extract hexadecimal digest from Firecrawl signature header."""

    match = _SIGNATURE_PATTERN.match(signature_header.strip())
    if not match:
        raise ValueError("Invalid signature format, expected sha256=<digest>")
    return match.group(1)


async def verify_webhook_signature(
    request: Request,
    x_firecrawl_signature: Annotated[str | None, Header(alias="X-Firecrawl-Signature")] = None,
) -> bytes:
    """
    Verify Firecrawl webhook signature using HMAC-SHA256.

    Returns:
        The verified request body as bytes for reuse by the handler.

    Raises:
        HTTPException: If verification fails or signature is missing.
    """

    secret = getattr(settings, "webhook_secret", "")

    if not secret:
        logger.error("Webhook secret is not configured")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Webhook secret is not configured",
        )

    if not x_firecrawl_signature:
        logger.warning("Webhook request missing signature header")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing X-Firecrawl-Signature header",
        )

    try:
        provided_signature = _parse_firecrawl_signature_header(x_firecrawl_signature)
    except ValueError as exc:
        logger.warning("Webhook signature header has invalid format")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    body = await request.body()

    expected_signature = hmac.new(
        key=secret.encode("utf-8"),
        msg=body,
        digestmod=hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(provided_signature, expected_signature):
        logger.warning("Webhook signature verification failed")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid signature",
        )

    logger.debug("Webhook signature verified successfully")
    return body
