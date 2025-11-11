"""Test changedetection configuration."""

from config import Settings
from tests.utils.db_fixtures import (  # noqa: F401
    cleanup_database_engine,
    initialize_test_database,
)
from tests.utils.service_endpoints import get_firecrawl_base_url


def test_firecrawl_api_url_default():
    """Test Firecrawl API URL has correct default."""
    settings = Settings()
    assert settings.firecrawl_api_url == get_firecrawl_base_url()


def test_firecrawl_api_key_default(monkeypatch):
    """Test Firecrawl API key has correct default."""
    monkeypatch.delenv("WEBHOOK_FIRECRAWL_API_KEY", raising=False)
    monkeypatch.delenv("FIRECRAWL_API_KEY", raising=False)

    settings = Settings()
    assert settings.firecrawl_api_key == "self-hosted-no-auth"


def test_webhook_firecrawl_override(monkeypatch):
    """Test WEBHOOK_* variables override defaults."""
    monkeypatch.setenv("WEBHOOK_FIRECRAWL_API_URL", "http://custom:8000")
    monkeypatch.setenv("WEBHOOK_FIRECRAWL_API_KEY", "custom-key")

    settings = Settings()

    assert settings.firecrawl_api_url == "http://custom:8000"
    assert settings.firecrawl_api_key == "custom-key"
