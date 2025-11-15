# Firecrawl API PostgreSQL Database Schema Research

## Summary

Firecrawl uses a custom-built queue system called **NuQ** (Not-Unique Queue) to manage scraping jobs in PostgreSQL. Job data and results are stored in JSONB columns (`data` and `returnvalue`) within queue tables. The webhook bridge service maintains separate tracking tables in the `webhook` schema for metrics and session management. **Important**: Scraped content (markdown, HTML, metadata) is stored in the `returnvalue` JSONB column, not in separate normalized tables.

## Key Components

### NuQ Queue System
- `/compose/pulse/apps/nuq-postgres/nuq.sql` - Complete database schema definition
- `/compose/pulse/apps/api/src/services/worker/nuq.ts` - TypeScript queue implementation
- `/compose/pulse/apps/api/src/types.ts` - Job data type definitions
- `/compose/pulse/apps/api/src/lib/entities.ts` - Document/result structure definitions

### Webhook Schema (Metrics & Tracking)
- `/compose/pulse/apps/webhook/domain/models.py` - SQLAlchemy models for metrics
- `/compose/pulse/apps/webhook/alembic/versions/*.py` - Schema migrations
- Separate `webhook` schema for observability/tracking data

## Database Schemas

PostgreSQL instance has **two schemas**:

1. **`nuq` schema** - Firecrawl job queue tables (managed by NuQ)
2. **`webhook` schema** - Webhook bridge metrics and session tracking

### Schema: `nuq` (Firecrawl Job Queue)

#### Table: `nuq.queue_scrape`

Primary table for scraping jobs. Stores job metadata, input parameters, and results.

```sql
CREATE TABLE nuq.queue_scrape (
  -- Identity
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Queue management
  status nuq.job_status NOT NULL DEFAULT 'queued', -- 'queued' | 'active' | 'completed' | 'failed'
  priority int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,

  -- Worker locking (optimistic concurrency)
  lock uuid,
  locked_at timestamptz,
  stalls integer, -- retry counter for stuck jobs

  -- Job data (JSONB - see ScrapeJobData type)
  data jsonb,

  -- Result data (JSONB - see Document type)
  returnvalue jsonb,  -- *** SCRAPED CONTENT STORED HERE ***
  failedreason text,

  -- Grouping & ownership
  owner_id uuid,      -- team/user identifier (normalized via UUID v5)
  group_id uuid,      -- for crawl operations (links to nuq.group_crawl)

  -- Async notification support
  listen_channel_id text -- for RabbitMQ/PostgreSQL NOTIFY
);
```

**Key Indexes:**
```sql
-- Priority queue optimization (for getJobToProcess)
CREATE INDEX nuq_queue_scrape_queued_optimal_2_idx
  ON nuq.queue_scrape (priority ASC, created_at ASC, id)
  WHERE status = 'queued';

-- Stale lock detection
CREATE INDEX queue_scrape_active_locked_at_idx
  ON nuq.queue_scrape (locked_at)
  WHERE status = 'active';

-- Crawl grouping queries
CREATE INDEX nuq_queue_scrape_group_mode_status_idx
  ON nuq.queue_scrape (group_id, status)
  WHERE (data->>'mode') = 'single_urls';

-- Listing completed crawl results
CREATE INDEX nuq_queue_scrape_group_completed_listing_idx
  ON nuq.queue_scrape (group_id, finished_at ASC, created_at ASC)
  WHERE status = 'completed' AND (data->>'mode') = 'single_urls';
```

#### Table: `nuq.queue_scrape_backlog`

Overflow table for backpressure management when queue is full.

```sql
CREATE TABLE nuq.queue_scrape_backlog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  priority int NOT NULL DEFAULT 0,
  listen_channel_id text,
  owner_id uuid,
  group_id uuid,
  times_out_at timestamptz  -- auto-expire backlogged jobs
);
```

#### Table: `nuq.group_crawl`

Tracks crawl sessions that group multiple scrape jobs.

