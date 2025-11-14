"""
SQLAlchemy models for timing metrics.

These models store performance metrics for all operations.
"""

from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import Boolean, DateTime, Float, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


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
    Tracks complete crawl lifecycle with aggregate metrics.

    Records lifecycle from crawl.started → crawl.completed and aggregates
    per-page operation metrics for holistic performance analysis.
    """
    __tablename__ = "crawl_sessions"
    __table_args__ = {"schema": "webhook"}

    # Primary key
    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)

    # Crawl identification
    crawl_id: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    crawl_url: Mapped[str] = mapped_column(String(500), nullable=False)

    # Lifecycle timestamps
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Status tracking
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="in_progress", index=True)
    success: Mapped[bool | None] = mapped_column(Boolean, nullable=True)

    # Page statistics
    total_pages: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    pages_indexed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    pages_failed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

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

    # Metadata
    extra_metadata: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=func.now())

    def __repr__(self) -> str:
        return f"<CrawlSession(crawl_id={self.crawl_id}, status={self.status}, pages={self.total_pages})>"
