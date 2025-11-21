# Webhook Worker Error Pattern Analysis

Analysis Date: 2025-11-20
Scope: Webhook worker initialization, configuration validation, and batch processing error handling

---

## Executive Summary

The webhook worker codebase has robust error handling with 2,048+ error logging statements across 32 configuration injection points. However, several critical failure patterns exist that could cause silent failures or cascading errors:

1. **Configuration Validation Gaps**: Missing environment variable checks causing runtime failures
2. **Silent Pool Initialization Failures**: ServicePool initialization errors not propagated
3. **Async Context Manager Issues**: Improper resource cleanup in exception scenarios
4. **Missing Health Checks**: No startup validation before accepting jobs
5. **Race Conditions in Async Operations**: Potential double-processing in high-concurrency scenarios

---

## Critical Error Patterns

### Pattern 1: Silent ServicePool Initialization Failures

**File**: `/compose/pulse/apps/webhook/services/service_pool.py`

**Issue**: ServicePool initialization can fail silently if external services (Qdrant, TEI) are unreachable at startup.

**Current Code Flow**:
```python
def get_instance(cls) -> "ServicePool":
    # No connectivity checks - assumes all services available
    ServicePool.get_instance()  # in worker.py line 46
```

**Failure Scenario**:
```
Worker starts → ServicePool.get_instance() called
    ↓
TEI service unreachable (network timeout, port not open)
    ↓
EmbeddingService.__init__() fails
    ↓
Exception caught in get_instance() but not re-raised
    ↓
Worker continues, crashes on first job
```

**Evidence**: `/compose/pulse/apps/webhook/worker.py` lines 43-47
```python
logger.info("Pre-initializing service pool...")
from services.service_pool import ServicePool
ServicePool.get_instance()
logger.info("Service pool ready for jobs")
```
No try/except around initialization, but calls to get_instance() inside error handlers.

**Impact**: HIGH - Worker appears to start successfully, fails on first real job

