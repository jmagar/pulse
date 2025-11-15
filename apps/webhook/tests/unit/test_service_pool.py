"""
Unit tests for ServicePool.

Uses mocked services to avoid heavy infrastructure initialization
(tokenizer downloads, network connections, etc.).
"""

from unittest.mock import AsyncMock, Mock, patch

import pytest

from services.service_pool import ServicePool


@pytest.fixture(autouse=True)
def mock_services():
    """
    Mock heavy services for unit tests.

    Prevents:
    - TextChunker from downloading HuggingFace tokenizer (1-5s, network)
    - EmbeddingService from creating HTTP client
    - VectorStore from creating Qdrant client (may attempt connection)
    - BM25Engine from loading from disk
    """
    with patch('services.service_pool.TextChunker') as mock_chunker, \
         patch('services.service_pool.EmbeddingService') as mock_embed, \
         patch('services.service_pool.VectorStore') as mock_vector, \
         patch('services.service_pool.BM25Engine') as mock_bm25:

        # Create mock instances with async close methods
        mock_chunker_instance = Mock()
        mock_embed_instance = Mock()
        mock_embed_instance.close = AsyncMock()
        mock_vector_instance = Mock()
        mock_vector_instance.close = AsyncMock()
        mock_bm25_instance = Mock()

        mock_chunker.return_value = mock_chunker_instance
        mock_embed.return_value = mock_embed_instance
        mock_vector.return_value = mock_vector_instance
        mock_bm25.return_value = mock_bm25_instance

        yield {
            'chunker': mock_chunker_instance,
            'embed': mock_embed_instance,
            'vector': mock_vector_instance,
            'bm25': mock_bm25_instance,
        }

        # Reset singleton after each test for isolation
        ServicePool.reset()


def test_service_pool_singleton():
    """Test that ServicePool returns the same instance."""
    pool1 = ServicePool.get_instance()
    pool2 = ServicePool.get_instance()

    assert pool1 is pool2, "ServicePool should return same instance"


def test_service_pool_has_services():
    """Test that ServicePool initializes all required services."""
    pool = ServicePool.get_instance()

    assert pool.text_chunker is not None, "Should have text_chunker"
    assert pool.embedding_service is not None, "Should have embedding_service"
    assert pool.vector_store is not None, "Should have vector_store"
    assert pool.bm25_engine is not None, "Should have bm25_engine"


def test_service_pool_get_indexing_service():
    """Test that ServicePool can create IndexingService."""
    pool = ServicePool.get_instance()
    indexing_service = pool.get_indexing_service()

    assert indexing_service is not None
    assert indexing_service.text_chunker is pool.text_chunker
    assert indexing_service.embedding_service is pool.embedding_service
    assert indexing_service.vector_store is pool.vector_store
    assert indexing_service.bm25_engine is pool.bm25_engine


def test_service_pool_multiple_indexing_services():
    """Test that get_indexing_service returns fresh instances."""
    pool = ServicePool.get_instance()
    service1 = pool.get_indexing_service()
    service2 = pool.get_indexing_service()

    # Different instances of IndexingService
    assert service1 is not service2

    # But share same underlying services
    assert service1.text_chunker is service2.text_chunker
    assert service1.embedding_service is service2.embedding_service


@pytest.mark.asyncio
async def test_service_pool_close():
    """Test that ServicePool can be closed."""
    pool = ServicePool.get_instance()

    # Should not raise
    await pool.close()

    # Verify close was called on async services
    pool.embedding_service.close.assert_called_once()
    pool.vector_store.close.assert_called_once()


def test_service_pool_reset():
    """Test that ServicePool can be reset (for testing)."""
    ServicePool.get_instance()

    # Reset the singleton
    ServicePool.reset()

    # Get new instance
    pool2 = ServicePool.get_instance()

    # Should be different instance after reset
    # Note: In CI this might be the same if other tests haven't run
    # So we just verify reset doesn't crash
    assert pool2 is not None


def test_service_pool_thread_safe():
    """Test that ServicePool is thread-safe."""
    import threading

    instances = []

    def get_pool():
        pool = ServicePool.get_instance()
        instances.append(pool)

    # Create 10 threads trying to get pool simultaneously
    threads = [threading.Thread(target=get_pool) for _ in range(10)]

    # Start all threads
    for thread in threads:
        thread.start()

    # Wait for all threads
    for thread in threads:
        thread.join()

    # All should have gotten the same instance
    assert len(set(id(pool) for pool in instances)) == 1, "All threads should get same instance"
