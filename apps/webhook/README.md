# Firecrawl Search Bridge

A semantic search service that bridges Firecrawl web scraping with vector search capabilities using HuggingFace Text Embeddings Inference (TEI) and Qdrant.

## Architecture

The Search Bridge runs as a single FastAPI application with an embedded background worker thread:

- **API Server**: FastAPI application handling HTTP requests (webhooks, search, stats)
- **Background Worker**: RQ worker thread processing indexing jobs from Redis queue
- **BM25 Engine**: Shared in-memory instance used by both API and worker
- **Vector Store**: Qdrant for semantic search
- **Embedding Service**: TEI for generating text embeddings

The worker thread starts automatically during FastAPI startup and shares all services with the API, eliminating file synchronization complexity.

```
Firecrawl → Search Bridge (API + Worker Thread) → Redis Queue → HuggingFace TEI (embeddings)
                                                                 ├─> Qdrant (vector storage)
                                                                 └─> BM25 (keyword search)
```

## Features

- **Hybrid Search**: Combines vector similarity (semantic) + BM25 (keyword) using Reciprocal Rank Fusion (RRF)
- **Token-based Chunking**: Intelligent text splitting using actual token counts (not characters)
- **Async Processing**: Background job queue for non-blocking document indexing
- **Rich Filtering**: Domain, language, country, mobile device filters
- **Multiple Search Modes**: Hybrid, semantic-only, keyword-only, BM25-only

## Quick Start

### Prerequisites

- Python 3.12+
- Docker & Docker Compose
- UV package manager

### Installation

Run from monorepo root:

```bash
# Copy environment template
cp .env.example .env
# Edit .env with your configuration

# Install dependencies
pnpm install:webhook

# Start all services via Docker Compose
pnpm services:up
```

For standalone deployment, see root `docker-compose.yaml` for service definition.

### API Endpoints

- `POST /api/index` - Queue document for indexing
- `POST /api/search` - Search indexed documents
- `GET /health` - Health check
- `GET /api/stats` - Index statistics

## Configuration

### Port Allocation

| Port  | Service | Description |
|-------|---------|-------------|
| 52100 | search-bridge | FastAPI REST API |
| 52101 | redis | Redis Queue |
| 52102 | qdrant | Qdrant HTTP API |
| 52103 | qdrant | Qdrant gRPC API |
| 52104 | tei | HuggingFace TEI |

### Firecrawl Integration

Update Firecrawl's `.env` (on steamy-wsl):

```bash
ENABLE_SEARCH_INDEX=true
SEARCH_SERVICE_URL=http://<IP_OF_THIS_MACHINE>:52100
SEARCH_SERVICE_API_SECRET=your-secret-key
SEARCH_INDEX_SAMPLE_RATE=0.1
```

To find this machine's IP:
```bash
hostname -I | awk '{print $1}'
```

## Deployment

### Docker Compose (Recommended)

```yaml
services:
  firecrawl_webhook:
    build: ./apps/webhook
    ports:
      - "52100:52100"
    environment:
      WEBHOOK_REDIS_URL: redis://firecrawl_cache:6379
      WEBHOOK_QDRANT_URL: http://qdrant:6333
      WEBHOOK_TEI_URL: http://tei:80
      WEBHOOK_ENABLE_WORKER: "true"  # Enable background worker
    depends_on:
      - firecrawl_cache
      - qdrant
      - tei
```

### Disable Worker (API Only)

To run only the API without the background worker:

```bash
WEBHOOK_ENABLE_WORKER=false uvicorn main:app --host 0.0.0.0 --port 52100
```

This is useful for:
- Development/testing the API independently
- Scaling API and worker separately (run worker in separate process)
- Debugging API without worker interference

## Development

### Setup

```bash
# Install all dependencies (Node.js and Python)
pnpm install
pnpm install:webhook
```

### Running Services

```bash
# Start all Docker services
pnpm services:up

# Run API server in development mode
pnpm dev:webhook

# Run background worker (deprecated - now embedded in API)
pnpm worker:webhook

# Stop all services
pnpm services:down
```

### Code Quality

```bash
# Run tests
pnpm test:webhook

# Format code
pnpm format:webhook

# Lint code
pnpm lint:webhook

# Type check
pnpm typecheck:webhook

# Run all checks (format, lint, typecheck)
pnpm check
```

### External Integration Tests

