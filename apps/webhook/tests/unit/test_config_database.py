"""Unit tests for database configuration."""

import os


def test_database_url_from_env() -> None:
    """Test database_url can be loaded from environment."""
    test_url = "postgresql+asyncpg://test:pass@localhost/testdb"

    # Preserve existing value to avoid leaking changes between tests
    prev_value = os.environ.get("WEBHOOK_DATABASE_URL")
    os.environ["WEBHOOK_DATABASE_URL"] = test_url

    try:
        from config import Settings

        test_settings = Settings()

        assert test_settings.database_url == test_url
    finally:
        if prev_value is None:
            os.environ.pop("WEBHOOK_DATABASE_URL", None)
        else:
            os.environ["WEBHOOK_DATABASE_URL"] = prev_value


def test_database_url_default() -> None:
    """Test database_url has a sensible default."""
    from config import Settings

    test_settings = Settings()

    assert "postgresql+asyncpg://" in test_settings.database_url
    assert test_settings.database_url is not None
