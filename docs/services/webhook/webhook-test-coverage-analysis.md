# Webhook Server Test Coverage Analysis

## Executive Summary

**Overall Assessment**: The webhook server has **good foundational test coverage** (275 tests across 48 test files) but exhibits **critical gaps** in security, error handling, and production-readiness scenarios. Test-to-source line ratio is approximately **1.09:1** (7,031 test lines vs 6,459 source lines), suggesting comprehensive unit coverage but potentially shallow assertions.

**Key Findings**:
- Strong unit test coverage for core business logic
- Weak integration test coverage for failure scenarios
- **ZERO security-focused tests** (no SQL injection, XSS, auth bypass tests)
- Missing performance/load tests before production
- Insufficient concurrency and race condition testing
- Over-reliance on mocks reducing test realism

**Recommendation**: Target **85%+ coverage** requires adding ~40-60 tests focused on edge cases, security, and failure modes.

---

## Coverage Summary by Module

### Well-Tested Modules (Estimated 80-95% Coverage)

| Module | Test File | Test Count | Notes |
|--------|-----------|------------|-------|
| `services/bm25_engine.py` | `test_bm25_engine.py` | 13 | Comprehensive tokenization, ranking tests |
| `services/search.py` | `test_search_orchestrator.py` | 11 | RRF fusion, hybrid search tested |
| `utils/url.py` | `test_url_normalization.py` | 22 | Extensive edge cases covered |
| `services/webhook_handlers.py` | `test_webhook_handlers.py` | 7 | All event types tested |
| `utils/text_processing.py` | `test_text_processing.py` | 9 | Chunking logic verified |
| `api/routers/webhook.py` | `test_webhook_routes.py` | 7 | HMAC verification, payloads |
| `config.py` | `test_config*.py` | 17 | Config validation comprehensive |

### Moderately Tested Modules (Estimated 60-80% Coverage)

| Module | Test File | Test Count | Notes |
|--------|-----------|------------|-------|
| `services/indexing.py` | `test_indexing_service.py` | 9 | Basic flow tested, missing failure modes |
| `services/embedding.py` | `test_embedding_service.py` | 10 | Happy path only, no TEI failures |
| `services/vector_store.py` | `test_vector_store.py` | 12 | Collection mgmt tested, missing Qdrant errors |
| `api/routers/metrics.py` | `test_metrics_api.py` | 4 | Basic queries tested, missing filters |
| `domain/models.py` | `test_models*.py` | 11 | ORM models tested, missing constraints |

### Poorly Tested Modules (Estimated <60% Coverage)

| Module | Test File | Test Count | Critical Gaps |
|--------|-----------|------------|---------------|
| `api/deps.py` | `test_api_dependencies.py` | 11 | **Missing: cleanup_services error handling, singleton edge cases** |
| `api/middleware/timing.py` | `test_timing_middleware.py` | 2 | **Missing: exception handling, DB storage failures** |
| `api/routers/health.py` | ❌ **None** | 0 | **Missing: all health check scenarios** |
| `api/routers/search.py` | ❌ **Partial** | ~3 (in integration) | **Missing: rate limit tests, filter validation, error responses** |
| `api/routers/indexing.py` | ❌ **None** | 0 | **Missing: deprecated /index endpoint, /test-index endpoint** |
| `workers/jobs.py` | `test_rescrape_job.py` | 3 | **Missing: Firecrawl API failures, indexing failures, DB errors** |
| `utils/logging.py` | ❌ **None** | 0 | **Missing: log level filtering, timestamp formatting edge cases** |
| `utils/time.py` | ❌ **None** | 0 | **Missing: timezone edge cases, ISO parsing errors** |
| `infra/rate_limit.py` | ❌ **None** | 0 | **Missing: rate limit enforcement, Redis failures** |
| `infra/redis.py` | ❌ **None** | 0 | **Missing: connection pool failures, reconnection logic** |

---

## Critical Untested Code Paths

### 1. Security Vulnerabilities (PRIORITY: CRITICAL)

**Issue**: ZERO security-focused tests across entire test suite.

**Missing Tests**:
- **SQL Injection**: No tests for malicious input in search queries, URL parameters
  - Test: `/api/search` with `query="'; DROP TABLE documents; --"`
  - Test: Malicious metadata in webhook payloads
