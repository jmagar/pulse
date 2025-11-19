# Webhook Server Production Readiness Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Address critical performance, concurrency, and code quality issues in the Webhook server to ensure stability in production.

**Architecture:** 
- Offload blocking synchronous operations (BM25 search/indexing) to thread pools to prevent event loop blocking.
- Implement singleton patterns for HTTP clients and Queues to reduce connection churn.
- Refactor deprecated code and hardcoded constants for better maintainability.
- Optimize batch processing to reduce I/O overhead.

**Tech Stack:** Python, FastAPI, asyncio, httpx, Redis (rq), Rank-BM25.

---

### Task 1: Async Offloading for BM25 Search

**Context:** `BM25Engine` operations are CPU-bound and use blocking file locks (`time.sleep`), which freezes the `asyncio` event loop in the API.

**Files:**
- Modify: `apps/webhook/services/search.py`

**Step 1: Write the failing test**

Create `apps/webhook/tests/services/test_search_async.py`:
```python
import pytest
import asyncio
from unittest.mock import AsyncMock, Mock, patch
from services.search import SearchOrchestrator
from api.schemas.search import SearchMode

@pytest.mark.asyncio
async def test_keyword_search_offloads_to_executor():
    embedding_service = Mock()
    vector_store = Mock()
    bm25_engine = Mock()
    bm25_engine.search.return_value = ([], 0)
    
    orchestrator = SearchOrchestrator(embedding_service, vector_store, bm25_engine)
    
    with patch("asyncio.get_running_loop") as mock_get_loop:
        mock_loop = Mock()
        mock_get_loop.return_value = mock_loop
        mock_loop.run_in_executor = AsyncMock(return_value=([], 0))
        
        await orchestrator._keyword_search("query", 10, 0, None, None, None, None)
        
        # Verify run_in_executor was called
        mock_loop.run_in_executor.assert_called_once()
        # First arg should be None (default executor), second is the function
        assert mock_loop.run_in_executor.call_args[0][0] is None
```

**Step 2: Run test to verify it fails**

Run: `pytest apps/webhook/tests/services/test_search_async.py`
Expected: Fail (call assertion will fail or `_keyword_search` is not async). Note: `_keyword_search` is currently synchronous in `services/search.py`.

**Step 3: Modify `services/search.py`**

Update `SearchOrchestrator`:
1.  Change `_keyword_search` definition to `async def`.
2.  Inside `_keyword_search`, use `asyncio.get_running_loop().run_in_executor(None, ...)` to wrap the `self.bm25_engine.search` call.
3.  Update `search` method to `await` the result of `_keyword_search`.
    *   Check `services/search.py:165`: `return self._keyword_search(...)` -> `return await self._keyword_search(...)`
    *   Check `services/search.py:198`: `keyword_results, keyword_total = self._keyword_search(...)` -> `await self._keyword_search(...)`

**Step 4: Run test to verify it passes**

Run: `pytest apps/webhook/tests/services/test_search_async.py`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/webhook/services/search.py apps/webhook/tests/services/test_search_async.py
git commit -m "fix(webhook): offload synchronous BM25 search to thread executor"
```

---

### Task 2: Shared HTTP Client

**Context:** `scrape.py` and `firecrawl_proxy.py` create new `httpx.AsyncClient` instances for every request, causing connection churn and SSL overhead.

**Files:**
- Modify: `apps/webhook/api/deps.py`
- Modify: `apps/webhook/api/routers/scrape.py`
- Modify: `apps/webhook/api/routers/firecrawl_proxy.py`

**Step 1: Write the failing test**

Create `apps/webhook/tests/api/test_http_client.py`:
```python
import pytest
from api.deps import get_http_client
import httpx

@pytest.mark.asyncio
async def test_get_http_client_singleton():
    client1 = await get_http_client()
    client2 = await get_http_client()
    assert client1 is client2
    assert isinstance(client1, httpx.AsyncClient)
