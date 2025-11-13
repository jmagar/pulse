# Webhook Server: Quick Reference Guide

## Service Overview

**Service Name:** `pulse_webhook`  
**Language:** Python 3.13  
**Framework:** FastAPI  
**Container Port:** 52100 (exposed as 50108 on host)  
**Purpose:** Hybrid semantic/BM25 search bridge for Firecrawl  
**Status:** Production-ready with health checks

## Essential Configuration

### Secrets (MUST BE SET IN PRODUCTION)

```bash
# Generate secure secrets
WEBHOOK_API_SECRET=$(openssl rand -hex 32)
WEBHOOK_SECRET=$(openssl rand -hex 32)

# Validation:
# - Minimum 32 characters in production
# - No weak defaults (dev-unsafe-*, changeme, secret)
# - No leading/trailing whitespace
```

### CORS Configuration

```env
# Development (localhost only)
WEBHOOK_CORS_ORIGINS=http://localhost:3000

# Production (explicit origins, NEVER use *)
WEBHOOK_CORS_ORIGINS='["https://app.example.com", "https://api.example.com"]'

# Or comma-separated
WEBHOOK_CORS_ORIGINS=https://app.example.com,https://api.example.com
```

### Infrastructure Endpoints

```env
# PostgreSQL (timing metrics)
WEBHOOK_DATABASE_URL=postgresql+asyncpg://user:pass@postgres:5432/webhook

# Redis (background jobs)
WEBHOOK_REDIS_URL=redis://redis:6379

# Qdrant (vector storage)
WEBHOOK_QDRANT_URL=http://qdrant:6333
WEBHOOK_QDRANT_COLLECTION=pulse_docs
WEBHOOK_VECTOR_DIM=1024

# TEI (text embeddings)
WEBHOOK_TEI_URL=http://tei:80
WEBHOOK_EMBEDDING_MODEL=Qwen/Qwen3-Embedding-0.6B

# Firecrawl (rescraping)
WEBHOOK_FIRECRAWL_API_URL=http://firecrawl:3002
WEBHOOK_FIRECRAWL_API_KEY=self-hosted-no-auth
```

### Worker Configuration

```env
# Use external worker container (RECOMMENDED)
WEBHOOK_ENABLE_WORKER=false

# Or use embedded worker (development only)
WEBHOOK_ENABLE_WORKER=true
```

## Health Check

```bash
# Docker health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:52100/health

# Manual check
curl -s http://localhost:50108/health | jq .
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
  "timestamp": "02:34:56 PM | 11/13/2025"
}
```

## API Endpoints

### Authentication

All endpoints except `/health` and `/` require authentication:

```bash
# Bearer token
curl -H "Authorization: Bearer $WEBHOOK_API_SECRET" \
     http://localhost:50108/api/search

# Or raw token (backward compatible)
curl -H "Authorization: $WEBHOOK_API_SECRET" \
     http://localhost:50108/api/search
```

### Public Endpoints (No Auth)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/` | GET | Service info |
| `/health` | GET | Health check |
| `/docs` | GET | API documentation |
| `/metrics/stats` | GET | Index statistics |

### Protected Endpoints (API Secret Required)

| Endpoint | Method | Purpose | Rate Limit |
|----------|--------|---------|-----------|
| `/api/search` | POST | Search documents | 50/min |
| `/api/index` | POST | Index document | 100/min |
| `/api/webhook/firecrawl` | POST | Webhook (signature auth) | Exempt |

## Docker Compose

### Single Container (Embedded Worker)

```yaml
pulse_webhook:
  image: pulse_webhook:latest
  container_name: pulse_webhook
  ports:
    - "50108:52100"
  environment:
    - WEBHOOK_ENABLE_WORKER=true
    - WEBHOOK_API_SECRET=${WEBHOOK_API_SECRET}
    - WEBHOOK_SECRET=${WEBHOOK_SECRET}
  depends_on:
    - pulse_postgres
    - pulse_redis
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:52100/health"]
    interval: 30s
    timeout: 10s
    retries: 3
    start_period: 40s
```

### Two Containers (Recommended - External Worker)

**API Server:**
```yaml
pulse_webhook:
  # WEBHOOK_ENABLE_WORKER=false
  ports:
    - "50108:52100"
```

**Worker Process:**
```yaml
pulse_webhook-worker:
  command:
    - python
    - -m
    - rq.cli
    - worker
    - --url
    - redis://pulse_redis:6379
    - --name
    - search-bridge-worker
    - --worker-ttl
    - "600"
    - indexing
  # No ports, no healthcheck
  # No external access needed
```

## Logging Configuration

### Log Levels

```env
WEBHOOK_LOG_LEVEL=DEBUG    # Detailed diagnostic info
WEBHOOK_LOG_LEVEL=INFO     # General info (default)
WEBHOOK_LOG_LEVEL=WARNING  # Warnings and errors
WEBHOOK_LOG_LEVEL=ERROR    # Errors only
```

### Log Format

Structured logging with EST timestamps:

```
timestamp=02:34:56 PM | 11/13/2025
event=Request completed
method=POST
path=/api/search
status_code=200
duration_ms=125.45
request_id=550e8400-e29b-41d4-a716-446655440000
```

## Search Configuration

### Hybrid Search Alpha

```env
# Vector-only search
WEBHOOK_HYBRID_ALPHA=1.0

# Balanced (recommended)
WEBHOOK_HYBRID_ALPHA=0.5

# BM25-only search
WEBHOOK_HYBRID_ALPHA=0.0
```

### BM25 Parameters

```env
# Saturation parameter (typical: 1.2-2.0)
WEBHOOK_BM25_K1=1.5

# Length normalization (typical: 0.5-1.0)
WEBHOOK_BM25_B=0.75
```