- **HMAC Bypass**: Only happy path tested, missing timing attack scenarios
  - Test: `X-Signature` header with gradually incorrect bytes
  - Test: Signature reuse attacks (replay protection)
- **Authentication Bypass**: Missing tests for header manipulation
  - Test: `Authorization` header with null bytes, SQL, XSS
  - Test: Bearer token with invalid UTF-8 encoding
- **Rate Limit Bypass**: No tests for rate limiter effectiveness
  - Test: Distributed attacks from multiple IPs
  - Test: Redis failures causing rate limit disable
- **Path Traversal**: No tests for URL normalization exploits
  - Test: Document URLs with `../../../etc/passwd`
  - Test: URL encoding tricks (`%2e%2e%2f`)

**Affected Files**:
- `/compose/pulse/apps/webhook/api/deps.py` (L305-L398) - `verify_api_secret`, `verify_webhook_signature`
- `/compose/pulse/apps/webhook/api/routers/webhook.py` (L191-L286) - changedetection webhook
- `/compose/pulse/apps/webhook/infra/rate_limit.py` - entire file

### 2. Error Handling Gaps (PRIORITY: HIGH)

**Issue**: Tests primarily validate happy paths, not failure modes.

**Missing Scenarios**:

#### Database Failures
```python
# api/middleware/timing.py:140-153
# NOT TESTED: What happens when DB is unavailable?
async with get_db_context() as db:
    metric = RequestMetric(...)
    db.add(metric)
    await db.commit()  # <-- PostgreSQL connection lost
```

**Impact**: Requests fail with 500 errors instead of gracefully degrading.

**Required Tests**:
- `test_timing_middleware_db_unavailable_continues_request`
- `test_request_metric_storage_failure_logs_warning`

#### External Service Failures
```python
# workers/jobs.py:113-123
# NOT TESTED: Firecrawl API timeout/500 errors
async with httpx.AsyncClient(timeout=120.0) as client:
    response = await client.post(f"{firecrawl_url}/v2/scrape", ...)
    response.raise_for_status()  # <-- What if Firecrawl returns 503?
```

**Impact**: Rescrape jobs fail permanently instead of retrying.

**Required Tests**:
- `test_rescrape_job_firecrawl_timeout_retries`
- `test_rescrape_job_firecrawl_500_updates_status`
- `test_rescrape_job_indexing_failure_marks_event_failed`

#### Qdrant/TEI Unavailability
```python
# services/indexing.py (indexing flow)
# NOT TESTED: Qdrant collection creation failures
# NOT TESTED: TEI embedding service timeouts
# NOT TESTED: Partial index success (Qdrant succeeds, BM25 fails)
```

**Required Tests**:
- `test_index_document_qdrant_unavailable_graceful_degradation`
- `test_index_document_tei_timeout_retries_with_backoff`
- `test_index_document_partial_failure_records_error`

### 3. Concurrency Issues (PRIORITY: HIGH)

**Issue**: Only 1 test file mentions threading/concurrency (`test_service_pool.py`).

**Missing Tests**:

#### Race Conditions in BM25 Index
```python
# services/bm25_engine.py
# NOT TESTED: Concurrent updates to BM25 index from multiple workers
# NOT TESTED: Index corruption during parallel document additions
```

**Required Tests**:
- `test_bm25_concurrent_indexing_no_data_loss`
- `test_bm25_index_reload_during_search_no_corruption`

#### Database Transaction Conflicts
```python
# api/routers/webhook.py:256-258
# NOT TESTED: Two webhooks updating same ChangeEvent concurrently
change_event = ChangeEvent(...)
db.add(change_event)
await db.commit()  # <-- What if another worker commits first?
```

**Required Tests**:
- `test_changedetection_webhook_concurrent_updates_no_deadlock`
- `test_change_event_update_optimistic_locking`

#### Service Pool Singleton Safety
```python
# services/service_pool.py
# PARTIALLY TESTED: Only 7 tests, missing thread safety validation
class ServicePool:
    _instance = None  # <-- Thread-safe initialization?
```

**Required Tests**:
- `test_service_pool_thread_safe_initialization`
- `test_service_pool_concurrent_get_service_no_duplicate_creation`

