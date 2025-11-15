"""
Integration tests for webhook content storage.

Tests verify that Firecrawl webhooks trigger content storage in PostgreSQL
using the fire-and-forget async pattern.
"""

import asyncio
import hashlib
import hmac
import json
import time
from collections.abc import Generator
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api import deps, router


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


@pytest.mark.asyncio
async def test_webhook_stores_content_before_indexing(
    integration_client: tuple[TestClient, MagicMock, str],
) -> None:
    """Test that crawl.page webhook stores content in PostgreSQL."""

    client, queue, secret = integration_client

    with patch("services.webhook_handlers.store_content_async") as mock_store:
        # Make it async
        mock_store.return_value = AsyncMock()

        payload = {
            "success": True,
            "type": "crawl.page",
            "id": "test-job-123",
            "data": [
                {
                    "markdown": "# Test Page",
                    "html": "<h1>Test Page</h1>",
                    "metadata": {
                        "url": "https://example.com/test",
                        "sourceURL": "https://example.com/test",
                        "statusCode": 200,
                    },
                }
            ],
        }

        body = json.dumps(payload).encode("utf-8")
        headers = {"X-Firecrawl-Signature": _signature_for(body, secret)}

        # Trigger webhook
        response = client.post("/api/webhook/firecrawl", content=body, headers=headers)

        # Verify response
        assert response.status_code == 202

        # Give async task a moment to be created
        await asyncio.sleep(0.1)

        # Verify storage was called
        assert mock_store.called, "store_content_async should be called"

        # Verify correct parameters
        call_args = mock_store.call_args
        assert call_args is not None, "store_content_async should have been called"
        assert call_args.kwargs["crawl_session_id"] == "test-job-123"
        assert len(call_args.kwargs["documents"]) == 1
        assert call_args.kwargs["content_source"] == "firecrawl_crawl"


@pytest.mark.asyncio
async def test_webhook_storage_doesnt_block_response(
    integration_client: tuple[TestClient, MagicMock, str],
) -> None:
    """Verify storage is truly fire-and-forget and doesn't block response."""

    client, queue, secret = integration_client

    with patch("services.webhook_handlers.store_content_async") as mock_store:
        # Make storage slow (2 second delay)
        async def slow_store(*args, **kwargs):
            await asyncio.sleep(2)

        mock_store.side_effect = slow_store

        payload = {
            "success": True,
            "type": "crawl.page",
            "id": "test-job-456",
            "data": [
                {
                    "markdown": "# Slow Test",
                    "html": "<h1>Slow Test</h1>",
                    "metadata": {
                        "url": "https://example.com/slow",
                        "sourceURL": "https://example.com/slow",
                        "statusCode": 200,
                    },
                }
            ],
        }

        body = json.dumps(payload).encode("utf-8")
        headers = {"X-Firecrawl-Signature": _signature_for(body, secret)}

        # Webhook should still respond fast
        start = time.time()
        response = client.post("/api/webhook/firecrawl", content=body, headers=headers)
        duration = time.time() - start

        assert response.status_code == 202
        assert duration < 1.0, f"Response took {duration}s, should be <1s despite 2s storage"


def test_webhook_detects_content_source_from_event_type(
    integration_client: tuple[TestClient, MagicMock, str],
) -> None:
    """Test that content_source is correctly detected from event type."""

    client, queue, secret = integration_client

    test_cases = [
        ("crawl.page", "firecrawl_crawl"),
        ("batch_scrape.page", "firecrawl_batch"),
    ]

    for event_type, expected_source in test_cases:
        with patch("services.webhook_handlers.store_content_async") as mock_store:
            mock_store.return_value = AsyncMock()

            payload = {
                "success": True,
                "type": event_type,
                "id": f"test-job-{event_type}",
                "data": [
                    {
                        "markdown": f"# {event_type}",
                        "html": f"<h1>{event_type}</h1>",
                        "metadata": {
                            "url": f"https://example.com/{event_type}",
                            "sourceURL": f"https://example.com/{event_type}",
                            "statusCode": 200,
                        },
                    }
                ],
            }

            body = json.dumps(payload).encode("utf-8")
            headers = {"X-Firecrawl-Signature": _signature_for(body, secret)}

            response = client.post("/api/webhook/firecrawl", content=body, headers=headers)

            assert response.status_code == 202
            assert mock_store.called

            call_args = mock_store.call_args
            assert (
                call_args.kwargs["content_source"] == expected_source
            ), f"Event type {event_type} should map to {expected_source}"


@pytest.mark.asyncio
async def test_webhook_storage_handles_multiple_documents(
    integration_client: tuple[TestClient, MagicMock, str],
) -> None:
    """Test that batch payloads with multiple documents are all stored."""

    client, queue, secret = integration_client

    with patch("services.webhook_handlers.store_content_async") as mock_store:
        mock_store.return_value = AsyncMock()

        payload = {
            "success": True,
            "type": "crawl.page",
            "id": "test-batch-789",
            "data": [
                {
                    "markdown": "# Page 1",
                    "html": "<h1>Page 1</h1>",
                    "metadata": {
                        "url": "https://example.com/1",
                        "sourceURL": "https://example.com/1",
                        "statusCode": 200,
                    },
                },
                {
                    "markdown": "# Page 2",
                    "html": "<h1>Page 2</h1>",
                    "metadata": {
                        "url": "https://example.com/2",
                        "sourceURL": "https://example.com/2",
                        "statusCode": 200,
                    },
                },
                {
                    "markdown": "# Page 3",
                    "html": "<h1>Page 3</h1>",
                    "metadata": {
                        "url": "https://example.com/3",
                        "sourceURL": "https://example.com/3",
                        "statusCode": 200,
                    },
                },
            ],
        }

        body = json.dumps(payload).encode("utf-8")
        headers = {"X-Firecrawl-Signature": _signature_for(body, secret)}

        response = client.post("/api/webhook/firecrawl", content=body, headers=headers)

        assert response.status_code == 202

        # Give async task a moment
        await asyncio.sleep(0.1)

        assert mock_store.called
        call_args = mock_store.call_args
        assert len(call_args.kwargs["documents"]) == 3, "All 3 documents should be passed to storage"
