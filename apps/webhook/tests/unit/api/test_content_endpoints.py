"""
Unit tests for content retrieval API endpoints.

Tests the /api/content endpoints for retrieving stored scraped content by ID.
"""

import pytest
from datetime import datetime, UTC
from httpx import ASGITransport, AsyncClient

from domain.models import ScrapedContent, CrawlSession
from main import app
from config import settings


@pytest.mark.asyncio
async def test_get_content_by_id(db_session):
    """Test GET /api/content/{id} returns single content item."""
    # Create test crawl session (required for foreign key)
    session = CrawlSession(
        job_id="test-job",
        operation_type="scrape",
        base_url="https://example.com",
        status="completed",
        started_at=datetime.now(UTC),
    )
    db_session.add(session)
    await db_session.flush()

    # Create test content
    content = ScrapedContent(
        id=999,
        url="https://example.com/test",
        source_url="https://example.com/test",
        markdown="# Test Content",
        html="<h1>Test Content</h1>",
        content_source="firecrawl_scrape",
        content_hash="abc123",
        extra_metadata={"title": "Test Page"},
        crawl_session_id="test-job",
    )
    db_session.add(content)
    await db_session.commit()

    # Call endpoint
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(
            "/api/content/999",
            headers={"Authorization": f"Bearer {settings.api_secret}"}
        )

    # Verify response
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == 999
    assert data["url"] == "https://example.com/test"
    assert data["markdown"] == "# Test Content"
    assert data["html"] == "<h1>Test Content</h1>"
    assert data["crawl_session_id"] == "test-job"
    assert data["metadata"]["title"] == "Test Page"


@pytest.mark.asyncio
async def test_get_content_by_id_not_found(db_session):
    """Test GET /api/content/{id} returns 404 if content doesn't exist."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(
            "/api/content/99999",
            headers={"Authorization": f"Bearer {settings.api_secret}"}
        )

    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_get_content_by_id_requires_auth(db_session):
    """Test GET /api/content/{id} requires authentication."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/content/999")

    assert response.status_code == 401
