# Webhook Worker - Quick Reference Guide

## One-Page Overview

The webhook server uses **RQ (Redis Queue)** for background job processing with two deployment options:

| Aspect | Value |
|--------|-------|
| **Queue Framework** | RQ v2.6.0+ |
| **Queue Name** | `"indexing"` (single queue, all jobs) |
| **Job Types** | Document indexing, URL rescraping |
| **Worker Modes** | Embedded (dev), Standalone (prod), Hybrid (recommended) |
| **Service Pool** | Singleton pattern, thread-safe |
| **Job Timeout** | 10 minutes |
| **Config Variable** | `WEBHOOK_ENABLE_WORKER` (true/false) |

---

## Quick Start

### Check Worker Status

```bash
# Is worker running?
docker logs pulse_webhook-worker | tail -20

# Queue length?
redis-cli -p 50104 LLEN rq:queue:indexing

# Job details?
redis-cli -p 50104 HGETALL rq:job:{job_id}
```

### Enqueue a Test Job

```bash
# Synchronous test (no queue)
curl -X POST http://localhost:50108/api/test-index \
  -H "Authorization: Bearer $API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "markdown": "# Test",
    "title": "Test Page"
  }'
# Returns: 200 OK with timing

# Async job (with queue)
curl -X POST http://localhost:50108/api/index \
  -H "Authorization: Bearer $API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "markdown": "# Test",
    "title": "Test Page"
  }'
# Returns: 202 Accepted with job_id
```

### Monitor Queue Depth

```bash
# Watch in real-time
watch -n 1 "redis-cli -p 50104 LLEN rq:queue:indexing"
```

---

## Deployment Modes

### Mode 1: Development (Embedded Worker)

```yaml
# docker-compose.yaml
pulse_webhook:
  environment:
    WEBHOOK_ENABLE_WORKER: "true"
  # Worker runs in background thread
```

**When to use:**
- Development
- Small deployments (<10 jobs/min)
- Single machine

**Tradeoff:** API can block on large jobs

---

### Mode 2: Production (Separate Worker)

```yaml
pulse_webhook:
  environment:
    WEBHOOK_ENABLE_WORKER: "false"  # API only
  
pulse_webhook-worker:
  command: ["python", "-m", "rq.cli", "worker", ...]
  # Separate container
```

**When to use:**
- High throughput (>10 jobs/min)
- Need to scale workers independently
- Multiple API instances

**Scale workers:**
```bash
# Add worker-2, worker-3, etc. (same queue)
# All pull from Redis queue "indexing"
```

---

### Mode 3: Hybrid (Recommended)

Combine lightweight API + scalable workers:

```yaml
pulse_webhook:
  replicas: 3
  environment:
    WEBHOOK_ENABLE_WORKER: "false"
  
pulse_webhook-worker:
  replicas: 2  # Scale based on queue depth
  command: ["python", "-m", "rq.cli", "worker", ...]
```

**Best for:** Balanced scalability and separation of concerns

---

## Job Types & Processing

### 1. Document Indexing Job

**Trigger:** Firecrawl webhook or `/api/index` endpoint

**Steps:**
1. Enqueue → 202 Accepted (return immediately)
2. Worker picks job from queue
3. Parse document
4. Get ServicePool (shared, fast init)
5. Chunk text (tokens)
6. Generate embeddings (TEI)
7. Index to Qdrant (vector) + BM25 (keyword)
8. Return result

**Performance:** 1-5 seconds per document (size dependent)

**Error handling:** Errors returned as `{success: false}` (job completes)

---

### 2. Rescrape Changed URL Job

**Trigger:** changedetection.io webhook

**Steps:**
1. Create ChangeEvent in database
2. Enqueue rescrape job → 202 Accepted
3. Worker marks event as `in_progress`
4. Call Firecrawl API to scrape
5. Index new content (same as indexing job)
6. Update event with completion status
7. Log to database for tracking

**Error handling:** Errors stored in database, job marked as failed

---

## Service Pool Performance

### Without Pool (per job)
- TextChunker init: 1-5 seconds
- HTTP client creation: 100-500ms
- Total overhead: **1-5 seconds per job**

### With Pool (per job)
- Get cached instance: 0.001 seconds
- Reuse tokenizer, connections, index
- Total overhead: **0.001 seconds per job**

### Result
**1000x faster** with service pool!

---

## Configuration

### Environment Variables

```bash
# Enable/disable embedded worker
WEBHOOK_ENABLE_WORKER=true              # dev
WEBHOOK_ENABLE_WORKER=false             # prod

# Redis connection
WEBHOOK_REDIS_URL=redis://pulse_redis:6379

# External services
WEBHOOK_QDRANT_URL=http://pulse_qdrant:6333
WEBHOOK_TEI_URL=http://tei-gpu:3000

# Job settings (hardcoded)
JOB_TIMEOUT=10m
QUEUE_NAME=indexing
WORKER_NAME=search-bridge-worker
```

---

