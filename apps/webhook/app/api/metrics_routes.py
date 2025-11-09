"""
API routes for querying timing metrics.

Provides endpoints to retrieve and analyze performance metrics.
"""

from datetime import UTC, datetime, timedelta
from typing import Annotated, Any

import sqlalchemy as sa
from fastapi import APIRouter, Depends, Query
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import verify_api_secret
from app.database import get_db_session
from app.models.timing import OperationMetric, RequestMetric
from app.utils.logging import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/api/metrics", tags=["metrics"])


@router.get("/requests", dependencies=[Depends(verify_api_secret)])
async def get_request_metrics(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    path: str | None = Query(default=None, description="Filter by path"),
    method: str | None = Query(default=None, description="Filter by HTTP method"),
    min_duration_ms: float | None = Query(default=None, description="Minimum duration in ms"),
    hours: int = Query(default=24, ge=1, le=168, description="Look back hours"),
) -> dict[str, Any]:
    """
    Retrieve request-level timing metrics.

    Args:
        db: Database session
        limit: Maximum number of results
        offset: Offset for pagination
        path: Optional path filter
        method: Optional HTTP method filter
        min_duration_ms: Optional minimum duration filter
        hours: Look back period in hours

    Returns:
        List of request metrics with summary statistics
    """
    # Build query
    query = select(RequestMetric).where(
        RequestMetric.timestamp >= datetime.now(UTC) - timedelta(hours=hours)
    )

    if path:
        query = query.where(RequestMetric.path == path)

    if method:
        query = query.where(RequestMetric.method == method.upper())

    if min_duration_ms is not None:
        query = query.where(RequestMetric.duration_ms >= min_duration_ms)

    # Get total count
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # Get metrics
    query = query.order_by(desc(RequestMetric.timestamp)).limit(limit).offset(offset)
    result = await db.execute(query)
    metrics = result.scalars().all()

    # Calculate summary statistics
    stats_query = select(
        func.avg(RequestMetric.duration_ms).label("avg_duration_ms"),
        func.min(RequestMetric.duration_ms).label("min_duration_ms"),
        func.max(RequestMetric.duration_ms).label("max_duration_ms"),
        func.count().label("total_requests"),
    ).where(
        RequestMetric.timestamp >= datetime.now(UTC) - timedelta(hours=hours)
    )

    if path:
        stats_query = stats_query.where(RequestMetric.path == path)
    if method:
        stats_query = stats_query.where(RequestMetric.method == method.upper())

    stats_result = await db.execute(stats_query)
    stats = stats_result.one()

    return {
        "metrics": [
            {
                "id": str(m.id),
                "timestamp": m.timestamp.isoformat(),
                "method": m.method,
                "path": m.path,
                "status_code": m.status_code,
                "duration_ms": round(m.duration_ms, 2),
                "request_id": m.request_id,
                "client_ip": m.client_ip,
            }
            for m in metrics
        ],
        "total": total,
        "limit": limit,
        "offset": offset,
        "summary": {
            "avg_duration_ms": round(float(stats.avg_duration_ms or 0), 2),
            "min_duration_ms": round(float(stats.min_duration_ms or 0), 2),
            "max_duration_ms": round(float(stats.max_duration_ms or 0), 2),
            "total_requests": stats.total_requests,
        },
    }


