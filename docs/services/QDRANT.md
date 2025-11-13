# Qdrant Vector Database Service Guide

_Last Updated: 01:30 AM EST | Nov 13 2025_

## Role in Pulse
Qdrant stores semantic embeddings generated from scraped content. Hybrid search combines these vectors with BM25 rankings to deliver relevant results. The webhook worker writes to Qdrant during indexing, and the API reads from it on every `/api/search` request.

## Container & Ports
- **Compose file**: `docker-compose.external.yaml`
- **Service / container**: `pulse_qdrant`
- **Image**: `qdrant/qdrant:gpu-nvidia-latest`
- **Host ➜ internal ports**: `${QDRANT_HTTP_PORT:-52001} ➜ 6333` (HTTP), `${QDRANT_GRPC_PORT:-52002} ➜ 6334` (gRPC)
- **Health check**: Custom `readyz` HTTP probe every 30 s (10 s timeout, 3 retries, 40 s start period).

## Configuration & Environment
| Variable | Purpose |
|----------|---------|
| `QDRANT_HTTP_PORT` / `QDRANT_GRPC_PORT` | Host ports reachable from the primary stack (defaults 52001/52002). |
| `WEBHOOK_QDRANT_URL` | HTTP endpoint used by the webhook service (`http://gpu-host:52001`). |
| `WEBHOOK_QDRANT_GRPC_URL` (future) | For gRPC ingestion if enabled. |
| `WEBHOOK_QDRANT_COLLECTION` | Default collection name (currently `pulse_docs`). |
| `WEBHOOK_VECTOR_DIM` | Embedding dimensionality (`1024` for Qwen3). |

Store these in `.env`; update both GPU and primary hosts when ports change.

## Data & Storage
- **Volume**: `/home/jmagar/appdata/qdrant:/qdrant/storage` (per external compose). Adjust path per deployment.
- Backups: replicate the storage directory or use Qdrant snapshots (`POST /collections/{collection}/snapshots`).
- Retention: Clean up old collections using Qdrant API when schema changes.

## Deployment Workflow
1. Switch to GPU Docker context.
2. Start service: `docker compose -f docker-compose.external.yaml up -d pulse_qdrant`.
3. Verify health:
   ```bash
   docker compose -f docker-compose.external.yaml logs -f pulse_qdrant
   curl -sf http://<gpu-host>:52001/readyz
   ```
4. Ensure the collection exists:
   ```bash
   curl http://<gpu-host>:52001/collections | jq
   ```
5. Record deployment details in `.docs/deployment-log.md`.

## Operations & Monitoring
- **HTTP API**: `GET /collections`, `GET /collections/{name}/points/count`, etc.
- **gRPC**: Use for high-throughput ingestion if we switch from HTTP.
- **Logs**: `docker compose -f docker-compose.external.yaml logs -f pulse_qdrant`.
- **Resource usage**: Monitor disk (`du -sh /home/.../qdrant`) and GPU (if Qdrant GPU features used).

## Failure Modes & Troubleshooting
| Symptom | Cause | Fix |
|---------|-------|-----|
| Webhook search returns `QdrantServiceError` | Endpoint unreachable | Ensure GPU machine accessible, ports open, container running. |
| Slow vector queries | Collection not indexed or filtering too broad | Recreate indexes, review payload filters, consider gRPC ingestion + quantization. |
| `collection not found` errors | Collection deleted or renamed | Recreate via API, update env var, rerun indexing. |
| Disk full at `/qdrant/storage` | Large vector dataset | Expand disk, prune unused points, enable snapshots then delete stale data. |

## Verification Checklist
- `curl http://gpu-host:52001/collections` lists `pulse_docs` with expected vector size (`1024`).
- Webhook `/api/search` returns semantic results; logs show successful Qdrant queries.
- Worker indexing job indicates `indexed_to_qdrant=true`.

## Related Documentation
- `docs/external-services.md`
- `docs/services/TEI.md`
- `docs/services/PULSE_WEBHOOK.md`
- `docs/services/PULSE_WORKER.md`