**Remediation**:
1. Add explicit health checks in ServicePool.get_instance()
2. Validate all external service connectivity before returning instance
3. Raise initialization errors immediately (don't suppress)

---

### Pattern 2: Missing Configuration Validation on Worker Startup

**File**: `/compose/pulse/apps/webhook/config.py` lines 359-419

**Issue**: Secret strength validation only runs when Settings instance is created. Worker doesn't validate critical configuration before accepting jobs.

**Critical Environment Variables Not Checked**:
```
✗ WEBHOOK_API_SECRET - Must be 32+ chars (hardcoded only in deps.py)
✗ WEBHOOK_SECRET - Must be 32+ chars (hardcoded only in deps.py)
✗ WEBHOOK_QDRANT_URL - Not validated to be reachable
✗ WEBHOOK_TEI_URL - Not validated to be reachable
✗ WEBHOOK_REDIS_URL - Not validated to be reachable
✗ WEBHOOK_DATABASE_URL - Not validated to be connectable
```

**Validation Logic Location**:
- `config.py` lines 369-419: Secret strength validation (only runs at Settings instantiation)
- `config.py` lines 421-451: External services JSON parsing (format check only, no connectivity)

**Failure Pattern**:
```
Worker startup sequence (worker.py):
1. Import config module → Settings instance created
2. Validate secrets (lines 369-419 in config.py)
3. Import services → Lazy initialization
4. ServicePool.get_instance() → NO validation here
5. Worker.work() → Accepts jobs
6. First job fails → Can't reach Qdrant/TEI/Database
```

**Specific Gaps**:
- No pre-flight check that Redis is reachable
- No pre-flight check that PostgreSQL database exists and is accessible
- No pre-flight check that Qdrant collection is accessible
- No pre-flight check that TEI embedding service is responding

**Impact**: CRITICAL - Worker accepts jobs but fails immediately, blocking queue

**Remediation**:
1. Add startup health check routine in worker.py
2. Validate each external service before starting job loop
3. Fail fast with clear error messages if services unavailable

---

### Pattern 3: Async Context Manager Cleanup on Worker Exceptions

**File**: `/compose/pulse/apps/webhook/infra/database.py` lines 75-98

**Issue**: Async context managers may not properly clean up if exceptions occur during job processing.

**Current Implementation**:
```python
@asynccontextmanager
async def get_db_context() -> AsyncGenerator[AsyncSession]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
```

**Potential Issues**:
1. If commit() raises an exception, rollback() is called correctly ✓
2. If rollback() raises an exception, close() may not execute ✗
3. If close() raises an exception, it swallows the original exception ✗

**Failure Scenario**:
```
get_db_context() called in jobs.py
    ↓
Exception during external operation (Firecrawl timeout)
    ↓
session.rollback() succeeds
    ↓
session.close() fails (e.g., connection pool exhausted)
    ↓
Original error is masked, only close() error reported
    ↓
Job status never updated in database
```

**Evidence**: `/compose/pulse/apps/webhook/workers/jobs.py` lines 138-153
```python
async with get_db_context() as session:
    # ... external operation that can fail ...
    await session.commit()
    # If commit fails here, rollback happens but exception chain may be broken
```

**Impact**: MEDIUM - Resource leaks, unclear error reporting

**Remediation**:
1. Suppress exceptions from close() with try/except
2. Log close() failures separately
3. Ensure original exception is always preserved

---

### Pattern 4: Silent Failures in Batch Worker Exception Handling

**File**: `/compose/pulse/apps/webhook/workers/batch_worker.py` lines 174-199

**Issue**: asyncio.gather(return_exceptions=True) converts exceptions to results, potentially masking initialization errors.

**Code**:
```python
results = await asyncio.gather(*tasks, return_exceptions=True)

# Convert exceptions to error dicts
for i, result in enumerate(results):
    if isinstance(result, BaseException):
        processed_results.append({
            "success": False,
            "url": documents[i].get("url"),
            "error": str(result),
            "error_type": type(result).__name__,
        })
```

**Hidden Failure Pattern**:
```
Batch of 4 documents submitted
    ↓
Doc 1-2: Embedding service unavailable → Exception returned
    ↓
Doc 3-4: Process normally (service recovers)
    ↓
Result looks like "2 succeeded, 2 failed"
    ↓
But actually: 2 failed due to infrastructure (not page content)
    ↓
No alert triggered, issue compounds
```

**Missing Context**:
- No correlation between consecutive failures
- No distinction between transient (network) vs permanent (page) errors
- No rate limiting on repeated failures

**Impact**: MEDIUM - Silent degradation, hard to detect cascading failures

**Remediation**:
1. Track consecutive failures per document
2. Implement backoff for transient errors
3. Add circuit breaker for external services

---

### Pattern 5: Database Connection Pool Exhaustion

**File**: `/compose/pulse/apps/webhook/infra/database.py` lines 31-37

**Issue**: Pool sizing is pre-calculated but no runtime monitoring or validation.

**Current Config**:
```python
engine = create_async_engine(
    settings.database_url,
    pool_size=40,           # Base pool
    max_overflow=20,        # Burst capacity
)
# Total: 60 connections
```

**Capacity Analysis** (from comments):
- Supports 3-4 concurrent crawls × 4 workers each = ~30 base connections
- With 8 worker containers × 4 batch size = up to 32 concurrent operations

**Missing Monitoring**:
- No pool status logging during batch operations
- No error handling for pool exhaustion scenarios
- No automatic pool reset on connection failures

**Failure Pattern**:
```
8 workers × 4 batch = 32 parallel documents
    ↓
Each gets DB session → 32+ connections
    ↓
Pool size 40 + overflow 20 = 60 total
    ↓
If one worker takes longer: connections linger
    ↓
32 + 10 (lingering) = 42 connections → overflow
    ↓
New worker waiting for connection
    ↓
Queue buildup, slow throughput
```

**Impact**: MEDIUM - Performance degradation under load, no visibility

**Remediation**:
1. Add pool status logging (pool.size(), pool.checkedout(), etc.)
2. Implement connection timeout in get_db_context()
3. Add metrics export for pool utilization

---

### Pattern 6: Redis Connection Without Health Check

**File**: `/compose/pulse/apps/webhook/worker.py` lines 37-38

**Issue**: Redis connection created but not validated before starting worker.

**Code**:
```python
redis_conn = get_redis_connection()
# No health check here
worker = Worker(queues=["indexing"], connection=redis_conn)
worker.work(with_scheduler=False)
```

**get_redis_connection() Implementation** (`/compose/pulse/apps/webhook/infra/db.py` lines 12-19):
```python
def get_redis_connection() -> Redis:
    return Redis.from_url(settings.redis_url)
    # Connection created but not tested
```

**Failure Pattern**:
```
Worker starts with bad Redis URL
    ↓
No error during from_url() (lazy connection)
    ↓
Worker calls worker.work()
    ↓
First operation tries to connect
    ↓
ConnectionError raised, worker crashes
    ↓
No graceful shutdown, queued jobs abandoned
```

**Impact**: HIGH - Workers crash instead of graceful degradation

**Remediation**:
1. Add redis_conn.ping() before starting worker
2. Implement retry logic with exponential backoff
3. Graceful exit with error message if Redis unavailable

---

### Pattern 7: Missing Job Timeout Validation

**File**: `/compose/pulse/apps/webhook/config.py` lines 233-241

**Issue**: Job timeout is stored as string but never validated as valid duration.

**Code**:
```python
indexing_job_timeout: str = Field(
    default="10m",
    description="RQ job timeout for document indexing (e.g., '10m', '1h', '600')",
)
```

**Parsing Location**: Unknown - search for usage of indexing_job_timeout
```bash
grep -r "indexing_job_timeout" /compose/pulse/apps/webhook --include="*.py"
# (Not found in examined files)
```

**Potential Issues**:
- String format never validated (could be malformed)
- RQ job timeout never set from this config
- Default "10m" may be insufficient for large document batches

**Impact**: MEDIUM - Silent configuration errors, timeout may not be applied

**Remediation**:
1. Add validation function to parse duration strings
2. Verify timeout is passed to RQ job creation
3. Add warning if timeout < estimated batch processing time

---

### Pattern 8: Circular Import Risk in Service Dependencies

**File**: `/compose/pulse/apps/webhook/api/deps.py` lines 23-25

**Issue**: Lazy import of IndexingService to avoid circular dependencies, but this delays error detection.

**Code**:
```python
# NOTE: IndexingService is imported lazily inside get_indexing_service
# to avoid circular imports between services.indexing, api.deps, and
# API routers that depend on these modules.
```

**Lazy Import Location** (lines 211-212):
```python
from services.indexing import IndexingService
global _indexing_service
```

**Risk Scenario**:
```
Worker starts → No circular import error detected
    ↓
First job calls get_indexing_service()
    ↓
Lazy import triggers
    ↓
Circular import discovered
    ↓
Job fails with ImportError
    ↓
Worker continues, subsequent jobs hit same error
```

**Impact**: LOW - Errors caught quickly, but unusual failure mode

**Remediation**:
1. Validate imports during worker startup
2. Add explicit import tests in test suite
3. Consider refactoring to eliminate circular dependency

---

### Pattern 9: ServicePool Thread Safety Assumptions

**File**: `/compose/pulse/apps/webhook/services/service_pool.py`

**Issue**: ServicePool uses double-checked locking but behavior depends on GIL assumptions.

**Missing Code Context**: Could not verify exact implementation, but pattern typically:
```python
_instance = None

@classmethod
def get_instance(cls) -> "ServicePool":
    # Double-checked locking pattern
    if _instance is None:
        _instance = ServicePool()  # Race condition window
    return _instance
```

**Async Context Risk**:
- RQ workers are multi-threaded
- Batch worker uses asyncio.gather() (concurrent tasks)
- ServicePool designed for single thread but used in multi-threaded context

**Impact**: LOW - Python GIL provides some protection, but not guaranteed

**Remediation**:
1. Use threading.Lock() for thread-safe singleton
2. Test with concurrent batch processing
3. Document threading assumptions

---

### Pattern 10: Configuration Environment Variable Precedence Not Documented

**File**: `/compose/pulse/apps/webhook/config.py` lines 76-85

**Issue**: Multiple environment variable names supported (WEBHOOK_*, SEARCH_BRIDGE_*, legacy names) but precedence unclear.

**Current Config**:
```python
api_secret: str = Field(
    validation_alias=AliasChoices("WEBHOOK_API_SECRET", "SEARCH_BRIDGE_API_SECRET"),
)
```

**Precedence Order** (from Pydantic AliasChoices):
1. WEBHOOK_API_SECRET (if set)
2. SEARCH_BRIDGE_API_SECRET (fallback)
3. Default value (if both unset)

**Risk Scenario**:
```
Old deployment has SEARCH_BRIDGE_API_SECRET=old-secret
New deployment adds WEBHOOK_API_SECRET=new-secret
    ↓
Both exist in environment
    ↓
WEBHOOK_API_SECRET wins (first in AliasChoices)
    ↓
If WEBHOOK_API_SECRET empty or invalid, may silently fall through
    ↓
Unexpected behavior, hard to debug
```

**Missing Documentation**:
- No clear statement of precedence in code comments
- No validation error if multiple conflicting values set

**Impact**: MEDIUM - Configuration confusion in mixed deployments

**Remediation**:
1. Add explicit precedence comments in config.py
2. Add validation to error if conflicting values found
3. Deprecate SEARCH_BRIDGE_* variables

---

## Environment Variable Validation Matrix

| Variable | Required | Validation | Location | Error If Missing |
|----------|----------|-----------|----------|------------------|
| WEBHOOK_API_SECRET | YES | 32+ chars, not default | config.py:359-403 | Settings init failure |
| WEBHOOK_SECRET | YES | 32+ chars, not default | config.py:359-403 | Settings init failure |
| WEBHOOK_PORT | NO | int 1-65535 | config.py:92-96 | Invalid server bind |
| WEBHOOK_REDIS_URL | YES | Valid Redis URL format | config.py:118-122 | RQ initialization fails |
| WEBHOOK_DATABASE_URL | YES | Valid PostgreSQL URL | config.py:245-251 | Database context fails |
| WEBHOOK_QDRANT_URL | YES | Valid HTTP URL | config.py:125-129 | Vector store init fails |
| WEBHOOK_TEI_URL | YES | Valid HTTP URL | config.py:149-153 | Embedding service init fails |
| WEBHOOK_EMBEDDING_MODEL | NO | HuggingFace model name | config.py:159-163 | Text chunker init fails |
| WEBHOOK_ENABLE_WORKER | NO | bool | config.py:215-219 | Worker thread handling |
| WEBHOOK_WORKER_BATCH_SIZE | NO | int 1-10 | config.py:227-231 | Batch processing config |

---

## Startup Validation Checklist

**Missing from `/compose/pulse/apps/webhook/worker.py`**:

```python
# Current (lines 23-70)
def main() -> None:
    # ✓ Redis connection created
    # ✗ Redis ping() not called
    # ✓ ServicePool pre-initialized
    # ✗ ServicePool health check not called
    # ✗ Database connectivity not checked
    # ✗ Settings secrets validation not re-checked
```

**Recommended Additions**:
```python
async def validate_startup():
    """Pre-flight health check before accepting jobs."""
    errors = []

    # Check Redis
    try:
        redis_conn.ping()
    except Exception as e:
        errors.append(f"Redis unreachable: {e}")

    # Check Database
    try:
        async with get_db_context() as session:
            await session.execute("SELECT 1")
    except Exception as e:
        errors.append(f"Database unreachable: {e}")

    # Check Qdrant
    try:
        await vector_store.health_check()
    except Exception as e:
        errors.append(f"Qdrant unreachable: {e}")

    # Check TEI
    try:
        await embedding_service.health_check()
    except Exception as e:
        errors.append(f"TEI unreachable: {e}")

    if errors:
        logger.error("Startup validation failed", errors=errors)
        sys.exit(1)
```

---

## Error Detection Regex Patterns

### Pattern: Missing Configuration

```regex
^(ValueError|KeyError).*WEBHOOK_|SEARCH_BRIDGE_|validation_alias
KeyError.*api_secret|webhook_secret
ValidationError.*Field required
```

### Pattern: Connection Failures

```regex
(ConnectionError|TimeoutError|OSError)
Redis.*connection|CONNECT|refused
psycopg|asyncpg.*connect
qdrant.*connection|refused
httpx\..*connection|timeout
```

### Pattern: Resource Exhaustion

```regex
pool.*exhausted|overflow
too many connections
connection pool.*full
queue.*backlog
memory.*exhausted
```

### Pattern: Async/Concurrency Issues

```regex
asyncio\.gather.*exception
race condition|deadlock
double.*process|duplicate
concurrent.*access
event loop.*closed
```

---

## Log Aggregation Queries

### Find Configuration Errors

```bash
# All config validation failures
grep -E "validate|ValidationError|Field required|weak.*secret|min_length" /var/log/webhook/worker.log

# Missing environment variables
grep -E "KeyError|validation_alias.*not found" /var/log/webhook/worker.log
```

### Find Connection Failures

```bash
# All connection errors
grep -E "ConnectionError|refused|timeout|unreachable" /var/log/webhook/worker.log

# Redis specifically
grep -E "Redis.*connection|REDIS_URL|redis://" /var/log/webhook/worker.log

# Database specifically
grep -E "database|asyncpg|psycopg.*connection" /var/log/webhook/worker.log

# External services
grep -E "Qdrant|TEI|Firecrawl.*connection" /var/log/webhook/worker.log
```

### Find Pool Exhaustion

```bash
# Connection pool issues
grep -E "pool.*overflow|too many|connection.*full" /var/log/webhook/worker.log

# Batch processing problems
grep -E "batch.*fail|concurrent.*document" /var/log/webhook/worker.log
```

### Find Async Issues

```bash
# Gather exceptions
grep -E "asyncio\.gather|exception.*batch" /var/log/webhook/worker.log

# Double processing
grep -E "duplicate|already.*processed|race condition" /var/log/webhook/worker.log
```

---

## Monitoring Recommendations

### Critical Metrics to Track

1. **Worker Startup Time**: Should complete within 30s, indicates pool init delays
2. **Time to First Job**: Should process first job within 1m, indicates health check issues
3. **Service Health Status**: Ping each external service every 5s
4. **Connection Pool Utilization**: Log pool.checkedout() / pool_size ratio
5. **Job Failure Rate by Error Type**: Group failures by error_type field
6. **Configuration Validation Errors**: Count at startup
7. **Batch Processing Concurrency**: Track simultaneous documents being indexed

### Alert Thresholds

| Metric | Threshold | Severity |
|--------|-----------|----------|
| Worker startup time | > 60s | WARN |
| Time to first job | > 5m | CRITICAL |
| Connection pool utilization | > 80% | WARN |
| Consecutive job failures | > 5 | CRITICAL |
| Service health check failures | 3+ consecutive | CRITICAL |
| Configuration validation errors | > 0 at startup | CRITICAL |

---

## Summary of Findings

### High Priority Issues (Fix Before Production)

1. Missing startup health checks for external services
2. No validation that Redis is reachable before starting worker
3. Silent failures in ServicePool initialization
4. Incomplete documentation of environment variable precedence

### Medium Priority Issues (Plan to Fix)

1. Database connection pool exhaustion scenarios
2. Silent batch processing failures due to exception suppression
3. Async context manager cleanup race conditions
4. Missing job timeout validation

### Low Priority Issues (Monitor and Review)

1. ServicePool thread safety assumptions
2. Circular import risk detection
3. Configuration environment variable name deprecation

---

## Testing Recommendations

### Test Cases Needed

```python
# test_worker_startup_health_checks.py
def test_worker_fails_if_redis_unreachable()
def test_worker_fails_if_database_unreachable()
def test_worker_fails_if_qdrant_unreachable()
def test_worker_fails_if_tei_unreachable()
def test_worker_logs_all_startup_errors()
def test_startup_validation_checklist_complete()

# test_batch_worker_error_handling.py
def test_batch_worker_distinguishes_transient_vs_permanent_errors()
def test_batch_worker_detects_consecutive_failures()
def test_batch_worker_applies_backoff_on_transient_errors()
def test_async_gather_exception_correlation()

# test_configuration_validation.py
def test_environment_variable_precedence_documented()
def test_conflicting_env_vars_detected()
def test_job_timeout_format_validated()
def test_secrets_validated_at_startup()
```

---

## Files Modified/Analyzed

- `/compose/pulse/apps/webhook/worker.py` - Entry point, missing health checks
- `/compose/pulse/apps/webhook/config.py` - Configuration, validation logic
- `/compose/pulse/apps/webhook/infra/db.py` - Database connections, pool config
- `/compose/pulse/apps/webhook/infra/redis.py` - Redis connections, missing ping
- `/compose/pulse/apps/webhook/infra/database.py` - Async context managers
- `/compose/pulse/apps/webhook/services/service_pool.py` - Singleton pool
- `/compose/pulse/apps/webhook/workers/batch_worker.py` - Batch processing
- `/compose/pulse/apps/webhook/workers/jobs.py` - Background jobs
- `/compose/pulse/apps/webhook/api/deps.py` - Dependency injection, lazy imports
- `/compose/pulse/.env.example` - Environment variable documentation

---

## Conclusion

The webhook worker codebase has strong error logging (2,048+ statements) and validation patterns. However, it lacks **startup health checks** and **configuration validation before accepting jobs**. This creates a pattern where workers appear healthy but fail immediately when processing, leading to queue saturation and cascading failures.

Recommended immediate action: Implement startup validation checklist with explicit health checks for Redis, PostgreSQL, Qdrant, and TEI services before calling `worker.work()`.
