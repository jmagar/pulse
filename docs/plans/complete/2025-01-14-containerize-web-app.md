# Containerize Web App Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Containerize the Next.js web app with hot reload for development, following monorepo patterns.

**Architecture:** Multi-stage Docker build with Node.js 20 Alpine, pnpm workspace support, and volume mounts for hot reload without rebuild cycles.

**Tech Stack:** Next.js 16, pnpm 9.15.0, Node.js 20 Alpine, Docker multi-stage build

---

## Task 1: Create Dockerfile for Next.js Web App

**Files:**
- Create: `apps/web/Dockerfile`

**Step 1: Create multi-stage Dockerfile with builder stage**

```dockerfile
# Multi-stage build for Next.js Web App

# Stage 1: Builder
FROM node:20-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Copy workspace configuration
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy workspace packages
COPY packages/ ./packages/
COPY apps/web/ ./apps/web/

# Install all dependencies
RUN pnpm install

# Build firecrawl client package
RUN pnpm --filter @firecrawl/client run build

# Build Next.js app
RUN pnpm --filter web run build
```

**Step 2: Add production stage**

Add to `apps/web/Dockerfile`:

```dockerfile

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
COPY --from=builder /app/apps/web/package.json ./apps/web/

# Copy built artifacts
COPY --from=builder /app/packages/firecrawl-client/dist ./packages/firecrawl-client/dist
COPY --from=builder /app/apps/web/.next ./apps/web/.next
COPY --from=builder /app/apps/web/public ./apps/web/public

# Install production dependencies only (skip scripts to avoid husky)
RUN pnpm install --prod --frozen-lockfile --ignore-scripts

# Change ownership to nodejs user
RUN chown -R nodejs:nodejs /app

USER nodejs

# Set working directory
WORKDIR /app/apps/web

# Set environment
ENV NODE_ENV=production
ENV PORT=3000

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# Start Next.js
CMD ["pnpm", "start"]
```

**Step 3: Verify Dockerfile syntax**

Run: `docker build -f apps/web/Dockerfile --target builder -t pulse-web-builder .`
Expected: Build completes successfully for builder stage

**Step 4: Commit**

```bash
git add apps/web/Dockerfile
git commit -m "feat(web): add multi-stage Dockerfile for Next.js app"
```

---

## Task 2: Add Health Check Endpoint

**Files:**
- Create: `apps/web/app/api/health/route.ts`

**Step 1: Write failing test for health endpoint**

Create `apps/web/__tests__/health.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'

describe('Health Check API', () => {
  it('should return 200 OK with status healthy', async () => {
    const response = await fetch('http://localhost:3000/api/health')
    expect(response.status).toBe(200)

    const data = await response.json()
    expect(data).toEqual({ status: 'healthy' })
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter web test health.test.ts`
Expected: FAIL with "fetch failed" or route not found

**Step 3: Create health check endpoint**

Create `apps/web/app/api/health/route.ts`:

```typescript
import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({ status: 'healthy' }, { status: 200 })
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm --filter web dev` in background, then `pnpm --filter web test health.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/app/api/health/route.ts apps/web/__tests__/health.test.ts
git commit -m "feat(web): add health check endpoint for Docker healthcheck"
```

---

## Task 3: Update Docker Compose with Web Service

**Files:**
- Modify: `docker-compose.yaml`

**Step 1: Add pulse_web service to docker-compose.yaml**

Add after `pulse_neo4j` service (before `networks:`):

```yaml
  pulse_web:
    <<: *common-service
    build:
      context: .
      dockerfile: apps/web/Dockerfile
      target: builder  # Use builder stage for dev (has dev dependencies)
    container_name: pulse_web
    ports:
      - "${WEB_PORT:-3000}:3000"
    volumes:
      # Mount source code for hot reload (no rebuild needed)
      - ./apps/web:/app/apps/web
      - ./packages:/app/packages
      # Preserve node_modules from image
      - /app/node_modules
      - /app/apps/web/node_modules
      - /app/packages/firecrawl-client/node_modules
    command: sh -c "cd /app/apps/web && pnpm dev"
    environment:
      - NODE_ENV=development
    depends_on:
      - pulse_mcp
      - pulse_webhook
    healthcheck:
      test: ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 20s
```

**Step 2: Verify docker-compose syntax**

Run: `docker compose config`
Expected: No errors, YAML validates successfully

**Step 3: Commit**

```bash
git add docker-compose.yaml
git commit -m "feat(web): add pulse_web service to docker-compose with hot reload"
```

---

## Task 4: Update Root Package.json Scripts

**Files:**
- Modify: `package.json` (root)

**Step 1: Add web service management scripts**

