"""
Pydantic schemas for content retrieval API.

Defines response models for scraped content endpoints.
"""

from pydantic import BaseModel


class ContentResponse(BaseModel):
    """
    Scraped content response.

    Returned by content retrieval endpoints to provide access to
    stored Firecrawl scraped content after 1-hour expiration.
    """

    id: int
    url: str
    markdown: str | None
    html: str | None
    metadata: dict
    scraped_at: str
    crawl_session_id: str

    class Config:
        """Pydantic configuration."""

        from_attributes = True  # Allow SQLAlchemy model conversion
