# Webhook Bridge REST API Design
## Unified Firecrawl Operations

**Date:** 2025-11-14
**Status:** Design Proposal
**Goal:** Consolidate all Firecrawl operations through webhook bridge, eliminating duplication between MCP and webhook services.

---

## Architecture Decision

**Current (Duplicated):**
```
Claude → MCP → Firecrawl API (direct)
         ↓
    Webhook Bridge → Firecrawl API (for indexing only)
         ↓
    Database (metrics with FK violations)
```

**Proposed (Unified):**
```
Claude → MCP (thin client) → Webhook Bridge API → Firecrawl API
                                      ↓
                              Auto-indexing + Metrics
                                      ↓
                              PostgreSQL (unified tracking)
```

**Benefits:**
1. **Single Firecrawl integration point** - webhook only
2. **Automatic metrics tracking** - all operations logged
3. **Unified session management** - no FK violations
4. **MCP becomes thin client** - just schema validation + response formatting
5. **Automatic indexing** - optional background indexing of all results

---

## API Endpoints

**Architecture:** Webhook bridge implements **all** Firecrawl v2 endpoints as transparent proxies with optional auto-indexing + custom endpoints for webhook-specific features.

### Firecrawl v2 API (Proxied with Enhancements)

**All endpoints proxy to `http://firecrawl:3002/v2/*` with middleware for:**
- Auto-indexing scraped content (when enabled)
- Crawl session tracking in database
- Performance metrics collection
- Request/response logging

#### Core Operations

```http
POST   /v2/scrape                    # Single URL scrape → proxy + auto-index
GET    /v2/scrape/{jobId}           # Scrape job status → proxy
POST   /v2/batch/scrape             # Batch scrape → proxy + auto-index
GET    /v2/batch/scrape/{jobId}     # Batch status → proxy
DELETE /v2/batch/scrape/{jobId}     # Cancel batch → proxy

POST   /v2/crawl                    # Start crawl → proxy + create crawl_session + auto-index
GET    /v2/crawl/{jobId}            # Crawl status → proxy
DELETE /v2/crawl/{jobId}            # Cancel crawl → proxy
GET    /v2/crawl/{jobId}/errors     # Crawl errors → proxy
POST   /v2/crawl/params-preview     # Preview crawl params → proxy
GET    /v2/crawl/ongoing            # List ongoing crawls → proxy
GET    /v2/crawl/active             # List active crawls → proxy

POST   /v2/map                      # URL discovery → proxy
POST   /v2/search                   # Web search → proxy
```

#### AI Features

```http
POST   /v2/extract                  # Extract structured data → proxy
GET    /v2/extract/{jobId}          # Extraction status → proxy
```

#### Account Management

```http
GET    /v2/team/credit-usage                # Current credits → proxy
GET    /v2/team/credit-usage/historical     # Credit history → proxy
GET    /v2/team/token-usage                 # Current tokens → proxy
GET    /v2/team/token-usage/historical      # Token history → proxy
```

#### Monitoring

```http
GET    /v2/team/queue-status        # Queue status → proxy
GET    /v2/concurrency-check        # Concurrency limits → proxy
```

#### Experimental

```http
POST   /v2/x402/search              # X402 micropayment search → proxy
```

**Implementation:** Python middleware intercepts requests, forwards to Firecrawl, processes responses, triggers auto-indexing workers.

---

### Custom Webhook Bridge Endpoints

**These are NOT proxied - implemented directly by webhook bridge:**

```http
POST   /api/query                           # Search indexed documents (existing)
GET    /api/metrics/crawls/{crawl_id}       # Crawl performance metrics (existing)
GET    /api/health                          # Health check
POST   /api/webhook/changedetection         # changedetection.io webhook receiver
POST   /api/webhook/firecrawl               # Firecrawl webhook receiver
```

---

### Request/Response Examples

**All v2 endpoints follow Firecrawl's exact schema.** Webhook bridge is transparent.

#### Example: POST /v2/scrape

**Request (same as Firecrawl):**
```json
{
  "url": "https://example.com",
  "formats": ["markdown", "html"],
  "onlyMainContent": true,
  "timeout": 60000
}
```

