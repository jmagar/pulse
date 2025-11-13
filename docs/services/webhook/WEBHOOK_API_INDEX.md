# Webhook Server API Documentation Index

Complete exploration and documentation of the Firecrawl Search Bridge (webhook server) API endpoints, routing architecture, and request/response handling.

## Quick Navigation

### For API Users
Start here if you need to integrate with the webhook server:

1. **[Webhook API Quick Reference](webhook-api-quick-reference.md)** - START HERE
   - Endpoint summary table
   - Authentication examples
   - cURL/Python examples for all endpoints
   - Environment variables checklist
   - Common error codes
   - Database schemas

2. **[Webhook API Endpoints](webhook-api-endpoints.md)** - COMPLETE REFERENCE
   - Full endpoint specifications
   - Request/response schemas with examples
   - Rate limiting details
   - Security features
   - Dependency injection system

### For Architects & Developers
For understanding the system design and implementation:

3. **[Webhook Routing Architecture](webhook-routing-architecture.md)** - DESIGN PATTERNS
   - Router hierarchy and composition
   - Middleware stack (execution order)
   - Request/response flow diagrams
   - Rate limiting topology
   - Error handling flow
   - Dependency injection chain

## API Overview

**Service Name:** Firecrawl Search Bridge  
**Port:** 50108 (external) / 52100 (internal)  
**Framework:** FastAPI v0.100+  
**Total Endpoints:** 11 across 5 routers  
**Authentication Methods:** 2 (Bearer token + HMAC signatures)  

## Endpoint Summary

| Category | Endpoints | Auth | Rate Limit |
|----------|-----------|------|-----------|
| **Webhooks** | `/api/webhook/firecrawl`, `/api/webhook/changedetection` | Signature | EXEMPT |
| **Search** | `/api/search`, `/api/stats` | Secret, None | 50/min, 100/min |
| **Indexing** | `/api/index`, `/api/test-index` | Secret | 10/min, 5/min |
| **Metrics** | `/api/metrics/requests`, `/api/metrics/operations`, `/api/metrics/summary` | Secret | 100/min |
| **Health** | `/health`, `/` | None | 100/min |

## Key Features

### Hybrid Search with RRF
Combines vector semantic search + BM25 full-text with Reciprocal Rank Fusion (RRF)
- Search modes: `hybrid` (default), `semantic`, `keyword`
- Configurable result limits (1-100)
- Optional filters by domain, language, country, mobile

### Comprehensive Metrics & Observability
- Request-level timing for all endpoints
- Operation-level timing for internal processes
- Queryable via `/api/metrics/*` endpoints
- Per-endpoint slowness tracking
- Success rate and error tracking

### Dual Webhook Support
- **Firecrawl webhooks:** Web scraping results with document content
- **changedetection.io webhooks:** Content change notifications
- Independent HMAC-SHA256 signature verification
- Automatic rescrape job enqueuing

### Production-Ready Security
- Constant-time comparison for tokens and signatures
- Early signature validation (before body parsing)
- Configurable CORS origins (default: *, configure for production)
- Per-IP rate limiting
- Request ID tracking for tracing
- Global exception handling with logging

### Safe Testing Endpoint
`/api/test-index` provides synchronous indexing with:
- Step-by-step timing breakdown
- Never throws 500 errors (errors in response body)
- Useful for debugging without inspecting job queues

## Authentication

### 1. Bearer Token (API Secret)
```
Authorization: Bearer <WEBHOOK_API_SECRET>
```
Applied to: `/api/search`, `/api/index`, `/api/test-index`, `/api/metrics/*`

### 2. Firecrawl HMAC Signature
```
X-Firecrawl-Signature: sha256=<hex_digest>
```
Applied to: `/api/webhook/firecrawl`

### 3. Custom Signature Header
```
X-Signature: sha256=<hex_digest>
```
Applied to: `/api/webhook/changedetection`

## Middleware Stack

All requests pass through this middleware stack (in order):

1. **CORSMiddleware** - Cross-origin request validation
2. **SlowAPIMiddleware** - Redis-backed rate limiting
3. **TimingMiddleware** - Request timing and metrics
4. **HTTP Logging Middleware** - Webhook payload logging
5. **Router Handler** - Execute endpoint
6. **Global Exception Handler** - Error handling

## Rate Limiting

**Backend:** Redis (per-IP tracking)  
**Default:** 100 requests/minute  
**Sliding Window:** 1-minute window  

**Per-Endpoint Custom Limits:**
- `/api/search`: 50/minute
- `/api/index`: 10/minute (DEPRECATED)
- `/api/test-index`: 5/minute
- `/api/webhook/*`: EXEMPT (signature verification + internal service)
- All others: 100/minute (default)

## Quick Start Examples

### Health Check
```bash
curl http://localhost:50108/health
```

### Search Documents
```bash
curl -X POST http://localhost:50108/api/search \
  -H "Authorization: Bearer YOUR_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "machine learning",
    "mode": "hybrid",
    "limit": 10
  }'
```

### Test Indexing
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
    "statusCode": 200
  }'
```

### Get Metrics
```bash
curl "http://localhost:50108/api/metrics/requests?limit=10&hours=24" \
  -H "Authorization: Bearer YOUR_SECRET"
