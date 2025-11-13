# Webhook Server Routing Architecture

## Router Hierarchy

```
FastAPI Application (main.py)
│
├── Middleware Stack (bottom → top execution order)
│   ├── CORSMiddleware
│   ├── SlowAPIMiddleware (rate limiting)
│   ├── TimingMiddleware (request metrics)
│   └── HTTP Logging Middleware (webhook logging)
│
└── APIRouter (api/__init__.py)
    │
    ├── search.router (prefix: /api, tags: ["search"])
    │   ├── POST /api/search
    │   └── GET /api/stats
    │
    ├── webhook.router (prefix: /api/webhook, tags: ["webhooks"])
    │   ├── POST /api/webhook/firecrawl
    │   └── POST /api/webhook/changedetection
    │
    ├── indexing.router (prefix: /api, tags: ["indexing"])
    │   ├── POST /api/index [DEPRECATED]
    │   └── POST /api/test-index
    │
    ├── health.router (no prefix, tags: ["health"])
    │   └── GET /health
    │
    └── metrics.router (prefix: /api/metrics, tags: ["metrics"])
        ├── GET /api/metrics/requests
        ├── GET /api/metrics/operations
        └── GET /api/metrics/summary

+ Root endpoints (main.py):
  ├── GET / (root)
  └── Exception handlers (global)
```

---

## Router Implementation

### 1. Search Router (`api/routers/search.py`)

```
POST /api/search
├── Dependencies:
│   ├── verify_api_secret (401 if invalid)
│   ├── get_search_orchestrator (inject service)
│   └── Request (FastAPI injects)
├── Rate Limit: 50/minute
├── Validation:
│   ├── SearchRequest schema validation
│   ├── Query string validation
│   └── Filter object validation
├── Processing:
│   ├── Extract filters
│   ├── Call orchestrator.search()
│   ├── Convert results
│   └── Record timing metrics
├── Response:
│   ├── 200 OK → SearchResponse
│   ├── 401 Unauthorized
│   ├── 422 Validation Error
│   ├── 429 Rate Limited
│   └── 500 Server Error
└── Headers:
    ├── X-Request-ID (from timing middleware)
    └── X-Process-Time (from timing middleware)

GET /api/stats
├── Dependencies:
│   ├── get_vector_store (inject)
│   └── get_bm25_engine (inject)
├── Rate Limit: 100/minute (default)
├── Response:
│   ├── 200 OK → IndexStats
│   └── 500 Error
└── No Authentication Required
```

### 2. Webhook Router (`api/routers/webhook.py`)

```
POST /api/webhook/firecrawl
├── Dependencies:
│   ├── verify_webhook_signature (checks X-Firecrawl-Signature header)
│   │   └── HMAC-SHA256 verification on raw body
│   ├── get_rq_queue (inject job queue)
│   └── Request (raw body access)
├── Rate Limit: EXEMPT (@limiter_exempt)
├── Validation:
│   ├── Signature verification (before body parsing)
│   └── TypeAdapter validation (FirecrawlWebhookEvent)
├── Processing:
│   ├── Parse JSON payload
│   ├── Validate against event schema
│   ├── Call handle_firecrawl_event()
│   ├── Enqueue indexing jobs
│   └── Log detailed metrics
├── Response:
│   ├── 200 OK (sync processed)
│   ├── 202 Accepted (queued)
│   ├── 400 Bad Request (invalid signature format)
│   ├── 401 Unauthorized (signature mismatch/missing)
│   ├── 422 Validation Error (schema mismatch)
│   └── 500 Server Error
└── Special Logging:
    └── HTTP middleware logs payload summaries

POST /api/webhook/changedetection
├── Dependencies:
│   ├── get_db_session (inject database)
│   ├── get_rq_queue (inject job queue)
│   └── Request (raw body access)
├── Manual Signature Verification:
│   ├── X-Signature header (sha256=<hex>)
│   ├── HMAC-SHA256 comparison
│   └── 401 if missing/invalid
├── Rate Limit: EXEMPT (@limiter_exempt)
├── Processing:
│   ├── Parse JSON payload
│   ├── Validate ChangeDetectionPayload schema
│   ├── Create ChangeEvent record
│   ├── Enqueue rescrape job
│   └── Update event with job_id
├── Response:
│   ├── 202 Accepted
│   ├── 400 Bad Request (parse error)
│   └── 401 Unauthorized (signature invalid)
└── Database Write: ChangeEvent table
```

### 3. Indexing Router (`api/routers/indexing.py`)

