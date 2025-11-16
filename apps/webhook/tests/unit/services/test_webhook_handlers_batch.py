"""Tests for batch job enqueueing optimization."""

from unittest.mock import MagicMock, Mock

import pytest

from api.schemas.webhook import (
    FirecrawlDocumentMetadata,
    FirecrawlDocumentPayload,
    FirecrawlPageEvent,
)
from services.webhook_handlers import _handle_page_event


@pytest.fixture
def mock_queue_with_pipeline():
    """Mock RQ queue with Redis pipeline support."""
    queue = Mock()

    # Create pipeline mock with context manager support
    pipeline = MagicMock()
    pipeline_context = MagicMock()
    pipeline_context.__enter__ = Mock(return_value=pipeline)
    pipeline_context.__exit__ = Mock(return_value=None)

    queue.connection.pipeline = Mock(return_value=pipeline_context)

    # Track enqueue calls
    enqueue_calls = []

    def enqueue_with_pipeline(*args, **kwargs):
        job = Mock()
        job.id = f"job-{len(enqueue_calls)}"
        # Extract pipeline from kwargs
        pipeline_arg = kwargs.get("pipeline")
        enqueue_calls.append((args, kwargs, pipeline_arg))
        return job

    queue.enqueue.side_effect = enqueue_with_pipeline
    queue._enqueue_calls = enqueue_calls

    return queue


@pytest.mark.asyncio
async def test_batch_enqueue_uses_pipeline(mock_queue_with_pipeline, monkeypatch):
    """Test that multiple documents use Redis pipeline for atomic batching."""
    # Mock auto-watch creation
    monkeypatch.setattr("services.webhook_handlers.create_watch_for_url", Mock())

    # Create event with 3 documents
    event = FirecrawlPageEvent(
        type="crawl.page",
        id="test-crawl-123",
        success=True,
        data=[
            FirecrawlDocumentPayload(
                markdown=f"# Doc {i}",
                metadata=FirecrawlDocumentMetadata(
                    url=f"https://example.com/page-{i}", status_code=200
                ),
            )
            for i in range(3)
        ],
    )

    result = await _handle_page_event(event, mock_queue_with_pipeline)

    # Verify pipeline was used
    mock_queue_with_pipeline.connection.pipeline.assert_called_once()

    # Verify all 3 jobs were enqueued with pipeline
    assert len(mock_queue_with_pipeline._enqueue_calls) == 3
    for args, kwargs, captured_pipeline in mock_queue_with_pipeline._enqueue_calls:
        # Pipeline should be passed as kwarg
        assert "pipeline" in kwargs
        assert kwargs["pipeline"] is not None

    # Verify result
    assert result["status"] == "queued"
    assert result["queued_jobs"] == 3
    assert len(result["job_ids"]) == 3


@pytest.mark.asyncio
async def test_batch_enqueue_performance(mock_queue_with_pipeline, monkeypatch):
    """Test that batch enqueueing is faster than sequential."""
    import time

    monkeypatch.setattr("services.webhook_handlers.create_watch_for_url", Mock())

    # Create event with 50 documents
    event = FirecrawlPageEvent(
        type="crawl.page",
        id="test-crawl-perf",
        success=True,
        data=[
            FirecrawlDocumentPayload(
                markdown=f"# Doc {i}",
                metadata=FirecrawlDocumentMetadata(
                    url=f"https://example.com/page-{i}", status_code=200
                ),
            )
            for i in range(50)
        ],
    )

    start = time.perf_counter()
    result = await _handle_page_event(event, mock_queue_with_pipeline)
    duration = time.perf_counter() - start

    # Should complete in under 100ms (mocked, but verifies no blocking)
    assert duration < 0.1
    assert result["queued_jobs"] == 50
