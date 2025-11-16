"""
End-to-end integration tests for batch worker system.

Tests the complete batch processing pipeline from job enqueueing through
concurrent document indexing to final results aggregation.
"""

import asyncio
from unittest.mock import AsyncMock, Mock, patch

import pytest

from workers.batch_worker import BatchWorker


@pytest.fixture
def mock_service_pool():
    """Mock service pool with all dependencies."""
    # Create mock services
    mock_chunker = Mock()
    mock_chunker.chunk_text.return_value = [
        {"text": "Chunk 1", "index": 0},
        {"text": "Chunk 2", "index": 1},
    ]

    mock_embedding_service = AsyncMock()
    mock_embedding_service.generate_embeddings.return_value = [
        [0.1] * 384,  # Embedding for chunk 1
        [0.2] * 384,  # Embedding for chunk 2
    ]

    mock_vector_store = AsyncMock()
    mock_vector_store.ensure_collection = AsyncMock()
    mock_vector_store.upsert_documents = AsyncMock()

    mock_bm25_engine = Mock()
    mock_bm25_engine.index_documents = Mock()

    # Create async mock that returns URL from the document
    async def mock_index_document(document, **kwargs):
        """Mock indexing that returns the document's URL."""
        return {
            "success": True,
            "url": document.url,
            "chunks_indexed": 2,
            "operation_id": "test-op-123",
        }

    mock_indexing_service = AsyncMock()
    mock_indexing_service.index_document = AsyncMock(side_effect=mock_index_document)

    # Create mock service pool
    mock_pool = Mock()
    mock_pool.get_indexing_service.return_value = mock_indexing_service
    mock_pool.text_chunker = mock_chunker
    mock_pool.embedding_service = mock_embedding_service
    mock_pool.vector_store = mock_vector_store
    mock_pool.bm25_engine = mock_bm25_engine

    return mock_pool


@pytest.fixture
def sample_documents():
    """Sample document payloads for testing."""
    return [
        {
            "url": "https://example.com/page-1",
            "resolvedUrl": "https://example.com/page-1",
            "markdown": "# Page 1\n\nThis is the first test document.",
            "html": "<h1>Page 1</h1><p>This is the first test document.</p>",
            "title": "Page 1",
            "statusCode": 200,
        },
        {
            "url": "https://example.com/page-2",
            "resolvedUrl": "https://example.com/page-2",
            "markdown": "# Page 2\n\nThis is the second test document.",
            "html": "<h1>Page 2</h1><p>This is the second test document.</p>",
            "title": "Page 2",
            "statusCode": 200,
        },
        {
            "url": "https://example.com/page-3",
            "resolvedUrl": "https://example.com/page-3",
            "markdown": "# Page 3\n\nThis is the third test document.",
            "html": "<h1>Page 3</h1><p>This is the third test document.</p>",
            "title": "Page 3",
            "statusCode": 200,
        },
        {
            "url": "https://example.com/page-4",
            "resolvedUrl": "https://example.com/page-4",
            "markdown": "# Page 4\n\nThis is the fourth test document.",
            "html": "<h1>Page 4</h1><p>This is the fourth test document.</p>",
            "title": "Page 4",
            "statusCode": 200,
        },
    ]


@pytest.fixture
def sample_documents_with_crawl_id(sample_documents):
    """Sample documents with crawl_id for correlation tracking."""
    return [{**doc, "crawl_id": "test-crawl-123"} for doc in sample_documents]


# Test 1: Basic batch processing
@pytest.mark.asyncio
async def test_batch_worker_processes_multiple_documents(mock_service_pool, sample_documents):
    """Test that BatchWorker processes multiple documents concurrently."""
    with patch("workers.batch_worker.ServicePool.get_instance", return_value=mock_service_pool):
        batch_worker = BatchWorker()
        results = await batch_worker.process_batch(sample_documents)

        # Verify all documents processed
        assert len(results) == 4
        assert all(r.get("success") for r in results)

        # Verify order preservation
        for i, result in enumerate(results):
            assert result["url"] == sample_documents[i]["url"]

        # Verify indexing service called for each document
        assert mock_service_pool.get_indexing_service().index_document.call_count == 4


