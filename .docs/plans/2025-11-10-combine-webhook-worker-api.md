# Combine Webhook Worker and API Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Merge the separate webhook API and worker containers into a single container with embedded background worker thread, eliminating BM25 file sync complexity and simplifying deployment.

**Architecture:** Run RQ worker in a background thread within the same FastAPI process. The worker thread starts during FastAPI's lifespan startup, shares the same BM25Engine instance with the API, and gracefully shuts down during FastAPI shutdown.

**Tech Stack:** FastAPI, RQ (Redis Queue), threading, asyncio

---

## Task 1: Add Worker Configuration Setting

**Files:**
- Modify: `apps/webhook/app/config.py:150`

**Step 1: Write the failing test**

```python
# apps/webhook/tests/unit/test_config.py
def test_enable_worker_default_true():
    """Worker should be enabled by default."""
    from app.config import Settings
    settings = Settings(_env_file=None, WEBHOOK_API_SECRET="test", WEBHOOK_SECRET="test1234567890123456")
    assert settings.enable_worker is True

def test_enable_worker_can_be_disabled():
    """Worker can be disabled via environment variable."""
    from app.config import Settings
    settings = Settings(
        _env_file=None,
        WEBHOOK_API_SECRET="test",
        WEBHOOK_SECRET="test1234567890123456",
        WEBHOOK_ENABLE_WORKER="false"
    )
    assert settings.enable_worker is False
```

**Step 2: Run test to verify it fails**

Run: `cd apps/webhook && uv run pytest tests/unit/test_config.py::test_enable_worker_default_true -v`

Expected: FAIL with "Settings has no attribute 'enable_worker'"

**Step 3: Add enable_worker field to Settings**

In `apps/webhook/app/config.py` after line 149 (after `rrf_k` field), add:

```python
    # Worker Configuration
    enable_worker: bool = Field(
        default=True,
        validation_alias=AliasChoices("WEBHOOK_ENABLE_WORKER", "SEARCH_BRIDGE_ENABLE_WORKER"),
        description="Enable background worker thread for processing indexing jobs",
    )
```

**Step 4: Run test to verify it passes**

Run: `cd apps/webhook && uv run pytest tests/unit/test_config.py::test_enable_worker_default_true tests/unit/test_config.py::test_enable_worker_can_be_disabled -v`

Expected: PASS (both tests)

**Step 5: Commit**

```bash
git add apps/webhook/app/config.py apps/webhook/tests/unit/test_config.py
git commit -m "feat(webhook): add enable_worker configuration setting

- Add WEBHOOK_ENABLE_WORKER boolean config (default: true)
- Allows disabling worker thread for development/testing
- Add tests for enable_worker configuration"
```

---

## Task 2: Create Worker Thread Manager

**Files:**
- Create: `apps/webhook/app/worker_thread.py`
- Test: `apps/webhook/tests/unit/test_worker_thread.py`

**Step 1: Write the failing test**

```python
# apps/webhook/tests/unit/test_worker_thread.py
import time
from unittest.mock import Mock, patch
import pytest

def test_worker_thread_manager_start():
    """WorkerThreadManager starts worker in background thread."""
    from app.worker_thread import WorkerThreadManager

    manager = WorkerThreadManager()

    # Start worker (should not block)
    manager.start()

    # Thread should be running
    assert manager._thread is not None
    assert manager._thread.is_alive()
    assert manager._running is True

    # Cleanup
    manager.stop()

def test_worker_thread_manager_stop():
    """WorkerThreadManager stops worker gracefully."""
    from app.worker_thread import WorkerThreadManager

    manager = WorkerThreadManager()
    manager.start()

    # Stop worker
    manager.stop()

    # Thread should be stopped
    assert manager._running is False
    # Give thread time to exit
    time.sleep(0.5)
    assert not manager._thread.is_alive()

def test_worker_thread_manager_does_not_start_twice():
    """WorkerThreadManager cannot be started twice."""
    from app.worker_thread import WorkerThreadManager

    manager = WorkerThreadManager()
    manager.start()

    # Trying to start again should raise
    with pytest.raises(RuntimeError, match="Worker thread already running"):
        manager.start()

    manager.stop()
```

**Step 2: Run test to verify it fails**

Run: `cd apps/webhook && uv run pytest tests/unit/test_worker_thread.py -v`