### 4. Data Integrity (PRIORITY: MEDIUM)

**Issue**: Missing validation tests for data boundaries and constraints.

**Missing Tests**:

#### Markdown Processing Edge Cases
```python
# utils/text_processing.py
# NOT TESTED: Extremely large documents (>10MB)
# NOT TESTED: Binary data in markdown field
# NOT TESTED: Invalid UTF-8 sequences
```

**Required Tests**:
- `test_chunk_text_oversized_document_raises_error`
- `test_chunk_text_invalid_utf8_graceful_handling`
- `test_chunk_text_empty_markdown_returns_empty_list`

#### URL Validation
```python
# utils/url.py
# PARTIALLY TESTED: 22 tests, but missing protocol-less URLs
# NOT TESTED: URLs with fragments, query params, auth
```

**Required Tests**:
- `test_normalize_url_with_credentials_strips_auth`
- `test_normalize_url_international_domain_punycode`

#### Database Constraints
```python
# domain/models.py
# NOT TESTED: Foreign key violations
# NOT TESTED: Unique constraint violations (duplicate URLs)
# NOT TESTED: NULL constraint violations
```

**Required Tests**:
- `test_change_event_duplicate_watch_url_raises_integrity_error`
- `test_request_metric_null_path_raises_error`

---

## Test Quality Issues

### 1. Mock Overuse (Red Flag: Testing Mocks Instead of Behavior)

**Example from `test_api_dependencies.py`**:
```python
def test_get_text_chunker_singleton() -> None:
    with patch("app.api.dependencies.TextChunker") as mock_chunker:
        mock_instance = MagicMock()
        mock_chunker.return_value = mock_instance

        chunker1 = deps.get_text_chunker()
        chunker2 = deps.get_text_chunker()

        assert chunker1 is chunker2  # Testing mock, not real behavior
        mock_chunker.assert_called_once()
```

**Problem**: This test validates that the mock was called once, not that the singleton pattern actually works with real dependencies.

**Better Test**:
```python
def test_text_chunker_singleton_with_real_instance():
    """Test singleton behavior with actual TextChunker initialization."""
    # Use test mode to avoid loading HF models
    with patch("config.settings.test_mode", True):
        chunker1 = deps.get_text_chunker()
        chunker2 = deps.get_text_chunker()

        # Verify identity
        assert chunker1 is chunker2

        # Verify actual chunking works
        chunks = chunker1.chunk_text("test text")
        assert len(chunks) > 0
```

**Files with Heavy Mock Usage** (>50% of tests are mocked):
- `tests/unit/test_api_dependencies.py` (27 mocks in 11 tests)
- `tests/unit/test_webhook_routes.py` (17 mocks in 7 tests)
- `tests/unit/test_changedetection_client.py` (32 mocks in 8 tests)

### 2. Insufficient Assertions (Weak Validation)

**Example from `test_webhook_handlers.py`**:
```python
@pytest.mark.asyncio
async def test_handle_crawl_started_event(monkeypatch):
    logger_mock = MagicMock()
    monkeypatch.setattr(handlers, "logger", logger_mock)

    event = FirecrawlLifecycleEvent(...)
    result = await handlers.handle_firecrawl_event(event, MagicMock())

    logger_mock.info.assert_called()  # Only checks logger was called
    assert result["status"] == "acknowledged"  # Only checks status field
```

**Problem**: Test doesn't validate:
- What was logged (message content, context fields)
- Other result fields (event_type, timestamp, metadata)
- Side effects (database updates, queue state)

**Better Assertions**:
```python
# Validate specific log message
logger_mock.info.assert_called_once_with(
    "Lifecycle event received",
    event_type="crawl.started",
    event_id="crawl-2",
)

# Validate complete result structure
assert result == {
    "status": "acknowledged",
    "event_type": "crawl.started",
    "event_id": "crawl-2",
}
```

### 3. Missing Edge Case Tests

**Common Pattern**: Tests validate typical inputs but ignore boundary conditions.

**Examples**:

| Module | Missing Edge Cases |
|--------|-------------------|
| `utils/text_processing.py` | Empty string, whitespace-only, very long text (>1M chars) |
| `services/search.py` | Query with special chars (`\0`, emoji, RTL text) |
| `api/routers/webhook.py` | Payloads at size limits (10MB), malformed JSON |
| `utils/url.py` | URLs with unusual protocols (`data:`, `javascript:`), IDN domains |

