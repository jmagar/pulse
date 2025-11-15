# Parallel Debugging Session - 2025-11-13

## Session Overview

Two critical bugs debugged using parallel agent methodology:
1. **Foreign key violations** in webhook worker operations
2. **changedetection.io API 404 errors**

---

## Bug 1: Foreign Key Violations in Worker Operations

### Error Pattern
```
pulse_postgres: ERROR: insert or update on table "operation_metrics" violates foreign key constraint "fk_operation_metrics_request_id"
pulse_postgres: DETAIL: Key (request_id)=(9999f127-e3b5-43aa-a831-645e3fe639d7) is not present in table "request_metrics"
pulse_webhook-worker: [warning] Failed to store operation metric
```

### Investigation Method
Spawned 3 parallel root-cause-analyzer agents to investigate independently.

### Unanimous Findings (All 3 Agents)

**Root Cause:** Worker operations auto-generated UUIDs for `request_id` when passed `None`, violating FK constraint.

**Key Evidence:**
1. **[timing.py:54](apps/webhook/utils/timing.py#L54)** - Problematic logic:
   ```python
   self.request_id = request_id or str(uuid4())
   ```
   - Python `or` treats `None` as falsy
   - `None or str(uuid4())` → generates UUID
   - Generated UUIDs don't exist in `request_metrics` table

2. **Worker code** - Passed `request_id=None`:
   - [worker.py:78](apps/webhook/worker.py#L78) - `get_service_pool`
   - [worker.py:104](apps/webhook/worker.py#L104) - `index_document`
   - [indexing.py:109](apps/webhook/services/indexing.py#L109) - `chunk_text`
   - [indexing.py:142](apps/webhook/services/indexing.py#L142) - `embed_batch`
   - [indexing.py:182](apps/webhook/services/indexing.py#L182) - `index_chunks`
   - [indexing.py:221](apps/webhook/services/indexing.py#L221) - `bm25 index_document`

3. **Database constraint** - [20251113_add_foreign_keys.py:51-60](apps/webhook/alembic/versions/20251113_add_foreign_keys.py#L51-L60):
   - FK requires all `request_id` in `operation_metrics` exist in `request_metrics`
   - `request_metrics` only populated by HTTP middleware
   - Worker operations bypass HTTP layer → no `request_metrics` entry

### Solution Implemented

**Change 1: Remove UUID auto-generation**
```python
# apps/webhook/utils/timing.py:54
# BEFORE:
self.request_id = request_id or str(uuid4())

# AFTER:
self.request_id = request_id  # Can be None for worker operations
```

**Change 2: Clean up logs**
```python
# apps/webhook/utils/timing.py:66-72, 93-102
# Only include request_id in logs when not None
log_kwargs = {...}
if self.request_id is not None:
    log_kwargs["request_id"] = self.request_id
logger.debug("Operation started", **log_kwargs)
```

### Verification

**Database query results:**
```sql
SELECT operation_type, operation_name, request_id IS NULL, COUNT(*)
FROM webhook.operation_metrics
WHERE created_at > NOW() - INTERVAL '5 minutes'
GROUP BY operation_type, operation_name, request_id IS NULL;
```

Result: All recent operations (30+) successfully stored with `request_id IS NULL` ✓

**Logs:**
- Before: `request_id=9999f127-e3b5-43aa-a831-645e3fe639d7` + FK violations
- After: No `request_id` field in logs + no FK violations ✓

### Commits
- Initial (incomplete): `d5dae8e` - Added `request_id=None` to worker calls but didn't fix root cause
- Complete fix: `ffa055a` - Fixed `timing.py` logic and cleaned up logs

---

## Bug 2: changedetection.io API 404 Errors

### Error Pattern
```
pulse_webhook: HTTP Request: GET http://pulse_change-detection:5000/api/v2/watch "HTTP/1.1 404 NOT FOUND"
pulse_webhook: Failed to fetch changedetection.io watches error="Client error '404 NOT FOUND' for url 'http://pulse_change-detection:5000/api/v2/watch'"
pulse_webhook: Failed to create changedetection.io watch error="Client error '404 NOT FOUND' for url 'http://pulse_change-detection:5000/api/v2/watch'" error_type=HTTPStatusError url=https://nextjs.org/docs
```

### Investigation Method
Spawned 3 parallel root-cause-analyzer agents to investigate independently.

### Unanimous Findings (All 3 Agents)

**Root Cause:** Client used `/api/v2/watch` but changedetection.io only exposes `/api/v1/watch`.

**Key Evidence:**
1. **Client code hardcoded v2**:
   - [changedetection.py:100](apps/webhook/clients/changedetection.py#L100) - POST endpoint
   - [changedetection.py:152](apps/webhook/clients/changedetection.py#L152) - GET endpoint
   ```python
   f"{self.api_url}/api/v2/watch"  # Wrong version!
   ```

2. **Official API documentation**:
   - changedetection.io API version: **0.1.3**
   - Base path: `/api/v1/`
   - Documentation: https://changedetection.io/docs/api_v1/index.html
   - **No v2 API exists in any release**

3. **Container logs confirmed**:
   ```
   172.24.0.8 - - [13/Nov/2025 11:16:49] "[33mGET /api/v2/watch HTTP/1.1[0m" 404 -
   ```

### Solution Implemented

**Change: Update API version from v2 to v1**
```python
# apps/webhook/clients/changedetection.py:100
# BEFORE:
response = await client.post(
    f"{self.api_url}/api/v2/watch",
    json=payload,
    headers=headers,
)

# AFTER:
response = await client.post(
    f"{self.api_url}/api/v1/watch",
    json=payload,
    headers=headers,
)
```

```python
# apps/webhook/clients/changedetection.py:152
# BEFORE:
response = await client.get(
    f"{self.api_url}/api/v2/watch",
    headers=headers,
)

# AFTER:
response = await client.get(
    f"{self.api_url}/api/v1/watch",
    headers=headers,
)
```

### Verification

**Direct API test:**
```bash
# v1 endpoint (correct):
curl http://pulse_change-detection:5000/api/v1/watch
# → 403 Forbidden (exists, needs auth) ✓

# v2 endpoint (wrong):
curl http://pulse_change-detection:5000/api/v2/watch
# → 404 Not Found (doesn't exist) ✗
```

**Log verification:**
- Before: Constant 404 errors on every Firecrawl webhook
- After: No 404 errors in webhook logs ✓

### Commits
- Fix: `1d42c9a` - Changed v2 → v1 in both endpoints

---

## Methodology Summary

### Parallel Debugging Approach
1. Spawned 3 independent `root-cause-analyzer` agents per bug
2. Each agent investigated with same prompt but different analytical paths
3. All agents converged on identical root causes
4. High confidence in findings due to unanimous consensus

### Key Success Factors
- **Evidence-based**: All agents used actual code inspection
- **No assumptions**: Agents traced through implementation details
- **Documentation verification**: Cross-referenced official docs
- **Reproducible**: Direct testing confirmed findings

### Files Modified

**Bug 1 (FK violations):**
- `apps/webhook/utils/timing.py` - Fixed UUID generation logic, cleaned logs
- `apps/webhook/worker.py` - Added `request_id=None` (6 locations total across files)
- `apps/webhook/services/indexing.py` - Added `request_id=None`

**Bug 2 (API 404s):**
- `apps/webhook/clients/changedetection.py` - Changed v2 → v1 (2 locations)

### Total Time
- Bug 1: ~30 minutes (including false starts with Docker rebuild)
- Bug 2: ~10 minutes (straightforward after methodology established)

### Lessons Learned
1. **Docker layer caching** can mask code changes - rebuilt image had old code
2. **Python `or` operator** with `None` is a common gotcha
3. **API version assumptions** should always be verified against docs
4. **Parallel debugging** provides high confidence through consensus
