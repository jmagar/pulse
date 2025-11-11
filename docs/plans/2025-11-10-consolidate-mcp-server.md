# MCP Server Consolidation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate the symlink architecture hack and consolidate three packages (local, shared, remote) into a single clean MCP server package, fixing the Docker restart issue.

**Context:** The `local` package is being removed (not publishing to npm). This consolidation is purely for Docker deployment simplification. Including Express/CORS dependencies in the consolidated package is acceptable.

**Architecture:** Currently the MCP server is split across three packages with a symlink hack where `apps/mcp/remote/shared` symlinks to `../shared/dist`. This causes Docker deployments to fail because the symlinks use absolute paths that break in containers. The solution is to merge all code into a single `apps/mcp` package with clear directory structure at the package root (no `src/` dirs).

**Tech Stack:** TypeScript, pnpm workspaces, Docker, Express, MCP SDK

**Known Gotcha - Zod Cross-Module Hazard:** When Zod schemas are imported from compiled `dist/`, they can reference a different module instance than `zod-to-json-schema` uses internally, causing `instanceof` checks to fail. This results in empty tool schemas and MCP clients reporting "no tools available". The codebase uses manual JSON Schema construction via `buildInputSchema()` functions to avoid this. After consolidation, verify tool registration works (Step 3a in Task 17).

**Root Cause:** The Docker container restarts with error `Cannot find package '@firecrawl/client'` because:
1. `apps/mcp/remote` imports from `./shared` (a symlink to `../shared/dist`)
2. The symlink is created with absolute paths (`/compose/pulse/packages/firecrawl-client`)
3. In Docker (path `/app`), these absolute symlinks break
4. TypeScript compiles shared code into `remote/dist/shared/`, creating module resolution confusion

---

## Task 1: Backup Current Structure and Create New Package

**Files:**
- Rename: `apps/mcp/` → `apps/mcp-old/`
- Create: `apps/mcp/package.json`
- Create: `apps/mcp/tsconfig.json`
- Create: `apps/mcp/.gitignore`

**Step 1: Backup current MCP structure**

```bash
mv apps/mcp apps/mcp-old
```

**Step 2: Create new consolidated directory**

```bash
mkdir -p apps/mcp
```

**Step 3: Write consolidated package.json**

File: `apps/mcp/package.json`

```json
{
  "name": "@pulsemcp/mcp-server",
  "version": "0.3.0",
  "description": "Firecrawl MCP server with HTTP streaming transport",
  "type": "module",
  "main": "dist/index.js",
  "bin": {
    "@pulsemcp/mcp-server": "./dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsx index.ts",
    "test": "vitest",
    "test:run": "vitest run",
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "typecheck": "tsc --noEmit",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.68.0",
    "@firecrawl/client": "workspace:*",
    "@modelcontextprotocol/sdk": "^1.19.1",
    "@types/cors": "^2.8.17",
    "@types/express": "^5.0.0",
    "cors": "^2.8.5",
    "dom-to-semantic-markdown": "^1.5.0",
    "dotenv": "^17.2.3",
    "express": "^4.21.2",
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
    "@types/supertest": "^6.0.2",
    "eslint": "^9.39.1",
    "prettier": "^3.6.2",
    "supertest": "^7.0.0",
    "tsx": "^4.19.4",
    "typescript": "^5.7.3",
    "typescript-eslint": "^8.46.3",
    "vitest": "^3.2.3"
  },
  "keywords": ["mcp", "firecrawl", "http", "streaming", "server"],
  "author": "PulseMCP",
  "license": "MIT"
}
```

**Step 3: Write tsconfig.json**

File: `apps/mcp/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "lib": ["ES2020"],
    "moduleResolution": "node",
    "outDir": "./dist",
    "rootDir": ".",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "allowSyntheticDefaultImports": true
  },
  "include": [
    "*.ts",
    "server/**/*",
    "tools/**/*",
    "scraping/**/*",
    "processing/**/*",
    "storage/**/*",
    "config/**/*",
    "utils/**/*",
    "monitoring/**/*"
  ],
  "exclude": ["node_modules", "dist", "tests"]
}
```

