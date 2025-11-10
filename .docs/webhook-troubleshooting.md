# Webhook Troubleshooting Guide

## Overview

This guide helps diagnose and resolve issues with webhook delivery from Firecrawl to the Webhook Bridge service.

## Architecture

```
Firecrawl API → Docker Network → Webhook Bridge API → Redis Queue → Worker → Qdrant/BM25
```

### Services Involved

- **Firecrawl** (`firecrawl`): Web scraper that sends webhooks
- **Webhook Bridge** (`firecrawl_webhook`): FastAPI service that receives webhooks
- **Webhook Worker** (`firecrawl_webhook_worker`): Background processor for indexing
- **Redis** (`firecrawl_cache`): Job queue
- **Qdrant**: Vector database for semantic search
- **TEI**: Text embeddings inference service

## Common Issues

### Issue 1: Webhooks Not Being Sent

**Symptoms:**
- No webhook logs in Firecrawl output
- Crawl completes but no data indexed

**Diagnosis:**
```bash
# Check if webhook feature is enabled
docker exec firecrawl printenv | grep ENABLE_SEARCH_INDEX
# Expected: ENABLE_SEARCH_INDEX=true

# Check webhook URL configuration
docker exec firecrawl printenv | grep SELF_HOSTED_WEBHOOK_URL
# Expected: SELF_HOSTED_WEBHOOK_URL=http://firecrawl_webhook:52100/api/webhook/firecrawl

# Check sampling rate
docker exec firecrawl printenv | grep SEARCH_INDEX_SAMPLE_RATE
# Expected: SEARCH_INDEX_SAMPLE_RATE=1.0 (sends 100% of pages)
```

**Solution:**
Ensure these environment variables are set in [.env](.env):
```bash
ENABLE_SEARCH_INDEX=true
SELF_HOSTED_WEBHOOK_URL=http://firecrawl_webhook:52100/api/webhook/firecrawl
SELF_HOSTED_WEBHOOK_HMAC_SECRET=<your-secret>
SEARCH_INDEX_SAMPLE_RATE=1.0
```

### Issue 2: Webhook URL Returning 502 Bad Gateway

**Symptoms:**
```
Failed to send webhook: Unexpected response status: 502
```

**Root Cause:**
External webhook URL (`https://...`) is not accessible or misconfigured.

**Solution:**
Use internal Docker network URL instead of external URL:
```bash
# ❌ WRONG (external URL)
SELF_HOSTED_WEBHOOK_URL=https://fc-bridge.tootie.tv/api/webhook/firecrawl

# ✅ CORRECT (internal Docker network)
SELF_HOSTED_WEBHOOK_URL=http://firecrawl_webhook:52100/api/webhook/firecrawl
```

Then recreate the container:
```bash
docker compose up -d --force-recreate firecrawl
```

### Issue 3: Connection Violated Security Rules

**Symptoms:**
```
Failed to send webhook: Connection violated security rules
```

**Root Cause:**
Firecrawl's SSRF (Server-Side Request Forgery) protection blocks webhooks to private IP addresses by default. Internal Docker networks use private IP ranges (172.x.x.x), which trigger this security check in `safeFetch.js`.

**Solution:**
Add `ALLOW_LOCAL_WEBHOOKS=true` to bypass SSRF protection for internal webhooks:

```bash
# In .env file
ALLOW_LOCAL_WEBHOOKS=true
```

Then recreate the container:
```bash
docker compose up -d --force-recreate firecrawl
```

**Security Note:** This is safe for trusted internal Docker networks. The setting only affects webhook delivery, not crawling external websites.

### Issue 4: Webhook Signature Verification Failures

**Symptoms:**
```
401 Unauthorized: Invalid webhook signature
```

**Root Cause:**
HMAC secrets don't match between Firecrawl and Webhook Bridge.

**Diagnosis:**
```bash
# Check Firecrawl secret
docker exec firecrawl printenv SELF_HOSTED_WEBHOOK_HMAC_SECRET

# Check Webhook Bridge secret
docker exec firecrawl_webhook printenv WEBHOOK_SECRET

# These MUST match exactly
```

**Solution:**
Ensure both services use the same secret (minimum 16 characters, no whitespace):
```bash
# In .env file
SELF_HOSTED_WEBHOOK_HMAC_SECRET=your-shared-secret-here
WEBHOOK_SECRET=your-shared-secret-here
```

### Issue 5: Worker Not Processing Jobs

**Symptoms:**
- Webhooks arrive successfully (200/202 responses)
- Jobs queued in Redis
- But documents never indexed

**Diagnosis:**
```bash
# Check worker is running
docker ps | grep webhook_worker

# Check worker logs
docker logs firecrawl_webhook_worker --tail 50

# Check Redis queue length
docker exec firecrawl_cache redis-cli LLEN rq:queue:default
```

**Common Causes:**
1. Worker not running → restart with `docker compose restart firecrawl_webhook_worker`
2. Qdrant connection issues → check `docker logs firecrawl_webhook | grep qdrant`
3. TEI service down → check `docker logs firecrawl_webhook | grep tei`

## Monitoring Webhooks

### Real-Time Log Monitoring

**Watch Firecrawl webhook delivery:**
```bash
docker logs -f firecrawl 2>&1 | grep -i webhook
```

**Watch Webhook Bridge incoming requests:**
```bash
docker logs -f firecrawl_webhook | grep -E "(Webhook received|Webhook processed)"
```

**Watch Worker processing:**
```bash
docker logs -f firecrawl_webhook_worker
```

### Log Patterns to Look For

**✅ Successful Webhook Delivery (Firecrawl side):**
```
[webhook-sender:]: Webhook sent successfully
```

