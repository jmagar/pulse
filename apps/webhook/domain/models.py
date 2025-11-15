"""
SQLAlchemy models for timing metrics.

These models store performance metrics for all operations.
"""

from datetime import datetime
from typing import TYPE_CHECKING, Any
from uuid import UUID, uuid4

from sqlalchemy import BigInteger, Boolean, DateTime, Float, ForeignKey, Integer, String, Text, TIMESTAMP, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

if TYPE_CHECKING:
    pass


class Base(DeclarativeBase):
    """Base class for all models."""

    pass


class RequestMetric(Base):
    """
    HTTP request-level timing metrics.

    Captures total request duration, endpoint information, and response status.
    """

    __tablename__ = "request_metrics"
    __table_args__ = {"schema": "webhook"}

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=func.now(), index=True
    )
    method: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    path: Mapped[str] = mapped_column(String(500), nullable=False, index=True)
    status_code: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    duration_ms: Mapped[float] = mapped_column(Float, nullable=False, index=True)
    request_id: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    client_ip: Mapped[str | None] = mapped_column(String(50), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(500), nullable=True)
    extra_metadata: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=func.now()
    )

    def __repr__(self) -> str:
        return f"<RequestMetric(path={self.path}, duration_ms={self.duration_ms}, status={self.status_code})>"


class OperationMetric(Base):
    """
    Operation-level timing metrics.

    Captures duration of specific operations like chunking, embedding generation,
    Qdrant indexing, and BM25 indexing.
    """

    __tablename__ = "operation_metrics"
    __table_args__ = {"schema": "webhook"}

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=func.now(), index=True
    )
    operation_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    operation_name: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    duration_ms: Mapped[float] = mapped_column(Float, nullable=False, index=True)
    success: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, index=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    request_id: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    job_id: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    crawl_id: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    document_url: Mapped[str | None] = mapped_column(String(500), nullable=True, index=True)
    extra_metadata: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=func.now()
    )

    def __repr__(self) -> str:
        return f"<OperationMetric(type={self.operation_type}, name={self.operation_name}, duration_ms={self.duration_ms})>"


class ChangeEvent(Base):
    """Model for tracking changedetection.io events."""

    __tablename__ = "change_events"
    __table_args__ = {"schema": "webhook"}

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    watch_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    watch_url: Mapped[str] = mapped_column(Text, nullable=False)
    detected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=func.now,
        index=True,
    )
    diff_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    snapshot_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    rescrape_job_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    rescrape_status: Mapped[str | None] = mapped_column(String(50), nullable=True)
    indexed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    extra_metadata: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=func.now,
    )

    def __repr__(self) -> str:
        return f"<ChangeEvent(watch_id={self.watch_id}, watch_url={self.watch_url}, status={self.rescrape_status})>"


class CrawlSession(Base):
    """
    Tracks complete Firecrawl operation lifecycle with aggregate metrics.

    Supports all Firecrawl v2 operations: scrape, batch scrape, crawl, map, search.
    Records lifecycle and aggregates per-page operation metrics for performance analysis.
    """
    __tablename__ = "crawl_sessions"
    __table_args__ = {"schema": "webhook"}

    # Primary key
    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)

    # Job identification (renamed from crawl_id for v2 API)
    job_id: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    base_url: Mapped[str] = mapped_column(String(500), nullable=False)

    # Operation type (scrape, scrape_batch, crawl, map, search, extract)
    operation_type: Mapped[str] = mapped_column(String(50), nullable=False)

    # Lifecycle timestamps
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Status tracking
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="in_progress", index=True)
    success: Mapped[bool | None] = mapped_column(Boolean, nullable=True)

    # Page statistics (for backward compatibility with old metrics)
    total_pages: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    pages_indexed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    pages_failed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # URL statistics (new for v2 API - supports all operation types)
    total_urls: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    completed_urls: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    failed_urls: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Aggregate timing in milliseconds
    total_chunking_ms: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    total_embedding_ms: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    total_qdrant_ms: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    total_bm25_ms: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    # Crawl duration
    duration_ms: Mapped[float | None] = mapped_column(Float, nullable=True)

    # End-to-end tracking
    initiated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    e2e_duration_ms: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Auto-indexing control
    auto_index: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # Job expiration
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Metadata
    extra_metadata: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=func.now(), onupdate=func.now())

    # Relationships
    scraped_contents: Mapped[list["ScrapedContent"]] = relationship(
        "ScrapedContent",
        back_populates="crawl_session",
        cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<CrawlSession(job_id={self.job_id}, operation={self.operation_type}, status={self.status}, urls={self.total_urls})>"


class ScrapedContent(Base):
    """Permanent storage of all Firecrawl scraped content."""

    __tablename__ = "scraped_content"
    __table_args__ = {"schema": "webhook"}

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)

    # Foreign key to crawl_sessions.job_id (String field, NOT UUID primary key)
    crawl_session_id: Mapped[str] = mapped_column(
        String(255),
        ForeignKey(
            "webhook.crawl_sessions.job_id",
            ondelete="CASCADE",
            name="fk_scraped_content_crawl_session"
        ),
        nullable=False
    )

    url: Mapped[str] = mapped_column(Text, nullable=False)
    source_url: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Use String instead of ENUM (no ENUMs in webhook schema)
    content_source: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        comment="firecrawl_scrape, firecrawl_crawl, firecrawl_map, firecrawl_batch"
    )

    # Content fields (NOTE: no raw_html - Firecrawl doesn't provide this)
    markdown: Mapped[str | None] = mapped_column(Text, nullable=True)
    html: Mapped[str | None] = mapped_column(Text, nullable=True)
    links: Mapped[dict | None] = mapped_column(
        JSONB(astext_type=Text()),
        nullable=True
    )
    screenshot: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Metadata from Firecrawl (statusCode, openGraph, dublinCore, etc.)
    # Note: Use "extra_metadata" attribute name since "metadata" is reserved by SQLAlchemy
    extra_metadata: Mapped[dict] = mapped_column(
        "metadata",  # Column name in database
        JSONB(astext_type=Text()),
        nullable=False,
        server_default="{}"
    )

    # Deduplication
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)

    # Timestamps (onupdate handles updated_at, no trigger needed)
    scraped_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=func.now()
    )
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now()
    )

    # Relationships
    crawl_session: Mapped["CrawlSession"] = relationship(
        "CrawlSession",
        back_populates="scraped_contents"
    )

    def __repr__(self) -> str:
        return f"<ScrapedContent(id={self.id}, url={self.url}, source={self.content_source})>"
