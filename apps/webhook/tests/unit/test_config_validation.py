"""Test configuration validation.

These tests verify secret strength validation at startup.
They run in isolation without requiring database fixtures.
"""

import pytest
from pydantic import ValidationError

# Mark all tests to skip database fixtures
pytestmark = pytest.mark.usefixtures()


def test_rejects_weak_default_api_secret():
    """Should reject insecure default API secret in production."""
    # Import here to avoid conftest fixture initialization
    from config import Settings

    with pytest.raises(ValidationError, match="Weak default secret"):
        Settings(
            api_secret="dev-unsafe-api-secret-change-in-production",
            webhook_secret="valid-secret-with-at-least-32-chars-long",
            test_mode=False,  # Production mode
        )


def test_rejects_weak_default_webhook_secret():
    """Should reject insecure default webhook secret in production."""
    from config import Settings

    with pytest.raises(ValidationError, match="Weak default secret"):
        Settings(
            api_secret="valid-secret-with-at-least-32-chars-long",
            webhook_secret="dev-unsafe-hmac-secret-change-in-production",
            test_mode=False,  # Production mode
        )


def test_allows_weak_secret_in_test_mode():
    """Should allow weak secret in test mode."""
    from config import Settings

    settings = Settings(
        api_secret="dev-unsafe-api-secret-change-in-production",
        webhook_secret="dev-unsafe-hmac-secret-change-in-production",
        test_mode=True,
    )
    assert settings.api_secret == "dev-unsafe-api-secret-change-in-production"
    assert settings.webhook_secret == "dev-unsafe-hmac-secret-change-in-production"


def test_rejects_short_api_secret():
    """Should reject API secret shorter than 32 characters."""
    from config import Settings

    with pytest.raises(ValidationError, match="at least 32 characters"):
        Settings(
            api_secret="short",
            webhook_secret="valid-secret-with-at-least-32-chars-long",
            test_mode=False,
        )


def test_rejects_short_webhook_secret():
    """Should reject webhook secret shorter than 32 characters."""
    from config import Settings

    with pytest.raises(ValidationError, match="at least 32 characters"):
        Settings(
            api_secret="valid-secret-with-at-least-32-chars-long",
            webhook_secret="short",
            test_mode=False,
        )


def test_accepts_strong_api_secret():
    """Should accept strong cryptographically random API secret."""
    import secrets
    from config import Settings

    strong_api_secret = secrets.token_hex(32)
    strong_webhook_secret = secrets.token_hex(32)

    settings = Settings(
        api_secret=strong_api_secret,
        webhook_secret=strong_webhook_secret,
        test_mode=False,
    )
    assert settings.api_secret == strong_api_secret
    assert settings.webhook_secret == strong_webhook_secret


def test_rejects_changeme_secrets():
    """Should reject common weak secrets like 'changeme'."""
    from config import Settings

    with pytest.raises(ValidationError, match="Weak default secret"):
        Settings(
            api_secret="changeme",
            webhook_secret="valid-secret-with-at-least-32-chars-long",
            test_mode=False,
        )

    with pytest.raises(ValidationError, match="Weak default secret"):
        Settings(
            api_secret="valid-secret-with-at-least-32-chars-long",
            webhook_secret="changeme",
            test_mode=False,
        )


def test_rejects_generic_secret():
    """Should reject generic 'secret' as secret value."""
    from config import Settings

    with pytest.raises(ValidationError, match="Weak default secret"):
        Settings(
            api_secret="secret",
            webhook_secret="valid-secret-with-at-least-32-chars-long",
            test_mode=False,
        )


def test_rejects_your_api_key_here():
    """Should reject placeholder 'your-api-key-here'."""
    from config import Settings

    with pytest.raises(ValidationError, match="Weak default secret"):
        Settings(
            api_secret="your-api-key-here",
            webhook_secret="valid-secret-with-at-least-32-chars-long",
            test_mode=False,
        )
