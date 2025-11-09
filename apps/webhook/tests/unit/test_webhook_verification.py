"""Unit tests for webhook signature verification dependency."""

import asyncio
import hashlib
import hmac
from typing import Any

import pytest
from fastapi import HTTPException, status
from starlette.requests import Request

import app.api.dependencies as deps


def make_request(body: bytes) -> Request:
    """Create a Starlette request with the given body for testing."""

    async def receive() -> dict[str, Any]:
        return {"type": "http.request", "body": body, "more_body": False}

    scope = {
        "type": "http",
        "method": "POST",
        "path": "/api/webhook/firecrawl",
        "headers": [],
    }
    return Request(scope, receive=receive)


@pytest.mark.asyncio
async def test_verify_webhook_signature_success() -> None:
    """Valid signature should allow request to proceed."""

    body = b'{"success": true}'
    secret = "test-secret"
    signature = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    request = make_request(body)

    with pytest.MonkeyPatch.context() as monkeypatch:
        monkeypatch.setattr(deps, "settings", type("Settings", (), {"webhook_secret": secret})())

        # Should not raise
        await deps.verify_webhook_signature(
            request=request,
            x_firecrawl_signature=f"sha256={signature}",
        )


@pytest.mark.asyncio
async def test_verify_webhook_signature_missing_header() -> None:
    """Missing signature header should raise 401."""

    body = b"{}"
    request = make_request(body)

    with pytest.MonkeyPatch.context() as monkeypatch:
        monkeypatch.setattr(deps, "settings", type("Settings", (), {"webhook_secret": "secret"})())

        with pytest.raises(HTTPException) as exc_info:
            await deps.verify_webhook_signature(
                request=request,
                x_firecrawl_signature=None,
            )

        assert exc_info.value.status_code == status.HTTP_401_UNAUTHORIZED
        assert "Missing" in exc_info.value.detail


@pytest.mark.asyncio
async def test_verify_webhook_signature_invalid_signature() -> None:
    """Invalid HMAC signature should raise 401."""

    body = b"{}"
    secret = "correct-secret"
    request = make_request(body)

    bad_signature = hmac.new(b"other-secret", body, hashlib.sha256).hexdigest()

    with pytest.MonkeyPatch.context() as monkeypatch:
        monkeypatch.setattr(deps, "settings", type("Settings", (), {"webhook_secret": secret})())

        with pytest.raises(HTTPException) as exc_info:
            await deps.verify_webhook_signature(
                request=request,
                x_firecrawl_signature=f"sha256={bad_signature}",
            )

        assert exc_info.value.status_code == status.HTTP_401_UNAUTHORIZED
        assert "Invalid signature" in exc_info.value.detail


@pytest.mark.asyncio
async def test_verify_webhook_signature_invalid_format() -> None:
    """Malformed signature header should raise 400."""

    body = b"{}"
    secret = "format-secret"
    request = make_request(body)

    with pytest.MonkeyPatch.context() as monkeypatch:
        monkeypatch.setattr(deps, "settings", type("Settings", (), {"webhook_secret": secret})())

        with pytest.raises(HTTPException) as exc_info:
            await deps.verify_webhook_signature(
                request=request,
                x_firecrawl_signature="bad-format",
            )

        assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
        assert "sha256" in exc_info.value.detail


@pytest.mark.asyncio
async def test_verify_webhook_signature_timing_safe(monkeypatch: pytest.MonkeyPatch) -> None:
    """Signature comparison should use hmac.compare_digest for timing safety."""

    body = b"{}"
    secret = "timing-secret"
    good_signature = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    request = make_request(body)

    # Track compare_digest usage
    compare_called = asyncio.Event()

    def fake_compare_digest(a: str, b: str) -> bool:
        compare_called.set()
        return True

    monkeypatch.setattr(deps, "settings", type("Settings", (), {"webhook_secret": secret})())
    monkeypatch.setattr(hmac, "compare_digest", fake_compare_digest)

    await deps.verify_webhook_signature(
        request=request,
        x_firecrawl_signature=f"sha256={good_signature}",
    )

    assert compare_called.is_set()
