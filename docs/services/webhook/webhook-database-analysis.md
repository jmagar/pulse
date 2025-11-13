# Webhook Server Database Analysis

## Summary

The webhook server uses PostgreSQL with async SQLAlchemy 2.0+ for three tables in the `webhook` schema: `request_metrics`, `operation_metrics`, and `change_events`. The database architecture follows best practices with proper indexing, async session management, and Alembic migrations. However, there are critical scalability concerns around unbounded table growth, missing constraints, and no data retention strategy.

**Key Findings:**
- Well-structured async SQLAlchemy setup with connection pooling (20 base + 10 overflow)
- Comprehensive indexing on query patterns (timestamps, status codes, job IDs)
- No foreign key constraints between tables (potential orphaned records)
- No data retention/archival strategy (metrics tables will grow indefinitely)
- JSONB metadata columns lack validation at DB level
- Missing partitioning strategy for time-series data

## Database Schema

### Tables Overview

```
webhook schema (PostgreSQL)
├── request_metrics (UUID PK, request-level timing)
├── operation_metrics (UUID PK, operation-level timing)
└── change_events (Integer PK, changedetection.io events)
```

### Schema Diagram

```
┌─────────────────────────────────────────┐
│ request_metrics (webhook schema)        │
├─────────────────────────────────────────┤
│ id: UUID (PK)                           │
│ timestamp: TIMESTAMP WITH TZ (indexed)  │
│ method: VARCHAR(10) (indexed)           │
│ path: VARCHAR(500) (indexed)            │
│ status_code: INTEGER (indexed)          │
│ duration_ms: FLOAT (indexed)            │
│ request_id: VARCHAR(100) (indexed)      │
│ client_ip: VARCHAR(50)                  │
│ user_agent: VARCHAR(500)                │
│ extra_metadata: JSONB (nullable)        │
│ created_at: TIMESTAMP WITH TZ           │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ operation_metrics (webhook schema)      │
├─────────────────────────────────────────┤
│ id: UUID (PK)                           │
│ timestamp: TIMESTAMP WITH TZ (indexed)  │
│ operation_type: VARCHAR(50) (indexed)   │
│ operation_name: VARCHAR(100) (indexed)  │
│ duration_ms: FLOAT (indexed)            │
│ success: BOOLEAN (indexed)              │
│ error_message: TEXT (nullable)          │
│ request_id: VARCHAR(100) (indexed)      │
│ job_id: VARCHAR(100) (indexed)          │
│ document_url: VARCHAR(500) (indexed)    │
│ extra_metadata: JSONB (nullable)        │
│ created_at: TIMESTAMP WITH TZ           │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ change_events (webhook schema)          │
├─────────────────────────────────────────┤
│ id: INTEGER (PK, auto-increment)        │
│ watch_id: VARCHAR(255) (indexed)        │
│ watch_url: TEXT (NOT NULL)              │
│ detected_at: TIMESTAMP WITH TZ (indexed)│
│ diff_summary: TEXT (nullable)           │
│ snapshot_url: TEXT (nullable)           │
│ rescrape_job_id: VARCHAR(255) (nullable)│
│ rescrape_status: VARCHAR(50) (nullable) │
│ indexed_at: TIMESTAMP WITH TZ (nullable)│
│ extra_metadata: JSONB (nullable)        │ (column name: "metadata")
│ created_at: TIMESTAMP WITH TZ           │
└─────────────────────────────────────────┘

Relationships:
- request_metrics.request_id ─┬─> operation_metrics.request_id (logical, no FK)
                               └─> change_events.rescrape_job_id (via RQ job ID)
- operation_metrics.job_id ───────> change_events.rescrape_job_id (logical, no FK)
```

## Migration Management

### Alembic Configuration

**Files:**
- `/compose/pulse/apps/webhook/alembic.ini` - Alembic configuration
- `/compose/pulse/apps/webhook/alembic/env.py` - Migration environment setup
- `/compose/pulse/apps/webhook/alembic/versions/` - Migration scripts

**Key Configuration:**
```python
# alembic/env.py
config.set_main_option("sqlalchemy.url", str(settings.database_url))
target_metadata = Base.metadata

# Uses async engine with NullPool for migrations
connectable = async_engine_from_config(
    config.get_section(config.config_ini_section, {}),
    prefix="sqlalchemy.",
    poolclass=pool.NullPool,  # No connection pooling during migrations
)
```

