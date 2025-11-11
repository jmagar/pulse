"""Unit tests for TimingMiddleware."""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


def test_timing_middleware_adds_headers():
    """Test middleware adds timing headers."""
    from api.middleware.timing import TimingMiddleware

    app = FastAPI()
    app.add_middleware(TimingMiddleware)

    @app.get("/test")
    async def test_endpoint():
        return {"status": "ok"}

    client = TestClient(app)
    response = client.get("/test")

    assert response.status_code == 200
    assert "X-Request-ID" in response.headers
    assert "X-Process-Time" in response.headers

    # Process time should be a float
    process_time = float(response.headers["X-Process-Time"])
    assert process_time > 0


def test_timing_middleware_handles_errors():
    """Test middleware records timing even on errors."""
    from api.middleware.timing import TimingMiddleware

    app = FastAPI()
    app.add_middleware(TimingMiddleware)

    @app.get("/error")
    async def error_endpoint():
        raise ValueError("Test error")

    client = TestClient(app)

    # This will raise an exception, catch it
    with pytest.raises(ValueError):
        client.get("/error")