### 4. Flaky Test Risk (Timing-Dependent)

**Potential Flaky Tests** (using `time.perf_counter()` without tolerances):
- `test_timing_middleware.py` - May fail on slow CI runners
- `test_changedetection_client.py` - HTTP timeout tests with hardcoded durations

**Recommendation**: Add tolerance ranges:
```python
# BAD
assert duration_ms == 100

# GOOD
assert 95 <= duration_ms <= 105  # 5% tolerance
```

---

## Missing Test Categories

### 1. Security Tests (0 tests → Need 15+)

**High-Priority Security Tests**:
1. `test_sql_injection_in_search_query_sanitized`
2. `test_hmac_signature_timing_attack_resistant`
3. `test_api_secret_brute_force_rate_limited`
4. `test_webhook_signature_reuse_rejected`
5. `test_malicious_url_path_traversal_blocked`
6. `test_xss_in_metadata_fields_escaped`
7. `test_authorization_header_null_byte_injection_rejected`
8. `test_changedetection_signature_validation_strict`
9. `test_rate_limit_enforced_per_ip`
10. `test_redis_failure_disables_rate_limiting_safely`
11. `test_large_payload_attack_rejected` (DoS protection)
12. `test_unicode_normalization_attack_blocked`
13. `test_webhook_replay_attack_detected`
14. `test_concurrent_auth_attempts_rate_limited`
15. `test_metadata_field_injection_sanitized`

### 2. Performance Tests (0 tests → Need 10+)

**Required Performance Tests**:
1. `test_search_query_latency_under_200ms` (p95)
2. `test_indexing_throughput_100_docs_per_minute`
3. `test_concurrent_webhook_processing_no_degradation`
4. `test_large_document_indexing_memory_bounded`
5. `test_bm25_search_scales_to_10k_documents`
6. `test_qdrant_batch_indexing_optimal_batch_size`
7. `test_database_connection_pool_under_load`
8. `test_redis_queue_backpressure_handling`
9. `test_metrics_collection_minimal_overhead`
10. `test_health_check_response_time_under_50ms`

### 3. Disaster Recovery Tests (0 tests → Need 8+)

**Required DR Tests**:
1. `test_database_reconnect_after_network_partition`
2. `test_qdrant_unavailable_graceful_degradation`
3. `test_redis_connection_loss_recovery`
4. `test_partial_index_corruption_recovery`
5. `test_worker_crash_during_indexing_rollback`
6. `test_changedetection_webhook_duplicate_processing_idempotent`
7. `test_firecrawl_api_circuit_breaker_prevents_cascade_failure`
8. `test_database_transaction_deadlock_retry`

### 4. Integration Tests (11 tests → Need 20+)

**Missing Integration Scenarios**:
1. `test_end_to_end_crawl_webhook_to_search_results`
2. `test_changedetection_webhook_triggers_rescrape_to_indexed`
3. `test_concurrent_indexing_and_search_consistency`
4. `test_auto_watch_creation_to_detection_to_rescrape`
5. `test_metrics_collection_across_all_endpoints`
6. `test_rate_limit_enforcement_in_production_config`
7. `test_database_migration_compatibility`
8. `test_multi_tenant_isolation` (if applicable)
9. `test_backup_restore_data_integrity`

---

## Recommended Tests to Add Before Production

### Phase 1: Critical Security (Week 1)

**Priority**: Block production deployment until complete.

1. ✅ **HMAC Signature Tests**
   - `test_webhook_signature_timing_attack_resistant`
   - `test_webhook_signature_reuse_attack_blocked`
   - `test_malformed_signature_header_rejected`

2. ✅ **Authentication Tests**
   - `test_api_secret_brute_force_rate_limited`
   - `test_bearer_token_extraction_secure`
   - `test_authorization_bypass_attempts_blocked`

3. ✅ **Input Validation Tests**
   - `test_sql_injection_search_query_sanitized`
   - `test_xss_metadata_fields_escaped`
   - `test_oversized_payload_rejected` (10MB+ payloads)

### Phase 2: Error Handling (Week 2)

**Priority**: Prevent production incidents.

