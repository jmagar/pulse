# Webhook Worker - Background Job Processing

Complete guide to the webhook service's background worker system for asynchronous document indexing and URL rescraping.

## Overview

The webhook worker processes background jobs using **RQ (Redis Queue)**, a Python job queue framework built on Redis. Jobs are enqueued by API endpoints and processed asynchronously by worker processes.

**Queue Framework:** RQ v2.6.0+  
**Queue Name:** `"indexing"` (single queue for all job types)  
**Job Timeout:** 10 minutes  
**Worker Modes:** Embedded thread (dev) or standalone container (prod)

---

## Quick Start

### Check Worker Status

```bash
# View worker logs
docker logs pulse_webhook-worker --tail 50 --follow

# Check if jobs are being processed
redis-cli -h localhost -p 50104 LLEN rq:queue:indexing

# List all RQ workers
redis-cli -h localhost -p 50104 SMEMBERS rq:workers

# Check specific job status
redis-cli -h localhost -p 50104 HGETALL rq:job:{job_id}
```

### Enqueue Test Jobs

```bash
# Synchronous indexing (no queue, immediate response)
curl -X POST http://localhost:50108/api/test-index \
  -H "Authorization: Bearer YOUR_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/test",
    "markdown": "# Test Document\n\nThis is test content.",
    "title": "Test Page"
  }'
# Returns 200 with timing breakdown

# Asynchronous indexing (queued job)
curl -X POST http://localhost:50108/api/index \
  -H "Authorization: Bearer YOUR_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/test",
    "markdown": "# Test Document\n\nThis is test content.",
    "title": "Test Page"
  }'
# Returns 202 with job_id for tracking
```

### Monitor Queue in Real-Time

```bash
# Watch queue depth
watch -n 1 "redis-cli -h localhost -p 50104 LLEN rq:queue:indexing"

# Monitor failed jobs
redis-cli -h localhost -p 50104 LLEN rq:queue:failed

# View failed job details
redis-cli -h localhost -p 50104 LRANGE rq:queue:failed 0 -1
```

---

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                    FastAPI API Server                       │
│                   (pulse_webhook)                           │
│                                                             │
│  ┌────────────────────────────────────────────────────┐    │
│  │  Webhook Endpoints (Job Enqueuers)                 │    │
│  │  • POST /api/webhook/firecrawl → enqueue indexing  │    │
│  │  • POST /api/webhook/changedetection → rescraping  │    │
│  │  • POST /api/index → enqueue indexing (legacy)     │    │
│  └────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌────────────────────────────────────────────────────┐    │
│  │  Optional: Embedded Worker Thread                  │    │
│  │  Enabled by: WEBHOOK_ENABLE_WORKER=true            │    │
│  │  • Runs in background thread                       │    │
│  │  • Shares service pool with API                    │    │
│  │  • Processes same Redis queue                      │    │
│  └────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────────┐
                    │   Redis (Queue)     │
                    │   pulse_redis       │
                    │                     │
                    │  Queue: "indexing"  │
                    │  Key: rq:queue:*    │
                    └─────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│         Standalone Worker (Optional Production)             │
│              pulse_webhook-worker                           │
│                                                             │
│  ┌────────────────────────────────────────────────────┐    │
│  │  RQ Worker Process                                 │    │
│  │  Command: python -m rq.cli worker indexing         │    │
│  │  • Listens to "indexing" queue                     │    │
│  │  • Worker TTL: 600 seconds                         │    │
│  │  • Auto-reconnect on Redis failure                 │    │
│  │  • Service pool initialized on startup             │    │
│  └────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                 ┌────────────────────────┐
                 │  External Services     │
                 │  • Qdrant (vectors)    │
                 │  • TEI (embeddings)    │
                 │  • Firecrawl (scraper) │
                 │  • PostgreSQL (DB)     │
                 └────────────────────────┘
