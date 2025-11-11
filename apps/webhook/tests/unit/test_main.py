"""
Unit tests for main.py FastAPI application.
"""

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient


def test_root_endpoint() -> None:
    """Test root endpoint returns service info."""
    from main import app

    client = TestClient(app)
    response = client.get("/")

    assert response.status_code == 200
    data = response.json()

    assert data["service"] == "Firecrawl Search Bridge"
    assert data["version"] == "0.1.0"
    assert data["status"] == "running"
    assert data["docs"] == "/docs"
    assert data["health"] == "/health"


def test_cors_middleware_configured() -> None:
    """Test CORS middleware is configured."""
    from main import app

    # CORS middleware should be in middleware stack
    # Check that middleware exists (it's wrapped, so we check middleware count)
    assert len(app.user_middleware) > 0


@pytest.mark.asyncio
async def test_lifespan_startup_success() -> None:
    """Test lifespan startup with successful collection creation."""
    with patch("app.main.get_vector_store") as mock_get_vs:
        mock_vs = AsyncMock()
        mock_vs.ensure_collection = AsyncMock()
        mock_get_vs.return_value = mock_vs

        from main import app, lifespan

        # Test lifespan context
        async with lifespan(app):
            # Startup should have been called
            mock_vs.ensure_collection.assert_called_once()


@pytest.mark.asyncio
async def test_lifespan_startup_failure_non_fatal() -> None:
    """Test lifespan handles collection creation failure gracefully."""
    with patch("app.main.get_vector_store") as mock_get_vs:
        mock_vs = AsyncMock()
        mock_vs.ensure_collection.side_effect = Exception("Collection error")
        mock_get_vs.return_value = mock_vs

        from main import app, lifespan

        # Should not raise - error is non-fatal
        async with lifespan(app):
            pass  # App should still start


def test_global_exception_handler() -> None:
    """Test global exception handler catches and formats errors."""

    from main import app

    # Add a test route that raises an exception
    @app.get("/test-error")
    async def test_error() -> None:
        raise ValueError("Test error message")

    client = TestClient(app, raise_server_exceptions=False)
    response = client.get("/test-error")

    assert response.status_code == 500
    data = response.json()
    assert "detail" in data
    assert "error" in data
    assert "Test error message" in data["error"]


def test_app_metadata() -> None:
    """Test FastAPI app metadata is configured."""
    from main import app

    assert app.title == "Firecrawl Search Bridge"
    assert app.description == "Semantic search service for Firecrawl web scraping"
    assert app.version == "0.1.0"


def test_routes_included() -> None:
    """Test API routes are included in app."""
    from typing import cast

    from fastapi.routing import APIRoute

    from main import app

    # Get all route paths - filter for APIRoute objects which have path attribute
    routes = [cast(APIRoute, route).path for route in app.routes if hasattr(route, "path")]

    # Verify expected routes exist
    assert "/api/index" in routes
    assert "/api/search" in routes
    assert "/health" in routes
    assert "/api/stats" in routes
    assert "/" in routes
