"""Tests for changedetection.io API client."""
import pytest
from app.config import Settings


def test_changedetection_config_defaults():
    """Test changedetection.io config has correct defaults."""
    settings = Settings()

    assert settings.changedetection_api_url == "http://firecrawl_changedetection:5000"
    assert settings.changedetection_api_key is None
    assert settings.changedetection_default_check_interval == 3600
    assert settings.changedetection_enable_auto_watch is True


def test_changedetection_config_override(monkeypatch):
    """Test WEBHOOK_* variables override defaults."""
    monkeypatch.setenv("WEBHOOK_CHANGEDETECTION_API_URL", "http://custom:8000")
    monkeypatch.setenv("WEBHOOK_CHANGEDETECTION_API_KEY", "test-key-123")
    monkeypatch.setenv("WEBHOOK_CHANGEDETECTION_CHECK_INTERVAL", "7200")
    monkeypatch.setenv("WEBHOOK_CHANGEDETECTION_ENABLE_AUTO_WATCH", "false")

    settings = Settings()

    assert settings.changedetection_api_url == "http://custom:8000"
    assert settings.changedetection_api_key == "test-key-123"
    assert settings.changedetection_default_check_interval == 7200
    assert settings.changedetection_enable_auto_watch is False