```

### Data Flow

**Indexing Job:**
1. Webhook endpoint receives scrape result
2. Job enqueued to Redis queue: `rq:queue:indexing`
3. Worker picks up job from queue
4. Document chunked → embedded → indexed (Qdrant + BM25)
5. Result stored or error logged

**Rescrape Job:**
1. changedetection.io detects URL change
2. ChangeEvent created in database
3. Rescrape job enqueued to Redis
4. Worker fetches URL via Firecrawl API
5. Result indexed → ChangeEvent updated

---

## Job Types

### 1. Document Indexing Job

**Function:** `worker.index_document_job`  
**Enqueued by:** 
- `POST /api/webhook/firecrawl`
- `POST /api/index` (deprecated)

**Process:**
```python
# Job definition in worker.py
def index_document_job(document_dict: dict[str, Any]) -> dict[str, Any]:
    """
    Index a document from Firecrawl webhook.
    
    Steps:
    1. Parse document dict into IndexDocumentRequest
    2. Get service pool (TextChunker, EmbeddingService, VectorStore, BM25)
    3. Ensure Qdrant collection exists
    4. Clean and chunk text (semantic-text-splitter)
    5. Generate embeddings in batch (TEI service)
    6. Index to Qdrant (vector) + BM25 (keyword) in parallel
    7. Return result with timing metrics
    """
```

**Timing Breakdown:**
- Text cleaning: ~10ms
- Chunking: ~50-200ms (depends on document size)
- Embedding: ~100-500ms (depends on TEI service, GPU vs CPU)
- Indexing: ~50-100ms (Qdrant + BM25)
- **Total:** 200ms - 1s per document

**Success Response:**
```json
{
  "status": "success",
  "document_url": "https://example.com",
  "chunks_indexed": 15,
  "collection": "default",
  "timing": {
    "total_ms": 450,
    "chunking_ms": 120,
    "embedding_ms": 280,
    "indexing_ms": 50
  }
}
```

**Error Response:**
```json
{
  "status": "error",
  "error": "Qdrant connection timeout",
  "document_url": "https://example.com"
}
```

---

### 2. URL Rescrape Job

**Function:** `workers.jobs.rescrape_changed_url`  
**Enqueued by:** `POST /api/webhook/changedetection`

**Process:**
```python
# Job definition in workers/jobs.py
async def rescrape_changed_url(event_id: int, watch_url: str) -> dict:
    """
    Re-scrape a URL that changed.
    
    Steps:
    1. Mark ChangeEvent as "in_progress" (immediate commit)
    2. Call Firecrawl API to scrape URL
    3. Index scraped content (same as indexing job)
    4. Mark ChangeEvent as "success" or "failed" (separate commit)
    5. Return result
    
    Note: Separate transactions prevent long locks during API calls.
    """
```

**Timing Breakdown:**
- Firecrawl scrape: 1-5 seconds (network + rendering)
- Indexing: 200ms - 1s (same as above)
- **Total:** 1-6 seconds per URL

**Database Updates:**
```sql
-- Step 1: Mark in-progress
UPDATE webhook.change_events 
SET rescrape_job_id = '{job_id}', rescrape_status = 'in_progress'
WHERE id = {event_id};

-- Step 2: Mark completed (after scraping + indexing)
UPDATE webhook.change_events
SET rescrape_status = 'success', indexed_at = NOW()
WHERE id = {event_id};
```

---

## Service Pool Pattern

### Why Service Pool?

**Problem:** Initializing services is slow:
- TextChunker: 1-5 seconds (loads tokenizer model)
- EmbeddingService: 100-500ms (HTTP client setup)
- VectorStore: 50-100ms (Qdrant client + collection check)
- BM25Engine: 10-50ms (load index from disk)

**Solution:** Singleton service pool that initializes once and reuses across all jobs.

**Performance Impact:**
- Without pool: 1-5 seconds initialization per job
- With pool: ~1ms to get existing instances
- **Speedup:** 1000x faster

### Implementation

**Service Pool Class:**
```python
# services/service_pool.py
class ServicePool:
    _instance: Optional["ServicePool"] = None
    _lock = threading.Lock()
    
    def __init__(self):
        self.chunker = TextChunker(...)
        self.embedding_service = EmbeddingService(...)
        self.vector_store = VectorStore(...)
        self.bm25_engine = BM25Engine(...)
    
    @classmethod
    def get_instance(cls) -> "ServicePool":
        """Thread-safe singleton with double-checked locking."""
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance
```

**Usage in Jobs:**
```python
# Fast - no initialization
service_pool = ServicePool.get_instance()