Expected: FAIL with "No module named 'app.worker_thread'"

**Step 3: Implement WorkerThreadManager**

```python
# apps/webhook/app/worker_thread.py
"""
Background worker thread manager.

Runs the RQ worker in a background thread within the FastAPI process.
"""

import threading
from typing import Optional

from redis import Redis
from rq import Worker

from app.config import settings
from app.utils.logging import get_logger

logger = get_logger(__name__)


class WorkerThreadManager:
    """
    Manages the RQ worker in a background thread.

    The worker thread runs alongside the FastAPI application, processing
    indexing jobs from the Redis queue. It can be started and stopped
    independently of the API server.
    """

    def __init__(self) -> None:
        """Initialize the worker thread manager."""
        self._thread: Optional[threading.Thread] = None
        self._running: bool = False
        self._worker: Optional[Worker] = None

    def start(self) -> None:
        """
        Start the worker thread.

        Raises:
            RuntimeError: If worker thread is already running
        """
        if self._thread is not None and self._thread.is_alive():
            raise RuntimeError("Worker thread already running")

        self._running = True
        self._thread = threading.Thread(
            target=self._run_worker,
            name="rq-worker",
            daemon=True,
        )
        self._thread.start()
        logger.info("Worker thread started")

    def stop(self) -> None:
        """Stop the worker thread gracefully."""
        if not self._running:
            logger.warning("Worker thread not running")
            return

        logger.info("Stopping worker thread...")
        self._running = False

        # Send stop signal to RQ worker
        if self._worker is not None:
            self._worker.request_stop()

        # Wait for thread to exit (with timeout)
        if self._thread is not None and self._thread.is_alive():
            self._thread.join(timeout=10.0)
            if self._thread.is_alive():
                logger.error("Worker thread did not stop gracefully")
            else:
                logger.info("Worker thread stopped")

    def _run_worker(self) -> None:
        """
        Run the RQ worker (called in background thread).

        This method runs in a separate thread and processes jobs from Redis.
        """
        try:
            logger.info("Connecting to Redis for worker", redis_url=settings.redis_url)
            redis_conn = Redis.from_url(settings.redis_url)

            # Create worker
            self._worker = Worker(
                queues=["indexing"],
                connection=redis_conn,
                name="search-bridge-worker",
            )

            logger.info("Worker initialized, listening for jobs...")

            # Work loop
            self._worker.work(with_scheduler=False)

        except Exception:
            logger.exception("Worker thread crashed")
        finally:
            self._running = False
            logger.info("Worker thread exiting")
```

**Step 4: Run test to verify it passes**

Run: `cd apps/webhook && uv run pytest tests/unit/test_worker_thread.py -v`

Expected: PASS (all 3 tests)

**Step 5: Commit**

```bash
git add apps/webhook/app/worker_thread.py apps/webhook/tests/unit/test_worker_thread.py
git commit -m "feat(webhook): add background worker thread manager

- Create WorkerThreadManager for running RQ worker in thread
- Supports graceful start/stop lifecycle
- Runs as daemon thread alongside FastAPI
- Add comprehensive tests for thread lifecycle"
```

---

## Task 3: Integrate Worker Thread Into FastAPI Lifespan

**Files:**
- Modify: `apps/webhook/app/main.py:31-87`
- Test: `apps/webhook/tests/integration/test_worker_integration.py`

**Step 1: Write the failing test**

```python
# apps/webhook/tests/integration/test_worker_integration.py
import asyncio
import pytest
from fastapi.testclient import TestClient

def test_worker_starts_with_api_when_enabled(monkeypatch):
    """Worker thread starts during API startup when enabled."""
    monkeypatch.setenv("WEBHOOK_ENABLE_WORKER", "true")

    # Import after setting env var
    from app.main import app
    from app.config import settings

    assert settings.enable_worker is True

    # Use TestClient which triggers lifespan
    with TestClient(app) as client:
        # API should be running
        response = client.get("/health")
        assert response.status_code == 200

        # Worker thread should be running (check via app state)
        assert hasattr(app.state, "worker_manager")
        assert app.state.worker_manager._running is True

def test_worker_does_not_start_when_disabled(monkeypatch):
    """Worker thread does not start when disabled."""
    monkeypatch.setenv("WEBHOOK_ENABLE_WORKER", "false")

    from app.main import app
    from app.config import settings

    assert settings.enable_worker is False

    with TestClient(app) as client:
        response = client.get("/health")
        assert response.status_code == 200

        # Worker manager should exist but not be running
        if hasattr(app.state, "worker_manager"):
            assert app.state.worker_manager._running is False
```

