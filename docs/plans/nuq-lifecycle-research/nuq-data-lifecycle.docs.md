# NuQ Queue Data Lifecycle Research

## Summary

This research documents the complete lifecycle of scraped content in the NuQ (Not-Unique Queue) system, from job creation through data deletion. Key findings:

1. **Scraped content is stored in `nuq.queue_scrape.returnvalue` as JSONB** - not in separate tables
2. **Cleanup runs every 5 minutes** via pg_cron - completed jobs deleted after 1 hour, failed jobs after 6 hours
3. **`returnvalue` structure is identical across scrape/crawl/map** - all return `Document` type
4. **Jobs in crawl groups persist until the entire crawl completes** - then inherit the group's TTL (default 24 hours)
5. **No "completion event" exists beyond PostgreSQL NOTIFY** - must poll for status changes

## Key Components

### Core Files

- `/compose/pulse/apps/nuq-postgres/nuq.sql` - Complete schema with cron jobs and indexes
- `/compose/pulse/apps/api/src/services/worker/nuq.ts` - Queue implementation (job lifecycle methods)
- `/compose/pulse/apps/api/src/services/worker/nuq-worker.ts` - Worker loop that calls `jobFinish()`
- `/compose/pulse/apps/api/src/services/worker/scrape-worker.ts` - Job processor that returns `Document`
- `/compose/pulse/apps/api/src/controllers/v1/types.ts` - `Document` type definition (947-1039)

### Related Components

- `/compose/pulse/apps/api/src/services/worker/crawl-logic.ts` - Crawl completion handler
- `/compose/pulse/apps/api/src/services/worker/job-finalizer.ts` - Retry logic for `jobFinish()`
- `/compose/pulse/apps/api/src/services/queue-jobs.ts` - Job creation and waiting logic

## Implementation Patterns

### 1. Job Status Lifecycle

**State machine:**
```
queued → active → completed (or failed)
         ↓
      (lock timeout after 1min, stalls < 9)
         ↓
      queued (retry)
         ↓
      (stalls >= 9)
         ↓
      failed (permanent)
```

**Transitions:**
- `queued`: Initial state on job creation (`addJob()`)
- `active`: Worker acquires lock via `getJobToProcess()` (sets `lock` UUID + `locked_at` timestamp)
- `completed`: Worker calls `jobFinish(id, lock, returnvalue)` (sets `finished_at`, clears `lock`)
- `failed`: Worker calls `jobFail(id, lock, failedReason)` or stall limit exceeded

**Lock renewal:**
- Worker renews lock every 15 seconds via `renewLock(id, lock)`
- Cron job checks `locked_at <= NOW() - INTERVAL '1 minute'` every 15 seconds
- If lock expired and `stalls < 9`: reset to `queued`, increment `stalls`
- If lock expired and `stalls >= 9`: set to `failed` permanently

### 2. `returnvalue` JSONB Structure

**Type:** `Document` (from `apps/api/src/controllers/v1/types.ts:947`)

