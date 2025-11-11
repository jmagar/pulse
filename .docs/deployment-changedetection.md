# changedetection.io Deployment Checklist

**Date:** 2025-11-10
**Service:** changedetection.io + Webhook Integration
**Port:** 50109

## Pre-Deployment Verification

- [ ] Review feasibility reports in `.docs/reports/changedetection/`
- [ ] Verify port 50109 is available: `lsof -i :50109`
- [ ] Backup existing .env file: `cp .env .env.backup.$(date +%Y%m%d-%H%M%S)`
- [ ] Backup PostgreSQL database:
  ```bash
  docker compose exec pulse_postgres pg_dump -U firecrawl pulse_postgres > backup_$(date +%Y%m%d-%H%M%S).sql
  ```
- [ ] Verify all prerequisite services are running:
  ```bash
  docker compose ps pulse_postgres pulse_redis pulse_playwright pulse_webhook
  ```

## Configuration Steps

### 1. Generate Webhook Secret

- [ ] Generate webhook secret: `openssl rand -hex 32`
- [ ] Add to `.env`:
  ```bash
  # changedetection.io Service
  CHANGEDETECTION_PORT=50109
  CHANGEDETECTION_BASE_URL=http://localhost:50109
  CHANGEDETECTION_PLAYWRIGHT_DRIVER_URL=ws://pulse_playwright:3000
  CHANGEDETECTION_FETCH_WORKERS=10
  CHANGEDETECTION_MINIMUM_SECONDS_RECHECK_TIME=60
  CHANGEDETECTION_WEBHOOK_SECRET=<your-64-char-hex-string>

  # Webhook Bridge - changedetection integration
  WEBHOOK_CHANGEDETECTION_HMAC_SECRET=<same-as-above>
  WEBHOOK_FIRECRAWL_API_URL=http://firecrawl:3002
  WEBHOOK_FIRECRAWL_API_KEY=self-hosted-no-auth
  ```
- [ ] Verify `.env` has no trailing whitespace or quotes around secrets
- [ ] Ensure both secrets match exactly (CHANGEDETECTION_WEBHOOK_SECRET = WEBHOOK_CHANGEDETECTION_HMAC_SECRET)

### 2. Validate Configuration

- [ ] Check `.env.example` is updated with all variables
- [ ] Verify `.docs/services-ports.md` documents port 50109
- [ ] Review `docker-compose.yaml` for changedetection service definition

## Database Migration Procedures

### 1. Run Migrations

- [ ] Navigate to webhook app: `cd apps/webhook`
- [ ] Check current migration status: `uv run alembic current`
- [ ] Run migrations to add change_events table:
  ```bash
  uv run alembic upgrade head
  ```
- [ ] Verify migration applied successfully (should show revision `20251110_000000`)

### 2. Verify Schema

- [ ] Check change_events table exists:
  ```bash
  docker compose exec pulse_postgres psql -U firecrawl -d pulse_postgres -c "\dt webhook.*"
  ```
- [ ] Verify table structure:
  ```bash
  docker compose exec pulse_postgres psql -U firecrawl -d pulse_postgres -c "\d webhook.change_events"
  ```
- [ ] Check indexes were created:
  ```bash
  docker compose exec pulse_postgres psql -U firecrawl -d pulse_postgres -c "\di webhook.*"
  ```
  Expected indexes:
  - `idx_change_events_watch_id`
  - `idx_change_events_detected_at`

## Service Deployment Steps

### 1. Deploy changedetection Service

- [ ] Pull latest changedetection.io image:
  ```bash
  docker compose pull pulse_change-detection
  ```
- [ ] Start changedetection service:
  ```bash
  docker compose up -d pulse_change-detection
  ```
- [ ] Wait 30 seconds for startup period

### 2. Restart Webhook Bridge

- [ ] Restart webhook bridge to load new environment variables:
  ```bash
  docker compose restart pulse_webhook
  ```
- [ ] Wait 15 seconds for service initialization

### 3. Verify Container Status

- [ ] Check all containers are running:
  ```bash
  docker compose ps pulse_change-detection pulse_webhook pulse_playwright
  ```
