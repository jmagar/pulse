# Firecrawl Services Port Allocation

This document tracks all services and their port allocations in the Firecrawl monorepo.

Last Updated: 2025-11-10

## Port Overview

All services use sequential high-numbered ports (50100-50110 range) following service lifecycle guidelines.

| Port  | Service                  | Container Name            | Protocol | Status |
|-------|--------------------------|---------------------------|----------|--------|
| 50100 | Playwright Service       | pulse_playwright      | HTTP     | Active |
| 50101 | Firecrawl API (Internal) | firecrawl                 | HTTP     | Active |
| 50102 | Firecrawl API (External) | firecrawl                 | HTTP     | Active |
| 50103 | Worker                   | firecrawl                 | HTTP     | Active |
| 50104 | Redis                    | pulse_redis           | Redis    | Active |
| 50105 | PostgreSQL               | pulse_postgres              | Postgres | Active |
| 50106 | Extract Worker           | firecrawl                 | HTTP     | Active |
| 50107 | MCP Server               | pulse_mcp             | HTTP     | Active |
| 50108 | Webhook Bridge API       | pulse_webhook         | HTTP     | Active |
| 50109 | Change Detection | pulse_change-detection | HTTP | Active |
| N/A   | Webhook Worker           | pulse_webhook         | N/A      | Active |

## Internal Service URLs (Docker Network)

These URLs are used for service-to-service communication within the Docker network:

- **Firecrawl API**: `http://firecrawl:3002`
- **MCP Server**: `http://pulse_mcp:3060`
- **Webhook Bridge**: `http://pulse_webhook:52100`
- **Redis**: `redis://pulse_redis:6379`
- **PostgreSQL**: `postgresql://pulse_postgres:5432/pulse_postgres`
- **Playwright**: `http://pulse_playwright:3000`

## External Service URLs (Host Access)

These URLs are accessible from the host machine:

- **Firecrawl API**: `http://localhost:50102`
- **MCP Server**: `http://localhost:50107`
- **Webhook Bridge**: `http://localhost:50108`
- **Redis**: `redis://localhost:50104`
- **PostgreSQL**: `postgresql://localhost:50105/pulse_postgres`
- **Playwright**: `http://localhost:50100`

## Service Descriptions

### Firecrawl API
- **Container**: firecrawl
- **External Port**: 50102
- **Internal Port**: 3002
- **Purpose**: Main Firecrawl web scraping API
- **Dependencies**: pulse_postgres, pulse_redis, pulse_playwright
- **Health Check**: HTTP GET to internal port

### MCP Server
- **Container**: pulse_mcp
- **Port**: 50107
- **Purpose**: Model Context Protocol server for Claude integration with web scraping capabilities
- **Dependencies**: firecrawl
- **Health Check**: HTTP GET /health
- **Volume**: `/app/resources` for persistent resource storage

### Playwright Service
- **Container**: pulse_playwright
- **Port**: 50100 (mapped to internal 3000)
- **Purpose**: Browser automation service for dynamic content scraping
- **Dependencies**: None
- **Health Check**: None configured

### Redis
- **Container**: pulse_redis
- **Port**: 50104 (mapped to internal 6379)
- **Purpose**: Caching and message queue for Firecrawl and webhook services
- **Dependencies**: None
- **Health Check**: None configured
- **Volume**: Persistent storage at `/data`

### PostgreSQL
- **Container**: pulse_postgres
- **Port**: 50105 (mapped to internal 5432)
- **Purpose**: Primary database for Firecrawl API and webhook metrics
- **Dependencies**: None
- **Health Check**: None configured
- **Volume**: Persistent storage at `/var/lib/postgresql/data`
- **Schemas**:
  - `public`: Firecrawl API data
  - `webhook`: Webhook bridge timing metrics (future)

### Webhook Bridge API + Worker
- **Container**: pulse_webhook
- **Port**: 50108
- **Purpose**: FastAPI server with embedded background worker thread for search indexing with hybrid vector/BM25 search
- **Dependencies**: pulse_postgres, pulse_redis
- **Health Check**: HTTP GET /health
- **External Services**: Qdrant (vector store), TEI (text embeddings)
- **Worker**: RQ worker runs as background thread within the same process
- **Volume**: `/app/data/bm25` for BM25 keyword search index persistence

### changedetection.io Service

**Container:** pulse_change-detection
**Port:** 50109 (external) → 5000 (internal)
**Purpose:** Monitor websites for content changes, trigger rescraping on updates
**Dependencies:** pulse_playwright (Playwright), pulse_webhook (for notifications)
**Health Check:** HTTP GET / (60s interval, 10s timeout, 30s start period)
**Volume:** changedetection_data:/datastore (change history, monitor configs)

**Integration:**
- Shares Playwright browser with Firecrawl for JavaScript rendering
- Posts change notifications to webhook bridge at http://pulse_webhook:52100/api/webhook/changedetection
- Indexed content searchable via hybrid search (BM25 + vector)

## Port Range Allocation

- **50100-50110**: Core Pulse stack on primary host
  - Follows service lifecycle guidelines for port management
  - Easy to remember and manage
  - Avoids conflicts with common services
- **52000-52010**: GPU machine (external services via docker-compose.external.yaml)
  - Follows service lifecycle guidelines for port management
  - Easy to remember and manage
  - Avoids conflicts with common services

### GPU Machine Allocation

| Port  | Service          | Container Name | Protocol | Notes |
|-------|------------------|----------------|----------|-------|
| 52000 | TEI              | pulse_tei      | HTTP     | HuggingFace Text Embeddings Inference |
| 52001 | Qdrant (HTTP)    | pulse_qdrant   | HTTP     | Vector database HTTP API (pulse_docs collection, 1024 dims) |
| 52002 | Qdrant (gRPC)    | pulse_qdrant   | gRPC     | Vector database gRPC endpoint |
| 52003 | Ollama           | pulse_ollama   | HTTP     | Local LLM inference (qwen3:8b-instruct recommended) |

## Environment Variable Mapping

### MCP Server
- `MCP_PORT`: External port (default: 50107)
- `MCP_FIRECRAWL_BASE_URL`: Points to `http://firecrawl:3002` (internal)
- `MCP_LLM_PROVIDER`: LLM provider for extraction (default: openai-compatible)
- `MCP_OPTIMIZE_FOR`: Optimization mode (default: cost)

### Webhook Bridge
- `WEBHOOK_PORT`: External port (default: 50108)
- `WEBHOOK_REDIS_URL`: Points to `redis://pulse_redis:6379` (internal)
- `WEBHOOK_DATABASE_URL`: Points to `postgresql+asyncpg://pulse_postgres:5432/pulse_postgres` (internal)
- `WEBHOOK_QDRANT_URL`: Qdrant vector database URL
- `WEBHOOK_TEI_URL`: Text Embeddings Inference service URL

## Adding New Services

When adding a new service to the monorepo:

1. Choose an available port from the appropriate range
2. Add service definition to `docker-compose.yaml`
3. Update this document with service details
4. Update `.env.example` with new environment variables
5. Document internal/external URLs
6. Add health check configuration if applicable
7. Commit all changes together

## Notes

- All services use the `firecrawl` Docker bridge network
- Internal URLs use container names for DNS resolution
- External URLs use `localhost` and mapped ports
- Persistent data volumes are stored in `${APPDATA_BASE}/firecrawl_*` directories
- Health checks help ensure service availability before dependent services start
