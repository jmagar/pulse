# Environment Variable Debugging - Stack Validation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:systematic-debugging to implement this plan task-by-task.

**Goal:** Bring up the full Pulse stack after environment variable consolidation and systematically debug any connection issues caused by the `.env` changes.

**Architecture:** Systematic debugging approach - start services, capture errors, identify root causes, fix issues, verify resolution.

**Tech Stack:** Docker Compose, Redis, PostgreSQL, MCP Server (Node.js), Webhook Bridge (Python), Firecrawl API

---

## Phase 1: Pre-Flight Checks

### Task 1: Verify Docker Compose Configuration

**Files:**
- Read: `.env`
- Read: `docker-compose.yaml`

**Step 1: Validate Docker Compose syntax**

```bash
docker compose config --quiet
```

Expected: No errors (exit code 0)

**Step 2: Check for undefined variables**

```bash
docker compose config 2>&1 | grep -i "variable.*not set"
```

Expected: No output (all variables defined)

**Step 3: Verify critical variable expansions**

```bash
docker compose config | grep -E "(REDIS_URL|DATABASE_URL|WEBHOOK_CHANGEDETECTION_HMAC_SECRET)" | head -10
```

Expected: All variables resolve to actual values (no `${VAR}` syntax remaining)

**Step 4: Document baseline state**

```bash
echo "=== Current Docker Services ===" > /tmp/debug-baseline.txt
docker compose ps >> /tmp/debug-baseline.txt
echo -e "\n=== Current .env Variables ===" >> /tmp/debug-baseline.txt
grep -E "^(REDIS_URL|WEBHOOK_API_SECRET|CHANGEDETECTION_INTERNAL_URL|WEBHOOK_CHANGEDETECTION_HMAC_SECRET)" .env >> /tmp/debug-baseline.txt
```

Expected: Baseline file created at `/tmp/debug-baseline.txt`

---

## Phase 2: Controlled Service Startup

### Task 2: Start Infrastructure Services Only

**Files:**
- Monitor: Docker logs for each service

**Step 1: Stop all services cleanly**

```bash
docker compose down
```

Expected: All containers stopped and removed

**Step 2: Start PostgreSQL only**

```bash
docker compose up -d pulse_postgres
```

Expected: Container starts successfully

**Step 3: Wait and verify PostgreSQL health**

```bash
sleep 5
docker compose ps pulse_postgres
docker compose logs pulse_postgres --tail=20
```

Expected:
- Status: `running (healthy)` or `Up`
- Logs: "database system is ready to accept connections"

**Step 4: Start Redis only**

```bash
docker compose up -d pulse_redis
```

Expected: Container starts successfully

**Step 5: Verify Redis health**

```bash
sleep 3
docker compose ps pulse_redis
docker compose logs pulse_redis --tail=20
docker exec pulse_redis redis-cli ping
```

Expected:
- Status: `Up`
- Logs: "Ready to accept connections"
- redis-cli: `PONG`

**Step 6: Document infrastructure status**

```bash
echo "=== Infrastructure Services Started ===" > /tmp/debug-infra.txt
docker compose ps >> /tmp/debug-infra.txt
```

---

### Task 3: Start Application Services

**Files:**
- Monitor: MCP server logs
- Monitor: Webhook bridge logs
- Monitor: Firecrawl API logs

**Step 1: Start Firecrawl API and Playwright**

```bash
docker compose up -d firecrawl pulse_playwright
```

Expected: Both containers start

**Step 2: Monitor Firecrawl startup (30 seconds)**

```bash
docker compose logs firecrawl --tail=50 --follow &
FIRECRAWL_PID=$!
sleep 30
kill $FIRECRAWL_PID
```

Watch for:
- ❌ Connection refused errors
- ❌ Redis connection failures
- ❌ PostgreSQL connection failures
- ❌ Environment variable undefined warnings
- ✅ "Server listening on port 3002"

**Step 3: Start MCP Server**

```bash
docker compose up -d pulse_mcp
```

Expected: Container starts

**Step 4: Monitor MCP startup (20 seconds)**

```bash
docker compose logs pulse_mcp --tail=50 --follow &
MCP_PID=$!
sleep 20
kill $MCP_PID
```

