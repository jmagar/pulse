"""Unit tests for IndexingService crawl_id propagation."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from api.schemas.indexing import IndexDocumentRequest
from services.indexing import IndexingService


@pytest.fixture
def mock_text_chunker() -> MagicMock:
    """Mock TextChunker."""
    chunker = MagicMock()
    chunker.chunk_text.return_value = [
        {"text": "chunk1", "chunk_index": 0, "token_count": 100},
        {"text": "chunk2", "chunk_index": 1, "token_count": 100},
    ]
    return chunker


@pytest.fixture
def mock_embedding_service() -> AsyncMock:
    """Mock EmbeddingService."""
    service = AsyncMock()
    service.embed_batch.return_value = [[0.1, 0.2], [0.3, 0.4]]
    return service


@pytest.fixture
def mock_vector_store() -> AsyncMock:
    """Mock VectorStore."""
    store = AsyncMock()
    store.vector_dim = 2
    store.index_chunks.return_value = 2
    return store


@pytest.fixture
def mock_bm25_engine() -> MagicMock:
    """Mock BM25Engine."""
    return MagicMock()


@pytest.fixture
def indexing_service(
    mock_text_chunker: MagicMock,
    mock_embedding_service: AsyncMock,
    mock_vector_store: AsyncMock,
    mock_bm25_engine: MagicMock,
) -> IndexingService:
    """Create IndexingService with mocked dependencies."""
    return IndexingService(
        text_chunker=mock_text_chunker,
        embedding_service=mock_embedding_service,
        vector_store=mock_vector_store,
        bm25_engine=mock_bm25_engine,
    )


@pytest.mark.asyncio
@pytest.mark.no_db
async def test_indexing_service_propagates_crawl_id(indexing_service: IndexingService):
    """Test IndexingService passes crawl_id to all TimingContexts."""
    doc = IndexDocumentRequest(
        url="https://example.com/test",
        resolvedUrl="https://example.com/test",
        markdown="# Test Document\n\nSome content here for testing.",
        html="<html><body><h1>Test Document</h1><p>Some content here for testing.</p></body></html>",
        statusCode=200,
        title="Test Page",
    )

    # Spy on TimingContext to verify crawl_id is passed
    timing_contexts = []

    class MockTimingContext:
        def __init__(self, operation_type, operation_name, job_id=None, crawl_id=None, document_url=None, request_id=None):
            self.operation_type = operation_type
            self.operation_name = operation_name
            self.job_id = job_id
            self.crawl_id = crawl_id
            self.document_url = document_url
            self.metadata = {}
            timing_contexts.append(self)

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc_val, exc_tb):
            return None

    with patch("services.indexing.TimingContext", MockTimingContext):
        result = await indexing_service.index_document(
            doc,
            job_id="test_job_123",
            crawl_id="indexing_test_crawl"
        )

    # Verify success
    assert result["success"] is True

    # Verify all 4 TimingContext calls have crawl_id
    assert len(timing_contexts) == 4, f"Expected 4 TimingContext calls, got {len(timing_contexts)}"

    operation_types = [ctx.operation_type for ctx in timing_contexts]
    assert "chunking" in operation_types
    assert "embedding" in operation_types
    assert "qdrant" in operation_types
    assert "bm25" in operation_types

    # Verify all contexts received the crawl_id
    for ctx in timing_contexts:
        assert ctx.crawl_id == "indexing_test_crawl", f"TimingContext for {ctx.operation_type} missing crawl_id"
        assert ctx.job_id == "test_job_123"