**Step 4: Write .gitignore**

File: `apps/mcp/.gitignore`

```
node_modules/
dist/
.env
*.log
.DS_Store
```

**Step 5: Commit initial structure**

```bash
git add apps/mcp/
git commit -m "feat(mcp): create consolidated package structure

- Merge dependencies from shared and remote packages
- Single tsconfig with all source directories
- Removes need for workspace packages and symlinks"
```

---

## Task 2: Copy Shared Code to New Package

**Files:**
- Copy: `apps/mcp-old/shared/config/` → `apps/mcp/config/`
- Copy: `apps/mcp-old/shared/mcp/` → `apps/mcp/tools/`
- Copy: `apps/mcp-old/shared/scraping/` → `apps/mcp/scraping/`
- Copy: `apps/mcp-old/shared/processing/` → `apps/mcp/processing/`
- Copy: `apps/mcp-old/shared/storage/` → `apps/mcp/storage/`
- Copy: `apps/mcp-old/shared/utils/` → `apps/mcp/utils/`
- Copy: `apps/mcp-old/shared/monitoring/` → `apps/mcp/monitoring/`
- Copy: `apps/mcp-old/shared/index.ts` → `apps/mcp/mcp-server.ts`

**Step 1: Copy config directory**

```bash
cp -r apps/mcp-old/shared/config apps/mcp/
```

**Step 2: Copy and rename mcp to tools**

```bash
cp -r apps/mcp-old/shared/mcp apps/mcp/tools
```

**Step 3: Copy scraping, processing, storage**

```bash
cp -r apps/mcp-old/shared/scraping apps/mcp/
cp -r apps/mcp-old/shared/processing apps/mcp/
cp -r apps/mcp-old/shared/storage apps/mcp/
```

**Step 4: Copy utils and monitoring**

```bash
cp -r apps/mcp-old/shared/utils apps/mcp/
cp -r apps/mcp-old/shared/monitoring apps/mcp/
```

**Step 5: Copy main index and rename**

```bash
cp apps/mcp-old/shared/index.ts apps/mcp/mcp-server.ts
```

**Step 6: Commit shared code migration**

```bash
git add apps/mcp/
git commit -m "feat(mcp): migrate shared code to consolidated package

- Copy config, tools (renamed from mcp/), scraping, processing
- Copy storage, utils, monitoring
- Rename index.ts to mcp-server.ts for clarity"
```

---

## Task 3: Copy Remote Server Code

**Files:**
- Create: `apps/mcp/server/`
- Copy: `apps/mcp-old/remote/index.ts` → `apps/mcp/index.ts`
- Copy: `apps/mcp-old/remote/server.ts` → `apps/mcp/server/http.ts`
- Copy: `apps/mcp-old/remote/middleware/` → `apps/mcp/server/middleware/`
- Copy: `apps/mcp-old/remote/startup/` → `apps/mcp/server/startup/`

**Step 1: Create server directory**

```bash
mkdir -p apps/mcp/server
```

**Step 2: Copy entry point**

```bash
cp apps/mcp-old/remote/index.ts apps/mcp/index.ts
```

**Step 3: Copy server setup and rename**

```bash
cp apps/mcp-old/remote/server.ts apps/mcp/server/http.ts
```

**Step 4: Copy middleware and startup**

```bash
cp -r apps/mcp-old/remote/middleware apps/mcp/server/
cp -r apps/mcp-old/remote/startup apps/mcp/server/
```

**Step 5: Commit server code migration**

```bash
git add apps/mcp/
git commit -m "feat(mcp): migrate remote server code to consolidated package

- Copy entry point index.ts
- Copy server.ts as server/http.ts
- Copy middleware and startup directories to server/"
```

---

## Task 4: Update Imports in Entry Point

**Files:**
- Modify: `apps/mcp/index.ts`

