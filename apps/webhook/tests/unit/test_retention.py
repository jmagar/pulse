"""Test data retention policy."""

from datetime import UTC, datetime, timedelta
from unittest.mock import patch

import pytest
from sqlalchemy import select

from domain.models import OperationMetric, RequestMetric


@pytest.mark.asyncio
async def test_retention_deletes_old_metrics(db_session):
    """Should delete metrics older than retention period."""
    from workers.retention import enforce_retention_policy

    # Create old metrics (100 days ago)
    old_request = RequestMetric(
        request_id="old-uuid",
        timestamp=datetime.now(UTC) - timedelta(days=100),
        method="GET",
        path="/api/search",
        status_code=200,
        duration_ms=50,
    )

    old_operation = OperationMetric(
        timestamp=datetime.now(UTC) - timedelta(days=100),
        operation_type="search",
        operation_name="vector_search",
        duration_ms=100,
        success=True,
    )

    # Create recent metrics (30 days ago)
    recent_request = RequestMetric(
        request_id="recent-uuid",
        timestamp=datetime.now(UTC) - timedelta(days=30),
        method="POST",
        path="/api/index",
        status_code=200,
        duration_ms=200,
    )

    db_session.add_all([old_request, old_operation, recent_request])
    await db_session.commit()

    # Mock get_db_context to use test session
    async def mock_db_context():
        yield db_session

    with patch("workers.retention.get_db_context", return_value=mock_db_context()):
        # Run retention with 90-day policy
        result = await enforce_retention_policy(retention_days=90)

    # Verify old records deleted
    old_req_result = await db_session.execute(
        select(RequestMetric).where(RequestMetric.request_id == "old-uuid")
    )
    assert old_req_result.scalar_one_or_none() is None

    # Verify recent records retained
    recent_result = await db_session.execute(
        select(RequestMetric).where(RequestMetric.request_id == "recent-uuid")
    )
    assert recent_result.scalar_one_or_none() is not None

    assert result["deleted_requests"] > 0
    assert result["deleted_operations"] > 0


@pytest.mark.asyncio
async def test_retention_preserves_recent_data(db_session):
    """Should not delete metrics within retention period."""
    from workers.retention import enforce_retention_policy

    # Create metrics within retention period
    recent_metrics = [
        RequestMetric(
            request_id=f"recent-{i}",
            timestamp=datetime.now(UTC) - timedelta(days=i),
            method="GET",
            path=f"/api/test/{i}",
            status_code=200,
            duration_ms=50 + i,
        )
        for i in range(89)  # 0-88 days old
    ]

    db_session.add_all(recent_metrics)
    await db_session.commit()

    # Mock get_db_context to use test session
    async def mock_db_context():
        yield db_session

    with patch("workers.retention.get_db_context", return_value=mock_db_context()):
        # Run retention with 90-day policy
        result = await enforce_retention_policy(retention_days=90)

    # Verify no recent records deleted
    assert result["deleted_requests"] == 0
    assert result["deleted_operations"] == 0

    # Verify all records still exist
    all_result = await db_session.execute(select(RequestMetric))
    remaining_count = len(all_result.scalars().all())
    assert remaining_count == 89


@pytest.mark.asyncio
async def test_retention_with_custom_days(db_session):
    """Should respect custom retention period."""
    from workers.retention import enforce_retention_policy

    # Create metrics at different ages
    old_metric = RequestMetric(
        request_id="old-uuid",
        timestamp=datetime.now(UTC) - timedelta(days=35),
        method="GET",
        path="/api/old",
        status_code=200,
        duration_ms=50,
    )

    recent_metric = RequestMetric(
        request_id="recent-uuid",
        timestamp=datetime.now(UTC) - timedelta(days=25),
        method="GET",
        path="/api/recent",
        status_code=200,
        duration_ms=50,
    )

    db_session.add_all([old_metric, recent_metric])
    await db_session.commit()

    # Mock get_db_context to use test session
    async def mock_db_context():
        yield db_session

    with patch("workers.retention.get_db_context", return_value=mock_db_context()):
        # Run retention with 30-day policy
        result = await enforce_retention_policy(retention_days=30)

    # Verify old record (35 days) deleted
    old_result = await db_session.execute(
        select(RequestMetric).where(RequestMetric.request_id == "old-uuid")
    )
    assert old_result.scalar_one_or_none() is None

    # Verify recent record (25 days) retained
    recent_result = await db_session.execute(
        select(RequestMetric).where(RequestMetric.request_id == "recent-uuid")
    )
    assert recent_result.scalar_one_or_none() is not None

    assert result["deleted_requests"] == 1


@pytest.mark.asyncio
async def test_retention_empty_database(db_session):
    """Should handle empty database gracefully."""
    from workers.retention import enforce_retention_policy

    # Mock get_db_context to use test session
    async def mock_db_context():
        yield db_session

    with patch("workers.retention.get_db_context", return_value=mock_db_context()):
        # Run retention on empty database
        result = await enforce_retention_policy(retention_days=90)

    # Should return zero deletions
    assert result["deleted_requests"] == 0
    assert result["deleted_operations"] == 0
    assert result["retention_days"] == 90
