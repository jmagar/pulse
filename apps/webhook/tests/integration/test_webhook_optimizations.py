"""Integration tests for webhook optimizations."""

import hashlib
import hmac
import json
import time

import pytest
from fastapi.testclient import TestClient

from main import app


@pytest.fixture
def test_client():
    """Test client fixture."""
    return TestClient(app)


def _sign_payload(payload: dict, secret: str) -> str:
    """Create Firecrawl webhook signature."""
    body = json.dumps(payload).encode("utf-8")
    signature = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return f"sha256={signature}"


def test_large_crawl_webhook_performance(test_client, monkeypatch):
    """Test that large crawl (100 pages) processes efficiently."""
    monkeypatch.setattr("config.settings.webhook_secret", "test-secret")

    # Simulate large crawl with 100 pages
    payload = {
        "type": "crawl.page",
        "id": "large-crawl-123",
        "success": True,
        "data": [
            {
                "markdown": f"# Page {i}",
                "metadata": {
                    "url": f"https://example.com/page-{i}",
                    "statusCode": 200,
                    "title": f"Page {i}",
                },
            }
            for i in range(100)
        ],
    }

    signature = _sign_payload(payload, "test-secret")

    start = time.perf_counter()
    response = test_client.post(
        "/api/webhook/firecrawl", json=payload, headers={"X-Firecrawl-Signature": signature}
    )
    duration = time.perf_counter() - start

    assert response.status_code == 202
    assert response.json()["queued_jobs"] == 100

    # Should complete in under 2 seconds (with batching)
    assert duration < 2.0
    print(f"\n✓ Large crawl (100 pages) processed in {duration:.3f}s")


def test_webhook_responds_within_30_seconds(test_client, monkeypatch):
    """Test that webhook always responds within Firecrawl's 30s timeout."""
    monkeypatch.setattr("config.settings.webhook_secret", "test-secret")

    payload = {
        "type": "crawl.page",
        "id": "timeout-test",
        "success": True,
        "data": [
            {
                "markdown": "# Test",
                "metadata": {"url": "https://example.com/test", "statusCode": 200},
            }
        ],
    }

    signature = _sign_payload(payload, "test-secret")

    start = time.perf_counter()
    response = test_client.post(
        "/api/webhook/firecrawl", json=payload, headers={"X-Firecrawl-Signature": signature}
    )
    duration = time.perf_counter() - start

    assert response.status_code in (200, 202)
    assert duration < 30.0  # Firecrawl's timeout
    assert duration < 1.0  # Should be much faster with optimizations
    print(f"\n✓ Webhook responded in {duration:.3f}s (< 30s requirement)")


def test_body_not_consumed_twice(test_client, monkeypatch):
    """Test that request body is only read once (optimization fix)."""
    monkeypatch.setattr("config.settings.webhook_secret", "test-secret")

    payload = {"type": "crawl.page", "id": "body-test", "success": True, "data": []}

    signature = _sign_payload(payload, "test-secret")

    # This should not raise "body already consumed" error
    response = test_client.post(
        "/api/webhook/firecrawl", json=payload, headers={"X-Firecrawl-Signature": signature}
    )

    assert response.status_code == 200
    print("\n✓ Request body read optimization working")
