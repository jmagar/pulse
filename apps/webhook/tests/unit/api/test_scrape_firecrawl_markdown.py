"""Test scrape endpoint uses Firecrawl markdown without re-processing."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from pydantic import HttpUrl

from api.routers.scrape import _handle_start_single_url
from api.schemas.scrape import ScrapeRequest


@pytest.mark.asyncio
async def test_scrape_uses_firecrawl_markdown_directly(db_session):
    """
    RED PHASE: Test that cleanScrape=true uses Firecrawl markdown without BeautifulSoup.

    This test will FAIL initially because current code calls processor.clean_content().
    """
    # Arrange: Mock Firecrawl response with markdown
    mock_fc_response = {
        "markdown": "# Clean Markdown\n\nNo HTML tags here.",
        "html": "<html><body><h1>Clean Markdown</h1><p>No HTML tags here.</p></body></html>",
        "screenshot": None,
    }

    # Create mock request (bypass validator issue)
    request = MagicMock(spec=ScrapeRequest)
    request.url = HttpUrl("https://example.com")
    request.command = "start"
    request.cleanScrape = True
    request.resultHandling = "returnOnly"
    request.forceRescrape = False
    request.maxAge = 172800000
    request.extract = None
    request.onlyMainContent = True
    request.includeTags = None
    request.excludeTags = None
    request.formats = ["markdown", "html"]

    # Act: Call scrape with mocked Firecrawl
    with patch(
        "api.routers.scrape._call_firecrawl_scrape", AsyncMock(return_value=mock_fc_response)
    ):
        with patch("api.routers.scrape.ScrapeCacheService") as mock_cache:
            mock_cache.return_value.get_cached_scrape = AsyncMock(return_value=None)

            response = await _handle_start_single_url(request, db_session)

    # Assert: Response contains Firecrawl markdown (not re-processed HTML)
    assert response.success is True
    assert response.data.content == "# Clean Markdown\n\nNo HTML tags here."
    assert response.data.contentType == "text/markdown"

    # Critical assertion: Verify we used Firecrawl markdown, not processed HTML
    # This ensures no BeautifulSoup/html2text processing occurred
    assert "<html>" not in response.data.content.lower()
    assert "<body>" not in response.data.content.lower()


@pytest.mark.asyncio
async def test_scrape_raw_html_when_clean_disabled(db_session):
    """
    RED PHASE: Test that cleanScrape=false returns raw HTML.

    This test will PASS initially, ensuring we don't break existing behavior.
    """
    mock_fc_response = {
        "html": "<html><body><h1>Raw HTML</h1></body></html>",
        "markdown": "# Raw HTML",
        "screenshot": None,
    }

    # Create mock request (bypass validator issue)
    request = MagicMock(spec=ScrapeRequest)
    request.url = HttpUrl("https://example.com")
    request.command = "start"
    request.cleanScrape = False
    request.resultHandling = "returnOnly"
    request.forceRescrape = False
    request.maxAge = 172800000
    request.extract = None
    request.onlyMainContent = True
    request.includeTags = None
    request.excludeTags = None
    request.formats = ["markdown", "html"]

    with patch(
        "api.routers.scrape._call_firecrawl_scrape", AsyncMock(return_value=mock_fc_response)
    ):
        with patch("api.routers.scrape.ScrapeCacheService") as mock_cache:
            mock_cache.return_value.get_cached_scrape = AsyncMock(return_value=None)

            response = await _handle_start_single_url(request, db_session)

    assert response.success is True
    assert response.data.content == "<html><body><h1>Raw HTML</h1></body></html>"
    assert response.data.contentType == "text/html"


@pytest.mark.asyncio
async def test_content_processor_not_imported():
    """
    RED PHASE: Test that ContentProcessorService is NOT imported.

    This test will FAIL initially because scrape.py imports it.
    """
    import api.routers.scrape as scrape_module

    # Assert: ContentProcessorService should not be in module namespace
    assert not hasattr(scrape_module, "ContentProcessorService")

    # Assert: No processor instance created
    # This will fail until we remove the instantiation
