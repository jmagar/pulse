# Webhook Search Bridge (pulse_webhook)

_Last Updated: 01:30 AM EST | Nov 13 2025_

## Role in Pulse
`pulse_webhook` ingests scrape payloads from Firecrawl, processes change notifications, and exposes a hybrid search API (vector + BM25 + RRF). It owns the webhook endpoints, indexing pipeline, search orchestration, and operational metrics.

## Container & Ports
- **Compose service / container**: `pulse_webhook`
- **Build**: `apps/webhook/Dockerfile` (uv-based FastAPI app)
- **Host ➜ internal port**: `${WEBHOOK_PORT:-50108} ➜ 52100`
- **Volumes**: `${APPDATA_BASE:-/mnt/cache/appdata}/pulse_webhook:/app/data/bm25` (BM25 index and metadata)
- **Environment override**: `WEBHOOK_ENABLE_WORKER="false"` when using the standalone worker container.
- **Health check**: `curl -f http://localhost:52100/health` (30 s interval, 10 s timeout, 3 retries, 40 s start period).

## Critical Environment Variables
| Category | Variables |
|----------|-----------|
| **Server** | `WEBHOOK_HOST`, `WEBHOOK_PORT`, `WEBHOOK_CORS_ORIGINS`, `WEBHOOK_LOG_LEVEL`, `WEBHOOK_ENABLE_WORKER` |
| **Auth** | `WEBHOOK_API_SECRET`, `WEBHOOK_SECRET`, `WEBHOOK_TEST_MODE`, `WEBHOOK_RATE_LIMIT_*` |
| **Storage** | `WEBHOOK_DATABASE_URL`, `WEBHOOK_REDIS_URL`, `WEBHOOK_QDRANT_URL`, `WEBHOOK_TEI_URL`, `WEBHOOK_QDRANT_COLLECTION`, `WEBHOOK_VECTOR_DIM` |
| **Indexing** | `WEBHOOK_MAX_CHUNK_TOKENS`, `WEBHOOK_CHUNK_OVERLAP_TOKENS`, `WEBHOOK_HYBRID_ALPHA`, `WEBHOOK_BM25_*`, `WEBHOOK_RRF_K`, `WEBHOOK_EMBEDDING_MODEL` |
| **Integrations** | `WEBHOOK_FIRECRAWL_API_URL`, `WEBHOOK_FIRECRAWL_API_KEY`, `WEBHOOK_CHANGEDETECTION_*`, `WEBHOOK_OLLAMA_URL`, `WEBHOOK_NEO4J_URL/USERNAME/PASSWORD` |

See `.env.example` for defaults and required lengths (API secrets must be ≥32 chars in production). Update `.env`, then restart `pulse_webhook` (+ worker) after any change.

## Dependencies & Networking
- **Redis (`pulse_redis`)** – rate limiting, job queue
- **PostgreSQL (`pulse_postgres`)** – metrics + webhook event storage
- **Firecrawl (`firecrawl`)** – rescrape client
- **Qdrant / TEI / Ollama / Neo4j** – external GPU services defined in `docker-compose.external.yaml`
- **changedetection.io** – triggers rescrapes through `/api/webhook/changedetection`
- Runs on the `pulse` Docker network so it can reach these services via container DNS names.

## Deployment Workflow
1. Apply database migrations: `cd apps/webhook && uv run alembic upgrade head` (run once per schema change).
2. Build image if code changed: `docker compose build pulse_webhook`.
3. Start API + worker: `docker compose up -d pulse_webhook pulse_webhook-worker` (or set `WEBHOOK_ENABLE_WORKER=true` to embed worker for dev-only usage).
4. Verify health: `curl -sf http://localhost:50108/health`.
5. Hit `/api/search` with a test token to confirm search results.
6. Log deployment details (timestamp, port, notes) in `.docs/deployment-log.md`.

## Operations & Monitoring
- **Logs**: `docker compose logs -f pulse_webhook` (structured JSON). Filter by `router`, `job`, or `duration_ms`.
- **Metrics endpoints**: `/api/metrics/requests`, `/api/metrics/operations`, `/api/stats` for quick observability (requires `WEBHOOK_API_SECRET`).
- **Database insights**: Tables `webhook.request_metrics`, `webhook.operation_metrics`, `webhook.change_events` store historical timing data.
- **Rate limiting**: Configurable via env; use Redis to inspect counters/prefix `rate-limit:*`.

## Failure Modes & Troubleshooting
| Symptom | Likely Cause | Resolution |
|---------|--------------|------------|
| `/health` returns 503 | Downstream dependency (Redis, PostgreSQL, Qdrant, TEI) unavailable | Check logs; fix dependency first. |
| `401 Unauthorized` on APIs | Missing/incorrect `Authorization: Bearer <WEBHOOK_API_SECRET>` header | Ensure secrets match `.env`. |
| Indexing jobs stuck pending | Worker disabled or Redis unreachable | Confirm `WEBHOOK_ENABLE_WORKER` value, ensure `pulse_webhook-worker` running, inspect Redis connection. |
| `Embedding service unavailable` errors | TEI endpoint not reachable (GPU machine offline) | Restart TEI container or update `WEBHOOK_TEI_URL`. |
| `QdrantServiceError` | Qdrant gRPC/HTTP offline | Verify GPU compose stack, check firewalls. |

## Verification Checklist
- `curl -sf http://localhost:50108/health` shows all dependency checks `ok`.
- POST to `/api/search` returns fused results for sample query.
- Webhook payload from Firecrawl (curl or MCP run) is accepted (`202 Accepted`) and job enqueued in Redis.
- changedetection webhook hits `/api/webhook/changedetection` and logs `ChangeDetected`.

## Related Documentation
- `apps/webhook/README.md`
- `docs/services/PULSE_WORKER.md`
- `docs/services/FIRECRAWL.md`, `docs/services/CHANGEDETECTION.md`
- `docs/services/QDRANT.md`, `docs/services/TEI.md`, `docs/services/OLLAMA.md`, `docs/services/NEO4J.md`
- `docs/services/webhook/*` (detailed architecture, routing, tests)