### Migration History

**Migration Chain:**
1. `57f2f0e22bad` (2025-11-08) - Initial timing metrics tables in `public` schema
2. `20251109_100516` (2025-11-09) - Create `webhook` schema, move tables
3. `20251110_000000` (2025-11-10) - Add `change_events` table

**Strengths:**
- Linear migration history (no branches)
- Proper `upgrade()` and `downgrade()` functions
- Uses `server_default=sa.text("NOW()")` for timestamps
- Explicit schema specification in table definitions

**Weaknesses:**
- No data migration logic (only schema changes)
- Missing rollback safety checks (e.g., "does data exist before moving?")
- No migration tests to verify upgrade/downgrade work
- Alembic command not in Docker container PATH (manual invocation required)

### Migration Best Practices Adherence

| Practice | Status | Notes |
|----------|--------|-------|
| Version control migrations | ✅ Pass | All migrations tracked in git |
| Sequential naming | ✅ Pass | Uses timestamp prefixes |
| Idempotent operations | ✅ Pass | Uses `IF NOT EXISTS`, `IF EXISTS` |
| Downgrade scripts | ✅ Pass | All migrations have `downgrade()` |
| Transaction safety | ⚠️ Partial | DDL is transactional in PostgreSQL, but no explicit checks |
| Data migration logic | ❌ Fail | No data transformations, only schema |
| Rollback testing | ❌ Fail | No tests for downgrade paths |
| Production safeguards | ❌ Fail | No backup validation, no data loss checks |

## Data Integrity

### Constraints Analysis

**Implemented Constraints:**
- Primary Keys: All tables have PK (UUID or Integer)
- NOT NULL: Core fields are non-nullable (`watch_id`, `watch_url`, `method`, `path`, etc.)
- Server Defaults: Timestamps use `func.now()` or `NOW()`
- String Length Limits: VARCHARs have max lengths (10-500 chars)

**Missing Constraints:**

1. **No Foreign Keys:**
   - `operation_metrics.request_id` → `request_metrics.request_id` (logical FK missing)
   - `operation_metrics.job_id` → `change_events.rescrape_job_id` (logical FK missing)
   - **Impact:** Orphaned records possible if parent is deleted
   - **Mitigation:** Application-level referential integrity only

2. **No CHECK Constraints:**
   - `status_code` could be negative or > 599
   - `duration_ms` could be negative
   - `rescrape_status` not constrained to enum values (`queued`, `in_progress`, `completed`, `failed`)
   - **Impact:** Invalid data can be inserted
   - **Mitigation:** Pydantic validation at API layer only

3. **No UNIQUE Constraints:**
   - `change_events` allows duplicate `watch_id` + `detected_at` (could track same event twice)
   - **Impact:** Duplicate change events possible
   - **Mitigation:** Application logic prevents duplicates (not enforced at DB level)

4. **JSONB Metadata Validation:**
   - `extra_metadata` columns have no schema validation
   - **Impact:** Inconsistent JSON structures, hard to query
   - **Mitigation:** Application-level validation only

### Orphaned Record Prevention

**Current Risk Level:** MEDIUM

**Scenarios:**
1. Request metric deleted → operation metrics remain (orphaned `request_id` references)
2. Change event deleted → operation metrics remain (orphaned `job_id` references)
3. RQ job purged from Redis → `rescrape_job_id` points to non-existent job

**Recommended Actions:**
- Add `ON DELETE CASCADE` foreign keys (or `ON DELETE SET NULL` for soft references)
- Implement periodic cleanup job for orphaned records
- Add referential integrity checks to metrics queries

## Async SQLAlchemy Usage

### Session Management

**Implementation:** `/compose/pulse/apps/webhook/infra/database.py`

```python
# Connection Pool Configuration
engine = create_async_engine(
    settings.database_url,
    echo=False,  # Disable SQL query logging in prod
    pool_pre_ping=True,  # Verify connections before use (prevents stale connections)
    pool_size=20,  # Base pool size
    max_overflow=10,  # Additional connections when pool exhausted (total: 30)
)

# Session Factory
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,  # Prevent lazy-loading after commit
    autocommit=False,  # Explicit commits required
    autoflush=False,  # Manual flush control
)
```