### RRF Fusion

```env
# Reciprocal Rank Fusion constant (standard: 60)
WEBHOOK_RRF_K=60
```

## Text Chunking

### Token-Based Chunking

```env
# Maximum tokens per chunk (must match model limit)
WEBHOOK_MAX_CHUNK_TOKENS=256

# Overlap between chunks (for context)
WEBHOOK_CHUNK_OVERLAP_TOKENS=50
```

## Rate Limiting

**Default:** 100 requests/minute per IP address

**Per-Endpoint:**
- `/api/search` - 50/minute
- `/api/webhook/firecrawl` - Exempt (signature verified)
- All others - 100/minute

**Storage:** Redis backend

## Test Mode

**Enable test stubs (skip external services):**

```env
WEBHOOK_TEST_MODE=true
```

**Stubs for:**
- Redis (/ping only)
- Qdrant (health checks only)
- TEI (health checks only)
- Indexing (stub results)
- Search (stub results)

## Database Migrations

### PostgreSQL Connection

```env
WEBHOOK_DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/db
```

### Schema

- Database: `webhook` (PostgreSQL schema)
- Tables:
  - `request_metrics` - HTTP request timings
  - `operation_metrics` - Service operation timings
  - `change_events` - changedetection.io events

### Migrations

```bash
# Apply migrations
alembic upgrade head

# Create new migration
alembic revision --autogenerate -m "description"

# Check status
alembic current
```

## Troubleshooting

### Service Won't Start

1. Check secrets are set:
   ```bash
   echo $WEBHOOK_API_SECRET
   echo $WEBHOOK_SECRET
   ```

2. Check database connection:
   ```bash
   psql postgresql+asyncpg://user:pass@host/db
   ```

3. Check Redis connection:
   ```bash
   redis-cli ping
   ```

4. View logs:
   ```bash
   docker logs pulse_webhook
   ```

### Health Check Failing

1. Check individual services:
   ```bash
   # Redis
   redis-cli ping
   
   # Qdrant
   curl http://localhost:6333/health
   
   # TEI
   curl http://localhost:8080/health
   ```

2. Check service URLs in config:
   ```bash
   echo $WEBHOOK_QDRANT_URL
   echo $WEBHOOK_TEI_URL
   echo $WEBHOOK_REDIS_URL
   ```

### High Memory Usage

- Set `WEBHOOK_ENABLE_WORKER=false` (use external worker)
- Reduce `pool_size` in database.py
- Increase batch size for embeddings

### Search Returns No Results

1. Check index is populated:
   ```bash
   curl -H "Authorization: Bearer $WEBHOOK_API_SECRET" \
        http://localhost:50108/metrics/stats
   ```

2. Check search parameters:
   - `mode` - hybrid, semantic, bm25, keyword
   - `limit` - max results (default: 10)

3. Verify Qdrant collection exists:
   ```bash
   curl http://localhost:6333/collections
   ```

## Performance Tuning

### Database Connection Pool

```python
# In infra/database.py
engine = create_async_engine(
    database_url,
    pool_size=20,      # Increase for high concurrency
    max_overflow=10,   # Additional connections when pool full
    pool_pre_ping=True,  # Verify connections before use
)
```

### Search Performance

- `WEBHOOK_HYBRID_ALPHA=1.0` - Vector only (faster, less accurate)
- `WEBHOOK_HYBRID_ALPHA=0.0` - BM25 only (slower, more accurate)
- Reduce `WEBHOOK_VECTOR_DIM` for smaller vectors (less storage)

### Chunk Size

- Larger chunks (`MAX_CHUNK_TOKENS=512`) - Fewer embeddings, coarser search
- Smaller chunks (`MAX_CHUNK_TOKENS=128`) - More embeddings, finer search
- Increase `CHUNK_OVERLAP_TOKENS` for better context (at cost of more data)

## Version Information

- **Python:** 3.13 minimum
- **FastAPI:** >= 0.121.1
- **Uvicorn:** >= 0.38.0
- **SQLAlchemy:** >= 2.0.44 (async)
- **Qdrant Client:** >= 1.15.1
- **Package Manager:** uv (NOT pip)

## File Locations

```
/compose/pulse/apps/webhook/
├── main.py                 # FastAPI application
├── config.py              # Configuration (Pydantic Settings)
├── Dockerfile             # Docker build
├── pyproject.toml         # Dependencies
├── api/
│   ├── deps.py            # Dependency injection
│   ├── middleware/        # Custom middleware
│   ├── routers/           # API endpoints
│   └── schemas/           # Request/response models
├── services/              # Business logic
├── infra/                 # Infrastructure (DB, Redis, rate limit)
├── domain/                # Database models
├── utils/                 # Utilities (logging, etc)
├── workers/               # Background job workers
├── alembic/               # Database migrations
└── tests/                 # Test suite
```

## Environment Variables Summary

**Count:** 40+  
**Critical (Production):** 3 (API_SECRET, WEBHOOK_SECRET, CORS_ORIGINS)  
**Infrastructure:** 8 (Database, Redis, Qdrant, TEI, etc.)  
**Feature Toggles:** 2 (ENABLE_WORKER, TEST_MODE)  
**Performance:** 6 (Chunk tokens, Alpha, K1, B, RRF_K, etc.)

## External Service Dependencies

| Service | Port | Protocol | Used For |
|---------|------|----------|----------|
| PostgreSQL | 5432 | SQL/async | Timing metrics |
| Redis | 6379 | TCP | Background jobs, rate limiting |
| Qdrant | 6333 | HTTP | Vector search |
| TEI | 80 | HTTP | Text embeddings |
| Firecrawl | 3002 | HTTP | Rescraping |
| changedetection.io | 5000 | HTTP | Change monitoring |

All URLs must be accessible from container network.
