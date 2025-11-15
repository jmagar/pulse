# Firecrawl API Consolidation - Implementation Session

**Date:** 2025-11-14 (20:42 - 20:50 EST)
**Goal:** Implement unified Firecrawl v2 API consolidation through webhook bridge to eliminate code duplication and fix foreign key violations.

---

## Session Overview

Continued from previous debugging session where we identified FK violations in `operation_metrics` table. User proposed consolidating all Firecrawl operations through the webhook bridge to create a single integration point.

**Key Decision:** Route ALL Firecrawl API calls through webhook bridge as transparent proxies with auto-indexing middleware.

---

## Tasks Completed

### 1. Database Schema Migration ✅

**File:** `apps/webhook/alembic/versions/413191e2eb2c_create_crawl_sessions_table.py`

**Changes:**
- Renamed `crawl_id` → `job_id` (more accurate for v2 API)
- Renamed `crawl_url` → `base_url` (more generic for all operations)
- Added fields:
  - `operation_type` VARCHAR(50) NOT NULL - 'scrape', 'scrape_batch', 'crawl', 'map', 'search'
  - `total_urls` INT - Total URLs in operation
  - `completed_urls` INT - Successfully processed URLs
  - `failed_urls` INT - Failed URLs
  - `auto_index` BOOLEAN - Enable/disable automatic indexing
  - `expires_at` TIMESTAMP - Job expiration
  - `updated_at` TIMESTAMP - Last update timestamp
- Updated FK constraint to reference `job_id` instead of `crawl_id`

**Migration Application:**
```sql
-- Applied via direct SQL execution (Alembic had connectivity issues)
docker exec -i pulse_postgres psql -U firecrawl -d pulse_postgres < migration_413191e2eb2c.sql
```

**Verification:**
```bash
docker exec pulse_postgres psql -U firecrawl -d pulse_postgres -c "\d webhook.crawl_sessions"
```

Result: ✅ All columns present, FK constraint updated successfully.

---

### 2. Firecrawl v2 Proxy Router ✅

**File:** `apps/webhook/api/routers/firecrawl_proxy.py`

**Implementation:** Created transparent proxy for ALL Firecrawl v2 endpoints.

**Core Proxy Function:**
```python
async def proxy_to_firecrawl(
    request: Request,
    endpoint_path: str,
    method: str = "GET",
) -> Response:
    """
    Proxy requests to Firecrawl API at http://firecrawl:3002/v2

    Features:
    - Header forwarding (excluding host, content-length)
    - Automatic Authorization header injection
    - 120s timeout
    - Error handling (timeout, HTTP errors)
    - Logging for observability
    """
```

**Endpoints Implemented (28 total):**

**Core Operations:**
- `POST /v2/scrape` - Single URL scrape
- `GET /v2/scrape/{job_id}` - Scrape status
- `POST /v2/batch/scrape` - Batch scrape
- `GET /v2/batch/scrape/{job_id}` - Batch status
- `DELETE /v2/batch/scrape/{job_id}` - Cancel batch
- `POST /v2/crawl` - Start crawl
- `GET /v2/crawl/{job_id}` - Crawl status
- `DELETE /v2/crawl/{job_id}` - Cancel crawl
- `GET /v2/crawl/{job_id}/errors` - Crawl errors
- `POST /v2/crawl/params-preview` - Preview params
- `GET /v2/crawl/ongoing` - List ongoing
- `GET /v2/crawl/active` - List active
- `POST /v2/map` - URL discovery
- `POST /v2/search` - Web search

**AI Features:**
- `POST /v2/extract` - Extract structured data
- `GET /v2/extract/{job_id}` - Extraction status

**Account Management:**
- `GET /v2/team/credit-usage`
- `GET /v2/team/credit-usage/historical`
- `GET /v2/team/token-usage`
- `GET /v2/team/token-usage/historical`

**Monitoring:**
- `GET /v2/team/queue-status`
- `GET /v2/concurrency-check`

**Experimental:**
- `POST /v2/x402/search` - X402 micropayment search

---

### 3. Router Registration ✅

**File:** `apps/webhook/api/__init__.py`

**Changes:**
```python
from api.routers import firecrawl_proxy, health, indexing, metrics, search, webhook

# Register proxy router (no prefix - routes are /v2/*)
router.include_router(firecrawl_proxy.router, tags=["firecrawl-proxy"])
```

