# Complete Queue, Concurrency & Performance Control Guide

**Version:** 1.0.0
**Date:** 2025-01-13
**Project:** Pulse Monorepo

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Concurrency Variables Explained](#concurrency-variables-explained)
3. [Queue Configuration Inventory](#queue-configuration-inventory)
4. [Crawl Speed Controls](#crawl-speed-controls)
5. [Resource Limits](#resource-limits)
6. [Job Priority & Scheduling](#job-priority--scheduling)
7. [Monitoring & Observability](#monitoring--observability)
8. [Playwright Optimization](#playwright-optimization)
9. [Webhook & Indexing Controls](#webhook--indexing-controls)
10. [Docker Compose Scaling](#docker-compose-scaling)
11. [Performance Tuning Recipes](#performance-tuning-recipes)

---

## Executive Summary

The Pulse crawling system has **multiple layers of concurrency control** that interact to determine overall throughput:

### Current Bottlenecks

1. **4 Firecrawl workers** processing jobs sequentially (1 job per worker)
2. **1 webhook worker** indexing documents sequentially
3. **No per-crawl limits set** (5 crawls competing for same 4 workers)
4. **Small chunks (256 tokens)** = more embedding overhead

### Quick Wins

```bash
# Increase Firecrawl throughput (double capacity)
NUM_WORKERS_PER_QUEUE=8          # Up from 4
SCRAPE_CONCURRENCY=8             # Up from 4

# Scale webhook workers (4x indexing speed)
docker compose up -d --scale pulse_webhook-worker=4

# Larger chunks (reduce overhead)
WEBHOOK_MAX_CHUNK_TOKENS=512     # Up from 256
```

### Architecture Layers

```
┌─────────────────────────────────────────────────────────────┐
│ Layer 1: Infrastructure (Docker/Workers)                    │
│ • NUM_WORKERS_PER_QUEUE=4 → 4 worker processes             │
│ • Webhook worker: 1 container (scalable to N)              │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Layer 2: Team Limits (Redis)                               │
│ • Self-hosted: UNLIMITED (team_id="bypass")                │
│ • Cloud: Configurable per team                             │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Layer 3: Per-Crawl Limits (Optional)                       │
│ • maxConcurrency: 5 → Only 5 pages at once                 │
│ • delay: 1000 → 1 second between requests                  │
└─────────────────────────────────────────────────────────────┘
```

---

## Concurrency Variables Explained

### 1. NUM_WORKERS_PER_QUEUE

**What it controls:** Number of separate Node.js worker processes spawned

**File:** `.env` line 36
**Default:** 4
**Current:** 4

**How it works:**
- Firecrawl spawns 4 independent `nuq-worker.js` processes
- Each process polls the queue continuously: get job → process → repeat
- Workers are separate OS processes (visible in `ps aux`)

**Example:** 4 workers = 4 jobs processed simultaneously (max)

**Important:** Code actually reads `NUQ_WORKER_COUNT` (defaults to 5). Add both variables to `.env`:
```bash
NUM_WORKERS_PER_QUEUE=8
NUQ_WORKER_COUNT=8
```

**To increase throughput:**
```bash
# Double capacity
NUM_WORKERS_PER_QUEUE=8
NUQ_WORKER_COUNT=8
```

---

### 2. WORKER_CONCURRENCY

**What it controls:** NOTHING (unused variable)

**Status:** This variable is documented but **not implemented** in Firecrawl code.

Each NuQ worker processes jobs **sequentially** (one at a time), regardless of this setting.

---

### 3. SCRAPE_CONCURRENCY

**What it controls:** NOTHING (unused variable)

**Status:** Another unused/legacy variable. Actual concurrency controlled by worker count.

---

### 4. Per-Team Concurrency (Redis)

**What it controls:** Maximum concurrent jobs across ALL crawls for a team

**Default for self-hosted:** UNLIMITED (team_id="bypass")

**Where it's set:**
- Database mode: Supabase `auth_credit_usage_chunk` table
- Self-hosted: Hardcoded to `99999999` in Firecrawl container

**Redis keys:**
- `concurrency-limiter:{team_id}` - Active jobs tracked here
- Default limit: 2 concurrent jobs (only for preview tokens)

**Check your limit:**
```bash
docker exec pulse_redis redis-cli ZCARD "concurrency-limiter:bypass"
```

**Conclusion:** With `USE_DB_AUTHENTICATION=false`, you have **unlimited team concurrency**. This is NOT your bottleneck.

---

### 5. maxConcurrency (Per-Crawl Parameter)

**What it controls:** Maximum pages from a SINGLE crawl scraped simultaneously

**File:** `apps/mcp/tools/crawl/schema.ts:88`
**Type:** Optional integer
**Default:** Unset (unlimited within team quota)

**How it differs from global settings:**

| Aspect | Global Workers | maxConcurrency |
|--------|---------------|----------------|
| **Scope** | All crawls system-wide | Single crawl only |
| **Level** | Infrastructure (Docker) | Application logic |
| **Purpose** | Physical capacity limit | Rate-limiting/politeness |
| **Storage** | Process config | Redis crawl metadata |

**Example:**
```bash
# Without maxConcurrency (what you've been doing):
crawl start https://nextjs.org --limit=10000
# All 10,000 pages compete for worker slots

# With maxConcurrency=5:
crawl start https://nextjs.org --limit=10000 --maxConcurrency=5
# Only 5 pages from THIS crawl scrape at once
# Other 7 worker slots available for other crawls
```

**Use cases:**
- Polite crawling: `maxConcurrency: 1` + `delay: 2000` (1 page every 2s)
- Fair sharing: Multiple crawls each with `maxConcurrency: 3`
- Prevent monopolization: Large crawl limited to 5 pages while small crawls run

---

## Queue Configuration Inventory

### Firecrawl API (Node.js + BullMQ + NuQ)

**Environment Variables:**
```bash
# Worker Configuration
NUM_WORKERS_PER_QUEUE=4       # Workers per queue type
WORKER_CONCURRENCY=2          # Unused (legacy)
SCRAPE_CONCURRENCY=4          # Unused (legacy)
RETRY_DELAY=3000              # Delay between retries (ms)
MAX_RETRIES=1                 # Max retry attempts

# Ports
WORKER_PORT=50103
EXTRACT_WORKER_PORT=50106

# Redis
REDIS_URL=redis://pulse_redis:6379
BULL_AUTH_KEY=@

# System Resources
MAX_CPU=1.0                   # CPU threshold (1.0 = 100%)
MAX_RAM=1.0                   # RAM threshold (1.0 = 100%)
```

### NuQ (PostgreSQL Queue) Configuration

**Database:** `pulse_postgres`
**Schema:** `nuq`

**Tables:**
- `nuq.queue_scrape` - Main scraping queue
- `nuq.queue_scrape_backlog` - Overflow/backlog
- `nuq.queue_crawl_finished` - Completion notifications
- `nuq.group_crawl` - Crawl job coordination

**Job Lifecycle Settings:**
- Lock timeout: 1 minute (jobs requeued if stuck)
- Max stalls: 9 retries before permanent failure
- Stall check: Every 15 seconds (pg_cron)
- Completed TTL: 1 hour
- Failed TTL: 6 hours
- Group TTL: 24 hours (configurable per crawl)

**Cron Jobs:**
```sql
nuq_queue_scrape_clean_completed      # Every 5 minutes
nuq_queue_scrape_clean_failed         # Every 5 minutes
nuq_queue_scrape_lock_reaper          # Every 15 seconds
nuq_group_crawl_finished              # Every 15 seconds
```

### Webhook Bridge (Python + RQ)

**Environment Variables:**
```bash
WEBHOOK_ENABLE_WORKER=false           # Use container worker
WEBHOOK_INDEXING_JOB_TIMEOUT=10m      # RQ job timeout
WEBHOOK_REDIS_URL=redis://pulse_redis:6379
```

**RQ Worker (docker-compose):**
```bash
command: python -m rq.cli worker \
  --url redis://pulse_redis:6379 \
  --name search-bridge-worker \
  --worker-ttl 600 \               # 10 minute TTL
  indexing                         # Queue name
```

**Queue Inspection:**
```bash
# Queue depth
redis-cli LLEN rq:queue:indexing

# Failed jobs
redis-cli LLEN rq:queue:failed

# Worker status
redis-cli SMEMBERS rq:workers

# Job details
redis-cli HGETALL rq:job:{job_id}
```

### Redis Configuration

**Runtime:**
```bash
maxmemory=0                    # Unlimited
maxmemory-policy=noeviction    # Don't evict on full
appendonly=yes                 # AOF persistence
save="60 1"                    # Snapshot every 60s if ≥1 change
```

### changedetection.io

**Environment:**
```bash
CHANGEDETECTION_FETCH_WORKERS=10
FETCH_WORKERS=10
CHANGEDETECTION_MINIMUM_SECONDS_RECHECK_TIME=60
```

---

## Crawl Speed Controls

### Per-Request Delays

**Crawl tool delay:**
```typescript
// apps/mcp/tools/crawl/schema.ts
delay: z.number().int().min(0).optional()
```

**Usage:**
```bash
crawl start https://example.com --delay=5000  # 5 second pause between pages
```

**Firecrawl retry delay:**
```bash
RETRY_DELAY=3000  # 3 seconds between retry attempts
```

### Rate Limiting

**MCP Server:**
- `/mcp` endpoint: 100 requests/minute
- OAuth endpoints: 10 requests/minute

**Webhook API:**
- Default: 100 requests/minute per IP
- Indexing endpoint: 10 requests/minute

**Crawl tool:**
- 10 crawl start commands per 15 minutes (client-side)

### Timeout Values

**HTTP client (Firecrawl API calls):**
```typescript
fetchWithTimeout(url, options, 30000)  // 30 seconds
```

**Page load timeout:**
```typescript
timeout: z.number().optional().default(60000)  // 60 seconds
```

**Wait before scraping:**
```typescript
waitFor: z.number().optional()  // Milliseconds, default: none
```

**Example:**
```bash
# Wait 3 seconds for JavaScript to load
scrape https://spa-app.com --waitFor=3000
```

**Webhook job timeout:**
```bash
WEBHOOK_INDEXING_JOB_TIMEOUT=10m
```

### Batch Size Limits

**Crawl page limit:**
```typescript
limit: z.number().int().min(1).max(100000).optional().default(100)
```

**Map URL limit:**
```typescript
maxResults: z.number().int().min(1).max(5000).optional().default(200)
```

### Discovery Depth Limits

**Max discovery depth:**
```typescript
maxDiscoveryDepth: z.number().int().min(1).optional()
```

**Crawl entire domain:**
```typescript
crawlEntireDomain: z.boolean().optional().default(false)
```

**Allow subdomains:**
```typescript
allowSubdomains: z.boolean().optional().default(false)
```

**Allow external links:**
```typescript
allowExternalLinks: z.boolean().optional().default(false)
```

**Warning:** `crawlEntireDomain: true` + `allowSubdomains: true` + `allowExternalLinks: true` can explode crawl size!

### Sitemap Processing

**Sitemap handling:**
```typescript
sitemap: z.enum(["include", "skip"]).optional().default("include")
```

- `include`: Seeds crawl from sitemap (faster discovery)
- `skip`: Only discovers URLs by following links (slower)

**Map tool sitemap:**
```typescript
sitemap: z.enum(["skip", "include", "only"]).optional()
```

- `only`: Returns sitemap URLs only (fastest)
- `include`: Mixes sitemap + crawled URLs
- `skip`: Crawled URLs only (slowest)

### URL Filtering

**Default language excludes:**
```typescript
// apps/mcp/config/crawl-config.ts
DEFAULT_LANGUAGE_EXCLUDES = [
  "^/de/", "^/es/", "^/fr/", "^/ja/", "^/zh/",
  // ... 29 more patterns
]
```

**Custom filtering:**
```typescript
includePaths: z.array(z.string()).optional()
excludePaths: z.array(z.string()).optional()
```

**Ignore query params:**
```typescript
ignoreQueryParameters: z.boolean().optional().default(true)
```

### Proxy & Anti-Bot Settings

**Proxy mode:**
```typescript
proxy: z.enum(["basic", "stealth", "auto"]).optional().default("auto")
```

- `basic`: Fast, standard proxy
- `stealth`: Slow (5x credits), advanced anti-bot bypass
- `auto`: Tries basic first, falls back to stealth

### Content Processing

**Default formats:**
```typescript
formats: ["markdown", "html", "summary", "changeTracking", "links"]
```

**Optimization:**
```typescript
// Remove unused formats for faster processing
formats: ["markdown"]  // Markdown only
```

**Other settings:**
```typescript
onlyMainContent: true   // Strip nav/ads (faster)
blockAds: true          // Block ad/cookie popups (faster page loads)
removeBase64Images: true // Smaller payloads
```

---

## Resource Limits

### CPU & Memory

**Firecrawl:**
```bash
MAX_CPU=1.0      # 1.0 = 100% of one core
MAX_RAM=1.0      # 1.0 = 100% of available memory
```

**Recommended:**
```bash
MAX_CPU=0.8      # 80% threshold (prevents overload)
MAX_RAM=0.8      # 80% threshold (prevents OOM)
```

### File Descriptors

**Firecrawl container:**
```yaml
ulimits:
  nofile:
    soft: 65535
    hard: 65535
```

### PostgreSQL Connection Pool

**Webhook:**
```python
pool_size=20            # Connection pool size
max_overflow=10         # Additional connections if full
# Total max: 30 connections
```

### Redis

**No explicit limits:**
- Unlimited connections (maxclients unset)
- Unlimited memory (maxmemory=0)

### TEI (Text Embeddings Inference)

**GPU service:**
```bash
TEI_MAX_CONCURRENT_REQUESTS=80
TEI_MAX_BATCH_TOKENS=163840
TEI_MAX_BATCH_REQUESTS=80
TEI_MAX_CLIENT_BATCH_SIZE=128
TEI_TOKENIZATION_WORKERS=8
OMP_NUM_THREADS=8
MKL_NUM_THREADS=8
```

### Qdrant

**Configuration:**
```bash
QDRANT_TIMEOUT=60.0              # Request timeout (seconds)
QDRANT__GPU__INDEXING=1          # GPU-accelerated indexing
```

### Docker Resource Limits

**No CPU/memory limits configured:**
- Firecrawl: No limits
- Webhook: No limits
- MCP: No limits

**GPU reservations:**
```yaml
deploy:
  resources:
    reservations:
      devices:
        - driver: nvidia
          count: 1
          capabilities: [gpu]
```

Applied to: TEI, Qdrant, Ollama

---

## Job Priority & Scheduling

### NuQ Priority System

**Schema:**
```sql
CREATE TABLE nuq.queue_scrape (
  priority int NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now(),
  -- ...
)
```

**Index (defines ordering):**
```sql
CREATE INDEX ON nuq.queue_scrape (priority ASC, created_at ASC, id)
WHERE status = 'queued';
```

**Job selection:**
```sql
SELECT * FROM nuq.queue_scrape
WHERE status = 'queued'
ORDER BY priority ASC, created_at ASC  -- LOWER priority = HIGHER precedence
FOR UPDATE SKIP LOCKED
LIMIT 1;
```

**Priority values:**
- `-100` to `-1`: High priority (urgent jobs)
- `0`: Normal priority (default)
- `1` to `100`: Low priority (background tasks)

**Example use cases:**
- User scrapes: `priority: -10`
- API requests: `priority: 0`
- Scheduled crawls: `priority: 5`
- Cleanup tasks: `priority: 50`

### RQ Queue (Webhook)

**No priority support** in open-source RQ. Jobs processed strictly FIFO.

**Workaround (multiple queues):**
```python
high_priority = Queue("indexing-high", connection=redis)
low_priority = Queue("indexing-low", connection=redis)
worker = Worker([high_priority, low_priority])  # Drains high first
```

### Starvation Prevention

**Lock reaper (every 15 seconds):**
```sql
-- Retry stuck jobs (up to 9 times)
UPDATE nuq.queue_scrape
SET status = 'queued', lock = null, stalls = stalls + 1
WHERE locked_at <= now() - interval '1 minute'
  AND status = 'active'
  AND COALESCE(stalls, 0) < 9;

-- Mark permanently stalled jobs as failed
UPDATE nuq.queue_scrape
SET status = 'failed', lock = null
WHERE locked_at <= now() - interval '1 minute'
  AND status = 'active'
  AND COALESCE(stalls, 0) >= 9;
```

---

## Monitoring & Observability

### Metrics API Endpoints

**Request metrics:**
```bash
GET /api/metrics/requests?hours=24&min_duration_ms=1000
```

Returns:
- Individual request metrics (duration, status, client IP)
- Summary statistics (avg/min/max duration)

**Operation metrics:**
```bash
GET /api/metrics/operations?operation_type=embedding&hours=1
```

Returns:
- Per-operation timing (chunking, embedding, indexing)
- Success/failure rates
- Job tracing by job_id

**Summary dashboard:**
```bash
GET /api/metrics/summary?hours=24
```

Returns:
- High-level overview
- Top 10 slowest endpoints
- Operations by type

### Health Checks

**Service health:**
```bash
GET /health
```

Checks:
- Redis connectivity
- Qdrant connectivity
- TEI connectivity

**Index statistics:**
```bash
GET /api/stats
```

Returns:
- Total documents (BM25)
- Total chunks (Qdrant)
- Collection name

### Database Metrics Tables

**Request metrics:**
```sql
SELECT path, AVG(duration_ms), MAX(duration_ms), COUNT(*)
FROM webhook.request_metrics
WHERE timestamp > NOW() - INTERVAL '1 hour'
GROUP BY path
ORDER BY AVG(duration_ms) DESC;
```

**Operation metrics:**
```sql
-- Find slowest operations
SELECT operation_type, operation_name, AVG(duration_ms) AS avg_ms
FROM webhook.operation_metrics
WHERE timestamp > NOW() - INTERVAL '1 hour'
GROUP BY operation_type, operation_name
ORDER BY avg_ms DESC;

-- Trace specific job
SELECT operation_name, duration_ms, success, error_message
FROM webhook.operation_metrics
WHERE job_id = 'abc-123'
ORDER BY timestamp;
```

### Redis Queue Inspection

**Queue depth:**
```bash
redis-cli LLEN rq:queue:indexing
```

**Failed jobs:**
```bash
redis-cli LLEN rq:queue:failed
redis-cli LRANGE rq:queue:failed 0 -1
```

**Worker status:**
```bash
redis-cli SMEMBERS rq:workers
redis-cli HGETALL rq:worker:search-bridge-worker
```

**Watch in real-time:**
```bash
watch -n 1 "redis-cli LLEN rq:queue:indexing"
```

### Structured Logging

**View logs:**
```bash
# Webhook API
docker logs pulse_webhook --tail 100 -f

# Worker
docker logs pulse_webhook-worker --tail 100 -f

# Filter slow operations (>1000ms)
docker logs pulse_webhook | grep "duration_ms" | grep -E "[0-9]{4,}"

# Filter errors
docker logs pulse_webhook | grep -i error

# Filter by job ID
docker logs pulse_webhook-worker | grep "job_id=abc-123"
```

### NuQ Queue Inspection

**Check queue depth:**
```bash
docker exec pulse_postgres psql -U firecrawl -d pulse_postgres -c \
  "SELECT status, COUNT(*) FROM nuq.queue_scrape GROUP BY status;"
```

**Check oldest jobs:**
```bash
docker exec pulse_postgres psql -U firecrawl -d pulse_postgres -c \
  "SELECT id, created_at, priority FROM nuq.queue_scrape
   WHERE status='queued' ORDER BY priority ASC, created_at ASC LIMIT 10;"
```

---

## Playwright Optimization

### Browser Pool

**Current settings:**
```bash
NUM_WORKERS_PER_QUEUE=4          # Worker processes
SCRAPE_CONCURRENCY=4             # Concurrent scrapes
```

**Recommendations:**
```bash
NUM_WORKERS_PER_QUEUE=8          # Double capacity
SCRAPE_CONCURRENCY=8             # Double concurrency
```

### Timeouts

**Client default:**
```typescript
timeout: 60000  // 60 seconds
```

**Playwright service:**
```
timeout: 15000  // 15 seconds (from logs)
```

**Recommendation:** Increase Playwright service timeout to 30000ms

### Resource Blocking

**Current:**
```bash
BLOCK_MEDIA=true                 # Blocks images/videos/fonts
blockAds: true                   # Blocks ads/cookie popups
```

**Keep these enabled** for 50-70% bandwidth savings

### Browser Launch Args

**Recommended additions:**
```
--disable-dev-shm-usage
--no-sandbox
--disable-gpu
--disable-software-rasterizer
```

### Shared Memory

**Add to docker-compose.yaml (firecrawl service):**
```yaml
shm_size: 2g  # Prevent Chromium crashes
```

### Navigation Strategies

**Current:** `waitUntil: 'load'` (default)

**Recommendations:**
- Static sites: `waitUntil: 'domcontentloaded'` (fastest)
- JS apps: `waitUntil: 'load'` (balanced)
- Heavy AJAX: `waitUntil: 'networkidle'` (complete)

### Cache Settings

**MCP resource caching:**
```typescript
maxAge: 172800000  // 2 days (default)
forceRescrape: false
```

**Recommendations:**
- News sites: 3600000 (1 hour)
- Docs sites: 86400000 (24 hours)
- Static sites: 604800000 (7 days)

---

## Webhook & Indexing Controls

### Worker Scaling

**Current:** 1 worker (sequential processing)

**Scale to 4 workers:**
```bash
docker compose up -d --scale pulse_webhook-worker=4
```

**Result:** 4x throughput on indexing pipeline

### Job Timeout

**Current:**
```bash
WEBHOOK_INDEXING_JOB_TIMEOUT=10m  # 10 minutes
```

**Recommendation:**
```bash
WEBHOOK_INDEXING_JOB_TIMEOUT=5m   # 5 minutes (fail faster)
```

### Chunking Configuration

**Current:**
```bash
WEBHOOK_MAX_CHUNK_TOKENS=256      # Small chunks
WEBHOOK_CHUNK_OVERLAP_TOKENS=50   # 20% overlap
```

**Recommendations:**
```bash
WEBHOOK_MAX_CHUNK_TOKENS=512      # Double chunk size (halve chunk count)
WEBHOOK_CHUNK_OVERLAP_TOKENS=100  # Maintain 20% overlap
```

**Impact:** Fewer chunks = fewer embeddings = faster indexing

### TEI Batch Configuration

**Current:**
```bash
TEI_MAX_CONCURRENT_REQUESTS=80
TEI_MAX_BATCH_TOKENS=163840
TEI_MAX_BATCH_REQUESTS=80
```

**No changes needed** - these are already optimized

### Qdrant Timeout

**Current:**
```bash
WEBHOOK_QDRANT_TIMEOUT=60.0  # 60 seconds
```

**For large batches, increase to:**
```bash
WEBHOOK_QDRANT_TIMEOUT=120.0  # 2 minutes
```

### Rate Limiting

**Current:**
```python
default_limits=["100/minute"]     # Default API
limiter.limit("10/minute")        # Indexing endpoint
```

**For high-volume crawls:**
```python
default_limits=["500/minute"]
limiter.limit("50/minute")
```

---

## Docker Compose Scaling

### Horizontal Scaling Support

**Only `pulse_webhook-worker` supports scaling:**
```bash
docker compose up -d --scale pulse_webhook-worker=4
```

**Other services:** Have `container_name` defined, preventing scaling.

### Resource Limits

**Current:** No CPU/memory limits configured

**Add limits (docker-compose.yaml):**
```yaml
firecrawl:
  deploy:
    resources:
      limits:
        cpus: '4.0'
        memory: 8G
      reservations:
        cpus: '2.0'
        memory: 4G
```

### Health Checks

**Services with health checks:**
- pulse_mcp (30s interval)
- pulse_webhook (30s interval)
- pulse_change-detection (60s interval)
- pulse_neo4j (10s interval)
- pulse_tei (30s interval)
- pulse_qdrant (30s interval)
- pulse_ollama (30s interval)

**Services without health checks:**
- pulse_playwright
- pulse_redis
- pulse_postgres
- pulse_webhook-worker
- firecrawl

### Network Performance

**Network type:** External bridge network (`pulse`)

**Characteristics:**
- DNS resolution by container name
- No overlay network overhead
- No built-in load balancing

### Volume Mount Performance

**All volumes use bind mounts** (no named volumes)

**Optimization opportunities:**
- Add tmpfs mounts for `/tmp`, cache directories
- Use `cached` or `delegated` mount options

---

## Performance Tuning Recipes

### Recipe 1: Maximum Throughput (Development)

**Goal:** Scrape as fast as possible, don't worry about politeness

```bash
# .env
NUM_WORKERS_PER_QUEUE=12
NUQ_WORKER_COUNT=12
SCRAPE_CONCURRENCY=12
MAX_CPU=0.9
MAX_RAM=0.9

# Scale webhook workers
docker compose up -d --scale pulse_webhook-worker=6

# Increase chunk size
WEBHOOK_MAX_CHUNK_TOKENS=512

# Optimize TEI
TEI_MAX_CONCURRENT_REQUESTS=120
TEI_MAX_BATCH_REQUESTS=120
```

**Expected result:** 3-4x throughput increase

---

### Recipe 2: Polite Crawling (Production)

**Goal:** Crawl respectfully, avoid overloading target sites

```bash
# Per-crawl settings
crawl start https://example.com \
  --limit=1000 \
  --maxConcurrency=2 \
  --delay=2000 \
  --timeout=60000

# .env (keep conservative)
NUM_WORKERS_PER_QUEUE=4
SCRAPE_CONCURRENCY=4
```

**Expected result:** ~1 page every 2 seconds per site

---

### Recipe 3: Balanced Performance (Recommended)

**Goal:** Good throughput without overwhelming infrastructure

```bash
# .env
NUM_WORKERS_PER_QUEUE=8
NUQ_WORKER_COUNT=8
SCRAPE_CONCURRENCY=8
MAX_CPU=0.8
MAX_RAM=0.8

# Scale webhook workers
docker compose up -d --scale pulse_webhook-worker=4

# Larger chunks
WEBHOOK_MAX_CHUNK_TOKENS=512

# Reasonable limits
WEBHOOK_INDEXING_JOB_TIMEOUT=5m
```

**Expected result:** 2x throughput, stable operation

---

### Recipe 4: Multi-Crawl Fair Sharing

**Goal:** Run multiple crawls without one monopolizing resources

```bash
# Crawl A (high priority)
crawl start https://docs-site.com \
  --limit=500 \
  --maxConcurrency=4

# Crawl B (normal priority)
crawl start https://blog-site.com \
  --limit=1000 \
  --maxConcurrency=3

# Crawl C (low priority)
crawl start https://archive-site.com \
  --limit=5000 \
  --maxConcurrency=2
```

**Result:** Workers shared fairly (4+3+2 = 9 pages max, limited by 8 workers)

---

### Recipe 5: Debugging Slow Crawls

**Step 1: Check queue depth**
```bash
docker exec pulse_postgres psql -U firecrawl -d pulse_postgres -c \
  "SELECT status, COUNT(*) FROM nuq.queue_scrape GROUP BY status;"
```

**Step 2: Check worker health**
```bash
docker logs firecrawl --tail 100 | grep "nuq-worker"
```

**Step 3: Check operation metrics**
```bash
curl "http://localhost:50108/api/metrics/operations?hours=1" | jq '.operations_by_type'
```

**Step 4: Monitor queue in real-time**
```bash
watch -n 2 "docker exec pulse_postgres psql -U firecrawl -d pulse_postgres -c \
  'SELECT status, COUNT(*) FROM nuq.queue_scrape GROUP BY status;'"
```

---

## Quick Reference Tables

### Environment Variables by Impact

| Variable | Current | Recommended | Impact |
|----------|---------|-------------|--------|
| `NUM_WORKERS_PER_QUEUE` | 4 | 8 | High (doubles capacity) |
| `SCRAPE_CONCURRENCY` | 4 | 8 | High (doubles throughput) |
| `WEBHOOK_MAX_CHUNK_TOKENS` | 256 | 512 | Medium (halves chunks) |
| `MAX_CPU` | 1.0 | 0.8 | Medium (prevents overload) |
| `MAX_RAM` | 1.0 | 0.8 | Medium (prevents OOM) |
| `WEBHOOK_INDEXING_JOB_TIMEOUT` | 10m | 5m | Low (faster failures) |

### Docker Commands

```bash
# Scale webhook workers
docker compose up -d --scale pulse_webhook-worker=4

# Check service status
docker compose ps

# View logs
docker logs pulse_webhook -f
docker logs pulse_webhook-worker -f

# Restart services
docker compose restart firecrawl
docker compose restart pulse_webhook-worker

# Check resource usage
docker stats pulse_webhook pulse_webhook-worker firecrawl
```

### Redis Commands

```bash
# Queue depth
redis-cli LLEN rq:queue:indexing

# Failed jobs
redis-cli LLEN rq:queue:failed

# Worker status
redis-cli SMEMBERS rq:workers

# Flush queue (DANGER)
redis-cli DEL rq:queue:indexing
```

### PostgreSQL Commands

```bash
# Queue depth by status
psql -c "SELECT status, COUNT(*) FROM nuq.queue_scrape GROUP BY status;"

# Oldest queued jobs
psql -c "SELECT id, created_at FROM nuq.queue_scrape WHERE status='queued' ORDER BY created_at LIMIT 10;"

# Clean old jobs
psql -c "DELETE FROM nuq.queue_scrape WHERE status='completed' AND created_at < NOW() - INTERVAL '1 hour';"
```

---

## Troubleshooting

### Problem: Crawls appear stuck at low percentage

**Symptoms:**
- Status shows "scraping" for 30+ minutes
- Progress: 253/4358 pages (6%)
- No increase in completed count

**Diagnosis:**
```bash
# Check if new jobs being processed
docker logs firecrawl --tail 50 | grep "Scraping"

# Check queue depth
docker exec pulse_postgres psql -U firecrawl -d pulse_postgres -c \
  "SELECT status, COUNT(*) FROM nuq.queue_scrape GROUP BY status;"
```

**Likely cause:** Worker processing rate < URL discovery rate

**Solution:**
1. Increase workers: `NUM_WORKERS_PER_QUEUE=8`
2. Set per-crawl limit: `maxConcurrency=5`
3. Reduce discovery: `maxDiscoveryDepth=3`

---

### Problem: Webhook indexing slow

**Symptoms:**
- Large queue backlog: `redis-cli LLEN rq:queue:indexing` > 100
- Slow job processing

**Diagnosis:**
```bash
# Check operation metrics
curl "http://localhost:50108/api/metrics/operations?operation_type=embedding&hours=1"

# Check TEI health
curl "http://tei:80/health"
```

**Solutions:**
1. Scale workers: `docker compose up -d --scale pulse_webhook-worker=4`
2. Increase chunk size: `WEBHOOK_MAX_CHUNK_TOKENS=512`
3. Check TEI performance

---

### Problem: High CPU/memory usage

**Symptoms:**
- Docker stats show 90%+ CPU/memory
- Services crashing with OOM

**Solutions:**
1. Set resource limits: `MAX_CPU=0.8`, `MAX_RAM=0.8`
2. Reduce workers: `NUM_WORKERS_PER_QUEUE=4`
3. Add Docker resource limits
4. Increase swap space

---

## File Reference

**Configuration:**
- `/compose/pulse/.env` - All environment variables
- `/compose/pulse/docker-compose.yaml` - Container orchestration
- `/compose/pulse/apps/mcp/config/crawl-config.ts` - MCP crawl defaults
- `/compose/pulse/apps/webhook/config.py` - Webhook settings

**Schemas:**
- `/compose/pulse/apps/mcp/tools/crawl/schema.ts` - Crawl parameter validation
- `/compose/pulse/apps/mcp/tools/scrape/schema.ts` - Scrape parameter validation
- `/compose/pulse/packages/firecrawl-client/src/types.ts` - Firecrawl type definitions

**Database:**
- `/compose/pulse/apps/nuq-postgres/nuq.sql` - NuQ schema and cron jobs

**Monitoring:**
- `/compose/pulse/apps/webhook/api/routers/metrics.py` - Metrics API
- `/compose/pulse/apps/webhook/utils/timing.py` - Timing instrumentation

---

**Document Version:** 1.0.0
**Last Updated:** 2025-01-13
**Maintained By:** Claude Code Assistant

For questions or issues, refer to:
- `/compose/pulse/CLAUDE.md` - Project overview
- `/compose/pulse/.docs/services-ports.md` - Service port registry
- `/compose/pulse/.docs/deployment-log.md` - Deployment history