**Complete schema:**
```typescript
{
  // Core content (what you index)
  title?: string,
  description?: string,
  url?: string,
  markdown?: string,           // PRIMARY CONTENT for indexing
  html?: string,               // Cleaned HTML
  rawHtml?: string,            // Original HTML (deleted if not requested)
  links?: string[],            // All links found on page
  images?: string[],           // Image URLs
  screenshot?: string,         // Base64 or GCS URL
  extract?: any,               // Structured LLM extraction
  json?: any,                  // JSON mode output
  summary?: string,            // AI-generated summary
  branding?: BrandingProfile,  // Logo/colors
  warning?: string,            // Throttling or error warnings

  // Actions (for action-based scraping)
  actions?: {
    screenshots?: string[],    // Multiple screenshots
    scrapes?: Array<{          // Multi-step scrapes
      url: string,
      html: string
    }>,
    javascriptReturns?: Array<{
      type: string,
      value: unknown
    }>,
    pdfs?: string[]            // Extracted PDFs
  },

  // Change tracking (diff functionality)
  changeTracking?: {
    previousScrapeAt: string | null,
    changeStatus: "new" | "same" | "changed" | "removed",
    visibility: "visible" | "hidden",
    diff?: {
      text: string,
      json: {
        files: Array<{
          from: string | null,
          to: string | null,
          chunks: Array<{
            content: string,
            changes: Array<{
              type: string,
              normal?: boolean,
              ln?: number,
              ln1?: number,
              ln2?: number,
              content: string
            }>
          }>
        }>
      }
    },
    json?: any
  },

  // Metadata (ALWAYS present)
  metadata: {
    title?: string,
    description?: string,
    language?: string,
    keywords?: string,
    robots?: string,

    // Open Graph
    ogTitle?: string,
    ogDescription?: string,
    ogUrl?: string,
    ogImage?: string,
    ogAudio?: string,
    ogDeterminer?: string,
    ogLocale?: string,
    ogLocaleAlternate?: string[],
    ogSiteName?: string,
    ogVideo?: string,

    favicon?: string,

    // Dublin Core
    dcTermsCreated?: string,
    dcDateCreated?: string,
    dcDate?: string,
    dcTermsType?: string,
    dcType?: string,
    dcTermsAudience?: string,
    dcTermsSubject?: string,
    dcSubject?: string,
    dcDescription?: string,
    dcTermsKeywords?: string,

    // Dates
    modifiedTime?: string,
    publishedTime?: string,

    // Article metadata
    articleTag?: string,
    articleSection?: string,

    // Technical metadata
    url?: string,              // Final URL after redirects
    sourceURL?: string,        // Original requested URL
    statusCode: number,        // HTTP status (REQUIRED)
    scrapeId?: string,         // Job ID
    error?: string,            // Error message if failed
    numPages?: number,         // For PDFs
    contentType?: string,      // MIME type
    proxyUsed: "basic" | "stealth",  // Proxy type (REQUIRED)
    cacheState?: "hit" | "miss",
    cachedAt?: string,
    creditsUsed?: number,      // Billing info
    postprocessorsUsed?: string[]  // Applied transformations
  }
}
```

**Key observations:**
- `metadata.statusCode` and `metadata.proxyUsed` are REQUIRED fields
- `markdown` is the primary content for indexing (not `content` field like v2 API)
- Same structure used for scrape, crawl, and map operations
- Crawl jobs have `data.mode = 'single_urls'` with `data.crawl_id` set

### 3. Job Completion Flow

**Worker code (`nuq-worker.ts:100-114`):**
```typescript
try {
  processResult = { ok: true, data: await processJobInternal(job) };
} catch (error) {
  processResult = { ok: false, error };
}

if (processResult.ok) {
  await finalizeJobWithRetry(
    "finish",
    () => scrapeQueue.jobFinish(job.id, job.lock!, processResult.data, logger),
    job.id,
    logger
  );
} else {
  await finalizeJobWithRetry(
    "fail",
    () => scrapeQueue.jobFail(job.id, job.lock!, errorMessage, logger),
    job.id,
    logger
  );
}
```

**`jobFinish()` implementation (`nuq.ts:1199-1254`):**
```typescript
public async jobFinish(id: string, lock: string, returnvalue: any | null, _logger: Logger) {
  const result = await nuqPool.query(
    `UPDATE ${this.queueName}
     SET status = 'completed'::nuq.job_status,
         lock = null,
         locked_at = null,
         finished_at = now(),
         returnvalue = $3
     WHERE id = $1 AND lock = $2
     RETURNING id, listen_channel_id;`,
    [id, lock, returnvalue]
  );

  // Send notification via PostgreSQL NOTIFY or RabbitMQ
  if (result.rowCount !== 0) {
    const job = result.rows[0];
    if (process.env.NUQ_RABBITMQ_URL && job.listen_channel_id) {
      await this.sendJobEnd(job.id, "completed", job.listen_channel_id);
    } else {
      await nuqPool.query(`SELECT pg_notify('${this.queueName}', $1);`, [job.id + "|completed"]);
    }
  }
}
```

**Retry wrapper (`job-finalizer.ts`):**
- Exponential backoff: 100ms, 300ms, 900ms
- Max 3 attempts
- Prevents silent job loss from database connectivity issues
- Introduced in PR #2381

### 4. Cleanup Timing & Deletion Logic

**Cron schedule (from `nuq.sql`):**