Watch for:
- ❌ `REDIS_URL` not found
- ❌ `MCP_FIRECRAWL_BASE_URL` connection refused
- ❌ Database connection errors
- ✅ "MCP Server listening on port 50107"
- ✅ "Health checks passed"

**Step 5: Start Webhook Bridge**

```bash
docker compose up -d pulse_webhook
```

Expected: Container starts

**Step 6: Monitor Webhook startup (20 seconds)**

```bash
docker compose logs pulse_webhook --tail=50 --follow &
WEBHOOK_PID=$!
sleep 20
kill $WEBHOOK_PID
```

Watch for:
- ❌ `REDIS_URL` not found (should use REDIS_URL fallback)
- ❌ `WEBHOOK_API_SECRET` not found
- ❌ `CHANGEDETECTION_INTERNAL_URL` not found
- ❌ PostgreSQL connection failures
- ❌ Qdrant connection failures
- ✅ "Application startup complete"
- ✅ "Uvicorn running on 0.0.0.0:52100"

**Step 7: Start remaining services**

```bash
docker compose up -d pulse_change-detection pulse_neo4j pulse_webhook-worker
```

Expected: All containers start

**Step 8: Capture full service status**

```bash
docker compose ps > /tmp/debug-services.txt
```

---

## Phase 3: Error Collection and Analysis

### Task 4: Systematic Error Collection

**Files:**
- Create: `/tmp/debug-errors-mcp.txt`
- Create: `/tmp/debug-errors-webhook.txt`
- Create: `/tmp/debug-errors-firecrawl.txt`

**Step 1: Extract MCP Server errors**

```bash
docker compose logs pulse_mcp --tail=200 | grep -iE "(error|fail|refused|cannot|unable|undefined|not found)" > /tmp/debug-errors-mcp.txt
```

**Step 2: Extract Webhook Bridge errors**

```bash
docker compose logs pulse_webhook --tail=200 | grep -iE "(error|fail|refused|cannot|unable|undefined|not found|traceback)" > /tmp/debug-errors-webhook.txt
```

**Step 3: Extract Firecrawl API errors**

```bash
docker compose logs firecrawl --tail=200 | grep -iE "(error|fail|refused|cannot|unable|undefined|not found)" > /tmp/debug-errors-firecrawl.txt
```

**Step 4: Extract changedetection errors**

```bash
docker compose logs pulse_change-detection --tail=200 | grep -iE "(error|fail|refused|cannot|unable|undefined|not found)" > /tmp/debug-errors-changedetection.txt
```

**Step 5: Categorize errors by type**

```bash
echo "=== Environment Variable Errors ===" > /tmp/debug-analysis.txt
grep -h "undefined\|not set\|not found" /tmp/debug-errors-*.txt >> /tmp/debug-analysis.txt

echo -e "\n=== Connection Errors ===" >> /tmp/debug-analysis.txt
grep -h "refused\|cannot connect\|connection failed" /tmp/debug-errors-*.txt >> /tmp/debug-analysis.txt

echo -e "\n=== Redis Errors ===" >> /tmp/debug-analysis.txt
grep -h -i "redis" /tmp/debug-errors-*.txt >> /tmp/debug-analysis.txt

echo -e "\n=== PostgreSQL Errors ===" >> /tmp/debug-analysis.txt
grep -h -i "postgres\|database" /tmp/debug-errors-*.txt >> /tmp/debug-analysis.txt
```

**Step 6: Display analysis**

```bash
cat /tmp/debug-analysis.txt
```

---

### Task 5: Health Check Verification

**Files:**
- Create: `/tmp/debug-health.txt`

**Step 1: Check MCP health endpoint**

```bash
echo "=== MCP Server Health ===" > /tmp/debug-health.txt
curl -s http://localhost:50107/health | jq . >> /tmp/debug-health.txt 2>&1 || echo "FAILED: MCP health check returned error" >> /tmp/debug-health.txt
```

Expected: `{"status": "healthy"}` or similar

**Step 2: Check Webhook health endpoint**

```bash
echo -e "\n=== Webhook Bridge Health ===" >> /tmp/debug-health.txt
curl -s http://localhost:50108/health | jq . >> /tmp/debug-health.txt 2>&1 || echo "FAILED: Webhook health check returned error" >> /tmp/debug-health.txt
```

Expected: `{"status": "healthy"}`

