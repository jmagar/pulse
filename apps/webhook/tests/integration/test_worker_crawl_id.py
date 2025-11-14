"""Integration tests for crawl_id propagation through worker."""

import pytest
from sqlalchemy import select

from domain.models import OperationMetric
from worker import _index_document_async


@pytest.mark.asyncio
async def test_worker_propagates_crawl_id(db_session):
    """Test worker passes crawl_id to IndexingService."""
    document_dict = {
        "url": "https://example.com/worker-test",
        "markdown": "# Worker Test\n\nContent here.",
        "metadata": {
            "url": "https://example.com/worker-test",
            "title": "Worker Test",
        },
        "crawl_id": "worker_test_crawl",  # NEW
    }

    result = await _index_document_async(document_dict)

    assert result.get("success") is True

    # Verify operations have crawl_id
    db_result = await db_session.execute(
        select(OperationMetric)
        .where(OperationMetric.crawl_id == "worker_test_crawl")
        .where(OperationMetric.document_url == "https://example.com/worker-test")
    )
    metrics = db_result.scalars().all()

    assert len(metrics) >= 2  # At least worker + one operation
    assert all(m.crawl_id == "worker_test_crawl" for m in metrics)
