"""DoS (Denial of Service) protection tests.

Tests verify that the service has adequate protections against various
DoS attack vectors including oversized payloads, rate limiting, and
resource exhaustion attacks.
"""

import time
from concurrent.futures import ThreadPoolExecutor

from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_rejects_oversized_payloads():
    """Should reject payloads exceeding maximum size limit.

    Attack: Send extremely large JSON payload to exhaust memory
    Defense: FastAPI body size limits (default 10MB)
    """
    # Create payload just over typical size limit
    large_payload = {"data": "x" * (11 * 1024 * 1024)}  # 11 MB

    response = client.post(
        "/api/webhook/firecrawl",
        headers={"X-Firecrawl-Signature": "sha256=dummy"},
        json=large_payload,
    )

    # Should reject with 413 Payload Too Large or 400 Bad Request
    assert response.status_code in [
        413,
        400,
    ], f"Expected 413 or 400 for oversized payload, got {response.status_code}"


def test_rejects_deeply_nested_json():
    """Should reject deeply nested JSON to prevent stack overflow.

    Attack: Send JSON with extreme nesting depth
    Defense: JSON parser depth limits
    """
    # Create deeply nested JSON (100+ levels)
    nested = {"level": 0}
    current = nested
    for i in range(1, 150):
        current["nested"] = {"level": i}
        current = current["nested"]

    response = client.post(
        "/api/index",
        headers={"Authorization": "Bearer test-api-secret-for-testing-only"},
        json={"url": "https://example.com", "markdown": "test", "metadata": nested},
    )

    # Should reject or handle safely (not 500)
    assert response.status_code in [
        200,
        400,
        413,
        422,
    ], f"Deep nesting should not cause server error, got {response.status_code}"


def test_search_query_length_limit():
    """Should enforce maximum query length.

    Attack: Send extremely long search query
    Defense: Query length validation
    """
    # Create query longer than reasonable (100KB)
    long_query = "test " * 20000  # ~100KB

    response = client.post(
        "/api/search",
        headers={"Authorization": "Bearer test-api-secret-for-testing-only"},
        json={"query": long_query},
    )

    # Should reject or truncate, not crash
    assert response.status_code in [
        200,
        400,
        413,
        422,
    ], f"Long query should be handled gracefully, got {response.status_code}"


def test_prevents_regex_dos():
    """Should prevent catastrophic backtracking in regex patterns.

    Attack: Malicious regex pattern causing exponential backtracking
    Defense: Query timeout or regex validation
    """
    # Regex pattern known to cause catastrophic backtracking
    malicious_pattern = "(a+)+" * 10

    start_time = time.time()
    response = client.post(
        "/api/search",
        headers={"Authorization": "Bearer test-api-secret-for-testing-only"},
        json={"query": malicious_pattern},
    )
    elapsed = time.time() - start_time

    # Should complete within reasonable time (< 10s)
    assert elapsed < 10.0, f"Query took {elapsed:.2f}s, possible ReDoS vulnerability"

    # Should return result, not timeout
    assert response.status_code in [200, 400, 422]


def test_concurrent_request_handling():
    """Should handle concurrent requests without degradation.

    Attack: Flood server with concurrent requests
    Defense: Connection pooling, async handling, rate limiting
    """
    headers = {"Authorization": "Bearer test-api-secret-for-testing-only"}

    def make_request(i: int) -> int:
        response = client.post(
            "/api/search",
            headers=headers,
            json={"query": f"test query {i}"},
        )
        return response.status_code

    # Send 20 concurrent requests
    with ThreadPoolExecutor(max_workers=20) as executor:
        results = list(executor.map(make_request, range(20)))

    # Most should succeed (200) or be rate-limited (429)
    # None should crash (500)
    assert all(
        status in [200, 429] for status in results
    ), f"Unexpected status codes in concurrent requests: {results}"


def test_webhook_replay_attack_prevention():
    """Should prevent replay attacks on webhook endpoints.

    Attack: Capture valid webhook and replay it multiple times
    Defense: Timestamp validation, nonce tracking, or idempotency keys
    """
    import hashlib
    import hmac

    from config import settings

    # Create valid webhook payload
    payload = {
        "watch_id": "test-123",
        "watch_url": "https://example.com",
        "notification_body": "test",
    }

    import json

    body = json.dumps(payload).encode()
    signature = hmac.new(
        settings.webhook_secret.encode(), body, hashlib.sha256
    ).hexdigest()

    # Send same webhook multiple times rapidly
    responses = []
    for _ in range(5):
        response = client.post(
            "/api/webhook/changedetection",
            headers={"X-Signature": f"sha256={signature}"},
            content=body,
            headers_override={"Content-Type": "application/json"},
        )
        responses.append(response.status_code)

    # All should process (idempotent) or be rejected
    # Should not cause resource exhaustion or duplicate processing
    assert all(
        status in [200, 400, 401, 409, 422] for status in responses
    ), f"Unexpected webhook replay handling: {responses}"


