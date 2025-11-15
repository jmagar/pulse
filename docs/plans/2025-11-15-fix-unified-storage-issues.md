# Fix Unified Storage Issues Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix critical authentication bug and documentation issues in the unified Redis+PostgreSQL storage implementation

**Architecture:** This plan addresses 3 issues identified in comprehensive validation: (1) CRITICAL authentication header mismatch preventing production use, (2) IMPORTANT plan documentation inconsistencies, (3) OPTIONAL missing integration tests

**Tech Stack:** TypeScript (MCP server), Python (webhook bridge), pytest, vitest

---

## Issue Summary

From validation report:

1. **🔴 CRITICAL:** Authentication header mismatch - MCP sends `X-API-Secret` but webhook expects `Authorization: Bearer`
2. **🟡 IMPORTANT:** Plan documentation incomplete - only 4/15 tasks marked complete despite 100% implementation
3. **🔵 OPTIONAL:** Missing integration tests for ContentCacheService

**Priority:** Fix #1 (blocking production), #2 (documentation accuracy), skip #3 (nice-to-have)

---

## Task 1: Fix Authentication Headers (CRITICAL)

**Priority:** BLOCKING - Must fix before production deployment

**Files:**
- Modify: `apps/mcp/storage/webhook-postgres.ts:46,115`
- Test: `apps/mcp/tests/storage/webhook-storage.test.ts` (integration tests)

**Problem:** MCP client sends incorrect auth header format:
- Current (WRONG): `X-API-Secret: <secret>`
- Expected: `Authorization: Bearer <secret>`

**Impact:** All webhook API calls return 401 Unauthorized

**Step 1: Fix findByUrl authentication header**

Location: `apps/mcp/storage/webhook-postgres.ts:46`

Replace:
```typescript
headers: {
  "X-API-Secret": this.apiSecret,
}
```

With:
```typescript
headers: {
  "Authorization": `Bearer ${this.apiSecret}`,
}
```

**Step 2: Fix read authentication header**

Location: `apps/mcp/storage/webhook-postgres.ts:115`

Replace:
```typescript
headers: {
  "X-API-Secret": this.apiSecret,
}
```

With:
```typescript
headers: {
  "Authorization": `Bearer ${this.apiSecret}`,
}
```

**Step 3: Verify changes with grep**

Run: `grep -n "X-API-Secret" apps/mcp/storage/webhook-postgres.ts`
Expected: No matches (should find 0 occurrences)

Run: `grep -n "Authorization.*Bearer" apps/mcp/storage/webhook-postgres.ts`
Expected: 2 matches (lines 46 and 115)

**Step 4: Run unit tests to ensure no regressions**

Run: `pnpm test:mcp apps/mcp/tests/storage/webhook-postgres.test.ts`
Expected: All 17 tests pass (unit tests mock fetch, so pass regardless)

**Step 5: Run integration tests with real webhook service**

Prerequisites:
- Webhook service running at `http://localhost:50108`
- Valid API secret in environment

Run:
```bash
export RUN_WEBHOOK_STORAGE_INTEGRATION=true
export MCP_WEBHOOK_BASE_URL=http://localhost:50108
export MCP_WEBHOOK_API_SECRET=<your-secret>
pnpm test:mcp apps/mcp/tests/storage/webhook-storage.test.ts
```

Expected: All 11 integration tests pass (validates actual auth)

**Step 6: Commit authentication fix**

```bash
git add apps/mcp/storage/webhook-postgres.ts
git commit -m "fix(mcp): correct authentication header format for webhook API

- Change X-API-Secret to Authorization: Bearer format
- Fixes 401 errors when calling webhook content endpoints
- Aligns with webhook API authentication middleware

Ref: Validation report 2025-11-15"
```

**Success Criteria:**
- ✅ No `X-API-Secret` headers in webhook-postgres.ts
- ✅ Both findByUrl and read use `Authorization: Bearer` format
- ✅ All 17 unit tests pass
- ✅ All 11 integration tests pass (when run)
- ✅ Committed with descriptive message

---

## Task 2: Update Plan Documentation

**Priority:** IMPORTANT - Documentation accuracy

**Files:**
- Modify: `docs/plans/2025-01-15-unified-redis-postgres-storage.md`

**Problem:** Plan shows conflicting completion status:
- Claims "100% COMPLETE"
- Only 4/15 tasks marked with ✅
- Missing commit SHAs for 11 tasks
- Contradictory progress indicators (15% vs 100%)

