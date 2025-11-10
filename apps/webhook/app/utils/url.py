"""
URL normalization utilities.

Provides canonical URL normalization for consistent indexing and search.
"""

from typing import Any
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

from app.utils.logging import get_logger

logger = get_logger(__name__)

# Common tracking parameters to remove
# These are used by various analytics and advertising platforms
TRACKING_PARAMS = {
    # Google Analytics
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    # Google Ads
    "gclid",
    "gclsrc",
    # Facebook
    "fbclid",
    # Microsoft/Bing
    "msclkid",
    # Twitter
    "twclid",
    # LinkedIn
    "li_fat_id",
    # Mailchimp
    "mc_cid",
    "mc_eid",
    # HubSpot
    "hsCtaTracking",
    "_hsenc",
    "_hsmi",
    # Generic tracking
    "_ga",
    "_gac",
    "_gl",
}


def normalize_url(
    url: str | None,
    remove_tracking: bool = False,
) -> str:
    """
    Normalize a URL to its canonical form.

    Normalization rules:
    1. Lowercase the hostname (domain)
    2. Remove URL fragment (#anchor)
    3. Optionally remove tracking query parameters
    4. Preserve protocol (http/https)
    5. Preserve port numbers
    6. Preserve path (including trailing slashes)
    7. Preserve credentials (username/password)
    8. Preserve non-tracking query parameters

    Args:
        url: URL to normalize (can be None or empty)
        remove_tracking: If True, remove common tracking parameters

    Returns:
        Normalized URL string (empty string if input is None/empty/invalid)

    Examples:
        >>> normalize_url("https://Example.COM/path#section")
        "https://example.com/path"

        >>> normalize_url("https://example.com/page?id=1&utm_source=twitter", remove_tracking=True)
        "https://example.com/page?id=1"
    """
    # Handle None and empty strings
    if not url:
        return ""

    # Handle malformed URLs
    try:
        parsed = urlparse(url)
    except Exception as e:
        logger.warning("Failed to parse URL", url=url, error=str(e))
        return url  # Return original if parsing fails

    # For non-http URLs (data:, file:, etc.), return as-is
    if parsed.scheme and parsed.scheme not in ("http", "https"):
        return url

    # Lowercase the hostname (netloc includes host, port, user, password)
    # We need to be careful to only lowercase the hostname part
    netloc = parsed.netloc
    if netloc:
        # Split netloc into components
        # Format: [user[:password]@]host[:port]
        auth_part = ""
        host_part = netloc

        if "@" in netloc:
            auth_part, host_part = netloc.rsplit("@", 1)
            auth_part = auth_part + "@"

        # Lowercase the host (and port if present)
        host_part = host_part.lower()
        netloc = auth_part + host_part

    # Handle query parameters
    query = parsed.query
    if remove_tracking and query:
        # Parse query parameters
        params = parse_qs(query, keep_blank_values=True)

        # Remove tracking parameters (case-insensitive)
        filtered_params: dict[str, Any] = {}
        for key, values in params.items():
            # Check if this is a tracking parameter (case-insensitive)
            if key.lower() not in TRACKING_PARAMS:
                filtered_params[key] = values

        # Rebuild query string
        if filtered_params:
            # urlencode with doseq=True to handle multiple values
            query = urlencode(filtered_params, doseq=True)
        else:
            query = ""

    # Reconstruct URL without fragment
    normalized = urlunparse(
        (
            parsed.scheme,
            netloc,
            parsed.path,
            parsed.params,
            query,
            "",  # Remove fragment
        )
    )

    logger.debug(
        "URL normalized",
        original=url,
        normalized=normalized,
        removed_tracking=remove_tracking,
    )

    return normalized
