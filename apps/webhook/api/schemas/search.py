"""Search-related API schemas."""

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class SearchMode(str, Enum):
    """Search mode options."""

    HYBRID = "hybrid"  # Vector + BM25 with RRF fusion
    SEMANTIC = "semantic"  # Vector similarity only
    KEYWORD = "keyword"  # BM25 only
    BM25 = "bm25"  # Alias for keyword


class SearchFilter(BaseModel):
    """Search filters."""

    domain: str | None = Field(default=None, description="Filter by domain")
    language: str | None = Field(default=None, description="Filter by language code")
    country: str | None = Field(default=None, description="Filter by country code")
    is_mobile: bool | None = Field(
        default=None, alias="isMobile", description="Filter by mobile flag"
    )

    class Config:
        """Pydantic config."""

        populate_by_name = True


class SearchRequest(BaseModel):
    """Search request."""

    query: str = Field(description="Search query text")
    mode: SearchMode = Field(default=SearchMode.HYBRID, description="Search mode")
    limit: int = Field(default=10, ge=1, le=100, description="Maximum results")
    offset: int = Field(default=0, ge=0, description="Zero-based pagination offset")
    filters: SearchFilter | None = Field(default=None, description="Search filters")


class SearchResult(BaseModel):
    """Individual search result."""

    id: int | str | None = Field(default=None, description="Content identifier if available")
    url: str = Field(description="Document URL")
    title: str | None = Field(description="Document title")
    description: str | None = Field(description="Document description")
    text: str = Field(description="Matched text snippet")
    score: float = Field(description="Relevance score")
    metadata: dict[str, Any] = Field(default_factory=dict, description="Additional metadata")


class SearchResponse(BaseModel):
    """Search response."""

    results: list[SearchResult] = Field(description="Search results")
    total: int = Field(description="Total number of results")
    query: str = Field(description="Original query")
    mode: SearchMode = Field(description="Search mode used")
