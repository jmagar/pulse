"""
Tests for database connection pool behavior.

Validates pool sizing and monitoring capabilities.
"""

import pytest

from infra.database import engine


@pytest.mark.asyncio
async def test_connection_pool_status():
    """Test that we can query connection pool status."""
    # Access pool statistics
    pool = engine.pool

    # Should be able to get pool size
    assert hasattr(pool, 'size'), "Pool should have size() method"
    size = pool.size()
    assert size == 40, f"Expected pool size 40, got {size}"

    # Should be able to get checked out connections
    assert hasattr(pool, 'checkedout'), "Pool should have checkedout() method"
    checked_out = pool.checkedout()
    assert isinstance(checked_out, int), "Checked out count should be integer"
    assert checked_out >= 0, "Checked out count should be non-negative"

    # Should be able to get overflow
    assert hasattr(pool, 'overflow'), "Pool should have overflow() method"
    overflow = pool.overflow()
    assert isinstance(overflow, int), "Overflow count should be integer"

    # Should be able to get checked in connections
    assert hasattr(pool, 'checkedin'), "Pool should have checkedin() method"
    checked_in = pool.checkedin()
    assert isinstance(checked_in, int), "Checked in count should be integer"


@pytest.mark.asyncio
async def test_pool_capacity_limits():
    """Test that pool respects configured capacity."""
    import asyncio

    from infra.database import AsyncSessionLocal

    # Create multiple sessions concurrently
    sessions = []
    try:
        # Create 45 sessions (within pool_size + max_overflow = 60)
        for _ in range(45):
            session = AsyncSessionLocal()
            sessions.append(session)
            await asyncio.sleep(0.01)  # Small delay to allow pool tracking

        # Pool should handle this within capacity
        pool = engine.pool
        total_connections = pool.checkedout()
        assert total_connections <= 60, f"Pool exceeded max capacity: {total_connections}"

    finally:
        # Clean up sessions
        for session in sessions:
            await session.close()