**Response (Firecrawl response + indexing metadata):**
```json
{
  "success": true,
  "data": {
    "markdown": "...",
    "html": "...",
    "metadata": {
      "title": "Example",
      "statusCode": 200
    }
  },
  "scrape_id": "uuid",
  "_webhook_meta": {
    "indexed": true,
    "document_id": "doc-uuid",
    "chunks": 5
  }
}
```

#### Example: POST /v2/crawl

**Request (same as Firecrawl):**
```json
{
  "url": "https://example.com",
  "limit": 100,
  "excludePaths": ["/admin/*"],
  "scrapeOptions": {
    "formats": ["markdown"]
  }
}
```

**Response (Firecrawl response + session tracking):**
```json
{
  "success": true,
  "id": "crawl-job-uuid",
  "url": "/v2/crawl/crawl-job-uuid",
  "_webhook_meta": {
    "crawl_session_id": "db-session-uuid",
    "auto_index_enabled": true
  }
}
```

---

### Custom Endpoint: POST /api/query

**Searches indexed documents (not proxied to Firecrawl)**

```http
POST /api/query
Authorization: Bearer <WEBHOOK_API_SECRET>
```

**Request:**
```json
{
  "query": "authentication implementation",
  "mode": "hybrid",
  "limit": 5,
  "filters": {
    "domain": "docs.example.com"
  }
}
```

**Response:**
```json
{
  "results": [
    {
      "url": "https://docs.example.com/auth",
      "title": "Authentication Guide",
      "text": "...",
      "score": 0.95,
      "metadata": {}
    }
  ],
  "total": 23,
  "query": "authentication implementation",
  "mode": "hybrid"
}
```

---

### Custom Endpoint: GET /api/metrics/crawls/{crawl_id}

**Get performance metrics for a crawl job (not proxied to Firecrawl)**

```http
GET /api/metrics/crawls/{crawl_id}
Authorization: Bearer <WEBHOOK_API_SECRET>
```

**Response:**
```json
{
  "crawl_id": "uuid",
  "total_documents": 100,
  "indexed_documents": 95,
  "failed_documents": 5,
  "avg_index_time_ms": 450,
  "total_chunks": 523,
  "storage_bytes": 1048576
}
```

---

## Database Schema Changes

### New Table: `crawl_sessions`

```sql
CREATE TABLE webhook.crawl_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id VARCHAR(255) UNIQUE NOT NULL,  -- Firecrawl job ID
    operation_type VARCHAR(50) NOT NULL,  -- 'scrape_batch', 'crawl'
    base_url TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',  -- 'pending', 'scraping', 'completed', 'failed', 'cancelled'
    total_urls INTEGER DEFAULT 0,
    completed_urls INTEGER DEFAULT 0,
    failed_urls INTEGER DEFAULT 0,
    indexed_documents INTEGER DEFAULT 0,
    auto_index BOOLEAN DEFAULT TRUE,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_crawl_sessions_job_id ON webhook.crawl_sessions(job_id);
CREATE INDEX idx_crawl_sessions_status ON webhook.crawl_sessions(status);
```

### Update: `operation_metrics`

Make `crawl_id` nullable and add foreign key:

```sql
ALTER TABLE webhook.operation_metrics
    ALTER COLUMN crawl_id DROP NOT NULL;

ALTER TABLE webhook.operation_metrics
    ADD CONSTRAINT fk_operation_metrics_crawl_id
    FOREIGN KEY (crawl_id) REFERENCES webhook.crawl_sessions(job_id)
    ON DELETE SET NULL;
```

---

## Auto-Indexing Behavior

**When `auto_index: true` (default):**

1. **Single Scrape:** Immediately index document after successful scrape
2. **Batch Scrape:** Index each document as it completes (background worker)
3. **Crawl:** Index each page as it's scraped (background worker)

**When `auto_index: false`:**

- Results returned but not indexed
- Useful for one-off scraping without polluting search index

**Optional `crawl_id` Parameter:**

- Associates scrape with existing crawl session
- Enables metrics tracking even for standalone scrapes
- Used by MCP to link operations

---

## Implementation Plan

