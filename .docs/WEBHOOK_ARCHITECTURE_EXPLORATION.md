# apps/webhook Codebase Exploration Report

**Generated:** November 10, 2025  
**Exploration Level:** Very Thorough  
**Codebase:** Firecrawl Search Bridge (Python/FastAPI)

---

## Executive Summary

The `apps/webhook` application is a **FastAPI-based Python microservice** that bridges Firecrawl web scraping with semantic search capabilities. It receives scraped documents via HTTP webhooks, processes them through a hybrid search pipeline (combining vector embeddings + BM25 keyword search), and stores indexed data for retrieval.

**Key Capabilities:**
- Hybrid search using Reciprocal Rank Fusion (RRF) combining vector similarity + BM25
- Token-based document chunking with overlap
- Background worker thread for async document processing
- Timing metrics storage in PostgreSQL
- Comprehensive API with health checks and statistics
- Support for filtering by domain, language, country, and device type

---

## 1. Architecture Overview

### High-Level Design

```
Firecrawl (Node.js)
      ↓
      └─→ POST /api/webhook/firecrawl (with HMAC signature)
            ↓
    [FastAPI API Server]
      ↓
    [Background Worker Thread]
      ├─→ Text Chunking (Token-based)
      ├─→ Embedding Generation (HuggingFace TEI)
      ├─→ Vector Indexing (Qdrant)
      └─→ Keyword Indexing (BM25)
```

### Core Components

1. **FastAPI Application** (`app/main.py`)
   - Lifespan management for startup/shutdown
   - CORS middleware for cross-origin access
   - Rate limiting via SlowAPI
   - Timing middleware for request metrics
   - Exception handling with structured logging

2. **Background Worker Thread** (`app/worker_thread.py`)
   - Runs embedded in the FastAPI process
   - Processes jobs from Redis queue (RQ)
   - Handles async document indexing
   - Can be disabled via `WEBHOOK_ENABLE_WORKER` configuration

3. **Services Layer** (`app/services/`)
   - `embedding.py`: HuggingFace TEI client with retry logic
   - `vector_store.py`: Qdrant async client with health checks
   - `bm25_engine.py`: In-memory BM25 index with file locking
   - `search.py`: Orchestrates hybrid search with RRF fusion
   - `indexing.py`: Orchestrates document processing pipeline
   - `webhook_handlers.py`: Firecrawl event dispatch and processing

4. **API Routes** (`app/api/routes.py`)
   - Deprecated `/api/index` - async job queueing
   - Modern `/api/webhook/firecrawl` - Firecrawl webhook endpoint
   - `/api/search` - Hybrid/semantic/keyword search
   - `/health` - Service health check
   - `/api/stats` - Index statistics
   - `/api/test-index` - Synchronous test indexing (debug endpoint)

5. **Database Layer** (`app/database.py`)
   - SQLAlchemy async ORM with asyncpg
   - PostgreSQL connection pooling
   - Support for Alembic migrations

6. **Configuration** (`app/config.py`)
   - Pydantic Settings for environment variables
   - Support for both `WEBHOOK_*` (new) and `SEARCH_BRIDGE_*` (legacy) prefixes
   - Validation for CORS origins, webhook secrets, etc.

### Deployment Pattern

The application runs as:
- **Single FastAPI process** (Uvicorn ASGI server)
- **Embedded background worker** (RQ worker in separate thread)
- **Shared service instances** between API and worker
- **Redis queue** for job coordination
- **PostgreSQL** for metrics storage
- **Qdrant** for vector search
- **HuggingFace TEI** for embeddings

This eliminates file synchronization complexity and allows the worker to share in-memory indexes with the API.

---

## 2. Database Schema

### Timing Metrics (PostgreSQL)

#### `webhook.request_metrics` Table
Stores HTTP request-level performance data:

```python
# Columns:
id: UUID (primary key)
timestamp: DateTime (indexed)
method: String (HTTP method: GET, POST, etc.) (indexed)
path: String (API path) (indexed)
status_code: Integer (HTTP response code) (indexed)
duration_ms: Float (total request time) (indexed)
request_id: String (unique correlation ID) (indexed)
client_ip: String (client IP address)
user_agent: String (browser/client identifier)
extra_metadata: JSONB (arbitrary additional data)
created_at: DateTime (record creation time)

# Typical Use Cases:
- Measure endpoint response times
- Find slow requests (filter by duration_ms)
- Track error rates (filter by status_code)
- Debug specific requests (query by request_id)
```

