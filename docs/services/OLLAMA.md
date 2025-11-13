# Ollama Service Guide

_Last Updated: 01:30 AM EST | Nov 13 2025_

## Role in Pulse
Ollama hosts local LLMs (currently `qwen3:8b-instruct` tuned for entity/relationship extraction) so the webhook worker can convert raw text into graph triples without sending data to external clouds. It runs on the GPU machine alongside TEI and Qdrant.

## Container & Ports
- **Compose file**: `docker-compose.external.yaml`
- **Service / container**: `pulse_ollama`
- **Image**: `ollama/ollama:latest`
- **Host ➜ internal port**: `${OLLAMA_PORT:-52003} ➜ 11434`
- **Network**: attaches to `pulse` so in-cluster services reach it via `http://pulse_ollama:11434` when routed through a Docker context.
- **Health check**: `curl -f http://localhost:11434/api/tags` (30 s interval, 10 s timeout, 3 retries, 30 s start period).

## Configuration & Environment Variables
| Variable | Purpose |
|----------|---------|
| `OLLAMA_PORT` | Host port on the GPU node (default `52003`; avoid conflicts). |
| `OLLAMA_HOST` | Bind address inside the container (default `0.0.0.0:11434`). |
| `WEBHOOK_OLLAMA_URL` | HTTP URL the webhook worker uses (e.g., `http://gpu-machine:52003`). |
| `GPU_DOCKER_CONTEXT` (local dev convention) | Points Docker Compose to the GPU host where this stack runs. |

Ensure `WEBHOOK_OLLAMA_URL` is reachable from the webhook container—usually via Tailscale hostname or LAN IP. Update `.env` and redeploy worker services after changing the URL.

## Models & Data
- Models are stored under `/root/.ollama` (bound to `${APPDATA_BASE}/ollama` per deployment). Keep enough disk space for multi-GB model files.
- Recommended default: `ollama run qwen3:8b-instruct` to pre-pull before the worker requests it.
- Ollama caches prompts/responses; consider purging when swapping models.

## Deployment Workflow
1. Connect to the GPU machine or Docker context (`docker context use gpu`).
2. Export/confirm environment variables in `.env` (shared with main repo via secure sync).
3. Start or update:
   ```bash
   docker compose -f docker-compose.external.yaml up -d pulse_ollama
   ```
4. Verify health:
   ```bash
   docker compose -f docker-compose.external.yaml logs -f pulse_ollama
   curl -sf http://<gpu-host>:52003/api/tags
   ```
5. Confirm the webhook worker can reach it by hitting `WEBHOOK_OLLAMA_URL/api/tags` from inside the worker container.

## Operations & Monitoring
- **Logs**: `docker compose -f docker-compose.external.yaml logs -f pulse_ollama` shows model downloads and request traces.
- **Model management**: Use `ollama list`, `ollama pull`, `ollama rm` either by `docker compose exec pulse_ollama bash` or via the HTTP API (`POST /api/pull`).
- **Throughput**: Monitor GPU utilization with `nvidia-smi` on the host. Tune concurrency by scaling worker requests; Ollama queues internally.

## Failure Modes & Troubleshooting
| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| Requests hang / connection refused | Worker cannot reach GPU host (firewall, VPN down) | Verify `WEBHOOK_OLLAMA_URL` DNS/IP, ensure ports 52003 open, check Tailscale/SSH tunnel. |
| 404 on `/api/generate` | Model not pulled | `docker compose exec pulse_ollama ollama pull qwen3:8b-instruct`. |
| GPU out-of-memory | Multiple concurrent prompts exceed GPU RAM | Reduce request concurrency, switch to smaller model, or enable KV cache offloading when available. |
| Health check fails repeatedly | Container crashed (driver mismatch) | Rebuild host NVIDIA drivers, restart compose stack, ensure `deploy.resources.reservations.devices` is satisfied. |

## Verification Checklist
- `curl -sf http://gpu-host:52003/api/tags` lists installed models.
- Webhook worker logs show successful POSTs to `WEBHOOK_OLLAMA_URL/api/generate` with 200 responses.
- `nvidia-smi` shows utilization spikes when jobs run.

## Related Documentation
- `docs/external-services.md`
- `docs/plans/2025-11-11-knowledge-graph-implementation.md`
- `docs/services/NEO4J.md` (downstream consumer)
- `docs/services/PULSE_WORKER.md`
