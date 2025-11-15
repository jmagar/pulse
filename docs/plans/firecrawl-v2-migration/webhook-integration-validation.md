# Firecrawl Webhook Integration Validation

## Summary

Comprehensive validation of Firecrawl webhook integration assumptions reveals the system is **already correctly implemented** with proper signature verification, event handling, and database tracking. However, there is a **critical naming inconsistency** between `CrawlSession.job_id` (model) and `crawl_id` (handler code) that needs resolution.

**Key Findings:**
- Webhook payloads confirmed to contain full `markdown`, `html`, and `metadata` fields
- HMAC signature verification is correctly implemented with `X-Firecrawl-Signature` header
- Handler processes both `crawl.page` and `batch_scrape.page` events correctly
- **CRITICAL BUG**: CrawlSession model uses `job_id` but handler code references non-existent `crawl_id` field

## Critical Issues Found

### 1. CrawlSession Field Name Mismatch (HIGH PRIORITY)

**Problem:** Code inconsistency between model definition and usage.

**Model Definition** (`domain/models.py:131`):
```python
# Job identification (renamed from crawl_id for v2 API)
job_id: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
```

**Handler Usage** (`services/webhook_handlers.py:267, 280, 318`):
```python
# WRONG - references non-existent field
select(CrawlSession).where(CrawlSession.crawl_id == crawl_id)
session = CrawlSession(crawl_id=crawl_id, ...)  # AttributeError!
```

**Impact:**
- `crawl.started` events will fail with `AttributeError: 'CrawlSession' has no attribute 'crawl_id'`
- Session tracking is broken for all Firecrawl operations
- This code has likely never been executed successfully in production

**Resolution Required:**
Replace all `crawl_id` references with `job_id` in webhook handlers:
- Line 267: `CrawlSession.crawl_id` → `CrawlSession.job_id`
- Line 280: `crawl_id=crawl_id` → `job_id=crawl_id`
- Line 318: `CrawlSession.crawl_id` → `CrawlSession.job_id`
- Line 281: `crawl_url=crawl_url` → `base_url=crawl_url`

**Note:** The variable name `crawl_id` (holding the event ID) is fine - only the model field references need updating.

---

## Assumption Validation Results

### ✅ 1. Webhook Event `crawl.page` Contains Full Content

**Status:** CONFIRMED

**Evidence:**

**Payload Schema** (`api/schemas/webhook.py:31-36`):
```python
class FirecrawlDocumentPayload(BaseModel):
    """Document payload from Firecrawl webhook data array."""
    markdown: str | None = Field(default=None, description="Markdown content")
    html: str | None = Field(default=None, description="HTML content")
    metadata: FirecrawlDocumentMetadata = Field(description="Document metadata")
```

**Metadata Fields** (`api/schemas/webhook.py:8-23`):
```python
class FirecrawlDocumentMetadata(BaseModel):
    url: str
    title: str | None
    description: str | None
    status_code: int = Field(alias="statusCode")
    content_type: str | None = Field(alias="contentType")
    scrape_id: str | None = Field(alias="scrapeId")
    source_url: str | None = Field(alias="sourceURL")
    language: str | None
    country: str | None
    # ... additional fields
```

**Test Example** (`tests/unit/test_webhook_handlers.py:20-37`):
```python
payload = {
    "success": True,
    "type": "crawl.page",
    "id": "crawl-1",
    "data": [
        {
            "markdown": "# Title",
            "html": "<h1>Title</h1>",
            "metadata": {
                "url": "https://example.com",
                "sourceURL": "https://example.com/final",
                "title": "Example",
                "description": "Example description",
                "statusCode": 200,
            },
        }
    ],
}
```

**Firecrawl API Source** (`apps/api/src/services/webhook/types.ts:54-57`):
```typescript
interface CrawlPageData extends BaseWebhookData {
  success: boolean;
  data: Document[] | WebhookDocumentLink[]; // Full Document objects
  scrapeId: string;
  error?: string;
}
```

