# Firecrawl Job Completion Notification Research

## Summary

Firecrawl provides a robust webhook system for job completion notifications across all job types (scrape, crawl, batch_scrape, extract, map). The system supports per-request configuration, self-hosted environment variables, and database-stored webhooks. For the Pulse integration, webhooks are **already configured** via `SELF_HOSTED_WEBHOOK_URL` to send all events to the webhook bridge, making this the optimal capture mechanism.

**Key Finding:** Webhook payloads include full document content on `page` events but only metadata on `completed` events, requiring immediate capture during processing to preserve content before NuQ queue cleanup.

## Key Components

### Webhook Configuration
- `/compose/pulse/apps/api/src/services/webhook/config.ts`: Priority-based webhook config resolution
- `/compose/pulse/apps/api/src/services/webhook/delivery.ts`: `WebhookSender` class for HTTP POST delivery
- `/compose/pulse/apps/api/src/services/webhook/schema.ts`: Zod validation schema
- `/compose/pulse/apps/api/src/services/webhook/types.ts`: Event type definitions and payload interfaces

### Webhook Integration Points
- `/compose/pulse/apps/api/src/services/worker/scrape-worker.ts`: Sends `crawl.page` / `batch_scrape.page` on individual scrape completion (lines 468-496)
- `/compose/pulse/apps/api/src/services/worker/crawl-logic.ts`: Sends `crawl.completed` / `batch_scrape.completed` on job finalization (lines 82-110, 158-179)
- `/compose/pulse/apps/api/src/services/extract-worker.ts`: Sends `extract.started`, `extract.completed`, `extract.failed` (lines 68-126)

### Webhook Receiver
- `/compose/pulse/apps/webhook/api/routers/webhook.py`: FastAPI endpoint handling Firecrawl webhooks
- `/compose/pulse/apps/webhook/api/routers/firecrawl_proxy.py`: Unified v2 proxy with auto session tracking
- `/compose/pulse/.env.example`: `SELF_HOSTED_WEBHOOK_URL=http://pulse_webhook:52100/api/webhook/firecrawl` (line 277)

## Implementation Patterns

### 1. Webhook Configuration Priority
**How it works** (`apps/api/src/services/webhook/config.ts`):
```typescript
// Priority order:
1. Per-request webhook (in scrape/crawl payload)
2. SELF_HOSTED_WEBHOOK_URL environment variable (templated with {{JOB_ID}})
3. Database-stored webhook (if USE_DB_AUTHENTICATION=true)
```

**Pulse uses #2:** Self-hosted URL configured in root `.env`:
```bash
SELF_HOSTED_WEBHOOK_URL=http://pulse_webhook:52100/api/webhook/firecrawl
SELF_HOSTED_WEBHOOK_HMAC_SECRET=<generated-secret>
```

### 2. Event Filtering
**How it works** (`apps/api/src/services/webhook/schema.ts`):
```typescript
events: z.array(z.enum(["completed", "failed", "page", "started"]))
  .default(["completed", "failed", "page", "started"])
```
- If `events` array is empty/null, **all events are sent**
- Self-hosted webhook sends all events by default (lines 28 in config.ts)
- Can filter by event sub-type (e.g., only `completed` and `failed`)

### 3. Webhook Payload Structure
**How it works** (`apps/api/src/services/webhook/delivery.ts` lines 43-50):

**For `crawl.page` / `batch_scrape.page` events:**
```json
{
  "success": true,
  "type": "crawl.page",
  "id": "crawl-id-uuid",
  "data": [
    {
      "markdown": "# Page Title\n\nContent...",
      "content": "Raw HTML content...",
      "metadata": {
        "sourceURL": "https://example.com/page",
        "url": "https://example.com/page",
        "scrapeId": "scrape-job-id-uuid",
        "creditsUsed": 1
      }
    }
  ],
  "metadata": { "custom": "user-provided" }
}
```

**For `crawl.completed` / `batch_scrape.completed` events:**
```json
{
  "success": true,
  "type": "crawl.completed",
  "id": "crawl-id-uuid",
  "data": [],  // EMPTY in v1, full docs in v0
  "metadata": { "custom": "user-provided" }
}
```

### 4. HMAC Signature Verification
**How it works** (`apps/api/src/services/webhook/delivery.ts` lines 95-99):
```typescript
const hmac = createHmac("sha256", secret);
hmac.update(payloadString);
headers["X-Firecrawl-Signature"] = `sha256=${hmac.digest("hex")}`;
```

Webhook bridge validates in `/compose/pulse/apps/webhook/api/deps.py`:
```python
expected = hmac.new(secret, body, hashlib.sha256).hexdigest()
if not hmac.compare_digest(expected, provided):
    raise HTTPException(401, "Invalid webhook signature")
```

## Webhook Event Flow

### Scrape Job Lifecycle
```
1. Job added to nuq.queue_scrape
2. Worker picks up job (scrape-worker.ts)
3. On success:
   - If part of crawl → send crawl.page event (line 483)
   - If standalone scrape → no webhook (direct API response)
4. On crawl completion:
   - finishCrawlSuper() sends crawl.completed (crawl-logic.ts:168)
```

### Extract Job Lifecycle
```
1. Job added to extract queue
2. Worker picks up job (extract-worker.ts)
3. Sends extract.started (line 68)
4. On success → extract.completed (line 106)
5. On failure → extract.failed (line 122)
```

### Map Operation
**No dedicated webhook event** - Map returns results synchronously via API response (no background job).

## Considerations

### 1. Webhook Timing: Content Availability Window
**Critical:** Webhooks fire **before** NuQ queue cleanup, but content may be evicted from Redis shortly after job completion if `GCS_BUCKET_NAME` is set (scrape-worker.ts:1158-1164).