**Step 1: Read current imports**

File: `apps/mcp/index.ts` (before)

```typescript
import { config } from 'dotenv';
import { createExpressServer } from './server.js';
import { runHealthChecks, type HealthCheckResult } from './shared/config/health-checks.js';
import { logInfo, logError } from './shared/utils/logging.js';
import { displayStartupInfo } from './startup/display.js';
```

**Step 2: Update imports to new structure**

File: `apps/mcp/index.ts` (after)

```typescript
import { config } from 'dotenv';
import { createExpressServer } from './server/http.js';
import { runHealthChecks, type HealthCheckResult } from './config/health-checks.js';
import { logInfo, logError } from './utils/logging.js';
import { displayStartupInfo } from './server/startup/display.js';
```

Changes:
- `./server.js` → `./server/http.js`
- `./shared/config/` → `./config/`
- `./shared/utils/` → `./utils/`
- `./startup/` → `./server/startup/`

**Step 3: Verify no other changes needed**

The rest of the file should work as-is since it only uses the imported functions.

**Step 4: Commit import updates**

```bash
git add apps/mcp/index.ts
git commit -m "fix(mcp): update entry point imports to new structure

- Remove ./shared/ prefix from imports
- Update server import path to ./server/http.js
- Update startup import to ./server/startup/"
```

---

## Task 5: Update Imports in Server HTTP Module

**Files:**
- Modify: `apps/mcp/server/http.ts`

**Step 1: Update imports in http.ts**

Find and replace:
- `from './shared/` → `from '../`
- `from './middleware/` → `from './middleware/`
- `from './shared/utils/logging.js'` → `from '../utils/logging.js'`

File: `apps/mcp/server/http.ts` (relevant imports)

Before:
```typescript
import { createMCPServer } from './shared/index.js';
import { logInfo, logError } from './shared/utils/logging.js';
```

After:
```typescript
import { createMCPServer } from '../mcp-server.js';
import { logInfo, logError } from '../utils/logging.js';
```

**Step 2: Commit server import updates**

```bash
git add apps/mcp/server/http.ts
git commit -m "fix(mcp): update server imports to new structure

- Remove ./shared/ prefix from imports
- Use relative paths from server/ directory"
```

---

## Task 6: Update All Tool Imports

**Files:**
- Modify: `apps/mcp/tools/**/*.ts` (all tool files)

**Step 1: Update imports in all tool files**

This is a bulk operation. The pattern is:
- `from '../../../` → `from '../../` (tools moved up one directory level)
- Example: `tools/scrape/pipeline.ts` imports from `../../../config/` → `../../config/`

Run a find-and-replace:

```bash
cd apps/mcp/tools
find . -name "*.ts" -exec sed -i "s|from '../../../config/|from '../../config/|g" {} +
find . -name "*.ts" -exec sed -i "s|from '../../../utils/|from '../../utils/|g" {} +
find . -name "*.ts" -exec sed -i "s|from '../../../scraping/|from '../../scraping/|g" {} +
find . -name "*.ts" -exec sed -i "s|from '../../../processing/|from '../../processing/|g" {} +
find . -name "*.ts" -exec sed -i "s|from '../../../storage/|from '../../storage/|g" {} +
find . -name "*.ts" -exec sed -i "s|from '../../../monitoring/|from '../../monitoring/|g" {} +
find . -name "*.ts" -exec sed -i "s|from '../../../server.js'|from '../../mcp-server.js'|g" {} +
```

**Step 2: Verify changes look correct**

```bash
git diff apps/mcp/tools/
```

**Step 3: Commit tool import updates**

```bash
git add apps/mcp/tools/
git commit -m "fix(mcp): update tool imports to new structure

- Adjust relative paths for tools/ directory
- Remove extra ../ from imports (tools moved up one level)"
```

---

## Task 7: Update Config and Utils Imports

**Files:**
- Modify: `apps/mcp/config/**/*.ts`
- Modify: `apps/mcp/utils/**/*.ts`

