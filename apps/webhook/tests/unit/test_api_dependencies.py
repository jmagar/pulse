"""
Unit tests for API dependencies.
"""

from collections.abc import Generator
from unittest.mock import MagicMock, patch

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
    """Test TextChunker is a singleton."""
    with patch("app.api.dependencies.TextChunker") as mock_chunker:
        mock_instance = MagicMock()
        mock_chunker.return_value = mock_instance

        # First call
        chunker1 = deps.get_text_chunker()
        # Second call
        chunker2 = deps.get_text_chunker()

        # Should be same instance
        assert chunker1 is chunker2
        # Should only be created once
        mock_chunker.assert_called_once()


def test_get_embedding_service_singleton() -> None:
    """Test EmbeddingService is a singleton."""
    with patch("app.api.dependencies.EmbeddingService") as mock_service:
        mock_instance = MagicMock()
        mock_service.return_value = mock_instance

        service1 = deps.get_embedding_service()
        service2 = deps.get_embedding_service()

        assert service1 is service2
        mock_service.assert_called_once()


def test_get_vector_store_singleton() -> None:
    """Test VectorStore is a singleton."""
    with patch("app.api.dependencies.VectorStore") as mock_store:
        mock_instance = MagicMock()
        mock_store.return_value = mock_instance

        store1 = deps.get_vector_store()
        store2 = deps.get_vector_store()

        assert store1 is store2
        mock_store.assert_called_once()


def test_get_bm25_engine_singleton() -> None:
    """Test BM25Engine is a singleton."""
    with patch("app.api.dependencies.BM25Engine") as mock_engine:
        mock_instance = MagicMock()
        mock_engine.return_value = mock_instance

        engine1 = deps.get_bm25_engine()
        engine2 = deps.get_bm25_engine()

        assert engine1 is engine2
        mock_engine.assert_called_once()


def test_get_redis_connection_singleton() -> None:
    """Test Redis connection is a singleton."""
    with patch("app.api.dependencies.Redis") as mock_redis:
        mock_instance = MagicMock()
        mock_redis.from_url.return_value = mock_instance

        conn1 = deps.get_redis_connection()
        conn2 = deps.get_redis_connection()

        assert conn1 is conn2
        mock_redis.from_url.assert_called_once()


def test_get_rq_queue_singleton() -> None:
    """Test RQ queue is a singleton."""
    with (
        patch("app.api.dependencies.Redis") as mock_redis,
        patch("app.api.dependencies.Queue") as mock_queue,
    ):
        mock_redis_instance = MagicMock()
        mock_queue_instance = MagicMock()
        mock_redis.from_url.return_value = mock_redis_instance
        mock_queue.return_value = mock_queue_instance

        queue1 = deps.get_rq_queue(mock_redis_instance)
        queue2 = deps.get_rq_queue(mock_redis_instance)

        assert queue1 is queue2
        mock_queue.assert_called_once()

        # Verify queue name
        call_args = mock_queue.call_args
        assert call_args[1]["name"] == "indexing"


def test_get_indexing_service_wiring() -> None:
    """Test IndexingService dependency wiring."""
    with (
        patch("app.api.dependencies.TextChunker"),
        patch("app.api.dependencies.EmbeddingService"),
        patch("app.api.dependencies.VectorStore"),
        patch("app.api.dependencies.BM25Engine"),
        patch("app.api.dependencies.IndexingService") as mock_indexing,
    ):
        mock_service = MagicMock()
        mock_indexing.return_value = mock_service

        chunker = deps.get_text_chunker()
        embedding = deps.get_embedding_service()
        vector_store = deps.get_vector_store()
        bm25 = deps.get_bm25_engine()

        deps.get_indexing_service(chunker, embedding, vector_store, bm25)

        # Verify dependencies were passed
        mock_indexing.assert_called_once_with(
            text_chunker=chunker,
            embedding_service=embedding,
            vector_store=vector_store,
            bm25_engine=bm25,
        )


def test_get_search_orchestrator_wiring() -> None:
    """Test SearchOrchestrator dependency wiring."""
    with (
        patch("app.api.dependencies.EmbeddingService"),
        patch("app.api.dependencies.VectorStore"),
        patch("app.api.dependencies.BM25Engine"),
        patch("app.api.dependencies.SearchOrchestrator") as mock_orchestrator,
    ):
        mock_orch = MagicMock()
        mock_orchestrator.return_value = mock_orch

        embedding = deps.get_embedding_service()
        vector_store = deps.get_vector_store()
        bm25 = deps.get_bm25_engine()

        deps.get_search_orchestrator(embedding, vector_store, bm25)

        # Verify dependencies were passed
        mock_orchestrator.assert_called_once()


@pytest.mark.asyncio
async def test_verify_api_secret_valid() -> None:
    """Test API secret verification with valid secret (Bearer format)."""
    with patch("app.api.dependencies.settings") as mock_settings:
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
    with patch("app.api.dependencies.settings") as mock_settings:
        mock_settings.api_secret = "correct-secret"

        with pytest.raises(HTTPException) as exc_info:
            await deps.verify_api_secret(authorization="Bearer wrong-secret")

        assert exc_info.value.status_code == 401
        assert "Invalid" in exc_info.value.detail