**Step 2: Run test to verify it fails**

Run: `cd apps/webhook && uv run pytest tests/integration/test_worker_integration.py -v`

Expected: FAIL with "app.state has no attribute 'worker_manager'"

**Step 3: Integrate worker thread into lifespan**

In `apps/webhook/app/main.py`, modify the `lifespan` function:

```python
@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None]:
    """
    Application lifespan manager.

    Handles startup and shutdown tasks.
    """
    # Startup
    logger.info("Starting Search Bridge API", version="0.1.0", port=settings.port)

    # Initialize database for timing metrics
    try:
        await init_database()
        logger.info("Timing metrics database initialized")
    except Exception as e:
        logger.error("Failed to initialize timing metrics database", error=str(e))
        # Don't fail startup - metrics are non-critical

    # Log CORS configuration for security awareness
    cors_origins_str = ", ".join(settings.cors_origins)
    if "*" in settings.cors_origins:
        logger.warning(
            "CORS configured to allow ALL origins (*) - this is insecure for production!",
            cors_origins=cors_origins_str,
        )
    else:
        logger.info("CORS configured with allowed origins", cors_origins=cors_origins_str)

    # Ensure Qdrant collection exists
    try:
        vector_store = get_vector_store()
        await vector_store.ensure_collection()
        logger.info("Qdrant collection verified")
    except Exception as e:
        logger.error("Failed to ensure Qdrant collection", error=str(e))
        # Don't fail startup - collection might be created later

    # Start background worker thread if enabled
    worker_manager = None
    if settings.enable_worker:
        from app.worker_thread import WorkerThreadManager

        logger.info("Starting background worker thread...")
        worker_manager = WorkerThreadManager()
        try:
            worker_manager.start()
            app.state.worker_manager = worker_manager
            logger.info("Background worker started successfully")
        except Exception as e:
            logger.error("Failed to start background worker", error=str(e))
            # Don't fail startup - API can run without worker
    else:
        logger.info("Background worker disabled (WEBHOOK_ENABLE_WORKER=false)")

    logger.info("Search Bridge API ready")

    yield

    # Shutdown
    logger.info("Shutting down Search Bridge API")

    # Stop background worker if running
    if worker_manager is not None:
        try:
            worker_manager.stop()
            logger.info("Background worker stopped successfully")
        except Exception:
            logger.exception("Failed to stop background worker")

    # Clean up async resources
    try:
        await cleanup_services()
        logger.info("Services cleaned up successfully")
    except Exception:
        logger.exception("Failed to clean up services")

    # Close database connections
    try:
        await close_database()
        logger.info("Database connections closed")
    except Exception:
        logger.exception("Failed to close database connections")
```

**Step 4: Run test to verify it passes**

Run: `cd apps/webhook && uv run pytest tests/integration/test_worker_integration.py -v`

Expected: PASS (both tests)

**Step 5: Commit**

```bash
git add apps/webhook/app/main.py apps/webhook/tests/integration/test_worker_integration.py
git commit -m "feat(webhook): integrate background worker into FastAPI lifespan

- Start worker thread during FastAPI startup
- Stop worker gracefully during shutdown
- Respect WEBHOOK_ENABLE_WORKER configuration
- Add integration tests for worker lifecycle"
```

---

## Task 4: Remove BM25 Index Reload Logic

**Files:**
- Modify: `apps/webhook/app/services/bm25_engine.py:284-320,367-386`

**Step 1: Write the failing test**

```python
# apps/webhook/tests/unit/test_bm25_no_reload.py
from unittest.mock import Mock, patch

def test_search_does_not_reload_index():
    """search() should not reload index from disk (shared in-memory)."""
    from app.services.bm25_engine import BM25Engine

    engine = BM25Engine()
    engine.index_document("test document", {"url": "http://example.com"})

    # Mock _load_index to ensure it's never called
    with patch.object(engine, '_load_index') as mock_load:
        results = engine.search("test", limit=5)

        # Should not reload
        mock_load.assert_not_called()

        # Should return result
        assert len(results) > 0

def test_get_document_count_does_not_reload_index():
    """get_document_count() should not reload index from disk (shared in-memory)."""
    from app.services.bm25_engine import BM25Engine

    engine = BM25Engine()
    engine.index_document("test document", {"url": "http://example.com"})

    # Mock _load_index to ensure it's never called
    with patch.object(engine, '_load_index') as mock_load:
        count = engine.get_document_count()

        # Should not reload
        mock_load.assert_not_called()

        # Should return count
        assert count == 1
```

