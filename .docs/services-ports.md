# Firecrawl Services Port Allocation

This document tracks all services and their port allocations in the Firecrawl monorepo.

Last Updated: 2025-11-09

## Port Overview

| Port  | Service                  | Container Name            | Protocol | Status |
|-------|--------------------------|---------------------------|----------|--------|
| 3002  | Firecrawl API (Internal) | firecrawl                 | HTTP     | Active |
| 3060  | MCP Server               | firecrawl_mcp             | HTTP     | Active |
| 4300  | Firecrawl API (External) | firecrawl                 | HTTP     | Active |
| 4301  | Worker                   | firecrawl                 | HTTP     | Active |
| 4302  | Playwright Service       | firecrawl_playwright      | HTTP     | Active |
| 4303  | Redis                    | firecrawl_cache           | Redis    | Active |
| 4304  | PostgreSQL               | firecrawl_db              | Postgres | Active |
| 4305  | Extract Worker           | firecrawl                 | HTTP     | Active |
| 52100 | Webhook Bridge API + Worker | firecrawl_webhook      | HTTP     | Active |

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

- **Firecrawl API**: `http://localhost:4300`
- **MCP Server**: `http://localhost:3060`
- **Webhook Bridge**: `http://localhost:52100`
- **Redis**: `redis://localhost:4303`
- **PostgreSQL**: `postgresql://localhost:4304/firecrawl_db`
- **Playwright**: `http://localhost:4302`

## Service Descriptions

### Firecrawl API
- **Container**: firecrawl
- **External Port**: 4300
- **Internal Port**: 3002
- **Purpose**: Main Firecrawl web scraping API
- **Dependencies**: firecrawl_db, firecrawl_cache, firecrawl_playwright
- **Health Check**: HTTP GET to internal port

### MCP Server
- **Container**: firecrawl_mcp
- **Port**: 3060
- **Purpose**: Model Context Protocol server for Claude integration with web scraping capabilities
- **Dependencies**: firecrawl
- **Health Check**: HTTP GET /health
- **Volume**: `/app/resources` for persistent resource storage

### Playwright Service
- **Container**: firecrawl_playwright
- **Port**: 4302 (mapped to internal 3000)
- **Purpose**: Browser automation service for dynamic content scraping
- **Dependencies**: None
- **Health Check**: None configured

### Redis
- **Container**: firecrawl_cache
- **Port**: 4303 (mapped to internal 6379)
- **Purpose**: Caching and message queue for Firecrawl and webhook services
- **Dependencies**: None
- **Health Check**: None configured
- **Volume**: Persistent storage at `/data`

### PostgreSQL
- **Container**: firecrawl_db
- **Port**: 4304 (mapped to internal 5432)
- **Purpose**: Primary database for Firecrawl API and webhook metrics
- **Dependencies**: None
- **Health Check**: None configured
- **Volume**: Persistent storage at `/var/lib/postgresql/data`
- **Schemas**:
  - `public`: Firecrawl API data
  - `webhook`: Webhook bridge timing metrics (future)

### Webhook Bridge API + Worker
- **Container**: firecrawl_webhook
- **Port**: 52100
- **Purpose**: FastAPI server with embedded background worker thread for search indexing with hybrid vector/BM25 search
- **Dependencies**: firecrawl_db, firecrawl_cache
- **Health Check**: HTTP GET /health
- **External Services**: Qdrant (vector store), TEI (text embeddings)
- **Worker**: RQ worker runs as background thread within the same process

## Port Range Allocation

- **3000-3999**: Internal services and MCP
- **4300-4399**: Firecrawl API and core infrastructure
- **52000-52999**: Webhook and search services

## Environment Variable Mapping

### MCP Server
- `MCP_PORT`: External/internal port (default: 3060)
- `MCP_FIRECRAWL_BASE_URL`: Points to `http://firecrawl:3002` (internal)
- `MCP_LLM_PROVIDER`: LLM provider for extraction (default: openai-compatible)
- `MCP_OPTIMIZE_FOR`: Optimization mode (default: cost)

### Webhook Bridge
- `WEBHOOK_PORT`: External/internal port (default: 52100)
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