#### `webhook.operation_metrics` Table
Stores detailed operation-level timing data:

```python
# Columns:
id: UUID (primary key)
timestamp: DateTime (indexed)
operation_type: String (type of operation: chunking, embedding, qdrant, bm25) (indexed)
operation_name: String (specific operation: embed_batch, index_chunks, etc.) (indexed)
duration_ms: Float (operation duration) (indexed)
success: Boolean (whether operation succeeded) (indexed, default: True)
error_message: Text (error details if failed)
request_id: String (correlation to HTTP request) (indexed)
job_id: String (correlation to RQ job) (indexed)
document_url: String (URL of processed document) (indexed)
extra_metadata: JSONB (operation-specific metadata)
created_at: DateTime (record creation time)

# Typical Use Cases:
- Identify performance bottlenecks (filter by operation_type)
- Track embedding generation times
- Monitor Qdrant indexing performance
- Correlate API requests with background operations (via request_id/job_id)
- Track which documents caused failures
```

### Schema Organization

- **Schema:** `webhook` (dedicated namespace for webhook service)
- **Tables:** Created via Alembic migrations
- **Migrations Location:** `/app/alembic/versions/`
- **Latest Migration:** `20251109_100516_add_webhook_schema.py` - Creates `webhook` schema and migrates tables

### Database Access Pattern

- **Dependency Injection:** `get_db_session()` dependency provides AsyncSession
- **Context Manager:** `get_db_context()` for non-endpoint usage
- **Connection Pool:** 20 base connections + 10 overflow (configurable)
- **Auto-commit:** Disabled (manual transaction control)

---

## 3. API Endpoints & Surface Area

### Authentication

All endpoints (except `/` and `/health`) require one of:
- **API Secret:** `Authorization: Bearer <api_secret>` header
- **Webhook Signature:** `X-Firecrawl-Signature: sha256=<hmac_digest>` header (for webhooks)

### Endpoints

#### Document Indexing

**`POST /api/webhook/firecrawl`** (Primary)
- **Purpose:** Receive Firecrawl webhook events
- **Auth:** HMAC signature verification
- **Rate Limit:** Exempt (internal service)
- **Accepts:** FirecrawlPageEvent or FirecrawlLifecycleEvent
- **Returns:** 
  - `202 Accepted` (documents queued)
  - `200 OK` (lifecycle event processed)
- **Payload Example:**
  ```json
  {
    "type": "crawl.page",
    "id": "job-123",
    "success": true,
    "data": [
      {
        "markdown": "# Page content...",
        "html": "<html>...</html>",
        "metadata": {
          "url": "https://example.com/page",
          "title": "Page Title",
          "description": "...",
          "statusCode": 200,
          "language": "en",
          "country": "US"
        }
      }
    ]
  }
  ```

**`POST /api/index`** (Deprecated)
- **Purpose:** Legacy async document indexing
- **Auth:** API secret bearer token
- **Rate Limit:** 10 req/min per IP
- **Status:** Deprecated in favor of `/api/webhook/firecrawl`
- **Returns:** Job ID for tracking

#### Search

**`POST /api/search`**
- **Purpose:** Search indexed documents
- **Auth:** API secret bearer token
- **Rate Limit:** 50 req/min per IP
- **Body:**
  ```json
  {
    "query": "machine learning",
    "mode": "hybrid",  // or "semantic", "keyword", "bm25"
    "limit": 10,
    "filters": {
      "domain": "example.com",
      "language": "en",
      "country": "US",
      "isMobile": false
    }
  }
  ```
- **Response:**
  ```json
  {
    "results": [
      {
        "url": "https://example.com/page",
        "title": "...",
        "description": "...",
        "text": "matched snippet...",
        "score": 0.95,
        "metadata": {}
      }
    ],
    "total": 1,
    "query": "machine learning",
    "mode": "hybrid"
  }
  ```

#### Health & Status

**`GET /`**
- **Purpose:** Service info and documentation links
- **Auth:** None
- **Returns:** Service name, version, docs URL

**`GET /health`**
- **Purpose:** Health check with service status
- **Auth:** None (public endpoint)
- **Returns:**
  ```json
  {
    "status": "healthy",  // or "degraded"
    "services": {
      "redis": "healthy",
      "qdrant": "healthy",
      "tei": "healthy"
    },
    "timestamp": "2025-11-10T12:34:56.789Z"
  }
  ```