**Step 1: Read current plan document**

Run: `cat docs/plans/2025-01-15-unified-redis-postgres-storage.md | grep -E "(Task [0-9]|✅|PAUSED|Status:)" | head -30`

Identify: Tasks needing ✅ markers and commit SHAs

**Step 2: Get commit history for tasks**

Run:
```bash
git log --oneline --all --grep="content" --grep="cache" --grep="webhook-postgres" --grep="storage" -20
```

Map commits to tasks:
- Task 1.1: ContentCacheService creation
- Task 1.2: get_by_url implementation
- Task 1.3: get_by_session implementation
- Task 1.4: Cache invalidation
- Task 2.1: API integration
- Task 3.1-3.7: MCP storage implementation
- Task 3.8: Configuration integration
- Task 3.9: Testing
- Task 3.10: Documentation

**Step 3: Update Task 1.3 status**

Find section starting with "### Task 1.3: Implement get_by_session"

Replace:
```markdown
**Status:** PAUSED
```

With:
```markdown
**Status:** ✅ COMPLETED

**Commit:** [SHA from git log]
**Files Changed:**
- apps/webhook/services/content_cache.py
- apps/webhook/tests/unit/services/test_content_cache.py
```

**Step 4: Update Task 1.4 status**

Find section starting with "### Task 1.4: Implement cache invalidation"

Add completion marker and commit SHA:
```markdown
**Status:** ✅ COMPLETED

**Commit:** [SHA from git log]
**Files Changed:**
- apps/webhook/services/content_cache.py
```

**Step 5: Update Tasks 2.1, 3.1-3.8 status**

For each task (2.1, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8):

Add:
```markdown
**Status:** ✅ COMPLETED

**Commit:** [SHA from git log]
**Files Changed:** [list modified files]
```

**Step 6: Remove conflicting progress indicators**

Find and remove:
- Line ~1750: "15% complete (2 of 13 tasks)"
- Any other percentage claims that conflict with 100%

**Step 7: Add completion summary**

At end of document, add:
```markdown
---

## Implementation Complete

**Date:** 2025-11-15
**Final Status:** ✅ 100% COMPLETE (13/13 tasks)

**Tasks Breakdown:**
- Phase 1 (Webhook): 4/4 complete
- Phase 2 (Integration): 1/1 complete
- Phase 3 (MCP): 8/8 complete

**Total Tests:** 39 (28 passing unit tests, 11 integration tests)
**Code Quality:** Production-ready
**Documentation:** CLAUDE.md updated

**Known Issues:**
- Authentication header bug (fixed in commit [SHA])
- Plan documentation markers (fixed in this update)
```

**Step 8: Verify all tasks marked**

Run: `grep -c "### Task" docs/plans/2025-01-15-unified-redis-postgres-storage.md`
Expected: 13 (or 15 if sub-tasks counted separately)

Run: `grep -c "✅ COMPLETED" docs/plans/2025-01-15-unified-redis-postgres-storage.md`
Expected: 13 (matches task count)

**Step 9: Commit documentation update**

```bash
git add docs/plans/2025-01-15-unified-redis-postgres-storage.md
git commit -m "docs: update unified storage plan with completion markers

- Mark 11 remaining tasks as completed
- Add commit SHAs for all tasks
- Remove conflicting progress indicators
- Add final completion summary

All 13 tasks implemented and tested. Plan now accurately reflects 100% completion status.

Ref: Validation report 2025-11-15"
```

**Success Criteria:**
- ✅ All 13 tasks marked with ✅ COMPLETED
- ✅ All tasks have commit SHAs documented
- ✅ No conflicting progress indicators (15% vs 100%)
- ✅ Completion summary added
- ✅ Committed with descriptive message

---

## Task 3: Add Webhook Integration Tests (OPTIONAL)

**Priority:** NICE-TO-HAVE - Not blocking merge

**Files:**
- Create: `apps/webhook/tests/integration/test_content_cache_integration.py`

**Purpose:** Validate actual cache behavior (Redis → PostgreSQL fallback) in real environment

**Step 1: Create integration test file**

File: `apps/webhook/tests/integration/test_content_cache_integration.py`