```sql
-- Completed jobs: 1 hour retention (runs every 5 minutes)
SELECT cron.schedule('nuq_queue_scrape_clean_completed', '*/5 * * * *', $$
  DELETE FROM nuq.queue_scrape
  WHERE nuq.queue_scrape.status = 'completed'::nuq.job_status
    AND nuq.queue_scrape.created_at < now() - interval '1 hour'
    AND group_id IS NULL;  -- Skip crawl jobs (cleaned with group)
$$);

-- Failed jobs: 6 hour retention (runs every 5 minutes)
SELECT cron.schedule('nuq_queue_scrape_clean_failed', '*/5 * * * *', $$
  DELETE FROM nuq.queue_scrape
  WHERE nuq.queue_scrape.status = 'failed'::nuq.job_status
    AND nuq.queue_scrape.created_at < now() - interval '6 hours'
    AND group_id IS NULL;
$$);

-- Lock reaper: 1 minute timeout (runs every 15 seconds)
SELECT cron.schedule('nuq_queue_scrape_lock_reaper', '15 seconds', $$
  -- Retry if stalls < 9
  UPDATE nuq.queue_scrape
  SET status = 'queued'::nuq.job_status,
      lock = null,
      locked_at = null,
      stalls = COALESCE(stalls, 0) + 1
  WHERE nuq.queue_scrape.locked_at <= now() - interval '1 minute'
    AND nuq.queue_scrape.status = 'active'::nuq.job_status
    AND COALESCE(nuq.queue_scrape.stalls, 0) < 9;

  -- Fail if stalls >= 9
  WITH stallfail AS (
    UPDATE nuq.queue_scrape
    SET status = 'failed'::nuq.job_status,
        lock = null,
        locked_at = null,
        stalls = COALESCE(stalls, 0) + 1
    WHERE nuq.queue_scrape.locked_at <= now() - interval '1 minute'
      AND nuq.queue_scrape.status = 'active'::nuq.job_status
      AND COALESCE(nuq.queue_scrape.stalls, 0) >= 9
    RETURNING id
  )
  SELECT pg_notify('nuq.queue_scrape', (id::text || '|' || 'failed'::text)) FROM stallfail;
$$);

-- Backlog expiration (runs every minute)
SELECT cron.schedule('nuq_queue_scrape_backlog_reaper', '* * * * *', $$
  DELETE FROM nuq.queue_scrape_backlog
  WHERE nuq.queue_scrape_backlog.times_out_at < now();
$$);
```

**Crawl group cleanup (runs every 15 seconds):**
```sql
-- Mark groups as completed when all jobs done
SELECT cron.schedule('nuq_group_crawl_finished', '15 seconds', $$
  WITH finished_groups AS (
    UPDATE nuq.group_crawl
    SET status = 'completed'::nuq.group_status,
        expires_at = now() + MAKE_INTERVAL(secs => nuq.group_crawl.ttl / 1000)
    WHERE status = 'active'::nuq.group_status
      AND NOT EXISTS (
        SELECT 1 FROM nuq.queue_scrape
        WHERE nuq.queue_scrape.status IN ('active', 'queued')
          AND nuq.queue_scrape.group_id = nuq.group_crawl.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM nuq.queue_scrape_backlog
        WHERE nuq.queue_scrape_backlog.group_id = nuq.group_crawl.id
      )
    RETURNING id, owner_id
  )
  INSERT INTO nuq.queue_crawl_finished (data, owner_id, group_id)
  SELECT '{}'::jsonb, finished_groups.owner_id, finished_groups.id
  FROM finished_groups;
$$);

-- Delete expired groups and cascade to all jobs (runs every 5 minutes)
SELECT cron.schedule('nuq_group_crawl_clean', '*/5 * * * *', $$
  WITH cleaned_groups AS (
    DELETE FROM nuq.group_crawl
    WHERE nuq.group_crawl.status = 'completed'::nuq.group_status
      AND nuq.group_crawl.expires_at < now()
    RETURNING *
  ),
  cleaned_jobs_queue_scrape AS (
    DELETE FROM nuq.queue_scrape
    WHERE nuq.queue_scrape.group_id IN (SELECT id FROM cleaned_groups)
  ),
  cleaned_jobs_queue_scrape_backlog AS (
    DELETE FROM nuq.queue_scrape_backlog
    WHERE nuq.queue_scrape_backlog.group_id IN (SELECT id FROM cleaned_groups)
  ),
  cleaned_jobs_crawl_finished AS (
    DELETE FROM nuq.queue_crawl_finished
    WHERE nuq.queue_crawl_finished.group_id IN (SELECT id FROM cleaned_groups)
  )
  SELECT 1;
$$);
```

**Summary of retention windows:**
- Standalone completed jobs: **1 hour** (from `created_at`)
- Standalone failed jobs: **6 hours** (from `created_at`)
- Crawl jobs: **24 hours default** (from crawl completion + `ttl`)
- Backlogged jobs: Variable (based on `times_out_at` timestamp)
- Active jobs with expired lock: Re-queued up to 9 times, then failed

## Considerations

### Polling Strategy Implications

