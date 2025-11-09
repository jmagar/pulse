"""Integration tests for metrics API endpoints."""

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.mark.asyncio
async def test_get_request_metrics_unauthorized():
    """Test metrics endpoint requires authentication."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/metrics/requests")

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_get_request_metrics_authorized(api_secret_header):
    """Test metrics endpoint returns data with valid auth."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # First make a request to generate some metrics
        await client.get("/health")

        # Now query metrics
        response = await client.get(
            "/api/metrics/requests",
            headers=api_secret_header
        )

    assert response.status_code == 200
    data = response.json()
    assert "metrics" in data
    assert "summary" in data
    assert "total" in data


@pytest.mark.asyncio
async def test_get_operation_metrics_authorized(api_secret_header):
    """Test operations metrics endpoint returns data with valid auth."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(
            "/api/metrics/operations",
            headers=api_secret_header
        )

    assert response.status_code == 200
    data = response.json()
    assert "metrics" in data
    assert "summary_by_type" in data


@pytest.mark.asyncio
async def test_get_metrics_summary_authorized(api_secret_header):
    """Test summary endpoint returns data with valid auth."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(
            "/api/metrics/summary",
            headers=api_secret_header
        )

    assert response.status_code == 200
    data = response.json()
    assert "requests" in data
    assert "operations_by_type" in data
    assert "slowest_endpoints" in data
