# Pulse Services Port Allocation

Authoritative map of every service, container, and port exposed by the Pulse stack. Source of truth verified against `docker-compose.yaml` and `docker-compose.external.yaml` before this update.

_Last Updated: 01:10 AM EST | Nov 13 2025_

## Overview
- Core host services occupy the 50100–50109 range, with Neo4j reserved at 50210/50211 for clarity.
- GPU-backed services (TEI, Qdrant, Ollama) live on a separate machine in the 52000–52003 range.
- Every service must document its assigned port here before launch to prevent collisions and to satisfy the lifecycle policy (custom high-numbered, sequential ports, no defaults).

## Primary Host Services (`docker-compose.yaml`)
| Host Port ➜ Internal | Service | Container | Protocol | Purpose / Notes |
|----------------------|---------|-----------|----------|-----------------|
| 50100 ➜ 3000 | [Playwright Service](./PLAYWRIGHT.md) | `pulse_playwright` | HTTP | Headless browser automation used by Firecrawl and changedetection to render dynamic sites. |
| 50102 ➜ 3002 | [Firecrawl API](./FIRECRAWL.md) | `firecrawl` | HTTP | Main scraping/orchestration API; depends on Redis, PostgreSQL, and Playwright. |
| 50104 ➜ 6379 | [Redis](./REDIS.md) | `pulse_redis` | Redis | Shared cache + job queue backend (RQ) with persistent volume `${APPDATA_BASE}/pulse_redis`. |
| 50105 ➜ 5432 | [PostgreSQL](./POSTGRES.md) | `pulse_postgres` | Postgres | Primary relational database for Firecrawl + webhook metrics, stored at `${APPDATA_BASE}/pulse_postgres`. |
| 50107 ➜ 3060 | [MCP Server](./PULSE_MCP.md) | `pulse_mcp` | HTTP | Claude MCP server; volume `${APPDATA_BASE}/pulse_mcp/resources`. Health check hits `/health`. |
| 50108 ➜ 52100 | [Webhook Bridge API](./PULSE_WEBHOOK.md) | `pulse_webhook` | HTTP | FastAPI search/indexer; BM25 artifacts in `${APPDATA_BASE}/pulse_webhook`. `WEBHOOK_ENABLE_WORKER` disabled when external worker is running. |
| 50109 ➜ 5000 | [changedetection.io](./CHANGEDETECTION.md) | `pulse_change-detection` | HTTP | Monitors URLs for diffs, triggers webhook callbacks to `pulse_webhook`. Shares Playwright. |
| 50210 ➜ 7474 | [Neo4j HTTP](./NEO4J.md) | `pulse_neo4j` | HTTP | Browser/UI endpoint for the graph database. Volume set under `${APPDATA_BASE}/pulse_neo4j`. |
| 50211 ➜ 7687 | [Neo4j Bolt](./NEO4J.md) | `pulse_neo4j` | Bolt | Binary driver endpoint for graph queries. |
| 50110 ➜ 3000 | [Web UI (NotebookLM clone)](./PULSE_WEB.md) | `pulse_web` | HTTP | Planned Next.js app delivering the NotebookLM-style interface; exposed via custom host port instead of 3000. |
| — (no host port) | [Webhook Worker](./PULSE_WORKER.md) | `pulse_webhook-worker` | N/A | Dedicated RQ worker container pulling jobs from `redis://pulse_redis:6379`; no network listener. |

> **Unused host ports 50101, 50103, and 50106 remain reserved** for future Firecrawl sidecars; keep them free until a new service is registered in this document.

## Internal Service Endpoints (Docker network `pulse`)
- Playwright: `http://pulse_playwright:3000`
- Firecrawl API: `http://firecrawl:3002`
- Redis: `redis://pulse_redis:6379`
- PostgreSQL: `postgresql://pulse_postgres:5432/pulse_postgres`
- MCP Server: `http://pulse_mcp:3060`
- Webhook Bridge API: `http://pulse_webhook:52100`
- Webhook Worker: consumes `redis://pulse_redis:6379` queue `indexing` (no HTTP endpoint)
- changedetection.io: `http://pulse_change-detection:5000`
- Neo4j HTTP: `http://pulse_neo4j:7474`
- Neo4j Bolt: `bolt://pulse_neo4j:7687`
- Web UI: `http://pulse_web:3000` (will become available once container is added)

