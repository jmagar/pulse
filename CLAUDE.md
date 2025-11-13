# Claude Assistant Memory - Pulse Project

Quick reference for Claude Code assistants working on the Pulse monorepo.

## Monorepo Structure

Pulse is a **multi-language monorepo** combining Firecrawl API, MCP server, webhook bridge, and web UI.

### Apps & Packages

**Node.js (pnpm workspace):**
- `apps/mcp` - Model Context Protocol server (consolidated single package)
- `apps/web` - Next.js web UI
- `packages/firecrawl-client` - Shared Firecrawl client library

**Python (independent):**
- `apps/webhook` - FastAPI search bridge with hybrid vector/BM25 search
- `apps/nuq-postgres` - PostgreSQL custom build

**External Services (Docker containers):**
- Firecrawl API (`ghcr.io/firecrawl/firecrawl`, container: `firecrawl`)
- Playwright (`ghcr.io/firecrawl/playwright-service`, container: `pulse_playwright`)
- changedetection.io (`ghcr.io/dgtlmoon/changedetection.io`, container: `pulse_change-detection`)
- Neo4j Graph DB (container: `pulse_neo4j`)
- Redis (container: `pulse_redis`)

### Build & Test Commands

Root `package.json` orchestrates all builds/tests:

```bash
pnpm build                    # Build packages, apps/mcp, apps/web, apps/webhook
pnpm build:mcp              # Build just MCP server
pnpm build:web              # Build just web UI
pnpm build:webhook          # Build just webhook (via: cd apps/webhook && uv sync)

pnpm test                   # Test all (packages, apps/mcp, apps/web, apps/webhook)
pnpm test:mcp               # Test MCP server
pnpm test:webhook           # Run Python webhook tests
```

**Dev mode:**
```bash
pnpm dev                    # Start all services in parallel: MCP, web, webhook
pnpm dev:mcp                # Start MCP only
pnpm dev:web                # Start web UI only
pnpm dev:webhook            # Start webhook only on port 50108
```

## Service Ports & Naming

**Container names and ports (Docker network: `pulse`):**

| Port | Service | Container | Internal | Notes |
|------|---------|-----------|----------|-------|
| 50100 | Playwright | pulse_playwright | 3000 | Browser automation |
| 50102 | Firecrawl API | firecrawl | 3002 | Web scraping API |
| 50104 | Redis | pulse_redis | 6379 | Message queue & cache |
| 50105 | PostgreSQL | pulse_postgres | 5432 | Shared database |
| 50107 | MCP Server | pulse_mcp | 3060 | Claude integration |
| 50108 | Webhook Bridge | pulse_webhook | 52100 | Search indexing & API |
| 50109 | changedetection.io | pulse_change-detection | 5000 | Change monitoring |
| 50210-50211 | Neo4j | pulse_neo4j | 7474/7687 | Graph database |

**Internal URLs (within Docker network):**
```
- Firecrawl API: http://firecrawl:3002
- MCP Server: http://pulse_mcp:3060
- Webhook Bridge: http://pulse_webhook:52100    [NOTE: internal port 52100, NOT 3000]
- Redis: redis://pulse_redis:6379
- PostgreSQL: postgresql://pulse_postgres:5432/pulse_postgres
- Playwright: http://pulse_playwright:3000
- changedetection.io: http://pulse_change-detection:5000
- Neo4j HTTP: http://pulse_neo4j:7474
- Neo4j Bolt: bolt://pulse_neo4j:7687
```

## Environment Variables

**Single source of truth:** Root `.env` file (git-ignored, copy from `.env.example`).

All services receive the same `.env` via docker-compose's `env_file` anchor directive.

### Key Variable Namespaces

**MCP Server (`MCP_*`):**
- `MCP_PORT` - Server port (default: 50107)
- `MCP_FIRECRAWL_BASE_URL` - Points to `http://firecrawl:3002`
- `MCP_WEBHOOK_BASE_URL` - Points to `http://pulse_webhook:52100`
- `MCP_LLM_PROVIDER`, `MCP_LLM_MODEL` - LLM configuration
- `MCP_ENABLE_OAUTH` - OAuth2 support (requires Google credentials + secrets)

