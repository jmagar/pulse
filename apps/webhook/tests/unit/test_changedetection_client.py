"""Tests for changedetection.io API client."""

from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from clients.changedetection import ChangeDetectionClient
from config import Settings
from tests.utils.db_fixtures import (  # noqa: F401
    cleanup_database_engine,
    initialize_test_database,
)
from tests.utils.service_endpoints import get_changedetection_base_url


def test_changedetection_config_defaults():
    """Test changedetection.io config has correct defaults."""
    settings = Settings()

    assert settings.changedetection_api_url == get_changedetection_base_url()
    assert settings.changedetection_api_key is None
    assert settings.changedetection_default_check_interval == 3600
    assert settings.changedetection_enable_auto_watch is True


def test_changedetection_config_override(monkeypatch):
    """Test WEBHOOK_* variables override defaults."""
    monkeypatch.setenv("WEBHOOK_CHANGEDETECTION_API_URL", "http://custom:8000")
    monkeypatch.setenv("WEBHOOK_CHANGEDETECTION_API_KEY", "test-key-123")
    monkeypatch.setenv("WEBHOOK_CHANGEDETECTION_CHECK_INTERVAL", "7200")
    monkeypatch.setenv("WEBHOOK_CHANGEDETECTION_ENABLE_AUTO_WATCH", "false")

    settings = Settings()

    assert settings.changedetection_api_url == "http://custom:8000"
    assert settings.changedetection_api_key == "test-key-123"
    assert settings.changedetection_default_check_interval == 7200
    assert settings.changedetection_enable_auto_watch is False


@pytest.mark.asyncio
async def test_create_watch_success():
    """Test successful watch creation."""
    client = ChangeDetectionClient(
        api_url="http://test:5000",
        api_key=None,
    )

    mock_response = {
        "uuid": "test-watch-uuid",
        "url": "https://example.com/test",
        "tag": "firecrawl-auto",
    }

    # Mock the get_watch_by_url to return None (no existing watch)
    with patch.object(client, "get_watch_by_url", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = None

        # Mock the AsyncClient context manager and post method
        mock_client_instance = AsyncMock()
        mock_response_obj = MagicMock()
        mock_response_obj.status_code = 201
        mock_response_obj.json.return_value = mock_response
        mock_response_obj.raise_for_status.return_value = None
        mock_client_instance.post.return_value = mock_response_obj

        # Mock the async context manager
        mock_async_client = AsyncMock()
        mock_async_client.__aenter__.return_value = mock_client_instance
        mock_async_client.__aexit__.return_value = AsyncMock()

        with patch("httpx.AsyncClient", return_value=mock_async_client):
            result = await client.create_watch(
                url="https://example.com/test",
                check_interval=3600,
                tag="firecrawl-auto",
            )

    assert result["uuid"] == "test-watch-uuid"
    assert result["url"] == "https://example.com/test"

    # Verify API call
    mock_client_instance.post.assert_called_once()
    call_args = mock_client_instance.post.call_args
    assert "https://example.com/test" in str(call_args.kwargs["json"])


@pytest.mark.asyncio
async def test_create_watch_duplicate_idempotent():
    """Test creating duplicate watch is idempotent."""
    client = ChangeDetectionClient(
        api_url="http://test:5000",
        api_key=None,
    )

    existing_watch_data = {
        "uuid": "existing-uuid",
        "url": "https://example.com/test",
    }

    # Mock get_watch_by_url to return existing watch
    with patch.object(client, "get_watch_by_url", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = existing_watch_data

        result = await client.create_watch(
            url="https://example.com/test",
            check_interval=3600,
        )

    assert result["uuid"] == "existing-uuid"
    assert result["url"] == "https://example.com/test"


@pytest.mark.asyncio
async def test_create_watch_api_error():
    """Test API error handling."""
    client = ChangeDetectionClient(
        api_url="http://test:5000",
        api_key=None,
    )

    # Mock get_watch_by_url to return None
    with patch.object(client, "get_watch_by_url", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = None

        # Mock AsyncClient to raise error when post is called
        mock_client_instance = AsyncMock()
        mock_client_instance.post.side_effect = httpx.HTTPError("API error")

        # Mock the async context manager
        mock_async_client = AsyncMock()
        mock_async_client.__aenter__.return_value = mock_client_instance
        # __aexit__ should return None to not suppress exceptions
        mock_async_client.__aexit__.return_value = None

        with patch("httpx.AsyncClient", return_value=mock_async_client):
            with pytest.raises(httpx.HTTPError):
                await client.create_watch(
                    url="https://example.com/test",
                    check_interval=3600,
                )


@pytest.mark.asyncio
async def test_get_watch_by_url():
    """Test fetching watch by URL."""
    client = ChangeDetectionClient(
        api_url="http://test:5000",
        api_key=None,
    )

    mock_watches = [
        {"uuid": "uuid-1", "url": "https://example.com/test"},
        {"uuid": "uuid-2", "url": "https://other.com"},
    ]

    # Mock AsyncClient context manager and get method
    mock_client_instance = AsyncMock()
    mock_response_obj = MagicMock()
    mock_response_obj.status_code = 200
    mock_response_obj.json.return_value = mock_watches
    mock_response_obj.raise_for_status.return_value = None
    mock_client_instance.get.return_value = mock_response_obj

    # Mock the async context manager
    mock_async_client = AsyncMock()
    mock_async_client.__aenter__.return_value = mock_client_instance
    mock_async_client.__aexit__.return_value = AsyncMock()

    with patch("httpx.AsyncClient", return_value=mock_async_client):
        result = await client.get_watch_by_url("https://example.com/test")

    assert result["uuid"] == "uuid-1"
    assert result["url"] == "https://example.com/test"


@pytest.mark.asyncio
async def test_get_watch_by_url_not_found():
    """Test fetching non-existent watch returns None."""
    client = ChangeDetectionClient(
        api_url="http://test:5000",
        api_key=None,
    )

    # Mock AsyncClient context manager and get method
    mock_client_instance = AsyncMock()
    mock_response_obj = MagicMock()
    mock_response_obj.status_code = 200
    mock_response_obj.json.return_value = []
    mock_response_obj.raise_for_status.return_value = None
    mock_client_instance.get.return_value = mock_response_obj

    # Mock the async context manager
    mock_async_client = AsyncMock()
    mock_async_client.__aenter__.return_value = mock_client_instance
    mock_async_client.__aexit__.return_value = AsyncMock()

    with patch("httpx.AsyncClient", return_value=mock_async_client):
        result = await client.get_watch_by_url("https://nonexistent.com")

    assert result is None
