# Webhook Search Bridge

A production-ready FastAPI service providing hybrid search (vector + keyword) capabilities for Firecrawl-crawled web content.

## Overview

The webhook service indexes scraped web content and provides semantic + keyword search with intelligent result fusion. It integrates with Firecrawl API for web scraping, changedetection.io for change monitoring, and provides comprehensive metrics and monitoring.

**Service:** `pulse_webhook` (API) + `pulse_webhook-worker` (optional background worker)
**Internal Port:** 52100 | **External Port:** 50108 (configurable)
**Tech Stack:** Python 3.13, FastAPI 0.121+, SQLAlchemy 2.0 (async), Redis Queue, Qdrant, PostgreSQL

---

## Quick Start

### Development (with embedded worker)

```bash
# Install dependencies
cd apps/webhook
uv sync

# Configure environment
cp ../../.env.example ../../.env
# Edit .env with your settings

# Run database migrations
uv run alembic upgrade head

# Start development server
uv run uvicorn main:app --host 0.0.0.0 --port 52100 --reload
```

### Production (Docker Compose)

```bash
# From project root
docker compose up -d pulse_webhook pulse_webhook-worker

# Check health
curl http://localhost:50108/health
```

### Basic Usage

```bash
# Search indexed content (hybrid mode)
curl -X POST http://localhost:50108/api/search \
  -H "Authorization: Bearer YOUR_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "python async patterns",
    "mode": "hybrid",
    "limit": 10
  }'

# Get index statistics
curl http://localhost:50108/api/stats \
  -H "Authorization: Bearer YOUR_SECRET"
```

---

## Project Structure

```
apps/webhook/
├── main.py                     # FastAPI application entry point
├── config.py                   # Pydantic settings with env validation
├── worker.py                   # Standalone RQ worker (external mode)
├── worker_thread.py            # Embedded worker thread (dev mode)
│
├── api/                        # HTTP layer
│   ├── deps.py                 # FastAPI dependencies & auth
│   ├── middleware/             # Timing, logging, CORS, rate limiting
│   ├── routers/                # 5 routers (webhooks, search, indexing, metrics, health)
│   └── schemas/                # Request/response Pydantic models
│
├── domain/                     # Data models
│   └── models.py               # SQLAlchemy ORM (3 tables: metrics + events)
│
├── services/                   # Business logic
│   ├── search_orchestrator.py # Hybrid search with RRF fusion
│   ├── indexing_service.py    # Document chunking + embedding + indexing
│   ├── embedding_service.py   # Text embeddings via HF TEI
│   ├── vector_store.py         # Qdrant vector database client
│   └── bm25_engine.py          # Keyword search with BM25 algorithm
│
├── workers/                    # Background jobs
│   ├── jobs.py                 # RQ job definitions (indexing, rescraping)
│   ├── service_pool.py         # Singleton service instances (1000x faster)
│   └── cleanup.py              # Zombie job cleanup
│
├── infra/                      # Infrastructure
│   ├── database.py             # Async SQLAlchemy setup + session management
│   ├── rate_limit.py           # Redis-backed rate limiting
│   └── redis_connection.py     # Redis client singleton
│
├── clients/                    # External service clients
│   └── firecrawl.py            # Firecrawl API client
│
├── utils/                      # Shared utilities
│   ├── logging.py              # Structured logging (structlog)
│   ├── timing.py               # Operation timing context manager
│   ├── service_status.py       # Health check helpers
│   └── content_metrics.py      # Webhook payload summarization
│
├── alembic/                    # Database migrations
│   └── versions/               # 3 migrations (initial, schema move, change events)
│
├── tests/                      # Test suite (8K+ LOC)
│   ├── unit/                   # 40 files - isolated unit tests
│   ├── integration/            # 11 files - end-to-end API tests
│   └── security/               # 3 files - timing attacks, SQL injection, DoS
│
├── scripts/                    # Maintenance scripts
│   └── migrate_metadata.py     # Legacy metadata migration
│
└── data/bm25/                  # BM25 index storage (persisted)
```

---

## Key Features

### Hybrid Search Architecture
- **Vector Search** (Qdrant): Semantic similarity via embeddings
- **Keyword Search** (BM25): Exact term matching with TF-IDF ranking
- **Result Fusion** (RRF): Reciprocal Rank Fusion combines both rankings

### Document Processing Pipeline
1. **Text Cleaning** - Remove control characters, normalize whitespace
2. **Token-Based Chunking** - semantic-text-splitter (Rust, 10-100x faster)
3. **Batch Embeddings** - HF Text Embeddings Inference (TEI)
4. **Parallel Indexing** - Qdrant (vector) + BM25 (keyword) simultaneously

### Background Worker System
- **Redis Queue (RQ)**: Job queue with 10min timeout
- **Service Pool Pattern**: Reuse expensive services (1000x performance boost)
- **Two Modes**: Embedded thread (dev) or standalone worker (prod)
- **Job Types**: Document indexing, URL rescraping

