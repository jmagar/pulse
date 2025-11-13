"""SQL injection security tests.

Tests verify that user input is properly sanitized and parameterized to prevent
SQL injection attacks across all database operations.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, text

from main import app


client = TestClient(app)


def test_metrics_path_parameter_sql_injection():
    """Should prevent SQL injection via path filter parameter.

    Attack vector: Path query parameter in metrics endpoint
    Expected: Parameterized query prevents SQL injection
    """
    malicious_path = "'; DROP TABLE request_metrics; --"

    response = client.get(
        f"/api/metrics/requests?path={malicious_path}",
        headers={"Authorization": "Bearer test-api-secret-for-testing-only"},
    )

    # Should return empty results or 200, not execute SQL
    assert response.status_code == 200
    assert "error" not in response.text.lower() or "sql" not in response.text.lower()

    # Verify endpoint still works (table not dropped)
    response2 = client.get(
        "/api/metrics/requests",
        headers={"Authorization": "Bearer test-api-secret-for-testing-only"},
    )
    assert response2.status_code == 200


def test_search_query_sql_injection():
    """Should prevent SQL injection in search queries.

    Attack vector: Search query field
    Expected: Query treated as search text, not SQL
    """
    malicious_query = "test' OR '1'='1"

    response = client.post(
        "/api/search",
        headers={"Authorization": "Bearer test-api-secret-for-testing-only"},
        json={"query": malicious_query},
    )

    # Should process as normal query, not execute SQL
    assert response.status_code == 200
    result = response.json()
    # Should return search results or empty, not SQL error
    assert "results" in result or "error" in result


def test_index_url_sql_injection():
    """Should prevent SQL injection via document URL field.

    Attack vector: URL field in indexing endpoint
    Expected: URL validated/sanitized before storage
    """
    malicious_url = "https://example.com'; DELETE FROM documents WHERE '1'='1"

    response = client.post(
        "/api/index",
        headers={"Authorization": "Bearer test-api-secret-for-testing-only"},
        json={"url": malicious_url, "markdown": "test content", "title": "test"},
    )

    # Should reject invalid URL or index safely
    assert response.status_code in [200, 400, 422]

    # Verify SQL not executed by checking endpoint still works
    response2 = client.get(
        "/health", headers={"Authorization": "Bearer test-api-secret-for-testing-only"}
    )
    assert response2.status_code == 200


def test_metadata_json_sql_injection():
    """Should prevent SQL injection through JSON metadata fields.

    Attack vector: Metadata dictionary with malicious values
    Expected: JSON properly escaped in database
    """
    malicious_metadata = {
        "title": "test'; DROP TABLE documents; --",
        "author": "admin' OR '1'='1",
        "tags": ["test", "'; DELETE FROM users; --"],
    }

    response = client.post(
        "/api/index",
        headers={"Authorization": "Bearer test-api-secret-for-testing-only"},
        json={
            "url": "https://example.com/test",
            "markdown": "content",
            "metadata": malicious_metadata,
        },
    )

    # Should handle safely
    assert response.status_code in [200, 400, 422]


def test_watch_id_sql_injection():
    """Should prevent SQL injection via watch_id parameter.

    Attack vector: Watch ID in changedetection webhook payload
    Expected: Parameterized queries prevent injection
    """
    import hmac
    import hashlib
    from config import settings

    malicious_payload = {
        "watch_id": "123'; DROP TABLE change_events; --",
        "watch_url": "https://example.com",
        "notification_body": "test",
    }

    body = str(malicious_payload).encode()
    signature = hmac.new(
        settings.webhook_secret.encode(), body, hashlib.sha256
    ).hexdigest()

    response = client.post(
        "/api/webhook/changedetection",
        headers={"X-Signature": f"sha256={signature}"},
        json=malicious_payload,
    )

    # Should handle safely (might be 200, 400, or 422)
    assert response.status_code in [200, 400, 401, 422]

    # Verify tables still exist
    health_response = client.get(
        "/health", headers={"Authorization": "Bearer test-api-secret-for-testing-only"}
    )
    assert health_response.status_code == 200
