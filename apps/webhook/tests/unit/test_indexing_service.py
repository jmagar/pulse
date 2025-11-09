"""
Unit tests for IndexingService.
"""

from unittest.mock import AsyncMock, MagicMock

import pytest

from app.models import IndexDocumentRequest
from app.services.indexing import IndexingService


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
    store.vector_dim = 2  # Must match embedding dimension
    store.index_chunks.return_value = 2
    return store


@pytest.fixture
def mock_bm25_engine() -> MagicMock:
    """Mock BM25Engine."""
    engine = MagicMock()
    return engine


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
async def test_index_document_success(
    indexing_service: IndexingService,
    mock_text_chunker: MagicMock,
    mock_embedding_service: AsyncMock,
    mock_vector_store: AsyncMock,
    mock_bm25_engine: MagicMock,
) -> None:
    """Test successful document indexing."""
    document = IndexDocumentRequest(
        url="https://example.com",
        resolvedUrl="https://example.com",
        title="Test Page",
        markdown="# Test\n\nThis is test content.",
        html="<h1>Test</h1>",
        statusCode=200,
        language="en",
        country="US",
    )

    result = await indexing_service.index_document(document)

    assert result["success"] is True
    assert result["url"] == "https://example.com"
    assert result["chunks_indexed"] == 2
    assert "total_tokens" in result

    # Verify all services called
    mock_text_chunker.chunk_text.assert_called_once()
    mock_embedding_service.embed_batch.assert_called_once()
    mock_vector_store.index_chunks.assert_called_once()
    mock_bm25_engine.index_document.assert_called_once()


@pytest.mark.asyncio
async def test_index_document_embedding_dimension_mismatch(
    indexing_service: IndexingService,
    mock_embedding_service: AsyncMock,
    mock_vector_store: AsyncMock,
) -> None:
    """Test that mismatched embedding dimensions are caught."""
    # Setup mocks
    mock_embedding_service.embed_batch.return_value = [
        [0.1, 0.2, 0.3, 0.4]  # 4 dimensions
    ]
    mock_vector_store.vector_dim = 2  # Expect 2 dimensions - mismatch!

    # Create sample document
    document = IndexDocumentRequest(
        url="https://example.com",
        resolvedUrl="https://example.com",
        title="Test Page",
        markdown="# Test\n\nThis is test content.",
        html="<h1>Test</h1>",
        statusCode=200,
        language="en",
        country="US",
    )

    # Index document
    result = await indexing_service.index_document(document)

    # Verify error was caught
    assert result["success"] is False
    assert "dimension mismatch" in result["error"].lower()
    assert result["chunks_indexed"] == 0


@pytest.mark.asyncio
async def test_index_document_empty_content(indexing_service: IndexingService) -> None:
    """Test indexing document with empty content."""
    document = IndexDocumentRequest(
        url="https://example.com",
        resolvedUrl="https://example.com",
        markdown="",
        html="",
        statusCode=200,
    )

    result = await indexing_service.index_document(document)

    assert result["success"] is False
    assert "No content" in result["error"]


@pytest.mark.asyncio
async def test_index_document_chunking_failure(
    indexing_service: IndexingService, mock_text_chunker: MagicMock
) -> None:
    """Test handling of chunking failure."""
    mock_text_chunker.chunk_text.side_effect = Exception("Chunking error")

    document = IndexDocumentRequest(
        url="https://example.com",
        resolvedUrl="https://example.com",
        markdown="Test content",
        html="<p>Test</p>",
        statusCode=200,
    )

    result = await indexing_service.index_document(document)

    assert result["success"] is False
    assert "Chunking failed" in result["error"]


@pytest.mark.asyncio
async def test_index_document_embedding_failure(
    indexing_service: IndexingService, mock_embedding_service: AsyncMock
) -> None:
    """Test handling of embedding generation failure."""
    mock_embedding_service.embed_batch.side_effect = Exception("Embedding error")

    document = IndexDocumentRequest(
        url="https://example.com",
        resolvedUrl="https://example.com",
        markdown="Test content",
        html="<p>Test</p>",
        statusCode=200,
    )

    result = await indexing_service.index_document(document)

    assert result["success"] is False
    assert "Embedding failed" in result["error"]


@pytest.mark.asyncio
async def test_index_document_vector_store_failure(
    indexing_service: IndexingService, mock_vector_store: AsyncMock
) -> None:
    """Test handling of vector store failure."""
    mock_vector_store.index_chunks.side_effect = Exception("Vector store error")

    document = IndexDocumentRequest(
        url="https://example.com",
        resolvedUrl="https://example.com",
        markdown="Test content",
        html="<p>Test</p>",
        statusCode=200,
    )

    result = await indexing_service.index_document(document)

    assert result["success"] is False
    assert "Vector indexing failed" in result["error"]


@pytest.mark.asyncio
async def test_index_document_no_chunks_generated(
    indexing_service: IndexingService, mock_text_chunker: MagicMock
) -> None:
    """Test when no chunks are generated."""
    mock_text_chunker.chunk_text.return_value = []

    document = IndexDocumentRequest(
        url="https://example.com",
        resolvedUrl="https://example.com",
        markdown="Short",
        html="<p>Short</p>",
        statusCode=200,
    )

    result = await indexing_service.index_document(document)

    assert result["success"] is False
    assert "No chunks generated" in result["error"]


@pytest.mark.asyncio
async def test_metadata_extraction(
    indexing_service: IndexingService, mock_text_chunker: MagicMock
) -> None:
    """Test metadata extraction and propagation."""
    document = IndexDocumentRequest(
        url="https://example.com/page",
        resolvedUrl="https://example.com/page",
        title="Test Page",
        description="Test Description",
        markdown="Content",
        html="<p>Content</p>",
        statusCode=200,
        language="en",
        country="US",
        isMobile=True,
    )

    await indexing_service.index_document(document)

    # Check chunker was called with correct metadata
    call_args = mock_text_chunker.chunk_text.call_args
    # metadata is passed as second positional arg
    metadata = call_args[0][1] if len(call_args[0]) > 1 else call_args[1].get("metadata", {})

    assert metadata["url"] == "https://example.com/page"
    assert metadata["title"] == "Test Page"
    assert metadata["description"] == "Test Description"
    assert metadata["language"] == "en"
    assert metadata["country"] == "US"
    assert metadata["isMobile"] is True
    assert "domain" in metadata
