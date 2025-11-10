"""Integration tests for changedetection.io webhook endpoint."""
import hmac
import hashlib
import json
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.config import settings


def test_changedetection_webhook_valid_signature():
    """Test changedetection webhook accepts valid HMAC signature."""
    payload = {
        "watch_id": "test-watch-123",
        "watch_url": "https://example.com/test",
        "watch_title": "Test Watch",
        "detected_at": "2025-11-10T12:00:00Z",
        "diff_url": "http://changedetection:5000/diff/test-watch-123",
        "snapshot": "Content changed here",
    }

    body = json.dumps(payload).encode()
    signature = hmac.new(
        settings.webhook_secret.encode(),
        body,
        hashlib.sha256
    ).hexdigest()

    with TestClient(app) as client:
        response = client.post(
            "/api/webhook/changedetection",
            content=body,
            headers={
                "Content-Type": "application/json",
                "X-Signature": f"sha256={signature}",
            },
        )

    assert response.status_code == 202
    data = response.json()
    assert data["status"] == "queued"
    assert "job_id" in data


def test_changedetection_webhook_invalid_signature():
    """Test changedetection webhook rejects invalid signature."""
    payload = {
        "watch_id": "test-watch-123",
        "watch_url": "https://example.com/test",
    }

    body = json.dumps(payload).encode()

    with TestClient(app) as client:
        response = client.post(
            "/api/webhook/changedetection",
            content=body,
            headers={
                "Content-Type": "application/json",
                "X-Signature": "sha256=invalid_signature",
            },
        )

    assert response.status_code == 401
    assert "Invalid signature" in response.json()["detail"]


def test_changedetection_webhook_missing_signature():
    """Test changedetection webhook rejects missing signature."""
    payload = {"watch_id": "test", "watch_url": "https://example.com"}

    with TestClient(app) as client:
        response = client.post(
            "/api/webhook/changedetection",
            json=payload,
        )

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_changedetection_webhook_stores_event(db_session):
    """Test webhook stores change event in database."""
    from app.models.timing import ChangeEvent
    from sqlalchemy import select

    payload = {
        "watch_id": "db-test-watch",
        "watch_url": "https://example.com/dbtest",
        "watch_title": "DB Test",
        "detected_at": "2025-11-10T12:00:00Z",
        "diff_url": "http://changedetection:5000/diff/db-test-watch",
        "snapshot": "Test content",
    }

    body = json.dumps(payload).encode()
    signature = hmac.new(
        settings.webhook_secret.encode(),
        body,
        hashlib.sha256
    ).hexdigest()

    with TestClient(app) as client:
        client.post(
            "/api/webhook/changedetection",
            content=body,
            headers={
                "Content-Type": "application/json",
                "X-Signature": f"sha256={signature}",
            },
        )

    # Query database for stored event
    result = await db_session.execute(
        select(ChangeEvent).where(ChangeEvent.watch_id == "db-test-watch")
    )
    event = result.scalar_one_or_none()

    assert event is not None
    assert event.watch_url == "https://example.com/dbtest"
    assert event.watch_id == "db-test-watch"
    assert event.rescrape_status == "queued"

    # Verify richer metadata fields
    assert event.extra_metadata is not None
    assert "watch_title" in event.extra_metadata
    assert event.extra_metadata["watch_title"] == "DB Test"
    assert "webhook_received_at" in event.extra_metadata
    assert "signature" in event.extra_metadata
    assert event.extra_metadata["signature"] == f"sha256={signature}"
    assert "diff_size" in event.extra_metadata
    assert event.extra_metadata["diff_size"] == len("Test content")
    assert "raw_payload_version" in event.extra_metadata
    assert event.extra_metadata["raw_payload_version"] == "1.0"
    assert "detected_at" in event.extra_metadata
    assert event.extra_metadata["detected_at"] == "2025-11-10T12:00:00Z"
