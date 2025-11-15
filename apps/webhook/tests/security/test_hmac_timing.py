"""HMAC signature timing attack tests.

Tests verify that HMAC signature comparisons use constant-time algorithms
to prevent timing-based attacks that could reveal signature information.
"""

import hashlib
import hmac
import time
from statistics import stdev

from fastapi.testclient import TestClient

from config import settings
from main import app

client = TestClient(app)


def compute_signature(body: bytes) -> str:
    """Compute valid HMAC-SHA256 signature for request body."""
    return hmac.new(
        settings.webhook_secret.encode(), body, hashlib.sha256
    ).hexdigest()


def test_changedetection_hmac_constant_time():
    """Should use constant-time comparison for HMAC signatures.

    Attack: Attacker sends signatures with varying degrees of correctness
            and measures response time to infer correct signature bytes.
    Defense: Use secrets.compare_digest() for constant-time comparison.
    """
    body = b'{"test": "data", "watch_id": "123", "watch_url": "https://example.com"}'
    correct_sig = compute_signature(body)

    # Test signatures with varying correctness
    test_sigs = [
        "a" * 64,  # Completely wrong (all 'a')
        correct_sig[:32] + "a" * 32,  # First half correct
        correct_sig[:-1] + "a",  # All but last character correct
        correct_sig,  # Completely correct
    ]

    timings = []
    for sig in test_sigs:
        start = time.perf_counter()
        response = client.post(
            "/api/webhook/changedetection",
            headers={"X-Signature": f"sha256={sig}"},
            content=body,
            headers_override={
                "Content-Type": "application/json"
            },  # Ensure proper content type
        )
        elapsed = time.perf_counter() - start
        timings.append(elapsed)

        # All should fail except correct signature
        assert response.status_code in [200, 401, 422]

    # Statistical analysis: timing variance should be minimal
    # High variance indicates early-exit comparison (vulnerable to timing attack)
    # Low variance indicates constant-time comparison (secure)
    variance = stdev(timings) if len(timings) > 1 else 0.0

    # Allow up to 5ms variance (network jitter, scheduling)
    # Production systems should aim for < 1ms
    assert (
        variance < 0.005
    ), f"High timing variance detected: {variance:.6f}s. Potential timing attack vulnerability."


def test_api_secret_constant_time():
    """Should use constant-time comparison for API secret verification.

    Attack: Similar to HMAC attack, but on Bearer token comparison
    Defense: Use secrets.compare_digest() for API secret comparison
    """
    correct_secret = settings.api_secret

    # Test with varying degrees of correctness
    test_secrets = [
        "a" * len(correct_secret),  # All wrong
        correct_secret[: len(correct_secret) // 2]
        + "a" * (len(correct_secret) // 2),  # Half right
        correct_secret[:-1] + "a",  # Almost all right
        correct_secret,  # Correct
    ]

    timings = []
    for secret in test_secrets:
        start = time.perf_counter()
        response = client.get("/health", headers={"Authorization": f"Bearer {secret}"})
        elapsed = time.perf_counter() - start
        timings.append(elapsed)

        # Only correct secret should succeed
        if secret == correct_secret:
            assert response.status_code == 200
        else:
            assert response.status_code == 401

    # Check timing variance
    variance = stdev(timings) if len(timings) > 1 else 0.0

    # Allow up to 5ms variance for network/scheduling jitter
    assert (
        variance < 0.005
    ), f"High timing variance detected: {variance:.6f}s. API secret comparison may be vulnerable to timing attacks."


def test_hmac_signature_format_validation():
    """Should validate signature format before comparison.

    Attack: Send malformed signatures to cause exceptions
    Defense: Validate format first, then compare
    """
    body = b'{"test": "data"}'

    malformed_signatures = [
        "",  # Empty
        "sha256",  # Missing equals and hash
        "sha256=",  # Missing hash
        "md5=abc123",  # Wrong algorithm
        "sha256=not-hex",  # Invalid hex characters
        "sha256=" + "g" * 64,  # Invalid hex (g not in hex)
        "sha256=" + "a" * 63,  # Wrong length
    ]

    for sig in malformed_signatures:
        response = client.post(
            "/api/webhook/changedetection",
            headers={"X-Signature": sig},
            content=body,
        )

        # Should reject with 401, not crash with 500
        assert (
            response.status_code == 401
        ), f"Malformed signature '{sig}' should return 401, got {response.status_code}"


def test_timing_attack_with_statistical_analysis():
    """Advanced timing attack test with statistical analysis.

    Uses multiple samples to reduce noise and detect subtle timing differences.
    """
    body = b'{"watch_id": "test-123", "watch_url": "https://example.com"}'
    correct_sig = compute_signature(body)

    # Generate progressively more correct signatures
    signatures_to_test = [
        "0" * 64,  # All wrong
        correct_sig[:16] + "0" * 48,  # 25% correct
        correct_sig[:32] + "0" * 32,  # 50% correct
        correct_sig[:48] + "0" * 16,  # 75% correct
        correct_sig,  # 100% correct
    ]

    # Collect multiple samples for each signature
    samples_per_sig = 10
    all_timings = []

    for sig in signatures_to_test:
        sig_timings = []
        for _ in range(samples_per_sig):
            start = time.perf_counter()
            response = client.post(
                "/api/webhook/changedetection",
                headers={"X-Signature": f"sha256={sig}"},
                content=body,
            )
            elapsed = time.perf_counter() - start
            sig_timings.append(elapsed)

            assert response.status_code in [200, 401, 422]

        # Calculate median timing for this signature
        sig_timings.sort()
        median_timing = sig_timings[len(sig_timings) // 2]
        all_timings.append(median_timing)

    # Analyze timing distribution across correctness levels
    # In a vulnerable system, timings would increase with correctness
    # In a secure system, timings should be independent of correctness

    # Calculate correlation between correctness and timing
    # (simple check: do timings monotonically increase?)
    is_monotonic_increasing = all(
        all_timings[i] <= all_timings[i + 1] for i in range(len(all_timings) - 1)
    )

    # Should NOT be monotonically increasing (that would indicate timing leak)
    assert not is_monotonic_increasing or stdev(all_timings) < 0.001, (
        f"Timing pattern suggests vulnerability to timing attack. "
        f"Timings: {[f'{t:.6f}' for t in all_timings]}"
    )
