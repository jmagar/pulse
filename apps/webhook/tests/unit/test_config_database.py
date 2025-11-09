"""Unit tests for database configuration."""

import os

import pytest

from app.config import settings


def test_database_url_from_env():
    """Test database_url can be loaded from environment."""
    # Set environment variable
    os.environ["SEARCH_BRIDGE_DATABASE_URL"] = "postgresql+asyncpg://test:pass@localhost/testdb"

    # Reload settings (this may need adjustment based on your config pattern)
    from app.config import Settings
    test_settings = Settings()

    assert test_settings.database_url == "postgresql+asyncpg://test:pass@localhost/testdb"

    # Cleanup
    del os.environ["SEARCH_BRIDGE_DATABASE_URL"]


def test_database_url_default():
    """Test database_url has a sensible default."""
    from app.config import Settings
    test_settings = Settings()

    assert "postgresql+asyncpg://" in test_settings.database_url
    assert test_settings.database_url is not None