Most webhook tests run against in-memory doubles for Redis, Qdrant, and the embedding
service. To exercise the real infrastructure, set the environment flag and target the
`external` marker:

```bash
export WEBHOOK_RUN_EXTERNAL_TESTS=1
cd apps/webhook && uv run pytest -m external
```

Tests marked with `@pytest.mark.external` will be skipped automatically unless the
`WEBHOOK_RUN_EXTERNAL_TESTS` variable is truthy ("1", "true", "yes", or "on").

## Project Structure

The webhook service uses a **flattened structure** with all modules at the root level:

```
apps/webhook/
├── main.py                  # FastAPI application entrypoint
├── config.py                # Settings and configuration
├── worker.py                # Background worker
├── worker_thread.py         # Embedded worker thread
├── api/                     # API layer
│   ├── routers/             # HTTP endpoints
│   │   ├── indexing.py      # Index endpoints
│   │   ├── search.py        # Search endpoints
│   │   ├── metrics.py       # Stats/metrics endpoints
│   │   ├── webhook.py       # Webhook endpoints (changedetection)
│   │   └── health.py        # Health check endpoint
│   ├── schemas/             # Pydantic request/response models
│   │   ├── search.py        # Search models
│   │   ├── indexing.py      # Index models
│   │   └── webhook.py       # Webhook models
│   ├── middleware/          # FastAPI middleware
│   └── deps.py              # Shared FastAPI dependencies
├── services/                # Business logic layer
│   ├── embedding.py         # HF TEI client
│   ├── vector_store.py      # Qdrant client
│   ├── bm25_engine.py       # BM25 indexing
│   ├── search.py            # Hybrid search orchestrator
│   └── indexing.py          # Document processing
├── workers/                 # Background job handlers
│   └── jobs.py              # Indexing and rescrape jobs
├── domain/                  # Domain layer
│   └── models.py            # SQLAlchemy ORM models (RequestMetric, etc.)
├── clients/                 # External API clients
│   └── firecrawl.py         # Firecrawl API client
├── infra/                   # Infrastructure layer
│   └── database/            # Database setup
│       └── session.py       # SQLAlchemy session management
├── utils/                   # Utilities
│   ├── text_processing.py   # Token-based chunking
│   ├── url.py               # URL normalization
│   ├── logging.py           # Structured logging
│   └── timing.py            # Timing context managers
├── alembic/                 # Database migrations
├── tests/                   # Test suite
│   ├── unit/                # Unit tests
│   └── integration/         # Integration tests
├── pyproject.toml           # Python dependencies (uv)
├── Dockerfile               # Production container
└── README.md
```

### Import Conventions

The service uses **relative imports** from the root level:

```python
# API routers and schemas
from api.routers.search import router as search_router
from api.routers.indexing import router as indexing_router
from api.schemas.search import SearchRequest, SearchResponse
from api.schemas.indexing import IndexRequest, IndexResponse
from api.deps import get_settings

# Services
from services.embedding import EmbeddingService
from services.vector_store import VectorStoreService
from services.search import SearchOrchestrator
from services.indexing import IndexingService

# Domain models (SQLAlchemy ORM)
from domain.models import RequestMetric

# Workers
from workers.jobs import index_document_job, rescrape_job

# Clients
from clients.firecrawl import FirecrawlClient

# Utils
from utils.url import normalize_url
from utils.timing import timing_context
from utils.text_processing import chunk_text

# Config
from config import Settings
```

**Key principle:** All imports are relative to `/apps/webhook/` (the root of this service). No `PYTHONPATH` manipulation required.
```

## Search Modes

### 1. Hybrid (Default)
Combines vector similarity + BM25 using RRF:
```json
{
  "query": "machine learning",
  "mode": "hybrid",
  "limit": 10
}
```

### 2. Semantic Only
Pure vector similarity:
```json
{
  "query": "machine learning",
  "mode": "semantic"
}
```

### 3. Keyword / BM25
Traditional keyword search:
```json
{
  "query": "machine learning",
  "mode": "keyword"
}
```

## Monitoring

```bash
# View service logs
pnpm services:logs

# Check health
curl http://localhost:52100/health