**Applies To:** All page events (`crawl.page`, `batch_scrape.page`)

---

### ✅ 2. Webhook Handler Location and Structure

**Status:** CONFIRMED

**Handler Endpoint** (`api/routers/webhook.py:44-165`):
```python
@router.post("/firecrawl", dependencies=[])
@limiter_exempt
async def webhook_firecrawl(
    verified_body: Annotated[bytes, Depends(verify_webhook_signature)],
    queue: Annotated[Queue, Depends(get_rq_queue)],
) -> JSONResponse:
    """Process Firecrawl webhook with comprehensive logging."""

    payload = json.loads(verified_body)
    event = WEBHOOK_EVENT_ADAPTER.validate_python(payload)
    result = await handle_firecrawl_event(event, queue)
    # ...
```

**Handler Service** (`services/webhook_handlers.py:51-67`):
```python
async def handle_firecrawl_event(
    event: FirecrawlPageEvent | FirecrawlLifecycleEvent | Any,
    queue: Queue,
) -> dict[str, Any]:
    """Dispatch Firecrawl webhook events to the appropriate handler."""

    event_type = getattr(event, "type", None)

    if event_type in PAGE_EVENT_TYPES:  # crawl.page, batch_scrape.page
        return await _handle_page_event(event, queue)

    if event_type in LIFECYCLE_EVENT_TYPES:  # started, completed, failed
        return await _handle_lifecycle_event(event)
```

**Indexing Pipeline** (`services/webhook_handlers.py:102-164`):
```python
# Use Redis pipeline for atomic batch operations (5-10x faster)
with queue.connection.pipeline() as pipe:
    for idx, document in enumerate(documents):
        index_payload = _document_to_index_payload(document)

        # Add crawl_id to payload
        if crawl_id:
            index_payload["crawl_id"] = crawl_id

        job = queue.enqueue(
            "worker.index_document_job",
            index_payload,
            job_timeout=settings.indexing_job_timeout,
            pipeline=pipe,  # Batch enqueue
        )
```

**Key Features:**
- Event type discrimination (`PAGE_EVENT_TYPES` vs `LIFECYCLE_EVENT_TYPES`)
- Batch Redis pipeline for fast job enqueueing
- Per-document error handling with detailed logging
- Crawl ID propagation to worker jobs
- Auto-watch creation for change detection

---

### ✅ 3. HMAC Signature Verification

**Status:** CONFIRMED

**Verification Function** (`api/deps.py:355-410`):
```python
async def verify_webhook_signature(
    request: Request,
    x_firecrawl_signature: Annotated[str | None, Header(alias="X-Firecrawl-Signature")] = None,
) -> bytes:
    """
    Verify Firecrawl webhook signature using HMAC-SHA256.

    Returns:
        The verified request body as bytes for reuse by the handler.

    Raises:
        HTTPException: If verification fails or signature is missing.
    """

    secret = getattr(settings, "webhook_secret", "")

    if not x_firecrawl_signature:
        raise HTTPException(status_code=401, detail="Missing X-Firecrawl-Signature header")

    # Parse "sha256=<hex_digest>" format
    provided_signature = _parse_firecrawl_signature_header(x_firecrawl_signature)

    body = await request.body()

    expected_signature = hmac.new(
        key=secret.encode("utf-8"),
        msg=body,
        digestmod=hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(provided_signature, expected_signature):
        raise HTTPException(status_code=401, detail="Invalid signature")

    return body  # Return for reuse (no double-read)
```

**Header Format** (`api/deps.py:343-352`):
```python
_SIGNATURE_PATTERN = re.compile(r"^sha256=([0-9a-fA-F]{64})$")

def _parse_firecrawl_signature_header(signature_header: str) -> str:
    """Extract hexadecimal digest from Firecrawl signature header."""
    match = _SIGNATURE_PATTERN.match(signature_header.strip())
    if not match:
        raise ValueError("Invalid signature format, expected sha256=<digest>")
    return match.group(1)
```