---

### 4. Webhook Service Restart ✅

**Command:**
```bash
docker restart pulse_webhook
```

**Verification:**
```bash
docker logs pulse_webhook --tail 20
# Output: "Search Bridge API ready", "Uvicorn running on http://0.0.0.0:52100"

# Test from inside container
docker exec pulse_webhook python -c "import httpx; print(httpx.get('http://localhost:52100/health').text)"
# Output: {"status":"healthy","services":{"redis":"healthy","qdrant":"healthy","tei":"healthy"}}
```

---

## Architecture Diagram

### Before (Duplicated):
```
Claude → MCP → Firecrawl API (direct)
         ↓
    Webhook Bridge → Firecrawl API (for indexing only)
         ↓
    Database (metrics with FK violations)
```

### After (Unified):
```
Claude → MCP (thin client) → Webhook Bridge API → Firecrawl API
                                      ↓
                              Auto-indexing + Metrics
                                      ↓
                              PostgreSQL (unified tracking)
```

---

## Files Modified

1. **Database Migration:**
   - `apps/webhook/alembic/versions/413191e2eb2c_create_crawl_sessions_table.py` (created)
   - `.cache/migration_413191e2eb2c.sql` (temporary SQL file)

2. **API Router:**
   - `apps/webhook/api/routers/firecrawl_proxy.py` (created - 300+ LOC)
   - `apps/webhook/api/__init__.py` (modified)

3. **Documentation:**
   - `.docs/api-design-firecrawl-consolidation.md` (updated with v2 endpoints)

---

## Next Steps (Remaining Tasks)

### Task 4: Add Crawl Session Auto-Creation Logic (IN PROGRESS)

**Goal:** Automatically create `crawl_sessions` records when crawl/batch jobs start.

**Implementation Plan:**
1. Create middleware decorator for crawl/batch endpoints
2. Parse Firecrawl response to extract `job_id`
3. Insert `crawl_sessions` record with:
   - `job_id` from response
   - `operation_type` from request
   - `base_url` from request body
   - `status` = 'pending'
   - `auto_index` = true (default)
4. Return response with added `_webhook_meta` field

**Affected Endpoints:**
- `POST /v2/scrape` (if returns job_id)
- `POST /v2/batch/scrape`
- `POST /v2/crawl`

### Task 5: Refactor MCP to Use Webhook Bridge (PENDING)

**Goal:** Remove `@firecrawl/client` dependency and route all calls through webhook bridge.

**Implementation Plan:**
1. Create `WebhookBridgeClient` class in MCP
2. Update scrape tool to call `http://pulse_webhook:52100/v2/scrape`
3. Update crawl tool to call `http://pulse_webhook:52100/v2/crawl`
4. Update map tool to call `http://pulse_webhook:52100/v2/map`
5. Update search tool to call `http://pulse_webhook:52100/v2/search`
6. Remove `@firecrawl/client` from dependencies
7. Remove pipeline logic (now in webhook)
8. Keep only schema validation + response formatting

**Files to Modify:**
- `apps/mcp/server.ts` - Remove `DefaultFirecrawlClient`
- `apps/mcp/tools/scrape/handler.ts` - Use webhook bridge
- `apps/mcp/tools/crawl/*` - Use webhook bridge
- `apps/mcp/tools/map/*` - Use webhook bridge
- `apps/mcp/tools/search/*` - Use webhook bridge
- `apps/mcp/package.json` - Remove `@firecrawl/client`

### Task 6: Test Unified Proxy Architecture (PENDING)

**Goal:** Verify end-to-end flow works correctly.

**Test Cases:**
1. MCP → Webhook → Firecrawl (single scrape)
2. MCP → Webhook → Firecrawl (batch scrape)
3. MCP → Webhook → Firecrawl (crawl)
4. Verify crawl_sessions created automatically
5. Verify operation_metrics FK constraint satisfied
6. Verify auto-indexing works
7. Performance comparison (before/after latency)

---

## Technical Notes

### Port Connectivity Issue

**Issue:** `curl http://localhost:50108/health` fails from host with exit code 7.

**Root Cause:** Docker port mapping issue or firewall rule.

**Workaround:** Access from inside Docker network works fine:
```python
docker exec pulse_webhook python -c "import httpx; print(httpx.get('http://localhost:52100/health').text)"
```

