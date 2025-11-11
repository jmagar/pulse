"""Indexing-related API schemas."""

from pydantic import BaseModel, Field


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