**Step 2: Run test to verify it fails**

Run: `cd apps/webhook && uv run pytest tests/unit/test_bm25_no_reload.py -v`

Expected: FAIL with "AssertionError: _load_index was called"

**Step 3: Remove reload logic from search()**

In `apps/webhook/app/services/bm25_engine.py`, modify the `search()` method (around line 284-320):

```python
    def search(
        self,
        query: str,
        limit: int = 10,
        domain: str | None = None,
        language: str | None = None,
        country: str | None = None,
        is_mobile: bool | None = None,
    ) -> list[dict[str, Any]]:
        """
        Search documents using BM25.

        Args:
            query: Search query
            limit: Maximum results
            domain: Filter by domain
            language: Filter by language
            country: Filter by country
            is_mobile: Filter by mobile flag

        Returns:
            List of results with score and metadata
        """
        if not self.bm25 or not self.corpus:
            logger.warning("BM25 index is empty")
            return []

        # Tokenize query
        query_tokens = self._tokenize(query)
```

Remove these lines that were added previously:
```python
        # Reload index to search against latest worker updates
        try:
            self._load_index()
        except Exception:
            logger.exception("Failed to reload BM25 index for search")
            # Continue with existing in-memory index on error
```

**Step 4: Remove reload logic from get_document_count()**

In `apps/webhook/app/services/bm25_engine.py`, modify the `get_document_count()` method (around line 367-386):

```python
    def get_document_count(self) -> int:
        """
        Get total number of indexed documents.

        Returns:
            Document count
        """
        return len(self.corpus)
```

Remove these lines that were added previously:
```python
        # Reload index to get latest count from worker updates
        try:
            self._load_index()
        except Exception:
            logger.exception("Failed to reload BM25 index for count")
            # Return current in-memory count on error
            pass
```

**Step 5: Run test to verify it passes**

Run: `cd apps/webhook && uv run pytest tests/unit/test_bm25_no_reload.py -v`

Expected: PASS (both tests)

**Step 6: Run existing BM25 tests to ensure no regression**

Run: `cd apps/webhook && uv run pytest tests/unit/ -k bm25 -v`

Expected: All BM25 tests PASS

**Step 7: Commit**

```bash
git add apps/webhook/app/services/bm25_engine.py apps/webhook/tests/unit/test_bm25_no_reload.py
git commit -m "refactor(webhook): remove BM25 index reload logic

- Worker and API now share same process and BM25Engine instance
- No need to reload index from disk on each search/count
- Simplifies code and improves performance
- Add tests to verify no reload happens"
```

---

## Task 5: Update Docker Compose Configuration

**Files:**
- Modify: `docker-compose.yaml:76-113`

**Step 1: Document current state**

No test needed - this is infrastructure configuration.

**Step 2: Remove firecrawl_webhook_worker service**

In `docker-compose.yaml`, delete lines 94-110 (the entire `firecrawl_webhook_worker` service definition):

```yaml
  firecrawl_webhook_worker:
    <<: *common-service
    build:
      context: ./apps/webhook
      dockerfile: Dockerfile
    container_name: firecrawl_webhook_worker
    command: python -m app.worker
    volumes:
      - ${APPDATA_BASE:-/mnt/cache/appdata}/firecrawl_webhook_bm25:/app/data/bm25
    depends_on:
      - firecrawl_cache
      - firecrawl_webhook
    healthcheck:
      test: ["CMD", "python", "-c", "import redis; r = redis.from_url('redis://firecrawl_cache:6379'); r.ping()"]
      interval: 30s
      timeout: 10s
      retries: 3
```

**Step 3: Remove BM25 volume mount from firecrawl_webhook**

In `docker-compose.yaml`, in the `firecrawl_webhook` service (around line 76-93), remove the volumes section:

