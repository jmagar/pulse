"""Integration tests for timing middleware."""

import pytest
from httpx import ASGITransport, AsyncClient

from main import app


@pytest.mark.asyncio
async def test_health_endpoint_has_timing_headers() -> None:
    """Test /health endpoint returns timing headers."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health")

    assert response.status_code == 200
    assert "X-Request-ID" in response.headers
    assert "X-Process-Time" in response.headers

    process_time = float(response.headers["X-Process-Time"])
    assert process_time > 0
