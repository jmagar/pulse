# Copilot Instructions for Pulse

## Repository Overview

Pulse is a **multi-language monorepo** combining web scraping, semantic search, and MCP capabilities:
- **Firecrawl API**: Web scraping (Docker image, source not in repo)
- **MCP Server**: Model Context Protocol server (Node.js/TypeScript)
- **Webhook Bridge**: Semantic search with vector/BM25 indexing (Python 3.12+/FastAPI)
- **Web UI**: Next.js interface (Node.js/TypeScript)

**Stack**: TypeScript (Node 20+), Python (3.12+), Express, FastAPI, Next.js, PostgreSQL, Redis, Docker

## Build & Test - Critical Steps

### Prerequisites & Installation

**Required**: Node 20+, pnpm (`npm install -g pnpm`), Python 3.12+, uv (https://docs.astral.sh/uv/), Docker

```bash
# Install (ALWAYS run in this order)
pnpm install              # Node.js dependencies (REQUIRED FIRST)
pnpm build:packages       # Build shared packages (REQUIRED before apps)
pnpm install:webhook      # Python deps (if working with webhook)
```

### Build Commands

```bash
pnpm build              # Builds packages → apps → webhook
pnpm build:packages     # MUST run before building apps
pnpm build:mcp          # MCP TypeScript compilation
pnpm build:web          # Next.js (may fail with Google Fonts - NOT critical)
pnpm build:webhook      # Python dependency sync
pnpm clean              # Remove all build artifacts
```

**Known Issue**: `pnpm build:web` may fail with Google Fonts errors (network restriction). Skip unless working on web UI.

### Test Commands

**CRITICAL**: Start PostgreSQL before testing: `docker compose up -d pulse_postgres`

```bash
pnpm test            # All tests
pnpm test:mcp        # Vitest (~231 tests, ~10s)
pnpm test:webhook    # pytest (auto-creates webhook_test DB)
pnpm test:web        # Next.js tests
```

### Lint, Format & Type Check

```bash
pnpm lint            # All linting (ESLint + Ruff)
pnpm format          # All formatting (Prettier + Ruff)
pnpm typecheck       # All type checking (tsc + mypy)
```

**Note**: Web linting may show non-blocking warnings in `vitest.setup.ts`.

### Development Mode

**Start infrastructure first**: `docker compose up -d pulse_postgres pulse_redis pulse_playwright`

```bash
pnpm dev:mcp         # Port 50107
pnpm dev:web         # Port 3000
pnpm dev:webhook     # Port 50108
pnpm dev:all         # All services
pnpm worker:webhook  # Background job processor
```

## Project Structure

```
pulse/
├── apps/
│   ├── mcp/              # MCP Server (TypeScript) - tools/, scraping/, processing/, storage/, tests/
│   ├── webhook/          # Search Bridge (Python) - api/, services/, domain/, infra/, tests/, alembic/
│   ├── web/              # Next.js UI - app/, components/
│   └── nuq-postgres/     # Custom PostgreSQL
├── packages/
│   └── firecrawl-client/ # Shared API client (TypeScript)
├── scripts/              # Utility scripts (reset-firecrawl-queue.sh, validate-pnpm-filters.sh)
├── .docs/                # Documentation (services-ports.md, webhook-troubleshooting.md)
├── docker-compose.yaml   # Service orchestration
├── .env.example          # Environment template
├── pnpm-workspace.yaml   # Workspace config
└── package.json          # Root scripts
```

**Key Config Files**:
- TypeScript: `tsconfig.json` in mcp/, web/, packages/firecrawl-client/
- Linting: `eslint.config.mjs` (mcp/, web/), `pyproject.toml` (webhook/ - Ruff, mypy, pytest)
- Environment: `.env` (root, gitignored), `.env.example` (template)
- Git Hooks: `.husky/pre-commit` (validates pnpm filters)

### Service Ports

**External**: Firecrawl `50102`, MCP `50107`, Webhook `50108`, PostgreSQL `50105`, Redis `50104`, Playwright `50100`
**Internal**: `http://firecrawl:3002`, `http://pulse_mcp:3060`, `http://pulse_webhook:52100`, `redis://pulse_redis:6379`, `postgresql://pulse_postgres:5432/pulse_postgres`

## Environment Variables

**CRITICAL**: All variables in root `.env` (single source). Naming: `MCP_*`, `WEBHOOK_*`, `POSTGRES_*`, `REDIS_*`, `FIRECRAWL_*`

**Required minimum**: `POSTGRES_PASSWORD`, `WEBHOOK_API_SECRET`, `MCP_LLM_API_BASE_URL`, `MCP_LLM_API_KEY` (for extraction)

**Never hardcode URLs!** Use environment variables.

## Common Workflows

### MCP Server Changes
1. Start: `docker compose up -d pulse_postgres pulse_redis pulse_playwright`
2. Develop: Edit `apps/mcp/`, run `cd apps/mcp && pnpm test`
3. Build: `pnpm build:mcp`
4. Dev mode: `pnpm dev:mcp`
5. Validate: `pnpm lint:js && pnpm typecheck:js && pnpm test:mcp`

### Webhook Bridge Changes
1. Start: `docker compose up -d pulse_postgres pulse_redis`
2. Install: `cd apps/webhook && uv sync --extra dev`
3. Develop: Edit `apps/webhook/`, run `uv run pytest tests/ -v`
4. Format: `uv run ruff check . && uv run ruff format .`
5. Validate: `pnpm lint:webhook && pnpm typecheck:webhook && pnpm test:webhook` (from root)

### Integration Testing
1. `docker compose up -d` → 2. `docker compose ps` → 3. Test endpoints → 4. Check logs: `docker compose logs -f pulse_mcp`

## Known Issues & Workarounds

**Web build fails (Google Fonts)**: Network restriction. NOT critical unless working on web UI. Skip with comment.

**"uv not found"**: Install from https://docs.astral.sh/uv/ → `curl -LsSf https://astral.sh/uv/install.sh | sh`

**"pnpm not found"**: Install globally → `npm install -g pnpm`

**PostgreSQL connection refused**: Start before tests → `docker compose up -d pulse_postgres && sleep 5 && pnpm test`

**Webhook test failures**: Test DB auto-resets. If persists → `docker compose restart pulse_postgres && sleep 10 && pnpm test:webhook`

## PR Validation Checklist

Before submitting:
1. `pnpm clean && pnpm install`
2. `pnpm build:packages && pnpm build:mcp && pnpm build:webhook` (skip web if Google Fonts fails)
3. `pnpm lint && pnpm format && pnpm typecheck`
4. `docker compose up -d pulse_postgres && pnpm test`
5. If touching Dockerfiles: `docker compose build pulse_mcp pulse_webhook`

**Pre-commit hook**: Validates pnpm filters on package.json changes

**Trust these instructions first**. Search codebase only if info incomplete, error undocumented, or implementation details needed.