```yaml
  firecrawl_webhook:
    <<: *common-service
    build:
      context: ./apps/webhook
      dockerfile: Dockerfile
    container_name: firecrawl_webhook
    ports:
      - "${WEBHOOK_PORT:-52100}:52100"
    depends_on:
      - firecrawl_db
      - firecrawl_cache
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:52100/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

Remove this section:
```yaml
    volumes:
      - ${APPDATA_BASE:-/mnt/cache/appdata}/firecrawl_webhook_bm25:/app/data/bm25
```

**Step 4: Verify configuration is valid**

Run: `cd /compose/pulse && docker compose config > /dev/null && echo "Valid"`

Expected: Output "Valid" (no errors)

**Step 5: Commit**

```bash
git add docker-compose.yaml
git commit -m "refactor(compose): remove separate webhook worker container

- Worker now runs in same container as API
- Remove firecrawl_webhook_worker service definition
- Remove BM25 shared volume (no longer needed)
- Simplifies deployment to single webhook container"
```

---

## Task 6: Update Environment Variables Documentation

**Files:**
- Modify: `.env.example:85-123`

**Step 1: Document new WEBHOOK_ENABLE_WORKER variable**

In `.env.example`, add after line 123 (after `WEBHOOK_LOG_LEVEL`):

```bash
# Worker Configuration
WEBHOOK_ENABLE_WORKER=true
```

**Step 2: Add documentation comment**

Above the new line, add explanatory comment:

```bash
# Worker Configuration
# Enable background worker thread for processing indexing jobs (default: true)
# Set to false to disable worker (useful for development/testing API only)
WEBHOOK_ENABLE_WORKER=true
```

**Step 3: Commit**

```bash
git add .env.example
git commit -m "docs: add WEBHOOK_ENABLE_WORKER to environment example

- Document new worker enable/disable configuration
- Defaults to true (worker enabled)
- Can be disabled for API-only deployments"
```

---

## Task 7: Update Webhook README

**Files:**
- Modify: `apps/webhook/README.md`

**Step 1: Read current README structure**

Run: `head -100 apps/webhook/README.md`

Review the structure and identify sections to update.

**Step 2: Update Architecture section**

Find the "Architecture" or "Overview" section and update it to reflect the combined worker/API:

```markdown
## Architecture

The Search Bridge runs as a single FastAPI application with an embedded background worker thread:

- **API Server**: FastAPI application handling HTTP requests (webhooks, search, stats)
- **Background Worker**: RQ worker thread processing indexing jobs from Redis queue
- **BM25 Engine**: Shared in-memory instance used by both API and worker
- **Vector Store**: Qdrant for semantic search
- **Embedding Service**: TEI for generating text embeddings

The worker thread starts automatically during FastAPI startup and shares all services with the API, eliminating file synchronization complexity.
```

**Step 3: Update Deployment section**

Update deployment instructions to reference single container:

```markdown
## Deployment

### Docker Compose (Recommended)

```yaml
services:
  firecrawl_webhook:
    build: ./apps/webhook
    ports:
      - "52100:52100"
    environment:
      WEBHOOK_REDIS_URL: redis://firecrawl_cache:6379
      WEBHOOK_QDRANT_URL: http://qdrant:6333
      WEBHOOK_TEI_URL: http://tei:80
      WEBHOOK_ENABLE_WORKER: "true"  # Enable background worker
    depends_on:
      - firecrawl_cache
      - qdrant
      - tei
```

### Disable Worker (API Only)

To run only the API without the background worker:

```bash
WEBHOOK_ENABLE_WORKER=false uvicorn app.main:app --host 0.0.0.0 --port 52100
```

This is useful for:
- Development/testing the API independently
- Scaling API and worker separately (run worker in separate process)
- Debugging API without worker interference
```

**Step 4: Remove references to separate worker**

Search for and remove/update any references to running the worker as a separate container or process.

**Step 5: Commit**

```bash
git add apps/webhook/README.md
git commit -m "docs(webhook): update README for combined worker/API architecture

- Document embedded background worker thread
- Update deployment instructions for single container
- Add instructions for disabling worker
- Remove references to separate worker container"
```

---

## Task 8: Integration Testing

**Files:**
- Create: `apps/webhook/tests/integration/test_end_to_end.py`

**Step 1: Write end-to-end test**

```python
# apps/webhook/tests/integration/test_end_to_end.py
"""
End-to-end test: webhook → queue → worker → index → search
"""
import asyncio
import pytest
import time
from fastapi.testclient import TestClient
from redis import Redis


