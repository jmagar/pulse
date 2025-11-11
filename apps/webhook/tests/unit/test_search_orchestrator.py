"""
Unit tests for SearchOrchestrator.
"""

from unittest.mock import AsyncMock, MagicMock

import pytest

from app.models import SearchMode
from app.services.search import SearchOrchestrator


@pytest.fixture
def mock_embedding_service() -> AsyncMock:
    """Mock EmbeddingService."""
    service = AsyncMock()
    service.embed_single.return_value = [0.1, 0.2, 0.3]
    return service


@pytest.fixture
def mock_vector_store() -> AsyncMock:
    """Mock VectorStore."""
    store = AsyncMock()
    store.search.return_value = [
        {"id": "1", "score": 0.95, "payload": {"url": "url1", "text": "result1"}},
        {"id": "2", "score": 0.85, "payload": {"url": "url2", "text": "result2"}},
    ]
    return store


@pytest.fixture
def mock_bm25_engine() -> MagicMock:
    """Mock BM25Engine."""
    engine = MagicMock()
    engine.search.return_value = [
        {"index": 0, "score": 0.9, "text": "result1", "metadata": {"url": "url1"}},
        {"index": 1, "score": 0.8, "text": "result3", "metadata": {"url": "url3"}},
    ]
    return engine


@pytest.fixture
def orchestrator(
    mock_embedding_service: AsyncMock, mock_vector_store: AsyncMock, mock_bm25_engine: MagicMock
) -> SearchOrchestrator:
    """Create SearchOrchestrator with mocked dependencies."""
    return SearchOrchestrator(
        embedding_service=mock_embedding_service,
        vector_store=mock_vector_store,
        bm25_engine=mock_bm25_engine,
        rrf_k=60,
    )


def test_orchestrator_initialization(orchestrator: SearchOrchestrator) -> None:
    """Test SearchOrchestrator initialization."""
    assert orchestrator.embedding_service is not None
    assert orchestrator.vector_store is not None
    assert orchestrator.bm25_engine is not None
    assert orchestrator.rrf_k == 60


@pytest.mark.asyncio
async def test_search_hybrid_mode(
    orchestrator: SearchOrchestrator,
    mock_embedding_service: AsyncMock,
    mock_vector_store: AsyncMock,
    mock_bm25_engine: MagicMock,
) -> None:
    """Test hybrid search mode calls both sources."""
    results = await orchestrator.search("test query", mode=SearchMode.HYBRID, limit=10)

    # Verify both sources called
    mock_embedding_service.embed_single.assert_called_once_with("test query")
    mock_vector_store.search.assert_called_once()
    mock_bm25_engine.search.assert_called_once()

    # Results should be fused
    assert isinstance(results, list)
    assert len(results) > 0


@pytest.mark.asyncio
async def test_search_semantic_mode(
    orchestrator: SearchOrchestrator,
    mock_embedding_service: AsyncMock,
    mock_vector_store: AsyncMock,
    mock_bm25_engine: MagicMock,
) -> None:
    """Test semantic search mode only uses vector search."""
    results = await orchestrator.search("test query", mode=SearchMode.SEMANTIC, limit=10)

    # Only vector search should be called
    mock_embedding_service.embed_single.assert_called_once()
    mock_vector_store.search.assert_called_once()
    mock_bm25_engine.search.assert_not_called()

    assert isinstance(results, list)


@pytest.mark.asyncio
async def test_search_keyword_mode(
    orchestrator: SearchOrchestrator,
    mock_embedding_service: AsyncMock,
    mock_vector_store: AsyncMock,
    mock_bm25_engine: MagicMock,
) -> None:
    """Test keyword search mode only uses BM25."""
    results = await orchestrator.search("test query", mode=SearchMode.KEYWORD, limit=10)

    # Only BM25 should be called
    mock_bm25_engine.search.assert_called_once()
    mock_embedding_service.embed_single.assert_not_called()
    mock_vector_store.search.assert_not_called()

    assert isinstance(results, list)


@pytest.mark.asyncio
async def test_search_bm25_mode(
    orchestrator: SearchOrchestrator, mock_bm25_engine: MagicMock
) -> None:
    """Test BM25 mode (alias for keyword)."""
    results = await orchestrator.search("test query", mode=SearchMode.BM25, limit=10)

    mock_bm25_engine.search.assert_called_once()
    assert isinstance(results, list)


@pytest.mark.asyncio
async def test_search_with_domain_filter(
    orchestrator: SearchOrchestrator, mock_vector_store: AsyncMock, mock_bm25_engine: MagicMock
) -> None:
    """Test domain filter is propagated."""
    await orchestrator.search("test query", mode=SearchMode.HYBRID, limit=10, domain="example.com")

    # Check vector store received filter
    vector_call = mock_vector_store.search.call_args
    assert vector_call[1]["domain"] == "example.com"

    # Check BM25 received filter
    bm25_call = mock_bm25_engine.search.call_args
    assert bm25_call[1]["domain"] == "example.com"


@pytest.mark.asyncio
async def test_search_with_all_filters(
    orchestrator: SearchOrchestrator, mock_vector_store: AsyncMock, mock_bm25_engine: MagicMock
) -> None:
    """Test all filters are propagated."""
    await orchestrator.search(
        "test query",
        mode=SearchMode.HYBRID,
        limit=10,
        domain="example.com",
        language="en",
        country="US",
        is_mobile=True,
    )

    # Check all filters passed to vector store
    vector_call = mock_vector_store.search.call_args
    assert vector_call[1]["domain"] == "example.com"
    assert vector_call[1]["language"] == "en"
    assert vector_call[1]["country"] == "US"
    assert vector_call[1]["is_mobile"] is True


@pytest.mark.asyncio
async def test_search_empty_query(
    orchestrator: SearchOrchestrator, mock_embedding_service: AsyncMock
) -> None:
    """Test search with empty query."""
    mock_embedding_service.embed_single.return_value = []

    results = await orchestrator.search("", mode=SearchMode.SEMANTIC, limit=10)

    # Should return empty results gracefully
    assert results == []


@pytest.mark.asyncio
async def test_search_no_results(
    orchestrator: SearchOrchestrator, mock_vector_store: AsyncMock, mock_bm25_engine: MagicMock
) -> None:
    """Test search with no results from either source."""
    mock_vector_store.search.return_value = []
    mock_bm25_engine.search.return_value = []

    results = await orchestrator.search("test query", mode=SearchMode.HYBRID, limit=10)

    assert results == []


@pytest.mark.asyncio
async def test_search_invalid_mode(orchestrator: SearchOrchestrator) -> None:
    """Test search with invalid mode raises error."""
    with pytest.raises(ValueError, match="Unknown search mode"):
        await orchestrator.search("test", mode="invalid_mode", limit=10)  # type: ignore[arg-type]


@pytest.mark.asyncio
async def test_hybrid_search_limit_expansion(
    orchestrator: SearchOrchestrator, mock_vector_store: AsyncMock, mock_bm25_engine: MagicMock
) -> None:
    """Test hybrid search gets more results for fusion."""
    await orchestrator.search("test", mode=SearchMode.HYBRID, limit=10)

    # Should request limit * 2 from each source for better fusion
    vector_call = mock_vector_store.search.call_args
    assert vector_call[1]["limit"] == 20

    bm25_call = mock_bm25_engine.search.call_args
    assert bm25_call[1]["limit"] == 20