Add to `scripts` section in root `package.json`:

```json
    "services:web:up": "docker compose up -d pulse_web",
    "services:web:down": "docker compose down pulse_web",
    "services:web:logs": "docker compose logs -f pulse_web",
    "services:web:build": "docker compose build pulse_web",
```

**Step 2: Update existing service scripts to include web**

Modify these scripts in root `package.json`:

```json
    "services:up": "docker compose up -d pulse_playwright firecrawl pulse_redis pulse_postgres pulse_mcp pulse_webhook pulse_webhook-worker pulse_change-detection pulse_neo4j pulse_web",
    "services:down": "docker compose down pulse_playwright firecrawl pulse_redis pulse_postgres pulse_mcp pulse_webhook pulse_webhook-worker pulse_change-detection pulse_neo4j pulse_web",
```

**Step 3: Verify scripts work**

Run: `pnpm services:web:build`
Expected: Docker builds pulse_web image successfully

**Step 4: Commit**

```bash
git add package.json
git commit -m "chore: add web service management scripts to root package.json"
```

---

## Task 5: Update .env.example with Web Service Documentation

**Files:**
- Modify: `.env.example`

**Step 1: Verify WEB_PORT variable exists**

Check `.env.example` for existing WEB_PORT configuration (line 173).

Expected: Variable already exists:
```
WEB_PORT=3000                                          # Web interface port
```

**Step 2: No changes needed - WEB_PORT already documented**

Skip this task - `.env.example` already has complete web service configuration at lines 167-173.

**Step 3: Commit (skip - no changes)**

No commit needed.

---

## Task 6: Update CLAUDE.md with Web Service Documentation

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Add pulse_web to service ports table**

Update the service ports table in `CLAUDE.md` (around line 25):

```markdown
| Port | Service | Container | Internal | Notes |
|------|---------|-----------|----------|-------|
| 50100 | Playwright | pulse_playwright | 3000 | Browser automation |
| 50102 | Firecrawl API | firecrawl | 3002 | **Local build** with PR #2381 |
| 50104 | Redis | pulse_redis | 6379 | Message queue & cache |
| 50105 | PostgreSQL | pulse_postgres | 5432 | Shared database |
| 50107 | MCP Server | pulse_mcp | 3060 | Claude integration |
| 50108 | Webhook Bridge | pulse_webhook | 52100 | Search indexing & API |
| 50109 | changedetection.io | pulse_change-detection | 5000 | Change monitoring |
| 50210-50211 | Neo4j | pulse_neo4j | 7474/7687 | Graph database |
| 3000 | Web UI | pulse_web | 3000 | Next.js frontend |
```

**Step 2: Add internal URL for web service**

Update internal URLs section (around line 35):

```markdown
**Internal URLs (within Docker network):**
```
- Firecrawl API: http://firecrawl:3002
- MCP Server: http://pulse_mcp:3060
- Webhook Bridge: http://pulse_webhook:52100
- Web UI: http://pulse_web:3000
- Redis: redis://pulse_redis:6379
- PostgreSQL: postgresql://pulse_postgres:5432/pulse_postgres
- Playwright: http://pulse_playwright:3000
- changedetection.io: http://pulse_change-detection:5000
- Neo4j HTTP: http://pulse_neo4j:7474
- Neo4j Bolt: bolt://pulse_neo4j:7687
```
```

**Step 3: Update Apps & Packages section**

Update the Node.js apps list (around line 12):

```markdown
**Node.js (pnpm workspace):**
- `apps/mcp` - Model Context Protocol server (consolidated single package)
- `apps/web` - Next.js web UI (containerized with hot reload)
- `packages/firecrawl-client` - Shared Firecrawl client library
```

**Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add pulse_web service to CLAUDE.md documentation"
```

---

## Task 7: Test Hot Reload Setup

**Files:**
- Test: Docker volume mounts and hot reload

**Step 1: Start web service**

Run: `pnpm services:web:up`
Expected: Container starts, logs show "ready - started server on 0.0.0.0:3000"

**Step 2: Verify hot reload works**

1. Open browser to `http://localhost:3000`
2. Edit `apps/web/app/page.tsx` - change some text
3. Save file
4. Verify browser auto-refreshes with changes

Expected: Changes appear without rebuilding container

**Step 3: Check health endpoint**

Run: `curl http://localhost:3000/api/health`
Expected: `{"status":"healthy"}`

**Step 4: Check container logs**

Run: `pnpm services:web:logs`
Expected: No errors, shows Next.js dev server running

**Step 5: Document test results**

No commit - verification step only.

---

## Task 8: Update README.md with Web Service Instructions

**Files:**
- Modify: `README.md` (root)