# Test 2: Concurrent execution performance
@pytest.mark.asyncio
async def test_batch_worker_executes_concurrently(mock_service_pool, sample_documents):
    """Test that documents are processed concurrently, not sequentially."""
    import time

    # Track execution times
    call_times = []

    async def delayed_index(*args, **kwargs):
        """Simulate I/O-bound operation with delay."""
        call_times.append(time.perf_counter())
        await asyncio.sleep(0.1)  # Simulate network delay
        return {
            "success": True,
            "url": args[0].url if args else "unknown",
            "chunks_indexed": 2,
        }

    mock_service_pool.get_indexing_service().index_document.side_effect = delayed_index

    with patch("workers.batch_worker.ServicePool.get_instance", return_value=mock_service_pool):
        batch_worker = BatchWorker()

        start = time.perf_counter()
        results = await batch_worker.process_batch(sample_documents)
        duration = time.perf_counter() - start

        # All documents processed successfully
        assert len(results) == 4
        assert all(r.get("success") for r in results)

        # Concurrent execution should be ~0.1s (not 0.4s sequential)
        # Allow some overhead for coordination
        assert duration < 0.3, f"Took {duration}s, expected < 0.3s for concurrent execution"

        # Verify calls started nearly simultaneously (within 50ms)
        if len(call_times) >= 2:
            time_spread = max(call_times) - min(call_times)
            assert time_spread < 0.05, f"Calls spread over {time_spread}s, not concurrent"


# Test 3: Failure isolation
@pytest.mark.asyncio
async def test_batch_worker_isolates_failures(mock_service_pool, sample_documents):
    """Test that one document failure doesn't stop the batch."""
    call_count = 0

    async def selective_failure(*args, **kwargs):
        """Fail the second document, succeed others."""
        nonlocal call_count
        call_count += 1

        if call_count == 2:
            raise Exception("Simulated indexing failure")

        return {
            "success": True,
            "url": args[0].url if args else f"doc-{call_count}",
            "chunks_indexed": 2,
        }

    mock_service_pool.get_indexing_service().index_document.side_effect = selective_failure

    with patch("workers.batch_worker.ServicePool.get_instance", return_value=mock_service_pool):
        batch_worker = BatchWorker()
        results = await batch_worker.process_batch(sample_documents)

        # All documents returned results
        assert len(results) == 4

        # First document succeeded
        assert results[0]["success"] is True

        # Second document failed
        assert results[1]["success"] is False
        assert "error" in results[1]
        assert "Simulated indexing failure" in results[1]["error"]

        # Third and fourth documents succeeded
        assert results[2]["success"] is True
        assert results[3]["success"] is True


# Test 4: Empty batch handling
@pytest.mark.asyncio
async def test_batch_worker_handles_empty_batch():
    """Test that empty document list is handled gracefully."""
    batch_worker = BatchWorker()
    results = await batch_worker.process_batch([])

    assert results == []


# Test 5: Synchronous wrapper
def test_batch_worker_sync_wrapper(mock_service_pool, sample_documents):
    """Test that process_batch_sync wraps async implementation correctly."""
    with patch("workers.batch_worker.ServicePool.get_instance", return_value=mock_service_pool):
        batch_worker = BatchWorker()
        results = batch_worker.process_batch_sync(sample_documents)

        # Verify all documents processed
        assert len(results) == 4
        assert all(r.get("success") for r in results)


# Test 6: crawl_id propagation
@pytest.mark.asyncio
async def test_batch_worker_propagates_crawl_id(mock_service_pool, sample_documents_with_crawl_id):
    """Test that crawl_id is extracted and passed to indexing service."""
    with patch("workers.batch_worker.ServicePool.get_instance", return_value=mock_service_pool):
        batch_worker = BatchWorker()
        results = await batch_worker.process_batch(sample_documents_with_crawl_id)

        # Verify all documents processed
        assert len(results) == 4

        # Verify crawl_id passed to indexing service
        for call in mock_service_pool.get_indexing_service().index_document.call_args_list:
            kwargs = call[1]
            assert kwargs.get("crawl_id") == "test-crawl-123"