# Use services
chunks = service_pool.chunker.chunk_text(text)
embeddings = await service_pool.embedding_service.embed_batch(chunks)
await service_pool.vector_store.index_chunks(embeddings)
service_pool.bm25_engine.index_document(url, chunks)
```

### Lifecycle

1. **First job:** Pool created, all services initialized (~2-5 seconds)
2. **Subsequent jobs:** Pool reused (~1ms per access)
3. **Worker restart:** Pool destroyed, recreated on first job
4. **Memory:** Pool held in memory for worker lifetime (~50-100MB)

---

## Deployment Modes

### Mode 1: Embedded Worker (Development)

**Configuration:**
```yaml
# docker-compose.yaml
pulse_webhook:
  environment:
    WEBHOOK_ENABLE_WORKER: "true"
```

**Behavior:**
- Worker runs in background thread within FastAPI process
- Started automatically on app startup
- Shares service pool with API endpoints
- Same container, same Python process

**Pros:**
- Simple setup (one container)
- Shared memory (service pool)
- No network latency between API and worker

**Cons:**
- API can block on large jobs
- No horizontal scaling
- Memory spikes affect both API and worker

**When to use:**
- Development environments
- Small deployments (<10 jobs/min)
- Single-machine setups
- Low-traffic applications

---

### Mode 2: Standalone Worker (Production)

**Configuration:**
```yaml
# docker-compose.yaml
pulse_webhook:
  environment:
    WEBHOOK_ENABLE_WORKER: "false"  # API only

pulse_webhook-worker:
  build: apps/webhook
  command: ["python", "-m", "rq.cli", "worker", "indexing", "--worker-ttl", "600"]
  environment:
    WEBHOOK_ENABLE_WORKER: "false"
  depends_on:
    - pulse_redis
```

**Behavior:**
- Separate container running RQ worker
- Independent process, can restart without API downtime
- Own service pool instance
- Communicates via Redis queue only

**Pros:**
- API never blocks on jobs
- Horizontal scaling (run multiple workers)
- Isolated failures (worker crash doesn't affect API)
- Independent resource limits

**Cons:**
- More complex setup (two containers)
- Separate service pools (2x memory)
- Network overhead (minimal, Redis is fast)

**When to use:**
- Production environments
- High job volume (>10 jobs/min)
- Need horizontal scaling
- Critical API responsiveness

---

### Mode 3: Hybrid (Recommended)

**Configuration:**
```yaml
pulse_webhook:
  environment:
    WEBHOOK_ENABLE_WORKER: "true"   # Embedded for low latency

pulse_webhook-worker:
  replicas: 2  # Multiple workers for capacity
  environment:
    WEBHOOK_ENABLE_WORKER: "false"
```

**Behavior:**
- Embedded worker handles small, immediate jobs
- Standalone workers handle bulk processing
- All workers share same Redis queue (work-stealing)

**Pros:**
- Low latency for small jobs (embedded)
- High capacity for burst traffic (standalone)
- Graceful degradation (if external workers fail, embedded continues)

**When to use:**
- Production with mixed workload
- Unpredictable traffic patterns
- Best balance of latency and throughput

---

## Configuration

### Environment Variables

```bash
# Worker Mode
WEBHOOK_ENABLE_WORKER=false           # Enable embedded worker thread?

# Redis Queue
WEBHOOK_REDIS_URL=redis://localhost:6379

