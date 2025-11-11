"""
Unit tests for VectorStore.
"""

from collections.abc import Generator
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from services.vector_store import VectorStore


@pytest.fixture
def mock_qdrant_client() -> AsyncMock:
    """Create mocked Qdrant client."""
    return AsyncMock()


@pytest.fixture
def vector_store(mock_qdrant_client: AsyncMock) -> Generator[VectorStore]:
    """Create VectorStore with mocked client."""
    with patch("app.services.vector_store.AsyncQdrantClient", return_value=mock_qdrant_client):
        store = VectorStore(
            url="http://localhost:52102",
            collection_name="test_collection",
            vector_dim=384,
        )
        store.client = mock_qdrant_client
        yield store


@pytest.mark.asyncio
async def test_health_check_success(
    vector_store: VectorStore, mock_qdrant_client: AsyncMock
) -> None:
    """Test successful health check."""
    mock_qdrant_client.get_collections.return_value = MagicMock(collections=[])

    result = await vector_store.health_check()

    assert result is True


@pytest.mark.asyncio
async def test_health_check_failure(
    vector_store: VectorStore, mock_qdrant_client: AsyncMock
) -> None:
    """Test failed health check."""
    mock_qdrant_client.get_collections.side_effect = Exception("Connection failed")

    result = await vector_store.health_check()

    assert result is False


@pytest.mark.asyncio
async def test_ensure_collection_creates_new(
    vector_store: VectorStore, mock_qdrant_client: AsyncMock
) -> None:
    """Test creating new collection."""
    mock_qdrant_client.get_collections.return_value = MagicMock(collections=[])

    await vector_store.ensure_collection()

    mock_qdrant_client.create_collection.assert_called_once()


@pytest.mark.asyncio
async def test_ensure_collection_exists(
    vector_store: VectorStore, mock_qdrant_client: AsyncMock
) -> None:
    """Test when collection already exists."""
    existing_collection = MagicMock()
    existing_collection.name = "test_collection"
    mock_qdrant_client.get_collections.return_value = MagicMock(collections=[existing_collection])

    await vector_store.ensure_collection()

    mock_qdrant_client.create_collection.assert_not_called()


@pytest.mark.asyncio
async def test_index_chunks_success(
    vector_store: VectorStore, mock_qdrant_client: AsyncMock
) -> None:
    """Test successful chunk indexing."""
    chunks: list[dict[str, Any]] = [
        {"text": "chunk1", "chunk_index": 0, "token_count": 100, "title": "Test"},
        {"text": "chunk2", "chunk_index": 1, "token_count": 100},
    ]
    embeddings = [[0.1, 0.2], [0.3, 0.4]]

    result = await vector_store.index_chunks(chunks, embeddings, "https://example.com")

    assert result == 2
    mock_qdrant_client.upsert.assert_called_once()

    # Verify point structure
    call_args = mock_qdrant_client.upsert.call_args
    points = call_args[1]["points"]
    assert len(points) == 2
    assert points[0].payload["url"] == "https://example.com"
    assert points[0].payload["text"] == "chunk1"
    assert points[0].payload["title"] == "Test"


@pytest.mark.asyncio
async def test_index_chunks_mismatch_error(
    vector_store: VectorStore, mock_qdrant_client: AsyncMock
) -> None:
    """Test error when chunk/embedding count mismatch."""
    chunks: list[dict[str, Any]] = [{"text": "chunk1", "chunk_index": 0, "token_count": 100}]
    embeddings = [[0.1], [0.2]]  # More embeddings than chunks

    with pytest.raises(ValueError, match="mismatch"):
        await vector_store.index_chunks(chunks, embeddings, "https://example.com")


@pytest.mark.asyncio
async def test_search_without_filters(
    vector_store: VectorStore, mock_qdrant_client: AsyncMock
) -> None:
    """Test search without filters."""
    mock_result = MagicMock()
    mock_result.id = "id1"
    mock_result.score = 0.95
    mock_result.payload = {"url": "https://example.com", "text": "result text"}
    mock_qdrant_client.search.return_value = [mock_result]

    results = await vector_store.search([0.1, 0.2, 0.3], limit=10)

    assert len(results) == 1
    assert results[0]["score"] == 0.95
    assert results[0]["payload"]["url"] == "https://example.com"

    # Verify no filter was passed
    call_args = mock_qdrant_client.search.call_args
    assert call_args[1]["query_filter"] is None


@pytest.mark.asyncio
async def test_search_with_domain_filter(
    vector_store: VectorStore, mock_qdrant_client: AsyncMock
) -> None:
    """Test search with domain filter."""
    mock_qdrant_client.search.return_value = []

    await vector_store.search([0.1], domain="example.com")

    call_args = mock_qdrant_client.search.call_args
    query_filter = call_args[1]["query_filter"]
    assert query_filter is not None
    assert len(query_filter.must) == 1


@pytest.mark.asyncio
async def test_search_with_multiple_filters(
    vector_store: VectorStore, mock_qdrant_client: AsyncMock
) -> None:
    """Test search with multiple filters."""
    mock_qdrant_client.search.return_value = []

    await vector_store.search(
        [0.1],
        domain="example.com",
        language="en",
        country="US",
        is_mobile=False,
    )

    call_args = mock_qdrant_client.search.call_args
    query_filter = call_args[1]["query_filter"]
    assert len(query_filter.must) == 4


@pytest.mark.asyncio
async def test_count_points(vector_store: VectorStore, mock_qdrant_client: AsyncMock) -> None:
    """Test counting points."""
    mock_info = MagicMock()
    mock_info.points_count = 42
    mock_qdrant_client.get_collection.return_value = mock_info

    count = await vector_store.count_points()

    assert count == 42


@pytest.mark.asyncio
async def test_count_points_error(vector_store: VectorStore, mock_qdrant_client: AsyncMock) -> None:
    """Test count_points error handling."""
    mock_qdrant_client.get_collection.side_effect = Exception("Error")

    count = await vector_store.count_points()

    assert count == 0


@pytest.mark.asyncio
async def test_close(vector_store: VectorStore, mock_qdrant_client: AsyncMock) -> None:
    """Test client cleanup."""
    await vector_store.close()

    mock_qdrant_client.close.assert_called_once()