**`GET /api/stats`**
- **Purpose:** Index statistics
- **Auth:** None (public)
- **Returns:**
  ```json
  {
    "total_documents": 1500,
    "total_chunks": 45000,
    "qdrant_points": 45000,
    "bm25_documents": 1500,
    "collection_name": "firecrawl_docs"
  }
  ```

#### Metrics

**`GET /api/metrics/requests`**
- **Purpose:** Retrieve request-level timing metrics
- **Auth:** API secret
- **Query Params:**
  - `limit`: 1-1000 (default: 100)
  - `offset`: pagination offset (default: 0)
  - `path`: filter by endpoint path
  - `method`: filter by HTTP method (GET, POST, etc.)
  - `min_duration_ms`: filter by minimum duration
  - `hours`: lookback period in hours (default: 24)
- **Returns:** List of RequestMetric records + statistics (avg, min, max duration)

**`GET /api/metrics/operations`**
- **Purpose:** Retrieve operation-level timing metrics
- **Auth:** API secret
- **Query Params:**
  - `limit`, `offset`: pagination
  - `operation_type`: filter by operation type
  - `operation_name`: filter by specific operation
  - `min_duration_ms`: filter by duration
  - `success`: filter by success/failure
  - `hours`: lookback period
- **Returns:** List of OperationMetric records + statistics

#### Testing

**`POST /api/test-index`** (Debug)
- **Purpose:** Synchronous document indexing with detailed timing
- **Auth:** API secret
- **Rate Limit:** 5 req/min per IP
- **Returns:** Detailed step-by-step timing breakdown:
  ```json
  {
    "status": "success",
    "url": "...",
    "total_duration_ms": 1234.56,
    "steps": [
      {
        "step": "parse_document",
        "duration_ms": 0.5,
        "status": "success"
      },
      {
        "step": "index_document",
        "duration_ms": 1234,
        "status": "success",
        "details": {
          "chunks_indexed": 42,
          "qdrant_duration_ms": 500,
          "bm25_duration_ms": 100,
          "total_tokens": 5000
        }
      }
    ],
    "summary": {
      "chunks_indexed": 42,
      "indexed_to_qdrant": true,
      "indexed_to_bm25": true
    }
  }
  ```

---

## 4. Worker Architecture & Job Processing

### Job Queue System

- **Queue System:** RQ (Redis Queue)
- **Queue Name:** `"indexing"`
- **Backend:** Redis (`WEBHOOK_REDIS_URL`)
- **Job Timeout:** 10 minutes per document
- **Job Serialization:** Pydantic model → dict → JSON

### Worker Thread Lifecycle

1. **Startup** (`WorkerThreadManager.start()`)
   - Creates background daemon thread
   - Establishes Redis connection
   - Creates RQ Worker instance
   - Begins processing jobs from "indexing" queue

2. **Processing** (`_run_worker()`)
   ```python
   Worker(
       queues=["indexing"],
       connection=redis_conn,
       name="search-bridge-worker",
   ).work(with_scheduler=False)
   ```

3. **Shutdown** (`WorkerThreadManager.stop()`)
   - Sets `_running = False`
   - Sends `request_stop()` to RQ worker
   - Waits up to 10 seconds for graceful shutdown
   - Logs warning if thread doesn't exit cleanly

### Job Processing Flow

```
1. Document arrives via /api/webhook/firecrawl
2. Event handler extracts documents from payload
3. For each document:
   - Create IndexDocumentRequest from metadata
   - Enqueue job: queue.enqueue("app.worker.index_document_job", payload)
   - Return job ID immediately (202 Accepted)
4. Background worker picks up job:
   - Deserialize document payload
   - Parse with validation
   - Create services (reuse singletons from dependencies)
   - Execute indexing pipeline
5. Pipeline steps:
   - Clean markdown text (remove extra whitespace, etc.)
   - Chunk text into tokens (256-token chunks with 50-token overlap)
   - Generate embeddings via TEI
   - Index chunks in Qdrant (vector + metadata)
   - Index full document in BM25
   - Log metrics to PostgreSQL
6. Return result (stored in Redis for 500 seconds by default)
```

### Worker Configuration

```python
# In app/config.py
enable_worker: bool = Field(
    default=True,
    validation_alias=AliasChoices(
        "WEBHOOK_ENABLE_WORKER", 
        "SEARCH_BRIDGE_ENABLE_WORKER"
    ),
    description="Enable background worker thread for processing indexing jobs"
)
```