**Step 1: Update config file imports**

```bash
cd apps/mcp/config
find . -name "*.ts" -exec sed -i "s|from '../utils/|from '../utils/|g" {} +
```

**Step 2: Update utils file imports**

```bash
cd apps/mcp/utils
find . -name "*.ts" -exec sed -i "s|from '../config/|from '../config/|g" {} +
```

These should already be correct since config and utils stayed at the same relative level.

**Step 3: Commit (if any changes)**

```bash
git add apps/mcp/config/ apps/mcp/utils/
git commit -m "fix(mcp): verify config and utils imports

- No changes needed (relative paths unchanged)"
```

---

## Task 8: Update Scraping, Processing, Storage Imports

**Files:**
- Modify: `apps/mcp/scraping/**/*.ts`
- Modify: `apps/mcp/processing/**/*.ts`
- Modify: `apps/mcp/storage/**/*.ts`

**Step 1: Update scraping imports**

```bash
cd apps/mcp/scraping
find . -name "*.ts" -exec sed -i "s|from '../utils/|from '../utils/|g" {} +
find . -name "*.ts" -exec sed -i "s|from '../config/|from '../config/|g" {} +
```

**Step 2: Update processing imports**

```bash
cd apps/mcp/processing
find . -name "*.ts" -exec sed -i "s|from '../utils/|from '../utils/|g" {} +
find . -name "*.ts" -exec sed -i "s|from '../config/|from '../config/|g" {} +
find . -name "*.ts" -exec sed -i "s|from '../scraping/|from '../scraping/|g" {} +
```

**Step 3: Update storage imports**

```bash
cd apps/mcp/storage
find . -name "*.ts" -exec sed -i "s|from '../utils/|from '../utils/|g" {} +
find . -name "*.ts" -exec sed -i "s|from '../config/|from '../config/|g" {} +
```

**Step 4: Commit import updates**

```bash
git add apps/mcp/scraping/ apps/mcp/processing/ apps/mcp/storage/
git commit -m "fix(mcp): update scraping/processing/storage imports

- Verify relative paths are correct for new structure
- No changes needed (paths unchanged)"
```

---

## Task 9: Update MCP Server Barrel Export

**Files:**
- Modify: `apps/mcp/mcp-server.ts`

**Step 1: Update imports in mcp-server.ts**

This file exports the main `createMCPServer` function. Update its imports:

Before:
```typescript
import { scrapeHandler } from './mcp/tools/scrape/handler.js';
import { crawlHandler } from './mcp/tools/crawl/handler.js';
```

After:
```typescript
import { scrapeHandler } from './tools/scrape/handler.js';
import { crawlHandler } from './tools/crawl/handler.js';
```

Pattern: `from './mcp/` → `from './tools/`

**Step 2: Apply changes**

```bash
sed -i "s|from './mcp/tools/|from './tools/|g" apps/mcp/mcp-server.ts
```

**Step 3: Commit**

```bash
git add apps/mcp/mcp-server.ts
git commit -m "fix(mcp): update mcp-server barrel exports

- Update tool imports from ./mcp/tools/ to ./tools/"
```

---

## Task 10: Copy and Update Tests

**Files:**
- Create: `apps/mcp/tests/`
- Copy: `apps/mcp-old/shared/tests/` → `apps/mcp/tests/`
- Copy: `apps/mcp-old/remote/tests/` → `apps/mcp/tests/server/`

**Step 1: Copy shared tests**

```bash
cp -r apps/mcp-old/shared/tests apps/mcp/
```

**Step 2: Copy remote server tests**

```bash
mkdir -p apps/mcp/tests/server
cp -r apps/mcp-old/remote/tests/* apps/mcp/tests/server/
```

**Step 3: Update test imports**

Tests need to import from parent directories now:

```bash
cd apps/mcp/tests
find . -name "*.test.ts" -exec sed -i "s|from '../../|from '../|g" {} +
find . -name "*.test.ts" -exec sed -i "s|from '../shared/|from '../|g" {} +
```

