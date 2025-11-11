"""Helpers for accessing service endpoints from tests."""

from __future__ import annotations

from config import Settings


def _load_settings() -> Settings:
    """Instantiate Settings so helpers always reflect current env state."""

    return Settings()


def get_api_host() -> str:
    """Return the configured API bind host."""

    return _load_settings().host


def get_api_port() -> int:
    """Return the configured API port."""

    return _load_settings().port


def get_api_base_url() -> str:
    """Return a base URL composed from current host/port."""

    host = get_api_host()
    port = get_api_port()
    return f"http://{host}:{port}"


def get_redis_url() -> str:
    """Return the Redis connection URL for tests."""

    return _load_settings().redis_url


def get_firecrawl_base_url() -> str:
    """Return the Firecrawl API base URL from the current settings."""

    return _load_settings().firecrawl_api_url


def get_changedetection_base_url() -> str:
    """Return the changedetection API base URL from the current settings."""

    return _load_settings().changedetection_api_url


def get_qdrant_base_url() -> str:
    """Return the Qdrant server base URL from the current settings."""

    return _load_settings().qdrant_url


def get_tei_base_url() -> str:
    """Return the TEI server base URL from the current settings."""

    return _load_settings().tei_url


def get_changedetection_diff_url(path: str) -> str:
    """Return a fully-qualified changedetection diff URL for the given path."""

    base = get_changedetection_base_url().rstrip("/")
    suffix = path if path.startswith("/") else f"/{path}"
    return f"{base}{suffix}"