### Disabling the Worker

To run API only (useful for testing):
```bash
WEBHOOK_ENABLE_WORKER=false uvicorn app.main:app
```

This allows:
- Development/testing of API independently
- Separate scaling of API and worker
- Debugging without worker interference

---

## 5. Integration Points with External Services

### Redis

**Purpose:** Job queue for async document indexing

**Configuration:**
```python
redis_url: str = Field(
    default="redis://localhost:52101",
    validation_alias=AliasChoices(
        "WEBHOOK_REDIS_URL",
        "REDIS_URL",  # Shared infrastructure fallback
        "SEARCH_BRIDGE_REDIS_URL"
    )
)
```

**Usage:**
- Rate limiter storage (SlowAPI)
- RQ job queue
- Job status tracking

**Connection Model:**
- Synchronous Redis client (non-blocking thread operations)
- Closed on application shutdown

### PostgreSQL

**Purpose:** Timing metrics storage

**Configuration:**
```python
database_url: str = Field(
    default="postgresql+asyncpg://fc_bridge:changeme@localhost:5432/fc_bridge",
    validation_alias=AliasChoices(
        "WEBHOOK_DATABASE_URL",
        "DATABASE_URL",  # Shared infrastructure
        "SEARCH_BRIDGE_DATABASE_URL"
    )
)
```

**Schema:** `webhook` (dedicated namespace)

**Tables:**
- `request_metrics`: HTTP request timing
- `operation_metrics`: Operation-level timing

**Connection Model:**
- Async SQLAlchemy with asyncpg
- Connection pool (20 base + 10 overflow)
- Alembic migrations for schema management

### Qdrant

**Purpose:** Vector storage and similarity search

**Configuration:**
```python
qdrant_url: str = "http://localhost:52102"
qdrant_collection: str = "firecrawl_docs"
qdrant_timeout: float = 60.0
vector_dim: int = 384  # Must match embedding model output
```

**Operations:**
- Create collection if missing (on startup)
- Index chunks with vectors + metadata
- Search with filters (domain, language, country, isMobile)
- Count total points

**Retry Logic:**
- Tenacity decorator on all operations
- 3 attempts with exponential backoff
- Max 10 second wait between retries

### HuggingFace TEI

**Purpose:** Text embedding generation

**Configuration:**
```python
tei_url: str = "http://localhost:52104"
tei_api_key: str | None = None  # Optional auth
embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"
```

**Operations:**
- Health check (GET `/health`)
- Single embedding (POST `/embed_sparse` or `/embed`)
- Batch embeddings (POST `/embed` with array)

**Retry Logic:**
- 3 attempts on HTTP error
- Exponential backoff (2s min, 10s max)
- Async HTTP client with 30s timeout

### Firecrawl (Upstream)

**Purpose:** Source of scraped documents

**Integration:**
- Firecrawl sends webhooks with document data
- Uses HMAC-SHA256 signature for verification
- Document includes: URL, markdown, metadata, HTML

**Webhook Signature Verification:**
```python
# Expected signature format: sha256=<hex_digest>
# Computed as: HMAC-SHA256(secret, body, digest_type=sha256).hexdigest()
# Verified using constant-time comparison
```

---

## 6. Configuration System

### Environment Variable Loading

**Order of precedence:**
1. `WEBHOOK_*` (new monorepo naming - highest priority)
2. Shared variables (`DATABASE_URL`, `REDIS_URL` - infrastructure)
3. `SEARCH_BRIDGE_*` (legacy naming - backward compatibility)
4. Defaults in code (lowest priority)

### Core Configuration Fields