@pytest.mark.asyncio
async def test_webhook_to_search_end_to_end(monkeypatch):
    """Test complete flow: receive webhook, index document, search works."""
    # Enable worker
    monkeypatch.setenv("WEBHOOK_ENABLE_WORKER", "true")

    from app.main import app
    from app.config import settings

    # Clear Redis queue
    redis_conn = Redis.from_url(settings.redis_url)
    redis_conn.delete("rq:queue:indexing")

    client = TestClient(app)

    # Step 1: Submit document via webhook (mocked, not using real webhook endpoint)
    # In real scenario, Firecrawl sends webhook
    test_doc = {
        "url": "https://example.com/test",
        "markdown": "This is a test document about Python programming",
        "title": "Test Document",
        "description": "A test document"
    }

    # Queue directly (simulating webhook handler)
    from app.api.dependencies import get_rq_queue
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
    assert result["success"] is True
    assert result["chunks_indexed"] > 0

    # Step 3: Search for document
    search_response = client.post(
        "/api/search",
        headers={"Authorization": f"Bearer {settings.api_secret}"},
        json={
            "query": "Python programming",
            "mode": "hybrid",
            "limit": 5
        }
    )

    assert search_response.status_code == 200
    search_data = search_response.json()

    # Should find the document we just indexed
    assert search_data["total"] > 0
    urls = [r["url"] for r in search_data["results"]]
    assert "https://example.com/test" in urls

    # Step 4: Check stats endpoint reflects new document
    stats_response = client.get("/api/stats")
    assert stats_response.status_code == 200
    stats = stats_response.json()

    # BM25 should show at least 1 document
    assert stats["bm25_documents"] >= 1
    # Qdrant should show chunks
    assert stats["qdrant_points"] >= 1
```

**Step 2: Run test to verify it passes**

Run: `cd apps/webhook && uv run pytest tests/integration/test_end_to_end.py -v -s`

Expected: PASS (test completes in <30 seconds)

**Step 3: Fix any failures**

If test fails:
- Check worker thread is running
- Check Redis connection
- Check job error messages
- Verify services (Qdrant, TEI) are accessible

**Step 4: Commit**

```bash
git add apps/webhook/tests/integration/test_end_to_end.py
git commit -m "test(webhook): add end-to-end integration test

- Test complete flow: queue → worker → index → search
- Verifies worker thread processes jobs correctly
- Validates BM25 and Qdrant indexing
- Confirms search returns indexed documents"
```

---

## Task 9: Cleanup Old Worker Module

**Files:**
- Modify: `apps/webhook/app/worker.py`
- Delete: (none - keep for backward compatibility)

**Step 1: Add deprecation notice**

At the top of `apps/webhook/app/worker.py`, add deprecation notice:

```python
"""
Background worker for async document indexing.

DEPRECATED: This module is kept for backward compatibility only.
The worker now runs as a background thread within the FastAPI process.
See app.worker_thread.WorkerThreadManager for the new implementation.

To run worker standalone (not recommended):
    python -m app.worker

To run worker embedded in API (recommended):
    WEBHOOK_ENABLE_WORKER=true uvicorn app.main:app
"""
```

**Step 2: Commit**

```bash
git add apps/webhook/app/worker.py
git commit -m "docs(webhook): deprecate standalone worker module

- Add deprecation notice to app.worker
- Document new embedded worker approach
- Keep module for backward compatibility"
```

---

## Task 10: Update Service Ports Documentation

**Files:**
- Modify: `.docs/services-ports.md`

**Step 1: Update webhook service entry**

Find the firecrawl_webhook entry and update it:

```markdown
| firecrawl_webhook | 52100 | Webhook bridge API + background worker | Internal: http://firecrawl_webhook:52100<br>External: http://localhost:52100 |
```

**Step 2: Remove webhook worker entry**

Remove the line for `firecrawl_webhook_worker` (if it exists).

**Step 3: Commit**

```bash
git add .docs/services-ports.md
git commit -m "docs: update services-ports for combined webhook service

- Remove firecrawl_webhook_worker entry
- Update firecrawl_webhook to note embedded worker
- Reflects single-container architecture"
```

---

## Task 11: Update Troubleshooting Guide

**Files:**
- Modify: `.docs/webhook-troubleshooting.md`

**Step 1: Add section on worker status**

Add a new section after "Health Checks":

```markdown
### Worker Status

