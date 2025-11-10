# NPM to PNPM Migration Investigation

**Date:** 2025-11-09
**Task:** Transition monorepo from npm to pnpm workspaces

## Problem

Docker build failed with:
```
npm error Unsupported URL Type "workspace:": workspace:*
```

**Root Cause:** [apps/mcp/Dockerfile](../apps/mcp/Dockerfile) was using `npm ci` but the monorepo uses pnpm workspace protocol.

## Investigation

### 1. Checked Package Manager Usage

```bash
# apps/mcp
ls /compose/pulse/apps/mcp/ | grep -E "(package|pnpm)"
# Found: package.json, package-lock.json (npm), pnpm-lock.yaml
```

**Finding:** `apps/mcp` had both npm and pnpm lock files, indicating mixed usage.

### 2. Discovered Nested Workspace

```yaml
# apps/mcp/package.json (line 7-11)
"workspaces": [
  "local",
  "shared",
  "remote"
]
```

**Finding:** `apps/mcp` was using npm workspaces nested inside the root pnpm workspace.

### 3. Checked Dependencies

```json
// apps/mcp/shared/package.json (line 18)
"@firecrawl/client": "workspace:*"
```

**Finding:** `shared` package depends on `@firecrawl/client` from [packages/firecrawl-client/](../packages/firecrawl-client/), requiring workspace resolution.

### 4. Analyzed Other Apps

```bash
# apps/web
ls /compose/pulse/apps/web/ | grep lock
# Output: package-lock.json (npm)

# apps/webhook
ls /compose/pulse/apps/webhook/ | grep lock
# Output: uv.lock (Python - correct)

# apps/nuq-postgres
ls /compose/pulse/apps/nuq-postgres/
# Output: Dockerfile, nuq.sql (no package manager)
```

**Finding:** `apps/web` also used npm, `apps/webhook` correctly uses uv, `apps/nuq-postgres` needs no package manager.

## Solution

### Standard Practice: Flat Workspace Structure

**Anti-pattern:** Nested workspaces (pnpm workspace → npm workspace → packages)
**Best practice:** Single flat pnpm workspace at root

### Changes Made

#### 1. Root Workspace ([pnpm-workspace.yaml](../pnpm-workspace.yaml))

```yaml
packages:
  - 'apps/mcp/local'
  - 'apps/mcp/shared'
  - 'apps/mcp/remote'
  - 'apps/web'
  - 'apps/webhook'
  - 'packages/*'
```

**Rationale:** Explicit package paths, no glob on `apps/*` to avoid conflicts.

#### 2. Removed npm Artifacts

- `apps/mcp/package-lock.json` ✅
- `apps/web/package-lock.json` ✅

#### 3. Updated apps/mcp ([package.json](../apps/mcp/package.json))

**Removed:**
```json
"workspaces": ["local", "shared", "remote"]
```

**Updated scripts:**
```json
"install-all": "pnpm install",
"ci:install": "pnpm install --frozen-lockfile",
"build": "pnpm -F shared run build && pnpm -F local run build"
```

#### 4. Updated Docker Build ([apps/mcp/Dockerfile](../apps/mcp/Dockerfile))

**Key changes:**
```dockerfile
# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Install dependencies (line 19)
RUN pnpm install

# Build with filters (lines 22-24)
RUN pnpm --filter @firecrawl/client run build
RUN pnpm --filter @pulsemcp/pulse-shared run build
RUN pnpm --filter @pulsemcp/pulse-remote run build
```

#### 5. Updated Docker Compose ([docker-compose.yaml](../docker-compose.yaml))

```yaml
# Line 60-61
build:
  context: .  # Changed from ./apps/mcp
  dockerfile: apps/mcp/Dockerfile
```

**Rationale:** Root context allows access to `packages/` and root workspace config.

## Verification

### Build Test (Partial Success)

```bash
docker compose build firecrawl_mcp
```

**Result:**
- ✅ pnpm install succeeded
- ✅ @firecrawl/client build succeeded
- ❌ @pulsemcp/pulse-shared build failed (TypeScript errors)

**TypeScript Errors:**
```
mcp/tools/crawl/index.ts(1,10): error TS2724:
'"@firecrawl/client"' has no exported member named 'FirecrawlCrawlClient'
```

**Analysis:** Build infrastructure now works. TypeScript errors are code compatibility issues between MCP code and `@firecrawl/client` API (separate issue).

## Summary

### Before
- Mixed npm and pnpm usage
- Nested workspaces (root pnpm → apps/mcp npm)
- Dockerfile using `npm ci` with workspace: protocol (incompatible)

### After
- Consistent pnpm usage across all Node.js apps
- Single flat workspace at root
- Dockerfile using pnpm with proper workspace filters
- Standard monorepo structure

### Apps Status

| App | Before | After | Notes |
|-----|--------|-------|-------|
| apps/mcp | npm workspaces | pnpm ✅ | Transitioned |
| apps/web | npm | pnpm ✅ | Transitioned |
| apps/webhook | uv (Python) | uv ✅ | No changes needed |
| apps/nuq-postgres | N/A | N/A ✅ | SQL only |

## Files Modified

1. [pnpm-workspace.yaml](../pnpm-workspace.yaml) - Added explicit package paths
2. [apps/mcp/package.json](../apps/mcp/package.json) - Removed workspaces, updated scripts
3. [apps/mcp/Dockerfile](../apps/mcp/Dockerfile) - Use pnpm, root context
4. [docker-compose.yaml](../docker-compose.yaml) - Changed build context to root
5. Deleted: `apps/mcp/package-lock.json`, `apps/web/package-lock.json`