```python
# API Server
host: str = "0.0.0.0"
port: int = 52100
api_secret: str  # Required - HMAC key for API endpoints
webhook_secret: str  # Required - HMAC key for Firecrawl webhooks (16-256 chars)

# CORS
cors_origins: list[str] = ["http://localhost:3000"]
# Supports:
# - JSON array: '["https://app.example.com", "https://api.example.com"]'
# - Comma-separated: "https://app.example.com,https://api.example.com"
# - Wildcard: "*" (DEVELOPMENT ONLY - NOT SECURE FOR PRODUCTION)

# Redis
redis_url: str = "redis://localhost:52101"

# Vector Search (Qdrant)
qdrant_url: str = "http://localhost:52102"
qdrant_collection: str = "firecrawl_docs"
qdrant_timeout: float = 60.0
vector_dim: int = 384

# Embeddings (TEI)
tei_url: str = "http://localhost:52104"
tei_api_key: str | None = None
embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"

# Text Chunking (TOKEN-based, not character-based!)
max_chunk_tokens: int = 256  # Must match model max_seq_length
chunk_overlap_tokens: int = 50  # Typically 10-20% of max_tokens

# Search
hybrid_alpha: float = 0.5  # 0=BM25 only, 1=vector only
bm25_k1: float = 1.5  # Term frequency saturation
bm25_b: float = 0.75  # Length normalization

# RRF (Reciprocal Rank Fusion)
rrf_k: int = 60  # Standard from original paper

# Logging
log_level: str = "INFO"  # DEBUG, INFO, WARNING, ERROR, CRITICAL

# Worker
enable_worker: bool = True

# Database (for timing metrics)
database_url: str = "postgresql+asyncpg://fc_bridge:changeme@localhost:5432/fc_bridge"
```

### Configuration Validation

- CORS origins: URL format validation, no trailing slashes
- Webhook secret: No leading/trailing whitespace
- All secrets: Non-empty strings
- All numeric values: Type validation with bounds

---

## 7. External Service Integrations & Extensibility

### How changedetection.io Could Integrate

The webhook service is designed as a **generic document indexing bridge**, making it extensible for change detection:

#### Integration Points

1. **As a Change Detection Backend**
   - Instead of Firecrawl → use changedetection.io's scrapers
   - Send documents via POST `/api/webhook/firecrawl` (or create new endpoint)
   - Index documents, track changes by comparing embeddings or BM25 weights

2. **Trigger-Based Monitoring**
   - Use change scores stored in `extra_metadata` JSONB
   - Query `/api/metrics/operations` to find when changes occurred
   - Correlate with request_id/job_id for full audit trail

3. **Semantic Change Detection**
   - Store document embeddings and baseline vectors
   - Compare new embeddings against baseline (cosine similarity)
   - Large delta = significant change detected

4. **Keyword-Based Change Detection**
   - BM25 index tracks term frequencies
   - Compare term distributions across versions
   - Metadata in Qdrant points can store version history

5. **Custom Webhook Handler**
   - Create `/api/webhook/changedetection` endpoint
   - Accept changedetection.io payload format
   - Transform to IndexDocumentRequest
   - Enqueue for indexing/change detection

### Extension Architecture

The service uses **dependency injection** for extensibility:

```python
# Current dependencies (app/api/dependencies.py)
_embedding_service: EmbeddingService | None = None
_vector_store: VectorStore | None = None
_bm25_engine: BM25Engine | None = None
_search_orchestrator: SearchOrchestrator | None = None

# Easy to extend:
# 1. Create new service class
# 2. Add to dependencies module
# 3. Inject via FastAPI dependency injection
# 4. No changes to existing code
```

### Existing Change-Related Features

The application already has infrastructure for change tracking:

1. **Timing Metrics** - Records when operations occur
2. **Metadata Storage** - JSONB fields can store change history
3. **Document Correlation** - request_id/job_id for tracking
4. **Query Capabilities** - Filter metrics by time, document_url, status
5. **Error Tracking** - Captures failed indexing attempts

---

## 8. Monitoring & Health Checks

### Health Check Endpoint

**`GET /health`** - Probes all critical services:
- **Redis**: `redis.ping()`
- **Qdrant**: `client.get_collections()` check
- **TEI**: `GET /health` endpoint check

**Response Statuses:**
- `healthy`: All services operational
- `degraded`: Some services failing
- Individual service status included in response

### Timing Metrics Storage

Both request and operation metrics are automatically stored:

**Request Metrics Captured:**
- HTTP method, path, status code
- Total duration in milliseconds
- Request ID for tracing
- Client IP, user agent
- Custom metadata (JSONB)

**Operation Metrics Captured:**
- Operation type (chunking, embedding, qdrant, bm25)
- Operation name (specific operation)
- Duration in milliseconds
- Success/failure status with error messages
- Correlation to HTTP request (request_id)
- Correlation to RQ job (job_id)
- Document URL being processed
- Custom metadata (JSONB)

### Querying Metrics

**REST API Endpoints:**
- `GET /api/metrics/requests` - Query request-level metrics
- `GET /api/metrics/operations` - Query operation-level metrics

