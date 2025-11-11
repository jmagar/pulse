"""
Unit tests for worker.py
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.worker import index_document_job


@pytest.fixture
def sample_document_dict() -> dict[str, str | int]:
    """Sample document dictionary for job."""
    return {
        "url": "https://example.com",
        "resolvedUrl": "https://example.com",
        "title": "Test Page",
        "markdown": "# Test\n\nContent here.",
        "html": "<h1>Test</h1>",
        "statusCode": 200,
        "language": "en",
        "country": "US",
    }


def test_index_document_job_success(sample_document_dict: dict[str, str | int]) -> None:
    """Test successful job execution."""
    with (
        patch("app.worker.TextChunker") as mock_chunker_cls,
        patch("app.worker.EmbeddingService") as mock_embedding_cls,
        patch("app.worker.VectorStore") as mock_vector_store_cls,
        patch("app.worker.BM25Engine") as mock_bm25_cls,
        patch("app.worker.IndexingService") as mock_indexing_cls,
    ):
        # Setup mocks
        mock_indexing = AsyncMock()
        mock_indexing.index_document.return_value = {
            "success": True,
            "url": "https://example.com",
            "chunks_indexed": 5,
        }
        mock_indexing_cls.return_value = mock_indexing

        mock_vector_store = AsyncMock()
        mock_vector_store_cls.return_value = mock_vector_store

        mock_embedding = AsyncMock()
        mock_embedding_cls.return_value = mock_embedding

        # Execute job
        result = index_document_job(sample_document_dict)

        # Verify success
        assert result["success"] is True
        assert result["url"] == "https://example.com"
        assert result["chunks_indexed"] == 5

        # Verify services were initialized
        mock_chunker_cls.assert_called_once()
        mock_embedding_cls.assert_called_once()
        mock_vector_store_cls.assert_called_once()
        mock_bm25_cls.assert_called_once()

        # Verify collection creation
        mock_vector_store.ensure_collection.assert_called_once()

        # Verify indexing was called
        mock_indexing.index_document.assert_called_once()

        # Verify cleanup
        mock_embedding.close.assert_called_once()
        mock_vector_store.close.assert_called_once()


def test_index_document_job_document_parsing(sample_document_dict: dict[str, str | int]) -> None:
    """Test document dictionary is properly parsed to IndexDocumentRequest."""
    with (
        patch("app.worker.TextChunker"),
        patch("app.worker.EmbeddingService") as mock_embedding_cls,
        patch("app.worker.VectorStore") as mock_vector_store_cls,
        patch("app.worker.BM25Engine"),
        patch("app.worker.IndexingService") as mock_indexing_cls,
    ):
        mock_indexing = AsyncMock()
        mock_indexing.index_document.return_value = {"success": True, "url": "https://example.com"}
        mock_indexing_cls.return_value = mock_indexing

        mock_vector_store = AsyncMock()
        mock_vector_store_cls.return_value = mock_vector_store

        mock_embedding = AsyncMock()
        mock_embedding_cls.return_value = mock_embedding

        index_document_job(sample_document_dict)

        # Verify document was passed to indexing service
        call_args = mock_indexing.index_document.call_args
        document = call_args[0][0]

        assert document.url == "https://example.com"
        assert document.title == "Test Page"
        assert document.language == "en"


def test_index_document_job_indexing_failure() -> None:
    """Test job handles indexing failure gracefully."""
    document_dict: dict[str, str | int] = {
        "url": "https://example.com",
        "resolvedUrl": "https://example.com",
        "markdown": "Test",
        "html": "<p>Test</p>",
        "statusCode": 200,
    }

    with (
        patch("app.worker.TextChunker"),
        patch("app.worker.EmbeddingService") as mock_embedding_cls,
        patch("app.worker.VectorStore") as mock_vector_store_cls,
        patch("app.worker.BM25Engine"),
        patch("app.worker.IndexingService") as mock_indexing_cls,
    ):
        mock_vector_store = AsyncMock()
        mock_vector_store_cls.return_value = mock_vector_store

        mock_embedding = AsyncMock()
        mock_embedding_cls.return_value = mock_embedding

        # Setup failure - after services are created
        mock_indexing = AsyncMock()
        mock_indexing.index_document.side_effect = Exception("Indexing error")
        mock_indexing_cls.return_value = mock_indexing

        # Execute job
        result = index_document_job(document_dict)

        # Verify error is captured
        assert result["success"] is False
        assert result["url"] == "https://example.com"
        assert "error" in result
        assert "Indexing error" in result["error"]


def test_index_document_job_cleanup_on_error() -> None:
    """Test error is captured and returned."""
    document_dict: dict[str, str | int] = {
        "url": "https://example.com",
        "resolvedUrl": "https://example.com",
        "markdown": "Test",
        "html": "<p>Test</p>",
        "statusCode": 200,
    }

    with (
        patch("app.worker.TextChunker"),
        patch("app.worker.EmbeddingService") as mock_embedding_cls,
        patch("app.worker.VectorStore") as mock_vector_store_cls,
        patch("app.worker.BM25Engine"),
        patch("app.worker.IndexingService") as mock_indexing_cls,
    ):
        mock_embedding = AsyncMock()
        mock_embedding_cls.return_value = mock_embedding

        mock_vector_store = AsyncMock()
        mock_vector_store_cls.return_value = mock_vector_store

        mock_indexing = AsyncMock()
        mock_indexing.index_document.side_effect = RuntimeError("Test error")
        mock_indexing_cls.return_value = mock_indexing

        result = index_document_job(document_dict)

        # Verify error was captured in result
        assert result["success"] is False
        assert "error" in result


def test_run_worker() -> None:
    """Test worker initialization and execution."""
    with (
        patch("app.worker.Redis"),
        patch("app.worker.Worker") as mock_worker_cls,
        patch("app.worker._validate_external_services", new=AsyncMock(return_value=True)),
    ):
        mock_worker_instance = MagicMock()
        mock_worker_cls.return_value = mock_worker_instance

        from app.worker import run_worker

        # Mock worker.work() to raise KeyboardInterrupt immediately
        mock_worker_instance.work.side_effect = KeyboardInterrupt()

        # Should exit cleanly
        with pytest.raises(SystemExit) as exc_info:
            run_worker()

        assert exc_info.value.code == 0

        # Verify worker was created
        mock_worker_cls.assert_called_once()


def test_run_worker_error_handling() -> None:
    """Test worker handles exceptions."""
    with (
        patch("app.worker.Redis"),
        patch("app.worker.Worker") as mock_worker_cls,
        patch("app.worker._validate_external_services", new=AsyncMock(return_value=True)),
    ):
        mock_worker_instance = MagicMock()
        mock_worker_cls.return_value = mock_worker_instance

        from app.worker import run_worker

        # Mock worker.work() to raise exception
        mock_worker_instance.work.side_effect = RuntimeError("Worker error")

        # Should exit with error code
        with pytest.raises(SystemExit) as exc_info:
            run_worker()

        assert exc_info.value.code == 1


def test_run_worker_validation_failure() -> None:
    """Test worker exits when external services are unavailable."""
    with (
        patch("app.worker._validate_external_services", new=AsyncMock(return_value=False)),
        patch("app.worker.Redis") as mock_redis_cls,
        patch("app.worker.Worker") as mock_worker_cls,
    ):
        from app.worker import run_worker

        # Should exit with error code before attempting to start worker
        with pytest.raises(SystemExit) as exc_info:
            run_worker()

        assert exc_info.value.code == 1

        # Verify worker was never created due to validation failure
        mock_redis_cls.from_url.assert_not_called()
        mock_worker_cls.assert_not_called()