# External Services (for job processing)
WEBHOOK_QDRANT_URL=http://qdrant:6333
WEBHOOK_TEI_URL=http://tei:8080
WEBHOOK_FIRECRAWL_BASE_URL=http://firecrawl:3002
WEBHOOK_FIRECRAWL_API_KEY=self-hosted-auth

# Database (for ChangeEvent updates)
WEBHOOK_DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/db

# Job Processing
WEBHOOK_CHUNK_SIZE=800                # Tokens per chunk
WEBHOOK_CHUNK_OVERLAP=200             # Overlap tokens
WEBHOOK_VECTOR_WEIGHT=0.6             # Used after indexing for search
WEBHOOK_BM25_WEIGHT=0.4
```

### RQ Worker CLI Options

```bash
# From docker-compose.yaml
python -m rq.cli worker indexing \
  --worker-ttl 600                # Worker heartbeat timeout (10 min)
  
# Optional flags:
# --burst                         # Exit after queue empty (for testing)
# --logging_level INFO            # Log verbosity
# --name my-worker-01             # Custom worker name
```

### Service Pool Configuration

Service pool settings are read from environment variables during initialization:

```python
# services/service_pool.py
class ServicePool:
    def __init__(self):
        # Chunker
        self.chunker = TextChunker(
            chunk_size=settings.chunk_size,        # WEBHOOK_CHUNK_SIZE
            chunk_overlap=settings.chunk_overlap   # WEBHOOK_CHUNK_OVERLAP
        )
        
        # Embeddings
        self.embedding_service = EmbeddingService(
            base_url=settings.tei_url              # WEBHOOK_TEI_URL
        )
        
        # Vector Store
        self.vector_store = VectorStore(
            url=settings.qdrant_url                # WEBHOOK_QDRANT_URL
        )
        
        # BM25 (keyword search)
        self.bm25_engine = BM25Engine(
            data_dir=settings.bm25_data_dir        # WEBHOOK_BM25_DATA_DIR
        )
```

---

## Monitoring & Debugging

### Redis Queue Inspection

```bash
# Queue depth (how many jobs waiting?)
redis-cli -h localhost -p 50104 LLEN rq:queue:indexing

# Job IDs in queue
redis-cli -h localhost -p 50104 LRANGE rq:queue:indexing 0 -1

# Job details
redis-cli -h localhost -p 50104 HGETALL rq:job:{job_id}

# Worker heartbeat (is worker alive?)
redis-cli -h localhost -p 50104 SMEMBERS rq:workers

# Failed jobs
redis-cli -h localhost -p 50104 LLEN rq:queue:failed
redis-cli -h localhost -p 50104 LRANGE rq:queue:failed 0 -1
```

### Worker Logs

```bash
# View logs
docker logs pulse_webhook-worker --tail 100 --follow

# Filter for errors
docker logs pulse_webhook-worker 2>&1 | grep -i error

# Check job completion
docker logs pulse_webhook-worker | grep "indexed successfully"
```

### Database Metrics

```bash
# Check operation metrics (from workers)
curl "http://localhost:50108/api/metrics/operations?hours=24" \
  -H "Authorization: Bearer YOUR_SECRET" | jq .

# Filter by operation type
curl "http://localhost:50108/api/metrics/operations?operation_type=embedding" \
  -H "Authorization: Bearer YOUR_SECRET" | jq .

# Check for failures
curl "http://localhost:50108/api/metrics/operations?success=false" \
  -H "Authorization: Bearer YOUR_SECRET" | jq .
```

### Health Checks

```bash
# API health (includes Redis check)
curl http://localhost:50108/health | jq .

# Expected response:
{
  "status": "healthy",
  "redis": "connected",
  "qdrant": "connected",
  "tei": "connected",
  "database": "connected"
}
```

---

## Troubleshooting

### Worker Not Processing Jobs

**Symptoms:**
- Queue depth increasing
- Jobs stuck in "queued" status
- No worker logs

**Diagnose:**
```bash
# Is worker running?
docker ps | grep webhook-worker

# Worker logs show errors?
docker logs pulse_webhook-worker --tail 50

# Redis reachable?
redis-cli -h localhost -p 50104 PING

