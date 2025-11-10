# changedetection.io Integration Guide

This guide explains how to use changedetection.io with Firecrawl for automated website monitoring and re-indexing.

## Table of Contents

- [Architecture](#architecture)
- [Setup](#setup)
- [Usage](#usage)
- [Troubleshooting](#troubleshooting)
- [Advanced Configuration](#advanced-configuration)
- [Architecture Decisions](#architecture-decisions)
- [Related Documentation](#related-documentation)

## Architecture

```
changedetection.io (detects changes)
      ↓
   webhook notification
      ↓
Webhook Bridge (validates, stores event)
      ↓
   Redis queue (job queued)
      ↓
Background Worker (rescraped via Firecrawl)
      ↓
Search Index (Qdrant + BM25)
```

### Component Overview

- **changedetection.io**: Monitors websites at configured intervals, detecting content changes
- **Webhook Bridge**: FastAPI service that receives and validates change notifications via HMAC signatures
- **Redis Queue**: Message broker for background job processing using RQ (Redis Queue)
- **Background Worker**: Embedded worker thread that executes rescrape jobs
- **Firecrawl API**: Scrapes updated content with Playwright support for JavaScript-heavy sites
- **Search Index**: Hybrid vector (Qdrant) + keyword (BM25) search for semantic and exact matching

### Data Flow

1. changedetection.io checks URL on schedule (e.g., hourly)
2. When change detected, sends webhook POST to bridge
3. Bridge validates HMAC signature, stores event in PostgreSQL
4. Job enqueued in Redis with 10-minute timeout
5. Worker fetches URL via Firecrawl API
6. Markdown content indexed in Qdrant (vectors) + BM25 (keywords)
7. Content searchable within 5-10 seconds of detection

## Setup

### Prerequisites

- Docker Compose environment running
- PostgreSQL with `webhook` schema
- Redis for job queues
- Firecrawl API accessible at `http://firecrawl:3002`
- Webhook bridge deployed at `http://firecrawl_webhook:52100`

### 1. Configure Webhook Secret

Generate a secure random secret for HMAC signature verification:

```bash
openssl rand -hex 32
```

Add to your `.env`:

```bash
CHANGEDETECTION_WEBHOOK_SECRET=<your-64-char-hex-string>
WEBHOOK_CHANGEDETECTION_HMAC_SECRET=<same-as-above>
```

**Important:** Both values must be identical for signature verification to work.

Restart services to load new configuration:

```bash
docker compose restart firecrawl_webhook firecrawl_changedetection
```

### 2. Verify Service Health

Check that changedetection.io is running:

```bash
# Check container status
docker compose ps firecrawl_changedetection

# View logs
docker compose logs firecrawl_changedetection | tail -20

# Test web UI
curl -I http://localhost:50109/
```

Expected: `200 OK` response with HTML content.

### 3. Create a Watch in changedetection.io

1. Open http://localhost:50109 in your browser
2. Click "Watch a new URL" or "Add new change detection watch"
3. Enter URL to monitor (e.g., `https://example.com/blog`)
4. Configure check interval:
   - High priority (breaking news): 5-15 minutes
   - Normal (blogs, docs): 1-6 hours
   - Low priority (stable content): Daily
5. (Optional) Add CSS selector to target specific content (see [Advanced Configuration](#advanced-configuration))
6. Save watch

### 4. Configure Webhook Notification

To enable automatic rescraping when changes are detected:

1. Edit your watch in changedetection.io
2. Go to "Notifications" tab
3. Click "Add new notification URL"
4. Enter notification URL:
   ```
   json://firecrawl_webhook:52100/api/webhook/changedetection
   ```
   **Note:** Use internal Docker network URL (`firecrawl_webhook`), NOT `localhost`

5. Configure notification body (Jinja2 template):

```json
{
  "watch_id": "{{ watch_uuid }}",
  "watch_url": "{{ watch_url }}",
  "watch_title": "{{ watch_title }}",
  "detected_at": "{{ current_timestamp }}",
  "diff_url": "{{ diff_url }}",
  "snapshot": "{{ current_snapshot|truncate(500) }}"
}
```

6. Save notification configuration

## Usage

### Monitoring Changes

Once configured, the system operates automatically:

1. changedetection.io checks the URL at configured intervals
2. When content changes, webhook fires to bridge
3. Bridge validates signature and stores event in `webhook.change_events` table
4. Background job rescraped URL via Firecrawl API
5. New content indexed in search (Qdrant + BM25)
6. Updated content searchable within 5-10 seconds

### Viewing Change History

Query change events via PostgreSQL:

```sql
SELECT
    watch_id,
    watch_url,
    detected_at,
    rescrape_status,
    indexed_at
FROM webhook.change_events
ORDER BY detected_at DESC
LIMIT 10;
```

Or connect to database:

```bash
docker compose exec firecrawl_db psql -U firecrawl -d firecrawl_db
```

### Searching Indexed Content

Use the webhook bridge search API with hybrid mode (combines vector + keyword):

```bash
curl -X POST http://localhost:50108/api/search \
  -H "Authorization: Bearer YOUR_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "your search query",
    "mode": "hybrid",
    "limit": 10
  }'
```

Search modes:
- `hybrid`: Combines vector similarity + keyword matching (recommended)
- `vector`: Semantic search only (Qdrant)
- `bm25`: Keyword search only (BM25)

### Monitoring Job Status

Check rescrape job status in webhook bridge logs:

```bash
docker compose logs firecrawl_webhook | grep rescrape
```

Query job status from database:

```sql
SELECT
    watch_url,
    rescrape_status,
    rescrape_job_id,
    metadata->>'error' as error
FROM webhook.change_events
WHERE rescrape_status != 'completed'
ORDER BY detected_at DESC;
```

## Troubleshooting

### Webhook Not Firing

**Symptom:** changedetection.io detects changes but webhook bridge receives no notifications.

**Check changedetection.io logs:**

```bash
docker compose logs firecrawl_changedetection | grep webhook
```

Look for HTTP errors like `Connection refused` or `404 Not Found`.

**Verify notification URL is correct:**
- Must use internal Docker network: `firecrawl_webhook:52100`
- NOT external: `localhost:50108`
- Protocol must be `json://` (not `http://`)

**Test webhook endpoint manually:**

```bash
docker compose exec firecrawl_changedetection curl http://firecrawl_webhook:52100/api/webhook/changedetection
```

Expected: `401 Unauthorized` (signature required)

### Signature Verification Failures

**Symptom:** Webhook bridge logs show "Invalid signature" errors.

**Ensure secrets match:**

```bash
# Check changedetection secret
docker compose exec firecrawl_changedetection env | grep SECRET

# Check webhook bridge secret
docker compose exec firecrawl_webhook env | grep WEBHOOK_SECRET
```

Both should output the same 64-character hex string.

**Regenerate if needed:**

```bash
NEW_SECRET=$(openssl rand -hex 32)
echo "CHANGEDETECTION_WEBHOOK_SECRET=$NEW_SECRET" >> .env
echo "WEBHOOK_CHANGEDETECTION_HMAC_SECRET=$NEW_SECRET" >> .env
docker compose restart firecrawl_webhook firecrawl_changedetection
```

**Check signature format:**

Signature must be in format `sha256=<hex-digest>`. Verify notification body is sent as JSON with correct `Content-Type: application/json` header.

### Jobs Not Processing

**Symptom:** Webhooks received but rescrape jobs remain in `queued` status.

**Check background worker is running:**

```bash
docker compose logs firecrawl_webhook | grep "Starting worker"
```

Expected: Log entry showing RQ worker started.

**Verify Redis queue:**

```bash
docker compose exec firecrawl_cache redis-cli
> KEYS indexing*
> LLEN indexing
```

If queue length is high, worker may be stuck or crashed.

**Check job status:**

```bash
docker compose exec firecrawl_db psql -U firecrawl -d firecrawl_db -c \
  "SELECT watch_url, rescrape_status, rescrape_job_id FROM webhook.change_events ORDER BY detected_at DESC LIMIT 5;"
```

**Restart worker:**

```bash
docker compose restart firecrawl_webhook
```

### Firecrawl API Errors

**Symptom:** Rescrape jobs fail with Firecrawl API errors.

**Check Firecrawl is accessible:**

```bash
docker compose exec firecrawl_webhook curl http://firecrawl:3002/health
```

Expected: `200 OK` with health status JSON.

**View rescrape job errors:**

```sql
SELECT
    watch_url,
    rescrape_status,
    metadata->>'error' as error,
    metadata->>'failed_at' as failed_at
FROM webhook.change_events
WHERE rescrape_status LIKE 'failed%'
ORDER BY detected_at DESC;
```

**Common errors:**
- **Timeout:** Increase job timeout in `app/api/routes.py` (default: 10m)
- **Rate limiting:** Firecrawl may be rate-limited by target site
- **JavaScript errors:** Try enabling Playwright in changedetection.io

### Indexing Failures

**Symptom:** Rescrape succeeds but content not searchable.

**Check Qdrant is accessible:**

```bash
curl http://localhost:6333/health
```

**Check TEI (Text Embeddings Inference) is accessible:**

```bash
curl http://localhost:8080/health
```

**View indexing errors in logs:**

```bash
docker compose logs firecrawl_webhook | grep "index_document"
```

## Advanced Configuration

### Using Playwright for JavaScript Sites

Many modern websites rely heavily on JavaScript for content rendering. To scrape these sites:

1. Edit watch in changedetection.io
2. Go to "Fetcher" tab
3. Select "Playwright/Javascript" from dropdown
4. Configure:
   - **Wait time:** How long to wait for JavaScript to render (default: 10s)
   - **Viewport size:** Browser viewport dimensions (default: 1920x1080)
   - **Wait for element:** CSS selector to wait for specific element
5. Save configuration

changedetection.io will use the shared Playwright browser (`firecrawl_playwright:3000`) for rendering.

**Performance note:** Playwright is slower than basic HTTP fetching. Use only for JavaScript-heavy sites.

### Filtering Content Changes

Reduce false positives by filtering out dynamic content:

1. Edit watch in changedetection.io
2. Go to "Filters" tab
3. **Target specific content:**
   - Add CSS selector: `.article-content` (only monitor article body)
   - Use XPath: `//article[@class='main']` (alternative to CSS)
4. **Remove elements:**
   - `.advertisement` (ignore ads)
   - `.timestamp` (ignore timestamps)
   - `#comments` (ignore comment sections)
5. Save configuration

This reduces false positives from ads, timestamps, user-generated content, etc.

### Custom Check Intervals

Balance between freshness and server load:

- **High priority (breaking news, alerts):** 5-15 minutes
- **Normal (blogs, documentation):** 1-6 hours
- **Low priority (stable content):** Daily or weekly

**Respect websites:**
- Check `robots.txt` for crawl delays
- Avoid over-polling (causes IP bans)
- Use reasonable intervals for your use case

### Content Extraction with CSS Selectors

Extract specific content areas for more accurate change detection:

**Example 1: Blog posts**
```css
article.post-content
```

**Example 2: Product prices**
```css
.price-container .current-price
```

**Example 3: News headlines**
```css
h1.headline, .article-summary
```

**Test selectors:**
1. Open target page in browser
2. Open DevTools (F12)
3. Use Elements tab to find CSS selectors
4. Test with `document.querySelector('selector')` in console

### Notification Customization

Customize webhook payload with additional context:

```json
{
  "watch_id": "{{ watch_uuid }}",
  "watch_url": "{{ watch_url }}",
  "watch_title": "{{ watch_title }}",
  "detected_at": "{{ current_timestamp }}",
  "diff_url": "{{ diff_url }}",
  "snapshot": "{{ current_snapshot|truncate(500) }}",
  "custom_field": "your_value_here",
  "tags": ["tag1", "tag2"]
}
```

Access custom fields in `webhook.change_events.metadata` column.

## Performance Tuning

### Concurrent Checks

Adjust number of concurrent checks in `.env`:

```bash
# Default: 10 concurrent checks
CHANGEDETECTION_FETCH_WORKERS=20  # Increase for more URLs
```

**Note:** Higher values increase memory/CPU usage. Monitor system resources.

### Rescrape Timeout

Adjust job timeout for large/slow pages:

```python
# In apps/webhook/app/api/routes.py, modify queue.enqueue call:
job = queue.enqueue(
    "app.worker.rescrape_changed_url",
    change_event.id,
    job_timeout="20m",  # Increase from default 10m
)
```

### Minimum Recheck Time

Prevent excessive checks for frequently changing content:

```bash
# Default: 60 seconds minimum between checks
CHANGEDETECTION_MINIMUM_SECONDS_RECHECK_TIME=300  # 5 minutes
```

### BM25 Index Optimization

BM25 keyword index is persisted to disk for fast restarts. Configure path in `.env`:

```bash
# Default: ./data/bm25
WEBHOOK_BM25_INDEX_PATH=/app/data/bm25
```

Mounted as Docker volume in `docker-compose.yaml` for persistence.

## Architecture Decisions

### Why Embedded Worker Thread?

The webhook bridge runs a background worker **in the same process** (not separate container) because:

1. **Shared in-memory BM25 index:** No file synchronization needed between processes
2. **Shared service instances:** Qdrant and TEI clients reused, reducing connections
3. **Simpler deployment:** One container instead of two, easier to manage
4. **Can be disabled:** Set `WEBHOOK_ENABLE_WORKER=false` for testing

**Trade-off:** Worker crash brings down entire service. Acceptable for self-hosted deployment with restart policies.

### Why Shared Playwright?

changedetection.io uses the same Playwright browser as Firecrawl:

1. **Reduces memory usage:** Single browser instance (400-800MB saved)
2. **Shared browser cache:** Improves performance for repeated page loads
3. **Consistent rendering:** Same browser version ensures consistent results
4. **Cost efficiency:** Fewer resources needed for self-hosted deployments

**Configuration:**
```bash
CHANGEDETECTION_PLAYWRIGHT_DRIVER_URL=ws://firecrawl_playwright:3000
```

### Why HMAC Signatures?

Webhook signatures prevent security vulnerabilities:

1. **Spoofed webhooks:** Unauthorized sources cannot trigger rescrapes
2. **Man-in-the-middle tampering:** Signature invalidated if payload modified
3. **Replay attacks:** Combined with timestamp validation (future enhancement)

**Implementation:** SHA256 HMAC with constant-time comparison to prevent timing attacks.

### Why PostgreSQL for Change Events?

Change events stored in `webhook.change_events` table (not Redis) because:

1. **Historical tracking:** Query past changes, analyze patterns
2. **Metrics and reporting:** Aggregation queries for dashboards
3. **Data integrity:** ACID transactions ensure consistency
4. **Audit trail:** Track rescrape status, errors, job IDs

**Schema:** `webhook` schema keeps change events separate from Firecrawl API data.

### Why Hybrid Search?

Combines vector (Qdrant) + keyword (BM25) search:

1. **Semantic search:** Finds conceptually similar content (Qdrant)
2. **Exact matching:** Finds specific terms/phrases (BM25)
3. **Better results:** Hybrid approach outperforms either alone
4. **Flexibility:** Users can choose search mode based on query type

**Default mode:** `hybrid` with reciprocal rank fusion (RRF) for result merging.

## Related Documentation

- **Implementation Plan:** [docs/plans/2025-11-10-changedetection-io-integration.md](/compose/pulse/docs/plans/2025-11-10-changedetection-io-integration.md)
- **Feasibility Report:** [.docs/reports/changedetection/changedetection-io-feasibility-report.md](/.docs/reports/changedetection/changedetection-io-feasibility-report.md)
- **Integration Research:** [.docs/reports/changedetection/changedetection-io-integration-research.md](/.docs/reports/changedetection/changedetection-io-integration-research.md)
- **Webhook Architecture:** [.docs/reports/changedetection/WEBHOOK_ARCHITECTURE_EXPLORATION.md](/.docs/reports/changedetection/WEBHOOK_ARCHITECTURE_EXPLORATION.md)
- **Docker Compose Setup:** [.docs/reports/changedetection/DOCKER_COMPOSE_EXPLORATION_REPORT.md](/.docs/reports/changedetection/DOCKER_COMPOSE_EXPLORATION_REPORT.md)
- **Services and Ports:** [.docs/services-ports.md](/.docs/services-ports.md)
- **Deployment Log:** [docs/deployment-log.md](/compose/pulse/docs/deployment-log.md)

## Support

For issues or questions:

1. Check [Troubleshooting](#troubleshooting) section above
2. Review webhook bridge logs: `docker compose logs firecrawl_webhook`
3. Review changedetection logs: `docker compose logs firecrawl_changedetection`
4. Check database for error details: `SELECT * FROM webhook.change_events WHERE rescrape_status LIKE 'failed%'`

## Version History

- **2025-11-10:** Initial integration guide created
