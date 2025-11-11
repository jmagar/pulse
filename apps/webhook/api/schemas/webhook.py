"""Webhook payload schemas."""

from typing import Annotated, Any, Literal

from pydantic import AliasChoices, BaseModel, Field


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


class ChangeDetectionPayload(BaseModel):
    """Payload from changedetection.io webhook."""

    watch_id: str = Field(..., description="UUID of the watch")
    watch_url: str = Field(..., description="URL being monitored")
    watch_title: str | None = Field(None, description="Title of the watch")
    detected_at: str = Field(..., description="ISO timestamp of detection")
    diff_url: str | None = Field(None, description="URL to view diff")
    snapshot: str | None = Field(None, description="Current snapshot content")
