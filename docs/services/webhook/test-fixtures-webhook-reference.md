# Webhook Server - Test Fixtures & Mock Reference

Quick reference for fixtures, mocks, and testing patterns used in the webhook test suite.

---

## Global Fixtures (conftest.py)

### Database Fixtures

#### `initialize_test_database()` (Session-scoped, auto-use)
```python
@pytest_asyncio.fixture(scope="session", autouse=True)
async def initialize_test_database():
    """Initialize PostgreSQL test schema."""
```
- **Scope**: Session (runs once per test session)
- **Auto-use**: Yes (automatic)
- **Purpose**: Create `webhook_test` database schema via Alembic
- **Cleanup**: Disposes database engine after all tests
- **Note**: Can be skipped with `WEBHOOK_SKIP_DB_FIXTURES=1`

#### `cleanup_database_engine()` (Function-scoped, auto-use)
```python
@pytest_asyncio.fixture(autouse=True)
async def cleanup_database_engine():
    yield
    await database.engine.dispose()
```
- **Scope**: Function (runs per test)
- **Auto-use**: Yes (automatic)
- **Purpose**: Dispose SQLAlchemy engine after each test
- **Why**: Prevents event loop conflicts in async tests

#### `db_session` (Function-scoped)
```python
@pytest_asyncio.fixture
async def db_session():
    """Provide a database session with auto-rollback."""
    async with get_db_context() as session:
        yield session
        await session.rollback()
```
- **Scope**: Function
- **Purpose**: Direct database access for assertions
- **Auto-rollback**: Yes, after test completes
- **Usage**: `async def test_something(db_session): ...`
- **Pattern**: Query database directly to verify side effects

---

### Service Stub Fixtures

#### `stub_external_services()` (Function-scoped, auto-use)
```python
@pytest.fixture(autouse=True)
def stub_external_services(monkeypatch, in_memory_queue):
    """Replace external services with in-memory stubs."""
```
- **Scope**: Function (runs per test)
- **Auto-use**: Yes (but respects `@pytest.mark.external`)
- **Purpose**: Inject in-memory doubles for all external services
- **Stubs**:
  1. Redis → InMemoryRedis()
  2. Qdrant → InMemoryVectorStore
  3. TEI → InMemoryEmbeddingService
  4. RQ Queue → InMemoryQueue
  5. Rate limiter → disabled
- **Skip external marker**: `@pytest.mark.external` bypasses stubs
- **Cleanup**: Automatic cleanup in finally block

#### `in_memory_queue` (Function-scoped)
```python
@pytest.fixture
def in_memory_queue() -> InMemoryQueue:
    """Provide an in-memory RQ queue."""
    return InMemoryQueue()
```
- **Type**: InMemoryQueue (custom class)
- **Records**: All enqueued jobs as JobStub objects
- **Methods**:
  - `enqueue(func, *args, **kwargs)` → JobStub
  - `clear()` - Clear all jobs
  - `len()` - Number of jobs
- **Usage**:
  ```python
  def test_something(in_memory_queue):
      # Make request that enqueues a job
      response = client.post("/api/index", json=...)
      
      # Check job was enqueued
      assert len(in_memory_queue.jobs) == 1
      job = in_memory_queue.jobs[0]
      
      # Execute synchronously
      job.perform()
      assert job.is_finished
  ```

#### `in_memory_vector_store_cls` (Function-scoped)
```python
@pytest.fixture
def in_memory_vector_store_cls() -> type[InMemoryVectorStore]:
    """Expose InMemoryVectorStore class for assertions."""
    return InMemoryVectorStore
```
- **Purpose**: Access the class for `collections` assertions
- **Usage**:
  ```python
  def test_something(in_memory_vector_store_cls):
      # Make request that indexes documents
      response = client.post("/api/index", json=...)
      job.perform()
      
      # Verify documents were stored
      collections = in_memory_vector_store_cls.collections
      assert "my_collection" in collections
      assert len(collections["my_collection"]) > 0
  ```

---

### API & Auth Fixtures

#### `client` (Function-scoped)
```python
@pytest.fixture
def client() -> Generator[TestClient, None, None]:
    """Create FastAPI TestClient."""
    from main import app
    with TestClient(app) as test_client:
        yield test_client
```
- **Type**: FastAPI TestClient
- **App**: Uses actual app lifespan
- **Usage**:
  ```python
  def test_search(client, api_secret_header):
      response = client.post(
          "/api/search",
          json={"query": "test"},
          headers=api_secret_header
      )
      assert response.status_code == 200
  ```

