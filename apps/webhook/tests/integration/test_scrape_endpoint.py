"""
Integration tests for /api/v2/scrape endpoint.

Tests the complete scrape pipeline: cache lookup, Firecrawl integration,
content processing, and cache storage.
"""

from collections.abc import Generator
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api import deps, router


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> Generator[TestClient]:
    """Provide a TestClient with authentication configured."""
    api_secret = "test-api-secret"
    monkeypatch.setattr(deps, "settings", SimpleNamespace(api_secret=api_secret))

    app = FastAPI()
    app.include_router(router)

    # No need to override dependencies - tests will mock at the service level

    test_client = TestClient(app)

    # Add auth header to all requests
    test_client.headers = {"Authorization": f"Bearer {api_secret}"}

    yield test_client
    app.dependency_overrides.clear()


def test_scrape_single_url_cache_miss(client: TestClient):
    """Should scrape, process, and cache a new URL."""
    with patch("api.routers.scrape.httpx.AsyncClient") as mock_httpx:
        # Mock Firecrawl API response
        mock_fc_response = AsyncMock()
        mock_fc_response.status_code = 200
        mock_fc_response.json.return_value = {
            "success": True,
            "data": {
                "markdown": "# Test Article\n\nContent here",
                "html": "<article><h1>Test Article</h1><p>Content here</p></article>",
                "metadata": {"title": "Test Article", "sourceURL": "https://example.com/article"},
            },
        }

        mock_fc_client = AsyncMock()
        mock_fc_client.post.return_value = mock_fc_response
        mock_fc_client.__aenter__.return_value = mock_fc_client
        mock_fc_client.__aexit__.return_value = None
        mock_httpx.return_value = mock_fc_client

        response = client.post(
            "/api/v2/scrape",
            json={
                "command": "start",
                "url": "https://example.com/article",
                "resultHandling": "saveAndReturn",
                "cleanScrape": True,
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["command"] == "start"
        assert data["data"]["url"] == "https://example.com/article"
        assert data["data"]["cached"] is False
        assert "content" in data["data"]
        assert "savedUris" in data["data"]
        assert "raw" in data["data"]["savedUris"]


def test_scrape_single_url_cache_hit(client: TestClient):
    """Should return cached content without hitting Firecrawl."""
    # First request to populate cache
    with patch("api.routers.scrape.httpx.AsyncClient") as mock_httpx:
        mock_fc_response = AsyncMock()
        mock_fc_response.status_code = 200
        mock_fc_response.json.return_value = {
            "success": True,
            "data": {
                "markdown": "# Cached Content",
                "html": "<h1>Cached Content</h1>",
                "metadata": {"title": "Cached"},
            },
        }

        mock_fc_client = AsyncMock()
        mock_fc_client.post.return_value = mock_fc_response
        mock_fc_client.__aenter__.return_value = mock_fc_client
        mock_fc_client.__aexit__.return_value = None
        mock_httpx.return_value = mock_fc_client

        client.post(
            "/api/v2/scrape",
            json={
                "command": "start",
                "url": "https://example.com/cached",
                "maxAge": 3600000,  # 1 hour
            },
        )

    # Second request should hit cache
    response = client.post(
        "/api/v2/scrape",
        json={"command": "start", "url": "https://example.com/cached", "maxAge": 3600000},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["data"]["cached"] is True
    assert data["data"]["url"] == "https://example.com/cached"


def test_scrape_force_rescrape_bypasses_cache(client: TestClient):
    """Should bypass cache when forceRescrape=true."""
    # First request to populate cache
    with patch("api.routers.scrape.httpx.AsyncClient") as mock_httpx:
        mock_fc_response = AsyncMock()
        mock_fc_response.status_code = 200
        mock_fc_response.json.return_value = {
            "success": True,
            "data": {
                "markdown": "# Fresh Content",
                "html": "<h1>Fresh Content</h1>",
                "metadata": {"title": "Fresh"},
            },
        }

        mock_fc_client = AsyncMock()
        mock_fc_client.post.return_value = mock_fc_response
        mock_fc_client.__aenter__.return_value = mock_fc_client
        mock_fc_client.__aexit__.return_value = None
        mock_httpx.return_value = mock_fc_client

        client.post(
            "/api/v2/scrape",
            json={"command": "start", "url": "https://example.com/force", "maxAge": 3600000},
        )

        # Force rescrape
        response = client.post(
            "/api/v2/scrape",
            json={"command": "start", "url": "https://example.com/force", "forceRescrape": True},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["data"]["cached"] is False


def test_scrape_return_only_mode(client: TestClient):
    """Should return content without saving to cache."""
    with patch("api.routers.scrape.httpx.AsyncClient") as mock_httpx:
        mock_fc_response = AsyncMock()
        mock_fc_response.status_code = 200
        mock_fc_response.json.return_value = {
            "success": True,
            "data": {"markdown": "# Return Only", "metadata": {"title": "Test"}},
        }

        mock_fc_client = AsyncMock()
        mock_fc_client.post.return_value = mock_fc_response
        mock_fc_client.__aenter__.return_value = mock_fc_client
        mock_fc_client.__aexit__.return_value = None
        mock_httpx.return_value = mock_fc_client

        response = client.post(
            "/api/v2/scrape",
            json={
                "command": "start",
                "url": "https://example.com/return-only",
                "resultHandling": "returnOnly",
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "content" in data["data"]
        assert "savedUris" not in data["data"]


def test_scrape_save_only_mode(client: TestClient):
    """Should save to cache without returning full content."""
    with patch("api.routers.scrape.httpx.AsyncClient") as mock_httpx:
        mock_fc_response = AsyncMock()
        mock_fc_response.status_code = 200
        mock_fc_response.json.return_value = {
            "success": True,
            "data": {"markdown": "# Save Only", "metadata": {"title": "Test"}},
        }

        mock_fc_client = AsyncMock()
        mock_fc_client.post.return_value = mock_fc_response
        mock_fc_client.__aenter__.return_value = mock_fc_client
        mock_fc_client.__aexit__.return_value = None
        mock_httpx.return_value = mock_fc_client

        response = client.post(
            "/api/v2/scrape",
            json={
                "command": "start",
                "url": "https://example.com/save-only",
                "resultHandling": "saveOnly",
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "savedUris" in data["data"]
        assert "content" not in data["data"]
        assert data["data"]["message"] == "Content saved to cache"


def test_scrape_with_extraction(client: TestClient):
    """Should raise error for deprecated extract parameter."""
    response = client.post(
        "/api/v2/scrape",
        json={
            "command": "start",
            "url": "https://example.com/extract",
            "extract": "extract the author name and publication date",
            "resultHandling": "returnOnly",
        },
    )

    # Extract parameter is now deprecated and should return 400 or 422
    # 400: HTTPException raised by our validation logic (detail is a string)
    # 422: Pydantic validation error if the field is rejected before reaching our code (detail is a list)
    assert response.status_code in (400, 422)
    data = response.json()

    # Handle both error formats
    detail = data["detail"]
    if isinstance(detail, str):
        # HTTP 400 - our custom validation error
        assert "extract" in detail.lower()
        assert "/v2/extract" in detail
    else:
        # HTTP 422 - Pydantic validation error (list of error objects)
        assert isinstance(detail, list)
        # Check that at least one error mentions "extract"
        error_messages = str(detail).lower()
        assert "extract" in error_messages


def test_scrape_batch_start(client: TestClient):
    """Should start batch scrape job."""
    with patch("api.routers.scrape.httpx.AsyncClient") as mock_httpx:
        mock_fc_response = AsyncMock()
        mock_fc_response.status_code = 200
        mock_fc_response.json.return_value = {
            "success": True,
            "id": "fc-batch-abc123",
            "url": "https://api.firecrawl.dev/v1/batch/scrape/fc-batch-abc123",
        }

        mock_fc_client = AsyncMock()
        mock_fc_client.post.return_value = mock_fc_response
        mock_fc_client.__aenter__.return_value = mock_fc_client
        mock_fc_client.__aexit__.return_value = None
        mock_httpx.return_value = mock_fc_client

        response = client.post(
            "/api/v2/scrape",
            json={
                "command": "start",
                "urls": [
                    "https://example.com/page1",
                    "https://example.com/page2",
                    "https://example.com/page3",
                ],
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["command"] == "start"
        assert data["data"]["jobId"] == "fc-batch-abc123"
        assert data["data"]["status"] == "scraping"
        assert data["data"]["urls"] == 3


def test_scrape_batch_status(client: TestClient):
    """Should get batch scrape status."""
    with patch("api.routers.scrape.httpx.AsyncClient") as mock_httpx:
        mock_fc_response = AsyncMock()
        mock_fc_response.status_code = 200
        mock_fc_response.json.return_value = {
            "success": True,
            "status": "scraping",
            "total": 25,
            "completed": 18,
            "creditsUsed": 54,
            "expiresAt": "2025-11-15T19:00:00Z",
        }

        mock_fc_client = AsyncMock()
        mock_fc_client.get.return_value = mock_fc_response
        mock_fc_client.__aenter__.return_value = mock_fc_client
        mock_fc_client.__aexit__.return_value = None
        mock_httpx.return_value = mock_fc_client

        response = client.post(
            "/api/v2/scrape", json={"command": "status", "jobId": "fc-batch-abc123"}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["command"] == "status"
        assert data["data"]["jobId"] == "fc-batch-abc123"
        assert data["data"]["completed"] == 18
        assert data["data"]["total"] == 25


def test_scrape_batch_cancel(client: TestClient):
    """Should cancel batch scrape job."""
    with patch("api.routers.scrape.httpx.AsyncClient") as mock_httpx:
        mock_fc_response = AsyncMock()
        mock_fc_response.status_code = 200
        mock_fc_response.json.return_value = {"success": True}

        mock_fc_client = AsyncMock()
        mock_fc_client.delete.return_value = mock_fc_response
        mock_fc_client.__aenter__.return_value = mock_fc_client
        mock_fc_client.__aexit__.return_value = None
        mock_httpx.return_value = mock_fc_client

        response = client.post(
            "/api/v2/scrape", json={"command": "cancel", "jobId": "fc-batch-abc123"}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["command"] == "cancel"
        assert data["data"]["status"] == "cancelled"


def test_scrape_validation_missing_url(client: TestClient):
    """Should return validation error for missing url."""
    response = client.post(
        "/api/v2/scrape",
        json={
            "command": "start"
            # Missing url
        },
    )

    assert response.status_code == 422  # Unprocessable Entity
    data = response.json()
    assert "detail" in data


def test_scrape_validation_invalid_command(client: TestClient):
    """Should return validation error for invalid command."""
    response = client.post(
        "/api/v2/scrape", json={"command": "invalid", "url": "https://example.com"}
    )

    assert response.status_code == 422
    data = response.json()
    assert "detail" in data


def test_scrape_firecrawl_error(client: TestClient):
    """Should handle Firecrawl API errors gracefully."""
    with patch("api.routers.scrape.httpx.AsyncClient") as mock_httpx:
        mock_fc_response = AsyncMock()
        mock_fc_response.status_code = 500
        mock_fc_response.text = "Internal Server Error"

        mock_fc_client = AsyncMock()
        mock_fc_client.post.return_value = mock_fc_response
        mock_fc_client.__aenter__.return_value = mock_fc_client
        mock_fc_client.__aexit__.return_value = None
        mock_httpx.return_value = mock_fc_client

        response = client.post(
            "/api/v2/scrape", json={"command": "start", "url": "https://example.com/error"}
        )

        assert response.status_code == 500
        data = response.json()
        assert data["success"] is False
        assert "error" in data


def test_scrape_unauthorized_missing_auth():
    """Should require authentication."""
    # Create client without auth header
    app = FastAPI()
    app.include_router(router)

    unauth_client = TestClient(app)
    response = unauth_client.post(
        "/api/v2/scrape", json={"command": "start", "url": "https://example.com"}
    )

    assert response.status_code == 401


def test_scrape_with_screenshots(client: TestClient):
    """Should handle screenshot format requests."""
    with patch("api.routers.scrape.httpx.AsyncClient") as mock_httpx:
        mock_fc_response = AsyncMock()
        mock_fc_response.status_code = 200
        # Base64 encoded 1x1 transparent PNG
        screenshot_data = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
        mock_fc_response.json.return_value = {
            "success": True,
            "data": {
                "markdown": "# Screenshot Test",
                "metadata": {"title": "Test"},
                "screenshot": screenshot_data,
            },
        }

        mock_fc_client = AsyncMock()
        mock_fc_client.post.return_value = mock_fc_response
        mock_fc_client.__aenter__.return_value = mock_fc_client
        mock_fc_client.__aexit__.return_value = None
        mock_httpx.return_value = mock_fc_client

        response = client.post(
            "/api/v2/scrape",
            json={
                "command": "start",
                "url": "https://example.com/screenshot",
                "formats": ["markdown", "screenshot"],
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        # Screenshot should be included in saved content