@router.get("/operations", dependencies=[Depends(verify_api_secret)])
async def get_operation_metrics(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    operation_type: str | None = Query(default=None, description="Filter by operation type"),
    operation_name: str | None = Query(default=None, description="Filter by operation name"),
    document_url: str | None = Query(default=None, description="Filter by document URL"),
    success: bool | None = Query(default=None, description="Filter by success status"),
    hours: int = Query(default=24, ge=1, le=168, description="Look back hours"),
) -> dict[str, Any]:
    """
    Retrieve operation-level timing metrics.

    Args:
        db: Database session
        limit: Maximum number of results
        offset: Offset for pagination
        operation_type: Optional operation type filter
        operation_name: Optional operation name filter
        document_url: Optional document URL filter
        success: Optional success status filter
        hours: Look back period in hours

    Returns:
        List of operation metrics with summary statistics
    """
    # Build query
    query = select(OperationMetric).where(
        OperationMetric.timestamp >= datetime.now(UTC) - timedelta(hours=hours)
    )

    if operation_type:
        query = query.where(OperationMetric.operation_type == operation_type)

    if operation_name:
        query = query.where(OperationMetric.operation_name == operation_name)

    if document_url:
        query = query.where(OperationMetric.document_url == document_url)

    if success is not None:
        query = query.where(OperationMetric.success == success)

    # Get total count
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # Get metrics
    query = query.order_by(desc(OperationMetric.timestamp)).limit(limit).offset(offset)
    result = await db.execute(query)
    metrics = result.scalars().all()

    # Calculate summary statistics by operation type
    stats_query = select(
        OperationMetric.operation_type,
        func.avg(OperationMetric.duration_ms).label("avg_duration_ms"),
        func.min(OperationMetric.duration_ms).label("min_duration_ms"),
        func.max(OperationMetric.duration_ms).label("max_duration_ms"),
        func.count().label("total_operations"),
        func.sum(func.cast(OperationMetric.success, sa.Integer)).label("successful_operations"),
    ).where(
        OperationMetric.timestamp >= datetime.now(UTC) - timedelta(hours=hours)
    ).group_by(OperationMetric.operation_type)

    if operation_type:
        stats_query = stats_query.where(OperationMetric.operation_type == operation_type)

    stats_result = await db.execute(stats_query)
    stats_by_type = {
        row.operation_type: {
            "avg_duration_ms": round(float(row.avg_duration_ms or 0), 2),
            "min_duration_ms": round(float(row.min_duration_ms or 0), 2),
            "max_duration_ms": round(float(row.max_duration_ms or 0), 2),
            "total_operations": row.total_operations,
            "successful_operations": row.successful_operations,
            "failed_operations": row.total_operations - row.successful_operations,
            "success_rate": round((row.successful_operations / row.total_operations * 100), 2) if row.total_operations > 0 else 0,
        }
        for row in stats_result.all()
    }

    return {
        "metrics": [
            {
                "id": str(m.id),
                "timestamp": m.timestamp.isoformat(),
                "operation_type": m.operation_type,
                "operation_name": m.operation_name,
                "duration_ms": round(m.duration_ms, 2),
                "success": m.success,
                "error_message": m.error_message,
                "request_id": m.request_id,
                "job_id": m.job_id,
                "document_url": m.document_url,
            }
            for m in metrics
        ],
        "total": total,
        "limit": limit,
        "offset": offset,
        "summary_by_type": stats_by_type,
    }


@router.get("/summary", dependencies=[Depends(verify_api_secret)])
async def get_metrics_summary(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    hours: int = Query(default=24, ge=1, le=168, description="Look back hours"),
) -> dict[str, Any]:
    """
    Get high-level metrics summary.

    Args:
        db: Database session
        hours: Look back period in hours

    Returns:
        Summary statistics across all metrics
    """
    time_cutoff = datetime.now(UTC) - timedelta(hours=hours)

    # Request metrics summary
    request_stats_query = select(
        func.count().label("total_requests"),
        func.avg(RequestMetric.duration_ms).label("avg_duration_ms"),
        func.sum(func.cast(RequestMetric.status_code >= 400, sa.Integer)).label("error_count"),
    ).where(RequestMetric.timestamp >= time_cutoff)

    request_stats = await db.execute(request_stats_query)
    request_row = request_stats.one()

    # Operation metrics summary by type
    operation_stats_query = select(
        OperationMetric.operation_type,
        func.count().label("total_operations"),
        func.avg(OperationMetric.duration_ms).label("avg_duration_ms"),
        func.sum(func.cast(~OperationMetric.success, sa.Integer)).label("error_count"),
    ).where(
        OperationMetric.timestamp >= time_cutoff
    ).group_by(OperationMetric.operation_type)

    operation_stats = await db.execute(operation_stats_query)
    operations_by_type = {
        row.operation_type: {
            "total_operations": row.total_operations,
            "avg_duration_ms": round(float(row.avg_duration_ms or 0), 2),
            "error_count": row.error_count,
        }
        for row in operation_stats.all()
    }

    # Slowest endpoints
    slowest_query = select(
        RequestMetric.path,
        func.avg(RequestMetric.duration_ms).label("avg_duration_ms"),
        func.count().label("request_count"),
    ).where(
        RequestMetric.timestamp >= time_cutoff
    ).group_by(
        RequestMetric.path
    ).order_by(
        desc(func.avg(RequestMetric.duration_ms))
    ).limit(10)

    slowest_result = await db.execute(slowest_query)
    slowest_endpoints = [
        {
            "path": row.path,
            "avg_duration_ms": round(float(row.avg_duration_ms), 2),
            "request_count": row.request_count,
        }
        for row in slowest_result.all()
    ]

    return {
        "time_period_hours": hours,
        "requests": {
            "total": request_row.total_requests,
            "avg_duration_ms": round(float(request_row.avg_duration_ms or 0), 2),
            "error_count": request_row.error_count,
        },
        "operations_by_type": operations_by_type,
        "slowest_endpoints": slowest_endpoints,
    }
