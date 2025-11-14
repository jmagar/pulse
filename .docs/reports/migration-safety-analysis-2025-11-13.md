# Database Migration Safety Analysis
**Date:** 2025-11-13
**Plan:** `/compose/pulse/.docs/plans/2025-11-13-timing-instrumentation-plan-CORRECTED.md`
**Reviewer:** Claude (Sonnet 4.5)
**Status:** ⚠️ REQUIRES CHANGES - See Recommendations Below

---

## Executive Summary

The timing instrumentation plan proposes adding two new tables (`crawl_sessions`) and one new column (`crawl_id` to `operation_metrics`) to track crawl lifecycle metrics. The migration strategy is **mostly safe** for production, but has **several critical issues** that must be addressed.

### Risk Level: **MEDIUM-HIGH** ⚠️

**Key Issues Found:**
1. ❌ **CRITICAL:** Missing foreign key relationship between `CrawlSession` and `OperationMetric`
2. ❌ **CRITICAL:** String length inconsistencies (`String(100)` vs `String(255)`)
3. ⚠️ **WARNING:** No index on `CrawlSession.crawl_id` despite UNIQUE constraint
4. ⚠️ **WARNING:** Overly permissive nullability on aggregate metrics
5. ⚠️ **WARNING:** Missing rollback tests for production safety

---

## 1. Migration Safety Review

### ✅ SAFE Aspects

#### Zero-Downtime Compliance
All new columns are properly nullable, allowing existing code to continue running:
```python
# ✅ GOOD: New column is nullable
crawl_id: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
```

#### Proper Indexing Strategy
Appropriate indexes are defined for query patterns:
```python
# ✅ GOOD: Index on crawl_id for JOINs
crawl_id: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
status: Mapped[str] = mapped_column(String(50), nullable=False, default="in_progress", index=True)
```

#### Backward Compatibility
New tables don't affect existing functionality:
- `CrawlSession` is a new table (no schema changes to existing tables except `operation_metrics`)
- `operation_metrics.crawl_id` addition is nullable and indexed
- No data migration required for existing rows

### ❌ CRITICAL Issues

#### 1. **Missing Foreign Key Constraint**

**Issue:** The plan does NOT define a foreign key from `OperationMetric.crawl_id` to `CrawlSession.crawl_id`.

**Current State (from migration 20251113_add_foreign_keys.py):**
```python
# Existing FK: operation_metrics.request_id -> request_metrics.request_id
op.create_foreign_key(
    "fk_operation_metrics_request_id",
    "operation_metrics",
    "request_metrics",
    ["request_id"],
    ["request_id"],
    source_schema="webhook",
    referent_schema="webhook",
    ondelete="SET NULL"
)
```

**Missing FK (should be added):**
```python
# MISSING: operation_metrics.crawl_id -> crawl_sessions.crawl_id
op.create_foreign_key(
    "fk_operation_metrics_crawl_id",
    "operation_metrics",
    "crawl_sessions",
    ["crawl_id"],
    ["crawl_id"],
    source_schema="webhook",
    referent_schema="webhook",
    ondelete="SET NULL"  # Allow orphaned metrics if crawl session deleted
)
```

**Why This Matters:**
- Without FK, orphaned records can accumulate (operation metrics pointing to non-existent crawls)
- Query joins will return incorrect results
- Data integrity violations won't be caught at the database level
- Aggregation queries in `_record_crawl_complete` may count operations from deleted crawls

**Recommendation:**
Add a third migration after `add_crawl_id_to_operation_metrics`:
```bash
uv run alembic revision -m "add_crawl_session_foreign_key"
```

This migration should:
1. Clean up any orphaned `crawl_id` values in `operation_metrics`
2. Add FK constraint: `operation_metrics.crawl_id -> crawl_sessions.crawl_id`
3. Use `ON DELETE SET NULL` to preserve operation metrics if crawl session is deleted

---

#### 2. **String Length Inconsistencies**

**Issue:** The plan uses different string lengths for `crawl_id` in different places.

**Inconsistency:**
```python
# CrawlSession model (Task 1.1)
crawl_id: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)

# OperationMetric addition (Task 1.2)
crawl_id: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
```

**Why This Matters:**
- If Firecrawl generates a `crawl_id` > 100 characters, it will be:
  - ✅ Stored successfully in `crawl_sessions.crawl_id` (255 char limit)
  - ❌ **TRUNCATED** or **REJECTED** in `operation_metrics.crawl_id` (100 char limit)
- This breaks the foreign key relationship
- Leads to orphaned operation metrics
- Causes aggregation queries to fail

**Firecrawl Crawl ID Format (observed):**
```
crawl_abc123def456  # Typical: ~20 chars
```

