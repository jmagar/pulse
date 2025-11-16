"""
Pydantic schemas for /api/v2/scrape endpoint.

Request/response models matching the complete API specification.
"""
from typing import Any, Literal

from pydantic import BaseModel, Field, HttpUrl, field_validator


class BrowserAction(BaseModel):
    """Browser automation action schema."""

    type: Literal["wait", "click", "write", "press", "scroll", "screenshot", "scrape", "executeJavascript"]
    milliseconds: int | None = None
    selector: str | None = None
    text: str | None = None
    key: str | None = None
    direction: Literal["up", "down"] | None = None
    amount: int | None = None
    name: str | None = None
    script: str | None = None


class PDFParser(BaseModel):
    """PDF parsing configuration."""

    type: Literal["pdf"] = "pdf"
    maxPages: int | None = 100


class ScrapeRequest(BaseModel):
    """
    Request schema for /api/v2/scrape endpoint.

    Supports single URL, batch, and batch management commands.
    """

    # Command type
    command: Literal["start", "status", "cancel", "errors"] = "start"

    # Single URL scrape (command=start)
    url: HttpUrl | None = None
    timeout: int = Field(default=60000, ge=1000, le=300000)
    maxChars: int = Field(default=100000, ge=100, le=1000000)
    startIndex: int = Field(default=0, ge=0)
    resultHandling: Literal["saveOnly", "saveAndReturn", "returnOnly"] = "saveAndReturn"
    forceRescrape: bool = False
    cleanScrape: bool = True
    maxAge: int = Field(default=172800000, ge=0)  # 2 days default
    proxy: Literal["basic", "stealth", "auto"] = "auto"
    blockAds: bool = True
    headers: dict[str, str] | None = None
    waitFor: int | None = Field(default=None, ge=0, le=60000)
    includeTags: list[str] | None = None
    excludeTags: list[str] | None = None
    formats: list[str] = Field(default_factory=lambda: ["markdown", "html"])
    parsers: list[PDFParser] = Field(default_factory=list)
    onlyMainContent: bool = True
    actions: list[BrowserAction] | None = None
    extract: str | None = None  # Natural language extraction query

    # Batch scrape (command=start with urls)
    urls: list[HttpUrl] | None = None

    # Batch management (command=status/cancel/errors)
    jobId: str | None = None

    @field_validator("url", "urls", "jobId", mode="before")
    @classmethod
    def validate_command_params(cls, v, info):
        """Validate command-specific required parameters."""
        command = info.data.get("command", "start")
        field_name = info.field_name

        if command == "start":
            # Must have either url or urls
            if field_name in ("url", "urls"):
                url = info.data.get("url")
                urls = info.data.get("urls")
                if not url and not urls:
                    raise ValueError("Either 'url' or 'urls' is required for start command")
                if url and urls:
                    raise ValueError("Cannot specify both 'url' and 'urls'")
        elif command in ("status", "cancel", "errors"):
            # Must have jobId
            if field_name == "jobId" and not v:
                raise ValueError(f"'jobId' is required for {command} command")

        return v

    model_config = {"use_enum_values": True}


class SavedUris(BaseModel):
    """URIs for saved content tiers."""

    raw: str | None = None
    cleaned: str | None = None
    extracted: str | None = None


class ScrapeMetadata(BaseModel):
    """Metadata about scraped/saved content."""

    rawLength: int | None = None
    cleanedLength: int | None = None
    extractedLength: int | None = None
    wasTruncated: bool = False


class ScrapeData(BaseModel):
    """Response data for successful scrape."""

    # Common fields
    url: str | None = None
    source: str = "firecrawl"
    timestamp: str
    cached: bool = False
    cacheAge: int | None = None

    # Content (returnOnly, saveAndReturn)
    content: str | None = None
    contentType: str | None = "text/markdown"

    # Screenshot
    screenshot: str | None = None
    screenshotFormat: str | None = "image/png"

    # Saved URIs (saveOnly, saveAndReturn)
    savedUris: SavedUris | None = None
    metadata: ScrapeMetadata | None = None

    # saveOnly message
    message: str | None = None


class BatchData(BaseModel):
    """Response data for batch operations."""

    jobId: str
    status: str
    total: int | None = None
    completed: int | None = None
    creditsUsed: int | None = None
    expiresAt: str | None = None
    urls: int | None = None
    message: str


class BatchError(BaseModel):
    """Error details for batch errors command."""

    url: str
    error: str
    timestamp: str


class BatchErrorsData(BaseModel):
    """Response data for batch errors command."""

    jobId: str
    errors: list[BatchError]
    message: str


class ScrapeErrorDetail(BaseModel):
    """Error details for failed scrape."""

    message: str
    code: str
    url: str | None = None
    diagnostics: dict[str, Any] | None = None
    validationErrors: list[dict[str, str]] | None = None


class ScrapeResponse(BaseModel):
    """
    Response schema for /api/v2/scrape endpoint.

    Handles success/error responses for all command types.
    """

    success: bool
    command: str
    data: ScrapeData | BatchData | BatchErrorsData | None = None
    error: ScrapeErrorDetail | None = None