```sql
CREATE TABLE nuq.group_crawl (
  id uuid PRIMARY KEY,
  status nuq.group_status NOT NULL DEFAULT 'active', -- 'active' | 'completed' | 'cancelled'
  created_at timestamptz NOT NULL DEFAULT now(),
  owner_id uuid NOT NULL,
  ttl int8 NOT NULL DEFAULT 86400000,  -- TTL in milliseconds
  expires_at timestamptz               -- computed on completion
);
```

#### Table: `nuq.queue_crawl_finished`

Notification queue for completed crawls (same structure as `queue_scrape`).

### Schema: `webhook` (Metrics & Tracking)

#### Table: `webhook.crawl_sessions`

High-level tracking for Firecrawl v2 operations (scrape, crawl, map, search, extract).

```sql
CREATE TABLE webhook.crawl_sessions (
  -- Identity
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id varchar(255) UNIQUE NOT NULL,  -- maps to Firecrawl v2 job_id
  base_url varchar(500) NOT NULL,
  operation_type varchar(50) NOT NULL,  -- 'scrape' | 'scrape_batch' | 'crawl' | 'map' | 'search' | 'extract'

  -- Lifecycle
  started_at timestamptz NOT NULL,
  completed_at timestamptz,
  status varchar(50) NOT NULL DEFAULT 'in_progress',
  success boolean,

  -- Statistics
  total_urls int NOT NULL DEFAULT 0,
  completed_urls int NOT NULL DEFAULT 0,
  failed_urls int NOT NULL DEFAULT 0,

  -- Backward compatibility
  total_pages int NOT NULL DEFAULT 0,
  pages_indexed int NOT NULL DEFAULT 0,
  pages_failed int NOT NULL DEFAULT 0,

  -- Aggregate timing (milliseconds)
  total_chunking_ms float NOT NULL DEFAULT 0.0,
  total_embedding_ms float NOT NULL DEFAULT 0.0,
  total_qdrant_ms float NOT NULL DEFAULT 0.0,
  total_bm25_ms float NOT NULL DEFAULT 0.0,
  duration_ms float,

  -- End-to-end tracking
  initiated_at timestamptz,
  e2e_duration_ms float,

  -- Configuration
  auto_index boolean NOT NULL DEFAULT true,
  expires_at timestamptz,

  -- Metadata
  extra_metadata jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

#### Table: `webhook.operation_metrics`

Fine-grained operation timing (chunking, embedding, indexing per document).

```sql
CREATE TABLE webhook.operation_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp timestamptz NOT NULL DEFAULT now(),
  operation_type varchar(50) NOT NULL,  -- 'chunking' | 'embedding' | 'qdrant' | 'bm25'
  operation_name varchar(100) NOT NULL,
  duration_ms float NOT NULL,
  success boolean NOT NULL DEFAULT true,
  error_message text,
  request_id varchar(100),
  job_id varchar(100),
  crawl_id varchar(255),  -- links to crawl_sessions.job_id
  document_url varchar(500),
  extra_metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

#### Table: `webhook.request_metrics`

HTTP request-level timing for webhook API endpoints.

