"""Unit tests for rescrape job."""

from datetime import UTC, datetime
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.jobs.rescrape import rescrape_changed_url
from app.models.timing import ChangeEvent


@pytest.mark.asyncio
async def test_rescrape_changed_url_success():
    """Test successful rescrape of changed URL."""
    # Mock change event with rich metadata
    mock_event = ChangeEvent(
        id=123,
        watch_id="test-watch",
        watch_url="https://example.com/test",
        detected_at=datetime.now(UTC),
        rescrape_status="queued",
        extra_metadata={
            "watch_title": "Test Watch",
            "signature": "sha256=abc123",
            "diff_size": 100,
            "raw_payload_version": "1.0",
            "detected_at": "2025-11-10T12:00:00Z",
            "webhook_received_at": "2025-11-10T12:00:01Z",
        },
    )

    # Mock database session
    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_event
    mock_session.execute.return_value = mock_result

    # Mock Firecrawl API response
    mock_firecrawl_response = {
        "success": True,
        "data": {
            "markdown": "# Test Page\nContent here",
            "html": "<html>...</html>",
            "metadata": {
                "title": "Test Page",
                "statusCode": 200,
            },
        },
    }

    with patch("app.jobs.rescrape.get_db_context") as mock_db_context:
        mock_db_context.return_value.__aenter__.return_value = mock_session

        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client_class.return_value.__aenter__.return_value = mock_client

            # Setup mock response
            mock_response = MagicMock()
            mock_response.json.return_value = mock_firecrawl_response
            mock_response.status_code = 200
            mock_client.post.return_value = mock_response

            # Mock indexing helper
            with patch(
                "app.jobs.rescrape._index_document_helper", new_callable=AsyncMock
            ) as mock_index:
                mock_index.return_value = "https://example.com/test"

                result = await rescrape_changed_url(123)

    assert result["status"] == "success"
    assert result["document_id"] == "https://example.com/test"
    assert result["url"] == "https://example.com/test"


@pytest.mark.asyncio
async def test_rescrape_changed_url_success_with_missing_fields():
    """Test rescrape succeeds when Firecrawl omits optional fields."""

    mock_event = ChangeEvent(
        id=456,
        watch_id="test-watch-missing",
        watch_url="https://example.com/missing",
        detected_at=datetime.now(UTC),
        rescrape_status="queued",
        extra_metadata={},
    )

    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_event
    mock_session.execute.return_value = mock_result

    mock_firecrawl_response = {
        "success": True,
        "data": {
            "markdown": "# Missing Fields\nThis page lacks optional fields.",
            # intentionally missing html/resolvedUrl/statusCode metadata
            "metadata": {
                "title": "Missing Fields",
                "description": "Testing fallback behaviour",
            },
        },
    }

    async def _fake_index(url: str, text: str, metadata: dict[str, Any]) -> str:
        assert metadata["resolved_url"] == mock_event.watch_url
        assert metadata["html"] == ""
        assert metadata["status_code"] == 200
        return url

    with patch("app.jobs.rescrape.get_db_context") as mock_db_context:
        mock_db_context.return_value.__aenter__.return_value = mock_session

        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client_class.return_value.__aenter__.return_value = mock_client

            mock_response = MagicMock()
            mock_response.json.return_value = mock_firecrawl_response
            mock_response.status_code = 200
            mock_client.post.return_value = mock_response

            with patch(
                "app.jobs.rescrape._index_document_helper",
                new_callable=AsyncMock,
            ) as mock_index:
                mock_index.side_effect = _fake_index

                result = await rescrape_changed_url(mock_event.id)

    assert result["status"] == "success"
    assert result["document_id"] == mock_event.watch_url
    assert result["url"] == mock_event.watch_url


@pytest.mark.asyncio
async def test_rescrape_changed_url_firecrawl_error():
    """Test rescrape handles Firecrawl API errors."""
    # Mock change event
    mock_event = ChangeEvent(
        id=123,
        watch_id="test-watch",
        watch_url="https://example.com/test",
        detected_at=datetime.now(UTC),
        rescrape_status="queued",
        extra_metadata={},
    )

    # Mock database session
    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_event
    mock_session.execute.return_value = mock_result

    with patch("app.jobs.rescrape.get_db_context") as mock_db_context:
        mock_db_context.return_value.__aenter__.return_value = mock_session

        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client_class.return_value.__aenter__.return_value = mock_client
            mock_client.post.side_effect = Exception("Firecrawl API error")

            with pytest.raises(Exception, match="Firecrawl API error"):
                await rescrape_changed_url(123)

    # Verify update was called to mark as failed
    assert mock_session.execute.called
    assert mock_session.commit.called


@pytest.mark.asyncio
async def test_rescrape_changed_url_not_found():
    """Test rescrape handles missing change event."""
    # Mock database session returning None (event not found)
    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_session.execute.return_value = mock_result

    with patch("app.jobs.rescrape.get_db_context") as mock_db_context:
        mock_db_context.return_value.__aenter__.return_value = mock_session

        with pytest.raises(ValueError, match="Change event .* not found"):
            await rescrape_changed_url(99999)