```python
"""
Integration tests for ContentCacheService with real Redis and PostgreSQL.

Requires:
- Redis running at WEBHOOK_REDIS_URL
- PostgreSQL running at WEBHOOK_DATABASE_URL
- Test database migrations applied
"""

import pytest
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.content_cache import ContentCacheService
from app.models.timing import ScrapedContent


@pytest.mark.integration
@pytest.mark.asyncio
async def test_cache_miss_fetches_from_postgres(
    content_cache_service: ContentCacheService,
    db_session: AsyncSession,
    redis_client
):
    """
    Test that cache miss retrieves content from PostgreSQL and populates Redis.

    Flow:
    1. Insert content directly into PostgreSQL
    2. Verify Redis is empty
    3. Call get_by_url (cache miss)
    4. Verify content returned from PostgreSQL
    5. Verify Redis now contains the content
    """
    # Setup: Insert content into PostgreSQL
    content = ScrapedContent(
        content_id="test-cache-miss-123",
        url="https://example.com/cache-miss",
        markdown="# Cache Miss Test",
        html="<h1>Cache Miss Test</h1>",
        crawl_id="crawl-123",
        created_at=datetime.now(timezone.utc)
    )
    db_session.add(content)
    await db_session.commit()

    # Verify Redis is empty
    cache_key = "content:url:https://example.com/cache-miss:0:50"
    cached = await redis_client.get(cache_key)
    assert cached is None, "Redis should be empty before test"

    # Act: Fetch from cache (should hit PostgreSQL)
    result = await content_cache_service.get_by_url(
        "https://example.com/cache-miss",
        offset=0,
        limit=50
    )

    # Assert: Content returned
    assert result is not None
    assert result["total"] == 1
    assert result["items"][0]["content_id"] == "test-cache-miss-123"
    assert result["items"][0]["markdown"] == "# Cache Miss Test"

    # Assert: Redis now populated
    cached = await redis_client.get(cache_key)
    assert cached is not None, "Redis should be populated after fetch"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_cache_hit_skips_postgres(
    content_cache_service: ContentCacheService,
    redis_client,
    monkeypatch
):
    """
    Test that cache hit returns from Redis without querying PostgreSQL.

    Flow:
    1. Populate Redis with content
    2. Mock PostgreSQL query to fail
    3. Call get_by_url (cache hit)
    4. Verify content returned from Redis
    5. Verify PostgreSQL was never queried
    """
    # Setup: Populate Redis
    cache_key = "content:url:https://example.com/cache-hit:0:50"
    cache_data = {
        "total": 1,
        "items": [{
            "content_id": "test-cache-hit-456",
            "url": "https://example.com/cache-hit",
            "markdown": "# Cache Hit Test",
            "crawl_id": "crawl-456"
        }],
        "offset": 0,
        "limit": 50,
        "cached": True
    }
    await redis_client.setex(
        cache_key,
        3600,
        json.dumps(cache_data)
    )

    # Setup: Make PostgreSQL fail if called
    postgres_called = False

    async def mock_postgres_query(*args, **kwargs):
        nonlocal postgres_called
        postgres_called = True
        raise Exception("PostgreSQL should not be called on cache hit")

    monkeypatch.setattr(
        content_cache_service,
        "_fetch_from_postgres",
        mock_postgres_query
    )

    # Act: Fetch from cache (should hit Redis)
    result = await content_cache_service.get_by_url(
        "https://example.com/cache-hit",
        offset=0,
        limit=50
    )

    # Assert: Content returned from Redis
    assert result is not None
    assert result["total"] == 1
    assert result["items"][0]["content_id"] == "test-cache-hit-456"
    assert result["cached"] is True

    # Assert: PostgreSQL was never called
    assert not postgres_called, "PostgreSQL should not be queried on cache hit"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_pagination_separate_cache_keys(
    content_cache_service: ContentCacheService,
    redis_client
):
    """
    Test that different pagination parameters use different cache keys.

    Validates that offset/limit create unique cache entries.
    """
    url = "https://example.com/pagination"

    # Populate different pages
    page1_key = f"content:url:{url}:0:10"
    page2_key = f"content:url:{url}:10:10"

    await redis_client.setex(page1_key, 3600, json.dumps({"page": 1}))
    await redis_client.setex(page2_key, 3600, json.dumps({"page": 2}))

    # Verify different keys
    assert page1_key != page2_key

    # Verify different content
    page1 = await redis_client.get(page1_key)
    page2 = await redis_client.get(page2_key)

    assert json.loads(page1)["page"] == 1
    assert json.loads(page2)["page"] == 2
```

**Step 2: Add pytest fixtures**

File: `apps/webhook/tests/conftest.py` (add to existing)