**✅ Successful Webhook Receipt (Bridge side):**
```json
{
  "event": "Webhook received",
  "event_type": "crawl.page",
  "event_id": "evt_...",
  "data_count": 1
}
```

**✅ Successful Validation:**
```json
{
  "event": "Webhook validation successful",
  "event_type": "crawl.page",
  "data_items": 1
}
```

**✅ Successful Processing:**
```json
{
  "event": "Webhook processed successfully",
  "event_type": "crawl.page",
  "jobs_queued": 1,
  "duration_ms": 45.32
}
```

**❌ Failed Webhook Delivery (Firecrawl side):**
```json
{
  "module": "webhook-sender",
  "error": "Unexpected response status: 502",
  "webhookUrl": "https://..."
}
```

**❌ Failed Validation (Bridge side):**
```json
{
  "event": "Webhook payload validation failed",
  "error_count": 3,
  "validation_errors": [...]
}
```

### Health Checks

**Check all services are healthy:**
```bash
docker ps --format "table {{.Names}}\t{{.Status}}"
```

**Test webhook endpoint directly:**
```bash
curl http://localhost:52100/health | jq
```

Expected output:
```json
{
  "status": "healthy",
  "services": {
    "redis": "healthy",
    "qdrant": "healthy",
    "tei": "healthy"
  }
}
```

## Configuration Summary

### Required Environment Variables

**Firecrawl (.env):**
```bash
ENABLE_SEARCH_INDEX=true
SELF_HOSTED_WEBHOOK_URL=http://firecrawl_webhook:52100/api/webhook/firecrawl
SELF_HOSTED_WEBHOOK_HMAC_SECRET=<secret-min-16-chars>
ALLOW_LOCAL_WEBHOOKS=true
SEARCH_INDEX_SAMPLE_RATE=1.0
LOGGING_LEVEL=INFO
```

**Webhook Bridge (.env):**
```bash
WEBHOOK_PORT=52100
WEBHOOK_SECRET=<same-secret-as-firecrawl>
WEBHOOK_API_SECRET=<api-key-for-search-endpoints>
WEBHOOK_LOG_LEVEL=INFO
WEBHOOK_REDIS_URL=redis://firecrawl_cache:6379
WEBHOOK_DATABASE_URL=postgresql+asyncpg://firecrawl:password@firecrawl_db:5432/firecrawl_db
WEBHOOK_QDRANT_URL=http://qdrant:6333
WEBHOOK_TEI_URL=http://tei:80
```

## Testing End-to-End

1. **Start a crawl:**
```bash
curl -X POST http://localhost:4300/v1/crawl \
  -H "Authorization: Bearer <api-key>" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com","limit":2}'
```

2. **Monitor logs in parallel:**
```bash
# Terminal 1: Firecrawl webhooks
docker logs -f firecrawl 2>&1 | grep -i webhook

# Terminal 2: Webhook Bridge
docker logs -f firecrawl_webhook

# Terminal 3: Worker
docker logs -f firecrawl_webhook_worker
```

3. **Verify indexing:**
```bash
curl http://localhost:52100/api/stats | jq
```

Expected to see:
```json
{
  "total_documents": 2,
  "total_chunks": <some-number>,
  "qdrant_points": <some-number>,
  "bm25_documents": 2
}
```

## Debugging Checklist

When webhooks aren't working, check in this order:

- [ ] `ENABLE_SEARCH_INDEX=true` in Firecrawl
- [ ] Webhook URL uses internal Docker address (`http://firecrawl_webhook:52100/...`)
- [ ] `ALLOW_LOCAL_WEBHOOKS=true` to bypass SSRF protection
- [ ] HMAC secrets match between Firecrawl and Bridge
- [ ] Webhook Bridge service is running and healthy
- [ ] Worker service is running
- [ ] Redis is accessible from both services
- [ ] Qdrant and TEI services are healthy
- [ ] Network connectivity (all services on same Docker network)

## Logging Levels

### Firecrawl Logging

Set `LOGGING_LEVEL` for Firecrawl verbosity:
- `ERROR`: Only errors
- `WARN`: Warnings and errors
- `INFO`: General information (default)
- `DEBUG`: Verbose debugging information

### Webhook Bridge Logging

Set `WEBHOOK_LOG_LEVEL` for bridge verbosity:
- `ERROR`: Only errors
- `WARNING`: Warnings and errors
- `INFO`: General information (default)
- `DEBUG`: Verbose debugging including all payloads

**Note:** The webhook bridge middleware already logs ALL incoming webhook requests at WARNING level for debugging, regardless of log level setting.

## Related Files

- [docker-compose.yaml](../docker-compose.yaml) - Service definitions
- [.env](../.env) - Environment variables (gitignored)
- [.env.example](../.env.example) - Example configuration
- [services-ports.md](./services-ports.md) - Port allocation reference

## Getting Help

If issues persist:

1. Enable DEBUG logging:
   ```bash
   # In .env
   LOGGING_LEVEL=DEBUG
   WEBHOOK_LOG_LEVEL=DEBUG
   ```

2. Collect full logs:
   ```bash
   docker logs firecrawl > firecrawl.log 2>&1
   docker logs firecrawl_webhook > webhook.log 2>&1
   docker logs firecrawl_webhook_worker > worker.log 2>&1
   ```

3. Check container networking:
   ```bash
   docker network inspect firecrawl_firecrawl
   ```

4. Verify environment variables are loaded:
   ```bash
   docker exec firecrawl printenv | grep -E "(WEBHOOK|SEARCH_INDEX|ALLOW_LOCAL)"
   docker exec firecrawl_webhook printenv | grep WEBHOOK
   ```
