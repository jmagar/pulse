"""Unit tests for Firecrawl webhook event handlers."""

from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from api.schemas.webhook import FirecrawlLifecycleEvent, FirecrawlPageEvent
from services import webhook_handlers as handlers


@pytest.mark.asyncio
async def test_handle_crawl_page_event(monkeypatch: pytest.MonkeyPatch) -> None:
    """crawl.page events should enqueue documents for indexing."""

    queue = MagicMock()
    job_mock = MagicMock(id="job-1")
    queue.enqueue.return_value = job_mock

    payload = {
        "success": True,
        "type": "crawl.page",
        "id": "crawl-1",
        "data": [
            {
                "markdown": "# Title",
                "html": "<h1>Title</h1>",
                "metadata": {
                    "url": "https://example.com",
                    "sourceURL": "https://example.com/final",
                    "title": "Example",
                    "description": "Example description",
                    "statusCode": 200,
                },
            }
        ],
    }

    event = FirecrawlPageEvent.model_validate(payload)
    result = await handlers.handle_firecrawl_event(event, queue)

    queue.enqueue.assert_called_once()
    args, kwargs = queue.enqueue.call_args
    assert args[0] == "worker.index_document_job"
    assert args[1]["url"] == "https://example.com"
    assert result["queued_jobs"] == 1
    assert result["job_ids"] == ["job-1"]


@pytest.mark.asyncio
async def test_handle_batch_scrape_page_event() -> None:
    """batch_scrape.page events queue all documents individually."""

    queue = MagicMock()
    queue.enqueue.side_effect = [MagicMock(id="job-a"), MagicMock(id="job-b")]

    payload = {
        "success": True,
        "type": "batch_scrape.page",
        "id": "batch-1",
        "data": [
            {
                "markdown": "A",
                "html": "<p>A</p>",
                "metadata": {
                    "url": "https://example.com/a",
                    "statusCode": 200,
                },
            },
            {
                "markdown": "B",
                "html": "<p>B</p>",
                "metadata": {
                    "url": "https://example.com/b",
                    "statusCode": 200,
                },
            },
        ],
    }

    event = FirecrawlPageEvent.model_validate(payload)
    result = await handlers.handle_firecrawl_event(event, queue)

    assert queue.enqueue.call_count == 2
    assert result["queued_jobs"] == 2
    assert result["job_ids"] == ["job-a", "job-b"]


@pytest.mark.asyncio
async def test_handle_crawl_started_event(monkeypatch: pytest.MonkeyPatch) -> None:
    """Lifecycle start events should log informational message."""

    logger_mock = MagicMock()
    monkeypatch.setattr(handlers, "logger", logger_mock)

    event = FirecrawlLifecycleEvent(
        success=True,
        type="crawl.started",
        id="crawl-2",
    )

    result = await handlers.handle_firecrawl_event(event, MagicMock())

    logger_mock.info.assert_called()
    assert result["status"] == "acknowledged"


@pytest.mark.asyncio
async def test_handle_crawl_completed_event(monkeypatch: pytest.MonkeyPatch) -> None:
    """Lifecycle completion events should log completion details."""

    logger_mock = MagicMock()
    monkeypatch.setattr(handlers, "logger", logger_mock)

    event = FirecrawlLifecycleEvent(
        success=True,
        type="crawl.completed",
        id="crawl-3",
        metadata={"documents": 5},
    )

    result = await handlers.handle_firecrawl_event(event, MagicMock())

    logger_mock.info.assert_called()
    assert result["status"] == "acknowledged"


@pytest.mark.asyncio
async def test_handle_crawl_failed_event(monkeypatch: pytest.MonkeyPatch) -> None:
    """Lifecycle failure events should log error details."""

    logger_mock = MagicMock()
    monkeypatch.setattr(handlers, "logger", logger_mock)

    event = FirecrawlLifecycleEvent(
        success=False,
        type="crawl.failed",
        id="crawl-4",
        error="Timeout",
        metadata={"retry": 1},
    )

    result = await handlers.handle_firecrawl_event(event, MagicMock())

    logger_mock.error.assert_called()
    assert result["status"] == "acknowledged"


@pytest.mark.asyncio
async def test_handle_extract_failed_event(monkeypatch: pytest.MonkeyPatch) -> None:
    """Extract failure events should log error details."""

    logger_mock = MagicMock()
    monkeypatch.setattr(handlers, "logger", logger_mock)

    event = FirecrawlLifecycleEvent(
        success=False,
        type="extract.failed",
        id="extract-1",
        error="Extractor crashed",
    )

    result = await handlers.handle_firecrawl_event(event, MagicMock())

    logger_mock.error.assert_called()
    assert result["status"] == "acknowledged"


@pytest.mark.asyncio
async def test_handle_unknown_event_type() -> None:
    """Unknown event types should raise handler error."""

    event = SimpleNamespace(
        success=True,
        type="unrecognized.event",
        id="x",
        data=[],
        metadata={},
        error=None,
    )

    with pytest.raises(handlers.WebhookHandlerError) as exc_info:
        await handlers.handle_firecrawl_event(event, MagicMock())

    assert exc_info.value.status_code == 400
    assert "Unsupported" in exc_info.value.detail