However, we should assume UUIDs or longer identifiers may be used in the future.

**Recommendation:**
Standardize on `String(255)` for ALL `crawl_id` columns:
```python
# CORRECTED: Use consistent length
crawl_id: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
```

This matches:
- `CrawlSession.crawl_id` (255)
- `OperationMetric.job_id` (100) - should also be increased to 255
- `OperationMetric.request_id` (100) - should also be increased to 255

**Performance Impact:** Negligible - modern PostgreSQL handles variable-length strings efficiently.

---

#### 3. **Missing Index on UNIQUE Column**

**Issue:** `CrawlSession.crawl_id` has a UNIQUE constraint but the plan explicitly adds `index=True`.

**Current Plan:**
```python
crawl_id: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
```

**Potential Problem:**
- SQLAlchemy's `unique=True` automatically creates a unique index
- Explicitly adding `index=True` may create a **second index** (redundant)
- Wastes disk space and slows down INSERTs

**Verification Needed:**
Check if Alembic autogenerate creates ONE or TWO indexes:
```bash
# After migration, check indexes
docker exec pulse_postgres psql -U firecrawl -d pulse_postgres -c "\\d webhook.crawl_sessions"
```

Expected (GOOD):
```
Indexes:
    "crawl_sessions_pkey" PRIMARY KEY, btree (id)
    "uq_crawl_sessions_crawl_id" UNIQUE CONSTRAINT, btree (crawl_id)
```

Problematic (BAD):
```
Indexes:
    "crawl_sessions_pkey" PRIMARY KEY, btree (id)
    "uq_crawl_sessions_crawl_id" UNIQUE CONSTRAINT, btree (crawl_id)
    "ix_webhook_crawl_sessions_crawl_id" btree (crawl_id)  # DUPLICATE!
```

**Recommendation:**
Remove explicit `index=True` since `unique=True` already creates an index:
```python
# CORRECTED: unique=True already creates index
crawl_id: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
```

---

### ⚠️ WARNING Issues

#### 4. **Overly Permissive Nullability on Aggregate Metrics**

**Issue:** All aggregate timing fields are nullable, even when they should have values.

**Current Plan:**
```python
total_chunking_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
total_embedding_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
total_qdrant_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
total_bm25_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
```

**Problem:**
- If a crawl completes with 10 pages, but `total_embedding_ms` is NULL:
  - Was it not calculated? (bug)
  - Did no pages get embedded? (business logic)
  - Did the aggregation query fail? (error)
- NULL is ambiguous and makes debugging harder

**Better Design:**
```python
# IMPROVED: Use 0.0 as default, reserve NULL for "not yet calculated"
total_chunking_ms: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
total_embedding_ms: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
total_qdrant_ms: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
total_bm25_ms: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
```

**Rationale:**
- `0.0` = "operation was attempted but took no time" (valid state)
- `NULL` = "operation was not yet calculated" (transitional state)
- For completed crawls, these should ALWAYS have numeric values (even if 0.0)

**Alternative:** Keep nullable but add CHECK constraints:
```python
# If status='completed', aggregates must not be NULL
__table_args__ = (
    {"schema": "webhook"},
    CheckConstraint(
        "(status != 'completed') OR (total_chunking_ms IS NOT NULL)",
        name="ck_completed_has_aggregates"
    )
)
```

**Recommendation:** Use `default=0.0` approach for simplicity.

---

#### 5. **Missing Rollback Tests**

**Issue:** No verification that migrations can be rolled back safely.

**Current Plan:**
```bash
# Only tests upgrade
uv run alembic upgrade head
```

**Missing:**
```bash
# Test rollback
uv run alembic downgrade -1
uv run alembic upgrade head
```

**Why This Matters:**
- Production rollbacks are critical when migrations fail
- Downgrade logic must be tested BEFORE deployment
- Data loss can occur if downgrade SQL is incorrect

**Recommendation:**
Add rollback test to verification checklist:
```bash
# Test upgrade
uv run alembic upgrade head

# Verify tables exist
docker exec pulse_postgres psql -U firecrawl -d pulse_postgres -c "\\dt webhook.*"

# Test rollback
uv run alembic downgrade -1

# Verify tables removed
docker exec pulse_postgres psql -U firecrawl -d pulse_postgres -c "\\dt webhook.*"

# Re-upgrade
uv run alembic upgrade head
```

---

## 2. Current Schema State

### Existing Tables in `webhook` Schema

