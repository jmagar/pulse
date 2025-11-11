"""
Tests for URL normalization utilities.

Test-Driven Development approach:
1. Write tests first (RED)
2. Implement minimal code to pass (GREEN)
3. Refactor while keeping tests green (REFACTOR)
"""

from utils.url import normalize_url


def test_normalize_url_basic() -> None:
    """Test basic URL normalization."""
    url = "https://Example.COM/path"
    normalized = normalize_url(url)
    assert normalized == "https://example.com/path"


def test_normalize_url_removes_fragment() -> None:
    """Test that URL fragments are removed."""
    url = "https://example.com/page#section"
    normalized = normalize_url(url)
    assert normalized == "https://example.com/page"
    assert "#section" not in normalized


def test_normalize_url_preserves_query_params_by_default() -> None:
    """Test that query parameters are preserved by default."""
    url = "https://example.com/page?id=123&name=test"
    normalized = normalize_url(url)
    assert normalized == "https://example.com/page?id=123&name=test"


def test_normalize_url_removes_tracking_params() -> None:
    """Test removal of common tracking parameters."""
    url = "https://example.com/page?id=123&utm_source=twitter&utm_medium=social&fbclid=xyz"
    normalized = normalize_url(url, remove_tracking=True)
    # Should keep id but remove tracking params
    assert "id=123" in normalized
    assert "utm_source" not in normalized
    assert "utm_medium" not in normalized
    assert "fbclid" not in normalized


def test_normalize_url_removes_fragment_with_query() -> None:
    """Test fragment removal with query parameters."""
    url = "https://example.com/page?query=1#section"
    normalized = normalize_url(url)
    assert normalized == "https://example.com/page?query=1"
    assert "#section" not in normalized


def test_normalize_url_empty_string() -> None:
    """Test normalization of empty string."""
    normalized = normalize_url("")
    assert normalized == ""


def test_normalize_url_none() -> None:
    """Test normalization of None."""
    normalized = normalize_url(None)
    assert normalized == ""


def test_normalize_url_malformed() -> None:
    """Test normalization of malformed URL."""
    # Invalid URL should return original
    url = "not a valid url"
    normalized = normalize_url(url)
    # Should handle gracefully - either return original or empty
    assert isinstance(normalized, str)


def test_normalize_url_http_to_https_not_changed() -> None:
    """Test that http is NOT converted to https (preserve protocol)."""
    url = "http://example.com/path"
    normalized = normalize_url(url)
    assert normalized == "http://example.com/path"


def test_normalize_url_with_port() -> None:
    """Test normalization preserves port."""
    url = "https://Example.COM:8080/path"
    normalized = normalize_url(url)
    assert normalized == "https://example.com:8080/path"


def test_normalize_url_with_subdomain() -> None:
    """Test normalization with subdomain."""
    url = "https://Sub.Example.COM/path"
    normalized = normalize_url(url)
    assert normalized == "https://sub.example.com/path"


def test_normalize_url_with_username_password() -> None:
    """Test normalization with username and password."""
    url = "https://User:Pass@Example.COM/path"
    normalized = normalize_url(url)
    # Should preserve credentials but lowercase host
    assert "user:pass" in normalized.lower()
    assert "example.com" in normalized


def test_normalize_url_trailing_slash_preserved() -> None:
    """Test that trailing slashes are preserved."""
    url1 = "https://example.com/path/"
    url2 = "https://example.com/path"

    normalized1 = normalize_url(url1)
    normalized2 = normalize_url(url2)

    # Both forms should be preserved as-is
    assert normalized1 == "https://example.com/path/"
    assert normalized2 == "https://example.com/path"


def test_normalize_url_multiple_tracking_params() -> None:
    """Test removal of multiple tracking parameters."""
    url = (
        "https://example.com/page"
        "?ref=newsletter"
        "&utm_source=email"
        "&utm_campaign=spring"
        "&utm_medium=email"
        "&utm_term=shoes"
        "&utm_content=header"
        "&gclid=abc123"
        "&msclkid=def456"
        "&_ga=xyz"
    )
    normalized = normalize_url(url, remove_tracking=True)

    # Should keep ref
    assert "ref=newsletter" in normalized

    # Should remove all tracking params
    assert "utm_" not in normalized
    assert "gclid" not in normalized
    assert "msclkid" not in normalized
    assert "_ga" not in normalized


def test_normalize_url_only_tracking_params() -> None:
    """Test URL with only tracking parameters."""
    url = "https://example.com/page?utm_source=google&utm_medium=cpc"
    normalized = normalize_url(url, remove_tracking=True)
    # Should remove query string entirely if only tracking params
    assert normalized == "https://example.com/page"
    assert "?" not in normalized


def test_normalize_url_international_domain() -> None:
    """Test normalization with international domain."""
    url = "https://例え.jp/path"
    normalized = normalize_url(url)
    # Should handle IDN domains
    assert isinstance(normalized, str)


def test_normalize_url_with_encoded_chars() -> None:
    """Test normalization with URL-encoded characters."""
    url = "https://example.com/path%20with%20spaces?query=hello%20world"
    normalized = normalize_url(url)
    # Should preserve encoding
    assert "example.com" in normalized
    assert "path%20with%20spaces" in normalized or "path with spaces" in normalized


def test_normalize_url_ip_address() -> None:
    """Test normalization with IP address."""
    url = "http://192.168.1.1:8080/path"
    normalized = normalize_url(url)
    # IP addresses should not be modified (no lowercase needed)
    assert normalized == "http://192.168.1.1:8080/path"


def test_normalize_url_localhost() -> None:
    """Test normalization with localhost."""
    url = "http://localhost:3000/api/test"
    normalized = normalize_url(url)
    assert normalized == "http://localhost:3000/api/test"


def test_normalize_url_data_uri() -> None:
    """Test normalization with data URI (edge case)."""
    url = "data:text/plain;base64,SGVsbG8="
    normalized = normalize_url(url)
    # Should handle non-http URLs gracefully
    assert isinstance(normalized, str)


def test_normalize_url_file_uri() -> None:
    """Test normalization with file URI."""
    url = "file:///home/user/document.pdf"
    normalized = normalize_url(url)
    # Should handle file URIs
    assert isinstance(normalized, str)


def test_normalize_url_removes_tracking_case_insensitive() -> None:
    """Test that tracking parameter removal is case-insensitive."""
    url = "https://example.com/page?UTM_SOURCE=google&fbCLID=abc"
    normalized = normalize_url(url, remove_tracking=True)
    # Should remove regardless of case
    assert "utm_source" not in normalized.lower()
    assert "fbclid" not in normalized.lower()