**Check if worker thread is running:**

The worker runs as a background thread within the webhook API container. Check logs:

```bash
docker logs firecrawl_webhook | grep -i worker
```

Look for:
```
[info] Starting background worker thread...
[info] Background worker started successfully
[info] Worker initialized, listening for jobs...
```

**Disable worker for debugging:**

Set `WEBHOOK_ENABLE_WORKER=false` to run API without worker:

```bash
# In .env
WEBHOOK_ENABLE_WORKER=false
```

Then restart:
```bash
docker compose restart firecrawl_webhook
```

**Check worker is processing jobs:**

```bash
# Check Redis queue length
docker exec firecrawl_cache redis-cli LLEN rq:queue:indexing

# Monitor worker processing
docker logs -f firecrawl_webhook | grep "Indexing job"
```
```

**Step 2: Update architecture diagram**

Update the architecture diagram at the top of the file:

```markdown
## Architecture

```
Firecrawl API → Docker Network → Webhook Bridge (API + Worker Thread) → Redis Queue → Qdrant/BM25
```

### Services Involved

- **Firecrawl** (`firecrawl`): Web scraper that sends webhooks
- **Webhook Bridge** (`firecrawl_webhook`): FastAPI service with embedded worker thread
- **Redis** (`firecrawl_cache`): Job queue
- **Qdrant**: Vector database for semantic search
- **TEI**: Text embeddings inference service
```

**Step 3: Remove references to separate worker container**

Search for and remove/update references to `firecrawl_webhook_worker` container throughout the document.

**Step 4: Commit**

```bash
git add .docs/webhook-troubleshooting.md
git commit -m "docs: update troubleshooting guide for combined worker/API

- Document worker thread status checking
- Update architecture diagram
- Add worker enable/disable instructions
- Remove references to separate worker container"
```

---

## Task 12: Deploy and Verify

**Files:**
- None (operational task)

**Step 1: Stop old containers**

```bash
cd /compose/pulse
docker compose down firecrawl_webhook firecrawl_webhook_worker
```

**Step 2: Rebuild and start new container**

```bash
docker compose build firecrawl_webhook
docker compose up -d firecrawl_webhook
```

**Step 3: Check logs for successful startup**

```bash
docker logs firecrawl_webhook --tail 50
```

Look for:
- "Starting Search Bridge API"
- "Starting background worker thread..."
- "Background worker started successfully"
- "Worker initialized, listening for jobs..."
- "Search Bridge API ready"

**Step 4: Verify health endpoint**

```bash
curl http://localhost:52100/health | jq
```

Expected:
```json
{
  "status": "healthy",
  "services": {
    "redis": "healthy",
    "qdrant": "healthy",
    "tei": "healthy"
  }
}
```

**Step 5: Trigger a test crawl and verify**

Use the MCP tool to crawl a small site and verify webhooks are processed:

```bash
# Monitor logs in real-time
docker logs -f firecrawl_webhook | grep -E "(Webhook received|Indexing job)"
```

In another terminal, trigger a crawl via MCP. You should see:
- "Webhook received" log entries
- "Indexing job completed" log entries

**Step 6: Verify stats show indexed documents**

```bash
curl http://localhost:52100/api/stats | jq
```

Expected: `bm25_documents` and `qdrant_points` > 0

**Step 7: Document deployment**

No commit needed - this is verification only.

---

## Summary

This plan combines the webhook API and worker into a single container by:

1. **Adding configuration** to enable/disable worker thread
2. **Creating thread manager** to run RQ worker in background thread
3. **Integrating into FastAPI** lifespan for automatic startup/shutdown
4. **Removing BM25 sync logic** (no longer needed with shared process)
5. **Simplifying Docker** by removing separate worker container
6. **Updating documentation** to reflect new architecture
7. **Testing end-to-end** to verify complete pipeline works

**Benefits:**
- Simpler deployment (1 container instead of 2)
- No BM25 file sync complexity
- Shared in-memory BM25 engine (better performance)
- Easier development/debugging
- Lower resource usage

**Backward Compatibility:**
- Old worker module kept with deprecation notice
- Can still run standalone worker if needed: `python -m app.worker`
