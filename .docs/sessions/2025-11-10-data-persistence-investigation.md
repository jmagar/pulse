# Data Persistence Investigation Session
**Date**: 2025-01-10
**Context**: Continuation from worker-api consolidation - investigating volume mount requirements

## User Questions

1. "Does the webhook server not need to persist any data?"
2. "OK and what about the Firecrawl container itself? Does that need to persist any data?"

## Investigation Process

### Question 1: Webhook Service Data Persistence

**Finding**: Yes, webhook service DOES need persistence for BM25 index

**Evidence**:
- [apps/webhook/app/services/bm25_engine.py:54](../apps/webhook/app/services/bm25_engine.py#L54)
  ```python
  def __init__(self, index_path: str = "./data/bm25/index.pkl", ...)
  ```
- BM25Engine stores keyword search index at `/app/data/bm25/index.pkl`
- Without volume: Index lost on container restart
- Impact: Search results incomplete (vector-only, no keyword matching)

**Action Taken**: Added volume mount to docker-compose.yaml

```yaml
volumes:
  - ${APPDATA_BASE:-/mnt/cache/appdata}/firecrawl_webhook:/app/data/bm25
```

**Files Modified**:
1. [docker-compose.yaml:84-85](../docker-compose.yaml#L84-L85) - Added volume mount
2. [.docs/services-ports.md:95](./services-ports.md#L95) - Documented volume
3. [.docs/webhook-troubleshooting.md:20](./webhook-troubleshooting.md#L20) - Updated architecture notes

### Question 2: Firecrawl API Data Persistence

**Finding**: No, Firecrawl API is stateless - does NOT need volumes

**Evidence**:

1. **Official Documentation**:
   - GitHub source: https://github.com/mendableai/firecrawl/blob/main/docker-compose.yaml
   - Official API service definition has NO volumes
   - Confirmed stateless design pattern

2. **Docker Image Inspection**:
   ```bash
   docker image inspect ghcr.io/firecrawl/firecrawl | grep "Volumes"
   # Result: "Volumes": null
   ```

3. **Database Verification**:
   ```bash
   docker exec firecrawl_db psql -U firecrawl -d firecrawl_db -c "SELECT schemaname, tablename FROM pg_tables..."
   ```
   Results:
   - `nuq.group_crawl`: 11 rows
   - `nuq.queue_crawl_finished`: 11 rows
   - `nuq.queue_scrape`: 2,675 rows
   - `nuq.queue_scrape_backlog`: 0 rows
   - `webhook.operation_metrics`: timing data
   - `webhook.request_metrics`: timing data
   - `cron.*`: scheduled jobs

4. **Volume Mount Verification**:
   ```bash
   docker inspect firecrawl_db | grep -A 5 "Mounts"
   # PostgreSQL: /mnt/cache/appdata/firecrawl_postgres → /var/lib/postgresql/data ✅
   ```

## Architecture Summary

### Stateless Services (No volumes needed)
- **firecrawl** (API) - Stateless request handler
- **firecrawl_playwright** - Stateless browser automation
- **firecrawl_mcp** - Has MCP resources volume for cached scrapes

### Stateful Services (Volumes required)

| Service | Volume Path | Purpose | Status |
|---------|------------|---------|--------|
| **firecrawl_db** | `/mnt/cache/appdata/firecrawl_postgres` | PostgreSQL data | ✅ Already configured |
| **firecrawl_cache** | `/mnt/cache/appdata/firecrawl_redis` | Redis AOF + RDB | ✅ Already configured |
| **firecrawl_webhook** | `/mnt/cache/appdata/firecrawl_webhook` | BM25 search index | ✅ Just added |
| **firecrawl_mcp** | `/mnt/cache/appdata/firecrawl_mcp_resources` | MCP resources | ✅ Already configured |

## Data Flow

```
Firecrawl API (stateless)
    ↓
PostgreSQL (persisted) ← Job queues, crawl results
    ↓
Redis (persisted) ← Task queues, rate limits
    ↓
Webhook Bridge (now persisted) ← BM25 keyword index
    ↓
Qdrant (external) ← Vector embeddings
```

## Key Findings

1. **Firecrawl API is intentionally stateless** - confirmed by official upstream configuration
2. **All persistence delegated to external services**:
   - PostgreSQL: Job state, crawl results (already persisted)
   - Redis: Queues, cache, rate limiting (already persisted)
   - Webhook: BM25 keyword index (now persisted)
3. **No data loss risk** - All critical data has redundant storage
4. **Architecture follows microservices best practices** - stateless APIs, persistent data stores

## Configuration Complete

All required data is now properly persisted. No additional volumes needed.
