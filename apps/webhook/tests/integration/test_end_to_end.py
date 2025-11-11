"""
End-to-end test: webhook → queue → worker → index → search
"""

import asyncio
import sys
import time
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from redis import Redis


@pytest.mark.asyncio
async def test_webhook_to_search_end_to_end(monkeypatch):
    """Test complete flow: receive webhook, index document, search works."""
    monkeypatch.setenv("WEBHOOK_ENABLE_WORKER", "true")

    # Clear cached modules to ensure fresh import with new env vars
    for module in list(sys.modules.keys()):
        if module.startswith("app."):
            del sys.modules[module]

    # Patch worker name to be unique for this test
    def patched_worker_init(self):
        """Initialize the worker thread manager with unique name."""
        self._thread = None
        self._running = False
        self._worker = None

    def patched_run_worker(self):
        """Run the RQ worker with unique name - manual job processing."""
        from rq import Queue
        from rq.job import Job

        from app.config import settings
        from app.utils.logging import get_logger

        logger = get_logger(__name__)

        try:
            logger.info("Connecting to Redis for worker", redis_url=settings.redis_url)
            redis_conn = Redis.from_url(settings.redis_url)

            # Use queue directly instead of Worker to avoid signal handler issues
            queue = Queue(connection=redis_conn, name="indexing")

            logger.info("Worker initialized, listening for jobs...")

            # Manual work loop - dequeue and execute jobs
            while self._running:
                # Try to pop a job ID from the queue (blocking with timeout)
                job_id = redis_conn.blpop(queue.key, timeout=1)
                if job_id:
                    # job_id is tuple: (queue_name, job_id)
                    job = Job.fetch(
                        job_id[1].decode() if isinstance(job_id[1], bytes) else job_id[1],
                        connection=redis_conn,
                    )
                    logger.info(f"Processing job {job.id}")
                    try:
                        job.perform()
                        job.set_status("finished")
                        logger.info(f"Job {job.id} completed successfully")
                    except Exception as e:
                        job.set_status("failed")
                        logger.error(f"Job {job.id} failed: {e}")
                else:
                    # No jobs, wait a bit
                    time.sleep(0.1)

        except Exception:
            logger.exception("Worker thread crashed")
            self._running = False
        finally:
            logger.info("Worker thread exiting")

    with patch("app.worker_thread.WorkerThreadManager.__init__", patched_worker_init):
        with patch("app.worker_thread.WorkerThreadManager._run_worker", patched_run_worker):
            from app.api.dependencies import get_rq_queue
            from app.config import settings
            from app.main import app

            # Clear Redis queue and old workers
            redis_conn = Redis.from_url(settings.redis_url)
            redis_conn.delete("rq:queue:indexing")

            # Clean up any stale worker registrations
            for key in redis_conn.scan_iter("rq:worker:*"):
                redis_conn.delete(key)

            # Use TestClient which triggers lifespan
            with TestClient(app) as client:
                # Verify API is running
                response = client.get("/health")
                assert response.status_code == 200

                # Verify worker thread started
                assert hasattr(app.state, "worker_manager")
                assert app.state.worker_manager._running is True

                # Step 1: Submit document via queue (simulating webhook)
                # In real scenario, Firecrawl sends webhook which queues the job
                test_doc = {
                    "url": "https://example.com/test",
                    "resolvedUrl": "https://example.com/test",
                    "markdown": "This is a test document about Python programming",
                    "html": "<html><body><p>This is a test document about Python programming</p></body></html>",
                    "title": "Test Document",
                    "description": "A test document",
                    "statusCode": 200,
                }

                # Queue job directly (simulating webhook handler)
                queue = get_rq_queue(redis_conn)
                job = queue.enqueue("app.worker.index_document_job", test_doc, job_timeout="5m")

                # Step 2: Wait for worker to process (max 30 seconds)
                for _ in range(30):
                    job.refresh()
                    if job.is_finished or job.is_failed:
                        break
                    await asyncio.sleep(1)

                # Check job completed successfully
                assert job.is_finished, f"Job failed or timed out: {job.get_status()}"
                result = job.result
                assert result["success"] is True, f"Job failed: {result.get('error')}"
                assert result["chunks_indexed"] > 0

                # Step 3: Search for document
                search_response = client.post(
                    "/api/search",
                    headers={"Authorization": f"Bearer {settings.api_secret}"},
                    json={"query": "Python programming", "mode": "hybrid", "limit": 5},
                )

                assert search_response.status_code == 200
                search_data = search_response.json()

                # Should find the document we just indexed
                assert search_data["total"] > 0, "No results found"
                urls = [r["url"] for r in search_data["results"]]
                assert "https://example.com/test" in urls, (
                    f"Expected URL not found in results: {urls}"
                )

                # Step 4: Check stats endpoint reflects new document
                stats_response = client.get("/api/stats")
                assert stats_response.status_code == 200
                stats = stats_response.json()

                # BM25 should show at least 1 document
                assert stats["bm25_documents"] >= 1, f"BM25 documents: {stats['bm25_documents']}"
                # Qdrant should show chunks
                assert stats["qdrant_points"] >= 1, f"Qdrant points: {stats['qdrant_points']}"
