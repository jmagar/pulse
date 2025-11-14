"""Unit tests for IndexingService crawl_id propagation."""

import pytest
from sqlalchemy import select

from domain.models import OperationMetric


@pytest.mark.asyncio
async def test_indexing_service_propagates_crawl_id(db_session):
    """Test IndexingService passes crawl_id to all TimingContexts."""
    from api.schemas.indexing import IndexDocumentRequest, DocumentMetadata

    # Create test document
    doc = IndexDocumentRequest(
        url="https://example.com/test",
        markdown="# Test Document\n\nSome content here.",
        metadata=DocumentMetadata(
            url="https://example.com/test",
            title="Test Page",
        ),
    )

    # Index with crawl_id
    from infra.services import ServicePool
    pool = ServicePool.get_instance()
    indexing_service = pool.get_indexing_service()

    await indexing_service.index_document(
        doc,
        job_id="test_job_123",
        crawl_id="indexing_test_crawl"
    )

    # Verify all operations have crawl_id
    result = await db_session.execute(
        select(OperationMetric)
        .where(OperationMetric.crawl_id == "indexing_test_crawl")
        .where(OperationMetric.job_id == "test_job_123")
    )
    metrics = result.scalars().all()

    # Should have metrics for: chunking, embedding, qdrant, bm25
    assert len(metrics) >= 4

    operation_types = {m.operation_type for m in metrics}
    assert "chunking" in operation_types
    assert "embedding" in operation_types
    assert "qdrant" in operation_types or "bm25" in operation_types
