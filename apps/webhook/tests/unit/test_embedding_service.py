"""
Unit tests for EmbeddingService.
"""



from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from app.services.embedding import EmbeddingService


@pytest.fixture
def mock_httpx_client() -> AsyncMock:
    """Create mocked httpx.AsyncClient."""
    client = AsyncMock()
    return client


@pytest.fixture
def embedding_service(mock_httpx_client: AsyncMock) -> EmbeddingService:
    """Create EmbeddingService with mocked client."""
    with patch("app.services.embedding.httpx.AsyncClient", return_value=mock_httpx_client):
        service = EmbeddingService(tei_url="http://localhost:52104")
        service.client = mock_httpx_client
        return service


@pytest.mark.asyncio
async def test_health_check_success(embedding_service: EmbeddingService, mock_httpx_client: AsyncMock) -> None:
    """Test successful health check."""
    mock_httpx_client.get.return_value = MagicMock(status_code=200)

    result = await embedding_service.health_check()

    assert result is True
    mock_httpx_client.get.assert_called_once_with("http://localhost:52104/health")


@pytest.mark.asyncio
async def test_health_check_failure(embedding_service: EmbeddingService, mock_httpx_client: AsyncMock) -> None:
    """Test failed health check."""
    mock_httpx_client.get.side_effect = httpx.RequestError("Connection failed")

    result = await embedding_service.health_check()

    assert result is False


@pytest.mark.asyncio
async def test_embed_single_success(embedding_service: EmbeddingService, mock_httpx_client: AsyncMock) -> None:
    """Test successful single text embedding."""
    mock_response = MagicMock()
    mock_response.json.return_value = [[0.1, 0.2, 0.3]]
    mock_httpx_client.post.return_value = mock_response

    embedding = await embedding_service.embed_single("test text")

    assert embedding == [0.1, 0.2, 0.3]
    mock_httpx_client.post.assert_called_once()


@pytest.mark.asyncio
async def test_embed_single_empty_text(embedding_service: EmbeddingService, mock_httpx_client: AsyncMock) -> None:
    """Test embedding empty text raises ValueError."""
    with pytest.raises(ValueError, match="Empty text provided"):
        await embedding_service.embed_single("")

    mock_httpx_client.post.assert_not_called()


@pytest.mark.asyncio
async def test_embed_batch_success(embedding_service: EmbeddingService, mock_httpx_client: AsyncMock) -> None:
    """Test successful batch embedding."""
    mock_response = MagicMock()
    mock_response.json.return_value = [[0.1, 0.2], [0.3, 0.4], [0.5, 0.6]]
    mock_httpx_client.post.return_value = mock_response

    embeddings = await embedding_service.embed_batch(["text1", "text2", "text3"])

    assert len(embeddings) == 3
    assert embeddings[0] == [0.1, 0.2]


@pytest.mark.asyncio
async def test_embed_batch_empty_list(embedding_service: EmbeddingService, mock_httpx_client: AsyncMock) -> None:
    """Test batch embedding with empty list raises ValueError."""
    with pytest.raises(ValueError, match="Empty text list provided"):
        await embedding_service.embed_batch([])

    mock_httpx_client.post.assert_not_called()


@pytest.mark.asyncio
async def test_embed_batch_filters_empty_texts(embedding_service: EmbeddingService, mock_httpx_client: AsyncMock) -> None:
    """Test batch embedding filters out empty texts."""
    mock_response = MagicMock()
    mock_response.json.return_value = [[0.1, 0.2]]
    mock_httpx_client.post.return_value = mock_response

    await embedding_service.embed_batch(["valid text", "", "  "])

    # Should only embed the valid text
    call_args = mock_httpx_client.post.call_args
    assert call_args[1]["json"]["inputs"] == ["valid text"]


@pytest.mark.asyncio
async def test_embed_dispatcher_single(embedding_service: EmbeddingService, mock_httpx_client: AsyncMock) -> None:
    """Test embed() dispatcher with single string."""
    mock_response = MagicMock()
    mock_response.json.return_value = [[0.1, 0.2, 0.3]]
    mock_httpx_client.post.return_value = mock_response

    result = await embedding_service.embed("single text")

    assert isinstance(result, list)
    assert result == [0.1, 0.2, 0.3]


@pytest.mark.asyncio
async def test_embed_dispatcher_batch(embedding_service: EmbeddingService, mock_httpx_client: AsyncMock) -> None:
    """Test embed() dispatcher with list."""
    mock_response = MagicMock()
    mock_response.json.return_value = [[0.1], [0.2]]
    mock_httpx_client.post.return_value = mock_response

    result = await embedding_service.embed(["text1", "text2"])

    assert isinstance(result, list)
    assert len(result) == 2


@pytest.mark.asyncio
async def test_close(embedding_service: EmbeddingService, mock_httpx_client: AsyncMock) -> None:
    """Test client cleanup."""
    await embedding_service.close()

    mock_httpx_client.aclose.assert_called_once()
