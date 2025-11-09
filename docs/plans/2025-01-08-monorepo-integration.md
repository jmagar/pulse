# Monorepo Integration: apps/mcp and apps/webhook

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Integrate the MCP server (Node.js) and webhook bridge (Python) into the Firecrawl monorepo as first-class applications with shared infrastructure.

**Architecture:** Apps remain language-independent (Node.js and Python) but share Docker network, Redis, and PostgreSQL. MCP's Firecrawl client will be extracted to a shared package. Build orchestration via pnpm workspace scripts.

**Tech Stack:**
- pnpm workspaces for Node.js apps
- uv for Python dependency management
- Docker Compose for service orchestration
- Shared PostgreSQL (consolidating webhook's separate DB)
- Shared Redis (already using Firecrawl's instance)

**Key Decisions:**
- ✅ Consolidate to single PostgreSQL instance
- ✅ Extract shared Firecrawl client library now
- ✅ Use pnpm workspace scripts (no Makefile needed)
- ✅ Keep Python apps with their own tooling (uv)

---

## Phase 1: Pre-Integration Dependency Resolution

### Task 1: Upgrade MCP to OpenAI SDK v5.x ✅ COMPLETE

**Status:** ✅ Completed (Commit: 877622e)
**Actual:** Upgraded to v6.8.1 (pnpm resolved ^5.20.2 to latest compatible)

**Context:** MCP uses openai@4.104.0 but apps/api uses openai@5.20.2. We must upgrade MCP to v5.x to avoid workspace conflicts.

**Files:**
- Modify: `apps/mcp/shared/package.json`
- Modify: `apps/mcp/local/package.json`
- Modify: `apps/mcp/remote/package.json`
- Check: `apps/mcp/shared/processing/extraction/providers/openai-client.ts`
- Check: `apps/mcp/shared/processing/extraction/providers/openai-compatible-client.ts`

**Step 1: Update package.json dependencies**

In `apps/mcp/shared/package.json`, change:
```json
{
  "dependencies": {
    "openai": "^5.20.2"
  }
}
```

In `apps/mcp/local/package.json` and `apps/mcp/remote/package.json`, apply same change.

**Step 2: Review OpenAI SDK v5 breaking changes**

Read migration guide: https://github.com/openai/openai-node/releases/tag/v5.0.0

Key changes:
- `OpenAI` constructor API unchanged
- `chat.completions.create()` unchanged
- Streaming API might have changes

**Step 3: Update OpenAI client code if needed**

Check `apps/mcp/shared/processing/extraction/providers/openai-client.ts:1-100` for:
- Constructor usage
- API calls
- Error handling

Expected: Minimal changes needed (v4 → v5 is mostly backward compatible for chat completions)

**Step 4: Run MCP tests**

```bash
cd apps/mcp
npm install
npm test
```

Expected: All tests pass

**Step 5: Commit**

```bash
git add apps/mcp/shared/package.json apps/mcp/local/package.json apps/mcp/remote/package.json
git commit -m "chore(mcp): upgrade openai SDK to v5.x for monorepo compatibility"
```

---

### Task 2: Align Zod Versions ✅ COMPLETE

**Status:** ✅ Completed (Commit: e8fd6e3)
**Actual:** Updated to ^3.24.2, pnpm installed 3.25.76

**Files:**
- Modify: `apps/mcp/shared/package.json`

**Step 1: Update Zod version**

In `apps/mcp/shared/package.json`, change:
```json
{
  "dependencies": {
    "zod": "^3.24.2"
  }
}
```

**Step 2: Install and verify**

```bash
cd apps/mcp
npm install
npm test
```

Expected: All tests pass

**Step 3: Commit**

```bash
git add apps/mcp/shared/package.json
git commit -m "chore(mcp): align zod version with monorepo"
```

---

### Task 3: Run Security Audits ✅ COMPLETE

**Status:** ✅ Completed (Commit: ddd733a)
**Results:** MCP: 0 vulnerabilities | Webhook: 1 non-critical (pip dev tool)
**Documentation:** `.docs/security-audit-2025-01-08.md`

**Step 1: Audit MCP dependencies**

```bash
cd apps/mcp
pnpm audit
```

Expected: No critical vulnerabilities

**Step 2: Audit webhook dependencies**

```bash
cd apps/webhook
uv sync
# uv doesn't have built-in audit yet, use pip-audit
pip install pip-audit
pip-audit
```

Expected: No critical vulnerabilities

**Step 3: Document findings**

If vulnerabilities found, document in `.docs/security-audit-2025-01-08.md`

**Step 4: Commit audit results**

```bash
git add .docs/security-audit-2025-01-08.md
git commit -m "docs: security audit for monorepo integration"
```

---

## Phase 2: Shared Code Extraction

### Task 4: Create Shared Firecrawl Client Package ✅ COMPLETE

**Status:** ✅ Completed (Commit: c3db7be, amended)
**Created:** `packages/firecrawl-client` with TypeScript strict mode
**Fixed:** Removed node_modules & dist from git, enabled strict mode

**Files:**
- Create: `packages/firecrawl-client/package.json`
- Create: `packages/firecrawl-client/tsconfig.json`
- Create: `packages/firecrawl-client/src/index.ts`
- Create: `packages/firecrawl-client/src/types.ts`
- Create: `packages/firecrawl-client/src/client.ts`
- Create: `packages/firecrawl-client/README.md`

**Step 1: Create package directory**

```bash
mkdir -p packages/firecrawl-client/src
```

**Step 2: Create package.json**

`packages/firecrawl-client/package.json`:
```json
{
  "name": "@firecrawl/client",
  "version": "1.0.0",
  "description": "Shared Firecrawl API client for monorepo",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "zod": "^3.24.2"
  },
  "devDependencies": {
    "typescript": "^5.8.3"
  }
}
```

**Step 3: Create tsconfig.json**

`packages/firecrawl-client/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

**Step 4: Copy MCP's Firecrawl client code**

Copy `apps/mcp/shared/clients/firecrawl/` to `packages/firecrawl-client/src/`:

```bash
cp -r apps/mcp/shared/clients/firecrawl/* packages/firecrawl-client/src/
```

**Step 5: Create barrel export**

`packages/firecrawl-client/src/index.ts`:
```typescript
export { FirecrawlClient } from './client.js';
export * from './types.js';
export * from './operations/index.js';
```

**Step 6: Build the package**

```bash
cd packages/firecrawl-client
npm install
npm run build
```

Expected: Clean build with no errors

**Step 7: Commit**

```bash
git add packages/firecrawl-client
git commit -m "feat: extract shared firecrawl client package"
```

---

### Task 5: Update Root pnpm Workspace Configuration ✅ COMPLETE

**Status:** ✅ Completed (Commit: a10769c)
**Created:** `pnpm-workspace.yaml`, root `package.json` with scripts
**Workspace:** 4 packages linked (mcp, web, firecrawl-client, root)

**Files:**
- Create: `pnpm-workspace.yaml` (root)
- Modify: `package.json` (root)

**Step 1: Create pnpm-workspace.yaml**

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

**Step 2: Create/update root package.json**

Check if root `package.json` exists. If not, create it:

```json
{
  "name": "pulse",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "build": "pnpm -r --filter './apps/mcp' --filter './packages/*' build",
    "build:mcp": "pnpm --filter './apps/mcp' build",
    "build:web": "pnpm --filter './apps/web' build",
    "build:packages": "pnpm --filter './packages/*' build",
    "test": "pnpm -r --filter './apps/mcp' --filter './packages/*' test",
    "test:mcp": "pnpm --filter './apps/mcp' test",
    "test:web": "pnpm --filter './apps/web' test",
    "dev:mcp": "pnpm --filter './apps/mcp' dev",
    "dev:web": "pnpm --filter './apps/web' dev",
    "clean": "pnpm -r --filter './apps/*' --filter './packages/*' clean",
    "install:webhook": "cd apps/webhook && uv sync"
  }
}
```

**Step 3: Install workspace dependencies**

```bash
pnpm install
```

Expected: All workspace packages linked

**Step 4: Commit**

```bash
git add pnpm-workspace.yaml package.json
git commit -m "chore: configure pnpm workspace for monorepo"
```

---

### Task 6: Update MCP to Use Shared Client ✅ COMPLETE

**Status:** ✅ Completed (Commit: 4699f38)
**Updated:** 99 files, all imports migrated to @firecrawl/client
**Removed:** apps/mcp/shared/clients/firecrawl directory
**Added:** test:packages, test:webhook, build:webhook, dev:webhook scripts

**Files:**
- Modify: `apps/mcp/shared/package.json`
- Modify: `apps/mcp/shared/scraping/clients/firecrawl/*.ts` (update imports)
- Delete: `apps/mcp/shared/clients/firecrawl/` (after migration)

**Step 1: Add workspace dependency**

In `apps/mcp/shared/package.json`:
```json
{
  "dependencies": {
    "@firecrawl/client": "workspace:*"
  }
}
```

**Step 2: Update import paths**

Find all imports from `../../clients/firecrawl` and replace with `@firecrawl/client`:

```bash
cd apps/mcp/shared
grep -r "from.*clients/firecrawl" . --include="*.ts"
```

Update each file, e.g.:
```typescript
// Before
import { FirecrawlClient } from '../../clients/firecrawl/client.js';

// After
import { FirecrawlClient } from '@firecrawl/client';
```

**Step 3: Remove old client directory**

```bash
rm -rf apps/mcp/shared/clients/firecrawl
```

**Step 4: Install and test**

```bash
cd apps/mcp
pnpm install
pnpm test
```

Expected: All tests pass

**Step 5: Commit**

```bash
git add apps/mcp/shared
git commit -m "refactor(mcp): use shared firecrawl client package"
```

---

## Phase 3: Environment Variable Standardization

### Task 7: Create Unified Root .env.example ✅ COMPLETE

**Status:** ✅ Completed (Commit: a7406f0)
**Created:** Root `.env.example` with all services documented
**Updated:** Added monorepo deployment notes to app-specific .env.example files

**Files:**
- Create: `.env.example` (root, comprehensive)
- Keep: `apps/mcp/.env.example` (reference)
- Keep: `apps/webhook/.env.example` (reference)

**Step 1: Create comprehensive .env.example**

`.env.example`:
```bash
# ============================================
# Firecrawl Monorepo Environment Variables
# ============================================

# -----------------
# Core Firecrawl API
# -----------------
FIRECRAWL_PORT=4300
FIRECRAWL_API_URL=http://localhost:4300
FIRECRAWL_API_KEY=your-api-key-here

# -----------------
# Shared Infrastructure
# -----------------

# PostgreSQL
POSTGRES_USER=firecrawl
POSTGRES_PASSWORD=your-secure-password
POSTGRES_DB=firecrawl_db
POSTGRES_PORT=4304
DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@firecrawl_db:5432/${POSTGRES_DB}

# Redis
REDIS_PORT=4303
REDIS_URL=redis://firecrawl_cache:6379

# Playwright
PLAYWRIGHT_PORT=4302
PLAYWRIGHT_MICROSERVICE_URL=http://firecrawl_playwright:3000/scrape

# -----------------
# MCP Server
# -----------------
MCP_PORT=3060
MCP_FIRECRAWL_API_KEY=self-hosted-no-auth
MCP_FIRECRAWL_BASE_URL=http://firecrawl:3002
MCP_LLM_PROVIDER=openai-compatible
MCP_LLM_API_BASE_URL=https://cli-api.tootie.tv/v1
MCP_LLM_MODEL=claude-haiku-4-5-20251001
MCP_OPTIMIZE_FOR=cost
MCP_RESOURCE_STORAGE=memory
MCP_RESOURCE_TTL=86400
MCP_DEBUG=false

# -----------------
# Webhook Bridge (Search)
# -----------------
WEBHOOK_PORT=52100
WEBHOOK_API_SECRET=your-webhook-api-secret
WEBHOOK_REDIS_URL=redis://firecrawl_cache:6379
WEBHOOK_DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@firecrawl_db:5432/${POSTGRES_DB}
WEBHOOK_QDRANT_URL=http://qdrant:6333
WEBHOOK_QDRANT_COLLECTION=firecrawl_docs
WEBHOOK_TEI_URL=http://tei:80
WEBHOOK_EMBEDDING_MODEL=Qwen/Qwen3-Embedding-0.6B
WEBHOOK_VECTOR_DIM=1024
WEBHOOK_LOG_LEVEL=INFO

# -----------------
# LLM Configuration (Shared)
# -----------------
OPENAI_API_KEY=dummy
OPENAI_BASE_URL=https://cli-api.tootie.tv/v1
ANTHROPIC_API_KEY=your-anthropic-key
```

**Step 2: Add header comment to app-specific .env.example files**

Add to `apps/mcp/.env.example` and `apps/webhook/.env.example`:
```bash
# ============================================
# NOTE: For monorepo deployment, use root .env
# This file is for reference/standalone deployment only
# ============================================
```

**Step 3: Commit**

```bash
git add .env.example apps/mcp/.env.example apps/webhook/.env.example
git commit -m "docs: create unified environment variable configuration"
```

---

### Task 8: Update MCP Configuration to Use Namespaced Variables ✅ COMPLETE

**Status:** ✅ Completed (Commit: 189a73a)
**Implemented:** Centralized environment variable configuration with backward compatibility

**Files Modified:**
- Created: `apps/mcp/shared/config/environment.ts` - Centralized env var management with MCP_* prefix and legacy fallbacks
- Updated: All MCP code to use centralized `env` module instead of direct `process.env` access
- Fixed: `apps/mcp/shared/scraping/strategies/learned/default-config.ts` - Updated to use `env.strategyConfigPath`

**Implementation Details:**

Created comprehensive environment configuration module supporting both namespaced (MCP_*) and legacy variable names:

```typescript
// apps/mcp/shared/config/environment.ts
export const env = {
  port: getEnvVar('MCP_PORT', 'PORT', '3060'),
  firecrawlApiKey: getEnvVar('MCP_FIRECRAWL_API_KEY', 'FIRECRAWL_API_KEY'),
  firecrawlBaseUrl: getEnvVar('MCP_FIRECRAWL_BASE_URL', 'FIRECRAWL_BASE_URL'),
  llmProvider: getEnvVar('MCP_LLM_PROVIDER', 'LLM_PROVIDER'),
  strategyConfigPath: getEnvVar('MCP_STRATEGY_CONFIG_PATH', 'STRATEGY_CONFIG_PATH'),
  // ... 30+ additional variables
};
```

**Backward Compatibility:**
- All environment variables support both MCP_* (new) and legacy (old) formats
- Primary lookup checks MCP_* prefixed version first
- Falls back to legacy name if MCP_* not set
- Ensures seamless migration without breaking existing deployments

**Code Review Fix:**
- Updated `default-config.ts` to use centralized `env.strategyConfigPath` instead of direct `process.env.STRATEGY_CONFIG_PATH` access
- All environment variable access now goes through the centralized module

---

### Task 9: Update Webhook Configuration for Shared PostgreSQL

**Files:**
- Modify: `apps/webhook/app/config.py`
- Modify: `apps/webhook/alembic/env.py`

**Step 1: Update database URL configuration**

In `apps/webhook/app/config.py`, change:

```python
class Settings(BaseSettings):
    # Use WEBHOOK_DATABASE_URL or fall back to DATABASE_URL (shared)
    database_url: PostgresDsn = Field(
        default="postgresql+asyncpg://firecrawl:password@firecrawl_db:5432/firecrawl_db",
        validation_alias=AliasChoices("WEBHOOK_DATABASE_URL", "DATABASE_URL")
    )

    # Use WEBHOOK_REDIS_URL or fall back to REDIS_URL (shared)
    redis_url: RedisDsn = Field(
        default="redis://firecrawl_cache:6379",
        validation_alias=AliasChoices("WEBHOOK_REDIS_URL", "REDIS_URL")
    )
```

**Step 2: Update Alembic configuration**

In `apps/webhook/alembic/env.py`, ensure it reads from settings:

```python
from app.config import settings

config.set_main_option("sqlalchemy.url", str(settings.database_url))
```

**Step 3: Test configuration loading**

```bash
cd apps/webhook
uv sync
python -c "from app.config import settings; print(settings.database_url)"
```

Expected: Prints database URL

**Step 4: Commit**

```bash
git add apps/webhook/app/config.py apps/webhook/alembic/env.py
git commit -m "feat(webhook): support shared PostgreSQL and environment variables"
```

---

## Phase 4: Database Schema Integration

### Task 10: Create Webhook Schema in Shared PostgreSQL

**Context:** Instead of a separate PostgreSQL instance, webhook will use a dedicated schema in Firecrawl's PostgreSQL.

**Files:**
- Create: `apps/webhook/alembic/versions/YYYYMMDD_init_webhook_schema.py`
- Modify: `apps/webhook/app/models/timing.py`

**Step 1: Update SQLAlchemy models to use schema**

In `apps/webhook/app/models/timing.py`:

```python
from sqlalchemy.orm import declarative_base

Base = declarative_base()

class RequestMetric(Base):
    __tablename__ = "request_metrics"
    __table_args__ = {"schema": "webhook"}

    # ... existing columns

class OperationMetric(Base):
    __tablename__ = "operation_metrics"
    __table_args__ = {"schema": "webhook"}

    # ... existing columns
```

**Step 2: Create schema creation migration**

```bash
cd apps/webhook
alembic revision -m "create webhook schema"
```

Edit the generated file to include:

```python
def upgrade() -> None:
    op.execute('CREATE SCHEMA IF NOT EXISTS webhook')
    # ... rest of table creation

def downgrade() -> None:
    op.execute('DROP SCHEMA IF EXISTS webhook CASCADE')
```

**Step 3: Test migration**

```bash
cd apps/webhook
alembic upgrade head
```

Expected: Schema and tables created successfully

**Step 4: Commit**

```bash
git add apps/webhook/app/models apps/webhook/alembic/versions
git commit -m "feat(webhook): use dedicated schema in shared PostgreSQL"
```

---

## Phase 5: Docker Compose Integration

### Task 11: Merge Docker Compose Services

**Files:**
- Modify: `docker-compose.yaml` (root)
- Document: `.docs/services-ports.md`

**Step 1: Add MCP service to docker-compose.yaml**

In root `docker-compose.yaml`, add:

```yaml
  firecrawl_mcp:
    build:
      context: ./apps/mcp
      dockerfile: Dockerfile
    container_name: firecrawl_mcp
    ports:
      - "${MCP_PORT:-3060}:3060"
    environment:
      - MCP_PORT=3060
      - MCP_FIRECRAWL_BASE_URL=http://firecrawl:3002
      - MCP_FIRECRAWL_API_KEY=${FIRECRAWL_API_KEY}
      - MCP_LLM_PROVIDER=${MCP_LLM_PROVIDER:-openai-compatible}
      - MCP_LLM_API_BASE_URL=${OPENAI_BASE_URL}
      - MCP_OPTIMIZE_FOR=${MCP_OPTIMIZE_FOR:-cost}
    networks:
      - firecrawl
    restart: unless-stopped
    depends_on:
      - firecrawl
    labels:
      - "com.centurylinklabs.watchtower.enable=false"
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:3060/health')"]
      interval: 30s
      timeout: 10s
      retries: 3
```

**Step 2: Add webhook service**

```yaml
  firecrawl_webhook:
    build:
      context: ./apps/webhook
      dockerfile: Dockerfile
    container_name: firecrawl_webhook
    ports:
      - "${WEBHOOK_PORT:-52100}:52100"
    environment:
      - WEBHOOK_PORT=52100
      - WEBHOOK_DATABASE_URL=postgresql+asyncpg://${POSTGRES_USER}:${POSTGRES_PASSWORD}@firecrawl_db:5432/${POSTGRES_DB}
      - WEBHOOK_REDIS_URL=redis://firecrawl_cache:6379
      - WEBHOOK_API_SECRET=${WEBHOOK_API_SECRET}
      - WEBHOOK_QDRANT_URL=${WEBHOOK_QDRANT_URL}
      - WEBHOOK_TEI_URL=${WEBHOOK_TEI_URL}
    networks:
      - firecrawl
    restart: unless-stopped
    depends_on:
      - firecrawl_db
      - firecrawl_cache
    labels:
      - "com.centurylinklabs.watchtower.enable=false"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:52100/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  firecrawl_webhook_worker:
    build:
      context: ./apps/webhook
      dockerfile: Dockerfile
    container_name: firecrawl_webhook_worker
    command: python -m app.worker
    environment:
      - WEBHOOK_DATABASE_URL=postgresql+asyncpg://${POSTGRES_USER}:${POSTGRES_PASSWORD}@firecrawl_db:5432/${POSTGRES_DB}
      - WEBHOOK_REDIS_URL=redis://firecrawl_cache:6379
      - WEBHOOK_QDRANT_URL=${WEBHOOK_QDRANT_URL}
      - WEBHOOK_TEI_URL=${WEBHOOK_TEI_URL}
    networks:
      - firecrawl
    restart: unless-stopped
    depends_on:
      - firecrawl_cache
      - firecrawl_webhook
    labels:
      - "com.centurylinklabs.watchtower.enable=false"
```

**Step 3: Update services-ports.md**

Create/update `.docs/services-ports.md`:

```markdown
# Firecrawl Services Port Allocation

| Port  | Service                  | Container Name            | Protocol |
|-------|--------------------------|---------------------------|----------|
| 3002  | Firecrawl API            | firecrawl                 | HTTP     |
| 3060  | MCP Server               | firecrawl_mcp             | HTTP     |
| 4302  | Playwright               | firecrawl_playwright      | HTTP     |
| 4303  | Redis                    | firecrawl_cache           | Redis    |
| 4304  | PostgreSQL               | firecrawl_db              | Postgres |
| 52100 | Webhook Bridge API       | firecrawl_webhook         | HTTP     |
| N/A   | Webhook Worker           | firecrawl_webhook_worker  | N/A      |

## Internal Service URLs

- Firecrawl API: `http://firecrawl:3002`
- MCP Server: `http://firecrawl_mcp:3060`
- Redis: `redis://firecrawl_cache:6379`
- PostgreSQL: `postgresql://firecrawl_db:5432`
- Webhook Bridge: `http://firecrawl_webhook:52100`
```

**Step 4: Test docker-compose validation**

```bash
docker compose config
```

Expected: Valid YAML with no errors

**Step 5: Commit**

```bash
git add docker-compose.yaml .docs/services-ports.md
git commit -m "feat: integrate MCP and webhook services into docker-compose"
```

---

## Phase 6: Documentation Updates

### Task 12: Update Root README.md

**Files:**
- Modify: `README.md`

**Step 1: Add architecture section**

In `README.md`, add/update:

```markdown
## Architecture

Firecrawl is a monorepo containing:

- **apps/mcp** - Model Context Protocol server for Claude integration (TypeScript/Node.js)
- **apps/webhook** - Semantic search bridge with vector/BM25 hybrid search (Python/FastAPI)
- **apps/web** - Web interface (Next.js)
- **packages/firecrawl-client** - Shared Firecrawl API client library

### Service Communication

```
┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│   MCP       │─────▶│  Firecrawl   │─────▶│   Webhook   │
│   Server    │      │     API      │      │   Bridge    │
└─────────────┘      └──────────────┘      └─────────────┘
       │                     │                      │
       │                     │                      │
       ▼                     ▼                      ▼
┌──────────────────────────────────────────────────────┐
│              Shared Infrastructure                    │
│  Redis (Queue) │ PostgreSQL (Data) │ Docker Network  │
└──────────────────────────────────────────────────────┘
```

## Development

### Prerequisites

- Docker and Docker Compose
- Node.js 20+
- pnpm 10+
- Python 3.13+ (for webhook)
- uv (for Python dependency management)

### Quick Start

1. Clone and install dependencies:
```bash
git clone <repo>
cd firecrawl
pnpm install
pnpm run install:webhook
```

2. Copy environment template:
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. Start all services:
```bash
docker compose up -d
```

4. Verify services:
```bash
# API health
curl http://localhost:3002/health

# MCP health
curl http://localhost:3060/health

# Webhook health
curl http://localhost:52100/health
```

### Build Commands

```bash
# Build all Node.js apps
pnpm build

# Build specific app
pnpm build:web
pnpm build:mcp

# Build shared packages
pnpm build:packages
```

### Test Commands

```bash
# Test all apps
pnpm test

# Test specific app
pnpm test:web
pnpm test:mcp

# Test webhook (Python)
cd apps/webhook && make test
```

### Development Mode

```bash
# Run API in dev mode
pnpm dev:web

# Run MCP in dev mode
pnpm dev:mcp

# Run webhook in dev mode
cd apps/webhook && make dev
```
```

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: update README with monorepo architecture"
```

---

### Task 13: Update Root CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Add monorepo-specific patterns**

In `CLAUDE.md`, add section:

```markdown
## Monorepo Structure

pulse uses a **multi-language monorepo**:

### Node.js Apps (pnpm workspace)
- `apps/mcp` - MCP server (has internal workspace: local/remote/shared)
- `apps/web` - Web UI
- `packages/*` - Shared libraries

**Build:** `pnpm build` or `pnpm build:web` or `pnpm build:mcp`
**Test:** `pnpm test` or `pnpm test:web`  or `pnpm test:mcp`

### Python Apps (independent)
- `apps/webhook` - Search bridge

**Build:** `cd apps/webhook && uv sync`
**Test:** `cd apps/webhook && make test`

### Shared Infrastructure
- PostgreSQL: Shared database with app-specific schemas
  - `public` schema: Firecrawl API data
  - `webhook` schema: Webhook bridge metrics
- Redis: Shared queue for API and webhook
- Docker network: `firecrawl` (bridge)

### Cross-Service Communication

**Internal URLs (Docker network):**
- API: `http://firecrawl:3002`
- MCP: `http://firecrawl_mcp:3060`
- Webhook: `http://firecrawl_webhook:52100`
- Redis: `redis://firecrawl_cache:6379`
- PostgreSQL: `postgresql://firecrawl_db:5432/firecrawl_db`

**Never hardcode external URLs in code!** Use environment variables.

### Adding New Services

1. Add to `docker-compose.yaml` following the anchor pattern
2. Add port to `.docs/services-ports.md`
3. Add environment variables to `.env.example`
4. Update this CLAUDE.md with integration points
5. Add build/test scripts to root `package.json` if Node.js

### Testing Integration

When testing cross-service features:
1. Use `docker compose up -d` to start all services
2. Check health endpoints before tests
3. Use internal service URLs in tests
4. Clean up with `docker compose down` after
```

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add monorepo patterns to CLAUDE.md"
```

---

## Phase 7: Testing & Validation

### Task 14: Run Isolated App Tests


**Step 1: Test MCP**

```bash
cd apps/mcp
pnpm install
pnpm test
```

Expected: All tests pass

**Step 2: Test webhook**

```bash
cd apps/webhook
uv sync
make test
```


**Step 3: Test Web**

```bash
cd apps/web
pnpm install
pnpm test
```

Expected: All tests pass

**Step 4: Document test results**

Create `.docs/test-results-2025-01-08.md`:

```markdown
# Test Results - Monorepo Integration

Date: 2025-01-08

## Isolated Tests

- ✅ apps/api: X tests passed
- ✅ apps/mcp: Y tests passed
- ✅ apps/webhook: Z tests passed

## Issues Found

(List any failures and resolutions)
```

**Step 5: Commit**

```bash
git add .docs/test-results-2025-01-08.md
git commit -m "test: validate isolated app tests"
```

---

### Task 15: Integration Testing

**Step 1: Start all services**

```bash
docker compose up -d
```

**Step 2: Wait for services to be healthy**

```bash
docker compose ps
```

Expected: All services showing "healthy" status

**Step 3: Test service-to-service communication**

Test MCP → Firecrawl:
```bash
curl -X POST http://localhost:3060/scrape \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'
```

Expected: Successful scrape response

**Step 4: Test Firecrawl → Webhook indexing**

Configure Firecrawl to send to webhook:
```bash
# In .env, ensure:
ENABLE_SEARCH_INDEX=true
SEARCH_SERVICE_URL=http://firecrawl_webhook:52100
```

Restart services:
```bash
docker compose restart firecrawl
```

Trigger a scrape and verify webhook receives it:
```bash
# Check webhook logs
docker compose logs firecrawl_webhook -f
```

**Step 5: Test database schema isolation**

Connect to PostgreSQL and verify schemas:
```bash
docker exec -it firecrawl_db psql -U firecrawl -d firecrawl_db -c "\dn"
```

Expected: Both `public` and `webhook` schemas exist

**Step 6: Document integration test results**

Update `.docs/test-results-2025-01-08.md`:

```markdown
## Integration Tests

- ✅ MCP → Firecrawl communication
- ✅ Firecrawl → Webhook indexing
- ✅ Database schema isolation
- ✅ Redis queue sharing
- ✅ Docker network connectivity
```

**Step 7: Commit**

```bash
git add .docs/test-results-2025-01-08.md
git commit -m "test: validate cross-service integration"
```

---

## Phase 8: Final Cleanup

### Task 16: Remove Standalone Docker Compose Files

**Files:**
- Delete: `apps/mcp/docker-compose.yml`
- Delete: `apps/webhook/docker-compose.yaml`

**Step 1: Verify services work from root**

```bash
docker compose ps
```

Expected: MCP and webhook running from root compose file

**Step 2: Remove redundant compose files**

```bash
rm apps/mcp/docker-compose.yml
rm apps/webhook/docker-compose.yaml
```

**Step 3: Update app READMEs**

In `apps/mcp/README.md`, change deployment instructions:
```markdown
## Deployment

Run from monorepo root:
```bash
docker compose up -d firecrawl_mcp
```

For standalone deployment, see root `docker-compose.yaml` for service definition.
```

Same for `apps/webhook/README.md`.

**Step 4: Commit**

```bash
git add apps/mcp apps/webhook apps/web
git commit -m "chore: remove standalone docker-compose files"
```

---

### Task 17: Create Migration Guide

**Files:**
- Create: `.docs/migration-guide-monorepo.md`

**Step 1: Write migration guide**

`.docs/migration-guide-monorepo.md`:

```markdown
# Migration Guide: Standalone → Monorepo

## For Existing MCP Deployments

### Environment Variables

**Old (standalone):**
```bash
PORT=3060
FIRECRAWL_API_KEY=...
FIRECRAWL_BASE_URL=https://api.firecrawl.dev
```

**New (monorepo):**
```bash
MCP_PORT=3060
MCP_FIRECRAWL_API_KEY=self-hosted-no-auth
MCP_FIRECRAWL_BASE_URL=http://firecrawl:3002
```

**Backward compatibility:** Both formats work! Old variables still supported.

### Docker Deployment

**Old:**
```bash
cd apps/mcp
docker compose up -d
```

**New:**
```bash
# From repo root
docker compose up -d firecrawl_mcp
```

### Internal URLs

If MCP was previously pointing to external Firecrawl, update to internal:
- External: `https://api.firecrawl.dev` → Internal: `http://firecrawl:3002`

## For Existing Webhook Deployments

### Database Migration

**Old:** Separate PostgreSQL instance
**New:** Shared PostgreSQL with `webhook` schema

**Steps:**
1. Backup existing webhook database
2. Create `webhook` schema in Firecrawl PostgreSQL
3. Run migrations: `cd apps/webhook && alembic upgrade head`
4. (Optional) Migrate existing data

### Environment Variables

**Old:**
```bash
SEARCH_BRIDGE_DATABASE_URL=postgresql://...
SEARCH_BRIDGE_REDIS_URL=redis://...
```

**New:**
```bash
WEBHOOK_DATABASE_URL=postgresql://firecrawl:password@firecrawl_db:5432/firecrawl_db
WEBHOOK_REDIS_URL=redis://firecrawl_cache:6379
```

**Backward compatibility:** Old `SEARCH_BRIDGE_*` variables still work!

### Docker Deployment

**Old:**
```bash
cd apps/webhook
docker compose up -d
```

**New:**
```bash
# From repo root
docker compose up -d firecrawl_webhook firecrawl_webhook_worker
```

## Testing Migration

1. Stop old deployments
2. Start monorepo deployment: `docker compose up -d`
3. Verify health endpoints
4. Test cross-service communication
5. Monitor logs for errors
```

**Step 2: Commit**

```bash
git add .docs/migration-guide-monorepo.md
git commit -m "docs: add migration guide for monorepo integration"
```

---

### Task 18: Final Verification and Documentation

**Step 1: Verify all services healthy**

```bash
docker compose ps
curl http://localhost:3060/health  # MCP
curl http://localhost:52100/health # Webhook
curl http://localhost:4302/health  # Web
```

Expected: All return healthy status

**Step 2: Run full test suite**

```bash
pnpm test
cd apps/webhook && make test
```

Expected: All tests pass

**Step 3: Create completion summary**

`.docs/monorepo-integration-complete.md`:

```markdown
# Monorepo Integration Complete

Date: 2025-01-08

## Summary

Successfully integrated apps/mcp (MCP server) and apps/webhook (search bridge) into the Firecrawl monorepo.

## Changes Made

### Code Changes
- ✅ Upgraded MCP to OpenAI SDK v5.x
- ✅ Aligned dependency versions (Zod)
- ✅ Extracted shared Firecrawl client to `packages/firecrawl-client`
- ✅ Updated MCP to use shared client
- ✅ Configured webhook to use shared PostgreSQL with `webhook` schema
- ✅ Namespaced environment variables (MCP_*, WEBHOOK_*)

### Infrastructure
- ✅ Created pnpm workspace configuration
- ✅ Integrated services into root docker-compose.yaml
- ✅ Consolidated to single PostgreSQL instance
- ✅ Unified Docker network (firecrawl)

### Documentation
- ✅ Created comprehensive .env.example
- ✅ Updated README.md with architecture
- ✅ Updated CLAUDE.md with monorepo patterns
- ✅ Created services-ports documentation
- ✅ Created migration guide

### Testing
- ✅ All isolated app tests passing
- ✅ Integration tests passing
- ✅ Service-to-service communication verified

## Port Allocation

- 3002: Firecrawl API
- 3060: MCP Server
- 4302: Playwright
- 4303: Redis
- 4304: PostgreSQL
- 52100: Webhook Bridge

## Next Steps

1. Monitor production deployment
2. Consider CI/CD pipeline updates
3. Evaluate shared code extraction opportunities
4. Document performance metrics
```

**Step 4: Final commit**

```bash
git add .docs/monorepo-integration-complete.md
git commit -m "docs: monorepo integration complete"
```

---

## Verification Checklist

After completing all tasks, verify:

- [ ] All services start with `docker compose up -d`
- [ ] All health endpoints return 200 OK
- [ ] MCP can scrape via Firecrawl API
- [ ] Webhook receives indexing requests from Firecrawl
- [ ] Database schemas are isolated (public vs webhook)
- [ ] pnpm workspace commands work (`pnpm build`, `pnpm test`)
- [ ] Environment variables follow naming conventions
- [ ] Documentation is up-to-date
- [ ] Migration guide covers standalone → monorepo transition
- [ ] All tests passing (Node.js and Python)

## Rollback Plan

If integration fails:

1. Revert git commits: `git revert HEAD~N`
2. Restore standalone docker-compose files from git history
3. Deploy services independently
4. Document failure reasons for retry

---

**End of Implementation Plan**

Total Tasks: 18
Estimated Time: 12-16 hours
Risk Level: Medium (well-scoped, incremental)
