"""Test secret masking in structured logs."""

import time

from utils.logging import mask_secrets


def test_mask_bearer_tokens():
    """Should mask Bearer tokens in log messages."""
    message = "Request failed: Authorization: Bearer sk-1234567890abcdef"
    masked = mask_secrets(message)
    assert "sk-1234567890abcdef" not in masked
    assert "Bearer ***" in masked


def test_mask_api_keys_in_dict():
    """Should mask API keys in dictionary values."""
    data = {
        "api_key": "secret-key-12345",
        "firecrawl_api_key": "fc-abcdefgh",
        "safe_field": "normal value",
    }
    masked = mask_secrets(data)
    assert masked["api_key"] == "***"
    assert masked["firecrawl_api_key"] == "***"
    assert masked["safe_field"] == "normal value"


def test_mask_urls_with_credentials():
    """Should mask credentials in URLs."""
    url = "https://user:password123@api.example.com/endpoint"
    masked = mask_secrets(url)
    assert "password123" not in masked
    assert "user:***@api.example.com" in masked


def test_preserve_non_sensitive_data():
    """Should not modify non-sensitive data."""
    data = {"count": 42, "status": "success", "timestamp": "2025-01-13"}
    masked = mask_secrets(data)
    assert masked == data


def test_mask_secrets_performance():
    """Should mask secrets efficiently without recompiling regexes."""
    # Large nested structure
    large_data = {
        "logs": [
            {
                "message": f"Request {i} with Bearer secret-key-{i}",
                "api_key": f"sk-{i}" * 10,
                "url": f"https://user:password{i}@api.example.com",
            }
            for i in range(1000)
        ]
    }

    start = time.perf_counter()
    result = mask_secrets(large_data)
    elapsed = time.perf_counter() - start

    # Should complete in <100ms for 1000 records
    assert elapsed < 0.1, f"Masking too slow: {elapsed:.3f}s"

    # Verify masking worked
    assert "Bearer ***" in result["logs"][0]["message"]
    assert result["logs"][0]["api_key"] == "***"


def test_mask_secrets_recursion_depth_limit():
    """Should prevent stack overflow from deeply nested structures."""
    # Create deeply nested structure (20 levels)
    nested = {"level": 0}
    current = nested
    for i in range(1, 20):
        current["child"] = {"level": i}
        current = current["child"]

    # Should not raise RecursionError
    result = mask_secrets(nested)
    assert result is not None