```sql
webhook.request_metrics
  - id (UUID, PK)
  - timestamp (timestamptz, indexed)
  - method, path, status_code (indexed)
  - duration_ms (float, indexed)
  - request_id (varchar(100), indexed, UNIQUE)
  - client_ip, user_agent, extra_metadata, created_at

webhook.operation_metrics
  - id (UUID, PK)
  - timestamp (timestamptz, indexed)
  - operation_type (varchar(50), indexed)
  - operation_name (varchar(100), indexed)
  - duration_ms (float, indexed)
  - success (boolean, indexed)
  - error_message (text)
  - request_id (varchar(100), indexed, FK -> request_metrics.request_id ON DELETE SET NULL)
  - job_id (varchar(100), indexed)
  - document_url (varchar(500), indexed)
  - extra_metadata (jsonb)
  - created_at (timestamptz)

webhook.change_events
  - id (int, PK)
  - watch_id (varchar(255), indexed)
  - watch_url (text)
  - detected_at (timestamptz, indexed)
  - diff_summary, snapshot_url, rescrape_job_id, rescrape_status
  - indexed_at (timestamptz)
  - metadata (jsonb)
  - created_at (timestamptz)
```

### Migration History

```
[base] -> 57f2f0e22bad (Add timing metrics tables)
       -> 20251109_100516 (Add webhook schema and migrate tables)
       -> 20251110_000000 (Add change_events table)
       -> 20251113_add_fk (Add foreign key constraints) [HEAD]
```

### Alembic Configuration

- **Schema:** Correctly configured to use `webhook` schema
- **Connection:** Uses `settings.database_url` from environment
- **Target Metadata:** `Base.metadata` from `domain.models`
- **Mode:** Async migrations with `asyncpg`

---

## 3. Schema Constraints Analysis

### Unique Constraints

#### ✅ Appropriate: `CrawlSession.crawl_id UNIQUE`

**Rationale:**
- Each Firecrawl crawl has exactly one lifecycle (started → completed/failed)
- Prevents duplicate tracking of the same crawl
- Allows efficient lookup: `SELECT * FROM crawl_sessions WHERE crawl_id = 'crawl_abc'`

**Edge Case to Consider:**
What if Firecrawl restarts a failed crawl with the same ID?
- **Current behavior:** INSERT will fail with UNIQUE constraint violation
- **Better behavior:** UPSERT on conflict (update status instead of insert)

**Recommendation:**
Add conflict handling in `_record_crawl_start`:
```python
# Use INSERT ... ON CONFLICT UPDATE for idempotency
async with get_db_context() as db:
    stmt = insert(CrawlSession).values(
        crawl_id=crawl_id,
        crawl_url=crawl_url,
        started_at=datetime.now(UTC),
        status="in_progress",
        extra_metadata=event.metadata,
    ).on_conflict_do_update(
        index_elements=["crawl_id"],
        set_=dict(
            started_at=datetime.now(UTC),
            status="in_progress",
            completed_at=None,  # Reset if restarted
            success=None,
        )
    )
    await db.execute(stmt)
    await db.commit()
```

---

### Foreign Keys

#### ✅ Existing: `operation_metrics.request_id -> request_metrics.request_id`

Already implemented in migration `20251113_add_fk`:
```python
op.create_foreign_key(
    "fk_operation_metrics_request_id",
    "operation_metrics",
    "request_metrics",
    ["request_id"],
    ["request_id"],
    source_schema="webhook",
    referent_schema="webhook",
    ondelete="SET NULL"
)
```

**Behavior:** Correct - if request is deleted, operation metrics keep their records but `request_id` is set to NULL.

---

#### ❌ Missing: `operation_metrics.crawl_id -> crawl_sessions.crawl_id`

**MUST BE ADDED** for data integrity.

**Proposed FK:**
```python
op.create_foreign_key(
    "fk_operation_metrics_crawl_id",
    "operation_metrics",
    "crawl_sessions",
    ["crawl_id"],
    ["crawl_id"],
    source_schema="webhook",
    referent_schema="webhook",
    ondelete="SET NULL"
)
```

**Cleanup Required Before FK Creation:**
```sql
-- Find orphaned records (if any exist from testing)
SELECT COUNT(*) FROM webhook.operation_metrics
WHERE crawl_id IS NOT NULL
AND NOT EXISTS (
    SELECT 1 FROM webhook.crawl_sessions
    WHERE crawl_sessions.crawl_id = operation_metrics.crawl_id
);

-- Clean up orphans before adding FK
UPDATE webhook.operation_metrics
SET crawl_id = NULL
WHERE crawl_id IS NOT NULL
AND NOT EXISTS (
    SELECT 1 FROM webhook.crawl_sessions
    WHERE crawl_sessions.crawl_id = operation_metrics.crawl_id
);
```

---

