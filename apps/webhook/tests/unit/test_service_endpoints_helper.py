"""Tests for service endpoint helper utilities."""

from tests.utils.service_endpoints import (
    get_api_base_url,
    get_api_host,
    get_api_port,
    get_changedetection_base_url,
    get_changedetection_diff_url,
    get_firecrawl_base_url,
    get_qdrant_base_url,
    get_redis_url,
    get_tei_base_url,
)
from tests.utils.db_fixtures import (  # noqa: F401
    cleanup_database_engine,
    initialize_test_database,
)


def test_helper_reads_current_settings(monkeypatch):
    """Helper should surface env-driven overrides from Settings."""

    monkeypatch.setenv("WEBHOOK_FIRECRAWL_API_URL", "http://custom-firecrawl:6000")
    monkeypatch.setenv("WEBHOOK_CHANGEDETECTION_API_URL", "http://custom-change:6001")
    monkeypatch.setenv("WEBHOOK_QDRANT_URL", "http://custom-qdrant:6002")
    monkeypatch.setenv("WEBHOOK_TEI_URL", "http://custom-tei:6003")
    monkeypatch.setenv("WEBHOOK_HOST", "custom-host")
    monkeypatch.setenv("WEBHOOK_PORT", "6100")
    monkeypatch.setenv("WEBHOOK_REDIS_URL", "redis://custom-redis:6004")

    assert get_firecrawl_base_url() == "http://custom-firecrawl:6000"
    assert get_changedetection_base_url() == "http://custom-change:6001"
    assert get_qdrant_base_url() == "http://custom-qdrant:6002"
    assert get_tei_base_url() == "http://custom-tei:6003"
    assert get_api_host() == "custom-host"
    assert get_api_port() == 6100
    assert get_api_base_url() == "http://custom-host:6100"
    assert get_redis_url() == "redis://custom-redis:6004"


def test_helper_builds_diff_urls(monkeypatch):
    """Diff helper joins base URL and provided path without double slashes."""

    monkeypatch.setenv("WEBHOOK_CHANGEDETECTION_API_URL", "http://diff-host:7777/base/")

    assert (
        get_changedetection_diff_url("diff/watch-123")
        == "http://diff-host:7777/base/diff/watch-123"
    )
    assert (
        get_changedetection_diff_url("/diff/watch-456")
        == "http://diff-host:7777/base/diff/watch-456"
    )