1. ✅ **External Service Failures**
   - `test_firecrawl_timeout_retries_with_exponential_backoff`
   - `test_qdrant_unavailable_graceful_degradation`
   - `test_tei_service_failure_returns_error`
   - `test_database_connection_lost_recovers`

2. ✅ **Partial Failure Handling**
   - `test_indexing_qdrant_success_bm25_failure_partial_success`
   - `test_webhook_processing_some_docs_fail_continues`
   - `test_rescrape_job_network_error_updates_status`

3. ✅ **Resource Exhaustion**
   - `test_redis_connection_pool_exhaustion_waits`
   - `test_database_connection_pool_saturation_queues`
   - `test_worker_queue_backpressure_rejects_new_jobs`

### Phase 3: Production Readiness (Week 3)

**Priority**: Ensure operational stability.

1. ✅ **Health Checks**
   - `test_health_check_all_services_healthy`
   - `test_health_check_qdrant_down_returns_degraded`
   - `test_health_check_response_time_under_100ms`

2. ✅ **Metrics Endpoints**
   - `test_request_metrics_filters_applied_correctly`
   - `test_operation_metrics_aggregation_accurate`
   - `test_metrics_summary_calculation_correct`

3. ✅ **Rate Limiting**
   - `test_rate_limit_enforced_per_endpoint`
   - `test_rate_limit_redis_failure_disables_safely`
   - `test_rate_limit_distributed_load_consistent`

4. ✅ **Concurrency**
   - `test_concurrent_webhook_processing_no_deadlock`
   - `test_bm25_index_concurrent_updates_thread_safe`
   - `test_service_pool_singleton_thread_safe`

---

## Test Infrastructure Improvements

### 1. Add Coverage Reporting

**Current**: No coverage tracking configured in `pyproject.toml`.

**Add to `pyproject.toml`**:
```toml
[tool.coverage.run]
branch = true
source = ["api", "services", "workers", "infra", "utils", "domain"]
omit = [
    "tests/*",
    "alembic/*",
    "*/__init__.py",
]

[tool.coverage.report]
precision = 2
show_missing = true
skip_covered = false
fail_under = 85

[tool.coverage.html]
directory = ".cache/coverage/html"
```

**Run Coverage**:
```bash
pytest --cov --cov-report=html --cov-report=term-missing
```

### 2. Add Test Categories (Markers)

**Current**: Only `external` marker defined.

**Add to `pyproject.toml`**:
```toml
[tool.pytest.ini_options]
markers = [
    "external: requires live infrastructure (Redis, Qdrant, TEI)",
    "security: security-focused tests (auth, injection, XSS)",
    "integration: integration tests across multiple services",
    "performance: performance and load tests",
    "slow: tests that take >5 seconds",
]
```

**Usage**:
```bash
# Run only security tests
pytest -m security

# Skip slow tests in CI
pytest -m "not slow"

# Run unit tests only (exclude external + integration)
pytest -m "not external and not integration"
```

### 3. Add Fixture Improvements

**Issue**: `conftest.py` has extensive monkeypatching but limited reusable fixtures.

**Add Fixtures**:
```python
# tests/conftest.py

@pytest.fixture
def mock_firecrawl_api(httpx_mock):
    """Mock Firecrawl API responses."""
    httpx_mock.add_response(
        url="http://firecrawl:3002/v2/scrape",
        json={"success": True, "data": {"markdown": "# Test"}},
    )
    return httpx_mock

@pytest.fixture
def sample_change_event(db_session):
    """Create sample ChangeEvent in database."""
    event = ChangeEvent(
        watch_id="test-watch",
        watch_url="https://example.com",
        detected_at=datetime.now(UTC),
    )
    db_session.add(event)
    db_session.commit()
    return event

@pytest.fixture
def authenticated_client(client, api_secret):
    """Client with pre-configured auth headers."""
    client.headers["Authorization"] = f"Bearer {api_secret}"
    return client
```

### 4. Add Test Data Builders

**Issue**: Tests create data inline, leading to duplication.

