# Integration Testing Blockers - Task 15

**Date:** November 9, 2025
**Time:** 19:35 EST
**Task:** Task 15 - Integration Testing
**Status:** ❌ BLOCKED
**Plan:** `/compose/pulse/docs/plans/2025-01-08-monorepo-integration.md`

---

## Executive Summary

Integration testing **cannot proceed** due to Docker build failures. All 7 services failed to start because the MCP service build failed during TypeScript compilation.

**Root Cause:** Architecture mismatch between the shared `@firecrawl/client` package and MCP's expectations for specialized client classes.

---

## Services Defined

| Service | Port | Purpose | Status |
|---------|------|---------|--------|
| firecrawl_playwright | 4302 | Browser scraping | ❌ Not started |
| firecrawl | 3002 | Main API | ❌ Not started |
| firecrawl_cache | 4303 | Redis queue | ❌ Not started |
| firecrawl_db | 4304 | PostgreSQL | ❌ Not started |
| firecrawl_mcp | 3060 | MCP server | ❌ Build failed |
| firecrawl_webhook | 52100 | Webhook API | ❌ Not started |
| firecrawl_webhook_worker | N/A | Background worker | ❌ Not started |

---

## Build Failure Details

### Service: `firecrawl_mcp`

**Build Stage:** TypeScript compilation
**Exit Code:** 2
**Command:** `pnpm --filter @pulsemcp/pulse-shared run build`

### Critical Errors

#### 1. Missing Dependency (2 errors)
```
error TS2307: Cannot find module 'zod-to-json-schema'
```

**Affected Files:**
- `config/validation-schemas.ts:2:33`
- `mcp/tools/crawl/debug-schema.ts:2:33`

**Fix Required:**
```bash
cd apps/mcp/shared
pnpm add zod-to-json-schema
```

#### 2. Missing Client Module
```
error TS2307: Cannot find module './clients/index.js'
```

**Affected File:**
- `index.ts:9:15`

**Fix Required:** Create `apps/mcp/shared/clients/index.ts` or remove the import

#### 3. Missing Specialized Client Classes (8 errors)

The MCP code expects specialized client classes that don't exist in `@firecrawl/client`:

**Expected Classes:**
- `FirecrawlCrawlClient` - Used by crawl tool (2 files)
- `FirecrawlMapClient` - Used by map tool (2 files)
- `FirecrawlSearchClient` - Used by search tool (2 files)
- `FirecrawlScrapingClient` - Used by native scraping (2 files)

**Actual Exports from @firecrawl/client:**
- `FirecrawlClient` (generic client class)
- `startCrawl()`, `getCrawlStatus()`, `cancelCrawl()` (functions)
- `scrape()`, `search()`, `map()` (functions)
- Type definitions

**Affected Files:**
1. `mcp/tools/crawl/index.ts:3:10`
2. `mcp/tools/crawl/pipeline.ts:15:10`
3. `mcp/tools/map/index.ts:3:10`
4. `mcp/tools/map/pipeline.ts:13:10`
5. `mcp/tools/search/index.ts:3:10`
6. `mcp/tools/search/pipeline.ts:13:10`
7. `scraping/clients/native/scraping-client.ts:12:10`
8. `scraping/clients/native/scraping-client.ts:13:10`

---

## Architecture Mismatch Analysis

### What Was Built (Task 4)

The `@firecrawl/client` package was created by copying MCP's internal Firecrawl client, which exported:
- A unified `FirecrawlClient` class
- Individual operation functions
- Shared types

### What MCP Expects

The MCP codebase was designed around specialized client classes:
```typescript
import { FirecrawlCrawlClient } from '@firecrawl/client';
import { FirecrawlMapClient } from '@firecrawl/client';
import { FirecrawlSearchClient } from '@firecrawl/client';
import { FirecrawlScrapingClient } from '@firecrawl/client';
```

### The Disconnect

Task 6 updated MCP imports to use `@firecrawl/client`, but the package structure doesn't match MCP's architecture. The refactoring was incomplete.

---

## Resolution Options

### Option A: Create Specialized Classes in @firecrawl/client (Recommended)

**Pros:**
- Matches MCP's existing architecture
- No changes needed in MCP codebase
- Clean separation of concerns

**Cons:**
- More code in shared package
- Duplicates some functionality

**Implementation:**
```typescript
// packages/firecrawl-client/src/clients/crawl-client.ts
export class FirecrawlCrawlClient {
  constructor(private client: FirecrawlClient) {}

  async startCrawl(params: CrawlParams) {
    return this.client.startCrawl(params);
  }

  async getCrawlStatus(id: string) {
    return this.client.getCrawlStatus(id);
  }
  // ... etc
}
```

### Option B: Refactor MCP to Use Generic Client

**Pros:**
- Simpler shared package
- More flexible

**Cons:**
- Large refactoring effort in MCP
- Changes to many files
- Risk of introducing bugs

**Scope:** Would need to refactor 8+ files in MCP

### Option C: Create Adapters in MCP

**Pros:**
- No changes to shared package
- Localized to MCP codebase

**Cons:**
- Adapter boilerplate in MCP
- Less clean than Option A

---

## Recommended Path Forward

1. **Implement Option A** - Add specialized client classes to `@firecrawl/client`
2. **Add missing dependency** - Install `zod-to-json-schema`
3. **Fix missing clients path** - Create or remove `clients/index.ts`
4. **Rebuild and test** - Verify Docker build succeeds
5. **Resume Task 15** - Run integration tests

---

## Environment Configuration Issues

**Missing (Non-Blocking):**
- `WEBHOOK_API_SECRET` - Defaults to blank
- `WEBHOOK_SECRET` - Defaults to blank
- `WEBHOOK_QDRANT_URL` - Defaults to blank (vector search disabled)
- `WEBHOOK_TEI_URL` - Defaults to blank (embeddings disabled)

**Present:**
- Firecrawl API configuration ✓
- PostgreSQL credentials ✓
- Redis configuration ✓
- Webhook database URL ✓

---

## Integration Tests Blocked

The following tests from Task 15 could not be executed:

- ❌ MCP → Firecrawl communication
- ❌ Firecrawl → Webhook indexing
- ❌ Database schema isolation verification
- ❌ Redis queue sharing
- ❌ Docker network connectivity

---

## Next Steps

### Immediate (Blocking)

1. Choose resolution approach (recommend Option A)
2. Implement specialized client classes in `@firecrawl/client`
3. Add `zod-to-json-schema` dependency to `apps/mcp/shared/package.json`
4. Fix `clients/index.ts` import issue
5. Rebuild firecrawl-client package: `pnpm --filter '@firecrawl/client' build`
6. Rebuild Docker images: `docker compose build`
7. Start services: `docker compose up -d`
8. Resume Task 15 integration testing

### Post-Integration (Optional)

1. Configure vector search (Qdrant + TEI) if needed
2. Set webhook authentication secrets
3. Run full integration test suite
4. Performance testing

---

**Document Status:** COMPLETE
**Task 15 Status:** BLOCKED - awaiting architecture fix
**Blocker Severity:** HIGH (prevents deployment)
**Last Updated:** 2025-11-09 19:35 EST