# Workers registered?
redis-cli -h localhost -p 50104 SMEMBERS rq:workers
```

**Solutions:**
- Restart worker: `docker restart pulse_webhook-worker`
- Check Redis connectivity
- Verify `WEBHOOK_REDIS_URL` in worker env
- Check for Python exceptions in logs

---

### Jobs Failing Silently

**Symptoms:**
- Job status shows "failed"
- No error in API logs
- Queue processes but no results

**Diagnose:**
```bash
# Get failed job details
redis-cli -h localhost -p 50104 LRANGE rq:queue:failed 0 -1

# Check specific job
redis-cli -h localhost -p 50104 HGETALL rq:job:{job_id}

# Worker exception logs
docker logs pulse_webhook-worker | grep -A 20 "Traceback"
```

**Solutions:**
- Check external service health (Qdrant, TEI, Firecrawl)
- Verify environment variables in worker container
- Check operation_metrics table for error details:
  ```sql
  SELECT * FROM webhook.operation_metrics 
  WHERE success = false 
  ORDER BY timestamp DESC LIMIT 10;
  ```

---

### Slow Job Processing

**Symptoms:**
- Jobs completing but taking >10 seconds
- Queue backlog growing
- CPU/memory usage high

**Diagnose:**
```bash
# Check timing metrics
curl "http://localhost:50108/api/metrics/operations?operation_type=embedding" \
  -H "Authorization: Bearer YOUR_SECRET" | jq '.metrics[] | .duration_ms'

# Check service pool initialization
docker logs pulse_webhook-worker | grep "Service pool"
```

**Solutions:**
- **TEI slow?** Use GPU-accelerated TEI (10x faster)
- **Large documents?** Reduce `WEBHOOK_CHUNK_SIZE`
- **Too many chunks?** Increase `WEBHOOK_CHUNK_SIZE`
- **Service pool not working?** Check logs for "initialized" vs "reused"
- **Scale horizontally:** Add more worker containers

---

### Memory Leaks

**Symptoms:**
- Worker memory growing over time
- OOM kills after hours/days
- Swap usage increasing

**Diagnose:**
```bash
# Container memory usage
docker stats pulse_webhook-worker

# Check for large service pool
docker exec pulse_webhook-worker python -c "
from services.service_pool import ServicePool
import sys
pool = ServicePool.get_instance()
print(f'Pool size: {sys.getsizeof(pool)} bytes')
"
```

**Solutions:**
- Restart worker periodically (cron job)
- Reduce `WEBHOOK_CHUNK_SIZE` (less in-memory data)
- Check for unclosed database sessions
- Monitor with `docker stats` and set memory limits:
  ```yaml
  pulse_webhook-worker:
    deploy:
      resources:
        limits:
          memory: 2G
  ```

---

## Testing

### Unit Tests

```bash
# Test job functions
cd apps/webhook
uv run pytest tests/unit/workers/

# Test service pool
uv run pytest tests/unit/services/test_service_pool.py
```

### Integration Tests

```bash
# Test job enqueueing and execution
uv run pytest tests/integration/test_worker_jobs.py

# Requires live Redis
WEBHOOK_REDIS_URL=redis://localhost:50104 uv run pytest tests/integration/
```

### Manual Testing

```bash
# 1. Enqueue test job
curl -X POST http://localhost:50108/api/index \
  -H "Authorization: Bearer YOUR_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com", "markdown": "# Test", "title": "Test"}'

# 2. Get job_id from response
JOB_ID="12345..."

# 3. Monitor job status
redis-cli -h localhost -p 50104 HGETALL rq:job:$JOB_ID

# 4. Check worker processed it
docker logs pulse_webhook-worker | grep $JOB_ID

# 5. Verify indexed
curl -X POST http://localhost:50108/api/search \
  -H "Authorization: Bearer YOUR_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"query": "test", "mode": "hybrid"}'
