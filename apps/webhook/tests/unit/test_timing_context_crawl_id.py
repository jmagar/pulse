"""Unit tests for TimingContext crawl_id parameter."""

import asyncio

import pytest
from sqlalchemy import select

from domain.models import OperationMetric
from utils.timing import TimingContext


@pytest.mark.asyncio
async def test_timing_context_stores_crawl_id(db_session):
    """Test TimingContext stores crawl_id in database."""
    async with TimingContext("test_op", "test_name", crawl_id="timing_test_123"):
        await asyncio.sleep(0.01)

    # Verify stored in database
    result = await db_session.execute(
        select(OperationMetric)
        .where(OperationMetric.operation_type == "test_op")
        .where(OperationMetric.crawl_id == "timing_test_123")
        .order_by(OperationMetric.timestamp.desc())
        .limit(1)
    )
    metric = result.scalar_one()
    assert metric.crawl_id == "timing_test_123"
    assert metric.operation_name == "test_name"
    assert metric.duration_ms > 0
