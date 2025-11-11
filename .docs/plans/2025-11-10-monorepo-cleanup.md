# Monorepo Cleanup and Documentation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix monorepo integration issues including MCP workspace flattening, external services, port standardization, documentation, and developer workflow

**Architecture:** Multi-phase cleanup addressing MCP nested workspace removal, external service dependencies, port allocation standardization (50100-50110 range), documentation completeness, and workflow unification via pnpm scripts

**Tech Stack:** Docker Compose, pnpm workspaces, Python 3.12+, Node.js/TypeScript, FastAPI, Next.js

---

## Task -1: Consolidate Environment Variables to Root `.env`

**Context:** Currently both `apps/mcp/` and `apps/webhook/` have local `.env` files that may conflict with or duplicate the root `.env`. The root `.env` is intended as the single source of truth for all services, but we need to verify that all apps/packages actually read from it.

**Current State:**
- Root `.env` contains all variables for all services (Firecrawl API, MCP, Webhook)
- `docker-compose.yaml` already uses `env_file: - .env` in the common service anchor
- MCP uses `dotenv` (loads from CWD `.env` by default)
- Webhook uses Pydantic Settings with `env_file=".env"` (loads from CWD `.env` by default)
- Both apps have their own `.env` files that may take precedence

**Goal:** Ensure all apps/packages use the project root `.env` as the sole source of truth.

**Files:**
- Check: `apps/mcp/.env`, `apps/webhook/.env` (existence, contents)
- Verify: `apps/mcp/remote/index.ts` (dotenv usage)
- Verify: `apps/webhook/app/config.py` (Pydantic Settings config)
- Verify: `docker-compose.yaml` (env_file inheritance)
- Update: `.gitignore` (if needed)
- Document: Root `.env` and `.env.example`

**Step 1: Verify Docker Compose env_file inheritance**

Check that all services inherit `env_file: - .env` from the common service anchor.

```bash
# Verify env_file is defined in the anchor
grep -A5 "x-common-service" docker-compose.yaml

# Expected output:
# x-common-service: &common-service
#   restart: unless-stopped
#   networks:
#     - firecrawl
#   env_file:
#     - .env
```

Expected: All services should inherit the root `.env` via the anchor pattern.

**Step 2: Check for local .env files in apps**

```bash
# Check if local .env files exist
ls -la apps/mcp/.env 2>/dev/null
ls -la apps/webhook/.env 2>/dev/null

# If they exist, compare with root .env
diff .env apps/mcp/.env || echo "Files differ or one doesn't exist"
diff .env apps/webhook/.env || echo "Files differ or one doesn't exist"
```

Expected: Local `.env` files may exist but should not conflict with root `.env`.

**Step 3: Understand dotenv behavior in MCP**