### Phase 1: Database Schema (Week 1)
- [ ] Create `crawl_sessions` table migration
- [ ] Update `operation_metrics` FK constraint
- [ ] Add indexes for performance
- [ ] Test migrations on dev database

### Phase 2: Webhook API Endpoints (Week 1-2)
- [ ] Implement `/api/scrape` unified endpoint
- [ ] Implement `/api/crawl` unified endpoint
- [ ] Implement `/api/map` endpoint
- [ ] Implement `/api/search` endpoint
- [ ] Add auto-indexing logic to all endpoints
- [ ] Add crawl session creation/updates

### Phase 3: MCP Refactoring (Week 2)
- [ ] Remove `@firecrawl/client` dependency from MCP
- [ ] Create webhook client in MCP
- [ ] Update scrape tool to call webhook API
- [ ] Update crawl tool to call webhook API
- [ ] Update map tool to call webhook API
- [ ] Update search tool to call webhook API
- [ ] Remove pipeline logic (now in webhook)
- [ ] Keep only schema validation + response formatting

### Phase 4: Testing & Validation (Week 3)
- [ ] Integration tests for all webhook endpoints
- [ ] MCP tool tests with webhook backend
- [ ] Performance testing (compare before/after)
- [ ] Metrics validation (all operations tracked)
- [ ] Auto-indexing validation

### Phase 5: Deployment (Week 3)
- [ ] Deploy webhook schema updates
- [ ] Deploy webhook API updates
- [ ] Deploy MCP updates
- [ ] Monitor metrics and logs
- [ ] Validate no FK violations

---

## Code Reduction Estimate

**MCP Server (apps/mcp):**
- Remove: `@firecrawl/client` dependency (~500 KB)
- Remove: Pipeline logic (~2000 LOC)
- Remove: Native scraping client (~500 LOC)
- Remove: Strategy selector (~300 LOC)
- Keep: Schema validation (~500 LOC)
- Keep: Response formatting (~300 LOC)
- **Net reduction: ~2500 LOC, simpler dependencies**

**Webhook Bridge (apps/webhook):**
- Add: Scrape/crawl/map/search endpoints (~800 LOC)
- Add: Crawl session management (~300 LOC)
- Add: Auto-indexing orchestration (~200 LOC)
- Update: Metrics tracking (minor changes)
- **Net addition: ~1300 LOC (but eliminates duplication)**

**Overall:**
- Code reduction: ~1200 LOC
- Dependency reduction: 1 major package
- Maintenance burden: Significantly reduced (single integration point)

---

## Risks & Mitigation

### Risk 1: Single Point of Failure
**Impact:** Webhook failure breaks all Firecrawl operations
**Mitigation:**
- Health checks on webhook
- Graceful degradation in MCP
- Retry logic with exponential backoff

### Risk 2: Increased Latency
**Impact:** Extra HTTP hop (MCP → Webhook → Firecrawl)
**Mitigation:**
- Minimal overhead (same network, ~5ms)
- Benefits outweigh cost (metrics, indexing)
- Async operations unaffected

### Risk 3: Breaking Changes
**Impact:** Existing MCP clients may break
**Mitigation:**
- MCP tool interfaces unchanged
- Backward compatible responses
- Gradual rollout with feature flags

---

## Success Metrics

**Technical:**
- ✅ Zero FK violations in operation_metrics
- ✅ 100% metrics coverage (all operations tracked)
- ✅ < 50ms additional latency per request
- ✅ 95%+ auto-indexing success rate

**Operational:**
- ✅ Reduced code complexity (1200 LOC reduction)
- ✅ Faster feature development (single integration point)
- ✅ Improved observability (unified metrics)
- ✅ Simplified debugging (single Firecrawl client)

---

## Next Steps

1. **Review & Approval:** Get stakeholder sign-off on design
2. **Database Migration:** Create and test schema changes
3. **Prototype Endpoint:** Implement `/api/scrape` as proof of concept
4. **Validate Metrics:** Ensure crawl sessions properly tracked
5. **Full Implementation:** Roll out remaining endpoints
6. **MCP Refactor:** Simplify MCP to thin client
7. **Deploy & Monitor:** Gradual rollout with monitoring
