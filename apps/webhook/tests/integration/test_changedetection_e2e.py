"""End-to-end test for changedetection.io integration."""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from domain.models import ChangeEvent


@pytest.mark.asyncio
async def test_changedetection_full_workflow(db_session):
    """
    Test complete workflow: webhook → database → rescrape → index.

    Simulates:
    1. changedetection.io detects change
    2. Sends webhook to bridge
    3. Bridge stores event and enqueues job
    4. Job rescraped URL via Firecrawl
    5. Content indexed in search
    """
    # Step 1: Create a change event directly in the database
    # (simulating what the webhook handler would do)
    change_event = ChangeEvent(
        watch_id="e2e-test-watch",
        watch_url="https://example.com/e2e-test",
        detected_at=datetime.fromisoformat("2025-11-10T12:00:00+00:00"),
        diff_summary="Changed content here for testing"[:500],
        snapshot_url="http://changedetection:5000/diff/e2e-test-watch",
        rescrape_status="queued",
        rescrape_job_id="test-job-123",
        extra_metadata={
            "watch_title": "E2E Test Watch",
            "webhook_received_at": datetime.now(UTC).isoformat(),
        },
    )

    db_session.add(change_event)
    await db_session.commit()
    await db_session.refresh(change_event)

    # Step 2: Verify event stored in database
    assert change_event.id is not None
    assert change_event.watch_id == "e2e-test-watch"
    assert change_event.watch_url == "https://example.com/e2e-test"
    assert change_event.rescrape_status == "queued"
    assert change_event.rescrape_job_id == "test-job-123"

    # Step 3: Simulate job execution with mocked external services
    # Mock Firecrawl API response
    mock_firecrawl_response = {
        "success": True,
        "data": {
            "markdown": "# E2E Test Page\nThis content was rescraped.",
            "html": "<html><body>E2E Test</body></html>",
            "metadata": {
                "title": "E2E Test Page",
                "statusCode": 200,
                "url": "https://example.com/e2e-test",
            },
        },
    }

    # Mock index_document_helper to avoid actual indexing
    with patch("app.jobs.rescrape._index_document_helper", new_callable=AsyncMock) as mock_index:
        mock_index.return_value = "https://example.com/e2e-test"

        with patch("httpx.AsyncClient") as mock_client_class:
            # Setup mock HTTP client
            mock_client = AsyncMock()
            mock_client_class.return_value.__aenter__.return_value = mock_client

            # Setup mock response
            mock_response = MagicMock()
            mock_response.json.return_value = mock_firecrawl_response
            mock_response.status_code = 200
            mock_response.raise_for_status = MagicMock()
            mock_client.post.return_value = mock_response

            # Execute the rescrape job
            from workers.jobs import rescrape_changed_url

            result = await rescrape_changed_url(change_event.id)

            assert result["status"] == "success"
            assert result["document_id"] == "https://example.com/e2e-test"
            assert result["url"] == "https://example.com/e2e-test"

            # Step 4: Verify event marked as completed
            await db_session.refresh(change_event)

            assert change_event.rescrape_status == "completed"
            assert change_event.indexed_at is not None
            assert change_event.extra_metadata["document_id"] == "https://example.com/e2e-test"

            # Step 5: Verify Firecrawl was called correctly
            mock_client.post.assert_called_once()
            call_args = mock_client.post.call_args
            assert "https://example.com/e2e-test" in str(call_args)
            assert call_args[0][0].endswith("/v1/scrape")  # First positional arg is URL

            # Step 6: Verify indexing was called
            mock_index.assert_called_once()
            index_args = mock_index.call_args.kwargs
            assert index_args["url"] == "https://example.com/e2e-test"
            assert "E2E Test Page" in index_args["text"]
            assert index_args["metadata"]["watch_id"] == "e2e-test-watch"
