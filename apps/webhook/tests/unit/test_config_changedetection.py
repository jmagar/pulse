"""Test changedetection configuration."""

import pytest
from app.config import Settings


def test_firecrawl_api_url_default():
    """Test Firecrawl API URL has correct default."""
    settings = Settings()
    assert settings.firecrawl_api_url == "http://firecrawl:3002"


def test_firecrawl_api_key_default():
    """Test Firecrawl API key has correct default."""
    settings = Settings()
    assert settings.firecrawl_api_key == "self-hosted-no-auth"


def test_webhook_firecrawl_override(monkeypatch):
    """Test WEBHOOK_* variables override defaults."""
    monkeypatch.setenv("WEBHOOK_FIRECRAWL_API_URL", "http://custom:8000")
    monkeypatch.setenv("WEBHOOK_FIRECRAWL_API_KEY", "custom-key")

    settings = Settings()

    assert settings.firecrawl_api_url == "http://custom:8000"
    assert settings.firecrawl_api_key == "custom-key"
