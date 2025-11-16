"""Tests for configurable job timeout setting."""

from config import Settings


def test_default_indexing_job_timeout(monkeypatch):
    """Test default job timeout is 10 minutes."""
    # Ensure test mode is enabled to bypass secret validation
    monkeypatch.setenv("WEBHOOK_TEST_MODE", "true")
    monkeypatch.setenv("WEBHOOK_API_SECRET", "test-secret")
    monkeypatch.setenv("WEBHOOK_SECRET", "test-webhook-secret")
    settings = Settings()
    assert settings.indexing_job_timeout == "10m"


def test_custom_indexing_job_timeout(monkeypatch):
    """Test custom job timeout can be configured."""
    monkeypatch.setenv("WEBHOOK_TEST_MODE", "true")
    monkeypatch.setenv("WEBHOOK_API_SECRET", "test-secret")
    monkeypatch.setenv("WEBHOOK_SECRET", "test-webhook-secret")
    monkeypatch.setenv("WEBHOOK_INDEXING_JOB_TIMEOUT", "15m")
    settings = Settings()
    assert settings.indexing_job_timeout == "15m"


def test_indexing_job_timeout_validation(monkeypatch):
    """Test job timeout must be valid RQ format."""
    # Valid formats: "5m", "1h", "30s", "600"
    monkeypatch.setenv("WEBHOOK_TEST_MODE", "true")
    monkeypatch.setenv("WEBHOOK_API_SECRET", "test-secret")
    monkeypatch.setenv("WEBHOOK_SECRET", "test-webhook-secret")
    monkeypatch.setenv("WEBHOOK_INDEXING_JOB_TIMEOUT", "5m")
    settings = Settings()
    assert settings.indexing_job_timeout == "5m"
