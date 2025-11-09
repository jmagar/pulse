"""Unit tests for TimingContext."""

import asyncio

import pytest


@pytest.mark.asyncio
async def test_timing_context_success():
    """Test timing context tracks duration correctly."""
    from app.utils.timing import TimingContext

    async with TimingContext("test", "test_operation") as ctx:
        # Simulate some work
        await asyncio.sleep(0.1)

    assert ctx.duration_ms >= 100  # At least 100ms
    assert ctx.success is True
    assert ctx.error_message is None


@pytest.mark.asyncio
async def test_timing_context_failure():
    """Test timing context captures errors."""
    from app.utils.timing import TimingContext

    ctx = TimingContext("test", "test_operation")

    with pytest.raises(ValueError):
        async with ctx:
            raise ValueError("Test error")

    assert ctx.success is False
    assert ctx.error_message == "Test error"
    assert ctx.duration_ms > 0


@pytest.mark.asyncio
async def test_timing_context_metadata():
    """Test timing context stores metadata."""
    from app.utils.timing import TimingContext

    async with TimingContext(
        "test",
        "test_operation",
        metadata={"key": "value"}
    ) as ctx:
        ctx.metadata["added"] = "runtime"

    assert ctx.metadata["key"] == "value"
    assert ctx.metadata["added"] == "runtime"