**Session Patterns:**

1. **Dependency Injection (FastAPI routes):**
```python
async def get_db_session() -> AsyncGenerator[AsyncSession]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()  # Auto-commit on success
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
```

2. **Context Manager (Background jobs):**
```python
async with get_db_context() as db:
    db.add(metric)
    await db.commit()  # Explicit commit
```

**Strengths:**
- Proper exception handling with rollback
- Connection pool prevents connection exhaustion
- `pool_pre_ping` prevents stale connection errors
- `expire_on_commit=False` avoids lazy-loading issues

**Weaknesses:**
- Auto-commit in `get_db_session()` could hide transaction boundaries
- No connection pool monitoring/alerting
- No retry logic for transient database errors
- Pool size (30 max) may be too small for high concurrency

### Transaction Boundaries

**Analysis of Key Operations:**

1. **Request Metrics (middleware):** Single INSERT per request
2. **Operation Metrics (timing context):** Single INSERT per operation
3. **Change Events (webhook handler):** INSERT + UPDATE (2 transactions)

**Potential N+1 Issues:**
- `/api/metrics/operations` endpoint: No eager loading of relationships (but no relationships defined)
- Multiple individual INSERTs for metrics (not batched)

**Recommendation:** Batch INSERT operations when possible (e.g., bulk metrics writes)

## Query Patterns

### Current Indexes

**request_metrics:**
- `ix_request_metrics_timestamp` (B-tree)
- `ix_request_metrics_method` (B-tree)
- `ix_request_metrics_path` (B-tree)
- `ix_request_metrics_status_code` (B-tree)
- `ix_request_metrics_duration_ms` (B-tree)
- `ix_request_metrics_request_id` (B-tree)

**operation_metrics:**
- `ix_operation_metrics_timestamp` (B-tree)
- `ix_operation_metrics_operation_type` (B-tree)
- `ix_operation_metrics_operation_name` (B-tree)
- `ix_operation_metrics_duration_ms` (B-tree)
- `ix_operation_metrics_success` (B-tree)
- `ix_operation_metrics_request_id` (B-tree)
- `ix_operation_metrics_job_id` (B-tree)
- `ix_operation_metrics_document_url` (B-tree)

**change_events:**
- `idx_change_events_watch_id` (B-tree)
- `idx_change_events_detected_at` (B-tree)

### Query Performance Analysis

**Well-Indexed Queries:**
```sql
-- Time-range queries (indexed on timestamp)
SELECT * FROM webhook.request_metrics WHERE timestamp >= NOW() - INTERVAL '24 hours';

-- Status filtering (indexed on status_code)
SELECT * FROM webhook.request_metrics WHERE status_code >= 400;

-- Job correlation (indexed on job_id)
SELECT * FROM webhook.operation_metrics WHERE job_id = 'abc123';
```

**Potentially Slow Queries:**
```sql
-- Unindexed: client_ip, user_agent
SELECT * FROM webhook.request_metrics WHERE client_ip = '192.168.1.1';

-- JSONB queries (no GIN index)
SELECT * FROM webhook.change_events WHERE extra_metadata->>'change_event_id' = '123';

-- Full table scan for aggregations (no covering index)
SELECT AVG(duration_ms) FROM webhook.operation_metrics WHERE operation_type = 'embedding';
```

### Missing Indexes

| Table | Missing Index | Use Case | Impact |
|-------|--------------|----------|--------|
| `request_metrics` | `(timestamp DESC, duration_ms)` | Slow query analysis | Medium |
| `request_metrics` | GIN on `extra_metadata` | JSON queries | Low |
| `operation_metrics` | `(timestamp, operation_type, success)` | Composite for dashboards | High |
| `operation_metrics` | Partial index on `success = FALSE` | Error analysis | Medium |
| `change_events` | `(watch_id, detected_at DESC)` | Composite for watch history | Medium |
| `change_events` | `(rescrape_status)` | Status filtering | Low |

### Recommended Index Additions