**Step 1: Add web service to Docker services section**

Find the "Docker Services" section and add pulse_web to the list.

**Step 2: Add web UI access instructions**

Add section after service list:

```markdown
### Accessing the Web UI

The web interface runs at http://localhost:3000 (configurable via `WEB_PORT`).

**Features:**
- Chat interface with AI assistant
- Source management and research
- Audio studio for podcast generation
- Real-time hot reload during development
```

**Step 3: Add development workflow note**

Add to development section:

```markdown
**Hot Reload:** The web service uses volume mounts for instant feedback. Edit files in `apps/web/` and see changes immediately without rebuilding the container.
```

**Step 4: Commit**

```bash
git add README.md
git commit -m "docs: add web service to README with access instructions"
```

---

## Task 9: Create Session Log

**Files:**
- Create: `.docs/sessions/2025-01-14-containerize-web-app.md`

**Step 1: Create session log documenting implementation**

```markdown
# Web App Containerization - Session Log

**Date:** 2025-01-14
**Engineer:** Claude (Sonnet 4.5)
**Task:** Containerize Next.js web app with hot reload support

## Summary

Containerized the Next.js web application following existing monorepo Docker patterns. Implemented hot reload via volume mounts to eliminate rebuild cycles during development.

## Changes Made

### 1. Dockerfile (`apps/web/Dockerfile`)
- Multi-stage build (builder + production)
- Node.js 20 Alpine base image
- pnpm 9.15.0 for workspace dependencies
- Health check with custom endpoint
- Non-root user (nodejs:1001)

### 2. Health Check Endpoint (`apps/web/app/api/health/route.ts`)
- Simple JSON endpoint returning `{status: 'healthy'}`
- Used by Docker HEALTHCHECK directive
- Test coverage in `__tests__/health.test.ts`

### 3. Docker Compose (`docker-compose.yaml`)
- Added `pulse_web` service with common-service anchor
- Hot reload via volume mounts:
  - `./apps/web:/app/apps/web` - Source code
  - `./packages:/app/packages` - Shared packages
  - Preserved node_modules from image
- Targets builder stage for dev dependencies
- Runs `pnpm dev` for hot reload
- Depends on pulse_mcp and pulse_webhook

### 4. Root Scripts (`package.json`)
- `services:web:up` - Start web service
- `services:web:down` - Stop web service
- `services:web:logs` - View logs
- `services:web:build` - Build image
- Updated `services:up` and `services:down` to include pulse_web

### 5. Documentation Updates
- `CLAUDE.md` - Added pulse_web to service ports and internal URLs
- `README.md` - Added web UI access instructions and hot reload notes

## Architecture Decisions

**Why builder stage for dev?**
- Builder stage has all dev dependencies needed for `pnpm dev`
- Production stage only has runtime dependencies
- Volume mounts override built files for hot reload

**Why volume mount node_modules?**
- Prevents host node_modules from overriding container's
- Container uses its own built dependencies
- Host changes to source code still hot reload

**Why sh -c command?**
- Allows `cd /app/apps/web` before running `pnpm dev`
- Ensures dev server runs in correct directory
- Alternative: Set WORKDIR but that affects COPY paths

## Testing

1. ✅ Container builds successfully
2. ✅ Health check passes
3. ✅ Hot reload works - edit app/page.tsx, see changes without rebuild
4. ✅ Dependencies load correctly from volume mounts
5. ✅ Service accessible at http://localhost:3000

## Next Steps

- [ ] Add production deployment configuration (separate compose file?)
- [ ] Configure environment-specific builds (dev vs prod)
- [ ] Add integration tests for web + MCP + webhook communication
```

**Step 2: Commit**

```bash
git add .docs/sessions/2025-01-14-containerize-web-app.md
git commit -m "docs: create session log for web containerization"
```

---

## Verification Checklist

**Before marking plan complete:**

- [ ] `docker compose build pulse_web` succeeds
- [ ] `docker compose up -d pulse_web` starts container
- [ ] `curl http://localhost:3000/api/health` returns `{"status":"healthy"}`
- [ ] Edit `apps/web/app/page.tsx`, save, verify browser auto-refreshes
- [ ] `docker compose logs pulse_web` shows no errors
- [ ] All commits pushed to feature branch
- [ ] Documentation updated (CLAUDE.md, README.md)

**Dependencies:**

- Existing: `pulse_mcp`, `pulse_webhook` containers running
- Existing: `.env` file with `WEB_PORT` configured
- Existing: Root `package.json`, `pnpm-workspace.yaml`

**Related Skills:**

- @superpowers:test-driven-development (for health endpoint test)
- @superpowers:verification-before-completion (for verification checklist)