**No webhook/event stream exists for job completion:**
- Clients must poll `GET /v2/scrape/{id}` or query `nuq.queue_scrape` directly
- PostgreSQL NOTIFY only works for listenable jobs (requires `listen_channel_id`)
- RabbitMQ mode uses temporary exclusive queues (not accessible externally)

**Optimal polling approach:**
1. Poll every 500ms for first 5 seconds (low latency)
2. Exponential backoff to 5 seconds for long jobs
3. Stop polling after timeout or when job not found (likely deleted)

**Query for "recently completed, not yet deleted" jobs:**
```sql
SELECT id, returnvalue, finished_at
FROM nuq.queue_scrape
WHERE status = 'completed'
  AND created_at > NOW() - INTERVAL '55 minutes'  -- 5min buffer before deletion
  AND group_id IS NULL  -- or filter by specific group_id
ORDER BY finished_at DESC;
```

### Group ID Relationships

**Crawl grouping pattern:**
- One `nuq.group_crawl` record per crawl operation
- Multiple `nuq.queue_scrape` jobs with same `group_id`
- All jobs have `data.mode = 'single_urls'` and `data.crawl_id = group_id`
- Group completes when all jobs reach `completed` or `failed` status
- Group sets `expires_at = now() + ttl` on completion (default TTL: 86400000ms = 24 hours)
- Deleting group cascades to all child jobs

**Fetching crawl results:**
```sql
-- Get all completed URLs in a crawl
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

**Group statistics query (used by v2 API `/crawl/{id}`):**
```typescript
// From nuq.ts:533-566
public async getGroupNumericStats(groupId: string): Promise<Record<NuQJobStatus, number>> {
  return Object.fromEntries(
    (await nuqPool.query(`
      SELECT status::text, COUNT(*) as count
      FROM nuq.queue_scrape
      WHERE group_id = $1 AND data->>'mode' = 'single_urls'
      GROUP BY status
      UNION ALL
      SELECT 'backlog'::text, COUNT(*) as count
      FROM nuq.queue_scrape_backlog
      WHERE group_id = $1 AND data->>'mode' = 'single_urls'
    `, [groupId])).rows.map(row => [row.status, parseInt(row.count, 10)])
  );
}
```

### Data Flow Differences: Scrape vs Crawl vs Map

**Scrape (`POST /v2/scrape`):**
- Single job, `data.mode = 'single_urls'`
- No `group_id`, deleted after 1 hour
- `returnvalue` = full `Document` object
- Response: `data.document` field

**Batch Scrape (`POST /v2/batch/scrape`):**
- Multiple jobs, `data.mode = 'single_urls'`
- Shares `group_id` (but `crawlerOptions = null`)
- Each job has own `returnvalue`
- Response: `data` array of documents

**Crawl (`POST /v2/crawl`):**
- Multiple jobs, `data.mode = 'single_urls'` + `data.crawlerOptions`
- Shares `group_id`, linked to `nuq.group_crawl`
- Kickoff job (`mode = 'kickoff'`) has `returnvalue = null`
- Child jobs have full `Document` in `returnvalue`
- Response: `data` array of documents

**Map (`POST /v2/map`):**
- Single job, returns URL list (NOT full documents)
- `returnvalue` = `{ links: string[] }` (simpler structure)
- No scraping, just link extraction
- Response: `data.links` array

### Edge Cases & Gotchas

1. **Job raced out while waiting:**
   - Error: `"Job raced out while waiting for it"`
   - Cause: Job deleted by cron before `waitForJob()` completes
   - Mitigation: Check `created_at` to avoid polling near 1-hour boundary

2. **Lock mismatch on finalize:**
   - `jobFinish()` returns `false` if lock doesn't match
   - Cause: Another worker stole the job after lock timeout
   - Mitigation: Retry logic in `job-finalizer.ts`

3. **Owner ID normalization:**
   - Non-UUID `owner_id` values are hashed via UUID v5
   - Namespace: `0f38e00e-d7ee-4b77-8a7a-a787a3537ca2`
   - Check `normalizeOwnerId()` in `nuq.ts:57-61`

4. **Crawl completion timing:**
   - Group marked complete when NO jobs in `queued` or `active` state
   - Includes backlog queue check
   - Runs every 15 seconds, may have slight delay

5. **Notification delivery:**
   - PostgreSQL NOTIFY only sent if `listen_channel_id` is set
   - RabbitMQ mode requires connection to temporary queue
   - External clients should poll, not rely on notifications

## Recommended Polling Intervals

**For webhook bridge implementation:**

1. **Short timeout operations (scrape, map):**
   - Poll every 500ms for first 10 seconds
   - Backoff to 2 seconds until timeout (default 60s)
   - Stop polling if job not found

2. **Long-running operations (crawl):**
   - Poll every 5 seconds for entire duration
   - No backoff needed (crawls typically 1-10 minutes)
   - Stop polling if group status = `completed`

3. **Cleanup safety window:**
   - Query jobs with `created_at > NOW() - INTERVAL '55 minutes'`
   - Gives 5-minute buffer before 1-hour deletion cron
   - Prevents race condition with cleanup

## SQL Query Templates

### Fetch Single Job Result
```sql
SELECT
  id,
  status,
  created_at,
  finished_at,
  data,
  returnvalue,
  failedreason