- [ ] Verify no restart loops (Up status, not Restarting)

## Health Checks

### 1. changedetection Service

- [ ] Check container status:
  ```bash
  docker compose ps pulse_change-detection
  ```
  Expected: `Up` with healthy status

- [ ] Verify changedetection logs show no errors:
  ```bash
  docker compose logs pulse_change-detection | tail -30
  ```
  Expected: "Starting server" messages, no errors

- [ ] Test changedetection web UI:
  ```bash
  curl -I http://localhost:50109/
  ```
  Expected: `HTTP/1.1 200 OK`

- [ ] Test web UI in browser: http://localhost:50109
  Expected: changedetection.io interface loads

### 2. Webhook Bridge Service

- [ ] Check webhook bridge logs:
  ```bash
  docker compose logs pulse_webhook | tail -30
  ```
  Expected: No errors, "Application startup complete" message

- [ ] Verify webhook endpoint exists (should reject without signature):
  ```bash
  curl -I http://localhost:50108/api/webhook/changedetection
  ```
  Expected: `HTTP/1.1 401 Unauthorized` (signature required)

- [ ] Check background worker started:
  ```bash
  docker compose logs pulse_webhook | grep -i worker
  ```
  Expected: "Starting worker" or "Worker listening" messages

### 3. Shared Playwright Service

- [ ] Verify Playwright is accessible from changedetection:
  ```bash
  docker compose exec pulse_change-detection wget -O- http://pulse_playwright:3000 || echo "Connection test"
  ```
- [ ] Check Playwright logs for connections:
  ```bash
  docker compose logs pulse_playwright | tail -20
  ```

## Integration Testing

### 1. Create Test Watch

- [ ] Open changedetection UI: http://localhost:50109
- [ ] Click "Watch a new URL" or "Add new change detection watch"
- [ ] Add test URL: `https://example.com`
- [ ] Set check interval: 1 minute (for testing)
- [ ] Save watch
- [ ] Note the watch UUID from URL or watch list

### 2. Configure Webhook Notification

- [ ] Edit the test watch
- [ ] Go to "Notifications" tab
- [ ] Add notification URL: `json://pulse_webhook:52100/api/webhook/changedetection`
  ⚠️ **Important:** Use internal Docker network URL, NOT `localhost`
- [ ] Configure notification body template (Jinja2):
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
- [ ] Save notification configuration

### 3. Trigger Test Webhook

- [ ] In changedetection, click "Recheck" on test watch
- [ ] Wait 10 seconds for check to complete
- [ ] Verify webhook sent in changedetection logs:
  ```bash
  docker compose logs pulse_change-detection | grep -i webhook
  ```

### 4. Verify Webhook Received

- [ ] Check webhook bridge logs for incoming webhook:
  ```bash
  docker compose logs pulse_webhook | grep -i changedetection
  ```
  Expected: "Received changedetection webhook" log entry

- [ ] Verify change event stored in database:
  ```bash
  docker compose exec pulse_postgres psql -U firecrawl -d pulse_postgres -c \
    "SELECT watch_id, watch_url, rescrape_status, created_at FROM webhook.change_events ORDER BY created_at DESC LIMIT 1;"
  ```
  Expected: Row with test watch data, status "queued"

### 5. Verify Job Processing

- [ ] Check Redis queue for enqueued job:
  ```bash
  docker compose exec pulse_redis redis-cli LLEN indexing
  ```
  Expected: 1 or more (job queued)

- [ ] Wait 30 seconds for job processing

- [ ] Check job completion in database:
  ```bash
  docker compose exec pulse_postgres psql -U firecrawl -d pulse_postgres -c \
    "SELECT watch_url, rescrape_status, indexed_at FROM webhook.change_events ORDER BY created_at DESC LIMIT 1;"
  ```
  Expected: `rescrape_status = 'completed'`, `indexed_at` has timestamp

- [ ] Check worker logs for job execution:
  ```bash
  docker compose logs pulse_webhook | grep -i "rescrape"
  ```
  Expected: "Starting rescrape job", "Rescrape completed successfully"

