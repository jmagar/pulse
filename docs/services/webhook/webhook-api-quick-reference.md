# Webhook Server API Quick Reference

## Endpoint Summary Table

| Method | Path | Auth | Rate Limit | Purpose |
|--------|------|------|-----------|---------|
| **POST** | `/api/webhook/firecrawl` | Signature | EXEMPT | Receive Firecrawl webhooks |
| **POST** | `/api/webhook/changedetection` | Signature | EXEMPT | Receive change detection webhooks |
| **POST** | `/api/search` | Secret | 50/min | Search documents (hybrid/semantic/keyword) |
| **GET** | `/api/stats` | None | 100/min | Get index statistics |
| **POST** | `/api/index` | Secret | 10/min | Queue document for indexing (DEPRECATED) |
| **POST** | `/api/test-index` | Secret | 5/min | Synchronous indexing with timing |
| **GET** | `/api/metrics/requests` | Secret | 100/min | Request-level timing metrics |
| **GET** | `/api/metrics/operations` | Secret | 100/min | Operation-level timing metrics |
| **GET** | `/api/metrics/summary` | Secret | 100/min | High-level metrics summary |
| **GET** | `/health` | None | 100/min | Health check (services status) |
| **GET** | `/` | None | 100/min | Root endpoint (service info) |

---

## Authentication Methods

### 1. Bearer Token (API Secret)
```
Authorization: Bearer <WEBHOOK_API_SECRET>
```
**Applied to:** `/api/search`, `/api/index`, `/api/test-index`, `/api/metrics/*`

### 2. Firecrawl HMAC Signature
```
X-Firecrawl-Signature: sha256=<hex_digest>
```
**Verification:** HMAC-SHA256(webhook_secret, raw_body)
**Applied to:** `/api/webhook/firecrawl`

### 3. Custom Signature Header
```
X-Signature: sha256=<hex_digest>
```
**Verification:** HMAC-SHA256(webhook_secret, raw_body)
**Applied to:** `/api/webhook/changedetection`

---

## Request/Response Examples

### Search Documents
**Request:**
```bash
curl -X POST http://localhost:50108/api/search \
  -H "Authorization: Bearer YOUR_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "machine learning",
    "mode": "hybrid",
    "limit": 10,
    "filters": {
      "domain": "example.com",
      "language": "en"
    }
  }'
```

**Response (200):**
```json
{
  "results": [
    {
      "url": "https://example.com/article",
      "title": "ML Basics",
      "description": "Introduction to machine learning",
      "text": "Machine learning is a subset of AI...",
      "score": 0.95,
      "metadata": {...}
    }
  ],
  "total": 1,
  "query": "machine learning",
  "mode": "hybrid"
}
```

### Firecrawl Webhook
**Request from Firecrawl:**
```bash
POST /api/webhook/firecrawl HTTP/1.1
X-Firecrawl-Signature: sha256=abc123def456...
Content-Type: application/json

{
  "type": "crawl.page",
  "id": "job-12345",
  "success": true,
  "metadata": {},
  "data": [
    {
      "markdown": "# Page Title\nContent here...",
      "html": "<html>...",
      "metadata": {
        "url": "https://example.com",
        "title": "Page Title",
        "statusCode": 200,
        "language": "en",
        "country": "US"
      }
    }
  ]
}
```

**Response (202):**
```json
{
  "status": "queued",
  "queued_jobs": 1,
  "failed_documents": [],
  "event_type": "crawl.page",
  "event_id": "job-12345"
}
```

### Health Check
**Request:**
```bash
curl http://localhost:50108/health
```

**Response (200):**
```json
{
  "status": "healthy",
  "services": {
    "redis": "healthy",
    "qdrant": "healthy",
    "tei": "healthy"
  },
  "timestamp": "14:30:45 | 11/13/2025"
}
```

### Index Statistics
**Request:**
```bash
curl http://localhost:50108/api/stats
```

**Response (200):**
```json
{
  "total_documents": 1250,
  "total_chunks": 5430,
  "qdrant_points": 5430,
  "bm25_documents": 1250,
  "collection_name": "documents"
}
```

