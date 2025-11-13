"""Tests for webhook signature verification with body passthrough."""

import json
import hmac
import hashlib
from fastapi import FastAPI, Depends
from fastapi.testclient import TestClient
from typing import Annotated
import pytest

from api.deps import verify_webhook_signature

# App for testing webhook signature verification
app = FastAPI()

@app.post("/test-webhook")
async def webhook_endpoint(
    verified_body: Annotated[bytes, Depends(verify_webhook_signature)]
) -> dict:
    """Test endpoint that receives verified body."""
    payload = json.loads(verified_body)
    return {"received": payload}


@pytest.fixture
def client():
    """Test client fixture."""
    return TestClient(app)


def test_verify_signature_returns_body(client, monkeypatch):
    """Test that signature verification returns the verified body."""
    # Mock settings
    monkeypatch.setattr("api.deps.settings.webhook_secret", "test-secret")

    payload = {"type": "crawl.page", "id": "123", "success": True, "data": []}
    body = json.dumps(payload).encode("utf-8")

    # Compute signature
    signature = hmac.new(
        "test-secret".encode("utf-8"),
        body,
        hashlib.sha256
    ).hexdigest()

    # Make request
    response = client.post(
        "/test-webhook",
        content=body,
        headers={"X-Firecrawl-Signature": f"sha256={signature}"}
    )

    assert response.status_code == 200
    assert response.json() == {"received": payload}


def test_body_not_read_twice(client, monkeypatch):
    """Test that body is only read once (no double-read error)."""
    monkeypatch.setattr("api.deps.settings.webhook_secret", "test-secret")

    payload = {"type": "crawl.page", "id": "123", "success": True, "data": []}
    body = json.dumps(payload).encode("utf-8")
    signature = hmac.new("test-secret".encode(), body, hashlib.sha256).hexdigest()

    # This should not raise "body already read" error
    response = client.post(
        "/test-webhook",
        content=body,
        headers={"X-Firecrawl-Signature": f"sha256={signature}"}
    )

    assert response.status_code == 200