### Indexes Review

#### Current Indexes (operation_metrics)

```
ix_webhook_operation_metrics_timestamp
ix_webhook_operation_metrics_operation_type
ix_webhook_operation_metrics_operation_name
ix_webhook_operation_metrics_duration_ms
ix_webhook_operation_metrics_success
ix_webhook_operation_metrics_request_id
ix_webhook_operation_metrics_job_id
ix_webhook_operation_metrics_document_url
```

#### New Indexes (after migration)

```
# operation_metrics gains:
ix_webhook_operation_metrics_crawl_id  # NEW (needed for JOINs)

# crawl_sessions gains:
crawl_sessions_pkey (id)  # PRIMARY KEY
uq_crawl_sessions_crawl_id (crawl_id)  # UNIQUE (automatically indexed)
ix_webhook_crawl_sessions_started_at  # For ORDER BY started_at DESC
ix_webhook_crawl_sessions_status  # For WHERE status = 'completed'
```

#### ✅ Index Coverage Analysis

**Query Pattern 1:** List recent crawls
```sql
SELECT * FROM webhook.crawl_sessions
ORDER BY started_at DESC
LIMIT 10;
```
**Index Used:** `ix_webhook_crawl_sessions_started_at` ✅

**Query Pattern 2:** Get crawl by ID
```sql
SELECT * FROM webhook.crawl_sessions
WHERE crawl_id = 'crawl_abc123';
```
**Index Used:** `uq_crawl_sessions_crawl_id` ✅

**Query Pattern 3:** Aggregate operation metrics for crawl
```sql
SELECT operation_type, SUM(duration_ms)
FROM webhook.operation_metrics
WHERE crawl_id = 'crawl_abc123' AND success = true
GROUP BY operation_type;
```
**Index Used:** `ix_webhook_operation_metrics_crawl_id` ✅
**Composite Index Opportunity:** Consider `(crawl_id, success)` for filtering

**Query Pattern 4:** Filter by status
```sql
SELECT * FROM webhook.crawl_sessions
WHERE status = 'completed'
ORDER BY started_at DESC;
```
**Index Used:** `ix_webhook_crawl_sessions_status` + `ix_webhook_crawl_sessions_started_at`
**Optimization:** Consider composite index `(status, started_at)` for better performance

---

#### ⚠️ Missing Composite Indexes

**Recommendation: Add composite indexes for common query patterns**

```python
# In CrawlSession model
__table_args__ = (
    {"schema": "webhook"},
    Index("ix_crawl_sessions_status_started_at", "status", "started_at"),
)

# In OperationMetric model (add to Task 1.2)
__table_args__ = (
    {"schema": "webhook"},
    Index("ix_operation_metrics_crawl_success", "crawl_id", "success"),
)
```

**Why:**
- `(status, started_at)` covers: `WHERE status = X ORDER BY started_at DESC`
- `(crawl_id, success)` covers: `WHERE crawl_id = X AND success = true`
- Improves query performance by 2-10x on large datasets

---

### String Length Review

| Column | Current Length | Firecrawl ID Format | Recommendation |
|--------|----------------|---------------------|----------------|
| `CrawlSession.crawl_id` | 255 | ~20 chars | ✅ Keep 255 |
| `OperationMetric.crawl_id` | 100 | ~20 chars | ❌ Increase to 255 |
| `OperationMetric.job_id` | 100 | UUID (~36) | ⚠️ Increase to 255 |
| `OperationMetric.request_id` | 100 | UUID (~36) | ⚠️ Increase to 255 |
| `CrawlSession.crawl_url` | 500 | Variable | ✅ Adequate |
| `OperationMetric.document_url` | 500 | Variable | ✅ Adequate |

**Rationale:**
- UUIDs are 36 characters (fits in 100)
- Firecrawl may change ID format in the future
- Better to over-provision (255) than risk truncation
- Performance impact is negligible for varchar

---

## 4. Backwards Compatibility

### ✅ Can Old Code Continue Running?

**YES** - All new columns are nullable and have defaults:

```python
# New column in OperationMetric
crawl_id: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
# Default: NULL (safe for existing code)
```

**Existing code behavior:**
- `TimingContext` without `crawl_id` parameter → stores NULL in database ✅
- `IndexingService.index_document` without `crawl_id` → passes NULL to TimingContext ✅
- Queries not filtering by `crawl_id` → continue working normally ✅

**New code behavior:**
- `TimingContext` with `crawl_id` parameter → stores value in database ✅
- `IndexingService.index_document` with `crawl_id` → propagates to metrics ✅

**No breaking changes.**

---

### ⚠️ Will Existing Queries Break?