## Monitoring & Troubleshooting

### Health Check

```bash
# API health
curl http://localhost:50108/health
# Returns: {status: healthy|degraded, services: {...}}
```

### Check Redis Queue

```bash
# Connect to Redis
redis-cli -p 50104

# List all keys
KEYS rq:*

# Check queue length
LLEN rq:queue:indexing

# Check job status
HGETALL rq:job:{job_id}

# List all jobs in queue
LRANGE rq:queue:indexing 0 -1
```

### Worker Logs

```bash
# Real-time logs
docker logs -f pulse_webhook-worker

# Filter by job ID
docker logs pulse_webhook-worker | grep abc123...

# Count jobs processed
docker logs pulse_webhook-worker | grep "Indexing job completed" | wc -l
```

### Common Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| Queue not processing | Worker not running | `docker ps \| grep webhook-worker` |
| Jobs stuck in queue | Worker memory/CPU exhausted | Scale workers, check `docker stats` |
| Service Pool init slow | First job after startup | Normal (1-5s), then fast |
| Qdrant errors in logs | Vector DB unreachable | Check `docker logs pulse_qdrant` |
| TEI errors | Embeddings service down | Check `docker logs tei` |

---

## RQ CLI Commands

### List Workers

```bash
# Via RQ CLI (if installed)
rq info -u redis://pulse_redis:6379

# Via Redis CLI
redis-cli -p 50104 SMEMBERS rq:workers
```

### Monitor Queue

```bash
# Via RQ CLI
rq info -u redis://pulse_redis:6379 -i

# Via Redis CLI (manual)
redis-cli -p 50104 MONITOR | grep rq:queue
```

### Failed Jobs

```bash
# Via Redis
redis-cli -p 50104 KEYS "rq:job:*"
redis-cli -p 50104 HGETALL rq:job:{id}

# Look for status=failed in result
```

---

## Architecture Files

- **[webhook-worker-architecture.md](webhook-worker-architecture.md)** (1149 lines)
  - Complete system design
  - Queue management details
  - Service pool implementation
  - Health monitoring
  - Configuration options
  - Testing & verification

- **[webhook-worker-flow-diagrams.md](webhook-worker-flow-diagrams.md)** (747 lines)
  - Job enqueueing flow
  - Rescrape workflow
  - Service pool lifecycle
  - Dual-mode architecture
  - Error handling & recovery

---

## Key Implementation Files

| File | Purpose |
|------|---------|
| `worker.py` | Standalone worker entry point |
| `worker_thread.py` | Embedded worker thread management |
| `workers/jobs.py` | Job functions (rescrape, indexing) |
| `infra/redis.py` | Redis connection & queue factory |
| `services/service_pool.py` | Singleton service pool |
| `api/routers/webhook.py` | Webhook endpoints & job enqueueing |
| `api/routers/indexing.py` | Indexing endpoints |
| `api/deps.py` | Dependency injection & cleanup |
| `config.py` | Configuration validation |

---

## Important Details

### Signal Handling
- Embedded worker disables signal handlers (only work in main thread)
- Allows background thread to work correctly

### Transaction Management
- Rescrape jobs use separate transactions:
  1. Mark `in_progress`
  2. Execute Firecrawl + indexing (no DB changes)
  3. Mark `completed` or `failed`
- Prevents database locks during long-running operations

### HTTP Status Codes
- `202 Accepted` - Job queued, not yet processed
- `200 OK` - Synchronous endpoint, processed immediately
- `201 Created` - Rescrape job created in database

### Job Results
- Stored in Redis for ~500 seconds (default TTL)
- Logged via structured logging
- Not currently retrieved by client (future enhancement)

---

## Scaling Guidelines

### Single Machine
```yaml
pulse_webhook:
  replicas: 1
  WEBHOOK_ENABLE_WORKER: true
  # 50-100 jobs/min capacity
```

### Multiple Machines
```yaml
pulse_webhook:
  replicas: 3
  WEBHOOK_ENABLE_WORKER: false

pulse_webhook-worker:
  replicas: 2
  # 100-500 jobs/min capacity (scale workers as needed)
```

### High Throughput
```yaml
pulse_webhook:
  replicas: 5
  WEBHOOK_ENABLE_WORKER: false

pulse_webhook-worker:
  replicas: 10
  # 500+ jobs/min capacity
```

**Monitoring:** Watch `LLEN rq:queue:indexing`
- Growing → Need more workers
- Stable/empty → Good capacity

---

## Further Reading

- See **[webhook-worker-architecture.md](webhook-worker-architecture.md)** for:
  - Complete RQ framework details
  - Double-checked locking pattern
  - Service pool resource usage
  - Detailed health monitoring
  - All configuration options
  - Testing strategies

- See **[webhook-worker-flow-diagrams.md](webhook-worker-flow-diagrams.md)** for:
  - ASCII flow diagrams
  - Sequence charts
  - Error handling flows
  - Dual-mode comparison
  - Detailed walkthrough of each process

