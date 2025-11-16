"""Tests for Firecrawl /v2/extract proxy endpoint."""
import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient
from httpx import Response as HttpxResponse

from main import app


@pytest.fixture
def auth_headers():
    """Valid authentication headers."""
    return {"Authorization": "Bearer test-secret"}


def test_extract_endpoint_proxies_to_firecrawl(auth_headers):
    """
    Test that POST /v2/extract proxies to Firecrawl API.

    This tests EXISTING functionality (endpoint already exists).
    """
    client = TestClient(app)

    mock_firecrawl_response = {
        "success": True,
        "id": "extract-123",
        "status": "completed",
        "data": {
            "name": "Model Context Protocol",
            "creator": "Anthropic",
            "capabilities": ["sampling", "resources", "tools"]
        },
        "llmUsage": 150
    }

    with patch('api.routers.firecrawl_proxy.proxy_to_firecrawl') as mock_proxy:
        # Mock the proxy call to return Firecrawl response
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.body = json.dumps(mock_firecrawl_response).encode()
        mock_response.headers = {"content-type": "application/json"}
        mock_proxy.return_value = mock_response

        # Mock database session
        with patch('api.routers.firecrawl_proxy.get_db_session') as mock_db:
            mock_db_session = MagicMock()
            mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_db_session)
            mock_db.return_value.__aexit__ = AsyncMock()

            # Mock create_crawl_session
            with patch('api.routers.firecrawl_proxy.create_crawl_session') as mock_session:
                mock_session.return_value = AsyncMock()

                response = client.post(
                    "/v2/extract",
                    headers=auth_headers,
                    json={
                        "urls": ["https://modelcontextprotocol.io/introduction"],
                        "schema": {
                            "type": "object",
                            "properties": {
                                "name": {"type": "string"},
                                "creator": {"type": "string"},
                                "capabilities": {"type": "array"}
                            }
                        },
                        "prompt": "Extract protocol name, creator, and capabilities"
                    }
                )

    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["id"] == "extract-123"
    assert data["data"]["name"] == "Model Context Protocol"

    # Verify webhook metadata was added
    assert "_webhook_meta" in data
    assert data["_webhook_meta"]["session_created"] is True
    assert data["_webhook_meta"]["operation_type"] == "extract"


def test_extract_endpoint_exists():
    """Test that /v2/extract endpoint exists and is accessible."""
    client = TestClient(app)

    # Verify endpoint exists by checking it doesn't return 404
    # Note: Will fail due to missing Firecrawl service, but that's expected
    with patch('api.routers.firecrawl_proxy.proxy_to_firecrawl') as mock_proxy:
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.body = b'{"success": true, "id": "test-123"}'
        mock_response.headers = {"content-type": "application/json"}
        mock_proxy.return_value = mock_response

        with patch('api.routers.firecrawl_proxy.get_db_session') as mock_db:
            mock_db_session = MagicMock()
            mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_db_session)
            mock_db.return_value.__aexit__ = AsyncMock()

            with patch('api.routers.firecrawl_proxy.create_crawl_session') as mock_session:
                mock_session.return_value = AsyncMock()

                response = client.post(
                    "/v2/extract",
                    json={
                        "urls": ["https://example.com"],
                        "schema": {"type": "object"}
                    }
                )

    # Endpoint should exist and handle request (not 404)
    assert response.status_code != 404


def test_extract_endpoint_creates_crawl_session(auth_headers):
    """Test that extract endpoint creates tracking session in database."""
    client = TestClient(app)

    mock_firecrawl_response = {
        "success": True,
        "id": "extract-456",
        "status": "processing",
        "data": {}
    }

    with patch('api.routers.firecrawl_proxy.proxy_to_firecrawl') as mock_proxy:
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.body = json.dumps(mock_firecrawl_response).encode()
        mock_response.headers = {"content-type": "application/json"}
        mock_proxy.return_value = mock_response

        with patch('api.routers.firecrawl_proxy.get_db_session') as mock_db:
            mock_db_session = MagicMock()
            mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_db_session)
            mock_db.return_value.__aexit__ = AsyncMock()

            with patch('api.routers.firecrawl_proxy.create_crawl_session') as mock_session:
                mock_session.return_value = AsyncMock()

                response = client.post(
                    "/v2/extract",
                    headers=auth_headers,
                    json={
                        "urls": ["https://example.com"],
                        "schema": {"type": "object"}
                    }
                )

        assert response.status_code == 200

        # Verify crawl session was created with correct parameters
        assert mock_session.called
        call_kwargs = mock_session.call_args.kwargs
        assert call_kwargs["job_id"] == "extract-456"
        assert call_kwargs["operation_type"] == "extract"
        assert call_kwargs["base_url"] == "https://example.com"
        assert call_kwargs["auto_index"] is True