```
POST /api/index [DEPRECATED]
├── Dependencies:
│   ├── verify_api_secret (401 if invalid)
│   ├── get_rq_queue (inject queue)
│   └── Request (FastAPI injects)
├── Rate Limit: 10/minute
├── Validation:
│   └── IndexDocumentRequest schema
├── Processing:
│   ├── Check queue length
│   ├── Enqueue indexing job
│   └── Return job_id
├── Response:
│   ├── 202 Accepted → IndexDocumentResponse
│   ├── 401 Unauthorized
│   ├── 500 Server Error
│   └── 429 Rate Limited
└── Deprecation Notice: Use /api/webhook/firecrawl

POST /api/test-index
├── Dependencies:
│   ├── verify_api_secret (401 if invalid)
│   ├── get_indexing_service (inject service)
│   └── Request (FastAPI injects)
├── Rate Limit: 5/minute
├── Validation:
│   └── IndexDocumentRequest schema
├── Processing:
│   ├── Execute indexing synchronously
│   ├── Capture step-by-step timing
│   ├── Log detailed operations
│   └── Return timing breakdown
├── Response:
│   ├── 200 OK (with steps)
│   ├── 401 Unauthorized
│   ├── 429 Rate Limited
│   └── Never returns 500 (errors in response)
└── Use Cases: Testing, debugging, config verification
```

### 4. Metrics Router (`api/routers/metrics.py`)

```
GET /api/metrics/requests
├── Dependencies:
│   ├── verify_api_secret (401 if invalid)
│   ├── get_db_session (inject database)
│   └── Query params validation
├── Rate Limit: 100/minute (default)
├── Query Parameters:
│   ├── limit (1-1000, default 100)
│   ├── offset (>=0, default 0)
│   ├── path (optional filter)
│   ├── method (optional filter)
│   ├── min_duration_ms (optional filter)
│   └── hours (1-168, default 24)
├── SQL Queries:
│   ├── Count query (with filters)
│   ├── Select query (paginated, ordered by timestamp DESC)
│   └── Aggregate query (stats)
├── Response:
│   ├── 200 OK
│   ├── 401 Unauthorized
│   └── 500 Database Error
└── Database Table: RequestMetric

GET /api/metrics/operations
├── Dependencies: (same as requests)
├── Query Parameters:
│   ├── limit, offset, hours (same as requests)
│   ├── operation_type (optional filter)
│   ├── operation_name (optional filter)
│   ├── document_url (optional filter)
│   └── success (optional boolean filter)
├── SQL Queries:
│   ├── Main query with GROUP BY operation_type
│   └── Stats query with success rate calculation
├── Response:
│   ├── 200 OK
│   ├── 401 Unauthorized
│   └── 500 Database Error
└── Database Table: OperationMetric

GET /api/metrics/summary
├── Dependencies:
│   ├── verify_api_secret
│   ├── get_db_session
│   └── Query params (hours only)
├── Rate Limit: 100/minute (default)
├── SQL Aggregations:
│   ├── Request metrics summary
│   ├── Operation metrics by type
│   └── Slowest endpoints (TOP 10)
├── Response:
│   ├── 200 OK
│   ├── 401 Unauthorized
│   └── 500 Database Error
└── Database Tables: RequestMetric, OperationMetric
```

### 5. Health Router (`api/routers/health.py`)

```
GET /health
├── Dependencies:
│   ├── get_embedding_service (inject)
│   ├── get_vector_store (inject)
│   └── get_redis_connection (module-level)
├── Rate Limit: 100/minute (default)
├── Service Checks (parallel):
│   ├── Redis: redis.ping()
│   ├── Qdrant: vector_store.health_check()
│   └── TEI: embedding_service.health_check()
├── Error Handling:
│   └── Each service failure logged, doesn't fail request
├── Response:
│   ├── 200 OK
│   └── Status: "healthy" | "degraded"
└── Response Body: HealthStatus (status, services dict, timestamp)
```

### 6. Root Router (main.py)

```
GET /
├── Rate Limit: 100/minute (default)
├── Response: 200 OK
└── Response Body: Service info + links to /docs, /health

Exception Handlers:
├── RateLimitExceeded → 429
├── HTTPException → return with status code
└── Generic Exception → 500 (logs full context)
```

---

## Request Flow Diagrams

### Firecrawl Webhook Processing

```
Client HTTP Request
    ↓
HTTP Logging Middleware
    ├── (logs payload summary)
    ↓
Timing Middleware
    ├── (generates request_id, starts perf_counter)
    ↓
CORS Middleware
    ├── (validates origin)
    ↓
SlowAPIMiddleware
    ├── (checks rate limit - EXEMPT for this endpoint)
    ↓
webhook_firecrawl() endpoint
    ├── Signature verification (verify_webhook_signature dependency)
    │   ├── Extract X-Firecrawl-Signature header
    │   ├── Compute HMAC-SHA256
    │   └── Compare with constant-time comparison
    │
    ├── Parse request body
    │   ├── JSON decode
    │   └── TypeAdapter validation
    │
    ├── Call handle_firecrawl_event()
    │   ├── Classify event type
    │   ├── Process page data or lifecycle
    │   ├── Enqueue indexing jobs
    │   └── Return result dict
    │
    └── Return response
        ↓
Timing Middleware (on response)
    ├── Calculate duration_ms
    ├── Add X-Request-ID and X-Process-Time headers
    ├── Store RequestMetric to database (async)
    └── Log request completion
        ↓
HTTP Response to Client
```

### Search Request Processing