**Filtering Available:**
- By timestamp range (hours lookback)
- By operation type or HTTP method
- By minimum duration (identify slow operations)
- By success/failure status
- By correlation IDs (trace full request lifecycle)

### Logging System

**Structured Logging** (via structlog):
- All logs include timestamp, level, message
- Structured fields for filtering/searching
- DEBUG level: Detailed operation info
- INFO level: Normal operations, milestones
- WARNING level: Degraded service conditions
- ERROR level: Failures with full context

**Log Configuration:**
```python
WEBHOOK_LOG_LEVEL=DEBUG|INFO|WARNING|ERROR|CRITICAL
```

---

## 9. Existing Change Detection / Monitoring Features

### Built-in Features

1. **Request Timing Tracking**
   - Every HTTP request duration recorded
   - Identifies slow endpoints for optimization

2. **Operation-Level Timing**
   - Chunk processing time
   - Embedding generation time
   - Qdrant indexing time
   - BM25 indexing time

3. **Error Tracking**
   - Failed operations logged with context
   - Document URL tracked for failures
   - Error messages preserved in metrics

4. **Correlation IDs**
   - Each HTTP request gets unique request_id
   - Traced through all dependent operations
   - Enables full request lifecycle debugging

5. **Health Monitoring**
   - Service health check endpoint
   - Probes all dependencies
   - Returns degraded status if any service down

6. **Statistics Endpoint**
   - Total documents indexed
   - Total chunks created
   - Current Qdrant size
   - BM25 document count

### Extensibility for changedetection.io

The architecture supports adding change detection features:

1. **Metadata Storage** - JSONB fields in metrics tables
2. **Custom Webhook Handler** - Can be created without modifying existing endpoints
3. **Baseline Tracking** - Store initial embeddings/BM25 state in metadata
4. **Version History** - Use request_id/job_id to track document versions
5. **Change Scoring** - Calculate similarity deltas, store in extra_metadata

---

## 10. Key Files & Directory Structure

### Core Application
```
apps/webhook/
├── app/
│   ├── main.py                 # FastAPI app, lifespan, middlewares
│   ├── config.py               # Pydantic Settings
│   ├── database.py             # SQLAlchemy setup
│   ├── models.py               # Pydantic request/response schemas
│   ├── models/
│   │   └── timing.py           # SQLAlchemy timing models
│   ├── middleware/
│   │   └── timing.py           # Request timing middleware
│   ├── rate_limit.py           # SlowAPI limiter setup
│   ├── api/
│   │   ├── routes.py           # Main API endpoints (551 lines)
│   │   ├── metrics_routes.py   # Metrics query endpoints
│   │   └── dependencies.py     # Dependency injection
│   ├── services/
│   │   ├── embedding.py        # TEI client with retry
│   │   ├── vector_store.py     # Qdrant client
│   │   ├── bm25_engine.py      # BM25 with file locking
│   │   ├── search.py           # RRF search orchestrator
│   │   ├── indexing.py         # Document processing pipeline
│   │   └── webhook_handlers.py # Firecrawl event handling
│   ├── utils/
│   │   ├── logging.py          # Structured logging setup
│   │   ├── timing.py           # TimingContext for metrics
│   │   └── text_processing.py  # Token-based chunking
│   ├── worker.py               # Background job processor (deprecated)
│   └── worker_thread.py        # Embedded worker thread manager
├── tests/
│   ├── conftest.py             # Pytest fixtures
│   ├── unit/                   # Unit tests (23+ test files)
│   └── integration/            # Integration tests (7+ test files)
├── alembic/
│   ├── env.py                  # Alembic configuration
│   └── versions/
│       ├── 57f2f0e22bad_add_timing_metrics_tables.py
│       └── 20251109_100516_add_webhook_schema.py
├── docs/
│   ├── FIRECRAWL_BRIDGE.md     # Complete implementation guide
│   ├── API_REFERENCE.md        # API documentation
│   ├── OPENAPI_README.md       # OpenAPI spec info
│   └── plans/                  # Design documents
├── pyproject.toml              # Project metadata, dependencies
├── README.md                   # User guide
└── .docs/
    ├── FIRECRAWL_INTEGRATION.md
    ├── DEPLOYMENT_GUIDE.md
    └── tmp/                    # Session logs
```

### Dependencies (pyproject.toml)

