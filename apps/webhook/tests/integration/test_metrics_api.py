"""Integration tests for metrics API endpoints."""

from datetime import UTC, datetime

import pytest
from httpx import ASGITransport, AsyncClient

from config import settings
from domain.models import CrawlSession
from main import app


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
        response = await client.get("/api/metrics/requests", headers=api_secret_header)

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
        response = await client.get("/api/metrics/operations", headers=api_secret_header)

    assert response.status_code == 200
    data = response.json()
    assert "metrics" in data
    assert "summary_by_type" in data


@pytest.mark.asyncio
async def test_get_metrics_summary_authorized(api_secret_header):
    """Test summary endpoint returns data with valid auth."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/metrics/summary", headers=api_secret_header)

    assert response.status_code == 200
    data = response.json()
    assert "requests" in data
    assert "operations_by_type" in data
    assert "slowest_endpoints" in data


@pytest.mark.asyncio
async def test_get_crawl_metrics_success(client: AsyncClient, db_session):
    """Test GET /api/metrics/crawls/{crawl_id} returns metrics."""
    # Create test session
    session = CrawlSession(
        job_id="api_test_crawl",
        base_url="https://example.com",
        operation_type="crawl",
        started_at=datetime.now(UTC),
        completed_at=datetime.now(UTC),
        status="completed",
        success=True,
        total_pages=5,
        pages_indexed=4,
        pages_failed=1,
        duration_ms=3000.0,
        total_embedding_ms=800.0,
        total_qdrant_ms=500.0,
    )
    db_session.add(session)
    await db_session.commit()

    # Request metrics
    headers = {"X-API-Secret": settings.api_secret}
    response = await client.get(
        "/api/metrics/crawls/api_test_crawl",
        headers=headers
    )

    assert response.status_code == 200
    data = response.json()
    assert data["crawl_id"] == "api_test_crawl"
    assert data["status"] == "completed"
    assert data["total_pages"] == 5
    assert data["aggregate_timing"]["embedding_ms"] == 800.0


@pytest.mark.asyncio
async def test_get_crawl_metrics_not_found(client: AsyncClient):
    """Test GET /api/metrics/crawls/{crawl_id} returns 404 for unknown crawl."""
    headers = {"X-API-Secret": settings.api_secret}
    response = await client.get(
        "/api/metrics/crawls/nonexistent_crawl",
        headers=headers
    )

    assert response.status_code == 404
