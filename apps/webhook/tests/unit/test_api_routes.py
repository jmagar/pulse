"""
Unit tests for API routes with mocked dependencies.
"""

from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from api.routers import health, indexing, search
from api.schemas.indexing import IndexDocumentRequest
from api.schemas.search import SearchMode, SearchRequest


@pytest.fixture
def mock_request() -> MagicMock:
    """Mock Starlette Request object."""
    request = MagicMock(spec=Request)
    request.client.host = "127.0.0.1"
    return request


@pytest.fixture
def mock_queue() -> MagicMock:
    """Mock RQ queue."""
    queue = MagicMock()
    mock_job = MagicMock()
    mock_job.id = "test-job-123"
    queue.enqueue.return_value = mock_job
    return queue


@pytest.fixture
def mock_search_orchestrator() -> AsyncMock:
    """Mock SearchOrchestrator."""
    orchestrator = AsyncMock()
    orchestrator.search.return_value = (
        [
            {
                "id": "1",
                "score": 0.95,
                "payload": {"url": "url1", "text": "result", "title": "Title"},
            },
        ],
        1,
    )
    return orchestrator


@pytest.fixture
def mock_services() -> dict[str, Any]:
    """Mock all services for health check."""
    embedding = AsyncMock()
    embedding.health_check.return_value = True

    vector_store = AsyncMock()
    vector_store.health_check.return_value = True
    vector_store.count_points.return_value = 100
    vector_store.collection_name = "test_collection"  # Add this for stats

    bm25 = MagicMock()
    bm25.get_document_count.return_value = 50

    return {
        "embedding": embedding,
        "vector_store": vector_store,
        "bm25": bm25,
    }


@pytest.mark.asyncio
async def test_index_document_success(mock_request: MagicMock, mock_queue: MagicMock) -> None:
    """Test successful document indexing."""
    document = IndexDocumentRequest(
        url="https://example.com",
        resolvedUrl="https://example.com",
        markdown="# Test",
        html="<h1>Test</h1>",
        statusCode=200,
    )

    result = await indexing.index_document(mock_request, document, mock_queue)

    assert result.job_id == "test-job-123"
    assert result.status == "queued"
    assert "queued" in result.message.lower()

    mock_queue.enqueue.assert_called_once()


@pytest.mark.asyncio
async def test_index_document_queue_failure(mock_request: MagicMock, mock_queue: MagicMock) -> None:
    """Test handling of queue failure."""
    mock_queue.enqueue.side_effect = Exception("Queue error")

    document = IndexDocumentRequest(
        url="https://example.com",
        resolvedUrl="https://example.com",
        markdown="# Test",
        html="<h1>Test</h1>",
        statusCode=200,
    )

    with pytest.raises(HTTPException) as exc_info:
        await indexing.index_document(mock_request, document, mock_queue)

    assert exc_info.value.status_code == 500


@pytest.mark.asyncio
async def test_search_documents_success(
    mock_request: MagicMock, mock_search_orchestrator: AsyncMock
) -> None:
    """Test successful search."""
    search_request = SearchRequest(
        query="test query",
        mode=SearchMode.HYBRID,
        limit=10,
        offset=0,
    )

    response = await search.search_documents(mock_request, search_request, mock_search_orchestrator)

    assert response.query == "test query"
    assert response.mode == SearchMode.HYBRID
    assert len(response.results) == 1
    assert response.total == 1
    assert response.results[0].url == "url1"
    assert response.results[0].id == "1"

    mock_search_orchestrator.search.assert_called_once()


@pytest.mark.asyncio
async def test_search_returns_accurate_total(
    mock_request: MagicMock, mock_search_orchestrator: AsyncMock
) -> None:
    """Total count comes from orchestrator tuple."""
    mock_search_orchestrator.search.return_value = (
        [{"id": "1", "score": 0.95, "payload": {"url": "url1", "text": "result"}}],
        47,
    )

    search_request = SearchRequest(
        query="test",
        mode=SearchMode.HYBRID,
        limit=5,
        offset=10,
    )

    response = await search.search_documents(mock_request, search_request, mock_search_orchestrator)

    assert response.total == 47
    assert len(response.results) == 1
    call_args = mock_search_orchestrator.search.call_args
    assert call_args[1]["offset"] == 10


@pytest.mark.asyncio
async def test_search_documents_with_filters(
    mock_request: MagicMock, mock_search_orchestrator: AsyncMock
) -> None:
    """Test search with filters."""
    from api.schemas.search import SearchFilter

    search_request = SearchRequest(
        query="test",
        mode=SearchMode.SEMANTIC,
        limit=5,
        filters=SearchFilter(domain="example.com", language="en"),
    )

    await search.search_documents(mock_request, search_request, mock_search_orchestrator)

    call_args = mock_search_orchestrator.search.call_args
    assert call_args[1]["domain"] == "example.com"
    assert call_args[1]["language"] == "en"
    assert call_args[1]["offset"] == 0


@pytest.mark.asyncio
async def test_search_documents_failure(
    mock_request: MagicMock, mock_search_orchestrator: AsyncMock
) -> None:
    """Test search failure handling."""
    mock_search_orchestrator.search.side_effect = Exception("Search error")

    search_request = SearchRequest(query="test", mode=SearchMode.HYBRID, limit=10)

    with pytest.raises(HTTPException) as exc_info:
        await search.search_documents(mock_request, search_request, mock_search_orchestrator)

    assert exc_info.value.status_code == 500