### Observability
- **Request Metrics**: HTTP method, path, status, duration → PostgreSQL
- **Operation Metrics**: Embedding, chunking, indexing timing → PostgreSQL
- **Structured Logging**: JSON logs with timestamps, request IDs, context
- **Health Checks**: Redis, Qdrant, TEI, PostgreSQL connectivity

---

## API Endpoints

### Webhooks (rate limit exempt)
- `POST /api/webhook/firecrawl` - Receive Firecrawl scrape results
- `POST /api/webhook/changedetection` - Receive change detection notifications

### Search (50/min)
- `POST /api/search` - Hybrid/semantic/keyword search
- `GET /api/stats` - Index statistics (document count, storage)

### Indexing (10/min, 5/min)
- `POST /api/index` - Queue async indexing job (DEPRECATED)
- `POST /api/test-index` - Sync indexing with timing breakdown

### Metrics (100/min)
- `GET /api/metrics/requests` - HTTP request timing data
- `GET /api/metrics/operations` - Operation-level performance
- `GET /api/metrics/summary` - Aggregated dashboard stats

### Health (100/min)
- `GET /health` - Service health check (Redis, Qdrant, TEI, DB)
- `GET /` - Root endpoint

---

## Configuration

All configuration via environment variables (see `../../.env.example` for complete reference).

### Core Settings

```bash
# Server
WEBHOOK_PORT=50108                    # External port
WEBHOOK_ENABLE_WORKER=false           # Embedded worker (true) or external (false)

# Database
WEBHOOK_DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/db

# Redis (job queue + rate limiting)
WEBHOOK_REDIS_URL=redis://localhost:6379

# Search Services
WEBHOOK_QDRANT_URL=http://qdrant:6333      # Vector database
WEBHOOK_TEI_URL=http://tei:8080            # Text embeddings

# Security
WEBHOOK_API_SECRET=your-secret-key-32-chars-minimum
WEBHOOK_FIRECRAWL_WEBHOOK_SECRET=firecrawl-webhook-secret
WEBHOOK_CHANGEDETECTION_SECRET=changedetection-webhook-secret

# Firecrawl Integration
WEBHOOK_FIRECRAWL_BASE_URL=http://firecrawl:3002
WEBHOOK_FIRECRAWL_API_KEY=self-hosted-auth
```

### Search Tuning

```bash
WEBHOOK_VECTOR_WEIGHT=0.6             # Vector search weight (0.0-1.0)
WEBHOOK_BM25_WEIGHT=0.4               # BM25 weight (0.0-1.0)
WEBHOOK_CHUNK_SIZE=800                # Tokens per chunk
WEBHOOK_CHUNK_OVERLAP=200             # Overlap between chunks
```

---

## Database Schema

### Tables (in `webhook` schema)

**`request_metrics`** - HTTP request timing
- Columns: id, timestamp, method, path, status_code, duration_ms, request_id, client_ip, user_agent
- Indexes: timestamp, method, path, status_code, duration_ms, request_id

**`operation_metrics`** - Operation-level performance
- Columns: id, timestamp, operation_type, operation_name, duration_ms, success, error_message, request_id, job_id, document_url
- Indexes: timestamp, operation_type, operation_name, duration_ms, success, request_id, job_id, document_url

**`change_events`** - Change detection tracking
- Columns: id, watch_id, watch_url, detected_at, diff_summary, snapshot_url, rescrape_job_id, rescrape_status, indexed_at
- Indexes: watch_id, detected_at

### Migrations

```bash
# Run migrations
uv run alembic upgrade head

# Check current version
uv run alembic current

# Create new migration
uv run alembic revision --autogenerate -m "description"
```

---

## Testing

```bash
# Run all tests
uv run pytest tests/

# Run with coverage
uv run pytest tests/ --cov=. --cov-report=html

# Run specific test suite
uv run pytest tests/unit/           # Unit tests only
uv run pytest tests/integration/    # Integration tests
uv run pytest tests/security/       # Security tests

# Run with external services (requires live Qdrant, TEI)
WEBHOOK_RUN_EXTERNAL_TESTS=1 uv run pytest tests/

# Skip database fixtures (faster unit tests)
WEBHOOK_SKIP_DB_FIXTURES=1 uv run pytest tests/unit/
```

**Test Coverage:** 85%+ (150+ tests across 54 files)

---

## Development Workflow

### Adding a New Endpoint

1. Define Pydantic schema in `api/schemas/`
2. Create route handler in `api/routers/`
3. Add business logic to `services/`
4. Write unit tests in `tests/unit/api/routers/`
5. Add integration test in `tests/integration/api/`
6. Update this README if public-facing

### Adding a Background Job

1. Define job function in `workers/jobs.py`
2. Enqueue job via `get_queue().enqueue(...)`
3. Use `get_service_pool()` for service instances
4. Add operation timing with `TimingContext`
5. Write job test in `tests/unit/workers/`

### Running Database Migrations

```bash
# After modifying domain/models.py
uv run alembic revision --autogenerate -m "add new column"

# Review generated migration in alembic/versions/
# Edit if needed (alembic doesn't catch everything)

# Apply migration
uv run alembic upgrade head
```

---

## Deployment

### Docker Build

```bash
# From project root
docker compose build pulse_webhook

# Or build manually
cd apps/webhook
docker build -t pulse_webhook .
```

