"""Tests for automatic watch creation service."""
import pytest
from unittest.mock import AsyncMock, patch
from app.services.auto_watch import create_watch_for_url
from app.clients.changedetection import ChangeDetectionClient


@pytest.mark.asyncio
async def test_create_watch_for_url_success():
    """Test successful watch creation for scraped URL."""
    with patch.object(ChangeDetectionClient, "create_watch", new_callable=AsyncMock) as mock_create:
        mock_create.return_value = {
            "uuid": "test-uuid",
            "url": "https://example.com/test",
        }

        result = await create_watch_for_url("https://example.com/test")

    assert result["uuid"] == "test-uuid"
    assert result["url"] == "https://example.com/test"

    mock_create.assert_called_once_with(
        url="https://example.com/test",
        check_interval=3600,
        tag="firecrawl-auto",
    )


@pytest.mark.asyncio
async def test_create_watch_for_url_disabled():
    """Test watch creation skipped when feature disabled."""
    with patch("app.services.auto_watch.settings") as mock_settings:
        mock_settings.changedetection_enable_auto_watch = False

        result = await create_watch_for_url("https://example.com/test")

    assert result is None


@pytest.mark.asyncio
async def test_create_watch_for_url_api_error():
    """Test graceful handling of API errors."""
    with patch.object(ChangeDetectionClient, "create_watch", new_callable=AsyncMock) as mock_create:
        mock_create.side_effect = Exception("API error")

        # Should not raise, just log error
        result = await create_watch_for_url("https://example.com/test")

    assert result is None


@pytest.mark.asyncio
async def test_create_watch_for_url_invalid_url():
    """Test handling of invalid URLs."""
    # Should not raise, just skip
    result = await create_watch_for_url("")
    assert result is None

    result = await create_watch_for_url("not-a-url")
    assert result is None