```

## Database Tables

### RequestMetric (Timing Middleware)
Stores all HTTP request timings automatically.

**Queryable via:** `/api/metrics/requests`  
**Fields:** id, timestamp, method, path, status_code, duration_ms, request_id, client_ip, user_agent, extra_metadata

### OperationMetric (Operation Tracking)
Stores internal operation timings (embedding, indexing, search).

**Queryable via:** `/api/metrics/operations`  
**Fields:** id, timestamp, operation_type, operation_name, duration_ms, success, error_message, request_id, job_id, document_url

### ChangeEvent (Change Detection)
Stores detected content changes from changedetection.io.

**Updated by:** `/api/webhook/changedetection`  
**Fields:** id, watch_id, watch_url, detected_at, diff_summary, snapshot_url, rescrape_status, rescrape_job_id, extra_metadata

## Environment Variables

### Required
```env
WEBHOOK_API_SECRET=<your-api-secret>
WEBHOOK_SECRET=<your-webhook-secret>
WEBHOOK_DATABASE_URL=postgresql+asyncpg://...
WEBHOOK_REDIS_URL=redis://...
WEBHOOK_QDRANT_URL=http://...
WEBHOOK_TEI_URL=http://...
```

### Recommended
```env
WEBHOOK_CORS_ORIGINS=https://app.example.com,https://admin.example.com
WEBHOOK_PORT=50108
LOG_LEVEL=INFO
WEBHOOK_ENABLE_WORKER=true
```

## Status Codes

| Code | Meaning | When |
|------|---------|------|
| 200 | OK | Successful GET/POST (sync) |
| 202 | Accepted | Request queued for async processing |
| 400 | Bad Request | Invalid signature format, parse error |
| 401 | Unauthorized | Missing/invalid auth header |
| 422 | Validation Error | Schema validation failed |
| 429 | Rate Limited | Too many requests |
| 500 | Server Error | Internal error |

## OpenAPI Documentation

Interactive API documentation is available at:
- **Swagger UI:** `http://localhost:50108/docs`
- **ReDoc:** `http://localhost:50108/redoc`
- **OpenAPI JSON:** `http://localhost:50108/openapi.json`

## Debugging & Monitoring

### Health Status
```bash
curl http://localhost:50108/health | jq
```

Shows status of:
- Redis (cache/queue)
- Qdrant (vector database)
- TEI (embeddings service)

### Request Metrics
```bash
curl "http://localhost:50108/api/metrics/requests?hours=24" \
  -H "Authorization: Bearer YOUR_SECRET" | jq
```

Shows:
- All requests with timing
- Average/min/max duration
- Error counts

### Operation Metrics
```bash
curl "http://localhost:50108/api/metrics/operations?hours=24" \
  -H "Authorization: Bearer YOUR_SECRET" | jq
```

Shows:
- Internal operations (embedding, indexing, search)
- Success/failure rates
- Slowest operations

## Design Patterns

### Router Composition
Five routers organized by feature, composed in `api/__init__.py`:
- `search.router` - Search functionality
- `webhook.router` - Webhook reception
- `indexing.router` - Document indexing
- `metrics.router` - Performance metrics
- `health.router` - Health checks

### Dependency Injection
All external dependencies injected via FastAPI's `Depends()`:
- Authentication dependencies for protection
- Service dependencies for functionality
- Infrastructure dependencies for databases

### Middleware Layering
Multiple middleware for different concerns:
- Security (CORS, rate limiting, signatures)
- Observability (timing, logging)
- Error handling (global exception handler)

## Files in This Repository

**Documentation:**
- `webhook-api-endpoints.md` (19 KB) - Complete endpoint specifications
- `webhook-routing-architecture.md` (16 KB) - Router design and request flows
- `webhook-api-quick-reference.md` (11 KB) - Practical quick reference
- `webhook-quick-reference.md` - Alternative quick reference
- `WEBHOOK_API_INDEX.md` - This file

**Additional Resources:**
- `webhook-configuration-deployment-analysis.md` - Configuration details
- `webhook-worker-architecture.md` - Background job processing
- `webhook-worker-flow-diagrams.md` - Job queue flow diagrams

## Related Documentation

- **[MCP Integration](mcp/SEARCH.md)** - Using search via MCP
- **[Changedetection Integration](CHANGEDETECTION_INTEGRATION.md)** - Setup guide
- **[External Services](external-services.md)** - GPU services (TEI, Qdrant)
- **[Service Ports](services-ports.md)** - Container and service URLs

## Support & Troubleshooting

### Common Issues

1. **401 Unauthorized on /api/search**
   - Check `Authorization: Bearer <token>` header
   - Verify `WEBHOOK_API_SECRET` matches

2. **401 Unauthorized on /api/webhook/firecrawl**
   - Check `X-Firecrawl-Signature` header
   - Verify `WEBHOOK_SECRET` matches
   - Ensure signature computed over raw body

3. **422 Validation Error on webhook**
   - Check request body schema matches `FirecrawlWebhookEvent`
   - Verify nested metadata structure
   - See error details in response body

4. **429 Rate Limited**
   - Check remaining quota in headers: `X-RateLimit-Remaining`
   - Wait time in `Retry-After` header
   - Rate limits are per-IP, sliding 1-minute window

5. **Slow search requests**
   - Check `/api/metrics/requests` for timing breakdown
   - Consider using `semantic` or `keyword` mode instead of `hybrid`
   - Check TEI and Qdrant health via `/health`

### Debugging

1. **Check Health:** `curl http://localhost:50108/health`
2. **Check Request Metrics:** `/api/metrics/requests` shows all requests with timing
3. **Check Operation Metrics:** `/api/metrics/operations` shows internal operations
4. **Check Logs:** Application logs contain detailed error messages
5. **Use Request ID:** Every response includes `X-Request-ID` header for tracing

## Contributing

When contributing to the webhook server:
- Maintain existing endpoint signatures for backward compatibility
- Add tests for new endpoints
- Update documentation when changing behavior
- Follow FastAPI best practices
- Use type hints throughout

