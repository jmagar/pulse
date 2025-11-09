# Manual Testing Guide - Timing Middleware

## Testing Without Database

The timing middleware works fully without PostgreSQL. Here's how to verify it manually.

### 1. Start the Application

```bash
cd /home/jmagar/code/fc-bridge
uv run uvicorn app.main:app --reload --port 52100
```

Expected output:
```
INFO: Starting Search Bridge API version=0.1.0 port=52100
WARNING: Failed to initialize timing metrics database error=...
INFO: Search Bridge API ready
```

**Note:** The warning about database is expected and normal.

### 2. Test Timing Headers

```bash
# Test health endpoint
curl -i http://localhost:52100/health
```

**Expected Response Headers:**
```
HTTP/1.1 200 OK
X-Request-ID: 8c7f4a2e-1234-5678-90ab-cdef12345678
X-Process-Time: 12.34
...
```

**Verification:**
- ✅ `X-Request-ID` present (unique UUID)
- ✅ `X-Process-Time` present (milliseconds as float)

### 3. Test Different Endpoints

```bash
# Root endpoint
curl -i http://localhost:52100/

# Stats endpoint
curl -i http://localhost:52100/api/stats

# Any endpoint should have timing headers
```

**All should return timing headers.**

### 4. Test Error Handling

```bash
# Request non-existent endpoint
curl -i http://localhost:52100/api/nonexistent
```

**Expected:**
- ✅ Still returns timing headers
- ✅ Request tracked even for 404s
- ✅ Duration measured correctly

### 5. Check Application Logs

Look for structured log entries like:

```json
{
  "level": "info",
  "message": "Request completed",
  "method": "GET",
  "path": "/health",
  "status_code": 200,
  "duration_ms": 12.34,
  "request_id": "8c7f4a2e-1234-5678-90ab-cdef12345678"
}
```

### 6. Test Long-Running Request

```bash
# Search endpoint (slower operation)
curl -i -H "X-API-Secret: your-secret" \
  -H "Content-Type: application/json" \
  -d '{"query": "test search"}' \
  http://localhost:52100/api/search
```

**Expected:**
- ✅ Higher `X-Process-Time` value
- ✅ Request tracked correctly
- ✅ No errors despite missing database

### 7. Verify Graceful Degradation

Check logs for database warnings:

```
WARNING: Failed to store request metric error=... request_id=...
WARNING: Failed to store operation metric error=... operation_type=...
```

**Expected Behavior:**
- ✅ Application continues running
- ✅ Requests complete successfully
- ✅ Timing still measured and logged
- ✅ Only database storage fails (logged as warning)

## Testing With Database

### 1. Start PostgreSQL

```bash
docker compose up -d postgres
```

### 2. Run Migration

```bash
alembic upgrade head
```

Expected output:
```
INFO  [alembic.runtime.migration] Running upgrade  -> 57f2f0e22bad, Add timing metrics tables
```

### 3. Restart Application

```bash
uv run uvicorn app.main:app --reload --port 52100
```

Expected output:
```
INFO: Starting Search Bridge API version=0.1.0 port=52100
INFO: Timing metrics database initialized
INFO: Search Bridge API ready
```

**No warnings about database!**

### 4. Make Requests

```bash
# Make several requests
curl http://localhost:52100/health
curl http://localhost:52100/
curl http://localhost:52100/api/stats
```

### 5. Query Metrics API

```bash
# Get request metrics
curl -H "X-API-Secret: your-secret" \
  "http://localhost:52100/api/metrics/requests?limit=10"
```

**Expected Response:**
```json
{
  "metrics": [
    {
      "id": "...",
      "timestamp": "2025-11-08T08:21:00Z",
      "method": "GET",
      "path": "/health",
      "status_code": 200,
      "duration_ms": 12.34,
      "request_id": "...",
      "client_ip": "127.0.0.1"
    }
  ],
  "total": 3,
  "summary": {
    "avg_duration_ms": 15.67,
    "min_duration_ms": 10.23,
    "max_duration_ms": 23.45,
    "total_requests": 3
  }
}
```