**MOSTLY SAFE** with one exception:

#### Safe Queries
```sql
-- Count metrics by type (no crawl_id filter)
SELECT operation_type, COUNT(*) FROM webhook.operation_metrics GROUP BY operation_type;
✅ Works (ignores crawl_id column)

-- List recent requests
SELECT * FROM webhook.request_metrics ORDER BY timestamp DESC LIMIT 10;
✅ Works (no schema changes to request_metrics)

-- Get operation metrics for a job
SELECT * FROM webhook.operation_metrics WHERE job_id = 'job_123';
✅ Works (job_id still exists and is indexed)
```

#### Potential Breaking Query
```sql
-- Aggregation that assumes all non-null crawl_id are valid
SELECT crawl_id, COUNT(*) FROM webhook.operation_metrics
WHERE crawl_id IS NOT NULL
GROUP BY crawl_id;
```

**Problem if no FK exists:**
- May include orphaned `crawl_id` values that don't exist in `crawl_sessions`
- JOIN queries will return unexpected results

**Fix:** Add the foreign key constraint as recommended.

---

### ✅ Are Defaults Appropriate?

**CrawlSession:**
```python
status: Mapped[str] = mapped_column(String(50), nullable=False, default="in_progress", index=True)
total_pages: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
pages_indexed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
pages_failed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
```
✅ Correct - new crawl starts as "in_progress" with 0 pages

**OperationMetric:**
```python
crawl_id: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
# No default specified = NULL
```
✅ Correct - operation metrics without crawl context store NULL

---

## 5. Performance Impact

### Insert Performance

#### New Indexes Impact
**Before migration:**
- `operation_metrics`: 8 indexes

**After migration:**
- `operation_metrics`: 9 indexes (+1 for `crawl_id`)
- `crawl_sessions`: 4 indexes (new table)

**Impact on INSERT:**
- Each additional index adds ~10-20% overhead to INSERT operations
- For high-throughput systems (>1000 inserts/sec), this is noticeable
- For typical webhook loads (<100 inserts/sec), impact is negligible

**Mitigation:**
- Current insert rate: ~10-50 metrics/sec (estimated from webhook load)
- Index overhead: ~1-2ms per insert
- **Acceptable** for current scale

---

#### JSONB Query Performance

**JSONB Columns:**
```python
extra_metadata: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
```

**Query Pattern:**
```sql
-- Extract metadata field
SELECT extra_metadata->>'url' FROM webhook.crawl_sessions;
```

**Performance:**
- JSONB is efficient for read-heavy workloads
- No index on `extra_metadata` (acceptable for occasional queries)
- If querying specific keys frequently, add GIN index:
  ```sql
  CREATE INDEX ix_crawl_sessions_metadata_gin ON webhook.crawl_sessions USING GIN (extra_metadata);
  ```

**Recommendation:** Monitor query performance and add GIN index only if needed.

---

### Query Performance

#### Aggregate Timing Queries

**Example from plan:**
```sql
SELECT operation_type, operation_name,
       COUNT(*) as count,
       SUM(duration_ms) as total_ms
FROM webhook.operation_metrics
WHERE crawl_id = 'crawl_abc123'
GROUP BY operation_type, operation_name
ORDER BY total_ms DESC;
```

**Performance:**
- Uses index: `ix_webhook_operation_metrics_crawl_id` ✅
- Filter: O(log N) index scan
- Aggregate: O(K) where K = matching rows (~10-1000 per crawl)
- **Estimated time:** <10ms for typical crawl (100 pages)

**Optimization Opportunity:**
Add composite index `(crawl_id, success)` to avoid scanning failed operations:
```python
Index("ix_operation_metrics_crawl_success", "crawl_id", "success")
```

---

#### JOIN Queries (After FK is added)

**Example:**
```sql
SELECT cs.crawl_id, cs.total_pages, om.operation_type, om.duration_ms
FROM webhook.crawl_sessions cs
JOIN webhook.operation_metrics om ON cs.crawl_id = om.crawl_id
WHERE cs.status = 'completed';
```

**Performance:**
- Uses index: `ix_crawl_sessions_status` for filter
- Uses index: `ix_operation_metrics_crawl_id` for JOIN
- **Estimated time:** <50ms for 10,000 operation_metrics rows

**Acceptable** for current scale.

---

### Index Size Estimation

**Current database size:**
```sql
SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename))
FROM pg_tables WHERE schemaname = 'webhook';
```

**Estimated growth:**
| Table | Rows (1 year) | Index Size | Total Size |
|-------|---------------|------------|------------|
| `crawl_sessions` | ~10,000 | ~1 MB | ~5 MB |
| `operation_metrics` (new index) | ~500,000 | ~15 MB | +15 MB |