# View stats
curl http://localhost:52100/api/stats
```

## changedetection.io Integration

The webhook bridge integrates with changedetection.io for automated website monitoring and rescraping:

### Features

- **Webhook Endpoint:** `POST /api/webhook/changedetection` accepts change notifications
- **HMAC Verification:** Validates webhook signatures using SHA256
- **Change Event Tracking:** Stores events in `webhook.change_events` table
- **Automatic Rescraping:** Queues Firecrawl API calls for changed URLs
- **Search Re-indexing:** Updates Qdrant + BM25 with latest content

### Rescrape Job

**Location:** `workers/jobs.py` (rescrape_job function)

The rescrape job handles URLs detected as changed by changedetection.io:

1. Fetches change event from `webhook.change_events` table
2. Calls Firecrawl API to rescrape the URL with latest content
3. Indexes markdown content in Qdrant vector store
4. Updates BM25 engine with fresh text
5. Marks change event as `completed` or `failed` with metadata

**Configuration:**
```bash
WEBHOOK_FIRECRAWL_API_URL=http://firecrawl:3002
WEBHOOK_FIRECRAWL_API_KEY=self-hosted-no-auth
```

### ChangeEvent Model

**Location:** `domain/models.py` (SQLAlchemy ORM model)

The `ChangeEvent` model tracks change detection events:

| Field | Type | Description |
|-------|------|-------------|
| `id` | Integer | Primary key |
| `watch_id` | String | UUID from changedetection.io |
| `watch_url` | String | URL being monitored |
| `detected_at` | DateTime | When change was detected |
| `diff_summary` | Text | First 500 chars of diff |
| `snapshot_url` | String | Link to view full diff |
| `rescrape_job_id` | String | RQ job ID |
| `rescrape_status` | String | `queued`, `in_progress`, `completed`, `failed` |
| `indexed_at` | DateTime | When content was re-indexed |
| `metadata` | JSONB | Additional metadata (signature, error details) |

**Indexes:**
- `idx_change_events_watch_id` - Fast lookup by watch
- `idx_change_events_detected_at` - Time-based queries

### URL Normalization

The rescrape system applies canonical URL normalization to prevent duplicate indexing:

**Normalization Rules:**
1. Convert to lowercase
2. Remove trailing slashes
3. Strip `www.` subdomain
4. Remove fragment identifiers (`#section`)
5. Sort query parameters alphabetically
6. Remove common tracking parameters (utm_*, fbclid, etc.)

**Examples:**
- `https://Example.com/Page/` → `https://example.com/page`
- `https://www.site.com/` → `https://site.com`
- `https://site.com/page?b=2&a=1` → `https://site.com/page?a=1&b=2`

**Benefits:**
- Hybrid search deduplication (single canonical entry per URL)
- Efficient rescraping (updates existing document vs creating duplicate)
- Consistent search results across URL variations

### Hybrid Search Improvements

**Deduplication Strategy:**
- URL normalization reduces duplicate entries by ~30-40%
- RRF (Reciprocal Rank Fusion) merges BM25 and vector results
- Canonical URLs ensure single ranking per page

**Search Accuracy:**
- No false duplicates from URL variations
- Cleaner result sets (no `example.com` + `www.example.com`)
- Improved relevance scores (consolidated signals)

### Metadata Enhancements

Change events store additional metadata in JSONB:

```json
{
  "signature": "sha256=...",
  "diff_size": 1234,
  "watch_title": "Example Page",
  "webhook_received_at": "2025-11-10T12:00:00Z",
  "document_id": "doc-uuid",
  "firecrawl_status": "completed"
}
```

**Use Cases:**
- Signature verification audit trail
- Change magnitude tracking (diff_size)
- Performance metrics (time deltas)
- Debugging failed rescraped

### Configuration

All changedetection.io settings use `WEBHOOK_*` namespace:

```bash
# Webhook security
WEBHOOK_CHANGEDETECTION_HMAC_SECRET=<64-char-hex>

# Firecrawl API access
WEBHOOK_FIRECRAWL_API_URL=http://firecrawl:3002
WEBHOOK_FIRECRAWL_API_KEY=self-hosted-no-auth
```

### Testing

```bash
# Run changedetection integration tests
cd apps/webhook && uv run pytest tests/integration/test_changedetection*.py -v

# Run rescrape job tests
cd apps/webhook && uv run pytest tests/unit/test_rescrape_job.py -v
```

### Documentation

See [changedetection.io Integration Guide](../../docs/CHANGEDETECTION_INTEGRATION.md) for:
- Setup instructions
- Webhook configuration
- Troubleshooting common issues
- Architecture decisions

## License

MIT

## Documentation

See [FIRECRAWL_BRIDGE.md](FIRECRAWL_BRIDGE.md) for complete implementation details.