**Step 3: Check Firecrawl health endpoint**

```bash
echo -e "\n=== Firecrawl API Health ===" >> /tmp/debug-health.txt
curl -s http://localhost:50102/health >> /tmp/debug-health.txt 2>&1 || echo "FAILED: Firecrawl health check returned error" >> /tmp/debug-health.txt
```

Expected: Some successful response

**Step 4: Display health results**

```bash
cat /tmp/debug-health.txt
```

---

## Phase 4: Root Cause Identification

### Task 6: Identify Missing or Incorrect Variables

**Files:**
- Read: `.env`
- Read: `apps/mcp/config/environment.ts`
- Read: `apps/webhook/config.py`

**Step 1: Cross-reference required variables**

For each error in `/tmp/debug-errors-*.txt`:

1. Identify the missing/incorrect variable name
2. Check if variable exists in `.env`:
   ```bash
   grep "^VARIABLE_NAME=" .env
   ```
3. Check if fallback logic exists in code:
   - MCP: Search `apps/mcp/config/environment.ts` for `getEnvVar("VARIABLE_NAME"`
   - Webhook: Search `apps/webhook/config.py` for `validation_alias=AliasChoices(.*"VARIABLE_NAME"`

**Step 2: Check for variable substitution issues**

```bash
# Check if any unexpanded variables in running containers
docker compose exec pulse_mcp env | grep '\${'
docker compose exec pulse_webhook env | grep '\${'
```

Expected: No output (all variables should be expanded by Docker Compose)

**Step 3: Verify specific consolidated variables**

Check each removed duplicate is properly handled:

```bash
# Should NOT exist in .env anymore
grep -E "^(REDIS_RATE_LIMIT_URL|MCP_REDIS_URL|WEBHOOK_REDIS_URL|SEARCH_SERVICE_API_SECRET|WEBHOOK_FIRECRAWL_API_KEY|WEBHOOK_CHANGEDETECTION_API_KEY)=" .env

# Should exist as canonical
grep -E "^(REDIS_URL|WEBHOOK_API_SECRET|FIRECRAWL_API_KEY|CHANGEDETECTION_API_KEY)=" .env
```

Expected:
- First grep: No matches (duplicates removed)
- Second grep: 4 matches (canonical variables present)

**Step 4: Document findings**

Create file `/tmp/debug-root-causes.txt` with:
- List of missing variables
- List of incorrect variable values
- List of fallback logic that should have worked but didn't
- List of variable substitution failures

---

## Phase 5: Fix Application

### Task 7: Fix Identified Issues

**Files:**
- Modify: `.env` (if variables missing)
- Modify: `apps/mcp/config/environment.ts` (if fallback logic missing)
- Modify: `apps/webhook/config.py` (if fallback logic missing)

**For each root cause identified:**

**If variable is missing from .env:**

```bash
# Add the missing variable
echo "MISSING_VAR=correct_value" >> .env
```

**If variable has wrong value:**

```bash
# Fix the value
sed -i 's/^VARIABLE_NAME=wrong_value/VARIABLE_NAME=correct_value/' .env
```

**If fallback logic is missing (MCP):**

Edit `apps/mcp/config/environment.ts`:
```typescript
// Add fallback
variableName: getEnvVar("PRIMARY_NAME", "FALLBACK_NAME", "default_value")
```

**If fallback logic is missing (Webhook):**

Edit `apps/webhook/config.py`:
```python
# Add to AliasChoices
validation_alias=AliasChoices(
    "PRIMARY_NAME",
    "FALLBACK_NAME",
)
```

**Step: Rebuild affected services**

```bash
# If code changed, rebuild
docker compose build pulse_mcp pulse_webhook

# Restart with new config
docker compose restart pulse_mcp pulse_webhook
```

---

### Task 8: Re-verify After Fixes

**Files:**
- Read: `/tmp/debug-errors-*.txt` (for comparison)

**Step 1: Clear old error logs**

```bash
rm -f /tmp/debug-errors-*.txt /tmp/debug-health.txt
```

**Step 2: Restart all application services**

```bash
docker compose restart pulse_mcp pulse_webhook firecrawl pulse_change-detection
```

**Step 3: Wait for startup**

```bash
sleep 30
```

**Step 4: Re-collect errors (repeat Task 4)**