```

---

## Performance Optimization

### 1. Use GPU for TEI

**Impact:** 10x faster embeddings (CPU: 500ms → GPU: 50ms)

```yaml
tei:
  image: ghcr.io/huggingface/text-embeddings-inference:latest
  deploy:
    resources:
      reservations:
        devices:
          - driver: nvidia
            count: 1
            capabilities: [gpu]
```

### 2. Tune Chunk Size

**Small chunks** (400-600 tokens):
- Pros: More precise search, better relevance
- Cons: More chunks = more embeddings = slower

**Large chunks** (1000-1500 tokens):
- Pros: Fewer chunks = faster indexing
- Cons: Less precise search results

**Recommended:** Start with 800 tokens, adjust based on content type.

### 3. Batch Processing

Workers already batch embeddings by default. Ensure `EmbeddingService.embed_batch()` is used:

```python
# Good - single API call for all chunks
embeddings = await service_pool.embedding_service.embed_batch(chunks)

# Bad - N API calls
embeddings = [await service_pool.embedding_service.embed(c) for c in chunks]
```

### 4. Horizontal Scaling

Add more worker containers:

```yaml
pulse_webhook-worker:
  deploy:
    replicas: 4  # 4 workers processing in parallel
```

**Guidelines:**
- 1 worker per CPU core (for CPU-bound tasks)
- 2-4 workers per GPU (for GPU-bound embedding tasks)
- Monitor queue depth and adjust replicas

### 5. Use Separate Worker Mode

Embedded worker shares resources with API. For high throughput:
- Set `WEBHOOK_ENABLE_WORKER=false` in API
- Run multiple standalone workers
- API stays responsive during job spikes

---

## Architecture Deep Dive

### Why RQ Instead of Celery?

**RQ Advantages:**
- Simpler: No broker + backend split (just Redis)
- Pythonic: Jobs are just functions
- Introspectable: Easy to inspect queue in Redis CLI
- Lightweight: Fewer dependencies

**Celery Advantages:**
- More features: Routing, retries, rate limiting
- Better monitoring: Flower UI
- More brokers: RabbitMQ, SQS, etc.

**Decision:** RQ chosen for simplicity. Queue is single-purpose (indexing), and introspection via Redis CLI is valuable.

### Thread Safety

Service pool uses double-checked locking for thread safety:

```python
@classmethod
def get_instance(cls):
    if cls._instance is None:           # First check (no lock)
        with cls._lock:                  # Acquire lock
            if cls._instance is None:    # Second check (with lock)
                cls._instance = cls()    # Initialize
    return cls._instance
```

Multiple threads/workers can safely call `get_instance()` concurrently.

### Transaction Boundaries

Rescrape jobs use **separate transactions** to avoid long locks:

```python
# Transaction 1: Mark in-progress (immediate commit)
async with get_db_context() as session:
    change_event.rescrape_status = "in_progress"
    await session.commit()

# Long-running external API call (NO transaction open)
result = await firecrawl_api.scrape(url)

# Transaction 2: Update final status (separate commit)
async with get_db_context() as session:
    change_event.rescrape_status = "success"
    change_event.indexed_at = now()
    await session.commit()
```

This prevents holding database locks during slow external API calls.

---

## Related Documentation

- [Main README](README.md) - Service overview and setup
- [Worker Architecture](../../docs/services/webhook/webhook-worker-architecture.md) - Complete technical design
- [Worker Flow Diagrams](../../docs/services/webhook/webhook-worker-flow-diagrams.md) - Visual workflows
- [Service Pool Implementation](services/service_pool.py) - Singleton pattern code
- [Job Definitions](workers/jobs.py) - Job function implementations

---

## Support

For issues, questions, or feature requests related to the worker system:

1. Check troubleshooting section above
2. Review worker logs: `docker logs pulse_webhook-worker`
3. Inspect Redis queue: `redis-cli -p 50104 LLEN rq:queue:indexing`
4. Check operation metrics: `GET /api/metrics/operations`

**Last Updated:** 11/13/2025  
**Worker Version:** 1.0.0 (RQ-based implementation)
