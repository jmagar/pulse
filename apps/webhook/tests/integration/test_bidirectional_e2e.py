"""End-to-end test for bidirectional Firecrawl ↔ changedetection.io flow."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from api.schemas.webhook import FirecrawlDocumentPayload, FirecrawlPageEvent
from services.webhook_handlers import _handle_page_event


@pytest.mark.asyncio
@pytest.mark.integration
async def test_bidirectional_workflow():
    """
    Test complete bidirectional workflow:

    1. Firecrawl scrapes URL
    2. Webhook bridge indexes content
    3. Auto-watch created in changedetection.io
    4. changedetection detects change (simulated)
    5. Webhook notifies bridge
    6. Rescrape job executed
    7. Content re-indexed

    This test verifies the full monitoring loop.
    """
    url = "https://example.com/bidirectional-test"

    # STEP 1-2: Firecrawl scrapes and webhook indexes
    event = FirecrawlPageEvent(
        success=True,
        type="crawl.page",
        id="e2e-test-event",
        data=[
            FirecrawlDocumentPayload(
                markdown="# Original Content",
                html="<h1>Original Content</h1>",
                metadata={"url": url, "statusCode": 200},
            )
        ],
    )

    mock_queue = MagicMock()
    mock_job = MagicMock()
    mock_job.id = "index-job-123"
    mock_queue.enqueue.return_value = mock_job

    # STEP 3: Auto-watch created
    with patch("services.auto_watch.ChangeDetectionClient") as mock_client_cls:
        mock_client_instance = mock_client_cls.return_value
        mock_client_instance.create_watch = AsyncMock(
            return_value={
                "uuid": "auto-watch-uuid",
                "url": url,
                "tag": "firecrawl-auto",
            }
        )

        result = await _handle_page_event(event, mock_queue)

    # Verify indexing job queued
    assert result["status"] == "queued"
    assert len(result["job_ids"]) == 1
    assert result["job_ids"][0] == "index-job-123"

    # Verify watch creation called
    mock_client_instance.create_watch.assert_called_once()
    call_kwargs = mock_client_instance.create_watch.call_args.kwargs
    assert call_kwargs["url"] == url
    assert call_kwargs["tag"] == "firecrawl-auto"

    # STEP 4-7: Change detected, rescrape triggered (tested in existing E2E test)
    # See apps/webhook/tests/integration/test_changedetection_e2e.py
    # This test focuses on the auto-watch creation part


@pytest.mark.asyncio
async def test_multiple_urls_create_multiple_watches():
    """Test that batch scrapes create watches for all URLs."""
    event = FirecrawlPageEvent(
        success=True,
        type="batch_scrape.page",
        id="batch-test",
        data=[
            FirecrawlDocumentPayload(
                markdown="# Page 1",
                html="<h1>Page 1</h1>",
                metadata={"url": "https://example.com/page1", "statusCode": 200},
            ),
            FirecrawlDocumentPayload(
                markdown="# Page 2",
                html="<h1>Page 2</h1>",
                metadata={"url": "https://example.com/page2", "statusCode": 200},
            ),
            FirecrawlDocumentPayload(
                markdown="# Page 3",
                html="<h1>Page 3</h1>",
                metadata={"url": "https://example.com/page3", "statusCode": 200},
            ),
        ],
    )

    mock_queue = MagicMock()
    mock_job = MagicMock()
    mock_queue.enqueue.return_value = mock_job

    with patch("services.auto_watch.ChangeDetectionClient") as mock_client_cls:
        mock_client_instance = mock_client_cls.return_value
        mock_client_instance.create_watch = AsyncMock(
            side_effect=[
                {"uuid": "watch-1", "url": "https://example.com/page1"},
                {"uuid": "watch-2", "url": "https://example.com/page2"},
                {"uuid": "watch-3", "url": "https://example.com/page3"},
            ]
        )

        result = await _handle_page_event(event, mock_queue)

    # Verify all URLs queued for indexing
    assert result["status"] == "queued"
    assert result["queued_jobs"] == 3

    # Verify watch created for each URL
    assert mock_client_instance.create_watch.call_count == 3

    calls = mock_client_instance.create_watch.call_args_list
    urls = [call.kwargs["url"] for call in calls]
    assert "https://example.com/page1" in urls
    assert "https://example.com/page2" in urls
    assert "https://example.com/page3" in urls