```bash
docker compose logs pulse_mcp --tail=200 | grep -iE "(error|fail|refused|cannot|unable|undefined|not found)" > /tmp/debug-errors-mcp-after.txt
docker compose logs pulse_webhook --tail=200 | grep -iE "(error|fail|refused|cannot|unable|undefined|not found|traceback)" > /tmp/debug-errors-webhook-after.txt
docker compose logs firecrawl --tail=200 | grep -iE "(error|fail|refused|cannot|unable|undefined|not found)" > /tmp/debug-errors-firecrawl-after.txt
```

**Step 5: Compare before/after**

```bash
echo "=== MCP Errors Comparison ===" > /tmp/debug-comparison.txt
echo "Before: $(wc -l < /tmp/debug-errors-mcp.txt) errors" >> /tmp/debug-comparison.txt
echo "After: $(wc -l < /tmp/debug-errors-mcp-after.txt) errors" >> /tmp/debug-comparison.txt

echo -e "\n=== Webhook Errors Comparison ===" >> /tmp/debug-comparison.txt
echo "Before: $(wc -l < /tmp/debug-errors-webhook.txt) errors" >> /tmp/debug-comparison.txt
echo "After: $(wc -l < /tmp/debug-errors-webhook-after.txt) errors" >> /tmp/debug-comparison.txt

cat /tmp/debug-comparison.txt
```

Expected: Error count reduced to 0 or near 0

**Step 6: Re-run health checks (repeat Task 5)**

```bash
curl -s http://localhost:50107/health | jq .
curl -s http://localhost:50108/health | jq .
```

Expected: Both return healthy status

---

## Phase 6: Integration Testing

### Task 9: Test Cross-Service Communication

**Files:**
- Monitor: Service logs during test calls

**Step 1: Test MCP → Firecrawl communication**

```bash
# MCP should connect to Firecrawl at http://firecrawl:3002
docker compose logs pulse_mcp --follow &
LOG_PID=$!

# Trigger a scrape via MCP (if possible via API/CLI)
# OR check logs for successful Firecrawl API calls

sleep 10
kill $LOG_PID
```

Watch for:
- ✅ Successful HTTP requests to Firecrawl
- ❌ Connection refused to firecrawl:3002

**Step 2: Test MCP → Webhook communication**

```bash
# MCP should connect to Webhook at http://pulse_webhook:52100
docker compose logs pulse_mcp --follow &
LOG_PID=$!

# Trigger a query via MCP
# OR check logs for successful Webhook API calls

sleep 10
kill $LOG_PID
```

Watch for:
- ✅ Successful HTTP requests to Webhook
- ❌ Connection refused to pulse_webhook:52100

**Step 3: Test Webhook → Changedetection communication**

```bash
# Webhook should connect to changedetection at http://pulse_change-detection:5000
docker compose logs pulse_webhook --follow &
LOG_PID=$!

# Check if Webhook successfully connects to changedetection
docker compose exec pulse_webhook curl -s http://pulse_change-detection:5000 || echo "FAILED"

sleep 5
kill $LOG_PID
```

Watch for:
- ✅ Successful connection
- ❌ Connection refused

**Step 4: Verify HMAC secret substitution**

```bash
# Check that WEBHOOK_CHANGEDETECTION_HMAC_SECRET matches CHANGEDETECTION_WEBHOOK_SECRET
docker compose exec pulse_webhook env | grep "WEBHOOK_CHANGEDETECTION_HMAC_SECRET"
docker compose exec pulse_change-detection env | grep "CHANGEDETECTION_WEBHOOK_SECRET"
```

Expected: Both secrets match (should be `Hc7y9sDfT1qLp0vW4zXg2nRb6mJpQs8K`)

---

### Task 10: Verify Redis and PostgreSQL Connections

**Files:**
- Monitor: Service logs for database queries

**Step 1: Verify MCP → Redis**

```bash
docker compose exec pulse_mcp node -e "const redis = require('redis'); const client = redis.createClient({url: process.env.REDIS_URL}); client.connect().then(() => console.log('Connected')).catch(e => console.error(e)).finally(() => client.quit());"
```

Expected: "Connected"

**Step 2: Verify Webhook → Redis**