```sql
-- Composite index for slow endpoint analysis
CREATE INDEX idx_request_metrics_slow_queries
ON webhook.request_metrics (timestamp DESC, duration_ms DESC)
WHERE duration_ms > 1000;

-- Partial index for failed operations
CREATE INDEX idx_operation_metrics_failures
ON webhook.operation_metrics (timestamp DESC, operation_type, error_message)
WHERE success = FALSE;

-- Composite for change event history per watch
CREATE INDEX idx_change_events_watch_history
ON webhook.change_events (watch_id, detected_at DESC);

-- GIN index for JSONB queries
CREATE INDEX idx_change_events_metadata_gin
ON webhook.change_events USING GIN (extra_metadata);
```

## Data Growth & Retention

### Growth Projections

**Assumptions:**
- 1000 requests/day → 365K request_metrics/year
- 5 operations/request → 1.8M operation_metrics/year
- 10 change events/day → 3.6K change_events/year

**Storage Estimates (1 year):**
- `request_metrics`: ~200 MB (UUID + timestamps + strings)
- `operation_metrics`: ~900 MB (UUID + JSONB metadata)
- `change_events`: ~20 MB (includes JSONB payloads)
- **Total:** ~1.1 GB/year (manageable, but grows linearly)

**At 10,000 requests/day:**
- `request_metrics`: 2 GB/year
- `operation_metrics`: 9 GB/year
- **Total:** ~11 GB/year (needs retention strategy)

### Current Retention Strategy

**Status:** ❌ NONE

**Risks:**
1. **Unbounded Growth:** Tables will grow indefinitely
2. **Query Performance:** Indexes degrade as table size increases
3. **Backup Size:** Larger backups, slower restore times
4. **Cost:** Disk space costs increase linearly

### Recommended Retention Strategies

**Option 1: Time-Based Purging (Simple)**
```sql
-- Monthly cron job to delete old metrics
DELETE FROM webhook.request_metrics WHERE created_at < NOW() - INTERVAL '90 days';
DELETE FROM webhook.operation_metrics WHERE created_at < NOW() - INTERVAL '90 days';
DELETE FROM webhook.change_events WHERE created_at < NOW() - INTERVAL '1 year';
```

**Option 2: Partitioning (Scalable)**
```sql
-- Convert to partitioned tables (requires migration)
CREATE TABLE webhook.request_metrics_partitioned (
    LIKE webhook.request_metrics INCLUDING ALL
) PARTITION BY RANGE (timestamp);

-- Create monthly partitions
CREATE TABLE webhook.request_metrics_2025_11
PARTITION OF webhook.request_metrics_partitioned
FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');

-- Auto-create partitions with pg_partman
-- Drop old partitions automatically
```

**Option 3: Archival to Cold Storage**
```sql
-- Archive old data to separate table
CREATE TABLE webhook.request_metrics_archive (LIKE webhook.request_metrics);
INSERT INTO webhook.request_metrics_archive
SELECT * FROM webhook.request_metrics WHERE created_at < NOW() - INTERVAL '180 days';
DELETE FROM webhook.request_metrics WHERE created_at < NOW() - INTERVAL '180 days';
```

**Recommended Approach:**
- **Short-term (0-3 months):** Time-based purging (Option 1)
- **Long-term (1+ year):** Partitioning (Option 2) + archival (Option 3)

### Monitoring & Alerting

**Recommended Metrics:**
```sql
-- Table sizes
SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename))
FROM pg_tables WHERE schemaname = 'webhook';

-- Row counts
SELECT 'request_metrics', COUNT(*) FROM webhook.request_metrics
UNION ALL
SELECT 'operation_metrics', COUNT(*) FROM webhook.operation_metrics
UNION ALL
SELECT 'change_events', COUNT(*) FROM webhook.change_events;

-- Index bloat
SELECT schemaname, tablename, indexname, pg_size_pretty(pg_relation_size(indexname::regclass))
FROM pg_indexes WHERE schemaname = 'webhook';
```

**Alert Thresholds:**
- Table size > 5 GB → Warning (consider partitioning)
- Table size > 20 GB → Critical (implement retention ASAP)
- Row count > 10M → Warning (query performance degradation)

## Files Using Database Sessions