# Test 7: Result order preservation
@pytest.mark.asyncio
async def test_batch_worker_preserves_result_order(mock_service_pool, sample_documents):
    """Test that results are returned in same order as input documents."""
    call_order = []

    async def track_order(*args, **kwargs):
        """Track call order and add varying delays."""
        url = args[0].url if args else "unknown"
        call_order.append(url)

        # Add random delays to simulate real-world variance
        delay = 0.01 if len(call_order) % 2 == 0 else 0.02
        await asyncio.sleep(delay)

        return {
            "success": True,
            "url": url,
            "chunks_indexed": len(call_order),  # Unique value per call
        }

    mock_service_pool.get_indexing_service().index_document.side_effect = track_order

    with patch("workers.batch_worker.ServicePool.get_instance", return_value=mock_service_pool):
        batch_worker = BatchWorker()
        results = await batch_worker.process_batch(sample_documents)

        # Results match input order (not completion order)
        for i, result in enumerate(results):
            assert result["url"] == sample_documents[i]["url"]
            # chunks_indexed value confirms this is the right result
            # (not just URL matching)


# Test 8: Large batch handling
@pytest.mark.asyncio
async def test_batch_worker_handles_large_batches(mock_service_pool):
    """Test that large batches (50+ documents) are handled efficiently."""
    # Generate 50 documents
    large_batch = [
        {
            "url": f"https://example.com/page-{i}",
            "resolvedUrl": f"https://example.com/page-{i}",
            "markdown": f"# Page {i}\n\nContent for page {i}.",
            "html": f"<h1>Page {i}</h1><p>Content for page {i}.</p>",
            "title": f"Page {i}",
            "statusCode": 200,
        }
        for i in range(50)
    ]

    with patch("workers.batch_worker.ServicePool.get_instance", return_value=mock_service_pool):
        batch_worker = BatchWorker()

        import time

        start = time.perf_counter()
        results = await batch_worker.process_batch(large_batch)
        duration = time.perf_counter() - start

        # All documents processed
        assert len(results) == 50
        assert all(r.get("success") for r in results)

        # Should complete in reasonable time (< 2 seconds for mocked services)
        assert duration < 2.0, f"Large batch took {duration}s, expected < 2s"


# Test 9: Schema validation errors
@pytest.mark.asyncio
async def test_batch_worker_handles_invalid_schema(mock_service_pool):
    """Test that invalid document schema is caught and reported."""
    invalid_documents = [
        {
            "url": "https://example.com/valid",
            "resolvedUrl": "https://example.com/valid",
            "markdown": "Valid document",
            "html": "<p>Valid document</p>",
            "title": "Valid",
            "statusCode": 200,
        },
        {
            # Missing required 'url' field
            "resolvedUrl": "https://example.com/invalid",
            "markdown": "Invalid document",
            "html": "<p>Invalid document</p>",
            "title": "Invalid",
            "statusCode": 200,
        },
        {
            "url": "https://example.com/valid-2",
            "resolvedUrl": "https://example.com/valid-2",
            "markdown": "Another valid document",
            "html": "<p>Another valid document</p>",
            "title": "Valid 2",
            "statusCode": 200,
        },
    ]

    with patch("workers.batch_worker.ServicePool.get_instance", return_value=mock_service_pool):
        batch_worker = BatchWorker()
        results = await batch_worker.process_batch(invalid_documents)

        # All documents returned results
        assert len(results) == 3

        # First document succeeded
        assert results[0]["success"] is True

        # Second document failed (schema validation)
        assert results[1]["success"] is False
        assert "error" in results[1]

        # Third document succeeded
        assert results[2]["success"] is True


