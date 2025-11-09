"""
Tests for configuration.
"""

import os

import pytest
from pydantic import ValidationError

from app.config import Settings


def test_settings_defaults() -> None:
    """Test Settings with defaults using WEBHOOK_* variables."""
    # Create settings with minimal required values
    # Use _env_file=None to prevent loading from .env file
    env_keys = [
        "WEBHOOK_API_SECRET",
        "WEBHOOK_SECRET",
        "WEBHOOK_REDIS_URL",
        "WEBHOOK_QDRANT_URL",
        "WEBHOOK_VECTOR_DIM",
        "WEBHOOK_MAX_CHUNK_TOKENS",
        "WEBHOOK_CHUNK_OVERLAP_TOKENS",
        # Also check legacy keys
        "SEARCH_BRIDGE_REDIS_URL",
        "SEARCH_BRIDGE_QDRANT_URL",
        "SEARCH_BRIDGE_VECTOR_DIM",
        "SEARCH_BRIDGE_MAX_CHUNK_TOKENS",
        "SEARCH_BRIDGE_CHUNK_OVERLAP_TOKENS",
    ]
    backups: dict[str, str | None] = {key: os.environ.pop(key, None) for key in env_keys}

    try:
        # Set minimal required values via env vars
        os.environ["WEBHOOK_API_SECRET"] = "test-secret"
        os.environ["WEBHOOK_SECRET"] = "test-webhook-secret-1234"

        settings = Settings(_env_file=None)

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
            else:
                os.environ.pop(key, None)


def test_settings_custom_values() -> None:
    """Test Settings with custom values using WEBHOOK_* variables."""
    env_keys = ["WEBHOOK_HOST", "WEBHOOK_PORT", "WEBHOOK_API_SECRET", "WEBHOOK_SECRET",
                "WEBHOOK_REDIS_URL", "WEBHOOK_MAX_CHUNK_TOKENS", "WEBHOOK_CHUNK_OVERLAP_TOKENS"]
    backups = {key: os.environ.pop(key, None) for key in env_keys}

    try:
        os.environ["WEBHOOK_HOST"] = "127.0.0.1"
        os.environ["WEBHOOK_PORT"] = "8000"
        os.environ["WEBHOOK_API_SECRET"] = "custom-secret"
        os.environ["WEBHOOK_SECRET"] = "custom-webhook-secret-5678"
        os.environ["WEBHOOK_REDIS_URL"] = "redis://custom:6379"
        os.environ["WEBHOOK_MAX_CHUNK_TOKENS"] = "512"
        os.environ["WEBHOOK_CHUNK_OVERLAP_TOKENS"] = "100"

        settings = Settings(_env_file=None)

        assert settings.host == "127.0.0.1"
        assert settings.port == 8000
        assert settings.api_secret == "custom-secret"
        assert settings.redis_url == "redis://custom:6379"
        assert settings.max_chunk_tokens == 512
        assert settings.chunk_overlap_tokens == 100
    finally:
        for key, value in backups.items():
            if value is not None:
                os.environ[key] = value
            else:
                os.environ.pop(key, None)


def test_settings_hybrid_alpha_validation() -> None:
    """Test hybrid_alpha value constraints."""
    env_keys = ["WEBHOOK_API_SECRET", "WEBHOOK_SECRET", "WEBHOOK_HYBRID_ALPHA"]
    backups = {key: os.environ.pop(key, None) for key in env_keys}

    try:
        os.environ["WEBHOOK_API_SECRET"] = "test"
        os.environ["WEBHOOK_SECRET"] = "valid-secret-123456"

        # Valid values
        os.environ["WEBHOOK_HYBRID_ALPHA"] = "0.0"
        Settings(_env_file=None)

        os.environ["WEBHOOK_HYBRID_ALPHA"] = "0.5"
        Settings(_env_file=None)

        os.environ["WEBHOOK_HYBRID_ALPHA"] = "1.0"
        Settings(_env_file=None)

        # Invalid: too low
        os.environ["WEBHOOK_HYBRID_ALPHA"] = "-0.1"
        with pytest.raises(ValidationError):
            Settings(_env_file=None)

        # Invalid: too high
        os.environ["WEBHOOK_HYBRID_ALPHA"] = "1.1"
        with pytest.raises(ValidationError):
            Settings(_env_file=None)
    finally:
        for key, value in backups.items():
            if value is not None:
                os.environ[key] = value
            else:
                os.environ.pop(key, None)


def test_settings_missing_api_secret() -> None:
    """Test Settings requires api_secret."""
    # Test with WEBHOOK_* variables (new naming)
    env_keys = ["WEBHOOK_API_SECRET", "SEARCH_BRIDGE_API_SECRET", "WEBHOOK_SECRET"]
    backups = {key: os.environ.pop(key, None) for key in env_keys}

    try:
        os.environ["WEBHOOK_SECRET"] = "valid-webhook-secret-123456"

        with pytest.raises(ValidationError) as exc_info:
            Settings(_env_file=None)

        errors = exc_info.value.errors()
        error_fields = {err["loc"][0] for err in errors}

        # With AliasChoices, the error field is the first alias name
        assert "WEBHOOK_API_SECRET" in error_fields
    finally:
        for key, value in backups.items():
            if value is not None:
                os.environ[key] = value
            else:
                os.environ.pop(key, None)


def test_webhook_secret_required() -> None:
    """Webhook secret must be provided."""
    env_keys = ["WEBHOOK_API_SECRET", "WEBHOOK_SECRET", "SEARCH_BRIDGE_API_SECRET", "SEARCH_BRIDGE_WEBHOOK_SECRET"]
    backups = {key: os.environ.pop(key, None) for key in env_keys}

    try:
        os.environ["WEBHOOK_API_SECRET"] = "api-secret-123456"

        with pytest.raises(ValidationError) as exc_info:
            Settings(_env_file=None)

        errors = {err["loc"][0] for err in exc_info.value.errors()}
        # With AliasChoices, the error field is the first alias name
        assert "WEBHOOK_SECRET" in errors
    finally:
        for key, value in backups.items():
            if value is not None:
                os.environ[key] = value
            else:
                os.environ.pop(key, None)


def test_webhook_secret_validation() -> None:
    """Webhook secret must meet length and whitespace requirements."""
    env_keys = ["WEBHOOK_API_SECRET", "WEBHOOK_SECRET"]
    backups = {key: os.environ.pop(key, None) for key in env_keys}

    try:
        os.environ["WEBHOOK_API_SECRET"] = "test"

        # Too short
        os.environ["WEBHOOK_SECRET"] = "short"
        with pytest.raises(ValidationError):
            Settings(_env_file=None)

        # Has whitespace
        os.environ["WEBHOOK_SECRET"] = " secret-with-spaces "
        with pytest.raises(ValidationError):
            Settings(_env_file=None)

        # Valid
        os.environ["WEBHOOK_SECRET"] = "valid-webhook-secret-123456"
        settings = Settings(_env_file=None)
        assert settings.webhook_secret == "valid-webhook-secret-123456"
    finally:
        for key, value in backups.items():
            if value is not None:
                os.environ[key] = value
            else:
                os.environ.pop(key, None)
