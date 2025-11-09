"""Unit tests for configuration variable fallback behavior."""

import os

import pytest

from app.config import Settings


def test_webhook_database_url_fallback() -> None:
    """Test database_url fallback: WEBHOOK_DATABASE_URL -> DATABASE_URL -> SEARCH_BRIDGE_DATABASE_URL."""
    env_keys = [
        "WEBHOOK_DATABASE_URL",
        "DATABASE_URL",
        "SEARCH_BRIDGE_DATABASE_URL",
        "WEBHOOK_API_SECRET",
        "WEBHOOK_SECRET",
    ]
    backups = {key: os.environ.pop(key, None) for key in env_keys}

    try:
        # Required fields
        os.environ["WEBHOOK_API_SECRET"] = "test"
        os.environ["WEBHOOK_SECRET"] = "test-webhook-secret-123456"

        # Test 1: WEBHOOK_DATABASE_URL (highest priority)
        os.environ["WEBHOOK_DATABASE_URL"] = "postgresql+asyncpg://webhook:pass@webhook-db:5432/webhook"
        os.environ["DATABASE_URL"] = "postgresql+asyncpg://shared:pass@shared-db:5432/shared"
        os.environ["SEARCH_BRIDGE_DATABASE_URL"] = "postgresql+asyncpg://legacy:pass@legacy-db:5432/legacy"

        settings = Settings(_env_file=None)
        assert settings.database_url == "postgresql+asyncpg://webhook:pass@webhook-db:5432/webhook"

        # Test 2: DATABASE_URL fallback (shared infrastructure)
        del os.environ["WEBHOOK_DATABASE_URL"]
        from importlib import reload
        import app.config
        reload(app.config)
        Settings2 = app.config.Settings
        settings2 = Settings2(_env_file=None)
        assert settings2.database_url == "postgresql+asyncpg://shared:pass@shared-db:5432/shared"

        # Test 3: SEARCH_BRIDGE_DATABASE_URL fallback (legacy naming)
        del os.environ["DATABASE_URL"]
        reload(app.config)
        Settings3 = app.config.Settings
        settings3 = Settings3(_env_file=None)
        assert settings3.database_url == "postgresql+asyncpg://legacy:pass@legacy-db:5432/legacy"

    finally:
        for key, value in backups.items():
            if value is not None:
                os.environ[key] = value
            else:
                os.environ.pop(key, None)


def test_webhook_redis_url_fallback() -> None:
    """Test redis_url fallback: WEBHOOK_REDIS_URL -> REDIS_URL -> SEARCH_BRIDGE_REDIS_URL."""
    env_keys = [
        "WEBHOOK_REDIS_URL",
        "REDIS_URL",
        "SEARCH_BRIDGE_REDIS_URL",
        "WEBHOOK_API_SECRET",
        "WEBHOOK_SECRET",
    ]
    backups = {key: os.environ.pop(key, None) for key in env_keys}

    try:
        # Required fields
        os.environ["WEBHOOK_API_SECRET"] = "test"
        os.environ["WEBHOOK_SECRET"] = "test-webhook-secret-123456"

        # Test 1: WEBHOOK_REDIS_URL (highest priority)
        os.environ["WEBHOOK_REDIS_URL"] = "redis://webhook-redis:6379"
        os.environ["REDIS_URL"] = "redis://shared-redis:6379"
        os.environ["SEARCH_BRIDGE_REDIS_URL"] = "redis://legacy-redis:6379"

        settings = Settings(_env_file=None)
        assert settings.redis_url == "redis://webhook-redis:6379"

        # Test 2: REDIS_URL fallback (shared infrastructure)
        del os.environ["WEBHOOK_REDIS_URL"]
        from importlib import reload
        import app.config
        reload(app.config)
        Settings2 = app.config.Settings
        settings2 = Settings2(_env_file=None)
        assert settings2.redis_url == "redis://shared-redis:6379"

        # Test 3: SEARCH_BRIDGE_REDIS_URL fallback (legacy naming)
        del os.environ["REDIS_URL"]
        reload(app.config)
        Settings3 = app.config.Settings
        settings3 = Settings3(_env_file=None)
        assert settings3.redis_url == "redis://legacy-redis:6379"

    finally:
        for key, value in backups.items():
            if value is not None:
                os.environ[key] = value
            else:
                os.environ.pop(key, None)


