"""
Unit tests for API dependencies.
"""

from collections.abc import Generator
from unittest.mock import patch

import pytest
from fastapi import HTTPException

import api.deps as deps


@pytest.fixture(autouse=True)
def reset_singletons() -> Generator[None]:
    """Reset all singleton instances between tests."""
    deps._text_chunker = None
    deps._embedding_service = None
    deps._vector_store = None
    deps._bm25_engine = None
    deps._indexing_service = None
    deps._search_orchestrator = None
    deps._redis_conn = None
    deps._rq_queue = None
    yield
    # Reset again after test
    deps._text_chunker = None
    deps._embedding_service = None
    deps._vector_store = None
    deps._bm25_engine = None
    deps._indexing_service = None
    deps._search_orchestrator = None
    deps._redis_conn = None
    deps._rq_queue = None


def test_get_text_chunker_singleton() -> None:
    """Test TextChunker (stubbed in test_mode) is a singleton."""

    chunker1 = deps.get_text_chunker()
    chunker2 = deps.get_text_chunker()

    assert chunker1 is chunker2


def test_get_embedding_service_singleton() -> None:
    """Test EmbeddingService (stubbed in test_mode) is a singleton."""

    service1 = deps.get_embedding_service()
    service2 = deps.get_embedding_service()

    assert service1 is service2


def test_get_vector_store_singleton() -> None:
    """Test VectorStore (stubbed in test_mode) is a singleton."""

    store1 = deps.get_vector_store()
    store2 = deps.get_vector_store()

    assert store1 is store2


def test_get_bm25_engine_singleton() -> None:
    """Test BM25Engine (stubbed in test_mode) is a singleton."""

    engine1 = deps.get_bm25_engine()
    engine2 = deps.get_bm25_engine()

    assert engine1 is engine2


def test_get_redis_connection_singleton() -> None:
    """Test Redis connection (stubbed in test_mode) is a singleton."""

    conn1 = deps.get_redis_connection()
    conn2 = deps.get_redis_connection()

    assert conn1 is conn2


def test_get_rq_queue_singleton() -> None:
    """Test RQ queue (stubbed in test_mode) is a singleton."""

    redis_conn = deps.get_redis_connection()

    queue1 = deps.get_rq_queue(redis_conn)
    queue2 = deps.get_rq_queue(redis_conn)

    assert queue1 is queue2
    assert getattr(queue1, "name", "indexing") == "indexing"


def test_get_indexing_service_singleton() -> None:
    """Test IndexingService (stubbed in test_mode) is a singleton."""

    chunker = deps.get_text_chunker()
    embedding = deps.get_embedding_service()
    vector_store = deps.get_vector_store()
    bm25 = deps.get_bm25_engine()

    service1 = deps.get_indexing_service(chunker, embedding, vector_store, bm25)
    service2 = deps.get_indexing_service(chunker, embedding, vector_store, bm25)

    assert service1 is service2


def test_get_search_orchestrator_singleton() -> None:
    """Test SearchOrchestrator (stubbed in test_mode) is a singleton."""

    embedding = deps.get_embedding_service()
    vector_store = deps.get_vector_store()
    bm25 = deps.get_bm25_engine()

    orchestrator1 = deps.get_search_orchestrator(embedding, vector_store, bm25)
    orchestrator2 = deps.get_search_orchestrator(embedding, vector_store, bm25)

    assert orchestrator1 is orchestrator2


@pytest.mark.asyncio
async def test_verify_api_secret_valid() -> None:
    """Test API secret verification with valid secret (Bearer format)."""
    with patch("api.deps.settings") as mock_settings:
        mock_settings.api_secret = "test-secret"

        # Should not raise - Bearer format
        await deps.verify_api_secret(authorization="Bearer test-secret")

        # Should also work with raw token for backwards compatibility
        await deps.verify_api_secret(authorization="test-secret")


@pytest.mark.asyncio
async def test_verify_api_secret_missing() -> None:
    """Test API secret verification with missing Authorization header."""
    with pytest.raises(HTTPException) as exc_info:
        await deps.verify_api_secret(authorization=None)

    assert exc_info.value.status_code == 401
    assert "Missing" in exc_info.value.detail


@pytest.mark.asyncio
async def test_verify_api_secret_invalid() -> None:
    """Test API secret verification with wrong secret."""
    with patch("api.deps.settings") as mock_settings:
        mock_settings.api_secret = "correct-secret"

        with pytest.raises(HTTPException) as exc_info:
            await deps.verify_api_secret(authorization="Bearer wrong-secret")

        assert exc_info.value.status_code == 401
        assert "Invalid" in exc_info.value.detail
