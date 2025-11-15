"""Unit tests for metrics response schemas."""

from datetime import UTC, datetime

from api.schemas.metrics import (
    CrawlMetricsResponse,
    OperationTimingSummary,
)


def test_operation_timing_summary_defaults():
    """Test OperationTimingSummary has correct defaults."""
    summary = OperationTimingSummary()
    assert summary.chunking_ms == 0.0
    assert summary.embedding_ms == 0.0
    assert summary.qdrant_ms == 0.0
    assert summary.bm25_ms == 0.0


def test_crawl_metrics_response_complete():
    """Test CrawlMetricsResponse with all fields."""
    response = CrawlMetricsResponse(
        crawl_id="test_123",
        crawl_url="https://example.com",
        status="completed",
        success=True,
        started_at=datetime.now(UTC),
        completed_at=datetime.now(UTC),
        duration_ms=5000.0,
        total_pages=10,
        pages_indexed=9,
        pages_failed=1,
        aggregate_timing=OperationTimingSummary(
            chunking_ms=500.0,
            embedding_ms=1500.0,
        ),
    )

    assert response.crawl_id == "test_123"
    assert response.total_pages == 10
    assert response.aggregate_timing.chunking_ms == 500.0