### 6. Verify Search Indexing

- [ ] Check that content was indexed (if search API available):
  ```bash
  curl -X POST http://localhost:50108/api/search \
    -H "Content-Type: application/json" \
    -d '{"query": "example", "mode": "hybrid", "limit": 5}'
  ```
  Expected: Search results include the test URL

## Post-Deployment Tasks

### 1. Documentation Updates

- [ ] Update `.docs/services-ports.md` with deployment timestamp:
  ```markdown
  | 50109 | Change Detection | pulse_change-detection | HTTP | Active (Deployed: YYYY-MM-DD HH:MM) |
  ```
- [ ] Add deployment entry to `.docs/deployment-log.md`:
  ```markdown
  ## YYYY-MM-DD HH:MM:SS
  - **Service:** changedetection.io + Webhook Integration
  - **Port:** 50109
  - **Status:** Deployed
  - **Notes:** Initial deployment with webhook bridge integration
  ```
- [ ] Document any non-standard configuration in this file under "Deployment Notes" below

### 2. Test Suite Validation

- [ ] Run unit tests:
  ```bash
  cd apps/webhook
  uv run pytest tests/unit/test_change_events_schema.py -v
  uv run pytest tests/unit/test_rescrape_job.py -v
  uv run pytest tests/unit/test_config_changedetection.py -v
  ```
  Expected: All tests PASS

- [ ] Run integration tests:
  ```bash
  cd apps/webhook
  uv run pytest tests/integration/test_changedetection_webhook.py -v
  ```
  Expected: All tests PASS

- [ ] Run E2E test:
  ```bash
  cd apps/webhook
  uv run pytest tests/integration/test_changedetection_e2e.py -v
  ```
  Expected: All tests PASS

### 3. Code Quality Checks

- [ ] Run type checking:
  ```bash
  cd apps/webhook
  uv run mypy app/
  ```
  Expected: No errors (or only expected warnings)

- [ ] Run linting:
  ```bash
  cd apps/webhook
  uv run ruff check .
  ```
  Expected: No errors

### 4. Commit Configuration Changes

- [ ] Stage configuration changes (NOT .env):
  ```bash
  git add .env.example .docs/services-ports.md .docs/deployment-log.md
  ```
- [ ] Commit with descriptive message:
  ```bash
  git commit -m "deploy: changedetection.io service on port 50109"
  ```

### 5. Cleanup Test Data

- [ ] Remove test watch from changedetection UI
- [ ] Clean up test change events from database:
  ```bash
  docker compose exec pulse_postgres psql -U firecrawl -d pulse_postgres -c \
    "DELETE FROM webhook.change_events WHERE watch_url = 'https://example.com';"
  ```

## Rollback Plan

If deployment fails or issues are encountered:

### 1. Stop changedetection Service

```bash
docker compose stop pulse_change-detection
```

### 2. Rollback Database Migration

```bash
cd apps/webhook
uv run alembic downgrade -1
```

Verify rollback:
```bash
uv run alembic current
```

### 3. Restore Environment Configuration

```bash
# Find backup file
ls -lt .env.backup.*

# Restore (replace TIMESTAMP with actual timestamp)
cp .env.backup.TIMESTAMP .env
```

### 4. Restart Webhook Bridge

```bash
docker compose restart pulse_webhook
```

### 5. Verify Services

```bash
docker compose ps
docker compose logs pulse_webhook | tail -30
```

### 6. Remove changedetection Service (Optional)

If reverting completely:

```bash
# Stop and remove container
docker compose down pulse_change-detection

# Remove volume (⚠️ CAUTION: deletes all watch data)
docker volume rm pulse_change-detection_data
```

### 7. Document Rollback

- [ ] Note rollback reason in this checklist
- [ ] Update `.docs/deployment-log.md` with rollback entry
- [ ] Create issue or task to investigate failure

## Success Criteria

All of the following must be true:

