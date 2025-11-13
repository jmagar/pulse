# Webhook Server Background Processing & Worker Architecture

## Executive Summary

The webhook server implements a **dual-mode background processing system** using **RQ (Redis Queue)** for job management:

1. **Embedded Worker Thread** (Development): Worker runs in background thread within the FastAPI process
2. **Standalone Worker Container** (Production): Separate RQ worker container processing the same Redis queue

Both modes share the same job queue infrastructure and can coexist. The system processes two types of jobs:
- **Document indexing** from Firecrawl webhooks
- **URL rescraping** from changedetection.io webhooks

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Queue System & Job Types](#queue-system--job-types)
3. [Worker Implementation](#worker-implementation)
4. [Job Processing Patterns](#job-processing-patterns)
5. [Redis Integration](#redis-integration)
6. [Service Pool & Resource Management](#service-pool--resource-management)
7. [Health Monitoring](#health-monitoring)
8. [Deployment Modes](#deployment-modes)
9. [Configuration](#configuration)
10. [Testing & Verification](#testing--verification)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     FastAPI API Server                      │
│  ┌──────────────────────────────────────────────────────┐   │
│  │             Webhook Endpoints                        │   │
│  │  ├─ POST /api/webhook/firecrawl (job enqueue)        │   │
│  │  ├─ POST /api/webhook/changedetection (job enqueue)  │   │
│  │  └─ POST /api/index (legacy, job enqueue)            │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │         Optional Embedded Worker Thread              │   │
│  │  ├─ Enabled by: WEBHOOK_ENABLE_WORKER=true           │   │
│  │  ├─ Runs in background thread                        │   │
│  │  ├─ Shared service pool with API                     │   │
│  │  └─ Processes "indexing" queue from Redis            │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              ↓
                    ┌─────────────────────┐
                    │   Redis Queue       │
                    │  (pulse_redis)      │
                    │  Queue: "indexing"  │
                    └─────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│     Standalone Worker Container (Optional Production)       │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  RQ Worker (python -m rq.cli worker ...)             │   │
│  │  ├─ Separate container: pulse_webhook-worker         │   │
│  │  ├─ Same queue: "indexing"                           │   │
│  │  ├─ Worker TTL: 600 seconds                          │   │
│  │  ├─ Service pool initialization on startup           │   │
│  │  └─ Processes both indexing & rescrape jobs          │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              ↓
                 ┌──────────────────────────┐
                 │  External Services       │
                 ├─ Qdrant (vector storage) │
                 ├─ TEI (embeddings)        │
                 └─ Firecrawl API           │
```

---

## Queue System & Job Types

### RQ (Redis Queue) Framework

The system uses **RQ v2.6.0+**, a Python job queue framework built on Redis:

```python
# From pyproject.toml
dependencies = [
    "redis>=7.0.1",
    "rq>=2.6.0",
    ...
]
```

**Key RQ Concepts:**
- **Queue**: Named list in Redis storing job references
- **Job**: Serialized function call with arguments
- **Worker**: Process listening to queue, executing jobs
- **Job Status**: queued → started → finished/failed

### Queue Configuration

```python
# From infra/redis.py
def get_redis_queue(name: str = "default") -> Queue:
    """Get RQ queue for background jobs."""
    redis_conn = get_redis_connection()
    return Queue(name, connection=redis_conn)
```

**Single Queue: "indexing"**
- All async jobs use queue name: `"indexing"`
- Both indexing and rescrape jobs share this queue
- Queue lives in Redis at key: `rq:queue:indexing`

### Job Types

#### 1. Document Indexing Job

**Enqueued by:** `POST /api/webhook/firecrawl` and `POST /api/index` endpoints

```python
# From api/routers/indexing.py
job = queue.enqueue(
    "worker.index_document_job",  # Function path
    document.model_dump(),         # Document dict
    job_timeout="10m",             # 10 minute timeout
)
```

**Job Function:** `/compose/pulse/apps/webhook/worker.py::index_document_job`

**Behavior:**
```python
def index_document_job(document_dict: dict[str, Any]) -> dict[str, Any]:
    """
    Background job to index a document.
    
    RQ requires synchronous functions, so this wraps async implementation.
    Args:
        document_dict: Document data as dictionary
    Returns:
        Indexing result with success/failure status
    """
    return asyncio.run(_index_document_async(document_dict))
```

**Processing Steps:**
1. Parse document dict into `IndexDocumentRequest` schema
2. Get service pool singleton (FAST - no initialization)
3. Ensure Qdrant collection exists
4. Chunk text into tokens using tokenizer
5. Generate embeddings via TEI
6. Index chunks to Qdrant (vector) + BM25 (keyword)
7. Return result with success status

**Performance:** ~0.001s per job overhead (after pool initialization)

#### 2. Rescrape Changed URL Job

**Enqueued by:** `POST /api/webhook/changedetection` endpoint

```python
# From api/routers/webhook.py
job = rescrape_queue.enqueue(
    "app.jobs.rescrape.rescrape_changed_url",  # Function path
    change_event.id,                            # Change event ID
    job_timeout="10m",                          # 10 minute timeout
)
```

**Job Function:** `/compose/pulse/apps/webhook/workers/jobs.py::rescrape_changed_url`

**Behavior:**
```python
async def rescrape_changed_url(change_event_id: int) -> dict[str, Any]:
    """
    Rescrape URL detected as changed by changedetection.io.
    
    Transaction strategy:
    1. Mark as in_progress in separate transaction
    2. Execute Firecrawl + indexing (no DB changes)
    3. Update final status in final transaction
    """
```

**Processing Steps:**
1. Fetch ChangeEvent from database by ID
2. Mark status as `in_progress`, commit
3. Call Firecrawl API to scrape updated content
4. Parse markdown from Firecrawl response
5. Index using _index_document_helper
6. Update ChangeEvent with final status + indexed_at timestamp
7. Handle failures with detailed error messages

**Timeout:** 10 minutes (includes Firecrawl scraping time)

---

## Worker Implementation

### Two Deployment Models

#### Model 1: Embedded Worker Thread (Development/Small Scale)

**File:** `worker_thread.py`

**Purpose:** Run worker in background thread within FastAPI process

**Class: WorkerThreadManager**

```python
class WorkerThreadManager:
    """Manages RQ worker in background thread."""
    
    def __init__(self) -> None:
        self._thread: threading.Thread | None = None
        self._running: bool = False
        self._worker: Worker | None = None
    
    def start(self) -> None:
        """Start worker thread (called during FastAPI startup)."""
        self._thread = threading.Thread(
            target=self._run_worker,
            name="rq-worker",
            daemon=True,
        )
        self._thread.start()
    
    def stop(self) -> None:
        """Stop worker gracefully (called during FastAPI shutdown)."""
        self._running = False
        if self._worker is not None:
            self._worker.request_stop(signum=None, frame=None)
        # Wait with timeout, cleanup services
```

**Lifecycle Management:**

```
FastAPI Startup
    ↓
  [lifespan context manager]
    ├─ settings.enable_worker check
    ├─ WorkerThreadManager().start()
    ├─ Thread enters _run_worker()
    │   ├─ ServicePool.get_instance() [pre-init for perf]
    │   └─ worker.work() [blocks in loop]
    └─ Returns to API serving

FastAPI Shutdown
    ↓
  [lifespan context manager cleanup]
    ├─ worker_manager.stop()
    │   ├─ Set _running = False
    │   ├─ worker.request_stop()
    │   ├─ thread.join(timeout=10s)
    │   └─ ServicePool.close() [cleanup connections]
    └─ Full shutdown
```

**Key Implementation Detail - Signal Handling:**
```python
# From worker_thread.py line 137
# Disable signal handlers since we're in a background thread
# Signal handlers only work in the main thread
self._worker._install_signal_handlers = lambda: None  # type: ignore[method-assign]
```

**Configuration:** `WEBHOOK_ENABLE_WORKER` (default: `true`)

**Advantages:**
- Single process/container
- Shared service pool (no file sync overhead)
- Easier development

#### Model 2: Standalone Worker Container (Production/Scale)

**File:** `worker.py`

**Purpose:** Run dedicated RQ worker process in separate container

**Entry Point:** `python -m rq.cli worker`

**Docker Compose Configuration:**

```yaml
pulse_webhook-worker:
  build:
    context: ./apps/webhook
  container_name: pulse_webhook-worker
  command:
    - "python"
    - "-m"
    - "rq.cli"
    - "worker"
    - "--url"
    - "redis://pulse_redis:6379"
    - "--name"
    - "search-bridge-worker"
    - "--worker-ttl"
    - "600"              # Worker heartbeat TTL
    - "indexing"         # Queue name
  volumes:
    - .../pulse_webhook/bm25:/app/data/bm25
    - .../pulse_webhook/hf_cache:/app/.cache/huggingface
  depends_on:
    - pulse_postgres
    - pulse_redis
```

**RQ CLI Options Explained:**
- `--url redis://pulse_redis:6379` - Redis connection
- `--name search-bridge-worker` - Worker name (for monitoring)
- `--worker-ttl 600` - Worker heartbeat timeout (seconds)
- `indexing` - Queue to process

**Startup Validation:**

```python
# From worker.py::run_worker()
async def _validate_external_services() -> bool:
    """Validate TEI, Qdrant accessible before starting."""
    embedding_service = EmbeddingService(tei_url=settings.tei_url)
    vector_store = VectorStore(...)
    
    # Check both services, fail fast if unavailable
    if not (await embedding_service.health_check() and 
            await vector_store.health_check()):
        logger.error("External service validation failed")
        sys.exit(1)
```

**Advantages:**
- Horizontal scaling (multiple worker containers)
- Process isolation from API
- Separate resource allocation
- Better for high-throughput

#### Hybrid Model (Docker Compose Default)

The production docker-compose.yaml uses **both**:

```yaml
pulse_webhook:
  environment:
    WEBHOOK_ENABLE_WORKER: "false"  # Embedded worker DISABLED
  # API only, ~40 workers can be scaled
  
pulse_webhook-worker:
  # Separate worker container
  # Can be scaled independently
```

**Why Hybrid?**
1. API container is lightweight (no worker overhead)
2. Worker container can be independently scaled
3. Both share same Redis queue and service pool

---

## Job Processing Patterns

### Job Enqueueing Pattern

**Request → Job Enqueue → 202 Accepted → Worker Processes**

```python
# From api/routers/indexing.py::index_document()
@router.post("/index", status_code=202)  # 202 = Accepted
async def index_document(
    document: IndexDocumentRequest,
    queue: Annotated[Queue, Depends(get_rq_queue)],
) -> IndexDocumentResponse:
    """Queue a document for async indexing."""
    
    job = queue.enqueue(
        "worker.index_document_job",
        document.model_dump(),
        job_timeout="10m",
    )
    
    return IndexDocumentResponse(
        job_id=job.id,
        status="queued",  # Return immediately
        message=f"Document queued for indexing: {document.url}",
    )
```

**Synchronous Alternative (Test Only):**

```python
# From api/routers/indexing.py::test_index_document()
@router.post("/test-index", status_code=200)
async def test_index_document(
    document: IndexDocumentRequest,
    indexing_service: Annotated[IndexingService, Depends(get_indexing_service)],
) -> dict[str, Any]:
    """Synchronous indexing for testing (no queue)."""
    result = await indexing_service.index_document(document)
    return {"status": "success", **result}
```

### Error Handling in Jobs

**Indexing Job Error Handling:**

```python
# From worker.py::_index_document_async()
async def _index_document_async(document_dict: dict[str, Any]) -> dict[str, Any]:
    try:
        # Parse
        document = IndexDocumentRequest(**document_dict)
        
        # Get services, index, return result
        result = await indexing_service.index_document(document, job_id=job_id)
        return result  # {success: true, ...}
        
    except Exception as e:
        logger.error("Indexing job failed", error=str(e), exc_info=True)
        return {
            "success": False,
            "url": document_dict.get("url"),
            "error": str(e),
            "error_type": type(e).__name__,
        }
```

**Result is returned, not raised** - allows job to complete with failure status

**Rescrape Job Error Handling:**

```python
# From workers/jobs.py::rescrape_changed_url()
try:
    # Scrape + index
    doc_id = await _index_document_helper(...)
except Exception as e:
    # Update DB with failure
    await session.execute(
        update(ChangeEvent)
        .where(ChangeEvent.id == change_event_id)
        .values(
            rescrape_status=f"failed: {str(e)[:200]}",
            extra_metadata={"error": str(e), "failed_at": ...},
        )
    )
    raise  # Re-raise to mark job as failed
```

**Error is raised** - marks job as failed in RQ, allows retries

### Job Timeout Configuration

**All Jobs:** 10 minute timeout

```python
job = queue.enqueue(
    "worker.index_document_job",
    document.model_dump(),
    job_timeout="10m",  # 600 seconds
)
```

**Why 10 Minutes?**
- Covers Firecrawl API calls (typically 5-30 seconds)
- Covers embeddings generation (variable size content)
- Covers Qdrant indexing (typically <100ms)
- Conservative for network/service latency

---

## Redis Integration

### Connection Management

**File:** `infra/redis.py`

```python
def get_redis_connection() -> Redis:
    """Create Redis connection from settings."""
    return Redis.from_url(settings.redis_url)

def get_redis_queue(name: str = "default") -> Queue:
    """Get RQ queue for background jobs."""
    redis_conn = get_redis_connection()
    return Queue(name, connection=redis_conn)
```

**Configuration:** `WEBHOOK_REDIS_URL` (default: `redis://localhost:52101`)

**Fallback aliases:**
- `WEBHOOK_REDIS_URL` (monorepo naming)
- `REDIS_URL` (shared infrastructure)
- `SEARCH_BRIDGE_REDIS_URL` (legacy naming)

### Redis Data Structures

**Queue Management:**
```
redis_key: rq:queue:indexing
type: list
contents: Job IDs
```

**Job Details:**
```
redis_key: rq:job:{job_id}
type: hash
fields:
  - data: pickled job with function, args
  - created_at: timestamp
  - started_at: timestamp
  - ended_at: timestamp
  - status: queued/started/finished/failed
  - result: pickled result (if finished)
```

**Worker Registration:**
```
redis_key: rq:workers
type: set
contents: Worker IDs ("search-bridge-worker")
```

### Cleanup & Lifecycle

**API Shutdown Cleanup:**

```python
# From api/deps.py::cleanup_services()
# Close Redis connection (in thread pool to avoid blocking)
if _redis_conn is not None:
    await asyncio.to_thread(_redis_conn.close)
    _redis_conn = None
    _rq_queue = None  # Depends on Redis
```

**Worker Shutdown Cleanup:**

```python
# From worker_thread.py::stop()
# Signal worker to stop, wait with timeout, cleanup services
self._worker.request_stop(signum=None, frame=None)
self._thread.join(timeout=10.0)
# Then close service pool
pool.close()
```

---

## Service Pool & Resource Management

### Problem Solved

**Without Service Pool:**
- Every job reinitializes expensive services
- TextChunker: 1-5 seconds (loads HuggingFace tokenizer)
- EmbeddingService: Creates new HTTP client
- VectorStore: Creates new Qdrant client
- **Result:** 1-5 seconds overhead per job!

**With Service Pool:**
- Services initialized once on worker startup
- All jobs reuse same instances
- ~0.001 second overhead per job
- **1000x performance improvement**

### ServicePool Implementation

**File:** `services/service_pool.py`

```python
class ServicePool:
    """Singleton service pool for expensive services."""
    
    _instance: ClassVar["ServicePool | None"] = None
    _lock: ClassVar[threading.Lock] = threading.Lock()
    
    def __init__(self) -> None:
        """Initialize all services once."""
        self.text_chunker = TextChunker(...)  # HF tokenizer
        self.embedding_service = EmbeddingService(...)  # HTTP client
        self.vector_store = VectorStore(...)  # Qdrant client
        self.bm25_engine = BM25Engine(...)  # BM25 index
    
    @classmethod
    def get_instance(cls) -> "ServicePool":
        """Get singleton (thread-safe double-checked locking)."""
        if cls._instance is not None:
            return cls._instance
        with cls._lock:
            if cls._instance is None:
                cls._instance = cls()
            return cls._instance
```

**Thread Safety:**

```python
# Double-checked locking pattern
if cls._instance is not None:          # Fast path (no lock)
    return cls._instance
with cls._lock:                        # Slow path (first init)
    if cls._instance is None:          # Check again after lock
        cls._instance = cls()
    return cls._instance
```

**Why Thread-Safe?**
- Embedded worker runs in background thread
- Multiple API requests might call get_instance() concurrently
- First caller initializes, others wait for lock and get cached instance

### Service Pool Lifecycle

**In Embedded Worker Mode:**

```
FastAPI Startup
  ↓
WorkerThreadManager.start()
  ↓
_run_worker() [background thread]
  ├─ ServicePool.get_instance() [INIT - expensive]
  │  ├─ Load TextChunker tokenizer (1-5s)
  │  ├─ Create EmbeddingService HTTP client
  │  ├─ Create VectorStore Qdrant client
  │  └─ Create BM25Engine
  │
  ├─ worker.work() [infinite loop]
  │  ├─ Pop job from Redis queue
  │  ├─ index_document_job(doc)
  │  │  └─ ServicePool.get_instance() [FAST - 0.001s]
  │  │     └─ Services already initialized
  │  └─ Continue polling
  │
  └─ [On stop request]
     └─ ServicePool.close()
        ├─ Close HTTP clients
        ├─ Close Qdrant connections
        └─ Reset singleton
```

**In Standalone Worker Mode:**

```
Container Start
  ↓
worker.py::run_worker()
  ├─ Validate services (health checks)
  ├─ ServicePool.get_instance() [INIT]
  ├─ worker.work()
  └─ Services live until container stops
```

### Service Pool Resource Usage

**TextChunker (Tokenizer):**
- Model: Qwen/Qwen3-Embedding-0.6B
- RAM: ~500MB (downloaded on first use)
- Thread-safe: Yes (Rust-based semantic-text-splitter)

**EmbeddingService (HTTP Client):**
- Uses `httpx.AsyncClient` with connection pooling
- Thread-safe: Yes
- Connections reused across jobs

**VectorStore (Qdrant Client):**
- Uses qdrant-client library
- Thread-safe: Yes
- Persistent connection to Qdrant server

**BM25Engine:**
- In-memory index (loaded from disk)
- Uses file locking for concurrent access
- Thread-safe: Yes

---

## Health Monitoring

### API Health Endpoint

**Route:** `GET /health`

**File:** `api/routers/health.py`

```python
@router.get("/health")
async def health_check(
    embedding_service: EmbeddingService,
    vector_store: VectorStore,
) -> HealthStatus:
    """Check health of all dependencies."""
    services = {}
    
    # Redis ping
    try:
        redis_conn.ping()
        services["redis"] = "healthy"
    except Exception as e:
        services["redis"] = f"unhealthy: {str(e)}"
    
    # Qdrant check
    try:
        services["qdrant"] = "healthy" if await vector_store.health_check() else "unhealthy"
    except Exception as e:
        services["qdrant"] = f"unhealthy: {str(e)}"
    
    # TEI check
    try:
        services["tei"] = "healthy" if await embedding_service.health_check() else "unhealthy"
    except Exception as e:
        services["tei"] = f"unhealthy: {str(e)}"
    
    return HealthStatus(
        status="healthy" if all_healthy else "degraded",
        services=services,
        timestamp=...,
    )
```

**Response:**
```json
{
    "status": "healthy|degraded",
    "services": {
        "redis": "healthy",
        "qdrant": "healthy",
        "tei": "healthy"
    },
    "timestamp": "2025-11-13 14:30:00 EST"
}
```

### Docker Health Checks

**API Container:**
```yaml
pulse_webhook:
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:52100/health"]
    interval: 30s
    timeout: 10s
    retries: 3
    start_period: 40s
```

**Worker Container:**
```yaml
pulse_webhook-worker:
  # No healthcheck - RQ doesn't expose HTTP endpoint
  # No ports - worker doesn't serve HTTP
  # Monitor via:
  # - Docker logs: docker logs pulse_webhook-worker
  # - Redis: check rq:workers key
```

### Monitoring Worker Health

**Methods:**

1. **Container Logs:**
   ```bash
   docker logs pulse_webhook-worker
   # Shows: job started, completed, failed, etc.
   ```

2. **Redis CLI:**
   ```bash
   redis-cli -p 50104
   > KEYS rq:*
   > HGETALL rq:job:{job_id}
   > LRANGE rq:queue:indexing 0 -1
   ```

3. **RQ Web Dashboard (Optional):**
   ```bash
   # Install: pip install rq-dashboard
   # Run: rq-dashboard -b pulse_redis -p 9181
   # Access: http://localhost:9181
   ```

### Job Status Tracking

**Job Lifecycle:**
```
1. Enqueue (status: queued)
   ├─ Job ID returned to client
   ├─ Data stored in Redis
   └─ Job in queue list
   
2. Worker Dequeue (status: started)
   ├─ Worker pops from queue
   ├─ Marks job as started
   └─ Executes function
   
3. Completion (status: finished)
   ├─ Job function returns
   ├─ Result stored in Redis
   └─ Job removed from queue
   
4. Failure (status: failed)
   ├─ Exception raised (rescrape)
   │  or returned (indexing)
   ├─ Error details stored
   └─ Job removed from queue
```

**Result Retrieval (Future Enhancement):**

Currently, job results are not retrieved by clients. Results are:
- Stored in Redis for 500 seconds (default TTL)
- Used internally for monitoring
- Logged via structured logging

---

## Deployment Modes

### Mode 1: Development (Embedded Worker)

**Configuration:**
```bash
WEBHOOK_ENABLE_WORKER=true      # Enable embedded worker
WEBHOOK_PORT=50108              # Single service port
```

**Docker Compose:**
```yaml
pulse_webhook:
  container_name: pulse_webhook
  # No pulse_webhook-worker container
  # Worker runs in API process background thread
```

**Process Architecture:**
```
┌─ Docker Container (pulse_webhook)
│  ├─ FastAPI API (port 50108)
│  └─ RQ Worker Thread (no port)
└─ Shared ServicePool
```

**Advantages:**
- Simple deployment (one container)
- Shared service pool (best performance)
- Easy debugging

**Disadvantages:**
- API blocked when worker processes large jobs
- Cannot scale worker independently
- Container must restart for worker updates

### Mode 2: Production (Separate Worker)

**Configuration:**
```bash
WEBHOOK_ENABLE_WORKER=false     # Disable embedded worker
WEBHOOK_PORT=50108              # API service port
# Worker runs separately
```

**Docker Compose:**
```yaml
pulse_webhook:
  environment:
    WEBHOOK_ENABLE_WORKER: "false"

pulse_webhook-worker:
  # Separate container for worker
  # Scales independently
```

**Process Architecture:**
```
┌─ Docker Container (pulse_webhook)
│  └─ FastAPI API (port 50108)
│
├─ Docker Container (pulse_webhook-worker)
│  └─ RQ Worker Process
│
├─ Docker Container (pulse_webhook-worker-2) [optional scale]
│  └─ RQ Worker Process
│
└─ Shared Redis Queue ("indexing")
   └─ Both workers consume same queue
```

**Advantages:**
- API never blocked by worker
- Horizontal scaling (multiple worker containers)
- Easier troubleshooting (separate logs)
- Resource isolation

**Disadvantages:**
- More complex deployment
- Cannot reuse file handles/connections between API and worker
- Slight performance overhead for ServicePool init per worker

### Mode 3: Hybrid (Recommended Production)

**Configuration:**
```bash
# API container
WEBHOOK_ENABLE_WORKER=false

# Worker containers (can scale 0 to N)
# pulse_webhook-worker (default 1)
# pulse_webhook-worker-2, etc. (optional scale)
```

**Why This Works Best:**
1. API container is lightweight (no worker overhead)
2. Worker containers handle all async processing
3. Both consume same Redis queue
4. Easy to scale workers independently
5. Clear separation of concerns

---

## Configuration

### Environment Variables

**Core Queue Settings:**

| Variable | Default | Description |
|----------|---------|-------------|
| `WEBHOOK_ENABLE_WORKER` | `true` | Enable embedded worker thread |
| `WEBHOOK_REDIS_URL` | `redis://localhost:52101` | Redis connection URL |
| `WEBHOOK_QDRANT_URL` | `http://localhost:52102` | Qdrant server URL |
| `WEBHOOK_TEI_URL` | `http://localhost:52104` | Text Embeddings Inference URL |

**Job Configuration:**

| Variable | Default | Description |
|----------|---------|-------------|
| Job Timeout | `10m` | Maximum job execution time (hardcoded) |
| Queue Name | `"indexing"` | Single queue for all jobs (hardcoded) |
| Worker Name | `"search-bridge-worker"` | RQ worker identifier (hardcoded) |
| Worker TTL | `600s` | Heartbeat timeout (in docker-compose) |

**Database Configuration (Timing Metrics):**

| Variable | Default | Description |
|----------|---------|-------------|
| `WEBHOOK_DATABASE_URL` | PostgreSQL URL | Timing metrics storage |

### Configuration Validation

**From config.py:**

```python
class Settings(BaseSettings):
    enable_worker: bool = Field(
        default=True,
        validation_alias=AliasChoices("WEBHOOK_ENABLE_WORKER", "SEARCH_BRIDGE_ENABLE_WORKER"),
    )
    
    redis_url: str = Field(
        default="redis://localhost:52101",
        validation_alias=AliasChoices("WEBHOOK_REDIS_URL", "REDIS_URL", "SEARCH_BRIDGE_REDIS_URL"),
    )
```

**Validation Alias Pattern:**
1. Check `WEBHOOK_*` (new monorepo naming)
2. Fall back to shared variables (`REDIS_URL`, `DATABASE_URL`)
3. Fall back to `SEARCH_BRIDGE_*` (legacy naming)

---

## Testing & Verification

### Unit Tests

**File:** `tests/unit/test_worker.py`

```python
def test_index_document_job_success(sample_document_dict):
    """Test successful job execution."""
    with (
        patch("app.worker.TextChunker") as mock_chunker_cls,
        patch("app.worker.EmbeddingService") as mock_embedding_cls,
        patch("app.worker.VectorStore") as mock_vector_store_cls,
    ):
        result = index_document_job(sample_document_dict)
        
        assert result["success"] is True
        assert result["url"] == "https://example.com"
        # Verify services were called
        mock_indexing.index_document.assert_called_once()
```

**File:** `tests/integration/test_worker_integration.py`

```python
def test_worker_starts_with_api_when_enabled(monkeypatch):
    """Worker thread starts during API startup when enabled."""
    monkeypatch.setenv("WEBHOOK_ENABLE_WORKER", "true")
    
    with TestClient(app) as client:
        response = client.get("/health")
        assert response.status_code == 200
        
        # Verify worker running
        assert hasattr(app.state, "worker_manager")
        assert app.state.worker_manager._thread.is_alive()
```

### Manual Verification

**1. Check Worker Status:**
```bash
# Check if worker container is running
docker ps -f name=pulse_webhook-worker

# Check worker logs
docker logs -f pulse_webhook-worker

# Check Redis queue
redis-cli -p 50104 LLEN rq:queue:indexing
```

**2. Enqueue a Test Job:**
```bash
# Index a test document
curl -X POST http://localhost:50108/api/test-index \
  -H "Authorization: Bearer YOUR_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "markdown": "# Test\n\nContent here.",
    "title": "Test Page"
  }'

# Response: 200 OK with timing details (synchronous test endpoint)
```

**3. Monitor Job Execution:**
```bash
# Watch worker logs
docker logs -f pulse_webhook-worker

# Monitor Redis queue depth
watch -n 1 "redis-cli -p 50104 LLEN rq:queue:indexing"

# Monitor job status
redis-cli -p 50104 HGETALL rq:job:{job_id}
```

**4. Test Async Job (with background worker):**
```bash
# Enqueue indexing job (returns 202)
curl -X POST http://localhost:50108/api/index \
  -H "Authorization: Bearer YOUR_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "markdown": "# Test\n\nContent here.",
    "title": "Test Page"
  }'

# Response: 202 Accepted with job_id
# Check logs for actual processing
```

**5. Test Changedetection Rescrape:**
```bash
# Send changedetection webhook
curl -X POST http://localhost:50108/api/webhook/changedetection \
  -H "X-Signature: sha256={hmac}" \
  -H "Content-Type: application/json" \
  -d '{
    "watch_id": "abc123",
    "watch_url": "https://example.com",
    "snapshot": "old content",
    "detected_at": "2025-11-13T14:30:00Z"
  }'

# Response: 202 Accepted with job_id
# Worker will scrape + reindex
```

---

## Summary Table

| Aspect | Implementation |
|--------|-----------------|
| **Queue System** | RQ (Redis Queue) v2.6.0+ |
| **Queue Name** | "indexing" (single queue) |
| **Job Types** | Indexing, Rescrape |
| **Worker Modes** | Embedded (dev), Standalone (prod), Hybrid (recommended) |
| **Service Pool** | Singleton with double-checked locking |
| **Job Timeout** | 10 minutes |
| **Health Check** | GET /health (API + services) |
| **Configuration** | Environment variables with fallbacks |
| **Logging** | Structured logging (TimingMiddleware) |
| **Deployment** | Docker Compose |
| **Scaling** | Horizontal (multiple worker containers) |

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `worker.py` | Standalone worker entry point, job functions |
| `worker_thread.py` | Embedded worker thread management |
| `workers/jobs.py` | Rescrape job implementation |
| `infra/redis.py` | Redis connection, queue factory |
| `services/service_pool.py` | Singleton service pool |
| `api/routers/webhook.py` | Webhook endpoints, job enqueueing |
| `api/routers/indexing.py` | Indexing endpoints |
| `api/deps.py` | Dependency injection, cleanup |
| `main.py` | FastAPI app, lifespan management |
| `config.py` | Settings, configuration validation |
| `api/routers/health.py` | Health check endpoint |

---

## Important Implementation Details

### Signal Handling in Background Thread
The embedded worker disables signal handlers because they only work in the main thread:
```python
self._worker._install_signal_handlers = lambda: None
```

### Transaction Management in Rescrape
Rescrape job uses separate transactions:
1. Mark as in_progress (separate transaction)
2. Execute Firecrawl + indexing (no DB changes)
3. Update final status (separate transaction)

This prevents database locks while executing long-running external APIs.

### Job Enqueueing Returns 202
All async endpoints return HTTP 202 (Accepted), indicating the request was accepted for processing but not yet complete.

### Error Propagation
- **Indexing jobs:** Errors returned as `{success: false, error: ...}` (job completes)
- **Rescrape jobs:** Errors raised and caught, DB updated, then re-raised (job fails)

---

**Document Generated:** 2025-11-13
**Codebase:** /compose/pulse/apps/webhook
