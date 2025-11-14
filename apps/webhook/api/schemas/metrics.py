"""Response schemas for metrics API endpoints."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class OperationTimingSummary(BaseModel):
    """Summary of operation timings for a crawl."""

    chunking_ms: float = Field(0.0, description="Total chunking time in milliseconds")
    embedding_ms: float = Field(0.0, description="Total embedding time in milliseconds")
    qdrant_ms: float = Field(0.0, description="Total Qdrant indexing time in milliseconds")
    bm25_ms: float = Field(0.0, description="Total BM25 indexing time in milliseconds")


class PerPageMetric(BaseModel):
    """Per-page operation timing detail."""

    url: str | None = Field(None, description="Document URL")
    operation_type: str = Field(..., description="Operation type")
    operation_name: str = Field(..., description="Operation name")
    duration_ms: float = Field(..., description="Duration in milliseconds")
    success: bool = Field(..., description="Whether operation succeeded")
    timestamp: datetime = Field(..., description="When operation occurred")


class CrawlMetricsResponse(BaseModel):
    """Comprehensive metrics for a crawl session."""

    crawl_id: str = Field(..., description="Firecrawl crawl identifier")
    crawl_url: str = Field(..., description="Base URL that was crawled")
    status: str = Field(..., description="Crawl status")
    success: bool | None = Field(None, description="Whether crawl succeeded")

    started_at: datetime = Field(..., description="When crawl started")
    completed_at: datetime | None = Field(None, description="When crawl completed")
    duration_ms: float | None = Field(None, description="Crawl duration in milliseconds")
    e2e_duration_ms: float | None = Field(None, description="End-to-end duration from MCP")

    total_pages: int = Field(..., description="Total pages processed")
    pages_indexed: int = Field(..., description="Successfully indexed pages")
    pages_failed: int = Field(..., description="Failed pages")

    aggregate_timing: OperationTimingSummary = Field(..., description="Aggregate operation timings")

    per_page_metrics: list[PerPageMetric] | None = Field(None, description="Per-page details")

    error_message: str | None = Field(None, description="Error message if failed")
    extra_metadata: dict[str, Any] | None = Field(None, description="Additional metadata")


class CrawlListResponse(BaseModel):
    """List of recent crawl sessions."""

    crawls: list[CrawlMetricsResponse] = Field(..., description="List of crawl sessions")
    total: int = Field(..., description="Total number of crawls matching query")