```bash
docker compose exec pulse_webhook python -c "
import os
from redis import Redis
redis_url = os.getenv('REDIS_URL')
print(f'Connecting to: {redis_url}')
r = Redis.from_url(redis_url)
r.ping()
print('Connected')
"
```

Expected: "Connected"

**Step 3: Verify Webhook → PostgreSQL**

```bash
docker compose exec pulse_webhook python -c "
import os
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine

async def test():
    db_url = os.getenv('WEBHOOK_DATABASE_URL')
    print(f'Connecting to: {db_url}')
    engine = create_async_engine(db_url)
    async with engine.connect() as conn:
        result = await conn.execute(text('SELECT 1'))
        print(f'Connected: {result.scalar()}')
    await engine.dispose()

asyncio.run(test())
"
```

Expected: "Connected: 1"

**Step 4: Check for connection pool exhaustion**

```bash
# Check Redis connections
docker compose exec pulse_redis redis-cli CLIENT LIST | wc -l

# Check PostgreSQL connections
docker compose exec pulse_postgres psql -U firecrawl -d pulse_postgres -c "SELECT count(*) FROM pg_stat_activity;"
```

Expected: Reasonable number of connections (< 50 for Redis, < 20 for PostgreSQL)

---

## Phase 7: Documentation and Cleanup

### Task 11: Document Findings and Resolution

**Files:**
- Create: `docs/debugging/2025-11-13-env-consolidation-debug.md`

**Step 1: Create debug report**

```markdown
# Environment Consolidation Debug Report

**Date:** 2025-11-13
**Context:** Post-consolidation stack validation after removing 7 duplicate environment variables

## Issues Found

1. **Issue Name**
   - **Error:** [exact error message]
   - **Root Cause:** [why it happened]
   - **Fix:** [what was changed]
   - **Files Modified:** [list of files]

2. ...

## Verification Results

- MCP Server: ✅ Healthy
- Webhook Bridge: ✅ Healthy
- Firecrawl API: ✅ Healthy
- Redis: ✅ Connected
- PostgreSQL: ✅ Connected
- Cross-service communication: ✅ Working

## Variables Successfully Consolidated

- ✅ REDIS_URL (replaced 3 duplicates)
- ✅ WEBHOOK_API_SECRET (replaced SEARCH_SERVICE_API_SECRET)
- ✅ FIRECRAWL_API_KEY (replaced WEBHOOK_FIRECRAWL_API_KEY)
- ✅ CHANGEDETECTION_API_KEY (replaced WEBHOOK_CHANGEDETECTION_API_KEY)
- ✅ CHANGEDETECTION_INTERNAL_URL (replaced WEBHOOK_CHANGEDETECTION_API_URL)
- ✅ WEBHOOK_CHANGEDETECTION_HMAC_SECRET (uses substitution)

## Lessons Learned

[What we learned from this debugging session]

## Next Steps

- Monitor production logs for 24 hours
- Update deployment documentation
- [Other follow-ups]
```

**Step 2: Save all debug artifacts**

```bash
mkdir -p docs/debugging/2025-11-13-env-consolidation-artifacts
mv /tmp/debug-*.txt docs/debugging/2025-11-13-env-consolidation-artifacts/
```

**Step 3: Commit fixes**

```bash
git add .env apps/mcp/config/environment.ts apps/webhook/config.py docs/debugging/
git commit -m "fix: resolve environment variable issues after consolidation

- Fixed [list specific issues]
- Verified all services start successfully
- Confirmed cross-service communication working
- All health checks passing

See docs/debugging/2025-11-13-env-consolidation-debug.md for details"
```

---

## Summary

**Phases:**
1. ✅ Pre-flight checks (Docker Compose validation)
2. ✅ Controlled startup (infrastructure → applications)
3. ✅ Error collection (systematic log analysis)
4. ✅ Root cause identification (cross-reference variables)
5. ✅ Fix application (add missing variables, fix values, add fallbacks)
6. ✅ Integration testing (verify cross-service communication)
7. ✅ Documentation (record findings and resolution)

**Expected Outcome:**
- All 9 Docker services running healthy
- No environment variable errors in logs
- Cross-service communication verified
- Health endpoints returning success
- Full debug report documenting any issues found and how they were resolved

**Rollback Plan (if unfixable):**
```bash
# Restore original .env with duplicates
git checkout HEAD~1 .env
docker compose restart
```