FROM nuq.queue_scrape
WHERE id = $1::uuid;
```

### Fetch Recent Completed Jobs (for batch processing)
```sql
SELECT
  id,
  data->>'url' as url,
  returnvalue,
  finished_at
FROM nuq.queue_scrape
WHERE status = 'completed'
  AND created_at > NOW() - INTERVAL '55 minutes'
  AND group_id IS NULL
  AND data->>'team_id' = $1
ORDER BY finished_at DESC
LIMIT 100;
```

### Fetch Crawl Results (all pages)
```sql
SELECT
  id,
  data->>'url' as url,
  returnvalue->'metadata'->>'title' as title,
  returnvalue->>'markdown' as content,
  finished_at,
  COALESCE(LENGTH(returnvalue->>'markdown'), 0) as content_length
FROM nuq.queue_scrape
WHERE group_id = $1::uuid
  AND status = 'completed'
  AND (data->>'mode') = 'single_urls'
ORDER BY finished_at ASC, created_at ASC;
```

### Check Crawl Progress
```sql
SELECT
  gc.id as crawl_id,
  gc.status as crawl_status,
  gc.created_at as started_at,
  gc.expires_at,
  COUNT(*) FILTER (WHERE qs.status = 'completed') as completed_count,
  COUNT(*) FILTER (WHERE qs.status = 'failed') as failed_count,
  COUNT(*) FILTER (WHERE qs.status = 'active') as active_count,
  COUNT(*) FILTER (WHERE qs.status = 'queued') as queued_count,
  COUNT(*) as total_count
FROM nuq.group_crawl gc
LEFT JOIN nuq.queue_scrape qs ON qs.group_id = gc.id AND (qs.data->>'mode') = 'single_urls'
WHERE gc.id = $1::uuid
GROUP BY gc.id, gc.status, gc.created_at, gc.expires_at;
```

### Find Jobs Near Deletion (for urgent retrieval)
```sql
SELECT
  id,
  status,
  created_at,
  NOW() - created_at as age,
  CASE
    WHEN status = 'completed' THEN INTERVAL '1 hour' - (NOW() - created_at)
    WHEN status = 'failed' THEN INTERVAL '6 hours' - (NOW() - created_at)
  END as time_until_deletion
FROM nuq.queue_scrape
WHERE group_id IS NULL
  AND (
    (status = 'completed' AND created_at > NOW() - INTERVAL '55 minutes')
    OR (status = 'failed' AND created_at > NOW() - INTERVAL '5 hours 55 minutes')
  )
ORDER BY created_at DESC;
```

## Next Steps

### For Webhook Bridge Auto-Indexing

1. **Subscribe to job creation events:**
   - Option A: PostgreSQL NOTIFY on insert trigger
   - Option B: Poll `nuq.queue_scrape` every 5 seconds for new `queued` jobs
   - Option C: Intercept job creation in Firecrawl API (invasive)

2. **Track job completion:**
   - Poll jobs with known IDs every 1-2 seconds
   - Store tracking in `webhook.crawl_sessions` table
   - Mark as complete when `status = 'completed'` or `'failed'`

3. **Extract and index content:**
   - Parse `returnvalue.markdown` field
   - Chunk text (existing `chunking_service.py`)
   - Generate embeddings (existing `embedding_service.py`)
   - Index to Qdrant + BM25 (existing `indexing_service.py`)

4. **Handle edge cases:**
   - Job deleted before indexing completes (check `created_at` timestamp)
   - Crawl with hundreds of pages (batch index, track progress)
   - Failed jobs (log error, skip indexing)

5. **Performance optimization:**
   - Use `WHERE id = ANY($1::uuid[])` for batch fetches
   - Only SELECT needed JSONB keys: `returnvalue->'markdown'`
   - Add index on `(created_at DESC, status)` for polling queries