**Webhook Bridge (`WEBHOOK_*`):**
- `WEBHOOK_PORT` - External port (default: 50108)
- `WEBHOOK_DATABASE_URL` - PostgreSQL connection
- `WEBHOOK_REDIS_URL` - Redis connection
- `WEBHOOK_QDRANT_URL` - Vector database (external GPU machine)
- `WEBHOOK_TEI_URL` - Text embeddings service (external GPU machine)
- `WEBHOOK_ENABLE_WORKER` - Set to false when using pulse_webhook-worker container

**Firecrawl API (`FIRECRAWL_*`):**
- `FIRECRAWL_PORT` - External port (default: 50102)
- `FIRECRAWL_INTERNAL_PORT` - Internal port (default: 3002)
- `FIRECRAWL_API_URL` - External URL for API access

**Shared Infrastructure:**
- `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` - Database credentials
- `REDIS_URL` - Redis connection string
- `DATABASE_URL` - PostgreSQL URL (if used instead of NUQ_DATABASE_URL)

### Adding New Variables

1. Add to both `.env` and `.env.example` (root)
2. Use namespaced prefixes: `MCP_*`, `WEBHOOK_*`, `FIRECRAWL_*`
3. Update app code to read from environment
4. Document in `.env.example` comments
5. Update this CLAUDE.md if service-wide impact

## Docker Compose Architecture

**Pattern:** Common service anchor with inheritance for consistency.

```yaml
x-common-service: &common-service
  restart: unless-stopped
  networks:
    - pulse
  env_file:
    - .env
  labels:
    - "com.centurylinklabs.watchtower.enable=false"

services:
  service_name:
    <<: *common-service
    # ... service config
```

**Network:** All services on user-defined bridge `pulse` for DNS resolution by container name.

**Volumes:** Persistent data stored in `${APPDATA_BASE}/pulse_*` directories (default: `/mnt/cache/appdata/`).

## Key Integration Points

### MCP ↔ Firecrawl API
- MCP calls Firecrawl API at `http://firecrawl:3002` for scraping
- MCP tools: scrape, map, crawl, query, search
- Configuration: `MCP_FIRECRAWL_BASE_URL`, `MCP_FIRECRAWL_API_KEY`

### MCP ↔ Webhook Bridge
- MCP calls webhook bridge for indexed document search (query tool)
- Configuration: `MCP_WEBHOOK_BASE_URL`, `MCP_WEBHOOK_API_SECRET`
- Endpoint: POST `http://pulse_webhook:52100/api/search`

### changedetection.io ↔ Webhook Bridge
- changedetection.io posts webhooks on change detection
- Endpoint: POST `http://pulse_webhook:52100/api/webhook/changedetection`
- Shares Playwright browser with Firecrawl for rendering

### PostgreSQL Schemas
- `public` - Firecrawl API data
- `webhook` - Webhook bridge metrics and search indices

## Testing & Verification

**Docker Services:** Start all with `pnpm services:up`, verify with `pnpm services:ps`

**Health Checks:**
- MCP: GET `http://localhost:50107/health` → 200
- Webhook: GET `http://localhost:50108/health` → 200
- Firecrawl: GET `http://localhost:50102/health` (if exposed)

**Cross-Service Tests:** Use internal URLs (container names, not localhost)

## Important Patterns

1. **Never hardcode external URLs** in code - use `MCP_*` / `WEBHOOK_*` env vars
2. **Use internal container names** in service-to-service communication
3. **OAuth is optional** - disabled by default, enable with `MCP_ENABLE_OAUTH=true`
4. **Environment variables are mandatory** - no default API keys in code
5. **Worker thread model** - Webhook runs as separate `pulse_webhook-worker` container for scalability
