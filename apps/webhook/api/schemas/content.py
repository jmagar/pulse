"""
Pydantic schemas for content retrieval API.

Defines response models for scraped content endpoints.
"""

from typing import Any

from pydantic import BaseModel


class ContentResponse(BaseModel):
    """
    Scraped content response.

    Returned by content retrieval endpoints to provide access to
    stored Firecrawl scraped content after 1-hour expiration.
    """

    id: int
    url: str
    source_url: str | None = None
    markdown: str | None
    html: str | None
    links: dict[str, Any] | None = None
    screenshot: str | None = None
    metadata: dict[str, Any]
    content_source: str
    scraped_at: str | None = None
    created_at: str | None = None
    crawl_session_id: str

    class Config:
        """Pydantic configuration."""

        from_attributes = True  # Allow SQLAlchemy model conversion