## Host Access URLs
- Playwright: `http://localhost:50100`
- Firecrawl API: `http://localhost:50102`
- Redis: `redis://localhost:50104`
- PostgreSQL: `postgresql://localhost:50105/pulse_postgres`
- MCP Server: `http://localhost:50107`
- Webhook Bridge: `http://localhost:50108`
- changedetection.io: `http://localhost:50109`
- Neo4j HTTP: `http://localhost:50210`
- Neo4j Bolt: `bolt://localhost:50211`
- Web UI: `http://localhost:50110`

## External GPU Services (`docker-compose.external.yaml`)
| Host Port ➜ Internal | Service | Container | Protocol | Notes |
|----------------------|---------|-----------|----------|-------|
| 52000 ➜ 80 | [Text Embeddings Inference (TEI)](./TEI.md) | `pulse_tei` | HTTP | HuggingFace TEI serving `${TEI_EMBEDDING_MODEL}`; requires GPU. |
| 52001 ➜ 6333 | [Qdrant HTTP](./QDRANT.md) | `pulse_qdrant` | HTTP | Vector DB HTTP API (`pulse_docs` collection, 1024 dims). |
| 52002 ➜ 6334 | [Qdrant gRPC](./QDRANT.md) | `pulse_qdrant` | gRPC | High-throughput ingestion/search channel. |
| 52003 ➜ 11434 | [Ollama](./OLLAMA.md) | `pulse_ollama` | HTTP | Local LLM inference (e.g., `qwen3:8b-instruct`). |

All external services join the same `pulse` network for DNS-based access from the primary stack (e.g., `http://pulse_qdrant:6333`).

## Service Notes
### Firecrawl API (`firecrawl`)
- Launches via `node dist/src/harness.js --start-docker`.
- Requires Redis, PostgreSQL, and Playwright healthy before startup (`depends_on` enforced in compose).
- Health determined via successful HTTP request to `firecrawl:3002/health` (manual check).

### MCP Server (`pulse_mcp`)
- Builds from `apps/mcp/Dockerfile` with repo root context for shared packages.
- OAuth endpoints share the same 50107 port when `MCP_ENABLE_OAUTH=true` and require `MCP_REDIS_URL` for session storage.

### Webhook Bridge (`pulse_webhook`) & Worker (`pulse_webhook-worker`)
- API container runs FastAPI app on 52100 with `/health` healthcheck.
- Worker container runs `rq worker indexing --url redis://pulse_redis:6379`; no HTTP listener or host port mapping.
- BM25 index persisted under `/app/data/bm25`, huggingface cache under `/app/.cache/huggingface` (worker only).

### changedetection.io (`pulse_change-detection`)
- Polls monitored URLs using Playwright, stores history in `${APPDATA_BASE}/pulse_change-detection`.
- Healthcheck performs Python urllib GET against `http://localhost:5000/` every 60s.
- Sends POSTs to `http://pulse_webhook:52100/api/webhook/changedetection` on diffs.

### Neo4j (`pulse_neo4j`)
- Uses image `neo4j:2025.10.1-community-bullseye`.
- Healthcheck: `wget -q --spider http://localhost:7474` (10s interval).
- Volumes: `${APPDATA_BASE}/pulse_neo4j/{data,logs,plugins}` to persist graph, query logs, custom plugins.

### Web UI (`pulse_web`)
- Planned Next.js 16 + shadcn/ui frontend that mirrors NotebookLM’s UX.
- Will run on port mapping `50110 ➜ 3000` to avoid default ports and remain sequential with other services.
- Container name reserved now so docker-compose changes can hook into this doc without reshuffling ports later.
- Depends indirectly on Firecrawl, MCP, and Webhook APIs; once container exists, add `depends_on` entries and health checks.

### GPU Stack (TEI, Qdrant, Ollama)
- Requires NVIDIA runtime; compose file reserves a GPU via `deploy.resources.reservations`.
- Keep host 52000–52003 free on the GPU machine; document any additions before deployment.

## Adding or Modifying Services
1. Choose the next free port in the appropriate block (501xx for core host, 5021x for graph/observability, 5200x for GPU/external).
2. Update `docker-compose.yaml` (or `.external`) with explicit `container_name`, `ports`, healthchecks, and named volumes.
3. Add new env vars to `.env` + `.env.example` and describe them in the relevant service doc.
4. Update this document with the new mapping, dependencies, and URLs **before** launching the service.
5. Record the deployment in `.docs/deployment-log.md` including date/time, service name, and assigned port.