```sql
CREATE TABLE webhook.request_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp timestamptz NOT NULL DEFAULT now(),
  method varchar(10) NOT NULL,
  path varchar(500) NOT NULL,
  status_code int NOT NULL,
  duration_ms float NOT NULL,
  request_id varchar(100),
  client_ip varchar(50),
  user_agent varchar(500),
  extra_metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

#### Table: `webhook.change_events`

Tracks changedetection.io webhook events for content monitoring.

```sql
CREATE TABLE webhook.change_events (
  id serial PRIMARY KEY,
  watch_id varchar(255) NOT NULL,
  watch_url text NOT NULL,
  detected_at timestamptz NOT NULL DEFAULT now(),
  diff_summary text,
  snapshot_url text,
  rescrape_job_id varchar(255),
  rescrape_status varchar(50),
  indexed_at timestamptz,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

## Data Structures (JSONB Schemas)

### `data` Column (Job Input)

**Type:** `ScrapeJobData` (TypeScript union type)

**Mode: `single_urls`** (individual scrape jobs):
```typescript
{
  mode: "single_urls",
  team_id: string,
  url: string,
  scrapeOptions: BaseScrapeOptions,
  crawlerOptions?: any,
  internalOptions?: InternalOptions,
  origin: string,
  crawl_id?: string,           // if part of a crawl
  sitemapped?: boolean,
  webhook?: WebhookConfig,
  v1?: boolean,
  is_scrape?: boolean,         // disables billing
  apiKeyId: number | null,
  zeroDataRetention: boolean,  // ephemeral jobs (deleted after 1hr)
  concurrencyLimited?: boolean,
  traceContext?: SerializedTraceContext
}
```

**Mode: `kickoff`** (initiate crawl):
```typescript
{
  mode: "kickoff",
  team_id: string,
  url: string,
  crawl_id: string,
  scrapeOptions: BaseScrapeOptions,
  crawlerOptions?: any,
  origin: string,
  webhook?: WebhookConfig,
  v1: boolean,
  apiKeyId: number | null,
  zeroDataRetention: boolean
}
```

**Mode: `kickoff_sitemap`** (crawl from sitemap):
```typescript
{
  mode: "kickoff_sitemap",
  team_id: string,
  crawl_id: string,
  sitemapUrl: string,
  location?: string,
  origin: string,
  webhook?: WebhookConfig,
  v1: boolean,
  apiKeyId: number | null,
  zeroDataRetention: boolean
}
```

### `returnvalue` Column (Scraped Content)

**Type:** `Document` (from `/compose/pulse/apps/api/src/lib/entities.ts`)

```typescript
{
  id?: string,
  url?: string,
  content: string,           // *** PRIMARY CONTENT (text/markdown) ***
  markdown?: string,         // Markdown representation
  html?: string,             // Cleaned HTML
  rawHtml?: string,          // Original HTML
  llm_extraction?: object,   // Structured extraction results
  createdAt?: Date,
  updatedAt?: Date,
  type?: string,
  metadata: {
    sourceURL?: string,
    title?: string,
    description?: string,
    language?: string,
    ogImage?: string,
    // ... any other metadata from scraping
  },
  childrenLinks?: string[],  // Links discovered during crawl
  linksOnPage?: string[],    // All links on page
  provider?: string,
  warning?: string,
  actions?: {                // For action-based scraping
    screenshots?: string[],  // Base64 or GCS URLs
    scrapes?: Array<{url: string, html: string}>,
    javascriptReturns?: Array<{type: string, value: unknown}>,
    pdfs?: string[]
  },
  branding?: BrandingProfile,
  index?: number
}
```

## Sample Queries

### Fetch Recent Completed Scrapes

```sql
SELECT
  id,
  created_at,
  finished_at,
  data->>'url' as url,
  data->>'team_id' as team_id,
  returnvalue->'metadata'->>'title' as title,
  LENGTH(returnvalue->>'content') as content_length,
  status
FROM nuq.queue_scrape
WHERE status = 'completed'
  AND created_at > NOW() - INTERVAL '1 hour'
  AND group_id IS NULL  -- exclude crawl jobs
ORDER BY created_at DESC
LIMIT 100;
```

### Get Crawl Results by Group ID

```sql
SELECT
  id,
  data->>'url' as url,
  returnvalue->'metadata'->>'title' as title,
  returnvalue->>'markdown' as markdown,
  finished_at
FROM nuq.queue_scrape
WHERE group_id = '<crawl_uuid>'
  AND status = 'completed'
  AND (data->>'mode') = 'single_urls'
ORDER BY finished_at ASC, created_at ASC;
```

### Find Failed Jobs with Errors

```sql
SELECT
  id,
  data->>'url' as url,
  failedreason,
  stalls,
  created_at,
  finished_at
FROM nuq.queue_scrape
WHERE status = 'failed'
  AND created_at > NOW() - INTERVAL '6 hours'
ORDER BY created_at DESC;
```

### Crawl Session Metrics

```sql
SELECT
  job_id,
  operation_type,
  base_url,
  total_urls,
  completed_urls,
  failed_urls,
  duration_ms,
  total_embedding_ms,
  total_qdrant_ms,
  status,
  started_at,
  completed_at
FROM webhook.crawl_sessions
WHERE started_at > NOW() - INTERVAL '24 hours'
ORDER BY started_at DESC;
```

### Join Jobs with Session Metrics

```sql
SELECT
  qs.id,
  qs.data->>'url' as url,
  qs.status as job_status,
  cs.job_id,
  cs.operation_type,
  cs.total_urls,
  cs.completed_urls,
  cs.duration_ms
FROM nuq.queue_scrape qs
LEFT JOIN webhook.crawl_sessions cs ON cs.job_id = qs.group_id::text
WHERE qs.group_id IS NOT NULL
  AND qs.created_at > NOW() - INTERVAL '1 hour';
```

## Data Lifecycle & Cleanup

### Auto-Cleanup Policies (pg_cron)

**Completed Jobs (1 hour retention):**
```sql
-- Runs every 5 minutes
DELETE FROM nuq.queue_scrape
WHERE status = 'completed'
  AND created_at < NOW() - INTERVAL '1 hour'
  AND group_id IS NULL;
```

**Failed Jobs (6 hour retention):**
```sql
-- Runs every 5 minutes
DELETE FROM nuq.queue_scrape
WHERE status = 'failed'
  AND created_at < NOW() - INTERVAL '6 hours'
  AND group_id IS NULL;
```

**Stale Lock Recovery (1 minute timeout):**
```sql
-- Runs every 15 seconds
-- Retry up to 9 times
UPDATE nuq.queue_scrape
SET status = 'queued', lock = NULL, locked_at = NULL, stalls = COALESCE(stalls, 0) + 1
WHERE locked_at <= NOW() - INTERVAL '1 minute'
  AND status = 'active'
  AND COALESCE(stalls, 0) < 9;

-- After 9 stalls, mark as failed
UPDATE nuq.queue_scrape
SET status = 'failed', lock = NULL, locked_at = NULL
WHERE locked_at <= NOW() - INTERVAL '1 minute'
  AND status = 'active'
  AND COALESCE(stalls, 0) >= 9;
```

**Backlog Expiration:**
```sql
-- Runs every minute
DELETE FROM nuq.queue_scrape_backlog
WHERE times_out_at < NOW();
```

**Group Cleanup (TTL-based):**
```sql
-- Runs every 5 minutes
-- Cascades to all child jobs
DELETE FROM nuq.group_crawl
WHERE status = 'completed'
  AND expires_at < NOW();
```

### Data Retention Notes

- **Ephemeral jobs** (`zeroDataRetention: true`): Deleted after 1 hour regardless of status
- **Crawl jobs** (`group_id IS NOT NULL`): Retained until group expires (default 24 hours)
- **Metrics tables** (`webhook.*`): No automatic cleanup (manual archival recommended)
- **Backlog jobs**: Expire based on `times_out_at` timestamp

## Constraints & Foreign Keys

### Primary Keys
- All tables use UUID primary keys (except `webhook.change_events` uses serial)
- `nuq.group_crawl.id` referenced by `nuq.queue_scrape.group_id` (implicit FK)
- `webhook.crawl_sessions.job_id` unique constraint for lookups

### Indexes for Performance
- **Priority queue**: Covering index on `(priority, created_at, id)` for `status = 'queued'`
- **Time-series queries**: Indexes on `created_at`, `finished_at`, `started_at`
- **Filtering**: Partial indexes on status values (`queued`, `active`, `completed`, `failed`)
- **JSONB lookups**: Expression indexes on `data->>'mode'` for crawl queries

### Auto-Vacuum Tuning
```sql
-- Aggressive auto-vacuum for high-churn queue tables
ALTER TABLE nuq.queue_scrape SET (
  autovacuum_vacuum_scale_factor = 0.01,
  autovacuum_analyze_scale_factor = 0.01,
  autovacuum_vacuum_cost_limit = 2000,
  autovacuum_vacuum_cost_delay = 2
);
```

## Estimated Row Sizes & Growth

### `nuq.queue_scrape`

**Typical row size:**
- Base columns: ~200 bytes
- `data` JSONB: 500-2000 bytes (average ~1 KB)
- `returnvalue` JSONB: **5-50 KB** (varies by content length)
  - Markdown: 2-20 KB typical
  - HTML: 10-100 KB typical
  - Screenshots (base64): +500 KB if included

**Growth rate:**
- High-volume API: 10,000-100,000 jobs/hour
- With 1-hour retention: **~50-500 GB disk usage** (steady state)
- Crawl groups persist longer: additional 10-100 GB per active crawl

### `webhook.crawl_sessions`

**Typical row size:** ~500 bytes (minimal JSONB)

**Growth rate:**
- 1 row per crawl/operation
- Low volume: 100-1000 sessions/day (~50-500 KB/day)
- **Manual cleanup recommended** (no TTL by default)

### `webhook.operation_metrics`

**Typical row size:** ~300 bytes

**Growth rate:**
- 4 operations per document (chunking, embedding, qdrant, bm25)
- High volume: 40,000-400,000 operations/hour
- **Fast growth: ~10-100 GB/month** (requires archival strategy)

## Considerations

### Performance Bottlenecks
- **JSONB queries**: Extracting `data->>'url'` or `returnvalue` fields requires full decompression
- **Large returnvalues**: Documents with screenshots/PDFs can be 1+ MB (slow SELECTs)
- **Index bloat**: High churn causes index fragmentation (daily REINDEX scheduled)
- **Lock contention**: Workers compete for `FOR UPDATE SKIP LOCKED` on priority queue

### Query Optimization Tips
1. **Use covering indexes**: Query by `id` or indexed `status` columns first
2. **Avoid SELECT ***: Only fetch needed JSONB keys with `->` operators
3. **Batch operations**: Use `WHERE id = ANY($1::uuid[])` for bulk lookups
4. **Pagination**: Always use `LIMIT` + `OFFSET` or cursor-based pagination
5. **Time filters**: Add `created_at > NOW() - INTERVAL '...'` to leverage indexes

### Known Edge Cases
- **Owner ID normalization**: Non-UUID owner IDs are hashed via UUID v5 (see `normalizeOwnerId()`)
- **Group orphans**: If group finishes before all jobs complete, jobs may orphan
- **Backlog promotion**: Jobs move from `_backlog` to main table when capacity available
- **Retry limits**: Jobs stall max 9 times before permanent failure

### Integration with Vector Search
- Webhook bridge extracts `returnvalue.markdown` for Qdrant/BM25 indexing
- Chunking happens **outside** PostgreSQL (in Python worker)
- No direct FK relationship between `nuq.queue_scrape` and indexed documents
- Correlation via `job_id` or `document_url` in `webhook.operation_metrics`

## Next Steps

### For New Feature Implementation
1. **Query optimization**: Test query performance on production-scale data (10M+ rows)
2. **Schema extension**: Consider adding columns vs. JSONB keys (trade-offs)
3. **Migration strategy**: Use Alembic for `webhook` schema, SQL files for `nuq` schema
4. **Monitoring**: Add indexes for new query patterns (avoid full table scans)
5. **Data archival**: Plan for long-term metrics retention (cold storage or aggregation)

### Suggested Improvements
- Add composite index on `(group_id, status, finished_at)` for crawl listings
- Create materialized view for crawl session aggregates
- Implement partitioning for `operation_metrics` (time-based)
- Add GIN index on `returnvalue` JSONB for full-text search
- Consider separate table for large `returnvalue` data (blob storage)