**Recommendation:** Capture and persist content **immediately** when webhook is received, not as a deferred background job.

### 2. V0 vs V1 Webhook Behavior
- **V0 (legacy):** `completed` event includes full document array (`data: Document[]`)
- **V1 (current):** `completed` event has empty data array (`data: []`), content sent via `page` events
- **Pulse uses V1** by default (crawl-logic.ts:159-179)

**Impact:** Must capture content from `page` events, not `completed` events.

### 3. Failed/Cancelled Jobs
- Failed scrapes send `crawl.page` with `success: false` and minimal metadata (scrape-worker.ts:636-658)
- Cancelled crawls send `crawl.completed` with `success: true` but `sc.cancelled = true` in DB
- Webhook bridge currently skips failed events (webhook.py:76-92)

**Recommendation:** Distinguish between "no content available" (failed scrape) and "job cancelled" (partial results may exist).

### 4. Rate Limiting and Throughput
- Large crawls send hundreds of `crawl.page` webhooks rapidly (one per discovered page)
- Webhook delivery timeout: 10 seconds (30s for v0) - scrape-worker.ts:107
- Delivery is async by default (`awaitWebhook: false`), doesn't block worker

**Recommendation:** Webhook receiver must handle high-throughput bursts (already implemented with FastAPI async + RQ queue in webhook.py).

### 5. Job ID Mapping
- `scrapeId` (individual page) vs `id` (crawl/batch_scrape job)
- Crawl completion events use crawl ID, page events include both
- Extract events use extract ID

**Recommendation:** Store both IDs for traceability and linking individual scrapes to parent crawl.

### 6. Map Results
Map operations return results synchronously (no background job), so:
- No webhook events generated
- Results must be captured from API response
- No NuQ queue entry

**Alternative:** Poll `/v2/map/{jobId}` endpoint or use async map with webhooks (if supported in future).

### 7. Signature Verification Failure Handling
If HMAC secret mismatches:
- Webhook delivery fails silently (logs error, doesn't retry) - delivery.ts:123-149
- Jobs complete normally but webhook bridge doesn't receive data
- No built-in alerting for signature failures

**Recommendation:** Monitor webhook delivery logs (`webhook_logs` table in Supabase or Redis queue) for failures.

## Next Steps

### Immediate (Using Existing Webhook)
1. **Enhance webhook receiver** (`apps/webhook/api/routers/webhook.py`):
   - Add database storage for received events (currently only queues for indexing)
   - Store full payload in `webhook_events` table with job metadata
   - Link events by `crawl_id` / `scrape_id` for reconstruction

2. **Capture content from `page` events**:
   - Parse `data` array from `crawl.page` / `batch_scrape.page` events
   - Store markdown + metadata in persistent storage (PostgreSQL `webhook` schema)
   - Index content in Qdrant for search

3. **Handle `completed` events**:
   - Mark crawl as finished in tracking table
   - Trigger post-processing (graph extraction, summarization)
   - Update session metadata with final stats

### Database Schema (Recommended)
```sql
-- Webhook event log
CREATE TABLE webhook.firecrawl_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(50) NOT NULL, -- crawl.page, crawl.completed, etc.
  job_id VARCHAR(100) NOT NULL,     -- Crawl/batch/extract ID
  scrape_id VARCHAR(100),            -- Individual scrape ID (for page events)
  success BOOLEAN NOT NULL,
  payload JSONB NOT NULL,            -- Full webhook payload
  received_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  INDEX idx_job_id (job_id),
  INDEX idx_event_type (event_type),
  INDEX idx_received_at (received_at)
);

-- Scraped documents
CREATE TABLE webhook.scraped_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scrape_id VARCHAR(100) UNIQUE NOT NULL,
  crawl_id VARCHAR(100),
  source_url TEXT NOT NULL,
  markdown TEXT,
  raw_html TEXT,
  metadata JSONB,
  captured_at TIMESTAMPTZ DEFAULT NOW(),
  INDEX idx_crawl_id (crawl_id),
  INDEX idx_source_url (source_url)
);
```

### Alternative: Database Trigger (If Webhooks Fail)
**If webhook delivery is unreliable**, implement PostgreSQL trigger on `nuq.queue_scrape`:
```sql
CREATE OR REPLACE FUNCTION capture_completed_job()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    -- Copy job data to webhook.scraped_documents
    INSERT INTO webhook.scraped_documents (scrape_id, crawl_id, metadata)
    VALUES (NEW.id, NEW.group_id, NEW.returnvalue);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_job_complete
AFTER UPDATE ON nuq.queue_scrape
FOR EACH ROW EXECUTE FUNCTION capture_completed_job();
```

**Tradeoff:** Requires direct database access, tightly couples to NuQ schema, no HMAC verification.

## Recommendation: Use Webhooks

**Optimal approach:** Enhance existing webhook receiver for the following reasons:

1. **Already configured:** `SELF_HOSTED_WEBHOOK_URL` sends all events to webhook bridge
2. **Secure:** HMAC signature verification prevents spoofing
3. **Decoupled:** No direct dependency on Firecrawl database schema
4. **Real-time:** Notifications arrive immediately after job completion
5. **Battle-tested:** Production-grade delivery with retry logic and logging

**Implementation priority:**
1. Add event persistence to webhook receiver (webhook.py)
2. Store full payloads in PostgreSQL (event log + parsed documents)
3. Index content in Qdrant for search
4. Monitor webhook delivery logs for failures

**Backup strategy:** If webhooks prove unreliable, fall back to polling `nuq.queue_scrape` for completed jobs every 30s and backfilling missing documents.
