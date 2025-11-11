# Pulse - Integrated Web Intelligence Platform

A unified monorepo combining Firecrawl web scraping with intelligent Model Context Protocol (MCP) integration and semantic search capabilities.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Applications](#applications)
- [Quick Start](#quick-start)
- [Development](#development)
- [Deployment](#deployment)
- [Configuration](#configuration)
- [Testing](#testing)
- [Documentation](#documentation)

## Overview

Pulse is a monorepo that integrates three core applications:

1. **Firecrawl API** - Enterprise-grade web scraping and crawling
2. **MCP Server** - Model Context Protocol server for Claude Desktop integration
3. **Webhook Bridge** - Semantic search with hybrid vector/BM25 indexing

All applications share common infrastructure (PostgreSQL, Redis, Docker network) while maintaining language independence.

## Architecture

### Monorepo Structure

```
pulse/
├── apps/
│   ├── mcp/              # MCP Server (Node.js/TypeScript)
│   ├── nuq-postgres/     # Custom PostgreSQL with Nuqs extension
│   ├── web/              # Web Interface (Next.js)
│   └── webhook/          # Search Bridge (Python/FastAPI)
├── packages/
│   └── firecrawl-client/ # Shared Firecrawl API client library
├── .docs/
│   ├── sessions/         # Development session logs
│   ├── services-ports.md # Port allocation registry
│   └── deployment-log.md # Deployment history
├── docker-compose.yaml   # Unified service orchestration
├── .env.example          # Environment variable template
└── pnpm-workspace.yaml   # Workspace configuration
```

### Service Communication

```
┌─────────────────┐      ┌──────────────────┐      ┌─────────────────┐
│   MCP Server    │─────▶│  Firecrawl API   │◀────▶│ Webhook Bridge  │
│  (Port 50107)   │      │  (Port 50102)    │      │  (Port 50108)   │
└─────────────────┘      └──────────────────┘      └─────────────────┘
        │                         │                          │
        │                         │                          │
        ▼                         ▼                          ▼
┌──────────────────────────────────────────────────────────────────┐
│                    Shared Infrastructure                          │
│  ┌──────────┐  ┌──────────────┐  ┌───────────┐  ┌─────────────┐ │
│  │  Redis   │  │  PostgreSQL  │  │ Playwright │  │   Docker    │ │
│  │ (Queue)  │  │   (Data)     │  │  (Browser) │  │   Network   │ │
│  └──────────┘  └──────────────┘  └───────────┘  └─────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

### Database Architecture

PostgreSQL is shared across services with schema isolation:

- **`public` schema**: Firecrawl API data (crawl jobs, scrape results)
- **`webhook` schema**: Webhook bridge metrics (request timing, operation stats)

## Applications

### Firecrawl API

**Purpose**: Enterprise web scraping and crawling API with advanced features

**Key Features**:
- Multiple scraping engines (Playwright, fetch, custom)
- Async crawling with job queues (BullMQ)
- Rate limiting and quota management
- Webhook notifications
- Search indexing integration

**Technology**: Node.js, TypeScript, Express, BullMQ, Playwright

**Documentation**: Uses official Firecrawl image - see [Firecrawl Documentation](https://docs.firecrawl.dev)

**Ports**:
- External API: `50102` (internal: `3002`)
- Worker: `50103`
- Extract Worker: `50106`

### MCP Server

**Purpose**: Model Context Protocol server enabling Claude Desktop to scrape, search, map, and crawl the web

**Key Features**:
- **Four powerful tools**: `scrape`, `search`, `map`, `crawl`
- Multi-strategy scraping with fallback (native → browser → Firecrawl)
- LLM-powered content extraction (supports OpenAI, Anthropic, compatible providers)
- Smart content cleaning (HTML → Markdown with main content extraction)
- Multi-tier resource storage (raw, cleaned, extracted)
- Optimization modes: cost vs. speed
- Dual deployment: local (stdio) and remote (HTTP)

**Technology**: Node.js, TypeScript, MCP SDK, Firecrawl client

**Documentation**: See [apps/mcp/README.md](apps/mcp/README.md)

**Ports**:
- External: `50107`
- Internal: `3060`

### Webhook Bridge

**Purpose**: Semantic search service with hybrid vector/BM25 indexing for scraped content

**Key Features**:
- Hybrid search (vector similarity + BM25 keyword)
- Reciprocal Rank Fusion (RRF) for result merging
- Token-based intelligent chunking
- Async job queue for non-blocking indexing
- Rich filtering (domain, language, country, device)
- Multiple search modes (hybrid, semantic, keyword, BM25)

**Technology**: Python 3.13+, FastAPI, SQLAlchemy, Redis, Qdrant, HuggingFace TEI

**Documentation**: See [apps/webhook/README.md](apps/webhook/README.md)

**Ports**:
- External: `50108`
- Internal: `52100`
- Worker: Background process (no port)

### changedetection.io (Port 50109)

Website change detection and monitoring service.

- **Purpose:** Track content changes on monitored URLs
- **Web UI:** `http://localhost:50109`
- **Shared Resources:** Uses firecrawl_playwright for JavaScript rendering
- **Storage:** File-based in `/datastore` volume
- **Integration:** Notifies webhook bridge on change detection

## Quick Start

### Using Docker Compose (Recommended)

**Prerequisites**:
- Docker and Docker Compose (v2.0+)
- Git

**Steps**:

1. **Clone and configure**:

   ```bash
   git clone <repository-url>
   cd pulse

   # Copy environment template
   cp .env.example .env

   # Edit .env with your configuration
   # At minimum, set:
   # - POSTGRES_PASSWORD
   # - WEBHOOK_API_SECRET
   # - MCP_LLM_API_BASE_URL (if using LLM extraction)
   ```

2. **Start all services**:

   ```bash
   docker compose up -d
   ```

3. **Verify services**:

   ```bash
   # Check container status
   docker compose ps

   # View logs
   docker compose logs -f

   # Verify health endpoints
   curl http://localhost:50102/health     # Firecrawl API
   curl http://localhost:50107/health     # MCP Server
   curl http://localhost:50108/health    # Webhook Bridge
   ```

Services will be available at:

- Firecrawl API: `http://localhost:50102`
- MCP Server: `http://localhost:50107`
- Webhook Bridge: `http://localhost:50108`

### Local Development

For active development on individual services:

**Prerequisites**:
- Node.js 20+ and pnpm 10+
- Python 3.12+ and uv
- Docker (for infrastructure services)

**Steps**:

1. **Install dependencies**:

   ```bash
   # Install Node.js workspace dependencies
   pnpm install

   # Install Python webhook dependencies
   pnpm install:webhook
   ```

2. **Configure environment**:

   ```bash
   # Copy and edit .env
   cp .env.example .env
   ```

3. **Start infrastructure services**:

   ```bash
   # Start PostgreSQL, Redis, and Playwright
   docker compose up -d firecrawl_db firecrawl_cache firecrawl_playwright
   ```

4. **Run services in development mode**:

   ```bash
   # See Development section below for pnpm dev commands
   ```

### First Test

**Test Firecrawl API**:

```bash
curl -X POST http://localhost:50102/v1/scrape \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${FIRECRAWL_API_KEY}" \
  -d '{"url": "https://example.com"}'
```

**Test MCP Server**:

```bash
curl -X POST http://localhost:50107/scrape \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com", "cleanScrape": true}'
```

**Test Webhook Bridge**:

```bash
curl http://localhost:50108/api/stats \
  -H "X-API-Secret: ${WEBHOOK_API_SECRET}"
```

## Development

### Workspace Commands

The monorepo uses **pnpm workspaces** for Node.js apps and **uv** for Python apps.

**Build commands**:

```bash
# Build all Node.js apps and packages
pnpm build

# Build specific apps
pnpm build:mcp
pnpm build:web
pnpm build:packages

# Build webhook (Python)
pnpm build:webhook
```

**Test commands**:
```bash
# Test all Node.js apps
pnpm test

# Test specific apps
pnpm test:mcp
pnpm test:web
pnpm test:packages

# Test webhook (Python)
pnpm test:webhook
```

**Development mode**:
```bash
# Run MCP server in development mode
pnpm dev:mcp

# Run web interface in development mode
pnpm dev:web

# Run webhook bridge in development mode
pnpm dev:webhook

# Run webhook worker
pnpm worker:webhook

# Run MCP and web together
pnpm dev

# Run all services together (MCP, web, webhook)
pnpm dev:all
```

**Note**: External services (TEI, Qdrant) must be running separately. See `docs/external-services.md`.

**Clean build artifacts**:
```bash
pnpm clean
```

### Service URLs (Development)

**Internal (Docker network)**:
- Firecrawl API: `http://firecrawl:3002`
- MCP Server: `http://firecrawl_mcp:3060`
- Webhook Bridge: `http://firecrawl_webhook:52100`
- Redis: `redis://firecrawl_cache:6379`
- PostgreSQL: `postgresql://firecrawl_db:5432/firecrawl_db`
- Playwright: `http://firecrawl_playwright:3000`

**External (Host machine)**:
- Firecrawl API: `http://localhost:50102`
- MCP Server: `http://localhost:50107`
- Webhook Bridge: `http://localhost:50108`
- Redis: `redis://localhost:50104`
- PostgreSQL: `postgresql://localhost:50105/firecrawl_db`
- Playwright: `http://localhost:50100`

### Local Development (Without Docker)

**MCP Server**:
```bash
cd apps/mcp
pnpm install
pnpm dev
```

**Webhook Bridge**:
```bash
cd apps/webhook
uv sync
uv run uvicorn app.main:app --reload --port 52100
```

**Note**: Local development requires external dependencies (Redis, PostgreSQL, Qdrant, TEI) to be running separately or via Docker.

## Deployment

### Production Deployment

The entire stack can be deployed with a single command:

```bash
# Start all services in background
docker compose up -d

# View logs
docker compose logs -f

# Stop all services
docker compose down

# Stop and remove volumes (WARNING: Deletes data)
docker compose down -v
```

### Individual Service Deployment

Deploy specific services:

```bash
# Deploy only MCP server
docker compose up -d firecrawl_mcp

# Deploy only webhook bridge (API + worker)
docker compose up -d firecrawl_webhook firecrawl_webhook_worker

# Deploy only Firecrawl API
docker compose up -d firecrawl
```

### Service Dependencies

Start order (handled automatically by Docker Compose):

1. **Infrastructure**: `firecrawl_db`, `firecrawl_cache`, `firecrawl_playwright`
2. **Core API**: `firecrawl`
3. **Dependent Services**: `firecrawl_mcp`, `firecrawl_webhook`, `firecrawl_webhook_worker`

### Persistent Data

Data is stored in volumes at `${APPDATA_BASE}/firecrawl_*`:

- `firecrawl_postgres/` - PostgreSQL database
- `firecrawl_redis/` - Redis persistence
- `firecrawl_mcp_resources/` - MCP resource storage

**Backup recommendations**:
```bash
# Backup PostgreSQL
docker exec firecrawl_db pg_dump -U firecrawl firecrawl_db > backup.sql

# Backup Redis
docker exec firecrawl_cache redis-cli SAVE
cp ${APPDATA_BASE}/firecrawl_redis/dump.rdb backup_redis.rdb
```

## Configuration

### Environment Variables

All configuration is managed through environment variables. See [`.env.example`](.env.example) for comprehensive documentation.

**Core configuration sections**:

1. **Firecrawl API** - API keys, ports, worker configuration
2. **Shared Infrastructure** - PostgreSQL, Redis, Playwright
3. **MCP Server** - Firecrawl integration, LLM provider, optimization settings
4. **Webhook Bridge** - Search service, vector store, embeddings, chunking
5. **Search Integration** - Indexing configuration, webhooks
6. **LLM Configuration** - OpenAI, Anthropic API credentials

### Variable Naming Conventions

- **MCP Server**: Uses `MCP_*` prefix (e.g., `MCP_PORT`, `MCP_FIRECRAWL_BASE_URL`)
- **Webhook Bridge**: Uses `WEBHOOK_*` or `SEARCH_BRIDGE_*` prefix (both supported for backward compatibility)
- **Shared Services**: Uses service name prefix (e.g., `POSTGRES_*`, `REDIS_*`)

### Configuration Files

- `.env` - Active environment configuration (gitignored)
- `.env.example` - Environment variable template (tracked in git)
- `docker-compose.yaml` - Service definitions and infrastructure
- `apps/mcp/.env.example` - MCP-specific reference (for standalone deployment)
- `apps/webhook/.env.example` - Webhook-specific reference (for standalone deployment)

**Note**: For monorepo deployment, use the root `.env` file. App-specific `.env.example` files are for reference and standalone deployment only.

## Testing

### Prerequisites

1. **PostgreSQL**: Tests require PostgreSQL running on localhost:5432
   ```bash
   docker compose up -d firecrawl_db
   ```

2. **Node.js Dependencies**:
   ```bash
   pnpm install
   ```

3. **Python Dependencies**:
   ```bash
   cd apps/webhook && uv sync --extra dev
   ```

### Running Tests

**All tests**:
```bash
# All test suites
pnpm test

# Individual test suites
pnpm test:mcp      # MCP server (Vitest)
pnpm test:web      # Web UI (no-op currently)
pnpm test:webhook  # Webhook service (pytest)
```

**Individual test suites with more control**:
```bash
# MCP Server tests
cd apps/mcp
pnpm test

# Webhook tests
cd apps/webhook
uv run pytest

# Run webhook tests with coverage
cd apps/webhook
uv run pytest --cov=app --cov-report=html
```

### Test Database

Webhook tests use a dedicated PostgreSQL database (`webhook_test`) that is automatically created and reset before each test run. This ensures hermetic, reproducible tests.

### Integration Testing

Test cross-service communication:

```bash
# Start all services
docker compose up -d

# Wait for health checks to pass
docker compose ps

# Test MCP → Firecrawl
curl -X POST http://localhost:50107/scrape \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'

# Test Firecrawl → Webhook indexing (if search enabled)
# Check webhook logs for indexing events
docker compose logs firecrawl_webhook_worker -f

# Verify database schemas
docker exec -it firecrawl_db psql -U firecrawl -d firecrawl_db -c "\dn"
```

### Test Coverage

Run tests with coverage reporting:

```bash
# MCP Server (if configured)
cd apps/mcp
pnpm test:coverage

# Webhook Bridge
cd apps/webhook
uv run pytest --cov=app --cov-report=term --cov-report=html
open htmlcov/index.html  # View coverage report
```

## Monitoring Websites for Changes

### Adding a Watch

1. Open changedetection.io UI: `http://localhost:50109`
2. Click "Add new change detection watch"
3. Enter URL to monitor
4. (Optional) Configure:
   - Check interval (default: 1 hour)
   - CSS selector for specific content
   - Playwright for JavaScript-heavy sites
5. Save watch

### Configuring Automatic Rescraping

When changedetection detects a change, it can automatically trigger Firecrawl to rescrape and re-index the content:

1. In changedetection.io, edit a watch
2. Go to "Notifications" tab
3. Add notification URL: `json://firecrawl_webhook:52100/api/webhook/changedetection`
4. Set notification body template (see docs/CHANGEDETECTION_INTEGRATION.md)
5. Save configuration

Changed content will be automatically indexed for search within minutes.

## Documentation

### Project Documentation

- **[.docs/services-ports.md](.docs/services-ports.md)** - Service port allocation and URLs
- **[.docs/webhook-troubleshooting.md](.docs/webhook-troubleshooting.md)** - Webhook debugging and troubleshooting guide
- **[.env.example](.env.example)** - Comprehensive environment variable reference
- **[docker-compose.yaml](docker-compose.yaml)** - Service definitions and infrastructure

### Application Documentation

- **[apps/mcp/README.md](apps/mcp/README.md)** - MCP Server documentation
- **[apps/webhook/README.md](apps/webhook/README.md)** - Webhook Bridge documentation
- **[apps/web/README.md](apps/web/README.md)** - Web interface documentation

### Architecture Documents

See `.docs/sessions/` for detailed session logs documenting architectural decisions and implementation details.

### Troubleshooting

**Webhooks not working?** See **[.docs/webhook-troubleshooting.md](.docs/webhook-troubleshooting.md)** for:
- Common webhook issues and solutions
- SSRF protection bypass configuration
- Real-time log monitoring commands
- End-to-end testing procedures

## License

See individual application directories for license information.

## Support

For issues and questions:

1. Check application-specific README files
2. Review `.docs/services-ports.md` for service URLs
3. Verify `.env` configuration against `.env.example`
4. Check Docker logs: `docker compose logs -f [service-name]`
5. Review health endpoints for service status

## Contributing

This is a monorepo with multiple language ecosystems:

- **Node.js/TypeScript**: Follow standard TypeScript conventions, use pnpm for package management
- **Python**: Follow PEP 8, use uv for dependency management
- **Docker**: Use the shared `firecrawl` network for inter-service communication

When adding new services:

1. Add service definition to `docker-compose.yaml`
2. Update `.docs/services-ports.md` with port allocation
3. Add environment variables to `.env.example`
4. Update this README with service description
5. Add health check configuration if applicable
