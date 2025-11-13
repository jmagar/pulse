"""
Data retention policy enforcement.

Implements automatic deletion of old metrics to prevent unbounded database growth.
"""

from datetime import UTC, datetime, timedelta

from sqlalchemy import delete

from domain.models import OperationMetric, RequestMetric
from infra.database import get_db_context
from utils.logging import get_logger

logger = get_logger(__name__)


async def enforce_retention_policy(retention_days: int = 90) -> dict[str, int]:
    """
    Delete metrics older than retention period.

    This function removes request_metrics and operation_metrics records that exceed
    the specified retention period, helping prevent unbounded database growth.

    Args:
        retention_days: Number of days to retain data (default: 90)

    Returns:
        dict with counts of deleted records:
            - deleted_requests: Number of RequestMetric records deleted
            - deleted_operations: Number of OperationMetric records deleted
            - retention_days: The retention period used

    Example:
        >>> result = await enforce_retention_policy(retention_days=90)
        >>> print(f"Deleted {result['deleted_requests']} request metrics")
    """
    cutoff_date = datetime.now(UTC) - timedelta(days=retention_days)

    logger.info(
        "Starting retention policy enforcement",
        retention_days=retention_days,
        cutoff_date=cutoff_date.isoformat(),
    )

    async with get_db_context() as session:
        # Delete old request metrics
        request_result = await session.execute(
            delete(RequestMetric).where(RequestMetric.timestamp < cutoff_date)
        )
        deleted_requests = request_result.rowcount or 0

        # Delete old operation metrics
        operation_result = await session.execute(
            delete(OperationMetric).where(OperationMetric.timestamp < cutoff_date)
        )
        deleted_operations = operation_result.rowcount or 0

        await session.commit()

        logger.info(
            "Retention policy enforcement completed",
            deleted_requests=deleted_requests,
            deleted_operations=deleted_operations,
            retention_days=retention_days,
        )

        return {
            "deleted_requests": deleted_requests,
            "deleted_operations": deleted_operations,
            "retention_days": retention_days,
        }
