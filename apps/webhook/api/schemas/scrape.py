"""
Pydantic schemas for /api/v2/scrape endpoint.

Request/response models matching the complete API specification.
"""
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field, HttpUrl, field_validator


class BrowserAction(BaseModel):
    """Browser automation action schema."""

    type: Literal["wait", "click", "write", "press", "scroll", "screenshot", "scrape", "executeJavascript"]
    milliseconds: Optional[int] = None
    selector: Optional[str] = None
    text: Optional[str] = None
    key: Optional[str] = None
    direction: Optional[Literal["up", "down"]] = None
    amount: Optional[int] = None
    name: Optional[str] = None
    script: Optional[str] = None


class PDFParser(BaseModel):
    """PDF parsing configuration."""

    type: Literal["pdf"] = "pdf"
    maxPages: Optional[int] = 100


class ScrapeRequest(BaseModel):
    """
    Request schema for /api/v2/scrape endpoint.

    Supports single URL, batch, and batch management commands.
    """

    # Command type
    command: Literal["start", "status", "cancel", "errors"] = "start"

    # Single URL scrape (command=start)
    url: Optional[HttpUrl] = None
    timeout: int = Field(default=60000, ge=1000, le=300000)
    maxChars: int = Field(default=100000, ge=100, le=1000000)
    startIndex: int = Field(default=0, ge=0)
    resultHandling: Literal["saveOnly", "saveAndReturn", "returnOnly"] = "saveAndReturn"
    forceRescrape: bool = False
    cleanScrape: bool = True
    maxAge: int = Field(default=172800000, ge=0)  # 2 days default
    proxy: Literal["basic", "stealth", "auto"] = "auto"
    blockAds: bool = True
    headers: Optional[dict[str, str]] = None
    waitFor: Optional[int] = Field(default=None, ge=0, le=60000)
    includeTags: Optional[list[str]] = None
    excludeTags: Optional[list[str]] = None
    formats: list[str] = Field(default_factory=lambda: ["markdown", "html"])
    parsers: list[PDFParser] = Field(default_factory=list)
    onlyMainContent: bool = True
    actions: Optional[list[BrowserAction]] = None
    extract: Optional[str] = None  # Natural language extraction query

    # Batch scrape (command=start with urls)
    urls: Optional[list[HttpUrl]] = None

    # Batch management (command=status/cancel/errors)
    jobId: Optional[str] = None

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

    raw: Optional[str] = None
    cleaned: Optional[str] = None
    extracted: Optional[str] = None


class ScrapeMetadata(BaseModel):
    """Metadata about scraped/saved content."""

    rawLength: Optional[int] = None
    cleanedLength: Optional[int] = None
    extractedLength: Optional[int] = None
    wasTruncated: bool = False


class ScrapeData(BaseModel):
    """Response data for successful scrape."""

    # Common fields
    url: Optional[str] = None
    source: str = "firecrawl"
    timestamp: str
    cached: bool = False
    cacheAge: Optional[int] = None

    # Content (returnOnly, saveAndReturn)
    content: Optional[str] = None
    contentType: Optional[str] = "text/markdown"

    # Screenshot
    screenshot: Optional[str] = None
    screenshotFormat: Optional[str] = "image/png"

    # Saved URIs (saveOnly, saveAndReturn)
    savedUris: Optional[SavedUris] = None
    metadata: Optional[ScrapeMetadata] = None

    # saveOnly message
    message: Optional[str] = None


class BatchData(BaseModel):
    """Response data for batch operations."""

    jobId: str
    status: str
    total: Optional[int] = None
    completed: Optional[int] = None
    creditsUsed: Optional[int] = None
    expiresAt: Optional[str] = None
    urls: Optional[int] = None
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
    url: Optional[str] = None
    diagnostics: Optional[dict[str, Any]] = None
    validationErrors: Optional[list[dict[str, str]]] = None


class ScrapeResponse(BaseModel):
    """
    Response schema for /api/v2/scrape endpoint.

    Handles success/error responses for all command types.
    """

    success: bool
    command: str
    data: Optional[ScrapeData | BatchData | BatchErrorsData] = None
    error: Optional[ScrapeErrorDetail] = None