#### `api_secret_header` (Function-scoped)
```python
@pytest.fixture
def api_secret_header() -> dict[str, str]:
    """Provide Authorization header."""
    from config import settings
    return {"Authorization": f"Bearer {settings.api_secret}"}
```
- **Returns**: Dict with Authorization header
- **Value**: Test API secret from settings
- **Usage**: Pass as `headers=api_secret_header` to client

#### `api_secret` (Function-scoped)
```python
@pytest.fixture
def api_secret() -> str:
    """Expose API secret string."""
    from config import settings
    return settings.api_secret
```
- **Returns**: Raw secret string
- **Usage**: HMAC computation, header creation
- **Test value**: `"test-api-secret-for-testing-only"`

#### `test_queue` (Function-scoped)
```python
@pytest.fixture
def test_queue():
    """Provide mock RQ queue."""
    from unittest.mock import MagicMock
    queue = MagicMock()
    job = MagicMock()
    job.id = "test-job-id"
    queue.enqueue.return_value = job
    return queue
```
- **Type**: unittest.mock.MagicMock
- **Purpose**: Mock queue for webhook handler testing
- **Preconfigured**: enqueue() returns job with ID
- **Usage**:
  ```python
  def test_webhook_handler(test_queue):
      test_queue.enqueue.return_value.id = "custom-id"
      # Test handler that uses queue
  ```

---

### Sample Data Fixtures

#### `sample_document_dict` (Function-scoped)
```python
@pytest.fixture
def sample_document_dict() -> dict[str, Any]:
    """Firecrawl document structure."""
    return {
        "url": "https://example.com/ml-guide",
        "resolvedUrl": "https://example.com/ml-guide",
        "title": "Machine Learning Guide",
        "description": "A comprehensive guide...",
        "markdown": "# Machine Learning Guide\n...",
        "html": "<html>...",
        "statusCode": 200,
        "language": "en",
        "country": "US",
        "isMobile": False,
    }
```
- **Matches**: Firecrawl webhook payload format
- **Fields**: All standard document metadata
- **Usage**:
  ```python
  def test_index(client, sample_document_dict):
      response = client.post("/api/index", json=sample_document_dict)
  ```

#### `sample_markdown` (Function-scoped)
```python
@pytest.fixture
def sample_markdown() -> str:
    """Sample markdown text."""
    return """
    # Machine Learning Guide
    ...
    """
```
- **Content**: Multi-paragraph with headings and lists
- **Usage**: Chunking, text processing tests

---

## Custom Fixtures by Module

### test_api_routes.py

#### `mock_request`
```python
@pytest.fixture
def mock_request() -> MagicMock:
    """Mock Starlette Request object."""
    request = MagicMock(spec=Request)
    request.client.host = "127.0.0.1"
    return request
```
- **Type**: MagicMock(spec=Request)
- **Client IP**: "127.0.0.1"
- **Usage**: Rate limiting, IP-based tests

#### `mock_queue`
```python
@pytest.fixture
def mock_queue() -> MagicMock:
    """Mock RQ queue."""
    queue = MagicMock()
    mock_job = MagicMock()
    mock_job.id = "test-job-123"
    queue.enqueue.return_value = mock_job
    return queue
```
- **Job ID**: "test-job-123"
- **Assertion**: Check `queue.enqueue.assert_called_once()`

#### `mock_search_orchestrator`
```python
@pytest.fixture
def mock_search_orchestrator() -> AsyncMock:
    """Mock SearchOrchestrator."""
    orchestrator = AsyncMock()
    orchestrator.search.return_value = [
        {"id": "1", "score": 0.95, "payload": {...}},
    ]
    return orchestrator
```
- **Type**: AsyncMock (not MagicMock)
- **Return**: List of search results
- **Usage**: `await orchestrator.search(...)`

#### `mock_services`
```python
@pytest.fixture
def mock_services() -> dict[str, Any]:
    """Mock all services for health check."""
    embedding = AsyncMock()
    embedding.health_check.return_value = True
    
    vector_store = AsyncMock()
    vector_store.health_check.return_value = True
    vector_store.count_points.return_value = 100
    
    bm25 = MagicMock()
    bm25.get_document_count.return_value = 50
    
    return {
        "embedding": embedding,
        "vector_store": vector_store,
        "bm25": bm25,
    }
```
- **Embedding**: AsyncMock, supports health_check()
- **Vector store**: AsyncMock, has count_points()
- **BM25**: Regular MagicMock (sync interface)

### test_api.py

