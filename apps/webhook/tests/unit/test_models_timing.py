"""Unit tests for timing models."""

from app.models.timing import OperationMetric, RequestMetric


def test_request_metric_creation():
    """Test RequestMetric model can be instantiated."""
    metric = RequestMetric(
        method="GET",
        path="/api/test",
        status_code=200,
        duration_ms=123.45,
        request_id="test-req-123",
    )

    assert metric.method == "GET"
    assert metric.path == "/api/test"
    assert metric.status_code == 200
    assert metric.duration_ms == 123.45
    assert metric.request_id == "test-req-123"


def test_request_metric_repr():
    """Test RequestMetric __repr__ is meaningful."""
    metric = RequestMetric(
        method="POST",
        path="/api/webhook",
        status_code=201,
        duration_ms=456.78,
    )

    repr_str = repr(metric)
    assert "RequestMetric" in repr_str
    assert "/api/webhook" in repr_str
    assert "456.78" in repr_str


def test_operation_metric_creation():
    """Test OperationMetric model can be instantiated."""
    metric = OperationMetric(
        operation_type="embedding",
        operation_name="embed_batch",
        duration_ms=892.45,
        success=True,
        request_id="test-req-123",
        job_id="test-job-456",
        document_url="https://example.com",
    )

    assert metric.operation_type == "embedding"
    assert metric.operation_name == "embed_batch"
    assert metric.duration_ms == 892.45
    assert metric.success is True
    assert metric.request_id == "test-req-123"
    assert metric.job_id == "test-job-456"
    assert metric.document_url == "https://example.com"


def test_operation_metric_repr():
    """Test OperationMetric __repr__ is meaningful."""
    metric = OperationMetric(
        operation_type="qdrant",
        operation_name="index_chunks",
        duration_ms=156.78,
        success=True,
    )

    repr_str = repr(metric)
    assert "OperationMetric" in repr_str
    assert "qdrant" in repr_str
    assert "index_chunks" in repr_str
    assert "156.78" in repr_str