**Core:**
- FastAPI >= 0.110.0
- Uvicorn >= 0.27.0
- Pydantic >= 2.6.0
- SQLAlchemy[asyncio] >= 2.0.0
- asyncpg >= 0.30.0

**Search & Indexing:**
- qdrant-client >= 1.8.0
- rank-bm25 >= 0.2.2
- transformers >= 4.36.0 (for tokenizer)
- torch >= 2.1.0

**Background Processing:**
- redis >= 5.0.0
- rq >= 1.16.0 (job queue)

**Database:**
- alembic >= 1.17.1 (migrations)

**Utilities:**
- httpx >= 0.26.0 (async HTTP client)
- tenacity >= 8.2.0 (retry logic)
- slowapi >= 0.1.9 (rate limiting)
- structlog >= 24.1.0 (logging)

**Dev:**
- pytest >= 8.0.0
- pytest-asyncio >= 0.23.0
- pytest-cov >= 4.1.0
- ruff >= 0.1.0 (linting)
- mypy >= 1.8.0 (type checking)

---

## 11. Type Safety & Code Quality

### Type Checking
- **mypy strict mode** enabled
- All functions have type hints
- Return types required
- No `any` types allowed

### Code Style
- **Ruff** for formatting/linting
- Line length: 100 characters
- PEP 8 compliant
- Import sorting enforced

### Documentation
- **Docstrings** on all public functions/classes
- XML-style docstring format
- Examples provided for complex functions

### Testing
- **Unit tests**: 23+ test files
- **Integration tests**: 7+ test files
- Coverage target: 85%+
- Async tests via pytest-asyncio

---

## 12. Extensibility & Integration Points for changedetection.io

### Perfect Integration Opportunities

1. **Custom Webhook Endpoint**
   ```
   POST /api/webhook/changedetection
   - Accept changedetection.io document format
   - Transform to IndexDocumentRequest
   - Use existing indexing pipeline
   ```

2. **Change Scoring**
   ```
   - Store baseline embedding vectors in Qdrant metadata
   - Compare new document against baseline
   - Cosine similarity = change confidence
   - Store delta in extra_metadata JSONB
   ```

3. **Version Tracking**
   ```
   - Document table with version history
   - Correlation via document_url + timestamp
   - Track changes by BM25 term weight changes
   - Full audit trail via metrics tables
   ```

4. **Change Notifications**
   ```
   - Extend /api/webhook/changedetection to trigger notifications
   - Use existing job queue infrastructure
   - Background worker processes change notifications
   ```

5. **Alerting Rules**
   ```
   - Store rules in JSONB metadata
   - Check against document similarity metrics
   - Fire webhooks to external systems
   - Track alert history in metrics
   ```

### Data Structures Already in Place

- **JSONB fields** for arbitrary metadata
- **Correlation IDs** for tracing
- **Timestamp tracking** for version history
- **Error logging** for debugging
- **Metrics queries** for analytics

---

## Summary Table

| Component | Technology | Purpose | Extensible? |
|-----------|-----------|---------|-------------|
| API Framework | FastAPI | HTTP request handling | Yes |
| Background Jobs | RQ + Redis | Async indexing | Yes |
| Vector Search | Qdrant | Semantic similarity | Yes |
| Keyword Search | BM25 | Traditional search | Yes |
| Embeddings | HuggingFace TEI | Text encoding | Yes |
| Text Processing | Transformers tokenizer | Token-based chunking | Yes |
| Metrics | PostgreSQL + SQLAlchemy | Performance tracking | Yes |
| Authentication | HMAC-SHA256 | Webhook verification | Yes |
| Rate Limiting | SlowAPI + Redis | DoS protection | Yes |
| Logging | structlog | Structured logging | Yes |

---

## Recommendations for changedetection.io Integration

1. **Create separate endpoint**: `/api/webhook/changedetection` rather than reusing Firecrawl
2. **Add change_score field**: Track similarity delta in OperationMetric
3. **Implement version table**: Track document versions with change metadata
4. **Use existing correlation**: Leverage request_id/job_id for tracing
5. **Extend metrics**: Add change-detection-specific operation types
6. **Cache baselines**: Store embeddings in Qdrant metadata for comparison
7. **Queue change jobs**: Use RQ infrastructure for change notifications
8. **Archive history**: Use JSONB to store change history per document

---

**Report Generated:** November 10, 2025  
**Exploration Time:** Comprehensive  
**Coverage:** Architecture, DB Schema, API, Worker, Integration Points, Extensibility
