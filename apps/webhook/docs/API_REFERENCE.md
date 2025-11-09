# FC-Bridge API Reference

**Version:** 1.0.0
**Base URL:** `http://localhost:52100`
**Documentation Generated:** 2025-11-08

## Table of Contents

- [Authentication](#authentication)
- [Rate Limiting](#rate-limiting)
- [Endpoints](#endpoints)
  - [POST /api/index](#post-apiindex) (DEPRECATED)
  - [POST /api/search](#post-apisearch)
  - [POST /api/webhook/firecrawl](#post-apiwebhookfirecrawl)
  - [POST /api/test-index](#post-apitest-index)
  - [GET /health](#get-health)
  - [GET /api/stats](#get-apistats)
- [Models](#models)
- [Error Responses](#error-responses)
- [Examples](#examples)

---

## Authentication

FC-Bridge uses two authentication mechanisms:

### 1. API Secret (Bearer Token)

**Used by:** All `/api/*` endpoints (except webhooks)

**Header Format:**
```http
Authorization: Bearer <your-api-secret>
```

**Alternative Format (backwards compatible):**
```http
Authorization: <your-api-secret>
```

**Configuration:**
- Set via environment variable: `SEARCH_BRIDGE_API_SECRET`
- Required for all API operations (indexing, searching, stats)

**Error Responses:**
- `401 Unauthorized` - Missing or invalid API secret

---

### 2. Webhook Signature (HMAC-SHA256)

**Used by:** `/api/webhook/firecrawl`

**Header Format:**
```http
X-Firecrawl-Signature: sha256=<hex-digest>
```

**Verification Process:**
1. Firecrawl computes HMAC-SHA256 of request body using shared secret
2. FC-Bridge validates signature using same secret
3. Request rejected if signatures don't match

**Configuration:**
- Set via environment variable: `SEARCH_BRIDGE_WEBHOOK_SECRET`
- Minimum length: 16 characters
- Maximum length: 256 characters
- Must not contain leading/trailing whitespace

**Error Responses:**
- `401 Unauthorized` - Missing or invalid signature
- `400 Bad Request` - Malformed signature format
- `500 Internal Server Error` - Webhook secret not configured

---

## Rate Limiting

FC-Bridge implements per-IP rate limiting using SlowAPI:

| Endpoint | Rate Limit | Window |
|----------|------------|--------|
| `POST /api/index` | 10 requests | 1 minute |
| `POST /api/search` | 50 requests | 1 minute |
| `POST /api/test-index` | 5 requests | 1 minute |
| `POST /api/webhook/firecrawl` | No limit | N/A |
| `GET /health` | No limit | N/A |
| `GET /api/stats` | No limit | N/A |

**Rate Limit Exceeded Response:**
```json
{
  "detail": "Rate limit exceeded: 10 per 1 minute"
}
```
**Status Code:** `429 Too Many Requests`

---

## Endpoints

### POST /api/index

**⚠️ DEPRECATED:** Use `/api/webhook/firecrawl` instead.

**Description:** Queue a document for asynchronous indexing.

**Authentication:** Bearer token (API secret)
**Rate Limit:** 10 requests/minute
**Status Code:** `202 Accepted`

#### Request

**Headers:**
```http
Authorization: Bearer <api-secret>
Content-Type: application/json
```

**Body:**
```json
{
  "url": "https://example.com/page",
  "resolvedUrl": "https://example.com/page",
  "title": "Page Title",
  "description": "Page description",
  "markdown": "# Content\n\nPage content in markdown format...",
  "html": "<html>...</html>",
  "statusCode": 200,
  "gcsPath": "gs://bucket/path",
  "screenshotUrl": "https://example.com/screenshot.png",
  "language": "en",
  "country": "US",
  "isMobile": false
}
```

**Required Fields:**
- `url` (string) - Original URL
- `resolvedUrl` (string) - Final URL after redirects
- `markdown` (string) - Primary search content
- `html` (string) - Raw HTML
- `statusCode` (integer) - HTTP status code

**Optional Fields:**
- `title` (string) - Page title
- `description` (string) - Page description
- `gcsPath` (string) - GCS bucket path
- `screenshotUrl` (string) - Screenshot URL
- `language` (string) - ISO language code (e.g., 'en')
- `country` (string) - ISO country code (e.g., 'US')
- `isMobile` (boolean) - Mobile device flag (default: false)

#### Response

**Success (202 Accepted):**
```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "queued",
  "message": "Document queued for indexing: https://example.com/page"
}
```

**Error (500 Internal Server Error):**
```json
{
  "detail": "Failed to queue document: <error message>"
}
```

#### Processing Pipeline

1. Request validated against `IndexDocumentRequest` schema
2. Job queued to Redis (RQ) with 10-minute timeout
3. Background worker processes document:
   - Chunks markdown content (256 tokens/chunk, 50 token overlap)
   - Generates embeddings via TEI (Text Embeddings Inference)
   - Indexes chunks to Qdrant (vector search)
   - Indexes full document to BM25 (keyword search)

#### Notes

- Queue position returned in response
- Job ID can be used to track status (requires separate endpoint)
- Documents chunked before indexing (optimized for 384-dimensional embeddings)

---

### POST /api/search

**Description:** Search indexed documents using hybrid, semantic, or keyword search.

**Authentication:** Bearer token (API secret)
**Rate Limit:** 50 requests/minute
**Status Code:** `200 OK`

#### Request

**Headers:**
```http
Authorization: Bearer <api-secret>
Content-Type: application/json
```

**Body:**
```json
{
  "query": "How to configure Qdrant vector database",
  "mode": "hybrid",
  "limit": 10,
  "filters": {
    "domain": "example.com",
    "language": "en",
    "country": "US",
    "isMobile": false
  }
}
```

**Required Fields:**
- `query` (string) - Search query text

**Optional Fields:**
- `mode` (enum) - Search mode (default: `hybrid`)
  - `hybrid` - Vector + BM25 with RRF fusion (best quality)
  - `semantic` - Vector similarity only (best for conceptual search)
  - `keyword` / `bm25` - BM25 keyword search only (best for exact matches)
- `limit` (integer) - Maximum results (default: 10, min: 1, max: 100)
- `filters` (object) - Optional search filters
  - `domain` (string) - Filter by domain
  - `language` (string) - Filter by ISO language code
  - `country` (string) - Filter by ISO country code
  - `isMobile` (boolean) - Filter by mobile flag

#### Response

**Success (200 OK):**
```json
{
  "results": [
    {
      "url": "https://example.com/docs/qdrant-setup",
      "title": "Qdrant Configuration Guide",
      "description": "Learn how to configure Qdrant vector database",
      "text": "...matched text snippet...",
      "score": 0.8543,
      "metadata": {
        "url": "https://example.com/docs/qdrant-setup",
        "chunk_index": 0,
        "token_count": 245,
        "language": "en",
        "country": "US"
      }
    }
  ],
  "total": 1,
  "query": "How to configure Qdrant vector database",
  "mode": "hybrid"
}
```

**Error (500 Internal Server Error):**
```json
{
  "detail": "Search failed: <error message>"
}
```

#### Search Modes Explained

**Hybrid (Recommended):**
- Combines vector similarity and BM25 keyword search
- Uses Reciprocal Rank Fusion (RRF) to merge results
- Best for: General-purpose search, balanced precision/recall
- Algorithm: `score = sum(1 / (60 + rank_i))`

**Semantic:**
- Pure vector similarity search using cosine distance
- Best for: Conceptual/semantic queries, finding related content
- Example: "authentication methods" matches "login systems"

**Keyword/BM25:**
- Traditional keyword-based search using BM25 algorithm
- Best for: Exact matches, technical terms, proper nouns
- Example: "SHA256 hash" requires exact keyword match

#### Filtering

All filters are applied at the **vector store level** (Qdrant) for efficiency:
- Filters reduce search space before scoring
- Multiple filters use AND logic (all must match)
- Empty/null filters are ignored

#### Performance

Typical response times:
- Hybrid search: 50-200ms
- Semantic search: 30-100ms
- Keyword search: 10-50ms

**Logged Timing Breakdown:**
- Filter extraction
- Search orchestration
- Result conversion
- Total request duration

---

### POST /api/webhook/firecrawl

**Description:** Process Firecrawl webhook events for document indexing.

**Authentication:** HMAC-SHA256 signature
**Rate Limit:** None
**Status Code:** `200 OK` or `202 Accepted`

#### Request

**Headers:**
```http
X-Firecrawl-Signature: sha256=<hex-digest>
Content-Type: application/json
```

**Body (Crawl Page Event):**
```json
{
  "type": "crawl.page",
  "success": true,
  "id": "crawl_550e8400",
  "data": [
    {
      "markdown": "# Page Title\n\nContent...",
      "html": "<html>...</html>",
      "metadata": {
        "url": "https://example.com/page",
        "title": "Page Title",
        "description": "Page description",
        "statusCode": 200,
        "contentType": "text/html",
        "scrapeId": "scrape_123",
        "sourceURL": "https://example.com",
        "proxyUsed": "basic",
        "cacheState": "hit",
        "cachedAt": "2025-11-08T12:00:00Z",
        "creditsUsed": 1,
        "language": "en",
        "country": "US"
      }
    }
  ],
  "metadata": {
    "customField": "customValue"
  }
}
```

**Body (Lifecycle Event):**
```json
{
  "type": "crawl.started",
  "success": true,
  "id": "crawl_550e8400",
  "data": [],
  "metadata": {}
}
```

#### Event Types

**Page Events (with documents):**
- `crawl.page` - Scraped page from crawl job
- `batch_scrape.page` - Scraped page from batch scrape

**Lifecycle Events (no documents):**
- `crawl.started` - Crawl job started
- `crawl.completed` - Crawl job finished successfully
- `crawl.failed` - Crawl job failed
- `batch_scrape.started` - Batch scrape started
- `batch_scrape.completed` - Batch scrape finished
- `extract.started` - Extract job started
- `extract.completed` - Extract job finished
- `extract.failed` - Extract job failed

#### Response

**Page Event (202 Accepted):**
```json
{
  "status": "queued",
  "event_type": "crawl.page",
  "event_id": "crawl_550e8400",
  "queued_jobs": 1,
  "failed_documents": []
}
```

**Lifecycle Event (200 OK):**
```json
{
  "status": "acknowledged",
  "event_type": "crawl.started",
  "event_id": "crawl_550e8400",
  "message": "Lifecycle event acknowledged"
}
```

**Validation Error (422 Unprocessable Entity):**
```json
{
  "error": "Invalid webhook payload structure",
  "validation_errors": [
    {
      "loc": ["data", 0, "metadata", "url"],
      "msg": "Field required",
      "type": "missing"
    }
  ],
  "hint": "Check data array structure matches Firecrawl API spec"
}
```

#### Processing Logic

**Page Events:**
1. Validate event structure (Pydantic validation)
2. Extract documents from `data` array
3. Transform to `IndexDocumentRequest` format
4. Queue indexing jobs to Redis
5. Return job IDs and status

**Lifecycle Events:**
1. Validate event structure
2. Log event for monitoring
3. Acknowledge receipt
4. No indexing performed

#### Signature Verification

**Algorithm:**
```python
expected = hmac.new(
    key=webhook_secret.encode('utf-8'),
    msg=request_body,
    digestmod=hashlib.sha256
).hexdigest()

signature_valid = hmac.compare_digest(
    provided_signature,
    expected
)
```

**Security:**
- Uses constant-time comparison to prevent timing attacks
- Signature computed over **raw request body** (before JSON parsing)
- Must use exact webhook secret (no trimming/normalization)

---

### POST /api/test-index

**Description:** Synchronously index a document with detailed timing for testing/debugging.

**Authentication:** Bearer token (API secret)
**Rate Limit:** 5 requests/minute
**Status Code:** `200 OK`

#### Request

**Headers:**
```http
Authorization: Bearer <api-secret>
Content-Type: application/json
```

**Body:** Same as `POST /api/index`

#### Response

**Success (200 OK):**
```json
{
  "status": "success",
  "url": "https://example.com/page",
  "total_duration_ms": 1234.56,
  "steps": [
    {
      "step": "parse_document",
      "duration_ms": 12.34,
      "status": "success",
      "details": {
        "url": "https://example.com/page",
        "markdown_length": 5432,
        "has_title": true,
        "has_description": true
      }
    },
    {
      "step": "index_document",
      "duration_ms": 1222.22,
      "status": "success",
      "details": {
        "chunks_indexed": 15,
        "total_tokens": 3456
      }
    }
  ],
  "summary": {
    "chunks_indexed": 15,
    "total_tokens": 3456,
    "indexed_to_qdrant": true,
    "indexed_to_bm25": true
  }
}
```

**Error (200 OK with error details):**
```json
{
  "status": "failed",
  "url": "https://example.com/page",
  "total_duration_ms": 567.89,
  "steps": [
    {
      "step": "error",
      "duration_ms": 567.89,
      "status": "failed",
      "details": {
        "error": "Connection timeout",
        "error_type": "TimeoutError"
      }
    }
  ],
  "error": "Connection timeout",
  "error_type": "TimeoutError"
}
```

#### Use Cases

- **Testing:** Verify indexing pipeline without checking worker logs
- **Debugging:** Identify slow steps in processing pipeline
- **Development:** Test configuration changes immediately
- **Troubleshooting:** Diagnose failures with detailed error context

#### Differences from /api/index

| Feature | /api/index | /api/test-index |
|---------|------------|-----------------|
| Processing | Asynchronous (queue) | Synchronous (immediate) |
| Rate Limit | 10/minute | 5/minute |
| Response Time | < 100ms | 500ms - 5s |
| Timing Details | No | Yes (step-by-step) |
| Use Case | Production | Testing/debugging |

---

### GET /health

**Description:** Health check for all system dependencies.

**Authentication:** None
**Rate Limit:** None
**Status Code:** `200 OK`

#### Request

**Headers:**
```http
Accept: application/json
```

#### Response

**All Healthy (200 OK):**
```json
{
  "status": "healthy",
  "services": {
    "redis": "healthy",
    "qdrant": "healthy",
    "tei": "healthy"
  },
  "timestamp": "2025-11-08T12:00:00"
}
```

**Degraded (200 OK):**
```json
{
  "status": "degraded",
  "services": {
    "redis": "healthy",
    "qdrant": "unhealthy: Connection refused",
    "tei": "healthy"
  },
  "timestamp": "2025-11-08T12:00:00"
}
```

#### Service Checks

**Redis:**
- Test: `PING` command
- Healthy: Responds with `PONG`
- Unhealthy: Connection error, timeout, or non-responsive

**Qdrant:**
- Test: `GET /collections` API call
- Healthy: Returns collection list
- Unhealthy: Connection error, timeout, or HTTP error

**TEI (Text Embeddings Inference):**
- Test: `GET /health` endpoint
- Healthy: Returns 200 OK
- Unhealthy: Connection error, timeout, or non-200 status

#### Overall Status

- `healthy` - All services operational
- `degraded` - One or more services failing

**Note:** Endpoint always returns `200 OK` (even when degraded) to allow monitoring tools to parse response body.

---

### GET /api/stats

**Description:** Get index statistics (document counts, collection info).

**Authentication:** None
**Rate Limit:** None
**Status Code:** `200 OK`

#### Request

**Headers:**
```http
Accept: application/json
```

#### Response

**Success (200 OK):**
```json
{
  "total_documents": 1543,
  "total_chunks": 15430,
  "qdrant_points": 15430,
  "bm25_documents": 1543,
  "collection_name": "firecrawl_docs"
}
```

**Error (500 Internal Server Error):**
```json
{
  "detail": "Failed to get stats: <error message>"
}
```

#### Field Descriptions

- `total_documents` - Full documents indexed (BM25 count)
- `total_chunks` - Document chunks indexed (Qdrant count)
- `qdrant_points` - Vector points in Qdrant collection
- `bm25_documents` - Documents in BM25 index
- `collection_name` - Qdrant collection name

#### Notes

- Documents are chunked before indexing (typical ratio: 1 document = 10 chunks)
- `total_chunks` should be higher than `total_documents`
- Useful for monitoring index growth and verifying successful indexing

---

## Models

### IndexDocumentRequest

Document indexing request from Firecrawl.

**Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | string | Yes | Original URL |
| `resolvedUrl` | string | Yes | Final URL after redirects |
| `title` | string | No | Page title |
| `description` | string | No | Page description |
| `markdown` | string | Yes | Markdown content (primary search content) |
| `html` | string | Yes | Raw HTML content |
| `statusCode` | integer | Yes | HTTP status code |
| `gcsPath` | string | No | GCS bucket path |
| `screenshotUrl` | string | No | Screenshot URL |
| `language` | string | No | ISO language code (e.g., 'en') |
| `country` | string | No | ISO country code (e.g., 'US') |
| `isMobile` | boolean | No | Mobile device flag (default: false) |

**Alias Support:**
- `resolvedUrl` accepts `resolved_url`
- `statusCode` accepts `status_code`
- `gcsPath` accepts `gcs_path`
- `screenshotUrl` accepts `screenshot_url`
- `isMobile` accepts `is_mobile`

---

### IndexDocumentResponse

Response for document indexing request.

**Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `job_id` | string | Background job ID |
| `status` | string | Job status (always "queued") |
| `message` | string | Human-readable message |

---

### SearchRequest

Search request with query, mode, and filters.

**Fields:**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `query` | string | Yes | - | Search query text |
| `mode` | SearchMode | No | `hybrid` | Search mode |
| `limit` | integer | No | 10 | Maximum results (1-100) |
| `filters` | SearchFilter | No | null | Search filters |

---

### SearchMode

Search mode enumeration.

**Values:**
- `hybrid` - Vector + BM25 with RRF fusion
- `semantic` - Vector similarity only
- `keyword` - BM25 keyword search only
- `bm25` - Alias for keyword

---

### SearchFilter

Optional search filters.

**Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `domain` | string | Filter by domain |
| `language` | string | Filter by ISO language code |
| `country` | string | Filter by ISO country code |
| `isMobile` | boolean | Filter by mobile flag |

**Alias Support:**
- `isMobile` accepts `is_mobile`

---

### SearchResponse

Search response with results and metadata.

**Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `results` | SearchResult[] | Search results |
| `total` | integer | Total number of results |
| `query` | string | Original query |
| `mode` | SearchMode | Search mode used |

---

### SearchResult

Individual search result.

**Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `url` | string | Document URL |
| `title` | string | Document title (nullable) |
| `description` | string | Document description (nullable) |
| `text` | string | Matched text snippet |
| `score` | float | Relevance score (0.0-1.0 for cosine, variable for RRF) |
| `metadata` | object | Additional metadata (chunk_index, token_count, etc.) |

---

### HealthStatus

Health check status response.

**Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | Overall status ("healthy" or "degraded") |
| `services` | object | Individual service statuses (key-value pairs) |
| `timestamp` | string | Health check timestamp (ISO 8601 UTC) |

---

### IndexStats

Index statistics response.

**Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `total_documents` | integer | Total indexed documents |
| `total_chunks` | integer | Total chunks |
| `qdrant_points` | integer | Total Qdrant points |
| `bm25_documents` | integer | Total BM25 documents |
| `collection_name` | string | Qdrant collection name |

---

### FirecrawlWebhookEvent

Webhook event from Firecrawl (discriminated union).

**Discriminator:** `type` field

**Types:**
- `FirecrawlPageEvent` - Contains scraped documents
- `FirecrawlLifecycleEvent` - Crawl lifecycle state

---

### FirecrawlPageEvent

Webhook event containing scraped page data.

**Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | Event type ("crawl.page" or "batch_scrape.page") |
| `success` | boolean | Whether event succeeded |
| `id` | string | Firecrawl job/crawl identifier |
| `data` | FirecrawlDocumentPayload[] | Scraped documents |
| `metadata` | object | Arbitrary metadata from Firecrawl |
| `error` | string | Error message (present when success=false) |

---

### FirecrawlLifecycleEvent

Webhook event describing crawl lifecycle state.

**Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | Event type (see lifecycle types below) |
| `success` | boolean | Whether event succeeded |
| `id` | string | Firecrawl job/crawl identifier |
| `data` | array | Typically empty for lifecycle events |
| `metadata` | object | Arbitrary metadata from Firecrawl |
| `error` | string | Error message (present when success=false) |

**Lifecycle Types:**
- `crawl.started`
- `crawl.completed`
- `crawl.failed`
- `batch_scrape.started`
- `batch_scrape.completed`
- `extract.started`
- `extract.completed`
- `extract.failed`

---

### FirecrawlDocumentPayload

Document payload from Firecrawl webhook data array.

**Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `markdown` | string | Markdown content (nullable) |
| `html` | string | HTML content (nullable) |
| `metadata` | FirecrawlDocumentMetadata | Document metadata |

---

### FirecrawlDocumentMetadata

Metadata object nested within Firecrawl document payloads.

**Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | string | Yes | Document URL |
| `title` | string | No | Document title |
| `description` | string | No | Document description |
| `statusCode` | integer | Yes | HTTP status code |
| `contentType` | string | No | Content type |
| `scrapeId` | string | No | Scrape ID |
| `sourceURL` | string | No | Source URL |
| `proxyUsed` | string | No | Proxy used |
| `cacheState` | string | No | Cache state |
| `cachedAt` | string | No | Cached timestamp |
| `creditsUsed` | integer | No | Credits used |
| `language` | string | No | ISO language code |
| `country` | string | No | ISO country code |

**Alias Support:** All camelCase fields also accept snake_case (e.g., `status_code`)

---

## Error Responses

### Standard Error Format

All errors follow FastAPI's default error response format:

```json
{
  "detail": "<error message or object>"
}
```

### Common HTTP Status Codes

| Code | Meaning | When Used |
|------|---------|-----------|
| `200 OK` | Success | Successful GET requests |
| `202 Accepted` | Accepted for Processing | Async indexing queued |
| `400 Bad Request` | Invalid Request | Malformed signature, invalid parameters |
| `401 Unauthorized` | Authentication Failed | Missing/invalid credentials |
| `422 Unprocessable Entity` | Validation Error | Invalid request body structure |
| `429 Too Many Requests` | Rate Limit Exceeded | Too many requests from IP |
| `500 Internal Server Error` | Server Error | Database error, service unavailable |

### Validation Errors (422)

**Format:**
```json
{
  "detail": [
    {
      "loc": ["body", "query"],
      "msg": "Field required",
      "type": "missing"
    }
  ]
}
```

**Fields:**
- `loc` - Path to error (e.g., ["body", "filters", "limit"])
- `msg` - Human-readable error message
- `type` - Error type (missing, type_error, value_error, etc.)

---

## Examples

### Example 1: Index a Document

```bash
curl -X POST http://localhost:52100/api/index \
  -H "Authorization: Bearer your-api-secret" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://docs.example.com/api",
    "resolvedUrl": "https://docs.example.com/api",
    "title": "API Documentation",
    "description": "Complete API reference",
    "markdown": "# API Reference\n\n## Authentication\n\nUse Bearer tokens...",
    "html": "<html>...</html>",
    "statusCode": 200,
    "language": "en",
    "country": "US"
  }'
```

**Response:**
```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "queued",
  "message": "Document queued for indexing: https://docs.example.com/api"
}
```

---

### Example 2: Hybrid Search

```bash
curl -X POST http://localhost:52100/api/search \
  -H "Authorization: Bearer your-api-secret" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "authentication methods",
    "mode": "hybrid",
    "limit": 5
  }'
```

**Response:**
```json
{
  "results": [
    {
      "url": "https://docs.example.com/auth",
      "title": "Authentication",
      "description": "Authentication methods",
      "text": "We support multiple authentication methods including OAuth2, API keys...",
      "score": 0.8543,
      "metadata": {
        "url": "https://docs.example.com/auth",
        "chunk_index": 0,
        "token_count": 234
      }
    }
  ],
  "total": 1,
  "query": "authentication methods",
  "mode": "hybrid"
}
```

---

### Example 3: Semantic Search with Filters

```bash
curl -X POST http://localhost:52100/api/search \
  -H "Authorization: Bearer your-api-secret" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "database configuration",
    "mode": "semantic",
    "limit": 10,
    "filters": {
      "language": "en",
      "domain": "docs.example.com"
    }
  }'
```

---

### Example 4: Keyword Search

```bash
curl -X POST http://localhost:52100/api/search \
  -H "Authorization: Bearer your-api-secret" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "PostgreSQL connection string",
    "mode": "keyword",
    "limit": 20
  }'
```

---

### Example 5: Health Check

```bash
curl http://localhost:52100/health
```

**Response:**
```json
{
  "status": "healthy",
  "services": {
    "redis": "healthy",
    "qdrant": "healthy",
    "tei": "healthy"
  },
  "timestamp": "2025-11-08T12:00:00"
}
```

---

### Example 6: Get Statistics

```bash
curl http://localhost:52100/api/stats
```

**Response:**
```json
{
  "total_documents": 1543,
  "total_chunks": 15430,
  "qdrant_points": 15430,
  "bm25_documents": 1543,
  "collection_name": "firecrawl_docs"
}
```

---

### Example 7: Test Indexing

```bash
curl -X POST http://localhost:52100/api/test-index \
  -H "Authorization: Bearer your-api-secret" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://test.example.com",
    "resolvedUrl": "https://test.example.com",
    "markdown": "# Test\n\nTest content",
    "html": "<html>Test</html>",
    "statusCode": 200
  }'
```

**Response:**
```json
{
  "status": "success",
  "url": "https://test.example.com",
  "total_duration_ms": 1234.56,
  "steps": [...],
  "summary": {
    "chunks_indexed": 5,
    "total_tokens": 45,
    "indexed_to_qdrant": true,
    "indexed_to_bm25": true
  }
}
```

---

### Example 8: Firecrawl Webhook (Page Event)

**Note:** This example shows the webhook payload. Actual signature generation requires HMAC-SHA256 computation.

```bash
curl -X POST http://localhost:52100/api/webhook/firecrawl \
  -H "X-Firecrawl-Signature: sha256=<computed-signature>" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "crawl.page",
    "success": true,
    "id": "crawl_abc123",
    "data": [
      {
        "markdown": "# Example Page\n\nContent here...",
        "html": "<html>...</html>",
        "metadata": {
          "url": "https://example.com/page",
          "title": "Example Page",
          "statusCode": 200,
          "language": "en"
        }
      }
    ]
  }'
```

**Response:**
```json
{
  "status": "queued",
  "event_type": "crawl.page",
  "event_id": "crawl_abc123",
  "queued_jobs": 1,
  "failed_documents": []
}
```

---

## Configuration

### Environment Variables

All configuration via environment variables with `SEARCH_BRIDGE_` prefix:

**API Server:**
- `SEARCH_BRIDGE_HOST` - Server host (default: `0.0.0.0`)
- `SEARCH_BRIDGE_PORT` - Server port (default: `52100`)
- `SEARCH_BRIDGE_API_SECRET` - API secret for Bearer auth (required)
- `SEARCH_BRIDGE_WEBHOOK_SECRET` - HMAC secret for webhooks (required, 16-256 chars)

**CORS:**
- `SEARCH_BRIDGE_CORS_ORIGINS` - Allowed origins (JSON array or comma-separated)
  - Example: `["https://app.example.com","https://admin.example.com"]`
  - Development: `["*"]` (⚠️ NOT for production)

**Redis:**
- `SEARCH_BRIDGE_REDIS_URL` - Redis connection URL (default: `redis://localhost:52101`)

**Qdrant:**
- `SEARCH_BRIDGE_QDRANT_URL` - Qdrant server URL (default: `http://localhost:52102`)
- `SEARCH_BRIDGE_QDRANT_COLLECTION` - Collection name (default: `firecrawl_docs`)
- `SEARCH_BRIDGE_QDRANT_TIMEOUT` - Request timeout in seconds (default: `60.0`)
- `SEARCH_BRIDGE_VECTOR_DIM` - Vector dimensions (default: `384`)

**TEI (Text Embeddings Inference):**
- `SEARCH_BRIDGE_TEI_URL` - TEI server URL (default: `http://localhost:52104`)
- `SEARCH_BRIDGE_TEI_API_KEY` - TEI API key (optional)
- `SEARCH_BRIDGE_EMBEDDING_MODEL` - Model name (default: `sentence-transformers/all-MiniLM-L6-v2`)

**Chunking:**
- `SEARCH_BRIDGE_MAX_CHUNK_TOKENS` - Max tokens per chunk (default: `256`)
- `SEARCH_BRIDGE_CHUNK_OVERLAP_TOKENS` - Overlap tokens (default: `50`)

**Search:**
- `SEARCH_BRIDGE_HYBRID_ALPHA` - Hybrid search alpha (default: `0.5`, range: 0.0-1.0)
- `SEARCH_BRIDGE_BM25_K1` - BM25 k1 parameter (default: `1.5`)
- `SEARCH_BRIDGE_BM25_B` - BM25 b parameter (default: `0.75`)
- `SEARCH_BRIDGE_RRF_K` - RRF k constant (default: `60`)

**Logging:**
- `SEARCH_BRIDGE_LOG_LEVEL` - Log level (default: `INFO`)

**Database:**
- `SEARCH_BRIDGE_DATABASE_URL` - PostgreSQL URL for timing metrics (default: `postgresql+asyncpg://localhost:5432/fc_bridge`)

---

## Deployment

### Docker Compose

FC-Bridge is designed for deployment with Docker Compose:

```yaml
services:
  fc-bridge:
    image: fc-bridge:latest
    ports:
      - "52100:52100"
    environment:
      SEARCH_BRIDGE_API_SECRET: ${SEARCH_BRIDGE_API_SECRET}
      SEARCH_BRIDGE_WEBHOOK_SECRET: ${SEARCH_BRIDGE_WEBHOOK_SECRET}
      SEARCH_BRIDGE_REDIS_URL: redis://redis:6379
      SEARCH_BRIDGE_QDRANT_URL: http://qdrant:6333
      SEARCH_BRIDGE_TEI_URL: http://tei:80
    depends_on:
      - redis
      - qdrant
      - tei
```

### Health Monitoring

Use `/health` endpoint for health checks:

```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:52100/health"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 40s
```

---

## Support

For issues, questions, or feature requests:
- GitHub: https://github.com/yourusername/fc-bridge
- Documentation: https://github.com/yourusername/fc-bridge/tree/main/docs