### Environment Variables

Copy `.env.example` to `.env` and configure:
- Database credentials (PostgreSQL)
- Redis connection
- Qdrant URL (vector database)
- TEI URL (text embeddings service)
- API secrets (32+ characters)

### Health Checks

```bash
# API health
curl http://localhost:50108/health

# Check logs
docker logs pulse_webhook --tail 50

# Check worker (if external)
docker logs pulse_webhook-worker --tail 50
```

### Monitoring

```bash
# View request metrics (last 24h)
curl "http://localhost:50108/api/metrics/requests?hours=24" \
  -H "Authorization: Bearer YOUR_SECRET"

# View operation breakdown
curl "http://localhost:50108/api/metrics/operations?hours=24" \
  -H "Authorization: Bearer YOUR_SECRET"

# High-level summary
curl "http://localhost:50108/api/metrics/summary?hours=24" \
  -H "Authorization: Bearer YOUR_SECRET"
```

---

## Documentation

Comprehensive documentation available in `/compose/pulse/docs/services/webhook/`:

### Essential Guides
- **WEBHOOK_DOCUMENTATION_INDEX.md** - Navigation guide to all docs
- **webhook-quick-reference.md** - Daily reference for developers
- **webhook-configuration-deployment-analysis.md** - Complete technical reference

### API & Architecture
- **webhook-api-endpoints.md** - Full API specification with examples
- **webhook-api-quick-reference.md** - Endpoint summary table
- **webhook-routing-architecture.md** - Router organization and middleware

### Data & Search
- **webhook-database-analysis.md** - Database models, schema, migrations
- **webhook-search-architecture.md** - Hybrid search implementation details
- **webhook-search-quick-reference.md** - Search modes and parameters

### Workers & Background Jobs
- **webhook-worker-architecture.md** - Worker design and service pool
- **webhook-worker-flow-diagrams.md** - Job processing workflows
- **webhook-worker-quick-reference.md** - Worker commands and monitoring

### Testing
- **test-analysis-webhook-2025-11-13.md** - Test suite analysis
- **test-fixtures-webhook-reference.md** - Fixture documentation
- **webhook-test-coverage-analysis.md** - Coverage gaps and recommendations

---

## Troubleshooting

### Common Issues

**Service won't start**
```bash
# Check dependencies
docker compose ps pulse_postgres pulse_redis

# Check logs for errors
docker logs pulse_webhook

# Verify environment variables
docker exec pulse_webhook env | grep WEBHOOK_
```

**Search returns no results**
```bash
# Check index stats
curl http://localhost:50108/api/stats \
  -H "Authorization: Bearer YOUR_SECRET"

# Verify Qdrant connectivity
curl http://localhost:50108/health

# Check if documents were indexed
docker logs pulse_webhook | grep "indexed successfully"
```

**Slow search performance**
- Check `WEBHOOK_VECTOR_WEIGHT` and `WEBHOOK_BM25_WEIGHT` (adjust ratio)
- Reduce `limit` parameter in search requests
- Verify TEI service is GPU-accelerated
- Check Qdrant query time in operation metrics

**Worker jobs failing**
```bash
# Check worker logs
docker logs pulse_webhook-worker

# Verify Redis connectivity
redis-cli -h localhost -p 50104 PING

# Check job queue depth
redis-cli -h localhost -p 50104 LLEN rq:queue:indexing

# Inspect failed jobs
redis-cli -h localhost -p 50104 LRANGE rq:queue:failed 0 -1
```

---

## Performance

### Benchmarks (typical deployment)

- **Semantic Search**: 100-300ms (depends on Qdrant + TEI latency)
- **Keyword Search**: 1-10ms (in-memory BM25)
- **Hybrid Search**: 100-300ms (vector search dominates)
- **Document Indexing**: 2-5 seconds per document (chunking + embedding + indexing)

### Optimization Tips

1. **Use GPU for TEI**: 10x faster embeddings (CPU: 500ms, GPU: 50ms)
2. **Tune chunk size**: Smaller chunks = more precise, larger chunks = faster
3. **Adjust search weights**: Increase BM25 weight for keyword-heavy queries
4. **Enable worker pool**: Reuse services for 1000x performance boost
5. **Use external worker**: Scale workers independently from API

---

## Contributing

### Code Style
- **Formatter**: Ruff (PEP 8, 100 char lines)
- **Type Hints**: Required on all functions (mypy strict mode)
- **Docstrings**: XML-style for public functions

### Pull Request Checklist
- [ ] Tests pass (`uv run pytest tests/`)
- [ ] Type checking passes (`uv run mypy .`)
- [ ] Linting passes (`uv run ruff check .`)
- [ ] Coverage maintained (85%+)
- [ ] Documentation updated (if public API changed)
- [ ] Migration created (if models changed)

---

## License

Part of the Pulse monorepo. See root LICENSE file.

---

## Support

For issues, questions, or contributions, see the main Pulse repository documentation.

**Service Owner:** Webhook Search Bridge Team
**Last Updated:** 11/13/2025
**Version:** 1.0.0 (Production Ready)
