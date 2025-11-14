"""Unit tests for BatchWorker class."""

import asyncio
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from workers.batch_worker import BatchWorker


def test_batch_worker_processes_multiple_documents():
    """Test that BatchWorker processes multiple documents concurrently."""

    async def run_test():
        # Mock documents
        doc1 = {"url": "https://example.com/1", "markdown": "Content 1", "title": "Doc 1"}
        doc2 = {"url": "https://example.com/2", "markdown": "Content 2", "title": "Doc 2"}
        doc3 = {"url": "https://example.com/3", "markdown": "Content 3", "title": "Doc 3"}

        documents = [doc1, doc2, doc3]

        # Mock the async indexing function
        mock_results = [
            {"success": True, "url": "https://example.com/1", "chunks_indexed": 5},
            {"success": True, "url": "https://example.com/2", "chunks_indexed": 3},
            {"success": True, "url": "https://example.com/3", "chunks_indexed": 7},
        ]

        with patch("workers.batch_worker._index_document_async", new_callable=AsyncMock) as mock_index:
            mock_index.side_effect = mock_results

            # Create BatchWorker instance
            batch_worker = BatchWorker()

            # Execute batch processing
            results = await batch_worker.process_batch(documents)

            # Verify all documents were processed
            assert len(results) == 3
            assert mock_index.call_count == 3

            # Verify results match expected output
            assert results[0]["url"] == "https://example.com/1"
            assert results[0]["chunks_indexed"] == 5
            assert results[1]["url"] == "https://example.com/2"
            assert results[1]["chunks_indexed"] == 3
            assert results[2]["url"] == "https://example.com/3"
            assert results[2]["chunks_indexed"] == 7

    # Run async test in synchronous context
    asyncio.run(run_test())


def test_batch_worker_handles_partial_failures():
    """Test that BatchWorker continues processing even if some documents fail."""

    async def run_test():
        doc1 = {"url": "https://example.com/1", "markdown": "Content 1"}
        doc2 = {"url": "https://example.com/2", "markdown": "Content 2"}
        doc3 = {"url": "https://example.com/3", "markdown": "Content 3"}

        documents = [doc1, doc2, doc3]

        async def mock_index_side_effect(doc: dict[str, Any]) -> dict[str, Any]:
            if doc["url"] == "https://example.com/2":
                raise Exception("Indexing failed for doc 2")
            return {"success": True, "url": doc["url"], "chunks_indexed": 5}

        with patch("workers.batch_worker._index_document_async", new_callable=AsyncMock) as mock_index:
            mock_index.side_effect = mock_index_side_effect

            batch_worker = BatchWorker()
            results = await batch_worker.process_batch(documents)

            # Verify all documents were attempted
            assert len(results) == 3
            assert mock_index.call_count == 3

            # Verify success/failure status
            assert results[0]["success"] is True
            assert results[0]["url"] == "https://example.com/1"

            assert results[1]["success"] is False
            assert results[1]["url"] == "https://example.com/2"
            assert "error" in results[1]
            assert "Indexing failed for doc 2" in results[1]["error"]

            assert results[2]["success"] is True
            assert results[2]["url"] == "https://example.com/3"

    # Run async test in synchronous context
    asyncio.run(run_test())


def test_batch_worker_handles_empty_list():
    """Test that BatchWorker handles empty document list gracefully."""

    async def run_test():
        batch_worker = BatchWorker()
        results = await batch_worker.process_batch([])

        # Verify empty list returns empty results
        assert results == []

    # Run async test in synchronous context
    asyncio.run(run_test())


def test_batch_worker_preserves_document_order():
    """Test that BatchWorker returns results in same order as input documents."""

    async def run_test():
        documents = [
            {"url": f"https://example.com/{i}", "markdown": f"Content {i}"}
            for i in range(10)
        ]

        async def mock_index_with_delay(doc: dict[str, Any]) -> dict[str, Any]:
            # Add random delay to simulate varying processing times
            url_num = int(doc["url"].split("/")[-1])
            # Reverse order delays (last doc finishes first)
            await asyncio.sleep(0.01 * (10 - url_num))
            return {"success": True, "url": doc["url"], "chunks_indexed": url_num}

        with patch("workers.batch_worker._index_document_async", new_callable=AsyncMock) as mock_index:
            mock_index.side_effect = mock_index_with_delay

            batch_worker = BatchWorker()
            results = await batch_worker.process_batch(documents)

            # Verify order is preserved despite varying completion times
            assert len(results) == 10
            for i, result in enumerate(results):
                expected_url = f"https://example.com/{i}"
                assert result["url"] == expected_url
                assert result["chunks_indexed"] == i

    # Run async test in synchronous context
    asyncio.run(run_test())


def test_batch_worker_synchronous_wrapper():
    """Test that BatchWorker provides synchronous wrapper for RQ jobs."""
    doc1 = {"url": "https://example.com/1", "markdown": "Content 1", "title": "Doc 1"}
    doc2 = {"url": "https://example.com/2", "markdown": "Content 2", "title": "Doc 2"}

    documents = [doc1, doc2]

    # Mock the async batch processing method
    mock_results = [
        {"success": True, "url": "https://example.com/1", "chunks_indexed": 5},
        {"success": True, "url": "https://example.com/2", "chunks_indexed": 3},
    ]

    with patch("workers.batch_worker.BatchWorker.process_batch", new_callable=AsyncMock) as mock_batch:
        mock_batch.return_value = mock_results

        batch_worker = BatchWorker()

        # Execute synchronous wrapper
        results = batch_worker.process_batch_sync(documents)

        # Verify batch processing was called
        assert mock_batch.called
        mock_batch.assert_called_once_with(documents)

        # Verify results
        assert len(results) == 2
        assert results[0]["url"] == "https://example.com/1"
        assert results[0]["chunks_indexed"] == 5
        assert results[1]["url"] == "https://example.com/2"
        assert results[1]["chunks_indexed"] == 3


def test_batch_worker_logs_batch_metrics():
    """Test that BatchWorker logs batch processing metrics."""

    async def run_test():
        documents = [
            {"url": "https://example.com/1", "markdown": "Content 1"},
            {"url": "https://example.com/2", "markdown": "Content 2"},
            {"url": "https://example.com/3", "markdown": "Content 3"},
        ]

        # Mock results with one failure
        async def mock_index_side_effect(doc: dict[str, Any]) -> dict[str, Any]:
            if doc["url"] == "https://example.com/2":
                raise Exception("Indexing failed")
            return {"success": True, "url": doc["url"]}

        with patch("workers.batch_worker._index_document_async", new_callable=AsyncMock) as mock_index:
            mock_index.side_effect = mock_index_side_effect

            with patch("workers.batch_worker.logger") as mock_logger:
                batch_worker = BatchWorker()
                results = await batch_worker.process_batch(documents)

                # Verify logging calls
                # Should log start and completion with metrics
                assert mock_logger.info.call_count >= 2

                # Check for batch start log
                start_calls = [call for call in mock_logger.info.call_args_list
                              if "batch processing" in str(call).lower()]
                assert len(start_calls) > 0

                # Check for completion log with success/failure counts
                completion_calls = [call for call in mock_logger.info.call_args_list
                                  if "complete" in str(call).lower()]
                assert len(completion_calls) > 0

    # Run async test in synchronous context
    asyncio.run(run_test())
