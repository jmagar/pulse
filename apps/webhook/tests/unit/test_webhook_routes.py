"""Unit tests for Firecrawl webhook API route."""

from collections.abc import Generator
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import FastAPI, HTTPException, Request
from fastapi.testclient import TestClient

from app.api import dependencies as deps
from app.api import routes
from api.schemas.webhook import FirecrawlPageEvent
from app.services import webhook_handlers as handlers


@pytest.fixture
def webhook_client() -> Generator[tuple[TestClient, MagicMock]]:
    """Create a TestClient with overridden dependencies."""

    app = FastAPI()
    app.include_router(routes.router)

    queue = MagicMock()

    async def override_signature(
        request: Request,
        x_firecrawl_signature: str | None = None,
    ) -> None:
        return None

    def override_queue() -> MagicMock:
        return queue

    app.dependency_overrides[deps.verify_webhook_signature] = override_signature
    app.dependency_overrides[deps.get_rq_queue] = override_queue

    client = TestClient(app)
    yield client, queue
    app.dependency_overrides.clear()


def test_webhook_with_valid_signature(
    webhook_client: tuple[TestClient, MagicMock], monkeypatch: pytest.MonkeyPatch
) -> None:
    """Webhook should return 202 when handler queues jobs."""

    client, _ = webhook_client
    handler_mock = AsyncMock(
        return_value={"status": "queued", "queued_jobs": 1, "job_ids": ["job-1"]}
    )
    monkeypatch.setattr(routes, "handle_firecrawl_event", handler_mock)

    payload = {
        "success": True,
        "type": "crawl.page",
        "id": "crawl-1",
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

    response = client.post("/api/webhook/firecrawl", json=payload)

    assert response.status_code == 202
    assert response.json()["queued_jobs"] == 1
    handler_mock.assert_awaited()


def test_webhook_with_invalid_signature(monkeypatch: pytest.MonkeyPatch) -> None:
    """Invalid signature should short-circuit with 401."""

    app = FastAPI()
    app.include_router(routes.router)

    async def failing_signature(
        request: Request,
        x_firecrawl_signature: str | None = None,
    ) -> None:
        raise HTTPException(status_code=401, detail="Invalid signature")

    app.dependency_overrides[deps.verify_webhook_signature] = failing_signature

    client = TestClient(app)
    response = client.post(
        "/api/webhook/firecrawl",
        json={
            "success": True,
            "type": "crawl.page",
            "id": "sig-test",
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
        },
    )

    assert response.status_code == 401


def test_webhook_crawl_page_event(
    webhook_client: tuple[TestClient, MagicMock], monkeypatch: pytest.MonkeyPatch
) -> None:
    """Page events should pass parsed model to handler."""

    client, queue = webhook_client
    handler_mock = AsyncMock(
        return_value={"status": "queued", "queued_jobs": 1, "job_ids": ["job-1"]}
    )
    monkeypatch.setattr(routes, "handle_firecrawl_event", handler_mock)

    payload = {
        "success": True,
        "type": "crawl.page",
        "id": "crawl-42",
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

    client.post("/api/webhook/firecrawl", json=payload)

    args, _ = handler_mock.call_args
    assert isinstance(args[0], FirecrawlPageEvent)
    assert args[0].id == "crawl-42"
    assert args[1] is queue


def test_webhook_lifecycle_event(
    webhook_client: tuple[TestClient, MagicMock], monkeypatch: pytest.MonkeyPatch
) -> None:
    """Lifecycle events should return 200 OK."""

    client, _ = webhook_client
    handler_mock = AsyncMock(
        return_value={"status": "acknowledged", "event_type": "crawl.completed"}
    )
    monkeypatch.setattr(routes, "handle_firecrawl_event", handler_mock)

    payload = {
        "success": True,
        "type": "crawl.completed",
        "id": "crawl-100",
    }

    response = client.post("/api/webhook/firecrawl", json=payload)

    assert response.status_code == 200
    assert response.json()["status"] == "acknowledged"


def test_webhook_invalid_payload(webhook_client: tuple[TestClient, MagicMock]) -> None:
    """Invalid payloads should trigger validation errors."""

    client, _ = webhook_client
    response = client.post("/api/webhook/firecrawl", json={"type": "crawl.page"})

    assert response.status_code == 422


def test_webhook_accepts_job_id_v0_payload(
    webhook_client: tuple[TestClient, MagicMock], monkeypatch: pytest.MonkeyPatch
) -> None:
    """Legacy payloads using jobId should be processed."""

    client, _ = webhook_client
    handler_mock = AsyncMock(
        return_value={"status": "queued", "queued_jobs": 1, "job_ids": ["job-legacy"]}
    )
    monkeypatch.setattr(routes, "handle_firecrawl_event", handler_mock)

    payload = {
        "success": True,
        "type": "crawl.page",
        "jobId": "legacy-job",
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

    response = client.post("/api/webhook/firecrawl", json=payload)

    assert response.status_code == 202
    handler_mock.assert_awaited()


def test_webhook_queue_failure(
    webhook_client: tuple[TestClient, MagicMock], monkeypatch: pytest.MonkeyPatch
) -> None:
    """Handler errors should propagate appropriate HTTP status codes."""

    client, _ = webhook_client
    handler_mock = AsyncMock(side_effect=handlers.WebhookHandlerError(500, "Queue failure"))
    monkeypatch.setattr(routes, "handle_firecrawl_event", handler_mock)

    payload = {
        "success": True,
        "type": "crawl.page",
        "id": "crawl-err",
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

    response = client.post("/api/webhook/firecrawl", json=payload)

    assert response.status_code == 500
    assert response.json()["detail"] == "Queue failure"