**Add Builders** (`tests/utils/builders.py`):
```python
from dataclasses import dataclass
from datetime import UTC, datetime

@dataclass
class FirecrawlWebhookBuilder:
    """Builder for Firecrawl webhook payloads."""

    type: str = "crawl.page"
    id: str = "test-crawl"
    success: bool = True

    def with_page(self, url: str, markdown: str) -> "FirecrawlWebhookBuilder":
        self.data = [{"markdown": markdown, "metadata": {"url": url}}]
        return self

    def build(self) -> dict:
        return {
            "type": self.type,
            "id": self.id,
            "success": self.success,
            "data": getattr(self, "data", []),
        }

# Usage in tests
def test_webhook_processing():
    payload = (
        FirecrawlWebhookBuilder()
        .with_page("https://example.com", "# Test")
        .build()
    )
    response = client.post("/api/webhook/firecrawl", json=payload)
    assert response.status_code == 202
```

### 5. Add Performance Test Framework

**Add** (`tests/performance/conftest.py`):
```python
import pytest
import time
from statistics import mean, stdev

@pytest.fixture
def benchmark():
    """Simple benchmark fixture for timing tests."""
    def _benchmark(func, iterations=100):
        times = []
        for _ in range(iterations):
            start = time.perf_counter()
            func()
            times.append((time.perf_counter() - start) * 1000)

        return {
            "mean_ms": mean(times),
            "stdev_ms": stdev(times),
            "min_ms": min(times),
            "max_ms": max(times),
            "p95_ms": sorted(times)[int(0.95 * len(times))],
        }

    return _benchmark

# Usage
def test_search_performance(benchmark, client):
    result = benchmark(
        lambda: client.post("/api/search", json={"query": "test"}),
        iterations=100
    )
    assert result["p95_ms"] < 200  # p95 latency under 200ms
```

---

## Effort Estimation

### To Reach 85%+ Coverage

| Phase | Tests to Add | Estimated Hours | Priority |
|-------|--------------|-----------------|----------|
| **Phase 1: Security** | 15 tests | 24-32 hours | CRITICAL |
| **Phase 2: Error Handling** | 20 tests | 32-40 hours | HIGH |
| **Phase 3: Production Readiness** | 25 tests | 40-48 hours | HIGH |
| **Phase 4: Performance** | 10 tests | 16-24 hours | MEDIUM |
| **Phase 5: Integration** | 10 tests | 20-28 hours | MEDIUM |
| **Infrastructure Improvements** | - | 8-12 hours | LOW |
| **TOTAL** | **80 tests** | **140-184 hours** | (3.5-4.5 weeks) |

### Quick Wins (Can Add in 1-2 Days)

1. **Health Check Tests** (4 tests, 2 hours)
   - `test_health_check_happy_path`
   - `test_health_check_redis_down`
   - `test_health_check_qdrant_down`
   - `test_health_check_tei_down`

2. **Metrics API Tests** (6 tests, 4 hours)
   - `test_request_metrics_pagination`
   - `test_request_metrics_filters`
   - `test_operation_metrics_filters`
   - `test_metrics_summary_calculation`
   - `test_metrics_unauthorized_401`
   - `test_metrics_time_window_filtering`

3. **Indexing Endpoint Tests** (4 tests, 3 hours)
   - `test_index_endpoint_queues_job`
   - `test_test_index_endpoint_sync_processing`
   - `test_index_unauthorized_401`
   - `test_index_rate_limit_enforced`

---

## Known Test Issues

### 1. Skipped Tests

**Location**: `conftest.py:291`
```python
if request.node.get_closest_marker("external"):
    if not _external_tests_requested():
        pytest.skip("External integration tests require WEBHOOK_RUN_EXTERNAL_TESTS=1")
```

**Issue**: External tests are skipped by default, reducing real-world validation.

**Recommendation**: Run external tests in CI against staging environment.

### 2. Test Mode Stubs

**Location**: `conftest.py:78-239`

**Issue**: Extensive stubbing (`InMemoryRedis`, `InMemoryQueue`, `InMemoryVectorStore`) may hide real integration issues.

**Example**:
```python
class InMemoryVectorStore:
    collections: ClassVar[dict[str, list[dict[str, Any]]]] = {}

    async def index_chunks(self, chunks, embeddings, document_url):
        # STUB: No validation of embedding dimensions
        # STUB: No error simulation for Qdrant failures
        self._storage.append({"chunk": chunk, "embedding": embedding})
```