**Note:** Test import depth varies by subdirectory. After running sed, manually verify a few test files compile correctly. If issues exist, fix individually rather than debugging sed patterns.

**Step 4: Commit test migration**

```bash
git add apps/mcp/tests/
git commit -m "test(mcp): migrate and update all tests

- Copy shared and remote tests to new package
- Update import paths for new structure
- Organize server tests in tests/server/"
```

---

## Task 11: Create New Dockerfile

**Files:**
- Create: `apps/mcp/Dockerfile`

**Step 1: Write simplified Dockerfile**

File: `apps/mcp/Dockerfile`

```dockerfile
# Multi-stage build for MCP Server

# Stage 1: Builder
FROM node:20-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Copy workspace configuration
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy workspace packages
COPY packages/ ./packages/
COPY apps/mcp/ ./apps/mcp/

# Install all dependencies
RUN pnpm install

# Build firecrawl client package
RUN pnpm --filter @firecrawl/client run build

# Build MCP server
RUN pnpm --filter @pulsemcp/mcp-server run build

# Stage 2: Production
FROM node:20-alpine

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

WORKDIR /app

# Copy workspace configuration
COPY --from=builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./

# Copy package manifests
COPY --from=builder /app/packages/firecrawl-client/package.json ./packages/firecrawl-client/
COPY --from=builder /app/apps/mcp/package.json ./apps/mcp/

# Copy built artifacts
COPY --from=builder /app/packages/firecrawl-client/dist ./packages/firecrawl-client/dist
COPY --from=builder /app/apps/mcp/dist ./apps/mcp/dist

# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile

# Create resources directory
RUN mkdir -p /app/resources && chown -R nodejs:nodejs /app/resources

# Create entrypoint script
RUN echo '#!/bin/sh' > /entrypoint.sh && \
    echo 'if ! chown -R nodejs:nodejs /app/resources 2>/dev/null; then' >> /entrypoint.sh && \
    echo '  echo "Warning: Failed to change ownership of /app/resources" >&2' >> /entrypoint.sh && \
    echo 'fi' >> /entrypoint.sh && \
    echo 'exec su-exec nodejs "$@"' >> /entrypoint.sh && \
    chmod +x /entrypoint.sh && \
    apk add --no-cache su-exec

# Set working directory
WORKDIR /app/apps/mcp

# Set environment
ENV NODE_ENV=production
ENV PORT=3060

# Expose port
EXPOSE 3060

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3060/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Use entrypoint
ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "dist/index.js"]
```

**Step 2: Commit Dockerfile**

```bash
git add apps/mcp/Dockerfile
git commit -m "feat(mcp): add simplified Dockerfile

- Single package build (no symlink hacks)
- Standard pnpm workspace pattern
- Production dependencies only in final image
- Health check at /health endpoint"
```

---

## Task 12: Update Workspace Configuration

**Files:**
- Modify: `pnpm-workspace.yaml`

**Step 1: Update workspace to include new package**

File: `pnpm-workspace.yaml`

Before:
```yaml
packages:
  - apps/mcp/local
  - apps/mcp/shared
  - apps/mcp/remote
  - apps/web
  - apps/webhook
  - packages/*
```

After:
```yaml
packages:
  - apps/mcp
  - apps/web
  - apps/webhook
  - packages/*
```

**Step 2: Commit workspace update**

```bash
git add pnpm-workspace.yaml
git commit -m "chore: update workspace for consolidated MCP package

- Remove mcp/local, mcp/shared, mcp/remote
- Add mcp-new (will rename to mcp after testing)"
```

---

## Task 13: Install Dependencies and Build

**Step 1: Install workspace dependencies**

```bash
pnpm install
```

Expected: pnpm should install dependencies for the new mcp-new package.

**Step 2: Build firecrawl client**

```bash
pnpm --filter @firecrawl/client run build
```

Expected: Build completes without errors.

**Step 3: Build MCP server**

