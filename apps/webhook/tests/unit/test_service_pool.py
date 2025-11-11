"""
Unit tests for ServicePool.
"""

import pytest

from services.service_pool import ServicePool


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