### 6. Query Summary

```bash
curl -H "X-API-Secret: your-secret" \
  "http://localhost:52100/api/metrics/summary?hours=24"
```

**Expected Response:**
```json
{
  "time_period_hours": 24,
  "requests": {
    "total": 3,
    "avg_duration_ms": 15.67,
    "error_count": 0
  },
  "operations_by_type": {},
  "slowest_endpoints": [
    {
      "path": "/api/stats",
      "avg_duration_ms": 23.45,
      "request_count": 1
    }
  ]
}
```

### 7. Verify Database Storage

```bash
# Connect to PostgreSQL
docker exec -it fc-bridge-postgres psql -U fc_bridge

# Query metrics
SELECT method, path, status_code, ROUND(duration_ms::numeric, 2) as duration_ms
FROM request_metrics
ORDER BY timestamp DESC
LIMIT 5;
```

**Expected:**
```
 method |    path     | status_code | duration_ms
--------+-------------+-------------+-------------
 GET    | /health     |         200 |       12.34
 GET    | /           |         200 |       15.67
 GET    | /api/stats  |         200 |       23.45
```

## Performance Verification

### Measure Middleware Overhead

```bash
# Without middleware (baseline - use older git commit)
time curl -s http://localhost:52100/health > /dev/null

# With middleware (current)
time curl -s http://localhost:52100/health > /dev/null
```

**Expected Overhead:** <2ms (negligible)

### Load Testing

```bash
# Simple load test
for i in {1..100}; do
  curl -s http://localhost:52100/health > /dev/null &
done
wait

# Check metrics
curl -H "X-API-Secret: your-secret" \
  "http://localhost:52100/api/metrics/summary?hours=1"
```

**Expected:**
- ✅ All requests tracked
- ✅ No errors
- ✅ Performance stats available

## Troubleshooting

### No Timing Headers

**Symptom:** Response missing `X-Request-ID` or `X-Process-Time`

**Check:**
```bash
# Verify middleware is registered
grep -A2 "TimingMiddleware" app/main.py
```

**Solution:** Middleware should be registered before SlowAPI middleware

### Database Connection Errors

**Symptom:** Application fails to start with database error

**Check:**
```bash
# Verify PostgreSQL is running
docker ps | grep postgres

# Check database URL
echo $SEARCH_BRIDGE_DATABASE_URL
```

**Solution:** Application should start anyway (graceful degradation)

### Metrics Not Persisting

**Symptom:** Metrics API returns empty results

**Check:**
```bash
# Check database connection
psql $SEARCH_BRIDGE_DATABASE_URL -c "SELECT COUNT(*) FROM request_metrics;"

# Check logs for storage errors
grep "Failed to store.*metric" logs.txt
```

**Solution:** Verify database is accessible and migrations ran

## Success Criteria

### Minimum (No Database)
- ✅ Application starts successfully
- ✅ Timing headers present on all responses
- ✅ Request IDs unique and properly formatted
- ✅ Duration measured accurately
- ✅ Structured logging works

### Full (With Database)
- ✅ All minimum criteria met
- ✅ Metrics stored in PostgreSQL
- ✅ Metrics API returns data
- ✅ Summary statistics calculated
- ✅ No error logs (except expected warnings)

## Next Steps After Verification

1. **Monitor Performance**
   - Watch for slow endpoints (>1000ms)
   - Check error rates
   - Analyze operation bottlenecks

2. **Set Up Alerts**
   - Endpoint response time >5s
   - Error rate >5%
   - Database connection failures

3. **Create Dashboard**
   - Grafana dashboard (optional)
   - Track trends over time
   - Visualize performance metrics

4. **Optimize**
   - Index slow queries
   - Add caching where appropriate
   - Scale bottleneck operations
