"""Integration tests for Firecrawl webhook flow."""

import hashlib
import hmac
import json
from collections.abc import Generator
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api import deps
from api import router


@pytest.fixture
def integration_client(
    monkeypatch: pytest.MonkeyPatch,
) -> Generator[tuple[TestClient, MagicMock, str]]:
    """Provide a TestClient with real signature verification."""

    secret = "integration-secret-1234567890"
    monkeypatch.setattr(deps, "settings", SimpleNamespace(webhook_secret=secret))

    app = FastAPI()
    app.include_router(router)

    queue = MagicMock()

    def override_queue() -> MagicMock:
        return queue

    app.dependency_overrides[deps.get_rq_queue] = override_queue

    client = TestClient(app)
    yield client, queue, secret
    app.dependency_overrides.clear()


def _signature_for(body: bytes, secret: str) -> str:
    digest = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
    return f"sha256={digest}"


def test_webhook_full_flow_crawl_page(
    integration_client: tuple[TestClient, MagicMock, str],
) -> None:
    """End-to-end crawl.page event should enqueue document and return 202."""

    client, queue, secret = integration_client

    payload = {
        "success": True,
        "type": "crawl.page",
        "id": "crawl-integration-1",
        "data": [
            {
                "markdown": "# Example",
                "html": "<h1>Example</h1>",
                "metadata": {
                    "url": "https://example.com",
                    "sourceURL": "https://example.com",
                    "statusCode": 200,
                },
            }
        ],
    }

    body = json.dumps(payload).encode("utf-8")
    headers = {"X-Firecrawl-Signature": _signature_for(body, secret)}

    response = client.post("/api/webhook/firecrawl", content=body, headers=headers)

    assert response.status_code == 202
    queue.enqueue.assert_called_once()

    args, _ = queue.enqueue.call_args
    assert args[0] == "app.worker.index_document_job"
    queued_payload = args[1]
    assert queued_payload["url"] == "https://example.com"
    resolved = queued_payload.get("resolved_url") or queued_payload.get("resolvedUrl")
    assert resolved == "https://example.com"
    assert queued_payload["markdown"] == "# Example"


def test_webhook_full_flow_batch_scrape(
    integration_client: tuple[TestClient, MagicMock, str],
) -> None:
    """Batch scrape events enqueue each document."""

    client, queue, secret = integration_client

    queue.enqueue.reset_mock()

    payload = {
        "success": True,
        "type": "batch_scrape.page",
        "id": "batch-integration-1",
        "data": [
            {
                "markdown": "A",
                "html": "<p>A</p>",
                "metadata": {
                    "url": "https://example.com/a",
                    "statusCode": 200,
                },
            },
            {
                "markdown": "B",
                "html": "<p>B</p>",
                "metadata": {
                    "url": "https://example.com/b",
                    "statusCode": 200,
                },
            },
        ],
    }

    body = json.dumps(payload).encode("utf-8")
    headers = {"X-Firecrawl-Signature": _signature_for(body, secret)}

    response = client.post("/api/webhook/firecrawl", content=body, headers=headers)

    assert response.status_code == 202
    assert queue.enqueue.call_count == 2


def test_webhook_signature_verification_integration(
    integration_client: tuple[TestClient, MagicMock, str],
) -> None:
    """Invalid signature should be rejected with 401."""

    client, _, secret = integration_client
    payload = {
        "success": True,
        "type": "crawl.page",
        "id": "crawl-invalid",
        "data": [
            {
                "markdown": "# Example",
                "html": "<h1>Example</h1>",
                "metadata": {
                    "url": "https://example.com",
                    "statusCode": 200,
                },
            }
        ],
    }

    body = json.dumps(payload).encode("utf-8")
    bad_signature = _signature_for(body, secret)[:-1] + "0"

    response = client.post(
        "/api/webhook/firecrawl",
        content=body,
        headers={"X-Firecrawl-Signature": bad_signature},
    )

    assert response.status_code == 401