#### `override_search_dependency`
```python
@pytest.fixture(autouse=True)
def override_search_dependency() -> Generator[None]:
    """Override search orchestrator."""
    stub = StubSearchOrchestrator()
    app.dependency_overrides[get_search_orchestrator] = lambda: stub
    yield
    app.dependency_overrides.pop(get_search_orchestrator, None)
```
- **Scope**: Function (autouse)
- **Pattern**: Dependency override with cleanup
- **Cleanup**: Removes override in finally
- **Note**: Prevents pollution across tests

### test_changedetection_webhook.py

No custom fixtures; uses conftest fixtures + `db_session`

---

## In-Memory Service Stubs

### InMemoryRedis
```python
class InMemoryRedis:
    def ping(self) -> bool:
        return True
    
    def close(self) -> None:
        self._closed = True
    
    def delete(self, key: str) -> None:
        pass
    
    def scan_iter(self, pattern: str):
        return iter(())
    
    def blpop(self, key: str, timeout: int = 0):
        return None
```
- **Purpose**: Health checks, compatibility
- **Minimal**: Only essential methods implemented

### InMemoryQueue
```python
class InMemoryQueue:
    def __init__(self):
        self.jobs: list[JobStub] = []
    
    def enqueue(self, func, *args, **kwargs) -> JobStub:
        job_id = kwargs.pop("job_id", None) or f"inmem-job-{uuid4().hex[:8]}"
        job = JobStub(func, args, {k: v for k, v in kwargs.items() 
                      if k not in _JOB_OPTION_KEYS}, job_id, ...)
        self.jobs.append(job)
        return job
    
    def clear(self) -> None:
        self.jobs.clear()
```
- **Job recording**: All enqueued jobs stored
- **Sync execution**: `job.perform()` runs immediately
- **Status tracking**: `job._status` → queued|finished|failed

### JobStub
```python
class JobStub:
    def perform(self) -> None:
        """Execute job synchronously."""
        try:
            if isinstance(self.func_ref, str):
                module, attr = self.func_ref.rsplit(".", 1)
                target = getattr(importlib.import_module(module), attr)
            else:
                target = self.func_ref
            self.result = target(*self.args, **self.kwargs)
            self._status = "finished"
        except Exception as exc:
            self.result = exc
            self._status = "failed"
            raise
    
    @property
    def is_finished(self) -> bool:
        return self._status == "finished"
    
    @property
    def is_failed(self) -> bool:
        return self._status == "failed"
```
- **Execution**: Synchronous function call
- **String references**: Supports module.function strings
- **Result storage**: Available in `job.result`

### InMemoryVectorStore
```python
class InMemoryVectorStore:
    collections: ClassVar[dict[str, list[dict]]] = {}
    
    def __init__(self, url, collection_name, vector_dim):
        self._storage = self.collections.setdefault(collection_name, [])
    
    async def index_chunks(self, chunks, embeddings, document_url):
        for chunk, embedding in zip(chunks, embeddings):
            self._storage.append({
                "chunk": chunk,
                "embedding": embedding,
                "document_url": document_url,
            })
        return len(chunks)
    
    async def count_points(self) -> int:
        return len(self._storage)
    
    @classmethod
    def reset(cls) -> None:
        cls.collections.clear()
```
- **Class-level storage**: Shared across tests
- **Collections dict**: By collection name
- **Reset**: Call between tests to clear
- **Deterministic**: No randomness

### InMemoryEmbeddingService
```python
class InMemoryEmbeddingService:
    def __init__(self, *args, **kwargs):
        self.vector_dim = 3
    
    async def embed_single(self, text: str) -> list[float]:
        length = float(len(text))
        return [length, length % 7, length % 3]
    
    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        return [self._embed_text(text) for text in texts]
```
- **Deterministic**: Same text → same embedding
- **Vector dim**: 3 (small for tests)
- **Formula**: `[len(text), len(text) % 7, len(text) % 3]`

---

## Testing Patterns

### Pattern 1: Job Queue Testing

```python
def test_webhook_indexing(client, in_memory_queue):
    # 1. Trigger job enqueue
    response = client.post(
        "/api/index",
        json=document,
        headers=api_secret_header
    )
    assert response.status_code == 202
    
    # 2. Access enqueued job
    assert len(in_memory_queue.jobs) == 1
    job = in_memory_queue.jobs[0]
    
    # 3. Execute synchronously
    job.perform()
    
    # 4. Verify results
    assert job.is_finished
    assert job.result["success"] is True
```

### Pattern 2: Database Side Effects