**Storage impact:** Negligible (<20 MB for 1 year of data)

---

## 6. Alembic Configuration Review

### ✅ Schema Configuration

**File:** `apps/webhook/alembic/env.py`

```python
# Correctly configured
target_metadata = Base.metadata
config.set_main_option("sqlalchemy.url", str(settings.database_url))
```

**Verification:**
- All models in `domain.models` have `__table_args__ = {"schema": "webhook"}` ✅
- Alembic will correctly generate migrations in `webhook` schema ✅
- Rollback will correctly drop tables from `webhook` schema ✅

---

### ✅ Autogenerate Will Catch Changes

**Test:**
```bash
cd apps/webhook
uv run alembic revision --autogenerate -m "test_autogenerate"
```

**Expected Output:**
```
INFO  [alembic.autogenerate.compare] Detected added table 'webhook.crawl_sessions'
INFO  [alembic.autogenerate.compare] Detected added column 'webhook.operation_metrics.crawl_id'
```

**Verification Needed:** Run this test to ensure autogenerate works correctly.

---

## 7. Migration Risks Summary

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| **Missing FK constraint** | 🔴 CRITICAL | HIGH | Add FK in separate migration |
| **String length mismatch** | 🔴 CRITICAL | MEDIUM | Standardize on 255 chars |
| **Duplicate index on unique column** | 🟡 MEDIUM | LOW | Remove explicit `index=True` |
| **Overly nullable aggregates** | 🟡 MEDIUM | MEDIUM | Use `default=0.0` instead |
| **No rollback test** | 🟡 MEDIUM | HIGH | Add downgrade verification |
| **UNIQUE constraint prevents retries** | 🟢 LOW | LOW | Add UPSERT logic |
| **Insert performance degradation** | 🟢 LOW | LOW | Acceptable for current scale |

**Overall Risk:** ⚠️ MEDIUM-HIGH (due to missing FK and string length issues)

---

## 8. Recommendations

### 🔴 Critical (MUST FIX)

1. **Add Foreign Key Constraint**
   - Create migration: `add_crawl_session_foreign_key`
   - Cleanup orphaned records before adding FK
   - Use `ON DELETE SET NULL` for soft referential integrity

2. **Fix String Length Inconsistencies**
   - Change `OperationMetric.crawl_id` from `String(100)` to `String(255)`
   - Consider increasing `job_id` and `request_id` to 255 as well
   - Update Task 1.2 in the plan

### 🟡 Important (SHOULD FIX)

3. **Remove Duplicate Index**
   - Remove `index=True` from `CrawlSession.crawl_id` (unique constraint already indexes)
   - Verify only one index is created after migration

4. **Improve Aggregate Nullability**
   - Use `default=0.0` for aggregate timing fields
   - Or add CHECK constraint to enforce non-null on completed crawls

5. **Add Rollback Tests**
   - Test `alembic downgrade -1` before deployment
   - Verify tables are dropped cleanly
   - Re-upgrade and verify data integrity

6. **Add UPSERT Logic**
   - Use `INSERT ... ON CONFLICT UPDATE` in `_record_crawl_start`
   - Prevents duplicate key errors if Firecrawl restarts a crawl

### 🟢 Optional (NICE TO HAVE)

7. **Add Composite Indexes**
   - `(status, started_at)` on `crawl_sessions`
   - `(crawl_id, success)` on `operation_metrics`
   - Improves query performance by 2-10x

8. **Monitor JSONB Performance**
   - If querying `extra_metadata` frequently, add GIN index
   - Start without index, add only if needed

---

## 9. Corrected Migration Sequence

### Phase 1: Database Schema (CORRECTED)

#### Task 1.1: Create CrawlSession Model
```bash
cd apps/webhook
uv run alembic revision --autogenerate -m "add_crawl_sessions_table"
uv run alembic upgrade head
```

**Verify:**
```bash
docker exec pulse_postgres psql -U firecrawl -d pulse_postgres -c "\\d webhook.crawl_sessions"
```

---

#### Task 1.2: Add crawl_id to OperationMetric (CORRECTED)
```python
# CHANGE in domain/models.py:
crawl_id: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)  # 255 not 100
```

```bash
cd apps/webhook
uv run alembic revision --autogenerate -m "add_crawl_id_to_operation_metrics"
uv run alembic upgrade head
```

**Verify:**
```bash
docker exec pulse_postgres psql -U firecrawl -d pulse_postgres -c "\\d webhook.operation_metrics"
```

---

#### Task 1.3: Add Foreign Key Constraint (NEW TASK)
```bash
cd apps/webhook
uv run alembic revision -m "add_crawl_session_foreign_key"
```