```bash
pnpm --filter @pulsemcp/mcp-server run build
```

Expected: TypeScript compilation completes, creates `apps/mcp/dist/` directory.

**Step 4: Check for compilation errors**

If errors appear, they're likely import path issues. Fix them following the pattern:
- Imports should be relative to the file's location
- No `./shared/` prefixes
- Tools import from `../`

**Step 5: Verify no module resolution errors**

```bash
# Check build output for any module resolution failures
if grep -r "Cannot find module" apps/mcp/dist/ 2>/dev/null; then
  echo "ERROR: Module resolution failures detected"
  exit 1
fi
```

Expected: No output (grep finds nothing).

**Step 6: Commit if build succeeds**

```bash
git add apps/mcp/
git commit -m "chore: verify consolidated package builds successfully

- All TypeScript compilation passes
- No import errors
- dist/ directory created correctly"
```

---

## Task 14: Run Tests

**Step 1: Run unit tests**

```bash
pnpm --filter @pulsemcp/mcp-server run test:run
```

Expected: Tests run (may fail if they need import updates).

**Step 2: Fix any test import issues**

Common patterns:
- Tests in `tests/tools/` should import from `../../tools/`
- Tests in `tests/config/` should import from `../../config/`

**Step 3: Commit test fixes**

```bash
git add apps/mcp/tests/
git commit -m "fix(mcp): resolve test import paths

- Update test imports for new structure
- All tests passing"
```

---

## Task 15: Update Docker Compose

**Files:**
- Modify: `docker-compose.yaml`

**Step 1: Update MCP service to use new package**

File: `docker-compose.yaml` (pulse_mcp service)

Change:
```yaml
pulse_mcp:
  build:
    context: .
    dockerfile: apps/mcp/Dockerfile  # Old path
```

To:
```yaml
pulse_mcp:
  build:
    context: .
    dockerfile: apps/mcp/Dockerfile  # New path
```

**Step 2: Commit docker-compose update**

```bash
git add docker-compose.yaml
git commit -m "chore(docker): update MCP service to use consolidated package

- Point to apps/mcp/Dockerfile
- Same configuration, simplified build"
```

---

## Task 16: Test Docker Build

**Step 1: Build Docker image**

```bash
docker compose build pulse_mcp
```

Expected: Build completes successfully, no module resolution errors.

**Step 2: Start container**

```bash
docker compose up -d pulse_mcp
```

**Step 3: Check container status**

```bash
sleep 15
docker ps --filter "name=pulse_mcp"
```

Expected: Container status shows "Up" (not "Restarting").

**Step 4: Check logs for errors**

```bash
docker logs pulse_mcp --tail 30
```

Expected: Server startup logs, no "Cannot find package" errors.

**Step 5: Test health endpoint**

```bash
curl http://localhost:3060/health
```

Expected: HTTP 200 response.

---

## Task 17: Final Integration Test

**Step 1: Rebuild and start all services**

```bash
docker compose build
docker compose up -d
```

**Step 2: Verify MCP container is running**

```bash
docker ps --filter "name=pulse_mcp"
```

Expected: Status "Up" for 30+ seconds (not restarting).

**Step 3: Test MCP endpoints**

```bash
curl -X POST http://localhost:3060/mcp/v1 \
  -H "Content-Type: application/json" \
  -d '{"method":"tools/list"}'
```

Expected: JSON response with list of tools.

**Step 3a: Verify tool registration (Zod Schema Check)**

```bash
# Verify tools are actually registered (not empty due to Zod cross-module issues)
curl -X POST http://localhost:3060/mcp/v1 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' \
  | jq '.result.tools[] | .name'
```

Expected: Output shows tool names: `scrape`, `crawl`, `map`, `search`

If tools array is empty, this indicates the Zod cross-module hazard has been re-introduced. Verify that manual JSON Schema construction is preserved in `tools/*/schema.ts` files.

**Step 4: Check server logs**

```bash
docker logs pulse_mcp
```

