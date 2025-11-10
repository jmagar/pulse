"""Integration tests for auto-watch creation from webhook handler."""

from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import AsyncMock, patch

import pytest

from app.models import FirecrawlPageEvent
from app.services.webhook_handlers import handle_firecrawl_event

if TYPE_CHECKING:
    from rq import Queue


@pytest.mark.asyncio
async def test_page_event_creates_watch(test_queue: Queue) -> None:
    """Verify watch is created after successful document indexing."""

    event = FirecrawlPageEvent(
        success=True,
        type="crawl.page",
        id="test-event-1",
        data=[
            {
                "markdown": "# Test Page\nContent here",
                "html": "<h1>Test Page</h1><p>Content here</p>",
                "metadata": {
                    "url": "https://example.com/test",
                    "title": "Test Page",
                    "status_code": 200,
                },
            }
        ],
    )

    with patch("app.services.webhook_handlers.create_watch_for_url") as mock_create_watch:
        mock_create_watch.return_value = AsyncMock()

        result = await handle_firecrawl_event(event, test_queue)

        assert result["status"] == "queued"
        assert result["queued_jobs"] == 1
        mock_create_watch.assert_called_once_with("https://example.com/test")


@pytest.mark.asyncio
async def test_page_event_watch_creation_failure_does_not_block(test_queue: Queue) -> None:
    """Verify indexing continues even if watch creation fails."""

    event = FirecrawlPageEvent(
        success=True,
        type="crawl.page",
        id="test-event-2",
        data=[
            {
                "markdown": "# Another Test\nMore content",
                "html": "<h1>Another Test</h1><p>More content</p>",
                "metadata": {
                    "url": "https://example.com/another",
                    "title": "Another Test",
                    "status_code": 200,
                },
            }
        ],
    )

    with patch("app.services.webhook_handlers.create_watch_for_url") as mock_create_watch:
        mock_create_watch.side_effect = Exception("Watch creation failed")

        # Should NOT raise exception
        result = await handle_firecrawl_event(event, test_queue)

        assert result["status"] == "queued"
        assert result["queued_jobs"] == 1
        assert len(result["job_ids"]) == 1
        mock_create_watch.assert_called_once_with("https://example.com/another")
