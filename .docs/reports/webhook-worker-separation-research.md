# Webhook Worker Separation Research Report

**Date:** 2025-11-11
**Investigator:** Claude Code
**Status:** Complete

## Executive Summary

This report analyzes the current webhook worker architecture and provides recommendations for properly separating the background worker from the API server. The current embedded thread-based worker has signal handling limitations that cause stale worker registrations in Redis after restarts.

**Recommendation:** Option C (Separate Docker Container) provides the best balance of simplicity, scalability, and production robustness while requiring minimal code changes.

---

## 1. Current Architecture Analysis

### 1.1 Current State

The webhook service (`apps/webhook`) currently runs **both** the FastAPI API server and an RQ background worker in a single container:

```
┌─────────────────────────────────────┐
│   pulse_webhook container           │
│                                      │
│  ┌────────────────────────────┐    │
│  │  Main Thread (FastAPI)     │    │
│  │  - uvicorn main:app        │    │
│  │  - HTTP endpoints          │    │
│  │  - Lifespan management     │    │
│  └────────────────────────────┘    │
│                                      │
│  ┌────────────────────────────┐    │
│  │  Background Thread (RQ)    │    │
│  │  - WorkerThreadManager     │    │
│  │  - RQ Worker instance      │    │
│  │  - Listens: "indexing" Q   │    │
│  └────────────────────────────┘    │
│                                      │
└─────────────────────────────────────┘
         │                  │
         │                  ▼
         │         ┌──────────────┐
         │         │  Redis       │
         │         │  - RQ Queue  │
         │         │  - Job data  │
         │         └──────────────┘
         │
         ▼
    ┌─────────────────────┐
    │  External Services  │
    │  - Qdrant (vectors) │
    │  - TEI (embeddings) │
    │  - PostgreSQL (DB)  │
    └─────────────────────┘
```

### 1.2 Key Components

**Entry Point:** `/compose/pulse/apps/webhook/main.py`
- FastAPI application with lifespan manager
- Conditionally starts `WorkerThreadManager` if `settings.enable_worker=True`
- Worker runs in background thread via `threading.Thread`

**Worker Manager:** `/compose/pulse/apps/webhook/worker_thread.py`
- `WorkerThreadManager` class manages RQ worker lifecycle
- Creates `Worker(queues=["indexing"], name="search-bridge-worker")`
- **Problem:** Disables signal handlers via monkeypatch because signals don't work in threads
  ```python
  self._worker._install_signal_handlers = lambda: None
  ```

**Job Functions:**
1. **Index Document** (`workers/jobs.py` - DEPRECATED, uses `worker.py`)
   - Actually defined in `worker.py:index_document_job()`
   - Called as: `queue.enqueue("app.worker.index_document_job", ...)`
2. **Rescrape Changed URL** (`workers/jobs.py:rescrape_changed_url()`)
   - Called as: `queue.enqueue("app.jobs.rescrape.rescrape_changed_url", ...)`

### 1.3 Job Enqueueing Flow

**API Server (main.py) → Queue Job**
```python
# api/routers/indexing.py:62
job = queue.enqueue(
    "app.worker.index_document_job",  # References worker.py
    document.model_dump(),
    job_timeout="10m",
)

# api/routers/webhook.py:264
job = rescrape_queue.enqueue(
    "app.jobs.rescrape.rescrape_changed_url",  # References workers/jobs.py
    change_event_id,
    job_timeout="15m",
)
```

**Worker → Process Job**
```python
# Worker discovers job functions via import path
# "app.worker.index_document_job" → worker.py:index_document_job()
# "app.jobs.rescrape.rescrape_changed_url" → workers/jobs.py:rescrape_changed_url()
```

### 1.4 Shared Dependencies

**Core Services** (used by both API and worker):
- `services/indexing.py` - IndexingService (orchestrates chunking, embedding, vector store, BM25)
- `services/embedding.py` - EmbeddingService (TEI HTTP client)
- `services/vector_store.py` - VectorStore (Qdrant client)
- `services/bm25_engine.py` - BM25Engine (file-based index)
- `services/search.py` - SearchOrchestrator (hybrid search)
- `services/auto_watch.py` - AutoWatchService (changedetection.io integration)
- `services/webhook_handlers.py` - handle_firecrawl_event()

**Infrastructure:**
- `infra/redis.py` - Redis connection factory
- `infra/database.py` - PostgreSQL async connection
- `infra/rate_limit.py` - SlowAPI rate limiter (API only)

