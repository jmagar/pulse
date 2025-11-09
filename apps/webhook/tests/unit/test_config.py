"""
Tests for configuration.
"""

import os

import pytest
from pydantic import ValidationError

from app.config import Settings


def test_settings_defaults() -> None:
    """Test Settings with defaults."""
    # Create settings with minimal required values
    # Use _env_file=None to prevent loading from .env file
    env_keys = [
        "SEARCH_BRIDGE_REDIS_URL",
        "SEARCH_BRIDGE_QDRANT_URL",
        "SEARCH_BRIDGE_VECTOR_DIM",
        "SEARCH_BRIDGE_MAX_CHUNK_TOKENS",
        "SEARCH_BRIDGE_CHUNK_OVERLAP_TOKENS",
    ]
    backups: dict[str, str | None] = {key: os.environ.pop(key, None) for key in env_keys}

    try:
        settings = Settings(
            api_secret="test-secret",
            webhook_secret="test-webhook-secret-1234",
            _env_file=None,  # Don't load from .env file
        )

        assert settings.host == "0.0.0.0"
        assert settings.port == 52100
        assert settings.redis_url == "redis://localhost:52101"
        assert settings.qdrant_url == "http://localhost:52102"
        assert settings.vector_dim == 384
        assert settings.max_chunk_tokens == 256
        assert settings.chunk_overlap_tokens == 50
    finally:
        for key, value in backups.items():
            if value is not None:
                os.environ[key] = value


def test_settings_custom_values() -> None:
    """Test Settings with custom values."""
    settings = Settings(
        host="127.0.0.1",
        port=8000,
        api_secret="custom-secret",
        webhook_secret="custom-webhook-secret-5678",
        redis_url="redis://custom:6379",
        max_chunk_tokens=512,
        chunk_overlap_tokens=100,
    )

    assert settings.host == "127.0.0.1"
    assert settings.port == 8000
    assert settings.api_secret == "custom-secret"
    assert settings.redis_url == "redis://custom:6379"
    assert settings.max_chunk_tokens == 512
    assert settings.chunk_overlap_tokens == 100


def test_settings_hybrid_alpha_validation() -> None:
    """Test hybrid_alpha value constraints."""
    # Valid values
    Settings(
        api_secret="test",
        webhook_secret="valid-secret-123456",
        hybrid_alpha=0.0,
    )
    Settings(
        api_secret="test",
        webhook_secret="valid-secret-123456",
        hybrid_alpha=0.5,
    )
    Settings(
        api_secret="test",
        webhook_secret="valid-secret-123456",
        hybrid_alpha=1.0,
    )

    # Invalid: too low
    with pytest.raises(ValidationError):
        Settings(
            api_secret="test",
            webhook_secret="valid-secret-123456",
            hybrid_alpha=-0.1,
        )

    # Invalid: too high
    with pytest.raises(ValidationError):
        Settings(
            api_secret="test",
            webhook_secret="valid-secret-123456",
            hybrid_alpha=1.1,
        )


def test_settings_missing_api_secret() -> None:
    """Test Settings requires api_secret."""
    # Settings can load from .env file, so we need to prevent that
    old_env = os.environ.get("SEARCH_BRIDGE_API_SECRET")
    if old_env:
        del os.environ["SEARCH_BRIDGE_API_SECRET"]
    webhook_backup = os.environ.get("SEARCH_BRIDGE_WEBHOOK_SECRET")
    os.environ["SEARCH_BRIDGE_WEBHOOK_SECRET"] = "valid-webhook-secret-123456"

    try:
        with pytest.raises(ValidationError) as exc_info:
            Settings(_env_file=None)  # type: ignore[call-arg]

        errors = exc_info.value.errors()
        error_fields = {err["loc"][0] for err in errors}

        assert "api_secret" in error_fields
    finally:
        if old_env:
            os.environ["SEARCH_BRIDGE_API_SECRET"] = old_env
        else:
            os.environ.pop("SEARCH_BRIDGE_API_SECRET", None)

        if webhook_backup is not None:
            os.environ["SEARCH_BRIDGE_WEBHOOK_SECRET"] = webhook_backup
        else:
            os.environ.pop("SEARCH_BRIDGE_WEBHOOK_SECRET", None)


def test_webhook_secret_required() -> None:
    """Webhook secret must be provided."""

    api_backup = os.environ.get("SEARCH_BRIDGE_API_SECRET")
    webhook_backup = os.environ.get("SEARCH_BRIDGE_WEBHOOK_SECRET")

    os.environ["SEARCH_BRIDGE_API_SECRET"] = "api-secret-123456"
    if webhook_backup:
        del os.environ["SEARCH_BRIDGE_WEBHOOK_SECRET"]

    try:
        with pytest.raises(ValidationError) as exc_info:
            Settings(_env_file=None)  # type: ignore[call-arg]

        errors = {err["loc"][0] for err in exc_info.value.errors()}
        assert "webhook_secret" in errors
    finally:
        if api_backup is not None:
            os.environ["SEARCH_BRIDGE_API_SECRET"] = api_backup
        else:
            os.environ.pop("SEARCH_BRIDGE_API_SECRET", None)

        if webhook_backup is not None:
            os.environ["SEARCH_BRIDGE_WEBHOOK_SECRET"] = webhook_backup


def test_webhook_secret_validation() -> None:
    """Webhook secret must meet length and whitespace requirements."""

    with pytest.raises(ValidationError):
        Settings(api_secret="test", webhook_secret="short")

    with pytest.raises(ValidationError):
        Settings(api_secret="test", webhook_secret=" secret-with-spaces ")

    settings = Settings(
        api_secret="test",
        webhook_secret="valid-webhook-secret-123456",
    )
    assert settings.webhook_secret == "valid-webhook-secret-123456"
