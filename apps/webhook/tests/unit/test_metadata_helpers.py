"""Unit tests for metadata helper functions."""

from api.routers.webhook import _compute_diff_size, _extract_changedetection_metadata
from api.schemas.webhook import ChangeDetectionPayload


def test_compute_diff_size_with_content():
    """Test diff size computation with content."""
    snapshot = "This is test content"
    result = _compute_diff_size(snapshot)
    assert result == len(snapshot)
    assert result == 20


def test_compute_diff_size_with_none():
    """Test diff size computation with None."""
    result = _compute_diff_size(None)
    assert result == 0


def test_compute_diff_size_with_empty_string():
    """Test diff size computation with empty string."""
    result = _compute_diff_size("")
    assert result == 0


def test_extract_changedetection_metadata():
    """Test metadata extraction from changedetection payload."""
    payload = ChangeDetectionPayload(
        watch_id="test-watch-123",
        watch_url="https://example.com/test",
        watch_title="Test Watch",
        detected_at="2025-11-10T12:00:00Z",
        diff_url="http://changedetection:5000/diff/test-watch-123",
        snapshot="Test content here",
    )
    signature = "sha256=abc123def456"
    snapshot_size = 17

    result = _extract_changedetection_metadata(payload, signature, snapshot_size)

    assert result["watch_title"] == "Test Watch"
    assert "webhook_received_at" in result
    assert result["signature"] == signature
    assert result["diff_size"] == snapshot_size
    assert result["raw_payload_version"] == "1.0"
    assert result["detected_at"] == "2025-11-10T12:00:00Z"


def test_extract_changedetection_metadata_with_none_title():
    """Test metadata extraction when watch_title is None."""
    payload = ChangeDetectionPayload(
        watch_id="test-watch-123",
        watch_url="https://example.com/test",
        watch_title=None,
        detected_at="2025-11-10T12:00:00Z",
    )
    signature = "sha256=abc123"
    snapshot_size = 0

    result = _extract_changedetection_metadata(payload, signature, snapshot_size)

    assert result["watch_title"] is None
    assert result["signature"] == signature
    assert result["diff_size"] == 0
    assert result["raw_payload_version"] == "1.0"