**Manual Migration Content:**
```python
"""Add foreign key constraint for crawl_id

Revision ID: add_fk_crawl
Revises: <previous_revision>
Create Date: 2025-11-13
"""
from alembic import op
from sqlalchemy import text

revision = "add_fk_crawl"
down_revision = "<previous_revision>"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add foreign key constraint."""
    conn = op.get_bind()

    # Step 1: Clean up orphaned records
    print("Cleaning up orphaned operation_metrics records...")
    result = conn.execute(text("""
        UPDATE webhook.operation_metrics
        SET crawl_id = NULL
        WHERE crawl_id IS NOT NULL
        AND NOT EXISTS (
            SELECT 1
            FROM webhook.crawl_sessions
            WHERE crawl_sessions.crawl_id = operation_metrics.crawl_id
        )
    """))
    print(f"Cleaned up {result.rowcount} orphaned records")

    # Step 2: Add FK constraint
    op.create_foreign_key(
        "fk_operation_metrics_crawl_id",
        "operation_metrics",
        "crawl_sessions",
        ["crawl_id"],
        ["crawl_id"],
        source_schema="webhook",
        referent_schema="webhook",
        ondelete="SET NULL"
    )


def downgrade() -> None:
    """Remove foreign key constraint."""
    op.drop_constraint(
        "fk_operation_metrics_crawl_id",
        "operation_metrics",
        schema="webhook",
        type_="foreignkey"
    )
```

```bash
uv run alembic upgrade head
```

**Verify:**
```bash
docker exec pulse_postgres psql -U firecrawl -d pulse_postgres -c "\\d webhook.operation_metrics"
# Should show FK: fk_operation_metrics_crawl_id
```

---

#### Task 1.4: Test Rollback (NEW TASK)
```bash
# Test downgrade
uv run alembic downgrade -1
docker exec pulse_postgres psql -U firecrawl -d pulse_postgres -c "\\dt webhook.*"
# Should NOT show crawl_sessions or FK

# Re-upgrade
uv run alembic upgrade head
docker exec pulse_postgres psql -U firecrawl -d pulse_postgres -c "\\dt webhook.*"
# Should show everything again
```

---

## 10. Safe Rollback Strategy

### Rollback Order (REVERSE of upgrade)

```bash
# Rollback Task 1.3: Remove FK
uv run alembic downgrade -1
# Drops: fk_operation_metrics_crawl_id

# Rollback Task 1.2: Remove crawl_id column
uv run alembic downgrade -1
# Drops: operation_metrics.crawl_id (data loss!)

# Rollback Task 1.1: Remove CrawlSession table
uv run alembic downgrade -1
# Drops: crawl_sessions table (data loss!)
```

### ⚠️ Data Loss Warning

**Downgrading Task 1.2 will DELETE all crawl_id data in operation_metrics.**

**Mitigation:**
1. Backup database before deployment:
   ```bash
   docker exec pulse_postgres pg_dump -U firecrawl pulse_postgres > backup_$(date +%Y%m%d_%H%M%S).sql
   ```

2. Consider keeping column even on rollback (safer):
   ```python
   def downgrade() -> None:
       """Downgrade schema - KEEP crawl_id column for safety."""
       # DON'T drop column - just remove FK in previous migration
       pass
   ```

---

## 11. Production Deployment Checklist

### Pre-Deployment

- [ ] Review this safety analysis
- [ ] Fix critical issues (FK, string lengths)
- [ ] Test migrations on staging database
- [ ] Test rollback on staging database
- [ ] Backup production database
- [ ] Schedule maintenance window (if needed)

### Deployment

- [ ] Stop webhook worker (to prevent writes during migration)
- [ ] Run migrations: `uv run alembic upgrade head`
- [ ] Verify tables created: `\dt webhook.*`
- [ ] Verify indexes created: `\d webhook.crawl_sessions`
- [ ] Verify FK constraints: `\d webhook.operation_metrics`
- [ ] Start webhook worker
- [ ] Monitor logs for errors

### Post-Deployment

- [ ] Run manual test crawl
- [ ] Verify `crawl_sessions` record created
- [ ] Verify `operation_metrics.crawl_id` populated
- [ ] Query metrics API: `GET /api/metrics/crawls/{crawl_id}`
- [ ] Monitor database performance (pg_stat_statements)
- [ ] Monitor application metrics (timing, errors)

### Rollback Plan (If Needed)

- [ ] Stop webhook worker
- [ ] Run: `uv run alembic downgrade <target_revision>`
- [ ] Verify tables removed
- [ ] Restore from backup if needed
- [ ] Start webhook worker
- [ ] Monitor for errors