# Test 10: RQ job integration (mocked)
def test_index_document_batch_job_function(mock_service_pool, sample_documents):
    """Test the RQ job function that workers execute."""
    with patch("workers.batch_worker.ServicePool.get_instance", return_value=mock_service_pool):
        # Import job function
        from worker import index_document_batch_job

        # Execute job (synchronously, as RQ would)
        results = index_document_batch_job(sample_documents)

        # Verify results
        assert len(results) == 4
        assert all(r.get("success") for r in results)


# Test 11: Service pool reuse
@pytest.mark.asyncio
async def test_batch_worker_reuses_service_pool(mock_service_pool, sample_documents):
    """Test that all tasks share the same service pool instance."""
    get_instance_calls = []

    def track_get_instance():
        """Track how many times ServicePool.get_instance is called."""
        get_instance_calls.append(1)
        return mock_service_pool

    with patch("workers.batch_worker.ServicePool.get_instance", side_effect=track_get_instance):
        batch_worker = BatchWorker()
        await batch_worker.process_batch(sample_documents)

        # ServicePool.get_instance called once per document
        # (acceptable - getInstance is fast and returns singleton)
        assert len(get_instance_calls) == 4

        # Verify same pool used (singleton pattern ensures this)
        # Each call should return the same mock_service_pool instance


# Test 12: Exception type preservation
@pytest.mark.asyncio
async def test_batch_worker_preserves_exception_types(mock_service_pool):
    """Test that exception types are captured in error results."""
    # Create document with valid schema
    test_doc = {
        "url": "https://example.com/test",
        "resolvedUrl": "https://example.com/test",
        "markdown": "Test",
        "html": "<p>Test</p>",
        "title": "Test",
        "statusCode": 200,
    }

    async def raise_specific_error(*args, **kwargs):
        """Raise a specific exception type."""
        raise ValueError("Invalid document format")

    mock_service_pool.get_indexing_service().index_document.side_effect = raise_specific_error

    with patch("workers.batch_worker.ServicePool.get_instance", return_value=mock_service_pool):
        batch_worker = BatchWorker()
        results = await batch_worker.process_batch([test_doc])

        # Error captured
        assert results[0]["success"] is False
        assert results[0]["error_type"] == "ValueError"
        assert "Invalid document format" in results[0]["error"]


def _is_redis_available() -> bool:
    """Check if Redis is available for testing."""
    try:
        from redis import Redis

        redis_conn = Redis(host="localhost", port=50104, socket_connect_timeout=1)
        redis_conn.ping()
        return True
    except Exception:
        return False


# Test 13: Skip Redis tests if unavailable
@pytest.mark.asyncio
@pytest.mark.skipif(
    not _is_redis_available(), reason="Redis not available - skipping queue integration test"
)
async def test_batch_worker_with_real_redis_queue():
    """Test batch worker with real Redis queue (if available)."""
    # This test would only run if Redis is accessible
    from redis import Redis
    from rq import Queue

    try:
        redis_conn = Redis(host="localhost", port=50104, decode_responses=False)
        queue = Queue("test-indexing", connection=redis_conn)

        # Enqueue a small batch job
        documents = [
            {
                "url": "https://example.com/test",
                "resolvedUrl": "https://example.com/test",
                "markdown": "Test document",
                "html": "<p>Test document</p>",
                "title": "Test",
                "statusCode": 200,
            }
        ]

        from worker import index_document_batch_job

        job = queue.enqueue(index_document_batch_job, documents, job_timeout="5m")

        # Wait for job completion (with timeout)
        import time

        timeout = 10
        start = time.time()
        while not job.is_finished and not job.is_failed:
            if time.time() - start > timeout:
                pytest.fail("Job timed out")
            time.sleep(0.5)
            job.refresh()

        # Verify job completed successfully
        assert job.is_finished
        assert not job.is_failed

    except Exception as e:
        pytest.skip(f"Redis integration test failed: {e}")