- [ ] changedetection.io accessible at http://localhost:50109
- [ ] changedetection web UI loads without errors
- [ ] Watches can be created and configured in UI
- [ ] Playwright integration works (can fetch JavaScript pages)
- [ ] Webhooks fire on change detection
- [ ] Webhook bridge receives and validates webhooks (HMAC signature)
- [ ] change_events table receives entries with correct data
- [ ] Rescrape jobs execute successfully via background worker
- [ ] Content is indexed in search system (Qdrant + BM25)
- [ ] Content is searchable via /api/search endpoint
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] E2E test passes
- [ ] No errors in changedetection logs
- [ ] No errors in webhook bridge logs
- [ ] No errors in Playwright logs
- [ ] Type checking passes (mypy)
- [ ] Linting passes (ruff)

## Monitoring & Maintenance

### Ongoing Health Checks

Run daily or after configuration changes:

```bash
# Check service status
docker compose ps | grep pulse_change-detection

# Check recent logs
docker compose logs --since 1h pulse_change-detection | grep -i error

# Check database health
docker compose exec pulse_postgres psql -U firecrawl -d pulse_postgres -c \
  "SELECT COUNT(*) as total_events, COUNT(*) FILTER (WHERE rescrape_status = 'completed') as completed FROM webhook.change_events;"

# Check Redis queue depth
docker compose exec pulse_redis redis-cli LLEN indexing
```

### Performance Monitoring

Track these metrics:

- **Average rescrape latency:** Time from detection to indexed
- **Job success rate:** completed / total events
- **Queue depth:** Number of pending jobs
- **Storage growth:** changedetection_data volume size

Query metrics:
```sql
-- Average rescrape latency (last 24 hours)
SELECT
  AVG(EXTRACT(EPOCH FROM (indexed_at - detected_at))) as avg_latency_seconds,
  COUNT(*) FILTER (WHERE rescrape_status = 'completed') as completed,
  COUNT(*) FILTER (WHERE rescrape_status LIKE 'failed%') as failed
FROM webhook.change_events
WHERE detected_at > NOW() - INTERVAL '24 hours';
```

### Troubleshooting Common Issues

#### Webhooks Not Firing

1. Check changedetection logs: `docker compose logs pulse_change-detection | grep webhook`
2. Verify notification URL uses internal network: `pulse_webhook:52100` (NOT `localhost`)
3. Test webhook manually from changedetection container:
   ```bash
   docker compose exec pulse_change-detection curl http://pulse_webhook:52100/health
   ```

#### Signature Verification Failures

1. Verify secrets match:
   ```bash
   docker compose exec pulse_change-detection env | grep SECRET
   docker compose exec pulse_webhook env | grep WEBHOOK_SECRET
   ```
2. Check for whitespace or quote issues in `.env`
3. Regenerate secrets if needed (see Configuration Steps)

#### Jobs Not Processing

1. Check background worker status: `docker compose logs pulse_webhook | grep worker`
2. Verify Redis connectivity: `docker compose exec pulse_webhook redis-cli -h pulse_redis ping`
3. Check for stuck jobs: `docker compose exec pulse_redis redis-cli LLEN indexing`
4. Restart worker: `docker compose restart pulse_webhook`

#### High Memory Usage

1. Check Playwright memory: `docker stats pulse_playwright`
2. Limit concurrent fetch workers in `.env`: `CHANGEDETECTION_FETCH_WORKERS=5`
3. Restart Playwright if memory leak suspected: `docker compose restart pulse_playwright`

## Deployment Notes

_Add deployment-specific notes, configuration changes, or observations here:_

---

**Deployment Status:** ⬜ Not Started | ⬜ In Progress | ⬜ Complete | ⬜ Rolled Back

**Deployed By:** ________________

**Deployment Date/Time:** ________________

**Issues Encountered:**

_None / Document any issues here_

**Configuration Changes:**

_Document any deviations from standard configuration_

**Follow-Up Tasks:**

- [ ] Monitor resource usage for 24 hours
- [ ] Configure production watches
- [ ] Set up alerting for failed jobs (future enhancement)
- [ ] Implement snapshot retention cleanup (future enhancement)