**Key Files:**
- `/compose/pulse/apps/webhook/infra/database.py` - Session management, connection pool
- `/compose/pulse/apps/webhook/api/routers/webhook.py` - Change event INSERTs
- `/compose/pulse/apps/webhook/api/routers/metrics.py` - Metrics queries (read-heavy)
- `/compose/pulse/apps/webhook/api/middleware/timing.py` - Request metrics INSERTs
- `/compose/pulse/apps/webhook/utils/timing.py` - Operation metrics INSERTs
- `/compose/pulse/apps/webhook/workers/jobs.py` - Change event UPDATEs

## Scalability Concerns

### Critical Issues

1. **No Partitioning Strategy**
   - **Impact:** Degraded query performance as data grows
   - **Timeline:** Becomes critical at 10M+ rows (~3 years at 1K requests/day)
   - **Mitigation:** Implement time-based partitioning NOW (before data grows too large)

2. **Missing Foreign Keys**
   - **Impact:** Orphaned records, data integrity issues
   - **Timeline:** Immediate risk (already present)
   - **Mitigation:** Add foreign keys with `ON DELETE CASCADE` or periodic cleanup

3. **No Data Retention Policy**
   - **Impact:** Unbounded storage growth, increased backup/restore times
   - **Timeline:** Critical at ~1 year (depending on traffic)
   - **Mitigation:** Implement 90-day retention for metrics, 1-year for change events

4. **Connection Pool Exhaustion**
   - **Impact:** 30 max connections may be insufficient for high concurrency
   - **Timeline:** Risk at 100+ concurrent requests
   - **Mitigation:** Increase `pool_size` to 50, `max_overflow` to 20

### Query Optimization Opportunities

**High-Impact Optimizations:**
1. Add composite indexes for dashboard queries (operation_type + timestamp)
2. Create partial indexes for error analysis (success = FALSE)
3. Implement connection pool monitoring (track active/idle connections)
4. Batch INSERT operations (e.g., 10 metrics per transaction instead of 1)

**Medium-Impact Optimizations:**
1. Add GIN indexes for JSONB queries
2. Use covering indexes for aggregation queries
3. Implement query result caching (Redis) for /api/metrics endpoints
4. Optimize slow queries with EXPLAIN ANALYZE

## Next Steps

### Immediate Actions (Week 1)

1. **Add Foreign Keys:**
   ```sql
   ALTER TABLE webhook.operation_metrics
   ADD CONSTRAINT fk_operation_request
   FOREIGN KEY (request_id) REFERENCES webhook.request_metrics(request_id)
   ON DELETE SET NULL;
   ```

2. **Implement Retention Policy:**
   - Add scheduled job to purge metrics older than 90 days
   - Document retention policy in README

3. **Add Missing Indexes:**
   - Composite index for operation metrics dashboard
   - Partial index for failed operations

### Short-Term Actions (Month 1)

1. **Data Validation:**
   - Add CHECK constraints for `status_code`, `duration_ms`, `rescrape_status`
   - Add UNIQUE constraint for `change_events(watch_id, detected_at)`

2. **Monitoring:**
   - Implement table size monitoring
   - Add connection pool metrics to `/health` endpoint
   - Set up alerts for table growth thresholds

3. **Testing:**
   - Write migration rollback tests
   - Add integration tests for foreign key constraints
   - Test retention policy with production-like data

### Long-Term Actions (Quarter 1)

1. **Partitioning:**
   - Migrate `request_metrics` and `operation_metrics` to partitioned tables
   - Set up automated partition creation/deletion
   - Test partition pruning query performance

2. **Archival:**
   - Implement cold storage archival for metrics > 180 days
   - Set up automated archival job (monthly)
   - Document archival restore procedure

3. **Performance:**
   - Conduct EXPLAIN ANALYZE audit of all queries
   - Optimize slow queries with covering indexes
   - Implement query result caching for read-heavy endpoints

## Key Takeaways

**Strengths:**
- Modern async SQLAlchemy 2.0+ architecture
- Proper connection pooling and session management
- Comprehensive indexing on query patterns
- Clean migration history with rollback support

**Critical Gaps:**
- No data retention/archival strategy (unbounded growth)
- Missing foreign keys (orphaned record risk)
- No partitioning (scalability bottleneck)
- Lack of CHECK constraints (data validation at DB level)

**Recommended Priority:**
1. Implement 90-day retention policy (CRITICAL)
2. Add missing foreign keys (HIGH)
3. Add composite indexes for dashboards (MEDIUM)
4. Plan partitioning migration (MEDIUM)