### Test Index Document
**Request:**
```bash
curl -X POST http://localhost:50108/api/test-index \
  -H "Authorization: Bearer YOUR_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "resolvedUrl": "https://example.com/",
    "title": "Example",
    "description": "Example site",
    "markdown": "# Example\nContent...",
    "html": "<html>...",
    "statusCode": 200,
    "language": "en",
    "country": "US"
  }'
```

**Response (200):**
```json
{
  "status": "success",
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
        "total_tokens": 1200
      }
    }
  ],
  "summary": {
    "chunks_indexed": 5,
    "total_tokens": 1200,
    "indexed_to_qdrant": true,
    "indexed_to_bm25": true
  }
}
```

### Get Request Metrics
**Request:**
```bash
curl "http://localhost:50108/api/metrics/requests?limit=10&hours=24" \
  -H "Authorization: Bearer YOUR_SECRET"
```

**Response (200):**
```json
{
  "metrics": [
    {
      "id": "uuid-1234",
      "timestamp": "14:30:45 | 11/13/2025",
      "method": "POST",
      "path": "/api/search",
      "status_code": 200,
      "duration_ms": 234.56,
      "request_id": "req-uuid",
      "client_ip": "10.0.0.1"
    }
  ],
  "total": 500,
  "limit": 10,
  "offset": 0,
  "summary": {
    "avg_duration_ms": 234.56,
    "min_duration_ms": 10.23,
    "max_duration_ms": 5000.12,
    "total_requests": 500
  }
}
```

---

## Environment Variables

```env
# API Configuration
WEBHOOK_API_SECRET=<your-secret>
WEBHOOK_SECRET=<your-webhook-secret>
WEBHOOK_PORT=50108
WEBHOOK_HOST=0.0.0.0

# CORS Configuration
WEBHOOK_CORS_ORIGINS=*
# Or for production: https://app.example.com,https://admin.example.com

# Database (PostgreSQL)
WEBHOOK_DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/db

# Cache & Jobs (Redis)
WEBHOOK_REDIS_URL=redis://pulse_redis:6379/0

# Vector Search (Qdrant)
WEBHOOK_QDRANT_URL=http://qdrant:6333
WEBHOOK_QDRANT_COLLECTION=documents

# Embeddings (TEI)
WEBHOOK_TEI_URL=http://tei:8080

# Search Settings
WEBHOOK_HYBRID_SEARCH_K=50
WEBHOOK_RRF_K=60

# BM25 Parameters
WEBHOOK_BM25_K1=1.5
WEBHOOK_BM25_B=0.75

# Chunking
WEBHOOK_MAX_CHUNK_TOKENS=512
WEBHOOK_CHUNK_OVERLAP_TOKENS=50

# Features
WEBHOOK_ENABLE_WORKER=true
LOG_LEVEL=INFO

# Testing
TEST_MODE=false
```

---

## Common Status Codes

| Code | Meaning | When |
|------|---------|------|
| 200 | OK | Successful GET/POST (sync) |
| 202 | Accepted | Request queued for async processing |
| 400 | Bad Request | Invalid signature format, parse error |
| 401 | Unauthorized | Missing/invalid auth header |
| 422 | Validation Error | Schema validation failed |
| 429 | Rate Limited | Too many requests |
| 500 | Server Error | Internal error |

---

## Middleware Stack Summary

| Middleware | Order | Purpose | Config |
|-----------|-------|---------|--------|
| CORSMiddleware | 4 | Cross-origin requests | `WEBHOOK_CORS_ORIGINS` |
| SlowAPIMiddleware | 3 | Rate limiting | Redis-backed, per-IP |
| TimingMiddleware | 2 | Request metrics | Stores to PostgreSQL |
| HTTP Logging | 1 | Webhook debugging | Logs payload summaries |

---

## Service Dependencies

All services are **lazy-loaded** and cached as singletons:

- **TextChunker** - Tokenizes text for indexing
- **EmbeddingService** - Generates embeddings via TEI
- **VectorStore** - Qdrant client for semantic search
- **BM25Engine** - Full-text search engine
- **IndexingService** - Composes above for document indexing
- **SearchOrchestrator** - Orchestrates search modes (hybrid/semantic/keyword)
- **Redis** - Cache and job queue
- **AsyncSession** - SQLAlchemy database connection

---

## Search Modes Explained

### Hybrid
Combines vector + BM25 with Reciprocal Rank Fusion (RRF)
- Best for general search
- Balances semantic understanding + keyword matching
- Slower than single mode

### Semantic
Vector embedding similarity only
- Best for conceptual search
- Finds semantic similarity
- Fast

### Keyword / BM25
Full-text keyword search only
- Best for exact phrase matching
- No semantic understanding
- Fastest

---

## Rate Limiting Details

**Storage:** Redis
**Key:** Remote IP address
**Window:** Sliding 1-minute window
**Response Headers:**
- `Retry-After`: Seconds until limit resets
- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Requests remaining
- `X-RateLimit-Reset`: Unix timestamp of reset

**Example 429 Response:**
```json
{
  "detail": "429: Too Many Requests"
}
```

---

## Timing Headers

Every response includes:
```
X-Request-ID: <uuid>        # Unique request identifier
X-Process-Time: <ms>        # Total processing time in ms
```

These are added by `TimingMiddleware` and help with debugging.

---

## Database Tables

### RequestMetric (timing middleware)
- `id` (UUID)
- `timestamp` (DateTime)
- `method` (VARCHAR)
- `path` (VARCHAR)
- `status_code` (INT)
- `duration_ms` (FLOAT)
- `request_id` (UUID)
- `client_ip` (VARCHAR)
- `user_agent` (VARCHAR)
- `extra_metadata` (JSONB)

### OperationMetric (operation timing)
- `id` (UUID)
- `timestamp` (DateTime)
- `operation_type` (VARCHAR)
- `operation_name` (VARCHAR)
- `duration_ms` (FLOAT)
- `success` (BOOLEAN)
- `error_message` (VARCHAR)
- `request_id` (UUID)
- `job_id` (VARCHAR)
- `document_url` (VARCHAR)

### ChangeEvent (changedetection.io)
- `id` (UUID)
- `watch_id` (VARCHAR)
- `watch_url` (VARCHAR)
- `detected_at` (DateTime)
- `diff_summary` (TEXT)
- `snapshot_url` (VARCHAR)
- `rescrape_status` (VARCHAR)
- `rescrape_job_id` (VARCHAR)
- `extra_metadata` (JSONB)

---

## OpenAPI Documentation

Available at:
- **Swagger UI:** `http://localhost:50108/docs`
- **ReDoc:** `http://localhost:50108/redoc`
- **OpenAPI JSON:** `http://localhost:50108/openapi.json`

---

## Testing the API

### Using curl
```bash
# Health check (no auth)
curl http://localhost:50108/health

# Root endpoint (no auth)
curl http://localhost:50108/

# Search (with auth)
curl -X POST http://localhost:50108/api/search \
  -H "Authorization: Bearer YOUR_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"query":"test"}'

# Stats (no auth)
curl http://localhost:50108/api/stats

# Metrics (with auth)
curl http://localhost:50108/api/metrics/requests \
  -H "Authorization: Bearer YOUR_SECRET"
```

### Using Python
```python
import httpx

client = httpx.AsyncClient()

# Search
response = await client.post(
    "http://localhost:50108/api/search",
    json={"query": "test", "mode": "hybrid"},
    headers={"Authorization": "Bearer YOUR_SECRET"}
)

# Health
response = await client.get("http://localhost:50108/health")
print(response.json())
```

---

## Debugging Tips

1. **Check Health:** `/health` endpoint shows service status
2. **Request Metrics:** `/api/metrics/requests` shows all requests with timing
3. **Operation Metrics:** `/api/metrics/operations` shows internal operation performance
4. **API Docs:** `/docs` provides interactive documentation
5. **Logs:** Check application logs for detailed error messages
6. **Request ID:** All responses include `X-Request-ID` header for tracing