@pytest.mark.asyncio
async def test_health_check_all_healthy(mock_services: dict[str, Any]) -> None:
    """Test health check with all services healthy."""
    with patch("api.deps.get_redis_connection") as mock_redis:
        mock_redis_instance = MagicMock()
        mock_redis_instance.ping.return_value = True
        mock_redis.return_value = mock_redis_instance

        response = await health.health_check(
            mock_services["embedding"],
            mock_services["vector_store"],
        )

        assert response.status == "healthy"
        assert response.services["redis"] == "healthy"
        assert response.services["qdrant"] == "healthy"
        assert response.services["tei"] == "healthy"


@pytest.mark.asyncio
async def test_health_check_partial_failure(mock_services: dict[str, Any]) -> None:
    """Test health check with some services down."""
    mock_services["embedding"].health_check.return_value = False

    with patch("api.deps.get_redis_connection") as mock_redis:
        mock_redis_instance = MagicMock()
        mock_redis_instance.ping.return_value = True
        mock_redis.return_value = mock_redis_instance

        response = await health.health_check(
            mock_services["embedding"],
            mock_services["vector_store"],
        )

        assert response.status == "degraded"
        assert response.services["tei"] == "unhealthy"


@pytest.mark.asyncio
async def test_get_stats_success(mock_services: dict[str, Any]) -> None:
    """Test stats endpoint success."""
    response = await search.get_stats(
        mock_services["vector_store"],
        mock_services["bm25"],
    )

    assert response.total_documents == 50
    assert response.total_chunks == 100
    assert response.qdrant_points == 100
    assert response.bm25_documents == 50


@pytest.mark.asyncio
async def test_get_stats_failure(mock_services: dict[str, Any]) -> None:
    """Test stats endpoint error handling."""
    mock_services["vector_store"].count_points.side_effect = Exception("Stats error")

    with pytest.raises(HTTPException) as exc_info:
        await search.get_stats(
            mock_services["vector_store"],
            mock_services["bm25"],
        )

    assert exc_info.value.status_code == 500


@pytest.mark.asyncio
async def test_search_text_extraction_from_vector_payload(mock_request: MagicMock) -> None:
    """
    Test that text snippets are extracted correctly from vector search results.

    Vector search results have text in payload.
    """
    orchestrator = AsyncMock()
    orchestrator.search.return_value = (
        [
            {
                "id": "vec1",
                "score": 0.95,
                "payload": {
                    "url": "https://example.com/page1",
                    "text": "This is the vector search snippet",
                    "title": "Page 1",
                    "canonical_url": "https://example.com/page1",
                },
            },
        ],
        1,
    )

    search_request = SearchRequest(
        query="test query",
        mode=SearchMode.SEMANTIC,
        limit=10,
    )

    response = await search.search_documents(mock_request, search_request, orchestrator)

    assert len(response.results) == 1
    assert response.results[0].text == "This is the vector search snippet"
    assert response.results[0].url == "https://example.com/page1"
    assert response.results[0].title == "Page 1"


@pytest.mark.asyncio
async def test_search_text_extraction_from_bm25_top_level(mock_request: MagicMock) -> None:
    """
    Test that text snippets are extracted correctly from BM25 search results.

    BM25 search results have text as a top-level field, not in metadata.
    """
    orchestrator = AsyncMock()
    orchestrator.search.return_value = (
        [
            {
                "index": 0,
                "score": 5.2,
                "text": "This is the BM25 keyword snippet",
                "metadata": {
                    "url": "https://example.com/page2",
                    "title": "Page 2",
                    "canonical_url": "https://example.com/page2",
                },
            },
        ],
        1,
    )

    search_request = SearchRequest(
        query="test query",
        mode=SearchMode.BM25,
        limit=10,
    )

    response = await search.search_documents(mock_request, search_request, orchestrator)

    assert len(response.results) == 1
    # This should extract text from top-level, not from metadata
    assert response.results[0].text == "This is the BM25 keyword snippet"
    assert response.results[0].url == "https://example.com/page2"
    assert response.results[0].title == "Page 2"


@pytest.mark.asyncio
async def test_search_text_extraction_hybrid_mixed_sources(mock_request: MagicMock) -> None:
    """
    Test that text snippets are extracted correctly from hybrid search.

    Hybrid search mixes vector results (text in payload) and BM25 results (text at top level).
    """
    orchestrator = AsyncMock()
    orchestrator.search.return_value = (
        [
            # Vector result with text in payload
            {
                "id": "vec1",
                "score": 0.95,
                "payload": {
                    "url": "https://example.com/vector",
                    "text": "Vector snippet",
                    "title": "Vector Result",
                    "content_id": 999,
                    "domain": "example.com",
                    "language": "en",
                    "country": "us",
                    "is_mobile": True,
                    "section": "Docs",
                    "source_type": "documentation",
                },
                "rrf_score": 0.032,
            },
            # BM25 result with text at top level
            {
                "index": 0,
                "score": 5.2,
                "text": "BM25 snippet",
                "metadata": {
                    "url": "https://example.com/bm25",
                    "title": "BM25 Result",
                    "domain": "example.com",
                    "language": "en",
                    "country": "us",
                    "is_mobile": True,
                    "section": "Docs",
                    "source_type": "documentation",
                },
                "rrf_score": 0.028,
            },
        ],
        2,
    )

    search_request = SearchRequest(
        query="test query",
        mode=SearchMode.HYBRID,
        limit=10,
    )

    response = await search.search_documents(mock_request, search_request, orchestrator)

    assert len(response.results) == 2

    # First result (vector)
    assert response.results[0].text == "Vector snippet"
    assert response.results[0].url == "https://example.com/vector"
    assert response.results[0].id == 999
    assert response.results[0].metadata.get("is_mobile") is True

    # Second result (BM25)
    assert response.results[1].text == "BM25 snippet"
    assert response.results[1].url == "https://example.com/bm25"
