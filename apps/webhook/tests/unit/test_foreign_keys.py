"""Test foreign key constraint enforcement."""
import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError

from domain.models import OperationMetric


@pytest.mark.asyncio
async def test_foreign_key_constraint_exists(db_session):
    """Verify FK constraint from operation_metrics to request_metrics exists."""
    # Check if FK constraint exists
    result = await db_session.execute(
        text("""
            SELECT constraint_name
            FROM information_schema.table_constraints
            WHERE table_schema='webhook'
            AND table_name='operation_metrics'
            AND constraint_type='FOREIGN KEY'
            AND constraint_name='fk_operation_metrics_request_id'
        """)
    )
    fk_constraint = result.scalar_one_or_none()

    assert fk_constraint is not None, "FK constraint fk_operation_metrics_request_id should exist"
    assert fk_constraint == "fk_operation_metrics_request_id"


@pytest.mark.asyncio
async def test_operation_metric_requires_valid_request_id(db_session):
    """Should prevent orphaned operation metrics with invalid request_id."""
    # Try to create operation metric with non-existent request_id
    orphaned_metric = OperationMetric(
        operation_type="indexing",
        operation_name="test",
        duration_ms=100,
        success=True,
        request_id="non-existent-uuid"  # Invalid FK reference
    )

    db_session.add(orphaned_metric)

    # Should fail with FK constraint violation
    with pytest.raises(IntegrityError) as exc_info:
        await db_session.commit()

    # Verify it's specifically a foreign key violation
    assert "foreign key" in str(exc_info.value).lower() or "violates foreign key constraint" in str(exc_info.value).lower()


@pytest.mark.asyncio
async def test_operation_metric_allows_null_request_id(db_session):
    """Should allow operation metrics without request_id (background jobs)."""
    standalone_metric = OperationMetric(
        operation_type="indexing",
        operation_name="background_job",
        duration_ms=200,
        success=True,
        request_id=None  # NULL is allowed
    )

    db_session.add(standalone_metric)
    await db_session.commit()

    # Should succeed
    result = await db_session.execute(
        select(OperationMetric).where(OperationMetric.operation_name == "background_job")
    )
    metric = result.scalar_one()
    assert metric.request_id is None