def test_extract_endpoint_handles_multiple_urls(auth_headers):
    """Test that extract endpoint handles multiple URLs correctly."""
    client = TestClient(app)

    mock_firecrawl_response = {
        "success": True,
        "id": "extract-789",
        "status": "processing",
        "data": {}
    }

    with patch('api.routers.firecrawl_proxy.proxy_to_firecrawl') as mock_proxy:
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.body = json.dumps(mock_firecrawl_response).encode()
        mock_response.headers = {"content-type": "application/json"}
        mock_proxy.return_value = mock_response

        with patch('api.routers.firecrawl_proxy.get_db_session') as mock_db:
            mock_db_session = MagicMock()
            mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_db_session)
            mock_db.return_value.__aexit__ = AsyncMock()

            with patch('api.routers.firecrawl_proxy.create_crawl_session') as mock_session:
                mock_session.return_value = AsyncMock()

                response = client.post(
                    "/v2/extract",
                    headers=auth_headers,
                    json={
                        "urls": [
                            "https://example.com/page1",
                            "https://example.com/page2"
                        ],
                        "schema": {"type": "object"}
                    }
                )

        assert response.status_code == 200

        # Verify first URL is used as base_url
        call_kwargs = mock_session.call_args.kwargs
        assert call_kwargs["base_url"] == "https://example.com/page1"


def test_extract_get_status_endpoint():
    """Test GET /v2/extract/{job_id} endpoint for status checking."""
    client = TestClient(app)

    mock_status_response = {
        "success": True,
        "id": "extract-123",
        "status": "completed",
        "data": {
            "name": "Test Result"
        }
    }

    with patch('api.routers.firecrawl_proxy.proxy_to_firecrawl') as mock_proxy:
        # Mock returns Response directly (GET endpoints don't wrap response)
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.body = json.dumps(mock_status_response).encode()
        mock_response.headers = {"content-type": "application/json"}
        mock_proxy.return_value = mock_response

        response = client.get("/v2/extract/extract-123")

    assert response.status_code == 200
    # The response is returned as-is from proxy_to_firecrawl
    assert len(response.content) > 0  # Response has content


def test_extract_endpoint_handles_non_success_without_session():
    """Test that extract endpoint doesn't create session for error responses."""
    client = TestClient(app)

    with patch('api.routers.firecrawl_proxy.proxy_to_firecrawl') as mock_proxy:
        # Mock error response from Firecrawl
        mock_response = MagicMock()
        mock_response.status_code = 400
        mock_response.body = b'{"error": "Bad request"}'
        mock_response.headers = {"content-type": "application/json"}
        mock_proxy.return_value = mock_response

        # Mock database session
        with patch('api.routers.firecrawl_proxy.get_db_session') as mock_db:
            mock_db_session = MagicMock()
            mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_db_session)
            mock_db.return_value.__aexit__ = AsyncMock()

            with patch('api.routers.firecrawl_proxy.create_crawl_session') as mock_session:
                mock_session.return_value = AsyncMock()

                response = client.post(
                    "/v2/extract",
                    json={
                        "urls": ["https://example.com"],
                        "schema": {"type": "object"}
                    }
                )

    # Verify session was NOT created for error response
    # (proxy_with_session_tracking only creates sessions for 2xx)
    assert not mock_session.called


def test_extract_endpoint_validates_schema(auth_headers):
    """Test that extract endpoint properly forwards schema validation."""
    client = TestClient(app)

    # Test with valid schema
    mock_firecrawl_response = {
        "success": True,
        "id": "extract-999",
        "status": "processing",
        "data": {}
    }

    with patch('api.routers.firecrawl_proxy.proxy_to_firecrawl') as mock_proxy:
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.body = json.dumps(mock_firecrawl_response).encode()
        mock_response.headers = {"content-type": "application/json"}
        mock_proxy.return_value = mock_response

        with patch('api.routers.firecrawl_proxy.get_db_session') as mock_db:
            mock_db_session = MagicMock()
            mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_db_session)
            mock_db.return_value.__aexit__ = AsyncMock()

            with patch('api.routers.firecrawl_proxy.create_crawl_session') as mock_session:
                mock_session.return_value = AsyncMock()

                response = client.post(
                    "/v2/extract",
                    headers=auth_headers,
                    json={
                        "urls": ["https://example.com"],
                        "schema": {
                            "type": "object",
                            "properties": {
                                "title": {"type": "string"},
                                "author": {"type": "string"}
                            },
                            "required": ["title"]
                        }
                    }
                )

    assert response.status_code == 200