**Recommendation**: Add integration tests with real Qdrant instance in Docker.

### 3. Database Isolation Issues

**Location**: `conftest.py:345-364`

**Issue**: `cleanup_database_engine` fixture disposes engine after every test, but schema is not rolled back.

**Potential Problem**: Tests may contaminate database state.

**Recommendation**: Use transaction rollback pattern:
```python
@pytest_asyncio.fixture
async def db_session():
    async with get_db_context() as session:
        # Start transaction
        await session.begin()
        yield session
        # Always rollback
        await session.rollback()
```

---

## Next Steps

### Immediate Actions (This Week)

1. ✅ **Add Coverage Reporting**
   - Configure `[tool.coverage.*]` in `pyproject.toml`
   - Run `pytest --cov` and generate baseline report
   - Share report with team for visibility

2. ✅ **Add Critical Security Tests** (Phase 1)
   - Create `tests/security/` directory
   - Add HMAC timing attack test
   - Add SQL injection test for search queries
   - Add oversized payload DoS test

3. ✅ **Document Untested Endpoints**
   - Create tickets for:
     - `/health` endpoint tests
     - `/api/search` rate limit tests
     - `/api/index` and `/test-index` tests
     - `/api/metrics/*` filter validation tests

### Short-Term (Next 2 Weeks)

1. ✅ **Add Error Handling Tests** (Phase 2)
   - Firecrawl API failures
   - Qdrant/TEI unavailability
   - Database connection loss
   - Partial indexing failures

2. ✅ **Improve Test Infrastructure**
   - Add test markers (`security`, `performance`, `integration`)
   - Add reusable fixtures (authenticated client, mock APIs)
   - Add test data builders

### Medium-Term (Next Month)

1. ✅ **Add Performance Tests** (Phase 4)
   - Search query latency benchmarks
   - Indexing throughput tests
   - Concurrent request handling

2. ✅ **Add Integration Tests** (Phase 5)
   - End-to-end crawl → webhook → index → search flow
   - Changedetection → rescrape → index flow
   - Metrics collection across all endpoints

---

## Appendix: Test File Mapping

### Source Files WITHOUT Tests

1. `api/routers/health.py` (76 lines) - ❌ **No tests**
2. `api/routers/indexing.py` (205 lines) - ❌ **No dedicated tests** (covered partially in integration)
3. `utils/logging.py` (65 lines) - ❌ **No tests**
4. `utils/time.py` (36 lines) - ❌ **No tests**
5. `infra/rate_limit.py` (18 lines) - ❌ **No tests**
6. `infra/redis.py` (estimated 50-100 lines) - ❌ **No tests** (if exists)
7. `api/schemas/*.py` (4 files) - ❌ **Minimal validation tests**

### Test Files with Low Assertion Density

**Measured by**: Assertions per test ratio < 2.0

1. `test_webhook_handlers.py` - 7 tests, ~10 assertions (1.4 per test)
2. `test_timing_middleware.py` - 2 tests, ~3 assertions (1.5 per test)
3. `test_main.py` - 7 tests, ~12 assertions (1.7 per test)

**Recommendation**: Add more comprehensive assertions in these files.

---

## Conclusion

The webhook server has a **solid foundation** of unit tests (275 tests, ~1:1 source-to-test ratio) but requires **significant additional testing** to reach production readiness. Critical gaps include:

1. **Security testing** (0 tests → need 15+)
2. **Error handling** (shallow coverage → need 20+ failure scenario tests)
3. **Integration testing** (11 tests → need 20+ end-to-end flows)
4. **Performance testing** (0 tests → need 10+ benchmarks)

**Recommended Path Forward**:
- **Week 1**: Block deployment, add security tests (Phase 1)
- **Weeks 2-3**: Add error handling and production readiness tests (Phases 2-3)
- **Week 4**: Add performance and integration tests (Phases 4-5)

**Total Effort**: 140-184 hours (3.5-4.5 weeks for 1 engineer, or 1.5-2 weeks for 2 engineers)

**Success Criteria**:
- ✅ 85%+ code coverage with branch coverage enabled
- ✅ All security tests passing
- ✅ All critical paths tested (happy + failure modes)
- ✅ Performance benchmarks established (p95 latency < 200ms)
- ✅ Zero flaky tests in CI pipeline
