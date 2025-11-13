"""Test secret masking in structured logs."""

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