**Utilities:**
- `utils/text_processing.py` - TextChunker, tokenization
- `utils/url.py` - URL normalization
- `utils/timing.py` - TimingContext (async metrics)
- `utils/logging.py` - Structured logging

**Domain Models:**
- `domain/models.py` - SQLAlchemy ORM models (ChangeEvent, TimingRecord)
- `api/schemas/*.py` - Pydantic request/response schemas

**Clients:**
- `clients/changedetection.py` - changedetection.io API client

### 1.5 Configuration

**Single `.env` file** with `WEBHOOK_*` prefixed variables:
- `WEBHOOK_ENABLE_WORKER` - Toggle worker thread on/off
- `WEBHOOK_REDIS_URL` - Shared Redis for queue
- `WEBHOOK_QDRANT_URL` - Vector database
- `WEBHOOK_TEI_URL` - Text embeddings service
- `WEBHOOK_DATABASE_URL` - PostgreSQL
- `WEBHOOK_API_SECRET` - API authentication
- `WEBHOOK_SECRET` - Webhook signature verification

### 1.6 Current Issues

**Critical Issues:**
1. **Stale Worker Registration**
   - Container restart doesn't clean up Redis worker key
   - Error: `ValueError: There exists an active worker named 'search-bridge-worker' already`
   - Manual fix: `redis-cli DEL "rq:worker:search-bridge-worker"`

