"""
Pydantic models for request/response validation.

These models define the API contract between Firecrawl and the Search Bridge.
"""

from enum import Enum
from typing import Annotated, Any, Literal

from pydantic import AliasChoices, BaseModel, Field


class SearchMode(str, Enum):
    """Search mode options."""

    HYBRID = "hybrid"  # Vector + BM25 with RRF fusion
    SEMANTIC = "semantic"  # Vector similarity only
    KEYWORD = "keyword"  # BM25 only
    BM25 = "bm25"  # Alias for keyword


class IndexDocumentRequest(BaseModel):
    """
    Document indexing request from Firecrawl.

    This matches the contract from Firecrawl's sendToSearchIndex transformer.
    """

    url: str = Field(description="Original URL")
    resolved_url: str = Field(alias="resolvedUrl", description="Final URL after redirects")
    title: str | None = Field(default=None, description="Page title")
    description: str | None = Field(default=None, description="Page description")
    markdown: str = Field(description="Markdown content (primary search content)")
    html: str = Field(description="Raw HTML content")
    status_code: int = Field(alias="statusCode", description="HTTP status code")
    gcs_path: str | None = Field(default=None, alias="gcsPath", description="GCS bucket path")
    screenshot_url: str | None = Field(
        default=None, alias="screenshotUrl", description="Screenshot URL"
    )
    language: str | None = Field(default=None, description="ISO language code (e.g., 'en')")
    country: str | None = Field(default=None, description="ISO country code (e.g., 'US')")
    is_mobile: bool | None = Field(
        default=False, alias="isMobile", description="Mobile device flag"
    )

    class Config:
        """Pydantic config."""

        populate_by_name = True


class IndexDocumentResponse(BaseModel):
    """Response for document indexing request."""

    job_id: str = Field(description="Background job ID")
    status: str = Field(default="queued", description="Job status")
    message: str = Field(description="Human-readable message")


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
    filters: SearchFilter | None = Field(default=None, description="Search filters")


class SearchResult(BaseModel):
    """Individual search result."""

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


class HealthStatus(BaseModel):
    """Health check status."""

    status: str = Field(description="Overall status")
    services: dict[str, str] = Field(description="Individual service statuses")
    timestamp: str = Field(description="Health check timestamp")


class IndexStats(BaseModel):
    """Index statistics."""

    total_documents: int = Field(description="Total indexed documents")
    total_chunks: int = Field(description="Total chunks")
    qdrant_points: int = Field(description="Total Qdrant points")
    bm25_documents: int = Field(description="Total BM25 documents")
    collection_name: str = Field(description="Qdrant collection name")


class FirecrawlDocumentMetadata(BaseModel):
    """Metadata object nested within Firecrawl document payloads."""

    url: str = Field(description="Document URL")
    title: str | None = Field(default=None, description="Document title")
    description: str | None = Field(default=None, description="Document description")
    status_code: int = Field(alias="statusCode", description="HTTP status code")
    content_type: str | None = Field(default=None, alias="contentType", description="Content type")
    scrape_id: str | None = Field(default=None, alias="scrapeId", description="Scrape ID")
    source_url: str | None = Field(default=None, alias="sourceURL", description="Source URL")
    proxy_used: str | None = Field(default=None, alias="proxyUsed", description="Proxy used")
    cache_state: str | None = Field(default=None, alias="cacheState", description="Cache state")
    cached_at: str | None = Field(default=None, alias="cachedAt", description="Cached timestamp")
    credits_used: int | None = Field(default=None, alias="creditsUsed", description="Credits used")
    language: str | None = Field(default=None, description="ISO language code")
    country: str | None = Field(default=None, description="ISO country code")

    class Config:
        """Pydantic config."""

        populate_by_name = True


class FirecrawlDocumentPayload(BaseModel):
    """Document payload from Firecrawl webhook data array."""

    markdown: str | None = Field(default=None, description="Markdown content")
    html: str | None = Field(default=None, description="HTML content")
    metadata: FirecrawlDocumentMetadata = Field(description="Document metadata")

    class Config:
        """Pydantic config."""

        populate_by_name = True


class FirecrawlWebhookBase(BaseModel):
    """Base schema shared across all Firecrawl webhook events."""

    success: bool = Field(description="Indicates whether the event succeeded")
    id: str = Field(
        validation_alias=AliasChoices("id", "jobId"),
        serialization_alias="id",
        description="Firecrawl job or crawl identifier",
    )
    metadata: dict[str, Any] = Field(
        default_factory=dict,
        description="Arbitrary metadata supplied by Firecrawl",
    )
    error: str | None = Field(
        default=None,
        description="Error message present when success is false",
    )


class FirecrawlPageEvent(FirecrawlWebhookBase):
    """Webhook event containing scraped page data."""

    type: Literal["crawl.page", "batch_scrape.page"]
    data: list[FirecrawlDocumentPayload] = Field(
        default_factory=list,
        description="Scraped documents included with the webhook",
    )


class FirecrawlLifecycleEvent(FirecrawlWebhookBase):
    """Webhook event describing crawl lifecycle state."""

    type: Literal[
        "crawl.started",
        "crawl.completed",
        "crawl.failed",
        "batch_scrape.started",
        "batch_scrape.completed",
        "extract.started",
        "extract.completed",
        "extract.failed",
    ]
    data: list[dict[str, Any]] = Field(
        default_factory=list,
        description="Lifecycle events typically omit data payload",
    )


FirecrawlWebhookEvent = Annotated[
    FirecrawlPageEvent | FirecrawlLifecycleEvent,
    Field(discriminator="type"),
]