**Firecrawl API Sender** (`apps/api/src/services/webhook/delivery.ts:95-99`):
```typescript
if (this.secret) {
    const hmac = createHmac("sha256", this.secret);
    hmac.update(payloadString);
    headers["X-Firecrawl-Signature"] = `sha256=${hmac.digest("hex")}`;
}
```

**Security Features:**
- Constant-time comparison (`hmac.compare_digest`) prevents timing attacks
- Regex validation of signature format
- Early return on missing signature
- Body reuse prevents double-read errors

**Configuration:**
- Secret: `WEBHOOK_SECRET` environment variable
- Shared with Firecrawl API via `SELF_HOSTED_WEBHOOK_HMAC_SECRET`

---

### ⚠️ 4. CrawlSession Model and job_id Relationship

**Status:** PARTIALLY CORRECT (Critical Bug Found)

**Model Definition** (`domain/models.py:117-181`):
```python
class CrawlSession(Base):
    """
    Tracks complete Firecrawl operation lifecycle with aggregate metrics.

    Supports all Firecrawl v2 operations: scrape, batch scrape, crawl, map, search.
    """
    __tablename__ = "crawl_sessions"
    __table_args__ = {"schema": "webhook"}

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)

    # Job identification (renamed from crawl_id for v2 API)
    job_id: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    base_url: Mapped[str] = mapped_column(String(500), nullable=False)

    # Operation type (scrape, scrape_batch, crawl, map, search, extract)
    operation_type: Mapped[str] = mapped_column(String(50), nullable=False)

    # Lifecycle timestamps
    started_at: Mapped[datetime]
    completed_at: Mapped[datetime | None]

    # Status tracking
    status: Mapped[str]
    success: Mapped[bool | None]

    # Aggregate metrics
    total_urls: Mapped[int]
    completed_urls: Mapped[int]
    failed_urls: Mapped[int]

    # ... timing metrics, metadata
```

**Database Schema** (`alembic/versions/413191e2eb2c_create_crawl_sessions_table.py:34-35`):
```python
# Rename crawl_id to job_id in crawl_sessions (more accurate for v2 API)
op.add_column('crawl_sessions', sa.Column('job_id', sa.String(length=255), nullable=False), schema='webhook')
```

**OperationMetric Relationship** (`domain/models.py:74-75`):
```python
class OperationMetric(Base):
    # ...
    crawl_id: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    # NOTE: Uses crawl_id (legacy name) but references CrawlSession.job_id
```

**Foreign Key** (implied, needs verification):
```sql
-- OperationMetric.crawl_id → CrawlSession.job_id
-- Migration: alembic/versions/413191e2eb2c_create_crawl_sessions_table.py:102
['crawl_id'], ['job_id'],
```