---

## 12. Success Criteria

After migration, verify these SQL queries work correctly:

```sql
-- 1. Crawl session exists
SELECT crawl_id, status, total_pages FROM webhook.crawl_sessions
WHERE crawl_id = '<test_crawl_id>';

-- 2. Operation metrics have crawl_id
SELECT COUNT(*) FROM webhook.operation_metrics
WHERE crawl_id = '<test_crawl_id>';

-- 3. Foreign key enforced
SELECT om.crawl_id, cs.crawl_id
FROM webhook.operation_metrics om
LEFT JOIN webhook.crawl_sessions cs ON om.crawl_id = cs.crawl_id
WHERE om.crawl_id IS NOT NULL;
-- Should have NO rows with NULL cs.crawl_id

-- 4. Aggregation works
SELECT
    crawl_id,
    total_pages,
    total_embedding_ms,
    total_qdrant_ms,
    duration_ms
FROM webhook.crawl_sessions
WHERE crawl_id = '<test_crawl_id>';

-- 5. Index usage
EXPLAIN ANALYZE
SELECT * FROM webhook.crawl_sessions WHERE crawl_id = '<test_crawl_id>';
-- Should use Index Scan on uq_crawl_sessions_crawl_id
```

---

## Conclusion

The migration plan is **mostly sound** but requires **critical fixes** before production deployment:

### ✅ Good Aspects
- Zero-downtime design (nullable columns)
- Proper indexing strategy
- Backward compatible
- Correct Alembic configuration

### ❌ Must Fix Before Deployment
1. **Add foreign key constraint** (data integrity)
2. **Fix string length inconsistencies** (prevent truncation)
3. **Test rollback** (production safety)

### 🟡 Recommended Improvements
4. Remove duplicate index on unique column
5. Use `default=0.0` for aggregate metrics
6. Add UPSERT logic for idempotency
7. Add composite indexes for performance

**Estimated effort to fix issues:** 2-4 hours

**Recommendation:** **DO NOT DEPLOY** until critical issues are addressed. The foreign key constraint is essential for data integrity, and the string length mismatch will cause data loss.

---

## Appendix: Migration Testing Script

```bash
#!/bin/bash
# migration-test.sh - Test migration safety

set -e

echo "=== Starting Migration Safety Test ==="

# 1. Backup current database
echo "[1/8] Creating backup..."
docker exec pulse_postgres pg_dump -U firecrawl pulse_postgres > backup_test_$(date +%Y%m%d_%H%M%S).sql

# 2. Check current state
echo "[2/8] Checking current schema..."
docker exec pulse_postgres psql -U firecrawl -d pulse_postgres -c "\\dt webhook.*"

# 3. Run migrations
echo "[3/8] Running migrations..."
cd apps/webhook
uv run alembic upgrade head

# 4. Verify tables created
echo "[4/8] Verifying tables..."
docker exec pulse_postgres psql -U firecrawl -d pulse_postgres -c "\\d webhook.crawl_sessions"
docker exec pulse_postgres psql -U firecrawl -d pulse_postgres -c "\\d webhook.operation_metrics"

# 5. Test rollback
echo "[5/8] Testing rollback..."
uv run alembic downgrade -1
docker exec pulse_postgres psql -U firecrawl -d pulse_postgres -c "\\dt webhook.*"

# 6. Re-upgrade
echo "[6/8] Re-upgrading..."
uv run alembic upgrade head

# 7. Insert test data
echo "[7/8] Inserting test data..."
docker exec pulse_postgres psql -U firecrawl -d pulse_postgres <<EOF
INSERT INTO webhook.crawl_sessions (id, crawl_id, crawl_url, started_at, status)
VALUES (gen_random_uuid(), 'test_crawl_123', 'https://example.com', NOW(), 'in_progress');

INSERT INTO webhook.operation_metrics (id, timestamp, operation_type, operation_name, duration_ms, success, crawl_id)
VALUES (gen_random_uuid(), NOW(), 'chunking', 'chunk_text', 100.0, true, 'test_crawl_123');
EOF

# 8. Verify FK constraint
echo "[8/8] Verifying FK constraint..."
docker exec pulse_postgres psql -U firecrawl -d pulse_postgres -c "SELECT om.crawl_id, cs.crawl_id FROM webhook.operation_metrics om JOIN webhook.crawl_sessions cs ON om.crawl_id = cs.crawl_id WHERE om.crawl_id = 'test_crawl_123';"

echo "=== Migration Safety Test PASSED ==="
```

**Usage:**
```bash
chmod +x migration-test.sh
./migration-test.sh
```
