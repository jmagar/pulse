"""Unit tests for OperationMetric crawl_id field."""


import pytest
from sqlalchemy import select

from domain.models import OperationMetric


@pytest.mark.asyncio
async def test_operation_metric_with_crawl_id(db_session):
    """Test OperationMetric stores crawl_id correctly."""
    metric = OperationMetric(
        operation_type="chunking",
        operation_name="chunk_text",
        duration_ms=150.5,
        success=True,
        crawl_id="test_crawl_abc",
        document_url="https://example.com/page1",
    )
    db_session.add(metric)
    await db_session.commit()

    result = await db_session.execute(
        select(OperationMetric).where(OperationMetric.crawl_id == "test_crawl_abc")
    )
    fetched = result.scalar_one()

    assert fetched.crawl_id == "test_crawl_abc"
    assert fetched.operation_type == "chunking"
