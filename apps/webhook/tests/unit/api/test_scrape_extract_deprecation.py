"""Test scrape endpoint routes extract requests to Firecrawl."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi import HTTPException
from pydantic import HttpUrl

from api.routers.scrape import _handle_start_single_url
from api.schemas.scrape import ScrapeRequest


@pytest.mark.asyncio
async def test_extract_parameter_raises_deprecation_error(db_session):
    """
    RED PHASE: Test that using extract parameter raises helpful error.

    Since Firecrawl /v2/extract already exists, we deprecate inline extraction.
    """
    # Create mock request (bypass validator issue)
    request = MagicMock(spec=ScrapeRequest)
    request.url = HttpUrl("https://example.com")
    request.command = "start"
    request.extract = "Extract author and date"
    request.resultHandling = "returnOnly"
    request.cleanScrape = True
    request.forceRescrape = False
    request.maxAge = 172800000
    request.onlyMainContent = True
    request.includeTags = None
    request.excludeTags = None
    request.formats = ["markdown", "html"]

    mock_fc_response = {
        "markdown": "# Article",
        "html": "<html><body><h1>Article</h1></body></html>",
    }

    with patch('api.routers.scrape._call_firecrawl_scrape', AsyncMock(return_value=mock_fc_response)):
        with patch('api.routers.scrape.ScrapeCacheService') as mock_cache:
            mock_cache.return_value.get_cached_scrape = AsyncMock(return_value=None)

            # Assert: Should raise HTTPException with helpful message
            with pytest.raises(HTTPException) as exc_info:
                await _handle_start_single_url(request, db_session)

            assert exc_info.value.status_code == 400
            assert "extract" in exc_info.value.detail.lower()
            assert "/v2/extract" in exc_info.value.detail


@pytest.mark.asyncio
async def test_scrape_without_extract_still_works(db_session):
    """
    CONTROL TEST: Ensure regular scraping still works without extract parameter.
    """
    # Create mock request (bypass validator issue)
    request = MagicMock(spec=ScrapeRequest)
    request.url = HttpUrl("https://example.com")
    request.command = "start"
    request.extract = None  # No extraction
    request.resultHandling = "returnOnly"
    request.cleanScrape = True
    request.forceRescrape = False
    request.maxAge = 172800000
    request.onlyMainContent = True
    request.includeTags = None
    request.excludeTags = None
    request.formats = ["markdown", "html"]

    mock_fc_response = {
        "markdown": "# Article",
        "html": "<html><body><h1>Article</h1></body></html>",
    }

    with patch('api.routers.scrape._call_firecrawl_scrape', AsyncMock(return_value=mock_fc_response)):
        with patch('api.routers.scrape.ScrapeCacheService') as mock_cache:
            mock_cache.return_value.get_cached_scrape = AsyncMock(return_value=None)

            response = await _handle_start_single_url(request, db_session)

    assert response.success is True
    # Should NOT raise exception
