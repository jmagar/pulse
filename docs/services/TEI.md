# Text Embeddings Inference (TEI) Service Guide

_Last Updated: 01:30 AM EST | Nov 13 2025_

## Role in Pulse
TEI (Hugging Face Text Embeddings Inference) generates 1024-dimension embeddings (Qwen/Qwen3-Embedding-0.6B) for every document chunk. The webhook worker calls it before pushing vectors into Qdrant. Running TEI on a GPU keeps indexing throughput high while staying self-hosted.

## Container & Ports
- **Compose file**: `docker-compose.external.yaml`
- **Service / container**: `pulse_tei`
- **Image**: `ghcr.io/huggingface/text-embeddings-inference:latest`
- **Host ➜ internal port**: `${TEI_HTTP_PORT:-52000} ➜ 80`
- **GPU**: Requests one NVIDIA GPU via Docker `deploy.resources.reservations`
- **Health check**: `curl -f http://localhost:80/health` (30 s interval, 10 s timeout, 3 retries, 20 s start period)

## Configuration
Key arguments passed through the compose command:
- `--model-id ${TEI_EMBEDDING_MODEL:-Qwen/Qwen3-Embedding-0.6B}`
- `--dtype float16` (GPU-optimized)
- `--max-concurrent-requests`, `--max-batch-tokens`, `--max-batch-requests`, `--max-client-batch-size`
- `--pooling ${TEI_POOLING:-last-token}`
- `--tokenization-workers`, `--auto-truncate`
- `--default-prompt` customized for search relevance hints

Tune these via `.env` to balance latency vs. throughput.

## Environment Variables
- `TEI_HTTP_PORT` – Host-mapped port (default 52000)
- `TEI_EMBEDDING_MODEL` – HF model ID
- `TEI_MAX_CONCURRENT_REQUESTS`, `TEI_MAX_BATCH_TOKENS`, etc. – performance knobs
- `WEBHOOK_TEI_URL` – URL the webhook worker calls (e.g., `http://gpu-host:52000`)

## Deployment Workflow
1. Switch Docker context to the GPU host.
2. Pull latest image (optional): `docker compose -f docker-compose.external.yaml pull pulse_tei`.
3. Start service: `docker compose -f docker-compose.external.yaml up -d pulse_tei`.
4. Verify health: `curl -sf http://<gpu-host>:52000/health`.
5. From webhook worker container, test connectivity: `curl -sf $WEBHOOK_TEI_URL/health`.
6. Document deployment in `.docs/deployment-log.md`.

## Operations & Monitoring
- **Logs**: `docker compose -f docker-compose.external.yaml logs -f pulse_tei` show request timings and batching behavior.
- **Throughput**: TEI reports tokens/sec in logs; watch for throttling warnings.
- **GPU usage**: `nvidia-smi` on host should show TEI process with consistent memory use (~4–6 GB for Qwen3 embedding model).
- **Scaling**: Increase `max-concurrent-requests` gradually; ensure gRPC/HTTP clients keep within GPU memory limits.

## Failure Modes & Troubleshooting
| Symptom | Cause | Resolution |
|---------|-------|-----------|
| `/health` returns 503 | Model failed to load (insufficient GPU memory) | Use smaller model or free GPU memory, then restart container. |
| Worker logs `Embedding service unavailable` | Network/firewall issue between webhook worker and GPU host | Verify `WEBHOOK_TEI_URL`, check Tailscale/VPN status, ensure port 52000 open. |
| High latency | Batch settings too low/high | Tune `TEI_MAX_BATCH_TOKENS`, `TEI_MAX_CONCURRENT_REQUESTS`. |
| Crashes with CUDA errors | Driver mismatch | Update NVIDIA drivers or container base to match host CUDA version. |

## Verification Checklist
- `curl -sf http://gpu-host:52000/health` returns `{ "status": "ok" }`.
- Webhook worker indexing logs show `embedding_ms` within expected range (<500 ms typical).
- Qdrant receives new vectors after embedding step completes.

## Related Documentation
- `docs/external-services.md`
- `docs/services/QDRANT.md`
- `docs/services/PULSE_WEBHOOK.md`
- `docs/services/PULSE_WORKER.md`