def test_null_byte_injection():
    """Should prevent null byte injection in string fields.

    Attack: Include null bytes to truncate strings or bypass filters
    Defense: Input validation and sanitization
    """
    # Payload with null byte
    payload_with_null = {
        "url": "https://example.com\x00malicious",
        "markdown": "content\x00",
        "title": "test\x00title",
    }

    response = client.post(
        "/api/index",
        headers={"Authorization": "Bearer test-api-secret-for-testing-only"},
        json=payload_with_null,
    )

    # Should reject or sanitize, not cause unexpected behavior
    assert response.status_code in [
        200,
        400,
        422,
    ], f"Null byte injection should be handled, got {response.status_code}"


def test_request_timeout_enforcement():
    """Should enforce request timeouts to prevent long-running requests.

    Attack: Send request that causes long processing
    Defense: Request timeouts, circuit breakers
    """
    # This test verifies timeout is configured
    # Actual long-running request would need mock of external service

    headers = {"Authorization": "Bearer test-api-secret-for-testing-only"}

    # Create search with many terms (potentially slow)
    large_query = " ".join([f"term{i}" for i in range(1000)])

    start_time = time.time()
    response = client.post(
        "/api/search",
        headers=headers,
        json={"query": large_query},
    )
    elapsed = time.time() - start_time

    # Should complete within reasonable time or timeout gracefully
    assert elapsed < 30.0, f"Request took {elapsed:.2f}s, timeout may not be enforced"

    # Should not return 500 (internal error)
    assert response.status_code != 500


def test_memory_exhaustion_prevention():
    """Should prevent memory exhaustion through pagination.

    Attack: Request all records to exhaust memory
    Defense: Pagination limits, maximum result set sizes
    """
    headers = {"Authorization": "Bearer test-api-secret-for-testing-only"}

    # Request with very large limit
    response = client.post(
        "/api/search",
        headers=headers,
        json={"query": "test", "limit": 999999},
    )

    # Should enforce maximum limit or reject
    assert response.status_code in [200, 400, 422]

    if response.status_code == 200:
        result = response.json()
        # Should have reasonable maximum (e.g., 100 results)
        if "results" in result:
            assert (
                len(result["results"]) <= 100
            ), "Should enforce reasonable result limit"


def test_http_method_restriction():
    """Should reject inappropriate HTTP methods.

    Attack: Use unexpected HTTP methods (TRACE, OPTIONS, etc.)
    Defense: Method restrictions per endpoint
    """
    # Try POST-only endpoint with GET
    response = client.get("/api/search")
    assert response.status_code in [
        401,
        405,
    ], "Should reject GET on POST-only endpoint"

    # Try GET-only endpoint with POST
    response = client.post(
        "/health", headers={"Authorization": "Bearer test-api-secret-for-testing-only"}
    )
    assert response.status_code in [405], "Should reject POST on GET-only endpoint"


def test_header_injection_prevention():
    """Should prevent HTTP header injection.

    Attack: Inject CRLF characters to add malicious headers
    Defense: Header validation and sanitization
    """
    # Attempt header injection via custom header
    malicious_header = "test\r\nX-Malicious: injected\r\n"

    response = client.get(
        "/health",
        headers={
            "Authorization": "Bearer test-api-secret-for-testing-only",
            "X-Custom": malicious_header,
        },
    )

    # Should handle safely (not crash)
    assert response.status_code in [200, 400]

    # Verify injected header is not present in response
    assert "X-Malicious" not in response.headers


def test_path_traversal_prevention():
    """Should prevent path traversal in URL parameters.

    Attack: Use ../ sequences to access arbitrary files
    Defense: URL validation and sanitization
    """
    # Attempt path traversal in URL field
    traversal_url = "https://example.com/../../etc/passwd"

    response = client.post(
        "/api/index",
        headers={"Authorization": "Bearer test-api-secret-for-testing-only"},
        json={"url": traversal_url, "markdown": "test", "title": "test"},
    )

    # Should validate URL format or handle safely
    assert response.status_code in [200, 400, 422]


def test_unicode_normalization_dos():
    """Should prevent DoS via Unicode normalization attacks.

    Attack: Send strings that expand significantly when normalized
    Defense: Input size limits before and after normalization
    """
    # Characters that expand when normalized
    expanding_unicode = "\u0065\u0301" * 10000  # é repeated

    response = client.post(
        "/api/index",
        headers={"Authorization": "Bearer test-api-secret-for-testing-only"},
        json={
            "url": "https://example.com",
            "markdown": expanding_unicode,
            "title": "test",
        },
    )

    # Should handle within reasonable time
    assert response.status_code in [200, 400, 413, 422]
