# Webhook Worker Debug Report

**Date:** 2025-11-11
**Time:** 14:32:37 UTC
**Service:** pulse_webhook

## Executive Summary

The webhook worker has **three critical failures** preventing it from processing jobs:

1. **Worker Thread Crash** (CRITICAL): RQ worker cannot install signal handlers in a thread
2. **Qdrant Connection Failure**: Vector database service not running
3. **TEI 502 Bad Gateway**: Text Embeddings Inference service not accessible

## Issue 1: Worker Thread Signal Handler Crash (CRITICAL)

### Symptoms

```
2025-11-11T14:32:37.976378Z [error] Worker thread crashed
Traceback (most recent call last):
  File "/app/worker_thread.py", line 93, in _run_worker
    self._worker.work(with_scheduler=False)
  File "/usr/local/lib/python3.13/site-packages/rq/worker.py", line 583, in work
    self._install_signal_handlers()
  File "/usr/local/lib/python3.13/site-packages/rq/worker.py", line 535, in _install_signal_handlers
    signal.signal(signal.SIGINT, self.request_stop)
ValueError: signal only works in main thread of the main interpreter
```

### Root Cause

The RQ `Worker` class attempts to install signal handlers (SIGINT, SIGTERM) to handle graceful shutdown. Python's `signal.signal()` function **only works in the main thread** of the main interpreter.