The MCP remote server uses dotenv at [apps/mcp/remote/index.ts:10](apps/mcp/remote/index.ts#L10):

```typescript
import { config } from 'dotenv';
config({ quiet: true });
```

By default, `dotenv` loads from the **current working directory's `.env`** file. In Docker containers, the working directory is set by the Dockerfile's `WORKDIR` directive.

Check the MCP Dockerfile to understand where it runs from:

```bash
# Check if MCP has a Dockerfile
ls -la apps/mcp/Dockerfile 2>/dev/null || echo "No Dockerfile found"
```

Expected: MCP likely runs from the project root in Docker, so it loads root `.env`.

**Step 4: Understand Pydantic Settings behavior in Webhook**

The webhook app uses Pydantic Settings at [apps/webhook/app/config.py:21](apps/webhook/app/config.py#L21):

```python
model_config = SettingsConfigDict(
    env_file=".env",
    env_file_encoding="utf-8",
    case_sensitive=False,
    extra="allow",
)
```

Pydantic Settings also loads from the **current working directory's `.env`** by default.

Check the webhook Dockerfile:

```bash
# Check webhook Dockerfile
ls -la apps/webhook/Dockerfile 2>/dev/null || echo "No Dockerfile found"

# If it exists, check WORKDIR directive
grep WORKDIR apps/webhook/Dockerfile 2>/dev/null
```

Expected: Webhook likely runs from `/app` or similar in Docker, so it may need explicit path to root `.env`.

**Step 5: Update docker-compose.yaml if needed**

If services don't run from the project root, we need to ensure they use the root `.env`:

```yaml
# Example fix if needed (likely not required):
pulse_mcp:
  <<: *common-service
  # ... other config ...
  working_dir: /app  # Ensure this matches where .env is mounted
```

Expected: Services should already work correctly via `env_file: - .env` inheritance.

**Step 6: Delete local .env files (if they exist)**

Once we verify that services load from root `.env`:

```bash
# Remove local .env files (they're gitignored anyway)
rm -f apps/mcp/.env
rm -f apps/webhook/.env

# Verify they're in .gitignore
grep -E "^\.env$|apps/.*\.env" .gitignore
```

Expected: Local `.env` files removed, `.gitignore` already covers them.

**Step 7: Update .env.example files**

The `apps/mcp/.env.example` and `apps/webhook/.env.example` already have headers stating:

> "For monorepo deployment, use root .env"

Ensure these are clear and prominent:

```bash
# Update apps/mcp/.env.example header
cat > apps/mcp/.env.example << 'EOF'
# ============================================================================
# MCP Server Environment Variables (Standalone Deployment)
# ============================================================================
#
# IMPORTANT: For monorepo deployment, use the root .env file instead!
# This file is only for standalone deployment of the MCP server.
#
# See root .env.example for all available variables.
# ============================================================================
EOF

# Similar for apps/webhook/.env.example
cat > apps/webhook/.env.example << 'EOF'
# ============================================================================
# Webhook Bridge Environment Variables (Standalone Deployment)
# ============================================================================
#
# IMPORTANT: For monorepo deployment, use the root .env file instead!
# This file is only for standalone deployment of the webhook service.
#
# See root .env.example for all available variables.
# ============================================================================
EOF
```

Expected: Clear headers directing users to root `.env` for monorepo deployments.

**Step 8: Document single source of truth in root .env**

Add a header to the root `.env.example`:

```bash
# Add header to root .env.example
cat > .env.example.new << 'EOF'
# ============================================================================
# Firecrawl Monorepo Environment Variables
# ============================================================================
#
# SINGLE SOURCE OF TRUTH: This file contains ALL environment variables for
# ALL services in the monorepo (Firecrawl API, MCP Server, Webhook Bridge).
#
# When deploying via docker-compose, this .env file is automatically loaded
# by all services via the common service anchor.
#
# Individual app .env.example files (apps/mcp/.env.example, etc.) are ONLY
# for standalone deployments and should NOT be used in the monorepo.
#
# ============================================================================
EOF

# Append existing content
cat .env.example >> .env.example.new
mv .env.example.new .env.example
```

Expected: Root `.env.example` clearly states it's the single source of truth.

**Step 9: Update CLAUDE.md to document this decision**

Add a section to [CLAUDE.md](CLAUDE.md) about environment variable management:

```markdown
### Environment Variables

**Single Source of Truth:** The root `.env` file contains ALL environment variables for ALL services.

- `MCP_*` - MCP server variables (namespaced for monorepo)
- `WEBHOOK_*` - Webhook bridge variables (namespaced for monorepo)
- `FIRECRAWL_*` - Firecrawl API variables
- Shared infrastructure: `DATABASE_URL`, `REDIS_URL`

**Docker Compose:** The `env_file: - .env` directive in the common service anchor ensures all containers receive the root `.env`.

**Standalone Deployments:** Individual apps have `.env.example` files for standalone use, but these should NOT be used in monorepo deployments.

**Adding New Variables:**
1. Add to root `.env` and `.env.example`
2. Use namespaced prefixes (`MCP_*`, `WEBHOOK_*`, etc.)
3. Update app-specific code to read from environment
4. Document in this CLAUDE.md
```

**Step 10: Verify no conflicts exist**

```bash
# Run a test to ensure services start correctly
docker compose down
docker compose up -d pulse_mcp pulse_webhook

# Check logs for environment variable loading
docker compose logs pulse_mcp | grep -i "environment\|config\|starting"
docker compose logs pulse_webhook | grep -i "environment\|config\|starting"

# Verify health endpoints
curl http://localhost:3060/health
curl http://localhost:52100/health
```

Expected: Services start successfully and load configuration from root `.env`.

**Completion Criteria:**
- ✅ All services inherit `env_file: - .env` from docker-compose anchor
- ✅ Local `apps/mcp/.env` and `apps/webhook/.env` files deleted (if they exist)
- ✅ App `.env.example` files have clear headers directing to root `.env`
- ✅ Root `.env.example` documents single source of truth
- ✅ CLAUDE.md updated with environment variable management section
- ✅ Services start successfully and read from root `.env`
- ✅ No environment variable conflicts or duplicates

---

## Task 0: Flatten MCP Nested Workspace

**Context:** The MCP app currently has a nested pnpm workspace (local/, remote/, shared/) which complicates tooling and scripts. Flatten it into the main monorepo workspace for consistency.

**Files:**
- Move: `apps/mcp/shared/` → `packages/mcp-shared/`
- Move: `apps/mcp/local/` → `apps/mcp-local/`
- Move: `apps/mcp/remote/` → `apps/mcp-remote/`
- Modify: `pnpm-workspace.yaml`
- Modify: `docker-compose.yaml`
- Delete: `apps/mcp/` (after moving contents)

**Step 1: Create packages/mcp-shared/**

```bash
# Create new directory
mkdir -p packages/mcp-shared

# Copy all files from apps/mcp/shared/ to packages/mcp-shared/
cp -r apps/mcp/shared/* packages/mcp-shared/
cp apps/mcp/shared/.* packages/mcp-shared/ 2>/dev/null || true
```

Run: Copy shared package to packages/

**Step 2: Update packages/mcp-shared/package.json**

```json
{
  "name": "@pulse/mcp-shared",
  "version": "0.3.0",
  "description": "Shared code for Pulse MCP server implementations",
  "main": "dist/index.js",
  "type": "module",
  "scripts": {
    "build": "tsc",
    "test": "vitest",
    "test:run": "vitest run",
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.68.0",
    "@firecrawl/client": "workspace:*",
    "@modelcontextprotocol/sdk": "^1.19.1",
    "dom-to-semantic-markdown": "^1.5.0",
    "jsdom": "^27.1.0",
    "openai": "^5.20.2",
    "pdf-parse": "^1.1.1",
    "zod": "^3.24.2",
    "zod-to-json-schema": "^3.24.6"
  },
  "devDependencies": {
    "@eslint/js": "^9.39.1",
    "@types/jsdom": "^21.1.7",
    "@types/node": "^24.0.0",
    "@types/pdf-parse": "^1.1.5",
    "eslint": "^9.39.1",
    "prettier": "^3.6.2",
    "typescript": "^5.7.3",
    "typescript-eslint": "^8.46.3",
    "vitest": "^3.2.3"
  }
}
```

Run: Update package name to `@pulse/mcp-shared`

**Step 3: Create apps/mcp-local/**

```bash
# Create new directory
mkdir -p apps/mcp-local

# Copy all files from apps/mcp/local/ to apps/mcp-local/
cp -r apps/mcp/local/* apps/mcp-local/
cp apps/mcp/local/.* apps/mcp-local/ 2>/dev/null || true
```

Run: Copy local package to apps/

**Step 4: Update apps/mcp-local/package.json**

```json
{
  "name": "@pulse/mcp-local",
  "version": "0.3.0",
  "description": "Local implementation of Pulse MCP server",
  "mcpName": "com.pulse.servers/pulse",
  "main": "dist/index.js",
  "type": "module",
  "bin": {
    "@pulse/mcp-local": "./dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsx index.ts",
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@pulse/mcp-shared": "workspace:*",
    "@anthropic-ai/sdk": "^0.68.0",
    "@modelcontextprotocol/sdk": "^1.19.1",
    "dom-to-semantic-markdown": "^1.5.0",
    "dotenv": "^17.2.3",
    "jsdom": "^27.1.0",
    "openai": "^5.20.2",
    "pdf-parse": "^1.1.1",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "@eslint/js": "^9.39.1",
    "@types/node": "^24.0.0",
    "@types/jsdom": "^21.1.7",
    "eslint": "^9.39.1",
    "prettier": "^3.6.2",
    "tsx": "^4.19.4",
    "typescript": "^5.7.3",
    "typescript-eslint": "^8.46.3",
    "vitest": "^3.2.3"
  }
}
```

Run: Update dependencies to use `@pulse/mcp-shared` workspace package

**Step 5: Create apps/mcp-remote/**

```bash
# Create new directory
mkdir -p apps/mcp-remote

# Copy all files from apps/mcp/remote/ to apps/mcp-remote/
cp -r apps/mcp/remote/* apps/mcp-remote/
cp apps/mcp/remote/.* apps/mcp-remote/ 2>/dev/null || true
```

Run: Copy remote package to apps/

**Step 6: Update apps/mcp-remote/package.json**

Same pattern as mcp-local, update name to `@pulse/mcp-remote` and dependency to `@pulse/mcp-shared`

**Step 7: Update all import statements**

In both `apps/mcp-local/` and `apps/mcp-remote/`, update imports:

```typescript
// OLD
import { something } from '../shared/...';

// NEW
import { something } from '@pulse/mcp-shared/...';
```

Run: Search and replace import paths in all TypeScript files

**Step 8: Update Dockerfile**

```dockerfile
FROM node:20-alpine AS base
WORKDIR /app

# Copy workspace files
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/firecrawl-client ./packages/firecrawl-client
COPY packages/mcp-shared ./packages/mcp-shared
COPY apps/mcp-local ./apps/mcp-local

# Install dependencies
RUN corepack enable pnpm && pnpm install --frozen-lockfile

# Build packages
RUN pnpm --filter @pulse/mcp-shared build
RUN pnpm --filter @pulse/mcp-local build

# Production stage
FROM node:20-alpine
WORKDIR /app

COPY --from=base /app/packages/mcp-shared/dist ./packages/mcp-shared/dist
COPY --from=base /app/apps/mcp-local/dist ./apps/mcp-local/dist
COPY --from=base /app/node_modules ./node_modules

CMD ["node", "apps/mcp-local/dist/index.js"]
```

Run: Update `apps/mcp-local/Dockerfile` (assuming local is what gets deployed)

**Step 9: Update pnpm-workspace.yaml**

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

Run: Simplify workspace config (already correct if it includes `apps/*` and `packages/*`)

**Step 10: Update docker-compose.yaml**

```yaml
pulse_mcp:
  <<: *common-service
  build:
    context: .
    dockerfile: apps/mcp-local/Dockerfile
  container_name: pulse_mcp
  # ... rest stays same
```

Run: Update build context path

**Step 11: Delete old apps/mcp directory**

```bash
# Verify new structure works first
pnpm install
pnpm --filter @pulse/mcp-shared build
pnpm --filter @pulse/mcp-local build

# If builds succeed, remove old directory
rm -rf apps/mcp
git rm -rf apps/mcp
```

Run: Remove old nested workspace

**Step 12: Update root package.json**

Now we can use simple filters:

```json
{
  "scripts": {
    "build": "pnpm build:packages && pnpm build:apps",
    "build:packages": "pnpm --filter './packages/*' build",
    "build:apps": "pnpm --filter './apps/mcp-local' --filter './apps/web' build",
    "build:mcp": "pnpm --filter '@pulse/mcp-*' build",
    "build:web": "pnpm --filter './apps/web' build",

    "dev": "pnpm --parallel dev:mcp dev:web",
    "dev:mcp": "pnpm --filter '@pulse/mcp-local' dev",
    "dev:web": "pnpm --filter './apps/web' dev"
  }
}
```

Run: Update to use consistent filter patterns

**Step 13: Commit**

```bash
git add packages/mcp-shared apps/mcp-local apps/mcp-remote
git add pnpm-workspace.yaml docker-compose.yaml package.json
git commit -m "refactor: flatten MCP nested workspace into monorepo

- Move apps/mcp/shared → packages/mcp-shared
- Move apps/mcp/local → apps/mcp-local
- Move apps/mcp/remote → apps/mcp-remote
- Update all package names to @pulse/* scope
- Update import paths from relative to workspace references
- Simplify root package.json scripts with consistent filters
- Update Dockerfile and docker-compose.yaml for new structure

Benefits:
- Consistent pnpm filter patterns across all scripts
- Explicit workspace dependencies
- Standard monorepo layout
- Easier tooling integration (Turborepo, Nx, etc.)"
```

---

## Task 1: Create External Services Compose with Docker Context

**Context:** TEI and Qdrant run on a separate GPU-enabled machine. Use Docker contexts to deploy them remotely from the main repo, keeping everything centrally managed.

**Files:**
- Create: `docker-compose.external.yaml`
- Create: `docs/external-services.md`
- Modify: `package.json` (add external service scripts)

**Step 1: Create external services compose file**

```yaml
# docker-compose.external.yaml
# External GPU-dependent services (TEI, Qdrant)
# Run this on a machine with GPU support

name: firecrawl-external

x-common-service: &common-service
  restart: unless-stopped
  env_file:
    - .env

services:
  firecrawl_tei:
    <<: *common-service
    image: ghcr.io/huggingface/text-embeddings-inference:latest
    container_name: firecrawl_tei
    ports:
      - "${TEI_PORT:-50200}:80"
    environment:
      - MODEL_ID=${WEBHOOK_EMBEDDING_MODEL:-Qwen/Qwen3-Embedding-0.6B}
      - REVISION=main
      - MAX_BATCH_SIZE=512
      - MAX_CLIENT_BATCH_SIZE=32
    volumes:
      - ${APPDATA_BASE:-/mnt/cache/appdata}/firecrawl_tei_data:/data
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    command: --model-id ${WEBHOOK_EMBEDDING_MODEL:-Qwen/Qwen3-Embedding-0.6B} --port 80

  firecrawl_qdrant:
    <<: *common-service
    image: qdrant/qdrant:latest
    container_name: firecrawl_qdrant
    ports:
      - "${QDRANT_HTTP_PORT:-50201}:6333"
      - "${QDRANT_GRPC_PORT:-50202}:6334"
    volumes:
      - ${APPDATA_BASE:-/mnt/cache/appdata}/firecrawl_qdrant_storage:/qdrant/storage
    environment:
      - QDRANT__SERVICE__HTTP_PORT=6333
      - QDRANT__SERVICE__GRPC_PORT=6334
```

Run: Save to `docker-compose.external.yaml`

**Step 2: Create external services documentation**

```markdown
# External Services (GPU-Required)

This document describes the external GPU-dependent services (TEI and Qdrant) deployed using Docker contexts.

## Services

### Text Embeddings Inference (TEI)

**Purpose:** Generate text embeddings for semantic search
**Model:** Qwen/Qwen3-Embedding-0.6B (1024 dimensions)
**Port:** 50200 (HTTP)
**GPU Required:** Yes (NVIDIA with CUDA support)

### Qdrant Vector Database

**Purpose:** Store and search document embeddings
**Ports:**
- 50201 (HTTP API)
- 50202 (gRPC)
**GPU Required:** No, but runs on same machine as TEI for network proximity

## Setup with Docker Context

### One-Time Setup

1. **Create Docker context pointing to GPU machine:**

```bash
# Using SSH (recommended)
docker context create gpu-machine --docker "host=ssh://user@gpu-machine-hostname"

# Or using TCP (if Docker API is exposed)
docker context create gpu-machine --docker "host=tcp://gpu-machine-ip:2375"

# Verify context
docker context ls
```

2. **Test connection:**

```bash
docker --context gpu-machine ps
```

### Deploy External Services

Use the provided pnpm scripts to deploy to the GPU context:

```bash
# Deploy external services to GPU machine
pnpm services:external:up

# Check status
pnpm services:external:ps

# View logs
pnpm services:external:logs

# Stop services
pnpm services:external:down
```

### Manual Deployment

If you prefer manual control:

```bash
# Deploy to GPU context
docker --context gpu-machine compose -f docker-compose.external.yaml up -d

# Check status
docker --context gpu-machine compose -f docker-compose.external.yaml ps

# View logs
docker --context gpu-machine compose -f docker-compose.external.yaml logs -f

# Stop services
docker --context gpu-machine compose -f docker-compose.external.yaml down
```

## Environment Variables

The external services read from the same `.env` file. Docker context automatically syncs the environment.

Update your `.env` with the GPU machine's accessible IP/hostname:

```bash
# External Service URLs (use GPU machine's network-accessible address)
WEBHOOK_TEI_URL=http://gpu-machine-ip:50200
WEBHOOK_QDRANT_URL=http://gpu-machine-ip:50201

# Or if using Tailscale
WEBHOOK_TEI_URL=http://tailscale-hostname:50200
WEBHOOK_QDRANT_URL=http://tailscale-hostname:50201
```

## Network Configuration

- External services must be accessible from the main Pulse stack
- Ensure firewall allows incoming connections on ports 50200-50202
- **Recommended:** Use Tailscale for secure mesh networking between machines
- **Alternative:** Use VPN or configure firewall rules

## Health Checks

### TEI
```bash
curl http://gpu-machine-ip:50200/health
# Expected: {"status":"ok"}
```

### Qdrant
```bash
curl http://gpu-machine-ip:50201/collections
# Expected: {"result":{"collections":[]}}
```

## Troubleshooting

### Context connection fails

```bash
# Verify SSH access
ssh user@gpu-machine-hostname

# Check Docker is running on remote
ssh user@gpu-machine-hostname "docker ps"

# Recreate context
docker context rm gpu-machine
docker context create gpu-machine --docker "host=ssh://user@gpu-machine-hostname"
```

### Services won't start

```bash
# Check GPU availability on remote
docker --context gpu-machine run --rm --gpus all nvidia/cuda:12.0-base nvidia-smi

# Check logs
pnpm services:external:logs
```

## Local Development (Without GPU)

For development without a GPU machine:

1. **CPU-only TEI:** Remove GPU requirements from `docker-compose.external.yaml`
2. **Mock services:** Use stub responses for development
3. **Shared dev instance:** Point to a team-shared GPU machine

See main README for development configuration.
```

Run: Save to `docs/external-services.md`

**Step 3: Update .env.example with external service ports**

```bash
# Add to .env.example after webhook section:

# -----------------
# External Services (GPU Machine)
# -----------------
# These services run on a separate machine with GPU support.
# Update URLs to point to your GPU-enabled host.

# Text Embeddings Inference
TEI_PORT=50200
WEBHOOK_TEI_URL=http://localhost:50200

# Qdrant Vector Database
QDRANT_HTTP_PORT=50201
QDRANT_GRPC_PORT=50202
WEBHOOK_QDRANT_URL=http://localhost:50201
```

Run: `git add docker-compose.external.yaml docs/external-services.md .env.example`

**Step 4: Add pnpm scripts for external services**

Add to root `package.json`:

```json
{
  "scripts": {
    "services:external:up": "docker --context gpu-machine compose -f docker-compose.external.yaml up -d",
    "services:external:down": "docker --context gpu-machine compose -f docker-compose.external.yaml down",
    "services:external:ps": "docker --context gpu-machine compose -f docker-compose.external.yaml ps",
    "services:external:logs": "docker --context gpu-machine compose -f docker-compose.external.yaml logs -f",
    "services:external:restart": "pnpm services:external:down && pnpm services:external:up"
  }
}
```

Run: Add external service management scripts

**Step 5: Commit**

```bash
git add docker-compose.external.yaml docs/external-services.md .env.example package.json
git commit -m "feat: add external services with Docker context deployment

- Create docker-compose.external.yaml for TEI and Qdrant
- Document Docker context setup in docs/external-services.md
- Add pnpm scripts for remote deployment (services:external:*)
- Add external service ports to .env.example
- Services deploy to gpu-machine context via Docker SSH
- Centralized management from main repo

Benefits:
- No manual file copying to GPU machine
- Unified deployment from monorepo
- Docker context handles remote execution
- Same .env file for all services"
```

---

## Task 2: Standardize Port Allocations (50100-50110)

**Context:** Current ports are scattered (3002, 3060, 4300-4305, 52100). Need sequential high-port block.

**Files:**
- Modify: `docker-compose.yaml`
- Modify: `.env`
- Modify: `.env.example`
- Modify: `.docs/services-ports.md`
- Modify: `README.md`

**Step 1: Update docker-compose.yaml ports**

Change all port mappings to 50100+ range:

```yaml
# Old → New mappings:
# Playwright: 4302 → 50100
# Firecrawl Internal: 3002 → 50101 (internal stays 3002)
# Firecrawl External: 4300 → 50102
# Worker: 4301 → 50103
# Redis: 4303 → 50104
# PostgreSQL: 4304 → 50105
# Extract Worker: 4305 → 50106
# MCP: 3060 → 50107
# Webhook: 52100 → 50108
```

Update docker-compose.yaml:

```yaml
services:
  pulse_playwright:
    ports:
      - "${PLAYWRIGHT_PORT:-50100}:3000"

  firecrawl:
    ports:
      - "${FIRECRAWL_PORT:-50102}:${FIRECRAWL_INTERNAL_PORT:-3002}"

  pulse_redis:
    ports:
      - "${REDIS_PORT:-50104}:6379"

  pulse_postgres:
    ports:
      - "${POSTGRES_PORT:-50105}:5432"

  pulse_mcp:
    ports:
      - "${MCP_PORT:-50107}:3060"

  pulse_webhook:
    ports:
      - "${WEBHOOK_PORT:-50108}:52100"
```

Run: Apply changes to `docker-compose.yaml`

**Step 2: Update .env with new ports**

```bash
# Update these lines in .env:
FIRECRAWL_PORT=50102
FIRECRAWL_INTERNAL_PORT=3002
WORKER_PORT=50103
EXTRACT_WORKER_PORT=50106
POSTGRES_PORT=50105
REDIS_PORT=50104
PLAYWRIGHT_PORT=50100
MCP_PORT=50107
WEBHOOK_PORT=50108
```

Run: Apply changes to `.env`

**Step 3: Update .env.example with new ports**

Same changes as Step 2, applied to `.env.example`

**Step 4: Update .docs/services-ports.md**

```markdown
# Firecrawl Services Port Allocation

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
| N/A   | Webhook Worker           | pulse_webhook_worker  | N/A      | Active |

## External Service URLs (Host Access)

- **Firecrawl API**: `http://localhost:50102`
- **MCP Server**: `http://localhost:50107`
- **Webhook Bridge**: `http://localhost:50108`
- **Redis**: `redis://localhost:50104`
- **PostgreSQL**: `postgresql://localhost:50105/pulse_postgres`
- **Playwright**: `http://localhost:50100`
```

Run: Replace port table in `.docs/services-ports.md`

**Step 5: Update README.md port references**

Search and replace in README.md:
- Port 4300 → 50102
- Port 3060 → 50107
- Port 52100 → 50108
- Port 4303 → 50104
- Port 4304 → 50105

Run: `git add docker-compose.yaml .env .env.example .docs/services-ports.md README.md`

**Step 6: Commit**

```bash
git commit -m "feat: standardize ports to 50100-50110 range

- Move all services to sequential high-numbered ports
- Update docker-compose.yaml port mappings
- Update .env and .env.example with new ports
- Update documentation in services-ports.md and README.md

Port mapping:
- Playwright: 4302 → 50100
- Firecrawl External: 4300 → 50102
- Redis: 4303 → 50104
- PostgreSQL: 4304 → 50105
- MCP: 3060 → 50107
- Webhook: 52100 → 50108

Follows service lifecycle guideline for high-numbered sequential ports."
```

---

## Task 3: Remove Makefiles and Migrate to pnpm Scripts

**Context:** Makefiles should be removed and all workflows unified under pnpm scripts.

**Files:**
- Delete: `apps/webhook/Makefile`
- Modify: `package.json` (root)
- Modify: `apps/webhook/README.md`

**Step 1: Delete Makefile**

```bash
rm apps/webhook/Makefile
git rm apps/webhook/Makefile
```

Run: Remove Makefile

**Step 2: Enhance root package.json scripts**

**Note:** After Task 0, the MCP workspace is flattened, so we can use consistent pnpm filter patterns.

Update `package.json` scripts section:

```json
{
  "scripts": {
    "build": "pnpm build:packages && pnpm build:apps",
    "build:packages": "pnpm --filter './packages/*' build",
    "build:apps": "pnpm --filter '@pulse/mcp-local' --filter './apps/web' build",
    "build:mcp": "pnpm --filter '@pulse/mcp-*' build",
    "build:web": "pnpm --filter './apps/web' build",
    "build:webhook": "cd apps/webhook && uv sync",

    "test": "pnpm test:packages && pnpm test:apps",
    "test:packages": "pnpm --filter './packages/*' test",
    "test:apps": "pnpm --filter '@pulse/mcp-local' --filter './apps/web' test",
    "test:mcp": "pnpm --filter '@pulse/mcp-*' test",
    "test:web": "pnpm --filter './apps/web' test",
    "test:webhook": "cd apps/webhook && uv run pytest tests/ -v",

    "dev": "pnpm --parallel dev:mcp dev:web",
    "dev:all": "pnpm --parallel dev:mcp dev:web dev:webhook",
    "dev:mcp": "pnpm --filter '@pulse/mcp-local' dev",
    "dev:web": "pnpm --filter './apps/web' dev",
    "dev:webhook": "cd apps/webhook && uv run uvicorn app.main:app --host 0.0.0.0 --port 50108 --reload",

    "worker:webhook": "cd apps/webhook && uv run python -m app.worker",

    "clean": "pnpm clean:packages && pnpm clean:apps && pnpm clean:webhook",
    "clean:packages": "pnpm --filter './packages/*' clean",
    "clean:apps": "pnpm --filter '@pulse/mcp-*' --filter './apps/web' clean",
    "clean:webhook": "cd apps/webhook && rm -rf .cache .pytest_cache .mypy_cache .ruff_cache",

    "format": "pnpm format:js && pnpm format:webhook",
    "format:js": "pnpm --filter './packages/*' --filter '@pulse/mcp-*' --filter './apps/web' format",
    "format:webhook": "cd apps/webhook && uv run ruff format .",

    "lint": "pnpm lint:js && pnpm lint:webhook",
    "lint:js": "pnpm --filter './packages/*' --filter '@pulse/mcp-*' --filter './apps/web' lint",
    "lint:webhook": "cd apps/webhook && uv run ruff check .",

    "typecheck": "pnpm typecheck:js && pnpm typecheck:webhook",
    "typecheck:js": "pnpm --filter './packages/*' --filter '@pulse/mcp-*' --filter './apps/web' typecheck",
    "typecheck:webhook": "cd apps/webhook && uv run mypy app/",

    "install:webhook": "cd apps/webhook && uv sync",

    "services:up": "docker compose up -d",
    "services:down": "docker compose down",
    "services:logs": "docker compose logs -f",
    "services:restart": "pnpm services:down && pnpm services:up",

    "check": "pnpm format && pnpm lint && pnpm typecheck"
  }
}
```

Run: Replace scripts section in `package.json`

**Step 3: Update webhook README to reference pnpm scripts**

Find all Makefile command references and replace:

```markdown
# OLD
make install → pnpm install:webhook
make dev → pnpm dev:webhook
make worker → pnpm worker:webhook
make test → pnpm test:webhook
make format → pnpm format:webhook
make lint → pnpm lint:webhook
make type-check → pnpm typecheck:webhook
make check → pnpm check
make clean → pnpm clean:webhook
```

Update Development section:

```markdown
## Development

### Setup

```bash
# Install all dependencies (Node.js and Python)
pnpm install
pnpm install:webhook
```

### Running Services

```bash
# Start all Docker services
pnpm services:up

# Run API server in development mode
pnpm dev:webhook

# Run worker in separate terminal
pnpm worker:webhook

# Or run everything together
pnpm dev:all
```

### Code Quality

```bash
# Format code
pnpm format:webhook

# Lint code
pnpm lint:webhook

# Type check
pnpm typecheck:webhook

# Run all checks
pnpm check
```

### Testing

```bash
# Run tests
pnpm test:webhook

# With coverage
cd apps/webhook && uv run pytest tests/ -v --cov=app --cov-report=term-missing
```
```

Run: Update `apps/webhook/README.md`

**Step 4: Commit**

```bash
git commit -m "refactor: remove Makefile and migrate to pnpm scripts

- Delete apps/webhook/Makefile
- Add comprehensive pnpm scripts for webhook operations
- Add unified dev:all script to run MCP, web, and webhook together
- Add format, lint, typecheck scripts for cross-language consistency
- Update webhook README to reference pnpm scripts instead of make

All workflows now unified under pnpm for better monorepo integration."
```

---

## Task 4: Create AGENTS.md Symlinks

**Context:** Symlink all CLAUDE.md files to AGENTS.md for Open Standards compatibility.

**Files:**
- Create symlink: `AGENTS.md` → `CLAUDE.md`
- Create symlink: `apps/mcp/AGENTS.md` → `apps/mcp/CLAUDE.md`
- Create symlink: `apps/web/AGENTS.md` → `apps/web/CLAUDE.md`
- Create symlink: `apps/webhook/AGENTS.md` → `apps/webhook/CLAUDE.md`

**Step 1: Create root AGENTS.md symlink**

```bash
ln -s CLAUDE.md AGENTS.md
git add AGENTS.md
```

Run: Create and stage symlink

**Step 2: Check for app-level CLAUDE.md files**

```bash
find apps/ -name "CLAUDE.md" -type f
```

Run: Find existing CLAUDE.md files

**Step 3: Create symlinks for any existing CLAUDE.md files**

```bash
# For each found CLAUDE.md:
cd apps/mcp && ln -s CLAUDE.md AGENTS.md && git add AGENTS.md
cd apps/web && ln -s CLAUDE.md AGENTS.md && git add AGENTS.md
cd apps/webhook && ln -s CLAUDE.md AGENTS.md && git add AGENTS.md
```

Run: Create symlinks (if CLAUDE.md files exist)

**Step 4: Commit**

```bash
git commit -m "docs: add AGENTS.md symlinks for Open Standards compatibility

- Create AGENTS.md → CLAUDE.md symlinks at root and app levels
- Enables compatibility with Open Standards AI assistants
- No content duplication, symlinks keep files in sync"
```

---

## Task 5: Create .docs/deployment-log.md

**Context:** Required operational doc is missing.

**Files:**
- Create: `docs/deployment-log.md`

**Step 1: Create deployment log template**

```markdown
# Deployment Log

This file tracks all deployments and significant infrastructure changes to the Pulse monorepo.

Format: `YYYY-MM-DD HH:MM:SS | Service | Action | Port | Notes`

---

## 2025-11-10

### 10:30:00 | All Services | Port Standardization | 50100-50110
- Migrated all services to sequential high-numbered ports
- Playwright: 50100
- Firecrawl: 50102
- Redis: 50104
- PostgreSQL: 50105
- MCP: 50107
- Webhook: 50108

### 10:45:00 | External Services | Documentation | 50200-50202
- Created docker-compose.external.yaml for TEI and Qdrant
- Documented GPU requirements and external hosting
- TEI: 50200, Qdrant: 50201-50202

---

## 2025-11-09

### 20:54:00 | All Services | Cleanup | Various
- Removed apps/api directory (using official Firecrawl image)
- Consolidated Docker compose configuration
- Removed standalone compose files

### 19:30:00 | Integration Testing | Complete | N/A
- All services verified working together
- Database schema migrations tested
- Health checks passing

---

## 2025-11-08

### 23:28:00 | Security | Audit | N/A
- Completed security audit for monorepo dependencies
- pnpm audit: 0 vulnerabilities
- pip-audit: 0 vulnerabilities

### 16:00:00 | MCP Server | Environment Migration | 3060
- Migrated to namespaced MCP_* environment variables
- Backward compatibility with legacy variable names maintained

---

## Instructions

When deploying changes:

1. Add entry with timestamp in EST (HH:MM:SS | MM/DD/YYYY)
2. Include service name, action type, port (if applicable)
3. Brief notes about what changed
4. Commit this file with the deployment

Action types:
- Deploy: New deployment
- Update: Configuration change
- Restart: Service restart
- Migrate: Database migration
- Rollback: Revert to previous version
- Scale: Resource adjustment
```

Run: Save to `docs/deployment-log.md`

**Step 2: Commit**

```bash
git add docs/deployment-log.md
git commit -m "docs: create deployment log tracking file

- Add docs/deployment-log.md with initial entries
- Document port standardization and recent deployments
- Includes template and instructions for future entries"
```

---

## Task 6: Move Session Logs from .docs/tmp to .docs/sessions

**Context:** Session logs should be in .docs/sessions/, not .docs/tmp/.

**Files:**
- Create: `.docs/sessions/` directory
- Move: All `.docs/tmp/*.md` → `.docs/sessions/`
- Delete: `.docs/tmp/` directory

**Step 1: Create sessions directory**

```bash
mkdir -p .docs/sessions
```

Run: Create directory

**Step 2: Move all session logs**

```bash
mv .docs/tmp/2025-11-10-*.md .docs/sessions/ 2>/dev/null || true
mv .docs/architecture-investigation-2025-11-09.md .docs/sessions/
mv .docs/execution-summary-2025-11-09.md .docs/sessions/
mv .docs/integration-test-blockers-2025-11-09.md .docs/sessions/
mv .docs/task-15-integration-tests-complete.md .docs/sessions/
mv .docs/task-16-cleanup-complete.md .docs/sessions/
mv .docs/test-results-2025-11-09.md .docs/sessions/
mv .docs/webhook-troubleshooting.md .docs/sessions/
mv .docs/security-audit-2025-01-08.md .docs/sessions/
```

Run: Move files

**Step 3: Remove tmp directory**

```bash
rmdir .docs/tmp 2>/dev/null || rm -rf .docs/tmp
```

Run: Remove directory

**Step 4: Stage changes**

```bash
git add .docs/sessions/
git add .docs/
```

Run: Stage all changes

**Step 5: Commit**

```bash
git commit -m "refactor: move session logs to .docs/sessions/

- Create .docs/sessions/ directory
- Move all session logs from .docs/ and .docs/tmp/
- Remove .docs/tmp/ directory
- Follows documentation standards for session log placement"
```

---

## Task 7: Update apps/web/README.md to Remove Vercel References

**Context:** Frontend README still has default Next.js template promoting Vercel.

**Files:**
- Modify: `apps/web/README.md`
- Modify: `apps/web/app/page.tsx` (if needed)

**Step 1: Read current web README**

```bash
cat apps/web/README.md
```

Run: Check current content

**Step 2: Replace README with Pulse-specific content**

```markdown
# Pulse Web Interface

Modern web interface for the Pulse web intelligence platform, built with Next.js 15 and TypeScript.

## Overview

The Pulse web interface provides a user-friendly way to interact with:
- **Firecrawl API**: Submit scraping and crawling jobs
- **MCP Server**: Configure Claude Desktop integration
- **Webhook Bridge**: Search indexed content with hybrid vector/BM25 search

## Technology Stack

- **Framework**: Next.js 15+ with App Router
- **Language**: TypeScript with strict mode
- **UI**: React 19+ with hooks
- **Styling**: TailwindCSS v4+
- **Components**: shadcn/ui (Radix UI + Tailwind)
- **Package Manager**: pnpm

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 8+

### Installation

```bash
# From repository root
pnpm install

# Or just web dependencies
pnpm --filter './apps/web' install
```

### Development

```bash
# From repository root
pnpm dev:web

# Or from apps/web/
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to see the interface.

### Building

```bash
# Production build
pnpm build:web

# Start production server
pnpm --filter './apps/web' start
```

## Project Structure

```
apps/web/
├── app/              # Next.js app router pages
├── components/       # React components
├── lib/              # Utilities and helpers
├── public/           # Static assets
├── styles/           # Global styles
└── package.json      # Dependencies and scripts
```

## Environment Variables

Create `.env.local`:

```bash
# API endpoints (from main .env)
NEXT_PUBLIC_FIRECRAWL_API_URL=http://localhost:50102
NEXT_PUBLIC_MCP_URL=http://localhost:50107
NEXT_PUBLIC_WEBHOOK_URL=http://localhost:50108
```

## Features

### Current
- Landing page with platform overview
- Links to service documentation

### Planned
- Job submission interface for scraping/crawling
- Real-time job status monitoring
- Search interface for indexed content
- MCP configuration UI
- Usage analytics dashboard

## Development Guidelines

- Use TypeScript strict mode (no `any` types)
- Functional components with hooks only
- Named exports (no default exports)
- Mobile-first responsive design
- Tailwind utility classes for styling

## Testing

```bash
# Run tests
pnpm test:web

# With watch mode
pnpm --filter './apps/web' test -- --watch
```

## Deployment

This application is designed for self-hosted deployment using Docker:

```bash
# Build Docker image
docker build -t pulse-web ./apps/web

# Run container
docker run -p 3000:3000 pulse-web
```

For production deployments, see the main repository README.

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [shadcn/ui](https://ui.shadcn.com/)
- [Pulse Main Repository](../../README.md)
```

Run: Replace `apps/web/README.md` content

**Step 3: Check and update page.tsx if needed**

```bash
grep -i "vercel" apps/web/app/page.tsx
```

Run: Check for Vercel references

**Step 4: If Vercel references exist, update page.tsx**

Create a simple Pulse landing page:

```tsx
export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="max-w-5xl w-full items-center justify-between font-mono text-sm">
        <h1 className="text-4xl font-bold mb-8 text-center">
          Pulse
        </h1>
        <p className="text-xl text-center mb-12">
          Integrated Web Intelligence Platform
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-12">
          <div className="border rounded-lg p-6">
            <h2 className="text-2xl font-semibold mb-4">Firecrawl API</h2>
            <p className="text-gray-600 dark:text-gray-400">
              Enterprise-grade web scraping and crawling with advanced features.
            </p>
            <a
              href="http://localhost:50102"
              className="mt-4 inline-block text-blue-600 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              API Documentation →
            </a>
          </div>

          <div className="border rounded-lg p-6">
            <h2 className="text-2xl font-semibold mb-4">MCP Server</h2>
            <p className="text-gray-600 dark:text-gray-400">
              Model Context Protocol integration for Claude Desktop.
            </p>
            <a
              href="http://localhost:50107/health"
              className="mt-4 inline-block text-blue-600 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Health Check →
            </a>
          </div>

          <div className="border rounded-lg p-6">
            <h2 className="text-2xl font-semibold mb-4">Search Bridge</h2>
            <p className="text-gray-600 dark:text-gray-400">
              Hybrid vector and BM25 semantic search for scraped content.
            </p>
            <a
              href="http://localhost:50108/docs"
              className="mt-4 inline-block text-blue-600 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              API Docs →
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}
```

Run: Update `apps/web/app/page.tsx` only if Vercel references exist

**Step 5: Commit**

```bash
git add apps/web/README.md apps/web/app/page.tsx
git commit -m "docs: update web app README and remove Vercel references

- Replace Next.js template README with Pulse-specific content
- Document web interface purpose and features
- Add development and deployment instructions
- Update landing page to show Pulse services (if needed)
- Remove prohibited Vercel references"
```

---

## Task 8: Remove Stale npm Lockfiles

**Context:** npm lockfiles in a pnpm workspace cause accidental downgrades.

**Files:**
- Delete: `apps/mcp/remote/package-lock.json`
- Delete: `packages/firecrawl-client/package-lock.json`

**Step 1: Remove lockfiles**

```bash
rm apps/mcp/remote/package-lock.json
rm packages/firecrawl-client/package-lock.json
git rm apps/mcp/remote/package-lock.json
git rm packages/firecrawl-client/package-lock.json
```

Run: Delete files

**Step 2: Verify pnpm lockfile is up to date**

```bash
pnpm install
```

Run: Regenerate lockfile

**Step 3: Commit**

```bash
git add pnpm-lock.yaml
git commit -m "chore: remove stale npm lockfiles from pnpm workspace

- Delete apps/mcp/remote/package-lock.json
- Delete packages/firecrawl-client/package-lock.json
- Update pnpm-lock.yaml to ensure consistency
- Prevents accidental downgrades when using npm instead of pnpm"
```

---

## Task 9: Create packages/firecrawl-client/README.md

**Context:** Shared client package is undocumented.

**Files:**
- Create: `packages/firecrawl-client/README.md`

**Step 1: Investigate package structure**

```bash
# Already done - we know the structure:
# - FirecrawlClient unified client
# - Specialized clients (scraping, search, map, crawl)
# - Operations and types
# - zod validation
```

**Step 2: Create comprehensive README**

```markdown
# @firecrawl/client

Shared TypeScript client for the Firecrawl API, used across the Pulse monorepo.

## Overview

This package provides a unified, type-safe client for interacting with the Firecrawl API. It includes support for all Firecrawl operations: scraping, searching, mapping, and crawling.

## Features

- **Unified Client**: Single `FirecrawlClient` class for all operations
- **Specialized Clients**: Dedicated clients for scraping, search, map, and crawl
- **Type Safety**: Full TypeScript support with Zod runtime validation
- **Zero Dependencies**: Only depends on Zod for validation
- **Tree-Shakeable**: ESM exports for optimal bundle size

## Installation

This package is intended for internal use within the Pulse monorepo. It's automatically available via pnpm workspaces:

```json
{
  "dependencies": {
    "@firecrawl/client": "workspace:*"
  }
}
```

## Usage

### Unified Client (Recommended)

```typescript
import { FirecrawlClient } from '@firecrawl/client';

const client = new FirecrawlClient({
  apiKey: process.env.FIRECRAWL_API_KEY,
  baseUrl: 'https://api.firecrawl.dev', // optional
});

// Scrape a single page
const scrapeResult = await client.scrape('https://example.com', {
  formats: ['markdown', 'html'],
  onlyMainContent: true,
});

// Search for content
const searchResult = await client.search({
  query: 'artificial intelligence',
  limit: 10,
});

// Map website structure
const mapResult = await client.map({
  url: 'https://example.com',
  search: 'documentation',
});

// Start a crawl
const crawlResult = await client.startCrawl({
  url: 'https://example.com',
  limit: 100,
  scrapeOptions: {
    formats: ['markdown'],
  },
});

// Check crawl status
const status = await client.getCrawlStatus(crawlResult.id);

// Cancel crawl
await client.cancelCrawl(crawlResult.id);
```

### Specialized Clients

For operations requiring advanced configuration, use specialized clients:

```typescript
import {
  FirecrawlScrapingClient,
  FirecrawlSearchClient,
  FirecrawlMapClient,
  FirecrawlCrawlClient,
} from '@firecrawl/client';

const config = {
  apiKey: process.env.FIRECRAWL_API_KEY,
  baseUrl: 'https://api.firecrawl.dev',
};

const scrapingClient = new FirecrawlScrapingClient(config);
const result = await scrapingClient.scrape('https://example.com');
```

## API Reference

### FirecrawlClient

Main client class providing all Firecrawl operations.

#### Methods

##### `scrape(url: string, options?: FirecrawlScrapingOptions): Promise<FirecrawlScrapingResult>`

Scrape a single webpage.

**Options:**
- `formats`: Output formats (`markdown`, `html`, `rawHtml`, `links`, `screenshot`)
- `onlyMainContent`: Extract only main content (default: `true`)
- `includeTags`: HTML tags to include
- `excludeTags`: HTML tags to exclude
- `headers`: Custom HTTP headers
- `waitFor`: Milliseconds to wait before scraping
- `timeout`: Request timeout in milliseconds

##### `search(options: SearchOptions): Promise<SearchResult>`

Search for content using Firecrawl.

**Options:**
- `query`: Search query (required)
- `limit`: Maximum results (default: `10`)
- `lang`: Language code (default: `en`)
- `country`: Country code
- `tbs`: Time-based search filter
- `scrapeOptions`: Options for scraping search results

##### `map(options: MapOptions): Promise<MapResult>`

Map website structure to discover URLs.

**Options:**
- `url`: Base URL to map (required)
- `search`: Optional search query to filter URLs
- `ignoreSitemap`: Skip sitemap discovery
- `includeSubdomains`: Include subdomain URLs
- `limit`: Maximum URLs to return

##### `startCrawl(options: CrawlOptions): Promise<StartCrawlResult>`

Start a multi-page crawl job.

**Options:**
- `url`: Starting URL (required)
- `limit`: Maximum pages to crawl
- `includePaths`: URL patterns to include
- `excludePaths`: URL patterns to exclude
- `maxDepth`: Maximum crawl depth
- `allowBackwardLinks`: Allow links to already-visited pages
- `allowExternalLinks`: Follow external links
- `scrapeOptions`: Options for scraping each page

##### `getCrawlStatus(jobId: string): Promise<CrawlStatusResult>`

Get status and results of a crawl job.

##### `cancelCrawl(jobId: string): Promise<CancelResult>`

Cancel a running crawl job.

## Type Exports

All types are exported for use in consuming applications:

```typescript
import type {
  FirecrawlConfig,
  FirecrawlScrapingOptions,
  FirecrawlScrapingResult,
  SearchOptions,
  SearchResult,
  MapOptions,
  MapResult,
  CrawlOptions,
  StartCrawlResult,
  CrawlStatusResult,
  CancelResult,
} from '@firecrawl/client';
```

## Error Handling

All operations throw errors with descriptive messages:

```typescript
import { FirecrawlClient } from '@firecrawl/client';

try {
  const client = new FirecrawlClient({
    apiKey: process.env.FIRECRAWL_API_KEY,
  });

  const result = await client.scrape('https://example.com');
} catch (error) {
  if (error instanceof Error) {
    console.error('Scraping failed:', error.message);
  }
}
```

## Development

### Building

```bash
# From repository root
pnpm build:packages

# Or from this package
pnpm build
```

### Type Checking

TypeScript configuration is in `tsconfig.json`:
- Target: ES2022
- Module: ESNext
- Strict mode enabled
- Declaration files generated

## Dependencies

- **zod**: Runtime type validation (^3.24.2)

## License

Part of the Pulse monorepo. See repository root for license information.
```

Run: Save to `packages/firecrawl-client/README.md`

**Step 3: Commit**

```bash
git add packages/firecrawl-client/README.md
git commit -m "docs: create comprehensive README for firecrawl-client package

- Document unified FirecrawlClient and specialized clients
- Add API reference for all methods and options
- Include usage examples for common operations
- List all exported types for TypeScript consumers
- Add error handling and development instructions

Fulfills Task 4 requirement from monorepo integration plan."
```

---

## Task 10: Update Python Version Requirement Documentation

**Context:** pyproject.toml requires Python >=3.12 but README claims 3.11+.

**Files:**
- Modify: `apps/webhook/README.md`
- Verify: `apps/webhook/pyproject.toml`

**Step 1: Verify Python version requirement**

```bash
grep "requires-python" apps/webhook/pyproject.toml
```

Run: Confirm version requirement

Expected: `requires-python = ">=3.12"`

**Step 2: Update webhook README**

Find and replace in `apps/webhook/README.md`:

```markdown
# OLD
Python 3.11+

# NEW
Python 3.12+
```

Also update any other "3.11" references to "3.12"

**Step 3: Determine why 3.12 is required**

```bash
grep -r "3.13" apps/webhook/pyproject.toml
```

Run: Check for 3.13 requirements

**Step 4: If 3.12 is not strictly needed, downgrade requirement**

If no features require 3.12+, update pyproject.toml:

```toml
# Only if safe to downgrade
requires-python = ">=3.11"
target-version = "py311"  # in [tool.ruff] section
python_version = "3.11"    # in [tool.mypy] section
```

**Step 5: Commit**

```bash
# If keeping 3.12:
git add apps/webhook/README.md
git commit -m "docs: correct Python version requirement to 3.12+

- Update README to match pyproject.toml requirement
- Python 3.12+ required for modern type hints and performance"

# OR if downgrading to 3.11:
git add apps/webhook/README.md apps/webhook/pyproject.toml
git commit -m "fix: downgrade Python requirement to 3.11+

- Update pyproject.toml to require Python >=3.11
- Update tooling targets to py311
- No features require 3.12+ specifically"
```

---

## Task 11: Update Main README Developer Workflow

**Context:** README claims incorrect command runs services together.

**Files:**
- Modify: `README.md`

**Step 1: Find and update development section**

Locate the Quick Start or Development section mentioning `pnpm dev`.

**Step 2: Replace with accurate instructions**

```markdown
## Quick Start

### Using Docker Compose (Recommended)

```bash
# Start all services
docker compose up -d

# Check service health
docker compose ps

# View logs
docker compose logs -f
```

Services will be available at:
- Firecrawl API: http://localhost:50102
- MCP Server: http://localhost:50107
- Webhook Bridge: http://localhost:50108

### Local Development

For active development on individual services:

```bash
# Install dependencies
pnpm install

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

Note: External services (TEI, Qdrant) must be running separately. See `docs/external-services.md`.
```

**Step 3: Commit**

```bash
git add README.md
git commit -m "docs: correct developer workflow instructions

- Clarify that 'pnpm dev' runs MCP + web only
- Document 'pnpm dev:all' for running MCP + web + webhook
- Add Docker Compose as recommended approach
- Note external service requirements
- Update port numbers to new 50100-50110 range"
```

---

## Task 12: Create .gitignore Entry for .docs/tmp (If Recreated)

**Context:** Prevent future temp files from being committed.

**Files:**
- Modify: `.gitignore`

**Step 1: Add .docs/tmp to .gitignore**

```bash
echo "" >> .gitignore
echo "# Documentation temporary files" >> .gitignore
echo ".docs/tmp/" >> .gitignore
```

Run: Append to .gitignore

**Step 2: Commit**

```bash
git add .gitignore
git commit -m "chore: ignore .docs/tmp directory

- Add .docs/tmp/ to .gitignore
- Prevent temporary documentation files from being committed
- Session logs should use .docs/sessions/ instead"
```

---

## Task 13: Update .env with Corrected Port Numbers

**Context:** After port standardization, need to ensure .env matches new values.

**Files:**
- Modify: `.env`

**Step 1: Update all port variables in .env**

Apply the same changes as Task 2, Step 2 to the actual `.env` file:

```bash
# Update in .env:
PLAYWRIGHT_PORT=50100
FIRECRAWL_INTERNAL_PORT=3002
FIRECRAWL_PORT=50102
WORKER_PORT=50103
REDIS_PORT=50104
POSTGRES_PORT=50105
EXTRACT_WORKER_PORT=50106
MCP_PORT=50107
WEBHOOK_PORT=50108
```

Run: Edit `.env` file

**Step 2: Update service URLs in .env**

Ensure internal URLs don't reference old ports:

```bash
# These should use container names (no port changes needed):
REDIS_URL=redis://pulse_redis:6379
NUQ_DATABASE_URL=postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@pulse_postgres:5432/${POSTGRES_DB}
WEBHOOK_DATABASE_URL=postgresql+asyncpg://${POSTGRES_USER}:${POSTGRES_PASSWORD}@pulse_postgres:5432/${POSTGRES_DB}
WEBHOOK_REDIS_URL=redis://pulse_redis:6379
PLAYWRIGHT_MICROSERVICE_URL=http://pulse_playwright:3000/scrape
SELF_HOSTED_WEBHOOK_URL=http://pulse_webhook:52100/api/webhook/firecrawl
```

**Step 3: Verify external service URLs**

```bash
# These point to external GPU machine (keep as-is):
WEBHOOK_QDRANT_URL=http://100.74.16.82:6333
WEBHOOK_TEI_URL=https://tei.tootie.tv
```

**Step 4: Test configuration**

```bash
docker compose config
```

Run: Validate docker-compose with new env vars

Expected: No errors, services configured correctly

**Step 5: Do NOT commit .env**

```bash
# Verify .env is gitignored
git status | grep -q ".env" && echo "WARNING: .env is tracked!" || echo "OK: .env is ignored"
```

Run: Confirm .env not tracked

Note: `.env` should never be committed, only `.env.example`

---

## Task 14: Final Verification and Testing

**Context:** Validate all changes work together.

**Files:**
- None (verification only)

**Step 1: Rebuild and restart services**

```bash
docker compose down
docker compose build --no-cache
docker compose up -d
```

Run: Full rebuild and restart

**Step 2: Verify all services are healthy**

```bash
# Wait for services to start
sleep 30

# Check container status
docker compose ps

# Test health endpoints
curl -f http://localhost:50107/health || echo "MCP health check failed"
curl -f http://localhost:50108/health || echo "Webhook health check failed"
curl -f http://localhost:50102/ || echo "Firecrawl check failed"
```

Run: Verify services

Expected: All services running, health checks passing

**Step 3: Test pnpm scripts**

```bash
# Test dev scripts
pnpm dev:mcp &
MCP_PID=$!
sleep 5
kill $MCP_PID

pnpm dev:web &
WEB_PID=$!
sleep 5
kill $WEB_PID

pnpm dev:webhook &
WEBHOOK_PID=$!
sleep 5
kill $WEBHOOK_PID
```

Run: Verify dev scripts work

**Step 4: Test build scripts**

```bash
pnpm build:mcp
pnpm build:web
pnpm build:packages
pnpm build:webhook
```

Run: Verify builds succeed

**Step 5: Run tests**

```bash
pnpm test:mcp
pnpm test:web
pnpm test:packages
pnpm test:webhook
```

Run: Verify tests pass

**Step 6: Verify documentation**

```bash
# Check all required docs exist
test -f AGENTS.md && echo "✓ AGENTS.md" || echo "✗ AGENTS.md missing"
test -f docs/deployment-log.md && echo "✓ deployment-log.md" || echo "✗ deployment-log.md missing"
test -f docs/external-services.md && echo "✓ external-services.md" || echo "✗ external-services.md missing"
test -f packages/firecrawl-client/README.md && echo "✓ firecrawl-client README" || echo "✗ firecrawl-client README missing"
test -d .docs/sessions && echo "✓ sessions directory" || echo "✗ sessions directory missing"
test ! -d .docs/tmp && echo "✓ tmp removed" || echo "✗ tmp still exists"
test ! -f apps/webhook/Makefile && echo "✓ Makefile removed" || echo "✗ Makefile still exists"
test ! -f apps/mcp/remote/package-lock.json && echo "✓ npm lockfiles removed" || echo "✗ npm lockfiles exist"
```

Run: Verify documentation changes

**Step 7: Create final summary**

Note any failures or issues found during verification

---

## Summary

This plan addresses all identified monorepo integration issues:

1. ✅ External services (TEI/Qdrant) documented with docker-compose template
2. ✅ Ports standardized to 50100-50110 sequential range
3. ✅ Makefiles removed, workflows unified under pnpm scripts
4. ✅ AGENTS.md symlinks created for Open Standards compatibility
5. ✅ Deployment log created
6. ✅ Session logs moved to correct location
7. ✅ Web app Vercel references removed
8. ✅ Stale npm lockfiles deleted
9. ✅ Firecrawl client package documented
10. ✅ Python version documentation corrected
11. ✅ Developer workflow instructions updated
12. ✅ .gitignore updated for temp files

## Execution Options

**Plan complete and saved to `docs/plans/2025-11-10-monorepo-cleanup.md`.**

**Two execution options:**

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
