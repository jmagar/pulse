"""
Integration tests for the API.

These tests require running services (Redis, Qdrant, TEI).
"""

from collections.abc import Generator
from typing import Any

import pytest
from fastapi.testclient import TestClient

from api.deps import get_search_orchestrator
from app.main import app


class StubSearchOrchestrator:
    """In-memory orchestrator used to avoid external services during tests."""

    async def search(
        self,
        query: str,
        mode: str,
        limit: int,
        **kwargs: Any,
    ) -> list[dict[str, Any]]:
        """Return deterministic search results for integration tests."""
        payload: dict[str, Any] = {
            "url": f"https://example.com/{mode}",
            "title": f"{mode.title()} Result",
            "description": f"Result for {query}",
            "text": f"{query} :: {mode}",
        }
        # Include filter echoes for coverage when filters are provided
        filters = kwargs.get("domain"), kwargs.get("language"), kwargs.get("country")
        if any(filters):
            payload["filters"] = {
                "domain": kwargs.get("domain"),
                "language": kwargs.get("language"),
                "country": kwargs.get("country"),
                "isMobile": kwargs.get("is_mobile"),
            }

        return [
            {
                "id": f"stub-{mode}",
                "score": 0.95,
                "payload": payload,
            }
        ]


@pytest.fixture(autouse=True)
def override_search_dependency() -> Generator[None]:
    """Override search orchestrator to avoid external network dependencies."""
    stub = StubSearchOrchestrator()
    app.dependency_overrides[get_search_orchestrator] = lambda: stub
    yield
    app.dependency_overrides.pop(get_search_orchestrator, None)


@pytest.fixture
def client() -> TestClient:
    """Create FastAPI test client."""
    return TestClient(app)


@pytest.fixture
def api_secret() -> str:
    """Get API secret from settings."""
    from app.config import settings

    return settings.api_secret


def test_root_endpoint(client: TestClient) -> None:
    """Test root endpoint."""
    response = client.get("/")

    assert response.status_code == 200
    data = response.json()
    assert data["service"] == "Firecrawl Search Bridge"
    assert data["version"] == "0.1.0"
    assert data["status"] == "running"


def test_health_endpoint(client: TestClient) -> None:
    """Test health check endpoint."""
    response = client.get("/health")

    assert response.status_code == 200
    data = response.json()

    assert "status" in data
    assert "services" in data
    assert "timestamp" in data

    # Should check all services
    assert "redis" in data["services"]
    assert "qdrant" in data["services"]
    assert "tei" in data["services"]


def test_stats_endpoint(client: TestClient) -> None:
    """Test stats endpoint."""
    response = client.get("/api/stats")

    assert response.status_code == 200
    data = response.json()

    assert "total_documents" in data
    assert "total_chunks" in data
    assert "qdrant_points" in data
    assert "bm25_documents" in data
    assert "collection_name" in data


def test_index_without_auth(client: TestClient) -> None:
    """Test index endpoint without authentication."""
    document = {
        "url": "https://example.com",
        "resolvedUrl": "https://example.com",
        "markdown": "# Test",
        "html": "<h1>Test</h1>",
        "statusCode": 200,
    }

    response = client.post("/api/index", json=document)

    # Should fail without API secret
    assert response.status_code == 401


def test_index_with_invalid_auth(client: TestClient) -> None:
    """Test index endpoint with invalid authentication."""
    document = {
        "url": "https://example.com",
        "resolvedUrl": "https://example.com",
        "markdown": "# Test",
        "html": "<h1>Test</h1>",
        "statusCode": 200,
    }

    response = client.post(
        "/api/index",
        json=document,
        headers={"Authorization": "Bearer wrong-secret"},
    )

    # Should fail with wrong secret
    assert response.status_code == 401


def test_index_with_valid_auth(client: TestClient, api_secret: str) -> None:
    """Test index endpoint with valid authentication."""
    document = {
        "url": "https://example.com/test",
        "resolvedUrl": "https://example.com/test",
        "title": "Test Page",
        "markdown": "# Test\n\nThis is a test document.",
        "html": "<h1>Test</h1><p>This is a test document.</p>",
        "statusCode": 200,
        "language": "en",
        "country": "US",
    }

    response = client.post(
        "/api/index",
        json=document,
        headers={"Authorization": f"Bearer {api_secret}"},
    )

    # Should accept and queue the job
    assert response.status_code == 202
    data = response.json()

    assert "job_id" in data
    assert data["status"] == "queued"
    assert "message" in data


def test_search_without_auth(client: TestClient) -> None:
    """Test search endpoint without authentication."""
    search_request = {
        "query": "test",
        "mode": "hybrid",
        "limit": 10,
    }

    response = client.post("/api/search", json=search_request)

    # Should fail without API secret
    assert response.status_code == 401


def test_search_with_valid_auth(client: TestClient, api_secret: str) -> None:
    """Test search endpoint with valid authentication."""
    search_request = {
        "query": "machine learning",
        "mode": "hybrid",
        "limit": 10,
    }

    response = client.post(
        "/api/search",
        json=search_request,
        headers={"Authorization": f"Bearer {api_secret}"},
    )

    # Should succeed (even with no results)
    assert response.status_code == 200
    data = response.json()

    assert "results" in data
    assert "total" in data
    assert "query" in data
    assert "mode" in data
    assert data["query"] == "machine learning"
    assert data["mode"] == "hybrid"


def test_search_all_modes(client: TestClient, api_secret: str) -> None:
    """Test search with all different modes."""
    modes = ["hybrid", "semantic", "keyword", "bm25"]

    for mode in modes:
        search_request = {
            "query": "test query",
            "mode": mode,
            "limit": 5,
        }

        response = client.post(
            "/api/search",
            json=search_request,
            headers={"Authorization": f"Bearer {api_secret}"},
        )

        assert response.status_code == 200, f"Mode {mode} failed"
        data = response.json()
        assert data["mode"] == mode


def test_search_with_filters(client: TestClient, api_secret: str) -> None:
    """Test search with filters."""
    search_request = {
        "query": "test",
        "mode": "hybrid",
        "limit": 10,
        "filters": {
            "domain": "example.com",
            "language": "en",
            "country": "US",
            "isMobile": False,
        },
    }

    response = client.post(
        "/api/search",
        json=search_request,
        headers={"Authorization": f"Bearer {api_secret}"},
    )

    assert response.status_code == 200
    data = response.json()
    assert "results" in data
