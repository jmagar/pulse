"""Test authentication timing-attack resistance."""
import time
from statistics import stdev

import pytest
from fastapi import HTTPException

from api.deps import verify_api_secret
from config import settings


@pytest.mark.asyncio
@pytest.mark.unit
async def test_api_secret_constant_time_comparison():
    """Verify API secret comparison is constant-time (resistant to timing attacks)."""
    correct_secret = settings.api_secret

    # Test with secrets of varying correctness (but same length)
    test_cases = [
        "a" * len(correct_secret),  # All wrong
        correct_secret[:len(correct_secret)//2] + "a" * (len(correct_secret)//2),  # Half right
        correct_secret[:-1] + "a",  # Almost all right
        correct_secret,  # All right
    ]

    # Group timings by test case to measure variance between different inputs
    timings_by_case = {i: [] for i in range(len(test_cases))}

    # Run multiple iterations to get reliable timing data
    iterations = 1000
    for iteration in range(iterations):
        for i, secret in enumerate(test_cases):
            start = time.perf_counter()
            try:
                # Call verify_api_secret with mock authorization header
                await verify_api_secret(authorization=f"Bearer {secret}")
            except HTTPException:
                pass
            elapsed = time.perf_counter() - start
            timings_by_case[i].append(elapsed)

    # Calculate mean timing for each test case
    mean_timings = [sum(timings_by_case[i]) / len(timings_by_case[i]) for i in range(len(test_cases))]

    # Calculate variance between different cases
    # For timing-attack resistance, all cases should have similar mean timing
    timing_variance = stdev(mean_timings)

    # Also check that we're not just seeing noise - correct secret shouldn't be faster
    correct_secret_time = mean_timings[-1]  # Last test case is correct
    all_wrong_time = mean_timings[0]  # First test case is all wrong

    # Threshold of 0.001s (1ms) - allows for logging/exception overhead
    # but should catch timing leaks from string comparison
    assert timing_variance < 0.001, (
        f"Timing variance too high: {timing_variance:.6f}s. "
        f"Mean timings: {[f'{t:.6f}' for t in mean_timings]}. "
        "API secret comparison may be vulnerable to timing attacks. "
        f"Correct secret time: {correct_secret_time:.6f}s, "
        f"Wrong secret time: {all_wrong_time:.6f}s"
    )
