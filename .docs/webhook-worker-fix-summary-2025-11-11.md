# Webhook Worker Fix Summary

**Date:** 2025-11-11
**Time:** 14:50 UTC
**Status:** ✅ ALL ISSUES RESOLVED

## Issues Fixed

### 1. ✅ Worker Thread Signal Handler Crash

**Problem:** RQ worker tried to install signal handlers in a background thread, causing `ValueError: signal only works in main thread of the main interpreter`

**Solution:** Monkeypatched the `_install_signal_handlers` method to be a no-op before calling `worker.work()`

**Code Change:** [apps/webhook/worker_thread.py:93](apps/webhook/worker_thread.py#L93)
```python
# Disable signal handlers since we're in a background thread
self._worker._install_signal_handlers = lambda: None  # type: ignore[method-assign]
```

**Result:** Worker thread no longer crashes on startup

---

### 2. ✅ Qdrant Connection Failure

**Problem:** Webhook service tried to connect to `http://100.74.16.82:6333` but Qdrant was running on port `52001`

**Solution:** Updated `.env` to use correct port mapping

**Code Change:** [.env:92](.env#L92)
```bash
# Before: WEBHOOK_QDRANT_URL=http://100.74.16.82:6333
# After:
WEBHOOK_QDRANT_URL=http://100.74.16.82:52001
```

**Result:** Qdrant health check now passes

---

### 3. ✅ TEI 502 Bad Gateway

**Problem:** Webhook service tried to connect to `https://tei.tootie.tv` which returned 502 Bad Gateway

**Solution:** Changed to direct HTTP connection to TEI service on GPU machine

**Code Change:** [.env:96](.env#L96)
```bash
# Before: WEBHOOK_TEI_URL=https://tei.tootie.tv
# After:
WEBHOOK_TEI_URL=http://100.74.16.82:52000
```

**Result:** TEI health check now passes

---

### 4. ✅ Stale Worker Registration

**Problem:** After crashes, Redis retained stale worker registration causing "worker already exists" error

**Solution:** Cleaned up Redis key before restart

**Command:**
```bash
docker compose exec pulse_redis redis-cli DEL "rq:worker:search-bridge-worker"
```

**Result:** Worker successfully registered and started

---

## Current Status

### Service Health

```json
{
  "status": "healthy",
  "services": {
    "redis": "healthy",
    "qdrant": "healthy",
    "tei": "healthy"
  },
  "timestamp": "2025-11-11T14:50:24.187413+00:00"
}
```

### Worker Status

```
Worker search-bridge-worker: started with PID 1, version 2.6.0
Worker search-bridge-worker: subscribing to channel rq:pubsub:search-bridge-worker
*** Listening on indexing...
Worker search-bridge-worker: cleaning registries for queue: indexing
```

**Status:** ✅ Worker is running and listening for jobs

### External Services (GPU Machine: steamy-wsl)

| Service | Container | Port Mapping | Status |
|---------|-----------|--------------|--------|
| Qdrant | pulse_qdrant | 52001:6333 | ✅ Healthy |
| TEI | pulse_tei | 52000:80 | ✅ Healthy |
| Ollama | pulse_ollama | 52003:11434 | ⚠️ Unhealthy (not used yet) |

## Files Modified

1. [.env](.env) - Updated Qdrant and TEI URLs with correct ports
2. [apps/webhook/worker_thread.py](apps/webhook/worker_thread.py) - Added signal handler monkeypatch

## Verification Commands

```bash
# Check service health
docker compose exec pulse_webhook curl -s http://localhost:52100/health

# Check worker logs
docker compose logs pulse_webhook --tail 20

# Check external services
ssh steamy-wsl docker ps --filter name=pulse_
```

## Next Steps

### Recommended: Migrate to Separate Worker Container

The current thread-based approach works but has limitations:
- No signal handling for graceful shutdown
- Cannot scale workers independently
- Shares resources with API process

**Implementation:**
```yaml
# docker-compose.yaml
services:
  pulse_webhook_worker:
    image: pulse_webhook:latest
    container_name: pulse_webhook_worker
    command: ["python", "-m", "rq.cli", "worker", "--url", "redis://pulse_redis:6379", "indexing"]
    env_file:
      - .env
    depends_on:
      - pulse_redis
      - pulse_postgres
    networks:
      - firecrawl
    restart: unless-stopped
```

**Benefits:**
- Proper signal handling in main thread
- Scale to multiple workers: `docker compose up -d --scale pulse_webhook_worker=3`
- Independent resource limits and monitoring
- Standard RQ deployment pattern

### Optional: Environment Variable Consolidation

Consider consolidating external service URLs in `.env` to use service discovery:

```bash
# Instead of IP addresses, use Tailscale hostnames
WEBHOOK_QDRANT_URL=http://steamy-wsl:52001
WEBHOOK_TEI_URL=http://steamy-wsl:52000
```

Or create a Docker network overlay if both machines are in the same Docker Swarm.

## Related Documentation

- [Webhook Worker Debug Report](.docs/webhook-worker-debug-2025-11-11.md) - Full analysis
- [External Services Documentation](docs/external-services.md) - GPU service deployment
- [RQ Documentation](https://python-rq.org/) - Background job processing

## Troubleshooting

### If Worker Crashes Again

1. **Check logs:**
   ```bash
   docker compose logs pulse_webhook --tail 50
   ```

2. **Clean stale Redis keys:**
   ```bash
   docker compose exec pulse_redis redis-cli KEYS "rq:worker:*"
   docker compose exec pulse_redis redis-cli DEL "rq:worker:search-bridge-worker"
   ```

3. **Verify external services:**
   ```bash
   curl http://100.74.16.82:52001/collections  # Qdrant
   curl http://100.74.16.82:52000/health       # TEI
   ```

4. **Restart services:**
   ```bash
   docker compose restart pulse_webhook
   ```

### If External Services Are Down

```bash
# Check GPU machine services
ssh steamy-wsl docker ps --filter name=pulse_

# Restart external services
pnpm services:external:restart

# View logs
pnpm services:external:logs
```

## Metrics

**Time to Resolution:** ~18 minutes
- Issue identification: 5 minutes
- URL fixes: 2 minutes
- Worker fix implementation: 8 minutes (2 iterations)
- Redis cleanup: 1 minute
- Verification: 2 minutes

**Services Affected:** 1 (pulse_webhook)
**Downtime:** None (API remained available, only worker affected)
**Data Loss:** None
