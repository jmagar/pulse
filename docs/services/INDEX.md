# Pulse Services Index

_Last Updated: 02:17 AM EST | Nov 13 2025_

This index is the front door to every service that powers Pulse. Use it to jump to detailed guides, verify port assignments, and understand how each container fits into the NotebookLM-style experience.

## How to Read This Index
- **Ports & networking:** Refer to [`PORTS.md`](./PORTS.md) for the authoritative mapping of host ↔ container ports.
- **Service deep-dives:** Each entry below links to its own doc covering architecture, env vars, storage, deployment steps, and troubleshooting.
- **Deployment logs:** Record every rollout (date, port, notes) in `.docs/deployment-log.md` per lifecycle rules.

## Quick Reference Table
| Layer | Service | Doc | Compose Name | Host ➜ Internal Ports | Summary |
|-------|---------|-----|--------------|-----------------------|---------|
| Core | Playwright | [PLAYWRIGHT](./PLAYWRIGHT.md) | `pulse_playwright` | 50100 ➜ 3000 | Shared Chromium cluster for Firecrawl + changedetection rendering. |
| Core | Firecrawl API | [FIRECRAWL](./FIRECRAWL.md) | `firecrawl` | 50102 ➜ 3002 | Scraping/crawling engine backing MCP + webhook worker. |
| Core | Redis | [REDIS](./REDIS.md) | `pulse_redis` | 50104 ➜ 6379 | Queue + rate limiting backend. |
| Core | PostgreSQL | [POSTGRES](./POSTGRES.md) | `pulse_postgres` | 50105 ➜ 5432 | Primary relational store (Firecrawl + webhook). |
| Core | MCP Server | [PULSE_MCP](./PULSE_MCP.md) | `pulse_mcp` | 50107 ➜ 3060 | Claude MCP interface exposing scrape/crawl/map/search tools. |
| Core | Webhook API | [PULSE_WEBHOOK](./PULSE_WEBHOOK.md) | `pulse_webhook` | 50108 ➜ 52100 | Hybrid search + webhook ingestion service. |
| Core | Webhook Worker | [PULSE_WORKER](./PULSE_WORKER.md) | `pulse_webhook-worker` | — | Dedicated RQ worker (no HTTP port). |
| Core | changedetection.io | [CHANGEDETECTION](./CHANGEDETECTION.md) | `pulse_change-detection` | 50109 ➜ 5000 | Watcher that triggers rescrapes when sources change. |
| Core (Planned) | Web UI | [PULSE_WEB](./PULSE_WEB.md) | `pulse_web` | 50110 ➜ 3000 | Next.js NotebookLM clone (currently scaffold stage). |
| Core | Neo4j | [NEO4J](./NEO4J.md) | `pulse_neo4j` | 50210 ➜ 7474, 50211 ➜ 7687 | Graph DB for knowledge graph features. |
| GPU | TEI | [TEI](./TEI.md) | `pulse_tei` | 52000 ➜ 80 | HuggingFace Text Embeddings Inference (GPU). |
| GPU | Qdrant | [QDRANT](./QDRANT.md) | `pulse_qdrant` | 52001 ➜ 6333, 52002 ➜ 6334 | Vector store for embeddings. |
| GPU | Ollama | [OLLAMA](./OLLAMA.md) | `pulse_ollama` | 52003 ➜ 11434 | Local LLM inference for graph enrichment. |

## Primary Host Stack (docker-compose.yaml)
Each service above the GPU section runs on the main host. Use `pnpm dev`, `pnpm dev:web`, or `docker compose up -d <service>` to start only what you need. Consult the individual docs for env requirements and health checks before exposing services publicly.

Highlights:
- **Playwright → Firecrawl → Webhook** form the ingestion pipeline (render → scrape → index/search).
- **MCP Server** is how Claude interacts with Firecrawl and the webhook search index.
- **changedetection.io** closes the loop by re-scraping sources as soon as they drift.
- **Web UI** will eventually sit on `pulse_web` and talk to MCP/Webhook/Firecrawl using the new `NEXT_PUBLIC_*` endpoints.

## External GPU Stack (docker-compose.external.yaml)
TEI, Qdrant, and Ollama run on a GPU-capable host for performance and isolation.

### Deploying to the GPU Host
1. **Create a Docker context** (run once):
   ```bash
   docker context create gpu --docker "host=ssh://user@gpu-host"
   docker context use gpu
   ```
2. **Launch services** via helper scripts:
   ```bash
   pnpm services:external:up        # start TEI + Qdrant + Ollama
   pnpm services:external:ps        # status
   pnpm services:external:logs      # tail logs
   pnpm services:external:down      # stop
   ```
   (Alternatively run `docker --context gpu compose -f docker-compose.external.yaml up -d`.)
3. **Expose URLs** in `.env` so the host stack can reach them:
   ```bash
   WEBHOOK_TEI_URL=http://tailscale-hostname:52000
   WEBHOOK_QDRANT_URL=http://tailscale-hostname:52001
   WEBHOOK_OLLAMA_URL=http://tailscale-hostname:52003
   ```
4. **Verify health** from the host stack:
   ```bash
   curl $WEBHOOK_TEI_URL/health
   curl $WEBHOOK_QDRANT_URL/collections
   curl $WEBHOOK_OLLAMA_URL/api/tags
   ```

### Troubleshooting
- **Context errors:** Recreate the Docker context or confirm SSH connectivity (`ssh user@gpu-host 'docker ps'`).
- **GPU allocation failures:** Ensure NVIDIA drivers match the container runtime (`docker --context gpu run --rm --gpus all nvidia/cuda:12.0-base nvidia-smi`).
- **Firewall issues:** Open TCP 52000-52003 on the GPU host or route traffic through Tailscale.

## Related References
- [`PORTS.md`](./PORTS.md) – Port charter & reserved ranges.
- `.env.example` – Shared environment variables for every service.
- `.docs/deployment-log.md` – Mandatory deployment journal.
- `docs/ARCHITECTURE_DIAGRAM.md` – Visual flow of service interactions.

Keep this index in sync whenever a new service is added, renamed, or decommissioned.
