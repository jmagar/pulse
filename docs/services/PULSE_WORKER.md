# Webhook Worker (pulse_webhook-worker)

_Last Updated: 06:56:18 | 11/13/2025_

## Role in Pulse
The standalone worker container executes all background jobs queued by the webhook API: document indexing, rescrapes triggered by changedetection.io, and future graph enrichment tasks. Running it separately keeps the API responsive and allows horizontal scaling.

## Container & Command
- **Compose service / container**: `pulse_webhook-worker`
- **Build**: same Dockerfile as the API (`apps/webhook/Dockerfile`)
- **Command**:
  ```yaml
  python -m rq.cli worker \
    --url redis://pulse_redis:6379 \
    --name search-bridge-worker \
    --worker-ttl 600 \
    indexing
  ```
- **Ports**: none exposed (no HTTP interface).
- **Volumes**:
  - `${APPDATA_BASE}/pulse_webhook/bm25:/app/data/bm25`
  - `${APPDATA_BASE}/pulse_webhook/hf_cache:/app/.cache/huggingface`

## Configuration
Inherits the same env vars as `pulse_webhook` (since it builds from the same image) and requires the following to be set in `.env`:
- `WEBHOOK_REDIS_URL=redis://pulse_redis:6379`
- `WEBHOOK_DATABASE_URL=postgresql+asyncpg://...`
- `WEBHOOK_QDRANT_URL`, `WEBHOOK_TEI_URL`, `WEBHOOK_OLLAMA_URL`, `WEBHOOK_NEO4J_*`
- `WEBHOOK_FIRECRAWL_API_URL` / `WEBHOOK_FIRECRAWL_API_KEY`

Disable the embedded worker thread by setting `WEBHOOK_ENABLE_WORKER="false"` (already configured in docker-compose) so only the standalone worker processes jobs.

## Dependencies
- Redis queue `indexing` (RQ naming convention `rq:queue:indexing`).
- Firecrawl, Qdrant, TEI, Ollama, Neo4j, and PostgreSQL accessible via Docker DNS.
- Shared BM25/embedding cache directories to avoid re-downloading models per container.

## Deployment Workflow
1. Ensure Redis, PostgreSQL, Firecrawl, TEI, Qdrant, and Ollama are reachable.
2. Start/restart worker:
   ```bash
   docker compose up -d pulse_webhook-worker
   ```
3. Monitor real-time logs: `docker compose logs -f pulse_webhook-worker`.
4. Confirm worker registration:
   ```bash
   redis-cli -h localhost -p 50104 SMEMBERS rq:workers
   ```
5. Record deployments in `.docs/deployment-log.md`.

## Operations & Monitoring

### Queue Inspection
```bash
# Queue depth (how many jobs waiting?)
docker exec pulse_redis redis-cli LLEN rq:queue:indexing

# Job IDs in queue
docker exec pulse_redis redis-cli LRANGE rq:queue:indexing 0 -1

# Job details
docker exec pulse_redis redis-cli HGETALL rq:job:{job_id}

# Worker heartbeat (is worker alive?)
docker exec pulse_redis redis-cli SMEMBERS rq:workers
docker exec pulse_redis redis-cli KEYS rq:worker:*

# Failed jobs
docker exec pulse_redis redis-cli LLEN rq:queue:failed
docker exec pulse_redis redis-cli LRANGE rq:queue:failed 0 -1
```

### Queue Management
```bash
# Clear the indexing queue (abandon all pending jobs)
docker exec pulse_redis redis-cli DEL rq:queue:indexing

# Flush entire Redis database (nuclear option - clears everything)
docker exec pulse_redis redis-cli FLUSHDB

# Stop worker gracefully (finishes current job, then stops)
docker compose stop pulse_webhook-worker

# Stop worker immediately (kills current job, job marked as failed)
docker compose kill pulse_webhook-worker

# Restart worker (waits for current job to complete)
docker compose restart pulse_webhook-worker
```

**Important:**
- `stop`/`restart` are graceful - worker completes current job before stopping
- `kill` is forceful - worker terminates immediately, job fails
- Canceling a Firecrawl crawl does NOT clear queued indexing jobs
- Jobs already enqueued will process even if source crawl is canceled

**Worker metrics**: logs include timing breakdown for chunking, embeddings, indexing. Ship to log aggregation if needed (no SaaS per policy).

## Failure Modes & Troubleshooting
| Symptom | Likely Cause | Resolution |
|---------|--------------|------------|
| Jobs stuck in queue | Worker down or Redis unreachable | Restart worker, verify Redis connectivity (`redis-cli ping`). |
| `firecrawl scrape failed` errors | Firecrawl offline | Bring Firecrawl back up, jobs will retry if configured. |
| Embedding failures (`TEI unavailable`) | GPU services offline | Restart TEI/Ollama stack; failed jobs will land in `rq:queue:failed` for requeueing. |
| `database timeout` exceptions | PostgreSQL under heavy load | Increase connection pool, optimize DB, or scale hardware. |

## Verification Checklist
- Worker listed via `redis-cli SMEMBERS rq:workers`.
- Enqueue test job (`POST /api/test-index`) -> logs show completion with timing data.
- Failed queue empty or within acceptable backlog.
- `rq:queue:indexing` length returns to zero after workload processed.

## Related Documentation
- `apps/webhook/WORKER_README.md`
- `docs/services/PULSE_WEBHOOK.md`
- `docs/services/FIRECRAWL.md`
- `docs/services/QDRANT.md`, `docs/services/TEI.md`, `docs/services/OLLAMA.md`
