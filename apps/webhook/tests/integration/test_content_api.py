"""
Integration tests for content retrieval API.

Tests the /api/content endpoints for retrieving stored scraped content.
"""

from datetime import UTC, datetime

import pytest
from httpx import ASGITransport, AsyncClient

from domain.models import ScrapedContent
from main import app


@pytest.mark.asyncio
async def test_get_content_by_url(db_session, api_secret_header):
    """Test retrieving content by URL."""
    # Create test data
    content = ScrapedContent(
        crawl_session_id="test-session-123",
        url="https://example.com/test",
        source_url="https://example.com/test",
        content_source="firecrawl_scrape",
        markdown="# Test Content\n\nThis is a test.",
        html="<h1>Test Content</h1><p>This is a test.</p>",
        links=["https://example.com/link1"],
        screenshot=None,
        extra_metadata={"title": "Test Page", "statusCode": 200},
        content_hash="abc123",
    )
    db_session.add(content)
    await db_session.commit()

    # Call API
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(
            "/api/content/by-url",
            params={"url": "https://example.com/test"},
            headers=api_secret_header,
        )

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["url"] == "https://example.com/test"
    assert data[0]["markdown"] == "# Test Content\n\nThis is a test."
    assert data[0]["html"] == "<h1>Test Content</h1><p>This is a test.</p>"
    assert data[0]["crawl_session_id"] == "test-session-123"
    assert data[0]["metadata"]["title"] == "Test Page"


@pytest.mark.asyncio
async def test_get_content_by_url_not_found(api_secret_header):
    """Test 404 when URL has no content."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(
            "/api/content/by-url",
            params={"url": "https://nonexistent.com"},
            headers=api_secret_header,
        )

    assert response.status_code == 404
    assert "No content found" in response.json()["detail"]


@pytest.mark.asyncio
async def test_get_content_by_url_multiple_versions(db_session, api_secret_header):
    """Test retrieving multiple versions of same URL (newest first)."""
    # Create multiple versions
    for i in range(3):
        content = ScrapedContent(
            crawl_session_id=f"test-session-{i}",
            url="https://example.com/multi",
            source_url="https://example.com/multi",
            content_source="firecrawl_scrape",
            markdown=f"# Version {i}",
            html=f"<h1>Version {i}</h1>",
            links=None,
            screenshot=None,
            extra_metadata={"version": i},
            content_hash=f"hash{i}",
        )
        db_session.add(content)
    await db_session.commit()

    # Call API
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(
            "/api/content/by-url",
            params={"url": "https://example.com/multi", "limit": 10},
            headers=api_secret_header,
        )

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 3
    # Verify newest first ordering (descending created_at)
    assert data[0]["metadata"]["version"] == 2
    assert data[1]["metadata"]["version"] == 1
    assert data[2]["metadata"]["version"] == 0


@pytest.mark.asyncio
async def test_get_content_by_url_respects_limit(db_session, api_secret_header):
    """Test limit parameter for pagination."""
    # Create 5 versions
    for i in range(5):
        content = ScrapedContent(
            crawl_session_id=f"test-session-{i}",
            url="https://example.com/limit-test",
            source_url="https://example.com/limit-test",
            content_source="firecrawl_scrape",
            markdown=f"# Version {i}",
            html=None,
            links=None,
            screenshot=None,
            extra_metadata={},
            content_hash=f"hash{i}",
        )
        db_session.add(content)
    await db_session.commit()

    # Request only 2 results
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(
            "/api/content/by-url",
            params={"url": "https://example.com/limit-test", "limit": 2},
            headers=api_secret_header,
        )

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2


@pytest.mark.asyncio
async def test_get_content_by_session(db_session, api_secret_header):
    """Test retrieving all content for a session."""
    # Create content for session
    urls = [
        "https://example.com/page1",
        "https://example.com/page2",
        "https://example.com/page3",
    ]

    for url in urls:
        content = ScrapedContent(
            crawl_session_id="test-crawl-session",
            url=url,
            source_url=url,
            content_source="firecrawl_crawl",
            markdown=f"# Content for {url}",
            html=None,
            links=None,
            screenshot=None,
            extra_metadata={"url": url},
            content_hash=f"hash-{url}",
        )
        db_session.add(content)
    await db_session.commit()

    # Call API
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(
            "/api/content/by-session/test-crawl-session",
            headers=api_secret_header,
        )

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 3
    returned_urls = {item["url"] for item in data}
    assert returned_urls == set(urls)


@pytest.mark.asyncio
async def test_get_content_by_session_not_found(api_secret_header):
    """Test 404 when session has no content."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(
            "/api/content/by-session/nonexistent-session",
            headers=api_secret_header,
        )

    assert response.status_code == 404
    assert "No content found" in response.json()["detail"]


@pytest.mark.asyncio
async def test_content_api_requires_auth(db_session):
    """Test that content endpoints require authentication."""
    # Create test data
    content = ScrapedContent(
        crawl_session_id="test-session",
        url="https://example.com/auth-test",
        source_url="https://example.com/auth-test",
        content_source="firecrawl_scrape",
        markdown="# Auth Test",
        html=None,
        links=None,
        screenshot=None,
        extra_metadata={},
        content_hash="authhash",
    )
    db_session.add(content)
    await db_session.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Try without auth header
        response = await client.get(
            "/api/content/by-url",
            params={"url": "https://example.com/auth-test"},
        )

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_get_content_by_url_validates_limit(api_secret_header):
    """Test limit parameter validation."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Test limit too small
        response = await client.get(
            "/api/content/by-url",
            params={"url": "https://example.com/test", "limit": 0},
            headers=api_secret_header,
        )
    assert response.status_code == 422  # Validation error

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Test limit too large
        response = await client.get(
            "/api/content/by-url",
            params={"url": "https://example.com/test", "limit": 101},
            headers=api_secret_header,
        )
    assert response.status_code == 422  # Validation error