def test_legacy_search_bridge_variables_work() -> None:
    """Test that all legacy SEARCH_BRIDGE_* variables still work."""
    env_keys = [
        "SEARCH_BRIDGE_API_SECRET",
        "SEARCH_BRIDGE_WEBHOOK_SECRET",
        "SEARCH_BRIDGE_HOST",
        "SEARCH_BRIDGE_PORT",
        "SEARCH_BRIDGE_REDIS_URL",
        "SEARCH_BRIDGE_DATABASE_URL",
        "SEARCH_BRIDGE_QDRANT_URL",
        "SEARCH_BRIDGE_TEI_URL",
    ]
    backups = {key: os.environ.pop(key, None) for key in env_keys}

    try:
        os.environ["SEARCH_BRIDGE_API_SECRET"] = "legacy-api-secret"
        os.environ["SEARCH_BRIDGE_WEBHOOK_SECRET"] = "legacy-webhook-secret-123456"
        os.environ["SEARCH_BRIDGE_HOST"] = "legacy-host"
        os.environ["SEARCH_BRIDGE_PORT"] = "9999"
        os.environ["SEARCH_BRIDGE_REDIS_URL"] = "redis://legacy:6379"
        os.environ["SEARCH_BRIDGE_DATABASE_URL"] = "postgresql+asyncpg://legacy:pass@legacy:5432/db"
        os.environ["SEARCH_BRIDGE_QDRANT_URL"] = "http://legacy-qdrant:6333"
        os.environ["SEARCH_BRIDGE_TEI_URL"] = "http://legacy-tei:80"

        settings = Settings(_env_file=None)

        assert settings.api_secret == "legacy-api-secret"
        assert settings.webhook_secret == "legacy-webhook-secret-123456"
        assert settings.host == "legacy-host"
        assert settings.port == 9999
        assert settings.redis_url == "redis://legacy:6379"
        assert settings.database_url == "postgresql+asyncpg://legacy:pass@legacy:5432/db"
        assert settings.qdrant_url == "http://legacy-qdrant:6333"
        assert settings.tei_url == "http://legacy-tei:80"

    finally:
        for key, value in backups.items():
            if value is not None:
                os.environ[key] = value
            else:
                os.environ.pop(key, None)


def test_new_webhook_variables_override_legacy() -> None:
    """Test that new WEBHOOK_* variables override legacy SEARCH_BRIDGE_* variables."""
    env_keys = [
        "WEBHOOK_API_SECRET",
        "SEARCH_BRIDGE_API_SECRET",
        "WEBHOOK_SECRET",
        "SEARCH_BRIDGE_WEBHOOK_SECRET",
        "WEBHOOK_DATABASE_URL",
        "SEARCH_BRIDGE_DATABASE_URL",
        "WEBHOOK_REDIS_URL",
        "SEARCH_BRIDGE_REDIS_URL",
    ]
    backups = {key: os.environ.pop(key, None) for key in env_keys}

    try:
        # Set both new and legacy variables
        os.environ["WEBHOOK_API_SECRET"] = "new-api-secret"
        os.environ["SEARCH_BRIDGE_API_SECRET"] = "old-api-secret"
        os.environ["WEBHOOK_SECRET"] = "new-webhook-secret-123456"
        os.environ["SEARCH_BRIDGE_WEBHOOK_SECRET"] = "old-webhook-secret-123456"
        os.environ["WEBHOOK_DATABASE_URL"] = "postgresql+asyncpg://new:pass@new:5432/db"
        os.environ["SEARCH_BRIDGE_DATABASE_URL"] = "postgresql+asyncpg://old:pass@old:5432/db"
        os.environ["WEBHOOK_REDIS_URL"] = "redis://new:6379"
        os.environ["SEARCH_BRIDGE_REDIS_URL"] = "redis://old:6379"

        settings = Settings(_env_file=None)

        # New variables should take precedence
        assert settings.api_secret == "new-api-secret"
        assert settings.webhook_secret == "new-webhook-secret-123456"
        assert settings.database_url == "postgresql+asyncpg://new:pass@new:5432/db"
        assert settings.redis_url == "redis://new:6379"

    finally:
        for key, value in backups.items():
            if value is not None:
                os.environ[key] = value
            else:
                os.environ.pop(key, None)