```

**Step 2: Run test to verify it fails**

Run: `pytest apps/webhook/tests/api/test_http_client.py`
Expected: ImportError (function not exists)

**Step 3: Implement Singleton in `api/deps.py`**

1.  Add `_http_client: httpx.AsyncClient | None = None` global.
2.  Implement `async def get_http_client() -> httpx.AsyncClient`.
3.  Update `cleanup_services` to close `_http_client`.

**Step 4: Update Routers**

1.  In `scrape.py`:
    -   Inject `client: Annotated[httpx.AsyncClient, Depends(get_http_client)]` into `scrape_endpoint`.
    -   Pass `client` to `_handle_start_single_url` -> `_call_firecrawl_scrape`.
    -   Refactor helper functions (`_call_firecrawl_scrape`, etc.) to accept `client` instead of creating one.
2.  In `firecrawl_proxy.py`:
    -   Inject `client` into route handlers.
    -   Pass to `proxy_to_firecrawl`.

**Step 5: Run test to verify it passes**

Run: `pytest apps/webhook/tests/api/test_http_client.py`
Expected: PASS

**Step 6: Commit**

```bash
git add apps/webhook/api/deps.py apps/webhook/api/routers/scrape.py apps/webhook/api/routers/firecrawl_proxy.py apps/webhook/tests/api/test_http_client.py
git commit -m "perf(webhook): implement singleton HTTP client for API routes"
```

---

### Task 3: Fix Queue Usage in Webhook Router

**Context:** `webhook.py` manually instantiates `Queue` objects instead of using the dependency injected singleton.

**Files:**
- Modify: `apps/webhook/api/routers/webhook.py`

**Step 1: Inspection (No test needed, visual fix)**

The issue is `rescrape_queue = Queue("indexing", connection=redis_client)` on line 280.

**Step 2: Modify `apps/webhook/api/routers/webhook.py`**

1.  Remove `get_redis_connection` import if unused after fix.
2.  Remove `rescrape_queue = ...` line.
3.  Use `queue` (injected argument) instead of `rescrape_queue`.
    *   Note: The injected queue is already named "indexing" in `api/deps.py`.

**Step 3: Commit**

```bash
git add apps/webhook/api/routers/webhook.py
git commit -m "fix(webhook): use injected Queue singleton instead of creating new instance"
```

---

### Task 4: Remove Deprecated Worker

**Context:** `apps/webhook/worker.py` is deprecated and replaced by `worker_thread.py` and `workers/`.

**Files:**
- Delete: `apps/webhook/worker.py`
- Modify: `apps/webhook/main.py` (Verify no imports)
- Modify: `apps/webhook/worker_thread.py` (Check for imports)

**Step 1: Verify safety**
Search for imports of `worker` (the module) in the codebase.
`grep -r "from worker import" apps/webhook`

**Step 2: Delete file**
`rm apps/webhook/worker.py`

**Step 3: Run tests**
Run all tests to ensure no hidden dependencies.
`pytest apps/webhook/tests`

**Step 4: Commit**

```bash
git rm apps/webhook/worker.py
git commit -m "chore(webhook): remove deprecated worker.py"
```

---

### Task 5: Externalize Timeouts

**Context:** `scrape.py` has hardcoded timeout buffer (`+ 10.0`).

**Files:**
- Modify: `apps/webhook/config.py`
- Modify: `apps/webhook/api/routers/scrape.py`

**Step 1: Add to Config**

In `apps/webhook/config.py`, add `firecrawl_timeout_buffer: float = 10.0` to `Settings`.

**Step 2: Update Scrape Router**

In `apps/webhook/api/routers/scrape.py`, replace `10.0` with `settings.firecrawl_timeout_buffer`.

**Step 3: Commit**

```bash
git add apps/webhook/config.py apps/webhook/api/routers/scrape.py
git commit -m "refactor(webhook): externalize scrape timeout buffer"
```

---

### Task 6: Improve Scrape Error Handling

**Context:** `scrape_endpoint` catches generic `Exception` and returns 200 OK with error body. This masks critical infrastructure failures.

**Files:**
- Modify: `apps/webhook/api/routers/scrape.py`

**Step 1: Refactor Exception Handler**

In `scrape_endpoint`:
1.  Catch `HTTPException` explicitly and re-raise.
2.  Catch `ValueError`, `ValidationError` (logical errors) and return `ScrapeResponse(success=False, ...)` (200 OK).
3.  For generic `Exception`, raise `HTTPException(status_code=500, detail=str(e))`.

**Step 2: Implementation**

Inside `scrape_endpoint`:
```python
    except HTTPException:
        raise
    except (ValueError, TypeError) as e:
        # Input/Logic errors -> 200 OK with error message
        logger.warning(...)
        return ScrapeResponse(success=False, error=...)
    except Exception as e:
        # Unexpected system errors -> 500 Internal Server Error
        logger.exception("Critical scrape error")
        raise HTTPException(status_code=500, detail=str(e))
```

**Step 3: Commit**

```bash
git add apps/webhook/api/routers/scrape.py
git commit -m "fix(webhook): raise 500 for system errors in scrape endpoint"
```

---

### Task 7: Optimize BM25 Batch Indexing

**Context:** `BM25Engine` saves the index to disk after *every* document insertion. `BatchWorker` processes documents in parallel but indexes them one by one.

**Files:**
- Modify: `apps/webhook/services/bm25_engine.py`
- Modify: `apps/webhook/services/indexing.py`
- Modify: `apps/webhook/workers/batch_worker.py`

**Step 1: Add `add_documents` to BM25Engine**

In `services/bm25_engine.py`:
Add method `def add_documents(self, documents: list[tuple[str, dict]]) -> None:`
- Takes list of (text, metadata).
- Updates corpus/metadata in memory.
- Rebuilds BM25 *once*.
- Saves index *once*.

**Step 2: Add `index_documents` to IndexingService**

In `services/indexing.py`:
Add `async def index_documents(self, documents: list[IndexDocumentRequest], ...)`
- Use `text_chunker` to chunk all.
- Use `embedding_service` to embed all (concurrently).
- Use `vector_store` to upsert all (batch).
- Use `bm25_engine.add_documents` (batch).

**Step 3: Update BatchWorker**

In `workers/batch_worker.py`:
Update `process_batch` to use `indexing_service.index_documents` (bulk operation) instead of looping `_index_document_async`.

**Step 4: Commit**

```bash
git add apps/webhook/services/bm25_engine.py apps/webhook/services/indexing.py apps/webhook/workers/batch_worker.py
git commit -m "perf(webhook): implement batch document indexing for BM25"
```