**Webhook Event ID Mapping:**
- Firecrawl sends: `event.id` (or `event.jobId` for v0 API)
- Handler extracts: `crawl_id = getattr(event, "id", None)`
- **WRONG**: Tries to use `CrawlSession(crawl_id=...)` (field doesn't exist!)
- **CORRECT**: Should use `CrawlSession(job_id=crawl_id, ...)`

**Naming Convention:**
- `job_id` = Unique identifier for Firecrawl v2 operations (scrape, crawl, batch, etc.)
- `crawl_id` = Legacy field name in `OperationMetric` (references `job_id` via FK)
- Variable `crawl_id` in handler = Local name for event ID (acceptable, but confusing)

---

### ✅ 5. Environment Variable SELF_HOSTED_WEBHOOK_URL

**Status:** CONFIRMED

**Configuration Source** (`apps/api/src/services/webhook/config.ts:18-31`):
```typescript
export async function getWebhookConfig(
  teamId: string,
  jobId: string,
  webhook?: WebhookConfig,
): Promise<{ config: WebhookConfig; secret?: string } | null> {
  // Priority: webhook → self-hosted env var → db webhook

  const selfHostedUrl = process.env.SELF_HOSTED_WEBHOOK_URL?.replace(
    "{{JOB_ID}}",
    jobId,
  );

  if (selfHostedUrl) {
    return {
      config: {
        url: selfHostedUrl,
        headers: {},
        metadata: {},
        events: ["completed", "failed", "page", "started"],
      },
      secret: process.env.SELF_HOSTED_WEBHOOK_HMAC_SECRET,
    };
  }
  // ...
}
```

**Environment Configuration** (`.env.example:277`):
```bash
# Webhook Configuration
# IMPORTANT: Use internal Docker network URL for webhook delivery
# Format: http://<container-name>:<port>/api/webhook/firecrawl
# ❌ DON'T: https://external-domain.com/... (causes 502 errors)
# ✅ DO: http://pulse_webhook:52100/api/webhook/firecrawl
SELF_HOSTED_WEBHOOK_URL=http://pulse_webhook:52100/api/webhook/firecrawl

# Allow webhooks to internal Docker network addresses (bypasses SSRF protection)
ALLOW_LOCAL_WEBHOOKS=true
```

**Docker Compose** (`docker-compose.yaml:277-278`):
```yaml
services:
  firecrawl:
    env_file:
      - .env  # Loads SELF_HOSTED_WEBHOOK_URL automatically
```

**Event Filtering** (`config.ts:28`):
```typescript
events: ["completed", "failed", "page", "started"]
// Controls which webhook events are sent
// User can override with MCP_WEBHOOK_EVENTS=page (reduces traffic by 50%)
```

**URL Templating:**
- Firecrawl supports `{{JOB_ID}}` placeholder for dynamic routing
- Currently unused (URL is static: `/api/webhook/firecrawl`)
- Could enable per-job webhook endpoints in future

**Security:**
- `ALLOW_LOCAL_WEBHOOKS=true` required for Docker network communication
- Bypasses SSRF protection for internal services (safe in trusted networks)
- HMAC signature still verified via `SELF_HOSTED_WEBHOOK_HMAC_SECRET`

**Configuration Validation:**
```bash
# Verify Firecrawl can reach webhook endpoint
docker exec firecrawl curl -f http://pulse_webhook:52100/health
# Expected: {"status":"healthy","timestamp":"..."}

# Verify webhook secret is set
docker exec firecrawl printenv SELF_HOSTED_WEBHOOK_HMAC_SECRET | wc -c
# Expected: 65 (64-char hex + newline)
```

---

## Implementation Patterns

### Pattern 1: Event-Driven Document Indexing

**File:** `services/webhook_handlers.py:69-203`

**How It Works:**
1. Webhook endpoint validates signature and parses payload
2. Dispatcher routes by event type (`crawl.page` → `_handle_page_event`)
3. Documents are transformed from Firecrawl format to internal schema
4. Jobs are batched into Redis pipeline for atomic enqueueing
5. Worker processes index documents asynchronously
6. Auto-watch tasks fire-and-forget for change detection

**Key Benefits:**
- Atomic job creation (all succeed or all fail)
- 5-10x faster than individual enqueues
- Detailed per-document error tracking
- Non-blocking auto-watch creation

**Example:**
```python
# Batch enqueue with Redis pipeline
with queue.connection.pipeline() as pipe:
    for document in documents:
        index_payload = _document_to_index_payload(document)
        index_payload["crawl_id"] = crawl_id

        job = queue.enqueue(
            "worker.index_document_job",
            index_payload,
            job_timeout=settings.indexing_job_timeout,
            pipeline=pipe,
        )
        job_ids.append(job.id)

    pipe.execute()  # Atomic commit
```

---

### Pattern 2: Lifecycle Tracking with Aggregate Metrics

**File:** `services/webhook_handlers.py:206-407`

**How It Works:**
1. `crawl.started` creates `CrawlSession` record with `initiated_at` timestamp
2. `crawl.page` events queue indexing jobs (no session update)
3. `crawl.completed` aggregates metrics from `OperationMetric` table
4. Session stores total pages, timing breakdowns, success rate

**Aggregate Queries:**
```python
# Total unique URLs indexed
page_count = await db.execute(
    select(func.count(func.distinct(OperationMetric.document_url)))
    .where(OperationMetric.crawl_id == crawl_id)
    .where(OperationMetric.operation_type == "worker")
    .where(OperationMetric.success == True)
)

# Timing by operation type
timings = await db.execute(
    select(
        OperationMetric.operation_type,
        func.sum(OperationMetric.duration_ms).label("total_ms"),
    )
    .where(OperationMetric.crawl_id == crawl_id)
    .where(OperationMetric.success == True)
    .group_by(OperationMetric.operation_type)
)
# Results: chunking, embedding, qdrant, bm25 totals
```

**Metrics Exposed:**
- `total_pages`, `pages_indexed`, `pages_failed`
- `total_chunking_ms`, `total_embedding_ms`, `total_qdrant_ms`, `total_bm25_ms`
- `duration_ms` (crawl duration), `e2e_duration_ms` (client → indexing complete)

---

### Pattern 3: Signature Verification with Body Reuse

**File:** `api/deps.py:355-410`

**How It Works:**
1. Dependency reads request body once
2. Computes HMAC-SHA256 and validates signature
3. Returns verified body as `bytes`
4. Endpoint reuses body for JSON parsing (no double-read)

**Why It Matters:**
- FastAPI request bodies are streams (can only read once)
- Double-read causes `RuntimeError: Body already read`
- Dependency injection pattern solves this elegantly

**Example:**
```python
@router.post("/firecrawl")
async def webhook_firecrawl(
    verified_body: Annotated[bytes, Depends(verify_webhook_signature)],
) -> JSONResponse:
    payload = json.loads(verified_body)  # Reuse verified body
    # No need to await request.body() again
```

---

## Considerations

### 1. CrawlSession Field Naming Bug (CRITICAL)

**Issue:** Handler references `CrawlSession.crawl_id` but model only has `job_id`.

**Impact:** All lifecycle tracking is currently broken.

**Files Affected:**
- `services/webhook_handlers.py:267, 280, 318`
- All tests using `CrawlSession.crawl_id` queries

**Fix:**
```python
# BEFORE (broken)
select(CrawlSession).where(CrawlSession.crawl_id == crawl_id)
session = CrawlSession(crawl_id=crawl_id, crawl_url=crawl_url, ...)

# AFTER (correct)
select(CrawlSession).where(CrawlSession.job_id == crawl_id)
session = CrawlSession(job_id=crawl_id, base_url=crawl_url, ...)
```

**Testing Required:**
- Unit tests for `_record_crawl_start` and `_record_crawl_complete`
- Integration test: Send `crawl.started` → verify session created
- Integration test: Send `crawl.completed` → verify metrics aggregated

---

### 2. OperationMetric Foreign Key Constraint

**Current State:**
- `OperationMetric.crawl_id` references `CrawlSession.job_id`
- Migration suggests FK exists but handler creates dangling references

**Verification Needed:**
```sql
-- Check if FK constraint exists
SELECT conname, contype, confrelid::regclass
FROM pg_constraint
WHERE conrelid = 'webhook.operation_metrics'::regclass
  AND contype = 'f';
```

**Risk:** If FK is enforced, indexing jobs will fail when referencing non-existent `job_id`.

**Resolution:**
1. Ensure `crawl.started` event creates session BEFORE first page event
2. Add idempotency check for duplicate `crawl.started` events
3. Consider ON DELETE CASCADE for cleanup

---

### 3. Event Order Guarantees

**Assumption:** Firecrawl sends events in order: `started` → `page` → `completed`

**Reality:** No guarantee of order due to:
- Network retries
- Webhook delivery parallelism
- Client disconnects

**Current Protection:**
- Idempotency check in `_record_crawl_start` (line 269-277)
- Missing idempotency for `_record_crawl_complete`

**Recommended:**
```python
# Handle out-of-order completion
if not session:
    logger.warning("Crawl completed but no session found, creating retroactively")
    session = CrawlSession(
        job_id=crawl_id,
        base_url=event.metadata.get("url", "unknown"),
        started_at=datetime.now(UTC),
        status="in_progress",
    )
    db.add(session)
    await db.flush()
```

---

### 4. Webhook Event Filtering

**Configuration:** `MCP_WEBHOOK_EVENTS=page` (default)

**Rationale:**
- Reduces webhook traffic by 50% (no `started`/`completed` events)
- Lifecycle tracking relies on these events!

**Impact Analysis:**
- If `MCP_WEBHOOK_EVENTS=page`: Session tracking **will not work**
- Need fallback: Create session on first page event if missing

**Recommended Default:**
```bash
# Include lifecycle events for tracking
MCP_WEBHOOK_EVENTS=page,started,completed
```

**Alternative:** Lazy session creation in `_handle_page_event`:
```python
# Get or create session on first page event
result = await db.execute(select(CrawlSession).where(CrawlSession.job_id == crawl_id))
session = result.scalar_one_or_none()

if not session:
    session = CrawlSession(job_id=crawl_id, base_url="unknown", ...)
    db.add(session)
    await db.commit()
```

---

### 5. Database Schema Version Mismatch

**Observation:** Multiple migrations reference `crawl_sessions` table:
- `d4a3f655d912_add_crawl_sessions_table.py` (old)
- `413191e2eb2c_create_crawl_sessions_table.py` (new, renames `crawl_id` → `job_id`)

**Verification Required:**
```bash
# Check current schema
docker exec pulse_postgres psql -U firecrawl -d pulse_postgres -c \
  "\d webhook.crawl_sessions"

# Verify job_id column exists
# Expected: job_id | character varying(255) | not null
```

**Risk:** If migration hasn't run, `job_id` column won't exist.

**Resolution:** Run pending migrations before deploying webhook handler fix.

---

## Next Steps

### 1. Fix CrawlSession Field References (IMMEDIATE)

**Priority:** P0 - Blocks all lifecycle tracking

**Tasks:**
- [ ] Update `services/webhook_handlers.py` lines 267, 280, 318
- [ ] Change `crawl_id=` to `job_id=`
- [ ] Change `crawl_url=` to `base_url=`
- [ ] Update all test files referencing `CrawlSession.crawl_id`
- [ ] Add integration test for full lifecycle

**Files to Update:**
```
services/webhook_handlers.py
tests/unit/test_crawl_session_model.py
tests/integration/test_crawl_lifecycle.py
tests/integration/test_webhook_optimizations.py
tests/unit/services/test_webhook_handlers_batch.py
```

**Verification:**
```bash
# Search for all references
cd /compose/pulse/apps/webhook
rg "CrawlSession\.crawl_id" --type py
rg "crawl_id=crawl_id" --type py
```

---

### 2. Verify Database Schema (IMMEDIATE)

**Priority:** P0 - Prevent runtime errors

**Commands:**
```bash
# Check current schema
docker exec pulse_postgres psql -U firecrawl -d pulse_postgres -c \
  "SELECT column_name, data_type, is_nullable
   FROM information_schema.columns
   WHERE table_schema = 'webhook'
     AND table_name = 'crawl_sessions'
   ORDER BY ordinal_position;"

# Check for pending migrations
docker exec pulse_webhook alembic -c alembic.ini current
docker exec pulse_webhook alembic -c alembic.ini heads

# Run migrations if needed
docker exec pulse_webhook alembic -c alembic.ini upgrade head
```

---

### 3. Add Lazy Session Creation (RECOMMENDED)

**Priority:** P1 - Handle missing lifecycle events

**Rationale:**
- `MCP_WEBHOOK_EVENTS=page` filters out `started` events
- Out-of-order delivery can skip `started` event
- Lazy creation ensures session always exists

**Implementation:**
```python
async def _get_or_create_session(crawl_id: str, base_url: str) -> CrawlSession:
    """Get existing session or create new one on first page event."""
    async with get_db_context() as db:
        result = await db.execute(
            select(CrawlSession).where(CrawlSession.job_id == crawl_id)
        )
        session = result.scalar_one_or_none()

        if not session:
            session = CrawlSession(
                job_id=crawl_id,
                base_url=base_url,
                operation_type="unknown",  # Will be updated by metadata
                started_at=datetime.now(UTC),
                status="in_progress",
            )
            db.add(session)
            await db.commit()
            logger.info("Created session lazily on page event", crawl_id=crawl_id)

        return session
```

---

### 4. Update Default Webhook Events (RECOMMENDED)

**Priority:** P2 - Improve observability

**Change `.env.example:154`:**
```bash
# BEFORE
MCP_WEBHOOK_EVENTS=page

# AFTER
MCP_WEBHOOK_EVENTS=page,started,completed
```

**Rationale:**
- Enables full lifecycle tracking
- Only increases webhook traffic by 2 events per crawl
- Minimal performance impact

---

### 5. Add Foreign Key Validation Tests (NICE-TO-HAVE)

**Priority:** P3 - Prevent future bugs

**Test Case:**
```python
@pytest.mark.asyncio
async def test_operation_metric_requires_valid_crawl_id(db_session):
    """OperationMetric.crawl_id must reference existing CrawlSession.job_id."""

    # Try to create metric without session
    metric = OperationMetric(
        crawl_id="nonexistent-job-id",
        operation_type="worker",
        operation_name="index_document",
        duration_ms=100,
    )
    db_session.add(metric)

    # Should fail if FK constraint exists
    with pytest.raises(IntegrityError):
        await db_session.commit()
```

---

## Reference Files

### Core Implementation
- `apps/webhook/api/routers/webhook.py` - Webhook endpoint
- `apps/webhook/api/deps.py` - Signature verification
- `apps/webhook/services/webhook_handlers.py` - Event handlers
- `apps/webhook/api/schemas/webhook.py` - Pydantic schemas
- `apps/webhook/domain/models.py` - SQLAlchemy models

### Firecrawl Integration
- `apps/api/src/services/webhook/delivery.ts` - Webhook sender
- `apps/api/src/services/webhook/config.ts` - Configuration loader
- `apps/api/src/services/webhook/types.ts` - TypeScript types

### Configuration
- `.env.example:277-278` - `SELF_HOSTED_WEBHOOK_URL`
- `.env.example:206` - `WEBHOOK_SECRET`
- `docker-compose.yaml:90-110` - `pulse_webhook` service

### Tests
- `tests/unit/test_webhook_handlers.py` - Handler unit tests
- `tests/unit/api/test_deps_signature.py` - Signature verification tests
- `tests/integration/test_crawl_lifecycle.py` - Lifecycle integration tests

### Database
- `alembic/versions/413191e2eb2c_create_crawl_sessions_table.py` - Migration

---

## Conclusion

The Firecrawl webhook integration is **architecturally sound** but has a **critical implementation bug** preventing lifecycle tracking from working. The fix is straightforward (rename field references) but must be done carefully to avoid breaking existing functionality.

**Immediate Action Required:**
1. Fix `CrawlSession.crawl_id` → `CrawlSession.job_id` references
2. Verify database schema matches model definition
3. Run integration tests to confirm lifecycle tracking works

**Post-Fix Validation:**
```bash
# Send test crawl via MCP
# Check logs for session creation
docker logs pulse_webhook -f | grep "Crawl session"

# Expected:
# INFO Crawl session started crawl_id=xxx-xxx-xxx
# INFO Crawl session completed crawl_id=xxx-xxx-xxx pages_total=5 pages_indexed=5
```