Expected: Clean startup, no errors.

**Step 5: Commit verification**

```bash
git commit --allow-empty -m "test(mcp): verify consolidated package works in Docker

- Container starts successfully
- No module resolution errors
- Health check passes
- MCP endpoints respond correctly"
```

---

## Task 18: Update Documentation

**Files:**
- Modify: `apps/mcp/README.md`
- Modify: `CLAUDE.md`

**Step 1: Update MCP README**

File: `apps/mcp/README.md`

Add section:

```markdown
## Architecture

The MCP server is a single consolidated package (previously split across local/shared/remote).

**Directory Structure:**
```
apps/mcp/
├── index.ts         # Entry point
├── server/          # HTTP server
├── tools/           # MCP tools (scrape, crawl, map, search)
├── scraping/        # Scraping strategies
├── processing/      # Content processing
├── storage/         # Resource storage
├── config/          # Configuration
├── utils/           # Utilities
├── monitoring/      # Monitoring
└── dist/            # Compiled output
```

**Build:**
```bash
pnpm --filter @pulsemcp/mcp-server run build
```

**Docker:**
```bash
docker compose build pulse_mcp
docker compose up -d pulse_mcp
```
```

**Step 2: Update CLAUDE.md**

File: `CLAUDE.md`

Update the monorepo structure section:

Before:
```markdown
### Node.js Apps (pnpm workspace)
- `apps/mcp` - MCP server (has internal workspace: local/remote/shared)
```

After:
```markdown
### Node.js Apps (pnpm workspace)
- `apps/mcp` - MCP server (consolidated single package)
```

**Step 3: Commit documentation**

```bash
git add apps/mcp/README.md CLAUDE.md
git commit -m "docs: update for consolidated MCP architecture

- Remove references to local/shared/remote split
- Document new directory structure
- Update build and deployment instructions"
```

---

## Task 19: Final Cleanup

**Step 1: Remove old backup if tests pass**

```bash
rm -rf apps/mcp-old/
```

**Step 2: Remove legacy scripts**

```bash
rm -f apps/mcp/setup-dev.js
rm -f apps/mcp/prepare-publish.js
```

These scripts were only needed for the symlink hack.

**Step 3: Final commit**

```bash
git add -A
git commit -m "chore(mcp): remove legacy symlink hack scripts

- Delete setup-dev.js (created symlinks)
- Delete prepare-publish.js (copied symlinked files)
- Clean architecture complete"
```

---

## Verification Checklist

After completing all tasks, verify:

- [ ] `docker compose up -d pulse_mcp` starts successfully
- [ ] Container stays "Up" (not restarting)
- [ ] `docker logs pulse_mcp` shows no errors
- [ ] `curl http://localhost:3060/health` returns 200
- [ ] Tool registration verified: `curl -X POST http://localhost:3060/mcp/v1 -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | jq '.result.tools | length'` returns > 0
- [ ] `pnpm --filter @pulsemcp/mcp-server run build` completes
- [ ] `pnpm --filter @pulsemcp/mcp-server run test` passes
- [ ] No `apps/mcp/local`, `apps/mcp/shared`, `apps/mcp/remote` directories
- [ ] No symlinks in `apps/mcp/`
- [ ] Dockerfile doesn't reference `shared/` or symlink creation

## Success Criteria

1. **Docker Container Runs:** MCP server starts and stays running in Docker
2. **No Module Errors:** No "Cannot find package '@firecrawl/client'" errors
3. **Clean Architecture:** Single package, no symlinks, clear directory structure
4. **Tests Pass:** All unit and integration tests passing
5. **Documentation Updated:** README and CLAUDE.md reflect new structure

---

## Rollback Plan

If issues occur:

1. Stop services: `docker compose down`
2. Restore old structure: `mv apps/mcp-old apps/mcp`
3. Restore workspace: `git checkout pnpm-workspace.yaml docker-compose.yaml`
4. Reinstall: `pnpm install`
5. Rebuild: `docker compose build`