Current architecture ([worker_thread.py:73-93](apps/webhook/worker_thread.py#L73-L93)):
- FastAPI runs in the main thread
- RQ worker runs in a background `threading.Thread` (line 44-48)
- RQ's `Worker.work()` calls `_install_signal_handlers()` (line 93)
- Signal installation fails because we're in a background thread

### Solution Options

#### Option A: Use Multiprocessing (Recommended)

Replace `threading.Thread` with `multiprocessing.Process`. This gives the worker its own main thread where signals work.

**Pros:**
- Clean separation of concerns
- Worker gets its own Python interpreter
- Signals work correctly
- Better isolation (crashes don't affect API)

**Cons:**
- Cannot share memory between API and worker
- Must use Redis for all communication
- Slightly higher overhead

**Implementation:**
```python
# worker_thread.py
import multiprocessing

class WorkerProcessManager:
    def __init__(self) -> None:
        self._process: multiprocessing.Process | None = None
        self._running: multiprocessing.Event = multiprocessing.Event()

    def start(self) -> None:
        self._running.set()
        self._process = multiprocessing.Process(
            target=self._run_worker,
            name="rq-worker",
            daemon=False,  # Allow graceful shutdown
        )
        self._process.start()
        logger.info("Worker process started", pid=self._process.pid)

    def stop(self) -> None:
        self._running.clear()
        if self._process and self._process.is_alive():
            self._process.terminate()
            self._process.join(timeout=10.0)
            if self._process.is_alive():
                self._process.kill()

    def _run_worker(self) -> None:
        # Signal handlers will work here - we're in the main thread of this process
        redis_conn = get_redis_connection()
        worker = Worker(queues=["indexing"], connection=redis_conn)
        worker.work(with_scheduler=False)
```

#### Option B: Disable Signal Handlers

Tell RQ not to install signal handlers using `install_signal_handlers=False`.

**Pros:**
- Minimal code change
- Keeps threading architecture

**Cons:**
- No graceful shutdown handling
- Worker may leave jobs in inconsistent state on shutdown
- Not recommended for production

**Implementation:**
```python
# worker_thread.py line 93
self._worker.work(with_scheduler=False, install_signal_handlers=False)
```

#### Option C: Run Worker as Separate Container (Best for Production)

Deploy worker as a separate Docker container with its own entrypoint.

**Pros:**
- Full signal handling support
- Independent scaling (run N workers)
- Better resource isolation
- Industry standard pattern

**Cons:**
- More complex deployment
- Requires changes to docker-compose.yaml

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
```

### Recommended Solution

**Short-term:** Option B (disable signal handlers) to unblock development
**Long-term:** Option C (separate container) for production robustness

## Issue 2: Qdrant Connection Failure

### Symptoms

```
2025-11-11T14:32:37.971719Z [error] Failed to ensure collection error='All connection attempts failed'
2025-11-11T14:32:38.969910Z [error] Qdrant health check failed error='All connection attempts failed'
```

### Root Cause

Qdrant service is **not running** in the main docker-compose stack. It's defined in [docker-compose.external.yaml](docker-compose.external.yaml#L59-L73) for GPU deployment.

**Environment Configuration:**
```bash
# .env
WEBHOOK_QDRANT_URL=http://100.74.16.82:6333  # External GPU machine
```

### Verification

```bash
$ docker ps --format "table {{.Names}}\t{{.Status}}" | grep qdrant
# No output - service not running locally
```

### Solution

Deploy external services to GPU machine using Docker context:

```bash
# Check if gpu-machine context exists
docker context ls | grep gpu-machine

# Deploy external services
pnpm services:external:up

# Verify deployment
pnpm services:external:ps

# Check health
curl http://100.74.16.82:52001/collections
```

**Alternative (Local Development):**

If GPU machine is not available, run Qdrant locally:

```yaml
# docker-compose.yaml - add service
services:
  pulse_qdrant:
    image: qdrant/qdrant:latest
    container_name: pulse_qdrant
    ports:
      - "52001:6333"
    volumes:
      - qdrant_data:/qdrant/storage
    networks:
      - firecrawl

volumes:
  qdrant_data:
```

```bash
# .env - update URL
WEBHOOK_QDRANT_URL=http://pulse_qdrant:6333
```

## Issue 3: TEI 502 Bad Gateway

### Symptoms

```
HTTP Request: GET https://tei.tootie.tv/health "HTTP/1.1 502 Bad Gateway"
2025-11-11T14:32:39.075368Z [info] Health check completed services={'redis': 'healthy', 'qdrant': 'unhealthy', 'tei': 'unhealthy'} status=degraded
```

### Root Cause

The TEI service at `https://tei.tootie.tv` is returning 502 Bad Gateway. This could be:

1. **Reverse proxy issue**: nginx/Caddy misconfigured or down
2. **TEI container not running**: Service crashed or never started
3. **Network issue**: GPU machine unreachable

**Environment Configuration:**
```bash
# .env
WEBHOOK_TEI_URL=https://tei.tootie.tv  # External HTTPS endpoint
```

### Troubleshooting Steps

**1. Check if TEI container is running on GPU machine:**

```bash
docker --context gpu-machine ps | grep tei
# Should show: pulse_tei running

# If not running, check logs
docker --context gpu-machine logs pulse_tei
```

**2. Check internal container health:**

```bash
docker --context gpu-machine exec pulse_tei curl localhost:80/health
# Should return: {"status":"ok"}
```

**3. Check port exposure:**

```bash
# From GPU machine
curl http://localhost:52000/health

# From webhook machine (100.74.16.82 is GPU machine)
curl http://100.74.16.82:52000/health
```

**4. Check reverse proxy:**

```bash
# If using nginx/Caddy for https://tei.tootie.tv
curl -v https://tei.tootie.tv/health

# Check proxy logs for 502 errors
# nginx: /var/log/nginx/error.log
# Caddy: docker logs <caddy-container>
```

### Solution

**Option 1: Fix Reverse Proxy**

If using Caddy/nginx, ensure it's forwarding to the correct backend:

```caddyfile
# Caddyfile
tei.tootie.tv {
    reverse_proxy 127.0.0.1:52000
}
```

**Option 2: Use Direct HTTP**

Bypass HTTPS and connect directly:

```bash
# .env
WEBHOOK_TEI_URL=http://100.74.16.82:52000  # Direct HTTP access
```

**Option 3: Deploy TEI Service**

If service is not running:

```bash
# Deploy external services
pnpm services:external:up

# Check TEI specifically
docker --context gpu-machine logs pulse_tei
```

## Health Check Summary

Current service status from logs:

| Service | Status | Issue |
|---------|--------|-------|
| Redis | ✅ Healthy | Connected successfully |
| Qdrant | ❌ Unhealthy | Service not running |
| TEI | ❌ Unhealthy | 502 Bad Gateway |
| Worker | ❌ Crashed | Signal handler error |

## Immediate Action Plan

### Phase 1: Unblock Worker (5 minutes)

1. **Disable signal handlers** in [worker_thread.py:93](apps/webhook/worker_thread.py#L93):
   ```python
   self._worker.work(with_scheduler=False, install_signal_handlers=False)
   ```

2. **Restart webhook service:**
   ```bash
   docker compose restart pulse_webhook
   ```

3. **Verify worker starts:**
   ```bash
   docker compose logs pulse_webhook | grep "Worker initialized"
   ```

### Phase 2: Deploy External Services (10 minutes)

1. **Verify Docker context exists:**
   ```bash
   docker context ls | grep gpu-machine
   ```

2. **Deploy services:**
   ```bash
   pnpm services:external:up
   ```

3. **Verify deployment:**
   ```bash
   pnpm services:external:ps
   curl http://100.74.16.82:52000/health  # TEI
   curl http://100.74.16.82:52001/collections  # Qdrant
   ```

### Phase 3: Verify Integration (5 minutes)

1. **Check health endpoint:**
   ```bash
   curl http://localhost:52100/health
   ```

   Should show:
   ```json
   {
     "services": {
       "redis": "healthy",
       "qdrant": "healthy",
       "tei": "healthy"
     },
     "status": "healthy"
   }
   ```

2. **Test job processing:**
   ```bash
   # Submit test job via API
   curl -X POST http://localhost:52100/api/index \
     -H "Content-Type: application/json" \
     -d '{"url": "https://example.com", "content": "test"}'

   # Check worker logs
   docker compose logs pulse_webhook | grep "Processing job"
   ```

## Long-Term Recommendations

### 1. Worker Architecture

**Current:** Thread-based worker in API process
**Recommended:** Separate worker container(s)

Benefits:
- Proper signal handling
- Independent scaling
- Better resource isolation
- Standard RQ deployment pattern

### 2. Service Discovery

**Current:** Hardcoded IPs in .env
**Recommended:** Use Docker network DNS

For external services on same Docker network:
```bash
# Instead of: http://100.74.16.82:6333
# Use: http://pulse_qdrant:6333
```

For external GPU machine, consider:
- Tailscale for secure mesh networking
- Docker Swarm with overlay networks
- Service mesh (Consul, Linkerd)

### 3. Health Checks

**Current:** Degraded mode on service failure
**Recommended:**
- Fail startup if critical services unavailable
- Implement circuit breakers for external services
- Add retry logic with exponential backoff
- Health check alerts/monitoring

### 4. Development vs Production

Create separate configurations:

```yaml
# docker-compose.dev.yaml - everything local
services:
  pulse_qdrant:
    image: qdrant/qdrant:latest
    # ... local config

  pulse_tei:
    image: ghcr.io/huggingface/text-embeddings-inference:cpu
    # ... CPU-only for dev

# docker-compose.prod.yaml - external services
services:
  pulse_webhook:
    environment:
      WEBHOOK_QDRANT_URL: http://gpu-machine:6333
      WEBHOOK_TEI_URL: http://gpu-machine:52000
```

## Files Referenced

- [apps/webhook/worker_thread.py](apps/webhook/worker_thread.py) - Worker thread manager
- [apps/webhook/main.py](apps/webhook/main.py) - FastAPI application
- [apps/webhook/config.py](apps/webhook/config.py) - Configuration settings
- [docker-compose.external.yaml](docker-compose.external.yaml) - External GPU services
- [docs/external-services.md](docs/external-services.md) - Deployment guide
- [.env](.env) - Environment configuration

## References

- RQ Documentation: https://python-rq.org/
- Python Signal Handling: https://docs.python.org/3/library/signal.html
- Docker Contexts: https://docs.docker.com/engine/context/working-with-contexts/
- Qdrant Documentation: https://qdrant.tech/documentation/
- TEI Documentation: https://github.com/huggingface/text-embeddings-inference