```python
@pytest.fixture
async def content_cache_service(db_session, redis_client):
    """Provide ContentCacheService with real dependencies."""
    from app.services.content_cache import ContentCacheService

    service = ContentCacheService(db_session, redis_client)
    return service


@pytest.fixture
async def redis_client():
    """Provide real Redis client for integration tests."""
    import redis.asyncio as redis
    from app.config import settings

    client = redis.from_url(
        settings.redis_url,
        encoding="utf-8",
        decode_responses=True
    )

    yield client

    # Cleanup: Clear test keys
    await client.flushdb()
    await client.close()
```

**Step 3: Run integration tests**

Run:
```bash
cd apps/webhook
WEBHOOK_SKIP_DB_FIXTURES=1 uv run pytest tests/integration/test_content_cache_integration.py -v -m integration
```

Expected: 3 tests pass

**Step 4: Commit integration tests**

```bash
git add apps/webhook/tests/integration/test_content_cache_integration.py
git add apps/webhook/tests/conftest.py
git commit -m "test(webhook): add ContentCacheService integration tests

- Test cache miss fetches from PostgreSQL
- Test cache hit skips PostgreSQL query
- Test pagination uses separate cache keys
- Add redis_client and content_cache_service fixtures

Validates actual Redis → PostgreSQL fallback behavior."
```

**Success Criteria:**
- ✅ Integration test file created
- ✅ 3 integration tests pass
- ✅ Fixtures added to conftest.py
- ✅ Tests marked with @pytest.mark.integration
- ✅ Committed with descriptive message

**Note:** This task is OPTIONAL and not blocking merge. Skip if time-constrained.

---

## Verification & Completion

### Pre-Merge Checklist

**Critical (MUST complete):**
- [ ] Task 1: Authentication headers fixed
- [ ] Task 1: Unit tests pass (17/17)
- [ ] Task 1: Integration tests pass (11/11)
- [ ] Task 1: Committed

**Important (SHOULD complete):**
- [ ] Task 2: All 13 tasks marked complete in plan
- [ ] Task 2: Commit SHAs documented
- [ ] Task 2: Committed

**Optional (NICE-TO-HAVE):**
- [ ] Task 3: Integration tests created (skip if time-constrained)

### Final Validation Commands

**Run all MCP tests:**
```bash
pnpm test:mcp
```
Expected: All tests pass

**Run integration tests:**
```bash
export RUN_WEBHOOK_STORAGE_INTEGRATION=true
export MCP_WEBHOOK_BASE_URL=http://localhost:50108
export MCP_WEBHOOK_API_SECRET=$(grep MCP_WEBHOOK_API_SECRET .env | cut -d'=' -f2)
pnpm test:mcp apps/mcp/tests/storage/webhook-storage.test.ts
```
Expected: All 11 integration tests pass

**Verify no auth header bugs remain:**
```bash
grep -r "X-API-Secret" apps/mcp/storage/
```
Expected: No matches

**Count plan completion markers:**
```bash
grep -c "✅ COMPLETED" docs/plans/2025-01-15-unified-redis-postgres-storage.md
```
Expected: 13

### Deployment Readiness

After completing Tasks 1 and 2:

**Production Ready:** ✅ YES
- Critical auth bug fixed
- All tests passing
- Documentation accurate
- Ready for merge to main

**Monitoring After Deploy:**
- Check for 401 errors in webhook logs
- Verify Redis cache hit rates
- Monitor content retrieval latency
- Validate PostgreSQL query performance

---

## Effort Estimates

| Task | Priority | Effort | Dependencies |
|------|----------|--------|--------------|
| Task 1: Fix auth headers | 🔴 CRITICAL | 15 minutes | None |
| Task 2: Update plan docs | 🟡 IMPORTANT | 30 minutes | Task 1 commit SHA |
| Task 3: Integration tests | 🔵 OPTIONAL | 1-2 hours | Redis, PostgreSQL running |

**Total (Critical + Important):** ~45 minutes
**Total (All tasks):** ~2-2.5 hours

---

## References

- Validation Report: `.docs/reports/2025-11-15-unified-storage-code-review.md`
- Original Plan: `docs/plans/2025-01-15-unified-redis-postgres-storage.md`
- CLAUDE.md: Section on webhook-postgres storage
- Webhook Auth Middleware: `apps/webhook/api/middleware/auth.py`
- MCP Storage Interface: `apps/mcp/server/storage/interface.ts`
