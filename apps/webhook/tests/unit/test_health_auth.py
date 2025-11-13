"""
Unit tests for authentication on health and stats endpoints.

Tests that health check and stats endpoints require API authentication.
These tests verify that the endpoints have authentication dependencies configured.
"""

import os
from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient

from api.deps import get_search_orchestrator
from main import app

# Skip database fixture for these lightweight unit tests
os.environ["WEBHOOK_SKIP_DB_FIXTURES"] = "1"


class StubSearchOrchestrator:
    """Stub orchestrator to avoid external dependencies."""

    async def search(self, query: str, mode: str, limit: int, **kwargs):
        """Return stub search results."""
        return [
            {
                "id": "stub-1",
                "score": 0.95,
                "payload": {
                    "url": "https://example.com/test",
                    "title": "Test Result",
                    "text": "Test content",
                },
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
    from config import settings

    return settings.api_secret


def test_health_endpoint_requires_auth_missing_header(client: TestClient) -> None:
    """Test that health endpoint rejects requests without Authorization header."""
    response = client.get("/health")

    assert response.status_code == 401
    data = response.json()
    assert "Missing Authorization header" in data["detail"]


def test_health_endpoint_requires_auth_invalid_token(client: TestClient) -> None:
    """Test that health endpoint rejects invalid API secret."""
    response = client.get(
        "/health",
        headers={"Authorization": "Bearer invalid-secret-token"},
    )

    assert response.status_code == 401
    data = response.json()
    assert "Invalid credentials" in data["detail"]


def test_health_endpoint_accepts_valid_bearer_token(
    client: TestClient, api_secret: str
) -> None:
    """Test that health endpoint accepts valid Bearer token authentication."""
    response = client.get(
        "/health",
        headers={"Authorization": f"Bearer {api_secret}"},
    )

    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert "services" in data


def test_health_endpoint_accepts_valid_raw_token(
    client: TestClient, api_secret: str
) -> None:
    """Test that health endpoint accepts raw token for backwards compatibility."""
    response = client.get(
        "/health",
        headers={"Authorization": api_secret},
    )

    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert "services" in data


def test_stats_endpoint_requires_auth_missing_header(client: TestClient) -> None:
    """Test that stats endpoint rejects requests without Authorization header."""
    response = client.get("/api/stats")

    assert response.status_code == 401
    data = response.json()
    assert "Missing Authorization header" in data["detail"]


def test_stats_endpoint_requires_auth_invalid_token(client: TestClient) -> None:
    """Test that stats endpoint rejects invalid API secret."""
    response = client.get(
        "/api/stats",
        headers={"Authorization": "Bearer invalid-secret-token"},
    )

    assert response.status_code == 401
    data = response.json()
    assert "Invalid credentials" in data["detail"]


def test_stats_endpoint_accepts_valid_bearer_token(
    client: TestClient, api_secret: str
) -> None:
    """Test that stats endpoint accepts valid Bearer token authentication."""
    response = client.get(
        "/api/stats",
        headers={"Authorization": f"Bearer {api_secret}"},
    )

    assert response.status_code == 200
    data = response.json()
    assert "total_documents" in data
    assert "total_chunks" in data


def test_stats_endpoint_accepts_valid_raw_token(
    client: TestClient, api_secret: str
) -> None:
    """Test that stats endpoint accepts raw token for backwards compatibility."""
    response = client.get(
        "/api/stats",
        headers={"Authorization": api_secret},
    )

    assert response.status_code == 200
    data = response.json()
    assert "total_documents" in data
    assert "total_chunks" in data
