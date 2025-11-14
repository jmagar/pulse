"""Unit tests for batch worker processing."""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from worker import process_batch_async


def test_process_batch_async_processes_multiple_documents():
    """Test that batch processing handles multiple documents concurrently."""

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

        with patch("worker._index_document_async", new_callable=AsyncMock) as mock_index:
            mock_index.side_effect = mock_results

            # Execute batch processing
            results = await process_batch_async(documents)

            # Verify all documents were processed
            assert len(results) == 3
            assert mock_index.call_count == 3

            # Verify results
            assert results[0]["url"] == "https://example.com/1"
            assert results[1]["url"] == "https://example.com/2"
            assert results[2]["url"] == "https://example.com/3"

    # Run async test in synchronous context
    asyncio.run(run_test())


def test_process_batch_async_handles_partial_failures():
    """Test that batch processing continues even if some documents fail."""

    async def run_test():
        doc1 = {"url": "https://example.com/1", "markdown": "Content 1"}
        doc2 = {"url": "https://example.com/2", "markdown": "Content 2"}
        doc3 = {"url": "https://example.com/3", "markdown": "Content 3"}

        documents = [doc1, doc2, doc3]

        async def mock_index_side_effect(doc):
            if doc["url"] == "https://example.com/2":
                raise Exception("Indexing failed")
            return {"success": True, "url": doc["url"], "chunks_indexed": 5}

        with patch("worker._index_document_async", new_callable=AsyncMock) as mock_index:
            mock_index.side_effect = mock_index_side_effect

            results = await process_batch_async(documents)

            # Verify all documents attempted
            assert len(results) == 3

            # Verify success/failure status
            assert results[0]["success"] is True
            assert results[1]["success"] is False
            assert results[1]["error"] is not None
            assert results[2]["success"] is True

    # Run async test in synchronous context
    asyncio.run(run_test())
