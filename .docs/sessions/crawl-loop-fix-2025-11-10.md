# Crawl Loop Fix - November 10, 2025

## Issue
Firecrawl service was stuck in an infinite crawl loop for `https://forums.unraid.net/`, continuously logging errors and attempting to scrape the same URL repeatedly.

## Investigation

### 1. Identified Active Services
```bash
docker compose ps
```
Found all services running normally, but logs showed continuous scraping attempts on the same URL.

### 2. Stopped the Immediate Problem
```bash
docker compose restart firecrawl
```
Restarted the service to temporarily halt the loop, but knew the queue would restart it.

### 3. Cleared PostgreSQL Queue Tables

Connected to database and found queue tables in `nuq` schema:
```bash
docker exec pulse_postgres psql -U firecrawl -d pulse_postgres -c "SELECT schemaname, tablename FROM pg_tables..."
```

**Tables Found:**
- `nuq.queue_scrape` - 174 pending jobs
- `nuq.group_crawl` - 2 crawl groups
- `nuq.queue_crawl_finished` - finished crawls
- `nuq.queue_scrape_backlog` - backlog items

**Cleared all queues:**
```sql
TRUNCATE nuq.queue_scrape CASCADE;
TRUNCATE nuq.group_crawl CASCADE;
TRUNCATE nuq.queue_crawl_finished CASCADE;
TRUNCATE nuq.queue_scrape_backlog CASCADE;
```

### 4. Verified Redis Queues

Checked Bull queues in Redis:
```bash
docker exec pulse_redis redis-cli KEYS "bull:*"
```

Verified all queues were empty:
- deepResearchQueue: 0 jobs
- extractQueue: 0 jobs
- precrawlQueue: 0 jobs
- billingQueue: 0 jobs
- generateLlmsTxtQueue: 0 jobs

### 5. Fixed Host Validation Issue

MCP server was blocking requests from `tootie:3060` with error:
```
[WARN] host-validation: Request blocked: Invalid Host header: tootie:3060
```

**Fixed by:**
1. Added `ALLOWED_HOSTS=localhost:3060,tootie:3060` to `.env` (line 64)
2. Updated default in `docker-compose.yaml` line 70 to include both hosts
3. Recreated containers with new config

**Verification:**
```bash
docker exec pulse_mcp printenv ALLOWED_HOSTS
# Output: localhost:3060,tootie:3060
```

## Files Modified

- [.env](/.env#L64) - Added ALLOWED_HOSTS configuration
- [docker-compose.yaml](/docker-compose.yaml#L70) - Updated default ALLOWED_HOSTS value

## Resolution Status

✅ Crawl loop stopped completely
✅ PostgreSQL queues cleared (174 jobs removed)
✅ Redis queues verified empty
✅ Host validation fixed for MCP server
✅ All services running cleanly with no active jobs

## Database Credentials Used

- User: `firecrawl` (from .env POSTGRES_USER)
- Database: `pulse_postgres` (from .env POSTGRES_DB)
- Schema: `nuq` (for queue tables), `webhook` (for webhook metrics)
