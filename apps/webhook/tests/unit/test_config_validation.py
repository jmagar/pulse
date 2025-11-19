"""Test configuration validation.

These tests verify secret strength validation at startup using the real
Settings model. They run in isolation without requiring database fixtures.
"""

import os

import pytest
from pydantic import ValidationError
from pydantic_settings import BaseSettings, PydanticBaseSettingsSource

from config import Settings as AppSettings

os.environ.setdefault("WEBHOOK_SKIP_DB_FIXTURES", "1")


class TestSettings(AppSettings):
    """Settings variant for validation tests that ignores env/.env sources.

    The application uses `config.settings`, which still reads from
    environment variables and .env. These tests focus purely on the
    secret-strength validator logic, so we force kwargs-only inputs.
    """

    # Override secret fields to accept direct kwargs without env aliases.
    api_secret: str
    webhook_secret: str
    test_mode: bool = False

    @classmethod
    def settings_customise_sources(
        cls,
        settings_cls: type[BaseSettings],
        init_settings: PydanticBaseSettingsSource,
        env_settings: PydanticBaseSettingsSource,
        dotenv_settings: PydanticBaseSettingsSource,
        file_secret_settings: PydanticBaseSettingsSource,
    ) -> tuple[PydanticBaseSettingsSource, ...]:
        return (init_settings,)


def test_rejects_weak_default_api_secret() -> None:
    """Should reject insecure default API secret in production."""
    with pytest.raises(ValidationError, match="Weak default secret"):
        TestSettings(
            api_secret="dev-unsafe-api-secret-change-in-production",
            webhook_secret="valid-secret-with-at-least-32-chars-long",
            test_mode=False,  # Production mode
        )


def test_rejects_weak_default_webhook_secret() -> None:
    """Should reject insecure default webhook secret in production."""
    with pytest.raises(ValidationError, match="Weak default secret"):
        TestSettings(
            api_secret="valid-secret-with-at-least-32-chars-long",
            webhook_secret="dev-unsafe-hmac-secret-change-in-production",
            test_mode=False,  # Production mode
        )


def test_allows_weak_secret_in_test_mode() -> None:
    """Should allow weak secret in test mode."""
    settings = TestSettings(
        api_secret="dev-unsafe-api-secret-change-in-production",
        webhook_secret="dev-unsafe-hmac-secret-change-in-production",
        test_mode=True,
    )
    assert settings.api_secret == "dev-unsafe-api-secret-change-in-production"
    assert settings.webhook_secret == "dev-unsafe-hmac-secret-change-in-production"


def test_rejects_short_api_secret() -> None:
    """Should reject API secret shorter than 32 characters."""
    with pytest.raises(ValidationError, match="at least 32 characters"):
        TestSettings(
            api_secret="short",
            webhook_secret="valid-secret-with-at-least-32-chars-long",
            test_mode=False,
        )


def test_rejects_short_webhook_secret() -> None:
    """Should reject webhook secret shorter than 32 characters."""
    with pytest.raises(ValidationError, match="at least 32 characters"):
        TestSettings(
            api_secret="valid-secret-with-at-least-32-chars-long",
            webhook_secret="short",
            test_mode=False,
        )


def test_accepts_strong_api_secret() -> None:
    """Should accept strong cryptographically random API secret."""
    import secrets

    strong_api_secret = secrets.token_hex(32)
    strong_webhook_secret = secrets.token_hex(32)

    settings = TestSettings(
        api_secret=strong_api_secret,
        webhook_secret=strong_webhook_secret,
        test_mode=False,
    )
    assert settings.api_secret == strong_api_secret
    assert settings.webhook_secret == strong_webhook_secret


def test_rejects_changeme_secrets() -> None:
    """Should reject common weak secrets like 'changeme'."""
    with pytest.raises(ValidationError, match="Weak default secret"):
        TestSettings(
            api_secret="changeme",
            webhook_secret="valid-secret-with-at-least-32-chars-long",
            test_mode=False,
        )

    with pytest.raises(ValidationError, match="Weak default secret"):
        TestSettings(
            api_secret="valid-secret-with-at-least-32-chars-long",
            webhook_secret="changeme",
            test_mode=False,
        )


def test_rejects_generic_secret() -> None:
    """Should reject generic 'secret' as secret value."""
    with pytest.raises(ValidationError, match="Weak default secret"):
        TestSettings(
            api_secret="secret",
            webhook_secret="valid-secret-with-at-least-32-chars-long",
            test_mode=False,
        )


def test_rejects_your_api_key_here() -> None:
    """Should reject placeholder 'your-api-key-here'."""
    with pytest.raises(ValidationError, match="Weak default secret"):
        TestSettings(
            api_secret="your-api-key-here",
            webhook_secret="valid-secret-with-at-least-32-chars-long",
            test_mode=False,
        )