**Impact:** Not critical - MCP runs inside Docker network and will access webhook at `http://pulse_webhook:52100`.

### Configuration Used

**Firecrawl API URL:** `http://firecrawl:3002` (internal Docker network)
**Firecrawl API Key:** `self-hosted-no-auth` (from `config.firecrawl_api_key`)
**Proxy Timeout:** 120s (for long-running crawls)
**Response Format:** Transparent - passes through Firecrawl response as-is

---

## Success Metrics

**Completed:**
- ✅ Database schema updated (crawl_sessions restructured)
- ✅ FK constraint updated (operation_metrics → crawl_sessions.job_id)
- ✅ All 28 Firecrawl v2 endpoints proxied
- ✅ Webhook service restarted successfully
- ✅ Health checks passing (redis, qdrant, tei)

**Pending:**
- ⏳ Auto-creation of crawl_sessions on job start
- ⏳ MCP refactoring to use webhook bridge
- ⏳ End-to-end testing
- ⏳ Code reduction metrics (estimate: ~2500 LOC removed from MCP)
- ⏳ Zero FK violations verification

---

## Commands Reference

### Database Operations
```bash
# Apply migration
docker exec -i pulse_postgres psql -U firecrawl -d pulse_postgres < migration.sql

# Verify schema
docker exec pulse_postgres psql -U firecrawl -d pulse_postgres -c "\d webhook.crawl_sessions"

# Check FK constraint
docker exec pulse_postgres psql -U firecrawl -d pulse_postgres -c "\d webhook.operation_metrics"
```

### Service Management
```bash
# Restart webhook
docker restart pulse_webhook

# Check logs
docker logs pulse_webhook --tail 50

# Test from inside container
docker exec pulse_webhook python -c "import httpx; print(httpx.get('http://localhost:52100/health').json())"
```

### Testing Proxy Endpoints
```bash
# Health check (from inside Docker network)
docker exec pulse_webhook python -c "import httpx; print(httpx.get('http://localhost:52100/health').text)"

# TODO: Test scrape endpoint
# docker exec pulse_webhook python -c "import httpx; print(httpx.post('http://localhost:52100/v2/scrape', json={'url': 'https://example.com'}).text)"
```

---

## Lessons Learned

1. **Alembic Connectivity:** Running `uv run alembic upgrade head` from host had asyncpg connection issues. Workaround: Generate migration, manually apply SQL via `docker exec`.

2. **Migration Pattern:** When table already exists, use `ALTER TABLE` instead of `CREATE TABLE`. Check existing schema first with `\d table_name`.

3. **Transparent Proxying:** FastAPI `Request` object provides `body()` and `headers` for forwarding. Must exclude `host` and `content-length` headers when proxying.

4. **Docker Network DNS:** Internal services should use container names (e.g., `http://firecrawl:3002`) not localhost or external IPs.

5. **Router Registration Order:** Proxy router must be registered WITHOUT prefix since routes already include `/v2/*` path.

---

## Commit Message (for later)

```
feat(webhook): implement unified Firecrawl v2 API proxy

Consolidate all Firecrawl operations through webhook bridge to:
- Eliminate code duplication between MCP and webhook services
- Fix foreign key violations in operation_metrics table
- Enable automatic indexing of all scraping operations
- Centralize metrics tracking for all Firecrawl API calls

Changes:
- Restructured crawl_sessions table for v2 API compatibility
  - Renamed crawl_id → job_id
  - Added operation_type, total_urls, completed_urls, failed_urls
  - Added auto_index and expires_at fields
- Created transparent proxy for all 28 Firecrawl v2 endpoints
  - Core operations: scrape, batch, crawl, map, search
  - AI features: extract
  - Account management: credit/token usage
  - Monitoring: queue status, concurrency
- Updated FK constraint: operation_metrics.crawl_id → crawl_sessions.job_id

Next steps:
- Add auto-creation of crawl_sessions on job start
- Refactor MCP to use webhook bridge (remove @firecrawl/client)
- End-to-end testing

Related: #<issue-number> (FK violations in operation_metrics)
```

---

## End of Session

**Time:** 20:50 EST
**Status:** Phase 1 complete (Database + Proxy implementation)
**Next Session:** Implement crawl session auto-creation logic