2. **No Graceful Shutdown**
   - Signal handlers disabled (can't work in thread)
   - SIGTERM to container doesn't properly stop worker
   - Jobs may be left in inconsistent state

3. **No Worker Scaling**
   - Cannot run multiple workers (single thread)
   - High job volume creates bottleneck

**Minor Issues:**
1. Shared container resources (CPU/memory contention)
2. API restart forces worker restart (unnecessary coupling)
3. Worker crash affects API health checks

---

## 2. Separation Options Analysis

### Option A: Multiprocessing (Same Container, Separate Process)

**Description:** Replace `threading.Thread` with `multiprocessing.Process` within same container.

#### Architecture
```
┌─────────────────────────────────────┐
│   pulse_webhook container           │
│                                      │
│  ┌────────────────────────────────┐ │
│  │  Main Process (FastAPI)        │ │
│  │  PID 1                          │ │
│  └────────────────────────────────┘ │
│                                      │
│  ┌────────────────────────────────┐ │
│  │  Child Process (RQ Worker)     │ │
│  │  PID 2                          │ │
│  │  - Separate Python interpreter │ │
│  │  - Signal handlers work!       │ │
│  └────────────────────────────────┘ │
└─────────────────────────────────────┘
```

#### Implementation
```python
# worker_thread.py → worker_process.py
import multiprocessing

class WorkerProcessManager:
    def __init__(self) -> None:
        self._process: multiprocessing.Process | None = None
        self._stop_event = multiprocessing.Event()

    def start(self) -> None:
        self._process = multiprocessing.Process(
            target=self._run_worker,
            name="rq-worker",
            daemon=False,  # Allow graceful shutdown
        )
        self._process.start()
        logger.info("Worker process started", pid=self._process.pid)

    def stop(self) -> None:
        self._stop_event.set()
        if self._process and self._process.is_alive():
            self._process.join(timeout=10.0)
            if self._process.is_alive():
                self._process.terminate()
                self._process.join(timeout=5.0)
                if self._process.is_alive():
                    self._process.kill()

    def _run_worker(self) -> None:
        # Signals work here - we're in main thread of this process!
        redis_conn = get_redis_connection()
        worker = Worker(
            queues=["indexing"],
            connection=redis_conn,
            name="search-bridge-worker",
        )
        worker.work(with_scheduler=False)
```

#### Pros
- ✅ Signal handlers work (main thread of child process)
- ✅ Minimal code changes (replace Thread with Process)
- ✅ Same Dockerfile and docker-compose
- ✅ Proper worker registration cleanup
- ✅ Worker gets own Python interpreter (better isolation)

#### Cons
- ❌ Still cannot scale workers independently
- ❌ API restart still forces worker restart
- ❌ Process management complexity (zombie processes)
- ❌ Cannot use different resource limits for API vs worker
- ❌ Startup health checks must wait for both processes
- ⚠️ Container must handle multiple processes (use supervisord or custom init)

#### Effort
- Code: **Low** (1-2 hours)
  - Rename `worker_thread.py` → `worker_process.py`
  - Replace `threading` with `multiprocessing`
  - Update imports in `main.py`
- Docker: **None**
- Testing: **Medium** (ensure graceful shutdown works)

---

### Option B: Process Manager (Supervisord)

**Description:** Use supervisord to manage both FastAPI and RQ worker as separate processes in same container.

#### Architecture
```
┌──────────────────────────────────────┐
│   pulse_webhook container            │
│                                       │
│  ┌─────────────────────────────────┐ │
│  │  Supervisord (PID 1)            │ │
│  │                                  │ │
│  │  ┌───────────────────────────┐  │ │
│  │  │ uvicorn (FastAPI)         │  │ │
│  │  └───────────────────────────┘  │ │
│  │                                  │ │
│  │  ┌───────────────────────────┐  │ │
│  │  │ rq worker                 │  │ │
│  │  └───────────────────────────┘  │ │
│  └─────────────────────────────────┘ │
└──────────────────────────────────────┘
```

#### Implementation
```ini
# supervisord.conf
[supervisord]
nodaemon=true
user=bridge

[program:api]
command=uvicorn main:app --host 0.0.0.0 --port 52100
directory=/app
autorestart=true
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0

[program:worker]
command=python -m rq.cli worker --url redis://pulse_redis:6379 indexing
directory=/app
autorestart=true
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0
```

```dockerfile
# Dockerfile
FROM python:3.13-slim

# Install supervisord
RUN apt-get update && apt-get install -y supervisor && rm -rf /var/lib/apt/lists/*

# ... rest of Dockerfile

COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
```

#### Pros
- ✅ Proper signal handling (RQ in main thread)
- ✅ Industry-standard process management
- ✅ Automatic restart on crash
- ✅ Both processes in same container (single deployment unit)
- ✅ Can disable worker by commenting supervisord config

#### Cons
- ❌ Still cannot scale workers independently
- ❌ Additional dependency (supervisord)
- ❌ More complex Dockerfile
- ❌ Harder to debug (logs multiplexed)
- ❌ API restart still affects worker
- ❌ Cannot set different resource limits

#### Effort
- Code: **Low** (1-2 hours)
  - Remove `worker_thread.py` entirely
  - Remove worker startup from `main.py`
  - Set `WEBHOOK_ENABLE_WORKER=false` in .env
- Docker: **Medium** (3-4 hours)
  - Add supervisord to Dockerfile
  - Create supervisord.conf
  - Update CMD
  - Test process management
- Testing: **High** (ensure both processes start/stop correctly)

---

### Option C: Separate Docker Container (Same Codebase) ⭐ RECOMMENDED

**Description:** Deploy worker as separate container using same image, different command.

#### Architecture
```
┌─────────────────────────┐      ┌─────────────────────────┐
│  pulse_webhook (API)    │      │  pulse_webhook_worker   │
│                         │      │                         │
│  uvicorn main:app       │      │  python -m rq.cli       │
│  Port: 52100            │      │    worker indexing      │
│                         │      │                         │
└─────────────────────────┘      └─────────────────────────┘
         │                                  │
         └─────────┬────────────────────────┘
                   │
                   ▼
         ┌──────────────────┐
         │  Redis Queue     │
         │  pulse_redis     │
         └──────────────────┘
```

#### Implementation

**No Code Changes Required!** Just docker-compose.yaml:

```yaml
# docker-compose.yaml
services:
  # API Server (existing)
  pulse_webhook:
    <<: *common-service
    build:
      context: ./apps/webhook
      dockerfile: Dockerfile
    container_name: pulse_webhook
    ports:
      - "${WEBHOOK_PORT:-50108}:52100"
    environment:
      WEBHOOK_ENABLE_WORKER: "false"  # Disable embedded worker
    volumes:
      - ${APPDATA_BASE:-/mnt/cache/appdata}/pulse_webhook:/app/data/bm25
    depends_on:
      - pulse_postgres
      - pulse_redis
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:52100/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  # Worker (new)
  pulse_webhook_worker:
    <<: *common-service
    image: pulse_webhook:latest  # Use same image as API
    container_name: pulse_webhook_worker
    command: ["python", "-m", "rq.cli", "worker", "--url", "redis://pulse_redis:6379", "indexing", "--name", "search-bridge-worker"]
    volumes:
      - ${APPDATA_BASE:-/mnt/cache/appdata}/pulse_webhook:/app/data/bm25  # Shared BM25 data
    depends_on:
      - pulse_postgres
      - pulse_redis
    restart: unless-stopped
    # No healthcheck - RQ doesn't expose health endpoint
```

**Scaling Workers:**
```bash
# Run 3 workers (auto-rename to avoid conflicts)
docker compose up -d --scale pulse_webhook_worker=3

# Docker will create:
# - pulse_webhook_worker-1
# - pulse_webhook_worker-2
# - pulse_webhook_worker-3
```

**Using Existing Standalone Worker:**
```yaml
# Alternative: use existing worker.py instead of rq.cli
services:
  pulse_webhook_worker:
    # ... same config
    command: ["python", "-m", "worker"]  # Uses worker.py:run_worker()
```

#### Pros
- ✅ **Zero code changes** (just docker-compose and .env)
- ✅ Proper signal handling (RQ in main thread)
- ✅ Independent scaling (`--scale pulse_webhook_worker=N`)
- ✅ API restart doesn't affect worker
- ✅ Worker crash doesn't affect API
- ✅ Separate resource limits (CPU/memory)
- ✅ Separate logging streams
- ✅ Industry standard pattern (exactly how RQ documentation recommends)
- ✅ Can update API without worker downtime
- ✅ Easy to disable worker (docker-compose down pulse_webhook_worker)
- ✅ Shared BM25 volume (both containers access same data)

#### Cons
- ⚠️ Slightly more complex deployment (2 containers instead of 1)
- ⚠️ BM25 engine must handle concurrent file access (already does via file locking)
- ⚠️ Two containers to monitor instead of one

#### Effort
- Code: **NONE** (already exists in `worker.py`)
- Docker: **Low** (30 minutes)
  - Add `pulse_webhook_worker` service to docker-compose.yaml
  - Set `WEBHOOK_ENABLE_WORKER=false` for API
  - Deploy: `docker compose up -d`
- Testing: **Low** (verify jobs process correctly)

---

### Option D: Separate App Directory (Monorepo Pattern)

**Description:** Create `apps/webhook-worker` as separate Python app with shared dependencies.

#### Architecture
```
apps/
├── webhook/                    # API only
│   ├── main.py                # FastAPI app
│   ├── api/                   # Endpoints
│   ├── Dockerfile
│   └── pyproject.toml
│
├── webhook-worker/            # Worker only
│   ├── worker.py              # RQ worker
│   ├── Dockerfile
│   └── pyproject.toml
│
└── webhook-shared/            # Shared code
    ├── services/              # IndexingService, etc.
    ├── domain/                # Models
    ├── utils/                 # Utilities
    └── pyproject.toml
```

#### Implementation

**1. Create shared package:**
```bash
mkdir -p apps/webhook-shared/{services,domain,utils,clients}
# Move shared code to webhook-shared/
```

**2. Update dependencies:**
```toml
# apps/webhook/pyproject.toml
dependencies = [
    "fastapi>=0.110.0",
    "webhook-shared @ file:///${PROJECT_ROOT}/apps/webhook-shared",
]

# apps/webhook-worker/pyproject.toml
dependencies = [
    "rq>=1.16.0",
    "webhook-shared @ file:///${PROJECT_ROOT}/apps/webhook-shared",
]
```

**3. Deploy separately:**
```yaml
services:
  pulse_webhook:
    build: ./apps/webhook
    # ... API config

  pulse_webhook_worker:
    build: ./apps/webhook-worker
    # ... worker config
```

#### Pros
- ✅ Clean separation of concerns
- ✅ Explicit shared dependencies
- ✅ Can version shared package
- ✅ API and worker can have different dependencies
- ✅ Clear ownership boundaries
- ✅ Independent deployment pipelines

#### Cons
- ❌ **High code reorganization effort**
- ❌ Complex dependency management (local file:// references)
- ❌ Risk of breaking existing imports
- ❌ Must update all import paths
- ❌ More testing required
- ❌ Separate Dockerfiles to maintain
- ❌ Overkill for current scope

#### Effort
- Code: **HIGH** (8-12 hours)
  - Create `apps/webhook-shared`
  - Move shared code
  - Update all import paths
  - Update pyproject.toml in all apps
  - Fix circular dependencies
- Docker: **HIGH** (4-6 hours)
  - Create new Dockerfile for worker
  - Multi-stage builds for shared package
  - Test build context
- Testing: **VERY HIGH** (must regression test everything)

---

## 3. Comparison Matrix

| Criteria | Option A: Multiprocessing | Option B: Supervisord | Option C: Separate Container ⭐ | Option D: Separate App |
|----------|---------------------------|----------------------|-------------------------------|------------------------|
| **Signal Handling** | ✅ Works | ✅ Works | ✅ Works | ✅ Works |
| **Worker Scaling** | ❌ No | ❌ No | ✅ Yes (--scale) | ✅ Yes |
| **Independent Restart** | ❌ No | ❌ No | ✅ Yes | ✅ Yes |
| **Code Changes** | Low | Low | **NONE** | Very High |
| **Docker Changes** | None | Medium | **Low** | High |
| **Testing Effort** | Medium | High | **Low** | Very High |
| **Deployment Complexity** | Low | Medium | **Low** | High |
| **Resource Isolation** | Partial | Partial | ✅ Full | ✅ Full |
| **Industry Standard** | Rare | Common | **Very Common** | Common |
| **Risk Level** | Low | Medium | **Very Low** | High |
| **Time to Implement** | 2-3 hours | 4-6 hours | **30 min** | 12-20 hours |
| **Production Ready** | ⚠️ Acceptable | ✅ Good | **✅ Excellent** | ✅ Excellent |

**Winner: Option C (Separate Docker Container)**

---

## 4. Recommended Approach: Option C

### 4.1 Implementation Plan

#### Phase 1: Docker Configuration (15 minutes)

**Step 1:** Add worker service to `docker-compose.yaml`:
```yaml
services:
  # API service - disable embedded worker
  pulse_webhook:
    <<: *common-service
    build:
      context: ./apps/webhook
      dockerfile: Dockerfile
    container_name: pulse_webhook
    ports:
      - "${WEBHOOK_PORT:-50108}:52100"
    environment:
      WEBHOOK_ENABLE_WORKER: "false"  # NEW: Disable embedded worker
    volumes:
      - ${APPDATA_BASE:-/mnt/cache/appdata}/pulse_webhook:/app/data/bm25
    depends_on:
      - pulse_postgres
      - pulse_redis
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:52100/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  # NEW: Dedicated worker service
  pulse_webhook_worker:
    <<: *common-service
    image: pulse_webhook:latest  # Reuse API image
    container_name: pulse_webhook_worker
    command:
      - "python"
      - "-m"
      - "rq.cli"
      - "worker"
      - "--url"
      - "redis://pulse_redis:6379"
      - "--name"
      - "search-bridge-worker"
      - "indexing"
    volumes:
      - ${APPDATA_BASE:-/mnt/cache/appdata}/pulse_webhook:/app/data/bm25  # Shared BM25 data
    depends_on:
      - pulse_postgres
      - pulse_redis
    restart: unless-stopped
    # No ports - worker doesn't expose HTTP
```

**Step 2:** Update `.env` to disable embedded worker:
```bash
# apps/webhook/.env
WEBHOOK_ENABLE_WORKER=false  # API no longer runs worker
```

#### Phase 2: Deployment (10 minutes)

```bash
# 1. Rebuild API image (if needed)
docker compose build pulse_webhook

# 2. Stop existing service
docker compose down pulse_webhook

# 3. Clean stale Redis worker key
docker compose exec pulse_redis redis-cli DEL "rq:worker:search-bridge-worker"

# 4. Start both services
docker compose up -d pulse_webhook pulse_webhook_worker

# 5. Verify API started
docker compose logs pulse_webhook --tail 20
# Should see: "Background worker disabled (WEBHOOK_ENABLE_WORKER=false)"

# 6. Verify worker started
docker compose logs pulse_webhook_worker --tail 20
# Should see: "Worker search-bridge-worker: started"
# Should see: "*** Listening on indexing..."
```

#### Phase 3: Verification (5 minutes)

**Test 1: Health Check**
```bash
curl http://localhost:52100/health
# Should return: {"status": "healthy", "services": {...}}
```

**Test 2: Job Processing**
```bash
# Submit test indexing job
curl -X POST http://localhost:52100/api/index \
  -H "Authorization: Bearer ${WEBHOOK_API_SECRET}" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "markdown": "# Test Document\nThis is a test.",
    "title": "Test",
    "description": "Test document"
  }'

# Watch worker logs
docker compose logs pulse_webhook_worker -f
# Should see job processing logs
```

**Test 3: Worker Restart (Verify No Stale Registration)**
```bash
# Restart worker
docker compose restart pulse_webhook_worker

# Check logs - should NOT see "worker already exists" error
docker compose logs pulse_webhook_worker --tail 20
```

**Test 4: API Restart (Verify Worker Unaffected)**
```bash
# Restart API
docker compose restart pulse_webhook

# Worker should keep running
docker compose ps pulse_webhook_worker
# Status should be "Up"
```

### 4.2 Scaling Workers

**Run Multiple Workers:**
```bash
# Start 3 workers (each gets unique name)
docker compose up -d --scale pulse_webhook_worker=3

# Verify all running
docker compose ps | grep worker
# pulse_webhook_worker-1
# pulse_webhook_worker-2
# pulse_webhook_worker-3

# Each worker auto-registers with unique name in Redis
docker compose exec pulse_redis redis-cli KEYS "rq:worker:*"
```

**Scale Down:**
```bash
docker compose up -d --scale pulse_webhook_worker=1
```

### 4.3 Monitoring

**Check Worker Status:**
```bash
# View worker logs
docker compose logs pulse_webhook_worker -f

# Check RQ worker registration
docker compose exec pulse_redis redis-cli KEYS "rq:worker:*"

# Check queue depth
docker compose exec pulse_redis redis-cli LLEN "rq:queue:indexing"

# Check failed jobs
docker compose exec pulse_redis redis-cli LLEN "rq:queue:failed"
```

**Check API Status:**
```bash
# Health endpoint
curl http://localhost:52100/health

# Metrics endpoint
curl http://localhost:52100/api/metrics
```

### 4.4 Rollback Plan

If issues arise, revert to embedded worker:

```bash
# 1. Stop separate worker
docker compose stop pulse_webhook_worker

# 2. Enable embedded worker
# Edit .env: WEBHOOK_ENABLE_WORKER=true

# 3. Restart API
docker compose restart pulse_webhook

# 4. Verify embedded worker starts
docker compose logs pulse_webhook | grep "Worker initialized"
```

---

## 5. Shared Code Dependencies

### 5.1 Files Used by Both API and Worker

**Must be in same codebase:**

```
apps/webhook/
├── services/                  # ✅ Shared
│   ├── indexing.py           # IndexingService - orchestrates indexing
│   ├── embedding.py          # EmbeddingService - TEI client
│   ├── vector_store.py       # VectorStore - Qdrant client
│   ├── bm25_engine.py        # BM25Engine - file-based search
│   └── webhook_handlers.py   # handle_firecrawl_event()
│
├── workers/                   # ✅ Shared (job definitions)
│   └── jobs.py               # rescrape_changed_url()
│
├── worker.py                  # ✅ Shared (job entry point)
│
├── utils/                     # ✅ Shared
│   ├── text_processing.py   # TextChunker, tokenization
│   ├── url.py               # URL normalization
│   ├── timing.py            # TimingContext
│   └── logging.py           # Structured logging
│
├── domain/                    # ✅ Shared
│   └── models.py            # ChangeEvent, TimingRecord (ORM)
│
├── api/schemas/               # ✅ Shared
│   ├── indexing.py          # IndexDocumentRequest (Pydantic)
│   └── webhook.py           # FirecrawlWebhookEvent
│
├── clients/                   # ✅ Shared
│   └── changedetection.py   # ChangeDetectionClient
│
├── infra/                     # ✅ Shared
│   ├── redis.py             # get_redis_connection()
│   └── database.py          # PostgreSQL connection
│
├── config.py                  # ✅ Shared (Settings)
│
└── pyproject.toml            # ✅ Shared (dependencies)
```

**API-Only Files:**
```
apps/webhook/
├── main.py                    # FastAPI app
├── api/
│   ├── deps.py               # Dependency injection
│   ├── routers/
│   │   ├── indexing.py       # /api/index
│   │   ├── webhook.py        # /api/webhook/*
│   │   ├── search.py         # /api/search
│   │   ├── health.py         # /health
│   │   └── metrics.py        # /api/metrics
│   └── middleware/
│       └── timing.py         # TimingMiddleware
│
└── infra/
    └── rate_limit.py         # SlowAPI (API only)
```

**Worker-Only Files:**
```
apps/webhook/
└── worker_thread.py          # ⚠️ Can be deleted after Option C
```

### 5.2 Critical: BM25 File Access

Both API and worker access the same BM25 file-based index:
```
${APPDATA_BASE}/pulse_webhook/
└── bm25/
    ├── index.pkl           # BM25 index
    └── metadata.pkl        # Document metadata
```

**Concurrent Access Handling:**
- `BM25Engine` uses file locking (`fcntl.flock()`) to prevent corruption
- Read operations: shared lock
- Write operations: exclusive lock
- Both containers mount same volume (already configured)

**Verification:**
```python
# services/bm25_engine.py - already handles locking
def _load_index(self) -> None:
    with open(self.index_path, "rb") as f:
        fcntl.flock(f, fcntl.LOCK_SH)  # Shared lock for read
        self.index = pickle.load(f)
        fcntl.flock(f, fcntl.LOCK_UN)

def _save_index(self) -> None:
    with open(self.index_path, "wb") as f:
        fcntl.flock(f, fcntl.LOCK_EX)  # Exclusive lock for write
        pickle.dump(self.index, f)
        fcntl.flock(f, fcntl.LOCK_UN)
```

---

## 6. Migration Risks & Mitigations

### Risk 1: Job Import Paths Break

**Risk:** Worker can't find job functions after separation.

**Current Paths:**
```python
# Enqueued as:
"app.worker.index_document_job"           # worker.py:index_document_job()
"app.jobs.rescrape.rescrape_changed_url"  # workers/jobs.py:rescrape_changed_url()
```

**Mitigation:**
- ✅ No code changes needed - paths remain valid
- ✅ Both containers have same PYTHONPATH
- ✅ Test: Enqueue job, verify worker finds function

**Verification:**
```bash
# Test job import in worker container
docker compose exec pulse_webhook_worker python -c "
from worker import index_document_job
from workers.jobs import rescrape_changed_url
print('✅ Job functions imported successfully')
"
```

### Risk 2: BM25 File Corruption

**Risk:** Concurrent writes corrupt BM25 index.

**Mitigation:**
- ✅ File locking already implemented (`fcntl.flock()`)
- ✅ Both containers mount same volume
- ⚠️ NFS volumes may not support flock (use local volumes)

**Testing:**
```bash
# Stress test concurrent writes
for i in {1..10}; do
  curl -X POST http://localhost:52100/api/index \
    -H "Authorization: Bearer $WEBHOOK_API_SECRET" \
    -H "Content-Type: application/json" \
    -d "{\"url\": \"https://example.com/$i\", \"markdown\": \"test $i\", \"title\": \"Test $i\"}" &
done
wait

# Verify BM25 index integrity
docker compose exec pulse_webhook python -c "
from services.bm25_engine import BM25Engine
engine = BM25Engine()
print(f'✅ Index has {engine.get_document_count()} documents')
"
```

### Risk 3: Stale Worker Registration Persists

**Risk:** Old worker key prevents new worker from starting.

**Mitigation:**
- ✅ Clean Redis key before first deployment
- ✅ Use unique worker names if scaling (`--name` flag autoincrements)
- ✅ Implement cleanup script

**Cleanup Script:**
```bash
#!/bin/bash
# scripts/cleanup-stale-workers.sh

echo "Cleaning stale RQ workers from Redis..."
docker compose exec pulse_redis redis-cli --scan --pattern "rq:worker:*" | \
  xargs -r docker compose exec pulse_redis redis-cli DEL

echo "✅ Stale workers cleaned"
```

### Risk 4: Worker Can't Connect to External Services

**Risk:** Worker container can't reach Qdrant/TEI on GPU machine.

**Mitigation:**
- ✅ Both containers use same network (`firecrawl`)
- ✅ Both containers use same `.env` (shared config)
- ✅ Test connectivity before deploying

**Pre-Deployment Test:**
```bash
# Test from worker container (using API image as proxy)
docker compose run --rm pulse_webhook python -c "
import httpx
from config import settings

# Test Qdrant
resp = httpx.get(f'{settings.qdrant_url}/collections')
print(f'Qdrant: {resp.status_code}')

# Test TEI
resp = httpx.get(f'{settings.tei_url}/health')
print(f'TEI: {resp.status_code}')
"
```

### Risk 5: Worker Crashes Leave Jobs Stuck

**Risk:** Worker crash leaves jobs in "started" state.

**Mitigation:**
- ✅ RQ automatically re-queues jobs after worker timeout
- ✅ Set `job_timeout` on enqueue (already done: `"10m"`)
- ✅ Configure worker timeout: `--worker-ttl 600`

**Enhanced Worker Command:**
```yaml
services:
  pulse_webhook_worker:
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
      - "600"  # Worker heartbeat timeout (10 min)
      - "--job-timeout"
      - "600"  # Default job timeout (10 min)
      - "indexing"
```

---

## 7. Alternative: Use Existing `worker.py`

Instead of `rq.cli`, can use the existing standalone worker:

```yaml
services:
  pulse_webhook_worker:
    image: pulse_webhook:latest
    container_name: pulse_webhook_worker
    command: ["python", "-m", "worker"]  # Uses worker.py:run_worker()
    # ... rest of config
```

**Pros:**
- ✅ Uses existing code (`worker.py`)
- ✅ Pre-flight service validation (checks Qdrant/TEI before starting)
- ✅ Familiar logging format

**Cons:**
- ❌ Less flexible than `rq.cli` (can't add CLI flags)
- ❌ `worker.py` marked as DEPRECATED in comments

**Recommendation:** Use `rq.cli` for flexibility. Keep `worker.py` for manual testing.

---

## 8. Post-Migration Cleanup

After successful deployment, these files can be deleted:

```bash
# Optional: Remove embedded worker code (no longer used)
rm apps/webhook/worker_thread.py

# Update imports in main.py
# Remove: from worker_thread import WorkerThreadManager
# Remove: worker_manager startup code in lifespan()

# Run tests to ensure nothing broke
cd apps/webhook
make test
```

---

## 9. Future Enhancements

### 9.1 Multiple Queue Support

**Add separate queues for different job types:**

```yaml
services:
  # Fast jobs (indexing)
  pulse_webhook_worker_fast:
    command: ["python", "-m", "rq.cli", "worker", "--url", "redis://pulse_redis:6379", "indexing"]

  # Slow jobs (rescraping)
  pulse_webhook_worker_slow:
    command: ["python", "-m", "rq.cli", "worker", "--url", "redis://pulse_redis:6379", "rescraping"]
```

### 9.2 Worker Resource Limits

**Set CPU/memory limits:**

```yaml
services:
  pulse_webhook_worker:
    # ... config
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 2G
        reservations:
          cpus: '0.5'
          memory: 512M
```

### 9.3 Worker Health Checks

**Add custom health check script:**

```yaml
services:
  pulse_webhook_worker:
    # ... config
    healthcheck:
      test: ["CMD", "python", "-c", "import redis; r=redis.from_url('redis://pulse_redis:6379'); assert r.ping()"]
      interval: 30s
      timeout: 10s
      retries: 3
```

### 9.4 Graceful Shutdown

**Increase stop timeout to allow job completion:**

```yaml
services:
  pulse_webhook_worker:
    # ... config
    stop_grace_period: 5m  # Wait up to 5 min for job completion
```

---

## 10. Appendix: Quick Reference

### 10.1 Commands

```bash
# Deploy
docker compose up -d pulse_webhook pulse_webhook_worker

# Scale workers
docker compose up -d --scale pulse_webhook_worker=3

# View logs
docker compose logs pulse_webhook_worker -f

# Restart worker only
docker compose restart pulse_webhook_worker

# Stop worker only
docker compose stop pulse_webhook_worker

# Check queue depth
docker compose exec pulse_redis redis-cli LLEN "rq:queue:indexing"

# Check worker registration
docker compose exec pulse_redis redis-cli KEYS "rq:worker:*"

# Clean stale workers
docker compose exec pulse_redis redis-cli --scan --pattern "rq:worker:*" | \
  xargs -r docker compose exec pulse_redis redis-cli DEL
```

### 10.2 Files Changed

**Option C requires changes to:**

1. `docker-compose.yaml` - Add `pulse_webhook_worker` service
2. `.env` - Set `WEBHOOK_ENABLE_WORKER=false`

**That's it!** No code changes required.

---

## 11. Conclusion

**Recommended Solution:** Option C (Separate Docker Container)

**Key Benefits:**
- ✅ **Zero code changes** - just docker-compose configuration
- ✅ **Industry standard** - exactly how RQ documentation recommends deployment
- ✅ **Fixes all current issues** - proper signal handling, no stale registration
- ✅ **Production ready** - independent scaling, restarts, resource limits
- ✅ **Low risk** - can rollback to embedded worker instantly
- ✅ **Fast implementation** - 30 minutes to deploy

**Implementation Time:** 30 minutes
**Risk Level:** Very Low
**Maintenance Overhead:** None (standard Docker Compose patterns)

**Next Step:** Deploy Option C following the implementation plan in Section 4.
