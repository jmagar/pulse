# Webhook Server API Endpoint Map

## Overview
The webhook server (Firecrawl Search Bridge) is a FastAPI application that provides:
- Webhook handling from Firecrawl and changedetection.io
- Hybrid semantic/keyword search with RRF fusion
- Document indexing and metrics collection
- Health monitoring and performance analytics

**Server Details:**
- Framework: FastAPI v0.100+
- Port: 50108 (external) / 52100 (internal Docker network)
- Rate Limiting: SlowAPI (Redis-backed)
- Authentication: API Secret Bearer Token, HMAC-SHA256 webhook signatures
- Middleware: CORS, Rate Limiting, Timing/Metrics

---

## Core Middleware Stack

### 1. **TimingMiddleware** (Custom)
- **Location:** `/api/middleware/timing.py`
- **Purpose:** Capture request-level timing metrics
- **Behavior:**
  - Generates unique `X-Request-ID` for each request
  - Measures request duration with `perf_counter()`
  - Stores metrics to PostgreSQL (non-blocking)
  - Adds headers: `X-Request-ID`, `X-Process-Time`
  - Gracefully handles failures (doesn't fail request)

### 2. **SlowAPIMiddleware**
- **Library:** slowapi
- **Configuration:** `/infra/rate_limit.py`
- **Rate Limiting:**
  - Default: 100 requests/minute per IP
  - Storage: Redis (configured via `WEBHOOK_REDIS_URL`)
  - Key function: Remote client IP address
- **Exception Handler:** `RateLimitExceeded` → 429 status code

### 3. **CORSMiddleware**
- **Configuration:** `main.py`
- **Settings:**
  - Origins: Configurable via `WEBHOOK_CORS_ORIGINS` (default: `*`)
  - Credentials: Enabled
  - Methods: All allowed
  - Headers: All allowed
- **Security Note:** Production should NEVER use `*`

### 4. **HTTP Logging Middleware**
- **Purpose:** Log webhook payloads for debugging
- **Behavior:**
  - Intercepts `/api/webhook/firecrawl` requests
  - Summarizes payload (size, event type, data count)
  - Logs request/response status
  - Minimal performance impact

---

## Authentication & Authorization

### 1. **API Secret Verification** (`verify_api_secret`)
- **Header:** `Authorization: Bearer <token>` or raw token
- **Location:** `api/deps.py::verify_api_secret()`
- **Security:** Constant-time comparison using `secrets.compare_digest()`
- **Errors:**
  - 401: Missing header
  - 401: Invalid token
- **Applied to:** `/search`, `/index`, `/test-index`, `/metrics/*`

### 2. **Webhook Signature Verification** (`verify_webhook_signature`)
- **Header:** `X-Firecrawl-Signature: sha256=<hex_digest>`
- **Location:** `api/deps.py::verify_webhook_signature()`
- **Algorithm:** HMAC-SHA256 over raw request body
- **Security:** 
  - Constant-time comparison
  - Signature format validation (regex)
  - Body consumed after verification
- **Errors:**
  - 400: Invalid signature format
  - 401: Missing signature header
  - 401: Signature mismatch
  - 500: Secret not configured
- **Applied to:** `/api/webhook/firecrawl`

### 3. **Changedetection HMAC Verification**
- **Header:** `X-Signature: sha256=<hex_digest>`
- **Location:** `api/routers/webhook.py::handle_changedetection_webhook()`
- **Algorithm:** HMAC-SHA256
- **Errors:**
  - 401: Missing signature
  - 401: Invalid signature
- **Applied to:** `/api/webhook/changedetection`

---

## API Endpoints

### Webhooks
#### POST `/api/webhook/firecrawl`
- **Purpose:** Receive Firecrawl crawl/scrape completion webhooks
- **Auth:** Depends on `verify_webhook_signature`
- **Rate Limit:** EXEMPT (internal service, signature-protected)
- **Request Headers:**
  - `X-Firecrawl-Signature: sha256=<digest>` (required)
- **Request Body:**
  - Type: `FirecrawlWebhookEvent` (discriminated union)
  - Variants:
    - `FirecrawlPageEvent`: Contains `data` array of documents
    - `FirecrawlLifecycleEvent`: Job/crawl lifecycle events
- **Response Codes:**
  - 200: Processed (synchronous)
  - 202: Queued (async background job)
  - 401: Invalid signature
  - 422: Validation error (payload schema mismatch)
  - 500: Server error
- **Response Body:**
  ```json
  {
    "status": "queued|processed",
    "queued_jobs": 0,
    "failed_documents": [],
    "event_type": "crawl.page|crawl.completed|...",
    "event_id": "job-id"
  }
  ```
- **Logging:**
  - Comprehensive payload logging (size, event type, item count)
  - Validation error detail logging
  - Processing duration tracking

#### POST `/api/webhook/changedetection`
- **Purpose:** Receive change detection notifications
- **Auth:** None (HMAC signature + custom header verification)
- **Rate Limit:** EXEMPT (internal service, signature-protected)
- **Request Headers:**
  - `X-Signature: sha256=<digest>` (required)
- **Request Body:**
  - Type: `ChangeDetectionPayload`
  - Fields: watch_id, watch_url, watch_title, detected_at, diff_url, snapshot
- **Response Code:** 202 (Accepted)
- **Response Body:**
  ```json
  {
    "status": "queued",
    "job_id": "job-123",
    "change_event_id": "event-456",
    "url": "https://example.com"
  }
  ```
- **Side Effects:**
  - Stores `ChangeEvent` to database
  - Enqueues rescrape job via RQ
  - Updates `ChangeEvent.rescrape_job_id`

---

### Search
#### POST `/api/search`
- **Purpose:** Search indexed documents using hybrid/semantic/keyword modes
- **Auth:** Depends on `verify_api_secret`
- **Rate Limit:** 50 requests/minute
- **Request Body:**
  - Type: `SearchRequest`
  - Fields:
    - `query` (str): Search query text (required)
    - `mode` (SearchMode): "hybrid" | "semantic" | "keyword" | "bm25" (default: "hybrid")
    - `limit` (int): 1-100 results (default: 10)
    - `filters` (SearchFilter, optional):
      - `domain`: Filter by domain
      - `language`: ISO language code
      - `country`: ISO country code
      - `isMobile`: Mobile flag
- **Response Code:** 200 (OK)
- **Response Body:**
  - Type: `SearchResponse`
  - Fields:
    - `results`: Array of `SearchResult`
      - `url`: Document URL
      - `title`: Document title (nullable)
      - `description`: Document description (nullable)
      - `text`: Matched text snippet
      - `score`: Relevance score (float)
      - `metadata`: Additional metadata dict
    - `total`: Count of results returned
    - `query`: Original search query
    - `mode`: Search mode used
- **Search Modes:**
  - **hybrid:** Vector similarity + BM25 with RRF (Reciprocal Rank Fusion) fusion
  - **semantic:** Vector embedding similarity only
  - **keyword/bm25:** BM25 full-text search only
- **Timing:**
  - Filter extraction logged
  - Search orchestration duration tracked
  - Result conversion duration tracked
  - Total request duration captured
- **Errors:**
  - 401: Missing/invalid API secret
  - 422: Invalid request format
  - 429: Rate limit exceeded
  - 500: Search failure

#### GET `/api/stats`
- **Purpose:** Get index statistics (documents and chunks)
- **Auth:** None
- **Rate Limit:** Default (100/minute)
- **Response Code:** 200 (OK)
- **Response Body:**
  - Type: `IndexStats`
  - Fields:
    - `total_documents`: BM25 document count
    - `total_chunks`: Qdrant chunk count
    - `qdrant_points`: Qdrant vector point count
    - `bm25_documents`: BM25 document count
    - `collection_name`: Qdrant collection name
- **Errors:**
  - 500: Failed to retrieve stats

---

### Indexing
#### POST `/api/index` ⚠️ DEPRECATED
- **Purpose:** Queue document for async indexing (legacy endpoint)
- **Deprecation Note:** Use `/api/webhook/firecrawl` instead
- **Auth:** Depends on `verify_api_secret`
- **Rate Limit:** 10 requests/minute
- **Request Body:**
  - Type: `IndexDocumentRequest`
  - Fields:
    - `url` (str): Original URL
    - `resolvedUrl` (str): Final URL after redirects
    - `title` (str, optional): Page title
    - `description` (str, optional): Page description
    - `markdown` (str): Markdown content (primary)
    - `html` (str): Raw HTML
    - `statusCode` (int): HTTP status code
    - `gcsPath` (str, optional): GCS bucket path
    - `screenshotUrl` (str, optional): Screenshot URL
    - `language` (str, optional): ISO language code
    - `country` (str, optional): ISO country code
    - `isMobile` (bool, optional): Mobile device flag
- **Response Code:** 202 (Accepted)
- **Response Body:**
  - Type: `IndexDocumentResponse`
  - Fields:
    - `job_id`: RQ job ID
    - `status`: "queued"
    - `message`: Human-readable status
- **Errors:**
  - 401: Missing/invalid API secret
  - 429: Rate limit exceeded
  - 500: Failed to queue job

#### POST `/api/test-index`
- **Purpose:** Synchronous document indexing with step-by-step timing
- **Use Cases:** Testing indexing pipeline, debugging performance, verifying configuration
- **Auth:** Depends on `verify_api_secret`
- **Rate Limit:** 5 requests/minute
- **Request Body:** Same as `/api/index` (`IndexDocumentRequest`)
- **Response Code:** 200 (OK)
- **Response Body:**
  ```json
  {
    "status": "success|failed",
    "url": "https://example.com",
    "total_duration_ms": 1234.56,
    "steps": [
      {
        "step": "parse_document",
        "duration_ms": 0.12,
        "status": "success",
        "details": {...}
      },
      {
        "step": "index_document",
        "duration_ms": 1234.44,
        "status": "success",
        "details": {
          "chunks_indexed": 5,
          "total_tokens": 1200,
          ...
        }
      }
    ],
    "summary": {
      "chunks_indexed": 5,
      "total_tokens": 1200,
      "indexed_to_qdrant": true,
      "indexed_to_bm25": true
    },
    "error": "...",
    "error_type": "..."
  }
  ```
- **Errors:**
  - 401: Missing/invalid API secret
  - 429: Rate limit exceeded
  - Returns error details in response body (no 500 exception)

---

### Metrics
#### GET `/api/metrics/requests`
- **Purpose:** Retrieve request-level timing metrics
- **Auth:** Depends on `verify_api_secret`
- **Rate Limit:** Default (100/minute)
- **Query Parameters:**
  - `limit` (int): 1-1000, default 100
  - `offset` (int): >=0, default 0
  - `path` (str, optional): Filter by URL path
  - `method` (str, optional): Filter by HTTP method
  - `min_duration_ms` (float, optional): Minimum duration filter
  - `hours` (int): 1-168, default 24
- **Response Code:** 200 (OK)
- **Response Body:**
  ```json
  {
    "metrics": [
      {
        "id": "uuid",
        "timestamp": "HH:MM:SS | MM/DD/YYYY",
        "method": "GET|POST|...",
        "path": "/api/search",
        "status_code": 200,
        "duration_ms": 123.45,
        "request_id": "uuid",
        "client_ip": "10.0.0.1"
      }
    ],
    "total": 50,
    "limit": 100,
    "offset": 0,
    "summary": {
      "avg_duration_ms": 234.56,
      "min_duration_ms": 10.23,
      "max_duration_ms": 5000.12,
      "total_requests": 50
    }
  }
  ```

#### GET `/api/metrics/operations`
- **Purpose:** Retrieve operation-level timing metrics (indexing, embedding, search)
- **Auth:** Depends on `verify_api_secret`
- **Rate Limit:** Default (100/minute)
- **Query Parameters:**
  - `limit` (int): 1-1000, default 100
  - `offset` (int): >=0, default 0
  - `operation_type` (str, optional): Filter by operation type
  - `operation_name` (str, optional): Filter by operation name
  - `document_url` (str, optional): Filter by document URL
  - `success` (bool, optional): Filter by success status
  - `hours` (int): 1-168, default 24
- **Response Code:** 200 (OK)
- **Response Body:**
  ```json
  {
    "metrics": [
      {
        "id": "uuid",
        "timestamp": "HH:MM:SS | MM/DD/YYYY",
        "operation_type": "embedding|indexing|search|...",
        "operation_name": "embed_chunks",
        "duration_ms": 456.78,
        "success": true,
        "error_message": null,
        "request_id": "uuid",
        "job_id": "rq-job-123",
        "document_url": "https://example.com"
      }
    ],
    "total": 25,
    "limit": 100,
    "offset": 0,
    "summary_by_type": {
      "embedding": {
        "avg_duration_ms": 234.56,
        "min_duration_ms": 10.23,
        "max_duration_ms": 5000.12,
        "total_operations": 25,
        "successful_operations": 24,
        "failed_operations": 1,
        "success_rate": 96.0
      },
      ...
    }
  }
  ```

#### GET `/api/metrics/summary`
- **Purpose:** High-level metrics summary across all operations
- **Auth:** Depends on `verify_api_secret`
- **Rate Limit:** Default (100/minute)
- **Query Parameters:**
  - `hours` (int): 1-168, default 24
- **Response Code:** 200 (OK)
- **Response Body:**
  ```json
  {
    "time_period_hours": 24,
    "requests": {
      "total": 1200,
      "avg_duration_ms": 234.56,
      "error_count": 5
    },
    "operations_by_type": {
      "embedding": {
        "total_operations": 500,
        "avg_duration_ms": 234.56,
        "error_count": 2
      },
      ...
    },
    "slowest_endpoints": [
      {
        "path": "/api/search",
        "avg_duration_ms": 456.78,
        "request_count": 100
      },
      ...
    ]
  }
  ```

---

### Health & Status
#### GET `/health`
- **Purpose:** Health check with service status
- **Auth:** None
- **Rate Limit:** Default (100/minute)
- **Response Code:** 200 (OK)
- **Response Body:**
  - Type: `HealthStatus`
  - Fields:
    - `status`: "healthy" | "degraded"
    - `services`: Dict of service → status
      - `redis`: "healthy" | "unhealthy: <error>"
      - `qdrant`: "healthy" | "unhealthy: <error>"
      - `tei`: "healthy" | "unhealthy: <error>"
    - `timestamp`: Health check timestamp (EST format)
- **Service Checks:**
  - Redis: `ping()` test
  - Qdrant: Async health check
  - TEI (Text Embeddings): Async health check

#### GET `/`
- **Purpose:** Root endpoint with service info
- **Auth:** None
- **Rate Limit:** Default (100/minute)
- **Response Code:** 200 (OK)
- **Response Body:**
  ```json
  {
    "service": "Firecrawl Search Bridge",
    "version": "0.1.0",
    "status": "running",
    "docs": "/docs",
    "health": "/health"
  }
  ```

---

## Dependency Injection System

All endpoints use FastAPI's dependency injection system. Key dependencies:

### Service Dependencies
```python
get_text_chunker()          → TextChunker
get_embedding_service()     → EmbeddingService
get_vector_store()          → VectorStore
get_bm25_engine()           → BM25Engine
get_indexing_service()      → IndexingService
get_search_orchestrator()   → SearchOrchestrator
```

### Infrastructure Dependencies
```python
get_redis_connection()      → Redis
get_rq_queue()              → RQ Queue
get_db_session()            → AsyncSession (SQLAlchemy)
get_db_context()            → Async context manager
```

### Authentication Dependencies
```python
verify_api_secret()         → None (raises 401 on failure)
verify_webhook_signature()  → None (raises 401 on failure)
```

### Features
- **Lazy Loading:** Services instantiated on first use
- **Test Mode Support:** Stub implementations for testing
- **Global Singletons:** One instance per service (memory-efficient)
- **Graceful Cleanup:** `cleanup_services()` closes all async resources
- **Dependency Composition:** Services depend on other services

---

## Rate Limiting Behavior

### Default Rates
| Endpoint | Rate | Method |
|----------|------|--------|
| `/api/search` | 50/min | POST |
| `/api/index` | 10/min | POST |
| `/api/test-index` | 5/min | POST |
| `/api/metrics/*` | 100/min (default) | GET |
| `/api/webhook/firecrawl` | EXEMPT | POST |
| `/api/webhook/changedetection` | EXEMPT | POST |
| `/health`, `/` | 100/min (default) | GET |

### Rate Limit Exemption
- Webhook endpoints (`/api/webhook/*`) are explicitly exempted
  - Reason: Internal services, signature-protected, naturally rate-limited
  - Implementation: `@limiter_exempt` decorator

### Backend
- **Storage:** Redis (configured via `WEBHOOK_REDIS_URL`)
- **Key:** Remote IP address
- **Response Code:** 429 (Too Many Requests)
- **Response Headers:**
  - `Retry-After`: Seconds to wait
  - `X-RateLimit-Limit`: Maximum requests
  - `X-RateLimit-Remaining`: Requests remaining
  - `X-RateLimit-Reset`: Reset timestamp

---

## Error Handling

### Standard HTTP Status Codes
| Code | Scenario |
|------|----------|
| 200 | Successful synchronous request |
| 202 | Accepted for async processing |
| 400 | Bad request (invalid format, signature format) |
| 401 | Unauthorized (missing/invalid auth) |
| 422 | Validation error (payload schema mismatch) |
| 429 | Rate limit exceeded |
| 500 | Server error |

### Error Response Format
```json
{
  "detail": "Error message or object",
  "error": "Detailed error info (500 responses)",
  "validation_errors": [...]  // For 422 responses
}
```

### Global Exception Handler
- Catches all unhandled exceptions
- Logs with full context
- Returns 500 with sanitized message
- Prevents information disclosure

---

## Security Summary

### Authentication Methods
1. **API Secret**: Bearer token for regular API endpoints
2. **Webhook Signatures**: HMAC-SHA256 for webhook endpoints
3. **Custom Header**: X-Signature for changedetection.io

### Security Features
- Constant-time comparison for all token/signature checks
- Request body consumption after verification
- Rate limiting via Redis
- CORS with configurable origins
- Timing metrics to detect attacks

### Configuration
```env
WEBHOOK_API_SECRET=<secret>          # For API endpoints
WEBHOOK_SECRET=<secret>               # For Firecrawl webhooks
CHANGEDETECTION_SECRET=<secret>       # For changedetection webhooks (reuses WEBHOOK_SECRET)
WEBHOOK_CORS_ORIGINS=https://example.com,https://app.example.com
```

---

## Lifespan Events

### Startup
1. Initialize timing metrics database
2. Log CORS configuration
3. Ensure Qdrant collection exists
4. Start background worker thread (if enabled)
5. Ready for requests

### Shutdown
1. Stop background worker thread
2. Clean up async services (embeddings, vector store, Redis)
3. Close database connections
4. Full cleanup (idempotent, safe to call multiple times)

---

## Request/Response Timing

All requests are tracked with:
- **Request ID**: Unique UUID per request
- **Duration**: Millisecond precision via `perf_counter()`
- **Headers**: `X-Request-ID`, `X-Process-Time` added to responses
- **Database**: Metrics stored in PostgreSQL for later analysis
- **Logging**: Full request logging with duration

---

## API Versioning

Current version: `0.1.0`
- No `/api/v1/` prefix currently in use
- Version embedded in OpenAPI docs
- Future: May introduce versioning as API evolves

---

## Documentation & API Spec

- **OpenAPI/Swagger**: Available at `/docs` and `/openapi.json`
- **ReDoc**: Available at `/redoc`
- **Title**: "Firecrawl Search Bridge"
- **Auto-generated**: From endpoint decorators and Pydantic schemas