```
Client HTTP Request with Authorization header
    ↓
Middleware Stack (same as above, including rate limit check: 50/min)
    ↓
search_documents() endpoint
    ├── verify_api_secret dependency
    │   ├── Extract Authorization header
    │   ├── Parse Bearer token
    │   └── Constant-time comparison
    │
    ├── SearchRequest validation
    │   ├── Pydantic schema validation
    │   └── Field constraints validation
    │
    ├── get_search_orchestrator dependency injection
    │
    ├── Execute search
    │   ├── Extract filters from request
    │   ├── Call orchestrator.search()
    │   │   ├── Generate query embedding (TEI)
    │   │   ├── Vector search (Qdrant)
    │   │   ├── Keyword search (BM25)
    │   │   ├── RRF fusion (if hybrid mode)
    │   │   └── Return merged results
    │   └── Convert to SearchResult objects
    │
    └── Return SearchResponse
        ↓
Timing Middleware (on response)
    ├── Store metrics (RequestMetric table)
    └── Add timing headers
        ↓
HTTP Response to Client
```

### Dependency Injection Chain

```
endpoint handler
├── verify_api_secret()
│   └── (checks auth header, raises 401 if invalid)
│
├── get_search_orchestrator()
│   ├── get_embedding_service()
│   │   └── (lazy-load or stub)
│   ├── get_vector_store()
│   │   └── (lazy-load or stub)
│   ├── get_bm25_engine()
│   │   └── (lazy-load or stub)
│   └── (compose into orchestrator)
│
└── endpoint logic
    └── Return response
```

---

## Middleware Execution Order

**Request Processing (top to bottom):**
1. CORSMiddleware - Validate origin
2. SlowAPIMiddleware - Check rate limit
3. TimingMiddleware - Start timing, generate request_id
4. HTTP Logging Middleware - Log webhook payloads
5. Router handler - Execute endpoint
6. Global exception handler (catches unhandled exceptions)

**Response Processing (bottom to top):**
1. Endpoint returns response
2. TimingMiddleware - Add headers, store metrics
3. HTTP Logging Middleware - Log response
4. SlowAPIMiddleware - Add rate limit headers
5. CORS Middleware - Add CORS headers
6. HTTP response to client

---

## Router Inclusion Structure

```python
# main.py
app = FastAPI()
app.include_router(api_router)

# api/__init__.py (aggregator)
router = APIRouter()
router.include_router(search.router, prefix="/api", tags=["search"])
router.include_router(webhook.router, prefix="/api/webhook", tags=["webhooks"])
router.include_router(indexing.router, prefix="/api", tags=["indexing"])
router.include_router(health.router, tags=["health"])
router.include_router(metrics.router, tags=["metrics"])

# Each router module
search.router = APIRouter()
webhook.router = APIRouter()
indexing.router = APIRouter()
health.router = APIRouter()
metrics.router = APIRouter(prefix="/api/metrics", tags=["metrics"])
```

---

## Rate Limiting Topology

```
SlowAPIMiddleware
    ├── Configured via limiter in infra/rate_limit.py
    ├── Redis backend (storage_uri)
    ├── Key function: get_remote_address (client IP)
    │
    ├── Default limits: 100/minute
    │
    ├── Per-endpoint limits:
    │   ├── search_documents: 50/minute (via @limiter.limit("50/minute"))
    │   ├── index_document: 10/minute
    │   ├── test_index_document: 5/minute
    │   ├── webhook endpoints: EXEMPT (@limiter_exempt)
    │   └── metrics endpoints: default (100/minute)
    │
    ├── Rate Limit Exceeded
    │   └── Custom handler: _rate_limit_exceeded_handler
    │       └── Return 429 with Retry-After header
    │
    └── Headers on response:
        ├── X-RateLimit-Limit
        ├── X-RateLimit-Remaining
        └── X-RateLimit-Reset
```

---

## Error Handling Flow

```
Exception Occurs in Handler
    ↓
HTTPException?
    ├─ YES → Global exception handler catches and returns
    │        with status_code from exception
    │
    └─ NO → Generic Exception
         ├─ Check if RateLimitExceeded
         │  └─ YES → _rate_limit_exceeded_handler
         │
         └─ NO → global_exception_handler
            ├─ Log exception with full context
            └─ Return 500 with generic message
```

---

## Key Design Patterns

### 1. Router Composition
- Routers defined in separate modules
- Aggregated in `api/__init__.py`
- Included with prefixes in main app
- Each router responsible for one feature area

### 2. Dependency Injection
- FastAPI's `Depends()` for all external dependencies
- Lazy-loaded singletons (instantiated on first use)
- Test stubs for testing without external services
- Composition pattern for complex dependencies

### 3. Middleware Layering
- Custom timing middleware for metrics
- SlowAPI for rate limiting
- CORS for cross-origin requests
- Custom HTTP logging for debugging

### 4. Authentication Strategies
- Two independent mechanisms:
  - API Secret (Bearer token) for regular endpoints
  - HMAC signatures for webhooks
- Constant-time comparison for security
- Early validation (signature before parsing)

### 5. Async/Await
- All handlers are async
- Database operations async
- Service calls async
- Allows concurrent request handling