```python
@pytest.mark.asyncio
async def test_webhook_stores_event(client, db_session):
    # 1. Make request
    response = client.post("/api/webhook/changedetection", ...)
    
    # 2. Query database
    result = await db_session.execute(
        select(ChangeEvent).where(ChangeEvent.watch_id == "test-123")
    )
    event = result.scalar_one_or_none()
    
    # 3. Verify
    assert event is not None
    assert event.watch_url == "https://example.com/test"
```

### Pattern 3: Service Stub Verification

```python
def test_search(client, in_memory_vector_store_cls):
    # 1. Index document (triggers embedding)
    client.post("/api/index", json=document)
    job = in_memory_queue.jobs[0]
    job.perform()
    
    # 2. Access in-memory collection
    collections = in_memory_vector_store_cls.collections
    assert "webhook" in collections
    assert len(collections["webhook"]) > 0
    
    # 3. Verify chunk contents
    chunk = collections["webhook"][0]
    assert "embedding" in chunk
    assert len(chunk["embedding"]) == 3
```

### Pattern 4: HMAC Signature Testing

```python
def test_webhook_signature(client, api_secret):
    payload = {"watch_id": "123", "watch_url": "https://example.com"}
    body = json.dumps(payload).encode()
    
    signature = hmac.new(
        api_secret.encode(), body, hashlib.sha256
    ).hexdigest()
    
    response = client.post(
        "/api/webhook/changedetection",
        headers={"X-Signature": f"sha256={signature}"},
        content=body
    )
    assert response.status_code == 202
```

### Pattern 5: Parametrized Tests (Not currently used)

```python
@pytest.mark.parametrize("query,expected_count", [
    ("test", 1),
    ("machine learning", 2),
    ("nonexistent", 0),
])
def test_search_queries(client, query, expected_count):
    response = client.post(
        "/api/search",
        json={"query": query},
        headers=api_secret_header
    )
    assert len(response.json()["results"]) == expected_count
```

---

## Common Fixture Combinations

### API Contract Testing
```python
def test_endpoint(client, api_secret_header):
    """Use client + auth fixtures."""
```

### End-to-End Testing
```python
def test_workflow(client, api_secret_header, in_memory_queue):
    """Use client + auth + job queue."""
```

### Database Assertions
```python
@pytest.mark.asyncio
async def test_side_effects(client, api_secret_header, db_session):
    """Use async test + database session."""
```

### Service Verification
```python
def test_search(client, in_memory_queue, in_memory_vector_store_cls):
    """Verify service behavior via stubs."""
```

### Mock Request Testing
```python
async def test_rate_limit(mock_request, mock_queue):
    """Use mocks for specific components."""
```

---

## Fixture Lifecycle

### Session Scope (Full Test Run)
1. `initialize_test_database()` → Create schema
2. All tests run
3. `initialize_test_database()` cleanup → Dispose engine

### Function Scope (Per Test)
1. Fixtures instantiated
2. `stub_external_services()` setup
3. Test runs
4. Fixtures teardown
5. `stub_external_services()` cleanup
6. `cleanup_database_engine()` → Dispose engine

### Execution Order
1. Session fixtures first
2. Function fixtures
3. Auto-use fixtures (applied automatically)
4. Test function
5. Fixtures teardown (reverse order)

---

## Tips & Best Practices

1. **Always reset in-memory stores**
   - `InMemoryVectorStore.reset()` between tests
   - `in_memory_queue.clear()` between tests

2. **Use specific fixtures per test need**
   - Only request needed fixtures
   - Reduces unnecessary setup

3. **Leverage auto-use for common setup**
   - `stub_external_services` handles service injection
   - `cleanup_database_engine` handles engine cleanup

4. **Group related assertions**
   - Status code first
   - Then response content
   - Then side effects (database, queues)

5. **Mock at the lowest level needed**
   - Full stubs > partial mocks > real services
   - Stubs are more maintainable

6. **Document fixture expectations**
   - Type hints required
   - Docstrings explain purpose

---

## Troubleshooting

### "Event loop is closed" Error
**Cause**: Database engine not disposed between tests
**Fix**: `cleanup_database_engine` should be running (auto-use)

### Job Not Executing
**Cause**: Forgot to call `job.perform()`
**Fix**: 
```python
job = in_memory_queue.jobs[0]
job.perform()  # Execute synchronously
```

### Fixture Not Available
**Cause**: Typo in fixture name or wrong module
**Fix**: Check conftest.py for fixture definition

### Mock Not Being Used
**Cause**: Service instantiated before monkeypatch
**Fix**: Ensure monkeypatch happens before service import

### Database Changes Lost
**Cause**: Forgot `await session.commit()`
**Fix**: Use `db_session` which auto-commits, or explicitly commit:
```python
await session.execute(insert(Model).values(...))
await session.commit()
```

