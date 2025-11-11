# Firecrawl Services Port Allocation

This document tracks all services and their port allocations in the Firecrawl monorepo.

Last Updated: 2025-11-10

## Port Overview

All services use sequential high-numbered ports (50100-50110 range) following service lifecycle guidelines.

| Port  | Service                  | Container Name            | Protocol | Status |
|-------|--------------------------|---------------------------|----------|--------|
| 50100 | Playwright Service       | firecrawl_playwright      | HTTP     | Active |
| 50101 | Firecrawl API (Internal) | firecrawl                 | HTTP     | Active |
| 50102 | Firecrawl API (External) | firecrawl                 | HTTP     | Active |
| 50103 | Worker                   | firecrawl                 | HTTP     | Active |
| 50104 | Redis                    | firecrawl_cache           | Redis    | Active |
| 50105 | PostgreSQL               | firecrawl_db              | Postgres | Active |
| 50106 | Extract Worker           | firecrawl                 | HTTP     | Active |
| 50107 | MCP Server               | firecrawl_mcp             | HTTP     | Active |
| 50108 | Webhook Bridge API       | firecrawl_webhook         | HTTP     | Active |
| 50109 | Change Detection | firecrawl_changedetection | HTTP | Active |
| N/A   | Webhook Worker           | firecrawl_webhook         | N/A      | Active |

## Internal Service URLs (Docker Network)

These URLs are used for service-to-service communication within the Docker network:

- **Firecrawl API**: `http://firecrawl:3002`
- **MCP Server**: `http://firecrawl_mcp:3060`
- **Webhook Bridge**: `http://firecrawl_webhook:52100`
- **Redis**: `redis://firecrawl_cache:6379`
- **PostgreSQL**: `postgresql://firecrawl_db:5432/firecrawl_db`
- **Playwright**: `http://firecrawl_playwright:3000`

## External Service URLs (Host Access)

These URLs are accessible from the host machine:

- **Firecrawl API**: `http://localhost:50102`
- **MCP Server**: `http://localhost:50107`
- **Webhook Bridge**: `http://localhost:50108`
- **Redis**: `redis://localhost:50104`
- **PostgreSQL**: `postgresql://localhost:50105/firecrawl_db`
- **Playwright**: `http://localhost:50100`

## Service Descriptions

### Firecrawl API
- **Container**: firecrawl
- **External Port**: 50102
- **Internal Port**: 3002
- **Purpose**: Main Firecrawl web scraping API
- **Dependencies**: firecrawl_db, firecrawl_cache, firecrawl_playwright
- **Health Check**: HTTP GET to internal port

### MCP Server
- **Container**: firecrawl_mcp
- **Port**: 50107
- **Purpose**: Model Context Protocol server for Claude integration with web scraping capabilities
- **Dependencies**: firecrawl
- **Health Check**: HTTP GET /health
- **Volume**: `/app/resources` for persistent resource storage

### Playwright Service
- **Container**: firecrawl_playwright
- **Port**: 50100 (mapped to internal 3000)
- **Purpose**: Browser automation service for dynamic content scraping
- **Dependencies**: None
- **Health Check**: None configured

### Redis
- **Container**: firecrawl_cache
- **Port**: 50104 (mapped to internal 6379)
- **Purpose**: Caching and message queue for Firecrawl and webhook services
- **Dependencies**: None
- **Health Check**: None configured
- **Volume**: Persistent storage at `/data`

### PostgreSQL
- **Container**: firecrawl_db
- **Port**: 50105 (mapped to internal 5432)
- **Purpose**: Primary database for Firecrawl API and webhook metrics
- **Dependencies**: None
- **Health Check**: None configured
- **Volume**: Persistent storage at `/var/lib/postgresql/data`
- **Schemas**:
  - `public`: Firecrawl API data
  - `webhook`: Webhook bridge timing metrics (future)

### Webhook Bridge API + Worker
- **Container**: firecrawl_webhook
- **Port**: 50108
- **Purpose**: FastAPI server with embedded background worker thread for search indexing with hybrid vector/BM25 search
- **Dependencies**: firecrawl_db, firecrawl_cache
- **Health Check**: HTTP GET /health
- **External Services**: Qdrant (vector store), TEI (text embeddings)
- **Worker**: RQ worker runs as background thread within the same process
- **Volume**: `/app/data/bm25` for BM25 keyword search index persistence

### changedetection.io Service

**Container:** firecrawl_changedetection
**Port:** 50109 (external) → 5000 (internal)
**Purpose:** Monitor websites for content changes, trigger rescraping on updates
**Dependencies:** firecrawl_playwright (Playwright), firecrawl_webhook (for notifications)
**Health Check:** HTTP GET / (60s interval, 10s timeout, 30s start period)
**Volume:** changedetection_data:/datastore (change history, monitor configs)

**Integration:**
- Shares Playwright browser with Firecrawl for JavaScript rendering
- Posts change notifications to webhook bridge at http://firecrawl_webhook:52100/api/webhook/changedetection
- Indexed content searchable via hybrid search (BM25 + vector)

## Port Range Allocation

- **50100-50110**: All external services (sequential high-numbered ports)
  - Follows service lifecycle guidelines for port management
  - Easy to remember and manage
  - Avoids conflicts with common services

## Environment Variable Mapping

### MCP Server
- `MCP_PORT`: External port (default: 50107)
- `MCP_FIRECRAWL_BASE_URL`: Points to `http://firecrawl:3002` (internal)
- `MCP_LLM_PROVIDER`: LLM provider for extraction (default: openai-compatible)
- `MCP_OPTIMIZE_FOR`: Optimization mode (default: cost)

### Webhook Bridge
- `WEBHOOK_PORT`: External port (default: 50108)
- `WEBHOOK_REDIS_URL`: Points to `redis://firecrawl_cache:6379` (internal)
- `WEBHOOK_DATABASE_URL`: Points to `postgresql+asyncpg://firecrawl_db:5432/firecrawl_db` (internal)
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
