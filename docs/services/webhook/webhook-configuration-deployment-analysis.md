# Webhook Server: Comprehensive Configuration & Deployment Analysis

## Executive Summary

The webhook server (`pulse_webhook`) is a FastAPI-based search bridge that indexes crawled content from Firecrawl and provides semantic/hybrid search capabilities. It uses PostgreSQL for metrics, Redis for task queuing, Qdrant for vector search, and TEI for embeddings. The service can run with either an embedded background worker (thread-based) or a separate RQ worker container.

**Total Codebase:** 14,686 lines of Python code across 100+ files

---

## 1. ENVIRONMENT VARIABLE CONFIGURATION

### 1.1 Configuration Management Architecture

**File:** `/compose/pulse/apps/webhook/config.py`

The configuration uses Pydantic Settings with a sophisticated multi-source approach:

```python
class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=False,
        extra="allow",  # Allows kwargs for testing
    )
```

**Variable Priority (highest to lowest):**
1. `WEBHOOK_*` (monorepo naming, highest priority)
2. Shared variables (`DATABASE_URL`, `REDIS_URL`)
3. `SEARCH_BRIDGE_*` (legacy naming for backward compatibility)

### 1.2 Critical Environment Variables

**Authentication & Security:**
- `WEBHOOK_API_SECRET` - API authentication token (min 32 chars in production)
- `WEBHOOK_SECRET` - HMAC-SHA256 secret for Firecrawl webhook signature verification
- Validation enforces minimum 32 characters and rejects weak defaults in production

**Server Configuration:**
- `WEBHOOK_HOST` - Default: `0.0.0.0`
- `WEBHOOK_PORT` - Default: `52100` (internal container port)
- External port mapping: `WEBHOOK_PORT` env var maps to container port `52100`

**CORS Configuration:**
- `WEBHOOK_CORS_ORIGINS` - Default: `["http://localhost:3000"]`
- Accepts JSON array, comma-separated, or plain list
- Supports wildcard `*` (development only - NOT recommended for production)
- Validation ensures origins start with `http://` or `https://`
- Security warning logged if wildcard is used

**Infrastructure Connections:**

| Service | Variable | Default | Purpose |
|---------|----------|---------|---------|
| Redis | `WEBHOOK_REDIS_URL` | `redis://localhost:52101` | Background job queue (RQ) |
| PostgreSQL | `WEBHOOK_DATABASE_URL` | `postgresql+asyncpg://...` | Timing metrics storage |
| Qdrant | `WEBHOOK_QDRANT_URL` | `http://localhost:52102` | Vector database |
| Qdrant | `WEBHOOK_QDRANT_COLLECTION` | `pulse_docs` | Collection name |
| TEI | `WEBHOOK_TEI_URL` | `http://localhost:52104` | Text embeddings |
| Firecrawl | `WEBHOOK_FIRECRAWL_API_URL` | `http://firecrawl:3002` | API for rescraping |
| changedetection.io | `WEBHOOK_CHANGEDETECTION_API_URL` | `http://pulse_change-detection:5000` | Change monitoring |

**Search Configuration:**
- `WEBHOOK_HYBRID_ALPHA` (0.0-1.0) - Default: `0.5` - Balance between BM25 and vector search
- `WEBHOOK_BM25_K1` - Default: `1.5` - BM25 saturation parameter
- `WEBHOOK_BM25_B` - Default: `0.75` - BM25 length normalization
- `WEBHOOK_RRF_K` - Default: `60` - Reciprocal Rank Fusion constant

**Chunking Configuration (TOKEN-BASED):**
- `WEBHOOK_MAX_CHUNK_TOKENS` - Default: `256` - Must match embedding model limit
- `WEBHOOK_CHUNK_OVERLAP_TOKENS` - Default: `50` - Overlap for context preservation
- `WEBHOOK_EMBEDDING_MODEL` - Default: `Qwen/Qwen3-Embedding-0.6B`

**Vector Store Configuration:**
- `WEBHOOK_VECTOR_DIM` - Default: `1024` - Vector dimensions for embeddings
- `WEBHOOK_QDRANT_TIMEOUT` - Default: `60.0` seconds

**Worker Configuration:**
- `WEBHOOK_ENABLE_WORKER` - Default: `True` - Enable embedded thread-based worker
  - Set to `false` when using `pulse_webhook-worker` container
  - Allows either model: embedded or standalone
- `WEBHOOK_TEST_MODE` - Default: `False` - Stub external services for testing
- `WEBHOOK_LOG_LEVEL` - Default: `INFO` - DEBUG, INFO, WARNING, ERROR, CRITICAL

**changedetection.io Integration:**
- `WEBHOOK_CHANGEDETECTION_ENABLE_AUTO_WATCH` - Default: `true` - Auto-create watches for URLs
- `WEBHOOK_CHANGEDETECTION_CHECK_INTERVAL` - Default: `3600` seconds (1 hour)

### 1.3 Secret Validation & Enforcement

**Validation Rules (non-test mode):**

```python
@model_validator(mode="after")
def validate_secret_strength(self) -> "Settings":
    """Secrets must be at least 32 characters and not weak defaults."""
    WEAK_DEFAULTS = {
        "dev-unsafe-api-secret-change-in-production",
        "dev-unsafe-hmac-secret-change-in-production",
        "changeme",
        "secret",
    }
    # Rejects any weak defaults
    # Enforces minimum length: 32 characters
```

**CORS Validation:**

```python
@field_validator("cors_origins", mode="before")
def validate_cors_origins(cls, value):
    """Parse JSON array, comma-separated, or list."""
    # Validates: JSON array ["https://app.com"], 
    #           comma-separated "https://app.com,https://api.com"
    # Returns: List of normalized origins
```

---

## 2. PYTHON DEPENDENCIES & VERSION REQUIREMENTS

### 2.1 Python Version & Packaging

- **Minimum Python:** 3.12
- **Tested/Supported:** 3.13
- **Package Manager:** uv (NOT pip, poetry, pipenv)
- **Build System:** hatchling

### 2.2 Core Dependencies

**Web Framework & Server:**
```
fastapi>=0.121.1           # REST API framework
uvicorn[standard]>=0.38.0  # ASGI server
python-multipart>=0.0.20   # Form data parsing
```

**Data & ORM:**
```
sqlalchemy[asyncio]>=2.0.44  # Async ORM
asyncpg>=0.30.0              # PostgreSQL async driver
pydantic>=2.12.4             # Data validation
pydantic-settings>=2.12.0    # Environment configuration
```

**Search & Embeddings:**
```
qdrant-client>=1.15.1        # Vector database client
rank-bm25>=0.2.2             # BM25 keyword search
transformers>=4.57.1         # HuggingFace models (for local inference)
torch>=2.9.0                 # Deep learning framework (for embeddings)
semantic-text-splitter>=0.28.0  # Intelligent text chunking
```

**Background Jobs & Caching:**
```
redis>=7.0.1                 # Redis client
rq>=2.6.0                    # RQ job queue
slowapi>=0.1.9               # Rate limiting
```

**HTTP & Network:**
```
httpx>=0.28.1                # Async HTTP client
tenacity>=9.1.2              # Retry logic with backoff
```

**Logging & Monitoring:**
```
structlog>=25.5.0            # Structured logging
```

**Database Migrations:**
```
alembic>=1.17.1              # Schema migrations
```

### 2.3 Development Dependencies

```
pytest>=8.4.2                # Testing framework
pytest-asyncio>=1.2.0        # Async test support
pytest-cov>=7.0.0            # Coverage reporting
pytest-mock>=3.15.1          # Mocking utilities
ruff>=0.1.0                  # Code formatting & linting
mypy>=1.8.0                  # Type checking (strict mode)
```

### 2.4 Development Tools Configuration

**Ruff Linting (pyproject.toml):**
```toml
[tool.ruff]
line-length = 100
target-version = "py313"
cache-dir = ".cache/ruff"

[tool.ruff.lint]
select = ["E", "F", "I", "N", "W", "UP"]  # Errors, Fixes, Imports, Naming, Warnings, Upgrades
ignore = ["E501"]  # Ignore line-too-long (100 char limit handles this)
```

**MyPy Type Checking:**
```toml
[tool.mypy]
python_version = "3.13"
strict = true
disallow_untyped_defs = true
warn_return_any = true
warn_unused_configs = true
```

**Pytest Configuration:**
```toml
[tool.pytest.ini_options]
testpaths = ["tests"]
python_files = ["test_*.py"]
addopts = "-v --cov=. --cov-report=term-missing"
markers = [
    "external: requires live infrastructure (Redis, Qdrant, TEI)",
]
```

---

## 3. FASTAPI APPLICATION SETUP & LIFECYCLE

### 3.1 Application Initialization (main.py)

**Entry Point:** `/compose/pulse/apps/webhook/main.py`

```python
@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None]:
    """Application lifespan manager - handles startup and shutdown."""
```

**Startup Sequence:**

1. **Logging Configuration**
   ```python
   configure_logging(settings.log_level)
   logger = get_logger(__name__)
   ```

2. **Database Initialization (PostgreSQL)**
   ```python
   await init_database()
   logger.info("Timing metrics database initialized")
   ```
   - Creates tables if they don't exist (non-production approach)
   - Production should use Alembic migrations

3. **Qdrant Collection Verification**
   ```python
   vector_store = get_vector_store()
   await vector_store.ensure_collection()
   ```
   - Ensures vector collection exists
   - Non-blocking: doesn't fail startup if unavailable

4. **Background Worker Thread (Optional)**
   ```python
   if settings.enable_worker:
       worker_manager = WorkerThreadManager()
       worker_manager.start()
   ```
   - Starts RQ worker in background thread if enabled
   - Daemon thread - doesn't prevent shutdown
   - Logs and continues if start fails

5. **CORS Configuration**
   - Logs security warning if wildcard `*` is used
   - Otherwise logs allowed origins

**Shutdown Sequence:**

1. Stop background worker (if running)
2. Clean up async services (embeddings, vector store, Redis)
3. Close database connections
4. All failures are logged but don't block shutdown

### 3.2 Middleware Stack (Applied in Order)

**1. TimingMiddleware (Custom)**
- Records request start/end time
- Generates unique request ID (`X-Request-ID` header)
- Stores metrics to PostgreSQL
- Adds `X-Process-Time` header to response

**2. SlowAPIMiddleware (Rate Limiting)**
- Enforces rate limits from limiter configuration
- Default: 100 requests/minute per IP
- Storage: Redis backend

**3. CORSMiddleware**
- Allows origins from `WEBHOOK_CORS_ORIGINS`
- Allows credentials
- Allows all HTTP methods and headers

**4. HTTP Logging Middleware (Custom)**
- Logs Firecrawl webhook payloads
- Captures event type, event ID, data count
- Logs response status

### 3.3 Exception Handling

**Global Exception Handler:**
```python
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Handle uncaught exceptions with logging."""
    logger.error("Unhandled exception", path=request.url.path, error=str(exc))
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})
```

**Rate Limit Handler:**
- Uses SlowAPI's `_rate_limit_exceeded_handler`
- Returns 429 Too Many Requests

### 3.4 API Root Endpoint

```python
@app.get("/")
async def root() -> JSONResponse:
    """Service info endpoint."""
    return {
        "service": "Firecrawl Search Bridge",
        "version": "0.1.0",
        "status": "running",
        "docs": "/docs",
        "health": "/health",
    }
```

---

## 4. CORS & SECURITY CONFIGURATION

### 4.1 CORS Settings

**Default Configuration:**
```python
CORSMiddleware(
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

**Origins Resolution:**
- Single origin: `WEBHOOK_CORS_ORIGINS=http://localhost:3000`
- Multiple origins (JSON): `WEBHOOK_CORS_ORIGINS='["http://localhost:3000", "http://localhost:50107"]'`
- Multiple origins (CSV): `WEBHOOK_CORS_ORIGINS=http://localhost:3000,http://localhost:50107`
- Wildcard: `WEBHOOK_CORS_ORIGINS=*` (triggers security warning)

**Security Warnings:**
- Startup logs warning if wildcard is detected
- Production should use explicit origins
- Credentials enabled by default for internal service communication

### 4.2 Authentication & Authorization

**API Secret Verification:**

```python
async def verify_api_secret(
    authorization: Annotated[str | None, Header()] = None,
) -> None:
    """Verify Bearer token from Authorization header."""
    # Supports "Bearer <token>" format and raw token for backward compatibility
    if not authorization:
        raise HTTPException(401, "Missing Authorization header")
    
    token = authorization.replace("Bearer ", "")
    if not secrets.compare_digest(token, settings.api_secret):
        raise HTTPException(401, "Invalid credentials")
```

**Webhook Signature Verification:**

```python
async def verify_webhook_signature(
    request: Request,
    x_firecrawl_signature: Annotated[str | None, Header(alias="X-Firecrawl-Signature")] = None,
) -> None:
    """Verify HMAC-SHA256 signature from Firecrawl webhook."""
    # Pattern: sha256=<64-char-hex>
    # Computes HMAC-SHA256(webhook_secret, request_body)
    # Uses constant-time comparison to prevent timing attacks
```

**Protected Endpoints:**
- `/api/search` - Requires `Authorization: Bearer <api_secret>`
- `/api/webhook/firecrawl` - Requires `X-Firecrawl-Signature` header
- `/api/indexing` - Requires API secret
- `/health` - Public (no auth)
- `/metrics` - Public (no auth)

### 4.3 Rate Limiting

**Configuration (infra/rate_limit.py):**
```python
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["100/minute"],
    storage_uri=settings.redis_url,
)
```

**Per-Endpoint Limits:**
- `/api/search` - `@limiter.limit("50/minute")`
- `/api/webhook/firecrawl` - `@limiter.exempt` (disabled for webhook processing)
- Default - `100/minute` per IP address

---

## 5. LOGGING CONFIGURATION

### 5.1 Structured Logging with structlog

**File:** `/compose/pulse/apps/webhook/utils/logging.py`

**Configuration:**
```python
def configure_logging(log_level: str = "INFO") -> None:
    """Configure structured logging with structlog."""
    # Standard library logging to stdout
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=getattr(logging, log_level.upper()),
    )
    
    # structlog configuration
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            _est_timestamp,  # Adds EST timestamp
            structlog.dev.ConsoleRenderer(),
        ],
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
    )
```

**Timestamp Format:**
- 12-hour EST format: `12:34:56 PM | 11/13/2025`
- Timezone: America/New_York
- No microseconds

**Log Levels:**
- `DEBUG` - Detailed diagnostic information
- `INFO` - General informational messages (default)
- `WARNING` - Warning conditions
- `ERROR` - Error messages
- `CRITICAL` - Critical errors

**Structured Fields:**
All logs include contextual information as key-value pairs:
```
timestamp=12:34:56 PM | 11/13/2025
event=Request completed
method=POST
path=/api/search
status_code=200
duration_ms=125.45
request_id=550e8400-e29b-41d4-a716-446655440000
```

### 5.2 Request Logging

**Timing Middleware Logs:**
- Request start: `method`, `path`, `query_params`
- Request completion: `status_code`, `duration_ms`, `request_id`
- Errors: `error`, `error_type`, `error_traceback`

**Webhook Logging (main.py):**
- Event type and ID
- Data count
- Payload size (bytes)
- Response status

**Search Logging:**
- Query, mode, limit
- Filter application time
- Search execution time
- Result conversion time

---

## 6. MONITORING & HEALTH CHECKS

### 6.1 Health Check Endpoint

**Endpoint:** `GET /health`

**Response Model:**
```python
class HealthStatus(BaseModel):
    status: str  # "healthy" or "degraded"
    services: dict[str, str]  # Per-service status
    timestamp: str
```

**Services Checked:**
1. **Redis** - `redis_conn.ping()`
2. **Qdrant** - `vector_store.health_check()`
3. **TEI** - `embedding_service.health_check()`

**Overall Status:**
- `"healthy"` - All services operational
- `"degraded"` - At least one service unhealthy

**Docker Health Check:**
```bash
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:52100/health || exit 1
```
- Runs every 30 seconds
- Timeout: 10 seconds
- Start period: 40 seconds (allows services to initialize)
- Failure threshold: 3 consecutive failures

### 6.2 Metrics API

**Endpoint:** `GET /metrics` (varies by router)

**Available Metrics:**
- `IndexStats` - Document and chunk counts
- `RequestMetric` - Per-request timing data
- `OperationMetric` - Service operation timings

### 6.3 Database-Backed Metrics

**PostgreSQL Schema:** `webhook`

**RequestMetric Table:**
- `id` (UUID, PK)
- `timestamp` (DateTime, indexed)
- `method` (GET, POST, etc.)
- `path` (URL path)
- `status_code` (HTTP status)
- `duration_ms` (Request duration)
- `request_id` (Correlation ID)
- `client_ip` (Source IP)
- `user_agent` (Client information)
- `extra_metadata` (JSONB - query/path params)

**OperationMetric Table:**
- `id` (UUID, PK)
- `operation_type` (chunking, embedding, indexing, search)
- `operation_name` (e.g., "embed_chunks")
- `duration_ms` (Operation time)
- `success` (boolean)
- `error_message` (if failed)
- `request_id` (correlation)
- `job_id` (background job ID)
- `document_url` (indexed URL)

---

## 7. DOCKER BUILD & DEPLOYMENT

### 7.1 Dockerfile Configuration

**File:** `/compose/pulse/apps/webhook/Dockerfile`

```dockerfile
FROM python:3.13-slim

WORKDIR /app

# System dependencies
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Install uv package manager
RUN pip install --no-cache-dir uv

# Copy dependency files
COPY pyproject.toml uv.lock ./

# Install Python dependencies
RUN uv pip install --system --no-cache -r pyproject.toml

# Copy application code
COPY . .

# Create non-root user (UID 99)
RUN useradd -m -u 99 bridge && chown -R bridge:bridge /app
USER bridge

# Expose port
EXPOSE 52100

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:52100/health || exit 1

# Default command
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "52100"]
```

**Key Features:**
- Lightweight base image: `python:3.13-slim`
- uv for faster, more reliable dependency installation
- Single stage (no multi-stage build)
- Non-root user for security
- Health check via HTTP
- No hardcoded secrets

### 7.2 Docker Compose Configuration

**Service Name:** `pulse_webhook`

```yaml
pulse_webhook:
  <<: *common-service
  build:
    context: ./apps/webhook
    dockerfile: Dockerfile
  container_name: pulse_webhook
  ports:
    - "${WEBHOOK_PORT:-50108}:52100"
  environment:
    WEBHOOK_ENABLE_WORKER: "false"  # Use external worker container
  volumes:
    - ${APPDATA_BASE:-/mnt/cache/appdata}/pulse_webhook:/app/data/bm25
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

**Separate Worker Container:**

```yaml
pulse_webhook-worker:
  <<: *common-service
  build:
    context: ./apps/webhook
    dockerfile: Dockerfile
  container_name: pulse_webhook-worker
  command:
    - "python"
    - "-m"
    - "rq.cli"
    - "worker"
    - "--url"
    - "redis://pulse_redis:6379"
    - "--name"
    - "search-bridge-worker"
    - "--worker-ttl"
    - "600"
    - "indexing"
  volumes:
    - ${APPDATA_BASE:-/mnt/cache/appdata}/pulse_webhook/bm25:/app/data/bm25
    - ${APPDATA_BASE:-/mnt/cache/appdata}/pulse_webhook/hf_cache:/app/.cache/huggingface
  depends_on:
    - pulse_postgres
    - pulse_redis
  # No healthcheck (RQ doesn't expose HTTP)
  # No ports (worker is background process)
```

**Port Mapping:**
- External (host): `WEBHOOK_PORT` environment variable (default: 50108)
- Internal (container): `52100` (hardcoded)
- Exposed in Dockerfile: `EXPOSE 52100`

**Volume Mounts:**
- BM25 index storage: `${APPDATA_BASE}/pulse_webhook/bm25` → `/app/data/bm25`
- HuggingFace cache: `${APPDATA_BASE}/pulse_webhook/hf_cache` → `/app/.cache/huggingface`

**Dependencies:**
- `pulse_postgres` - Timing metrics and changedetection data
- `pulse_redis` - Background job queue

### 7.3 Common Service Anchor

All services inherit from `x-common-service`:

```yaml
x-common-service: &common-service
  restart: unless-stopped
  networks:
    - pulse
  env_file:
    - .env  # Single source of truth
  labels:
    - "com.centurylinklabs.watchtower.enable=false"
```

**Network:** User-defined bridge named `pulse` for DNS resolution by container name

---

## 8. DEPENDENCY INJECTION ARCHITECTURE

### 8.1 Dependency Management (api/deps.py)

**Singleton Pattern with Lazy Initialization:**

All services use lazy initialization to avoid creating clients before the async event loop is ready:

```python
_text_chunker: TextChunker | None = None
_embedding_service: Any = None
_vector_store: Any = None
_bm25_engine: Any = None
_redis_conn: Any = None
# ... etc

def get_vector_store() -> VectorStore:
    """Get or create VectorStore singleton."""
    global _vector_store
    if _vector_store is None:
        if settings.test_mode:
            _vector_store = _StubVectorStore()
        else:
            _vector_store = VectorStore(
                url=settings.qdrant_url,
                collection_name=settings.qdrant_collection,
                vector_dim=settings.vector_dim,
                timeout=int(settings.qdrant_timeout),
            )
    return _vector_store
```

### 8.2 Test Stubs

For testing without external services, stubs are provided:

- `_StubRedis` - Mock Redis with ping()
- `_StubQueue` - Mock RQ queue with enqueue()
- `_StubVectorStore` - Mock vector database
- `_StubEmbeddingService` - Mock embeddings
- `_StubIndexingService` - Mock indexing
- `_StubSearchOrchestrator` - Mock search
- `_StubBM25Engine` - Mock BM25
- `_StubTextChunker` - Mock text chunking

**Activation:** Set `WEBHOOK_TEST_MODE=true` in environment

### 8.3 Cleanup on Shutdown

```python
async def cleanup_services() -> None:
    """Clean up all singleton services during shutdown."""
    # Close async HTTP clients (embeddings, vector store)
    await _embedding_service.close()
    await _vector_store.close()
    
    # Close Redis connection (threaded)
    await asyncio.to_thread(_redis_conn.close)
    
    # Reset other singletons
    # This function is idempotent and can be called multiple times
```

---

## 9. BACKGROUND WORKER CONFIGURATION

### 9.1 Two Deployment Models

**Model 1: Embedded Thread (WEBHOOK_ENABLE_WORKER=true)**
- RQ worker runs in background thread within FastAPI process
- Simpler deployment (single container)
- Suitable for low-to-medium indexing volume
- Issues: Thread exit requires shutdown of entire API

**Model 2: External Worker (WEBHOOK_ENABLE_WORKER=false)**
- Separate `pulse_webhook-worker` container
- Recommended for production
- Allows independent scaling
- Better signal handling and process isolation
- Deployment: Two containers share Redis queue

### 9.2 Embedded Worker (worker_thread.py)

```python
class WorkerThreadManager:
    """Manages RQ worker in background thread."""
    
    def start(self) -> None:
        """Start worker in daemon thread."""
        self._thread = threading.Thread(
            target=self._run_worker,
            name="rq-worker",
            daemon=True,
        )
        self._thread.start()
    
    def stop(self) -> None:
        """Stop worker and cleanup services."""
        # Send stop signal to RQ worker
        if self._worker is not None:
            self._worker.request_stop()
        
        # Wait for thread exit (timeout: 10s)
        if self._thread is not None:
            self._thread.join(timeout=10.0)
        
        # Cleanup service pool after thread exits
        pool = ServicePool.get_instance()
        await pool.close()
```

### 9.3 External Worker

```bash
# Command in docker-compose
python -m rq.cli worker \
    --url redis://pulse_redis:6379 \
    --name search-bridge-worker \
    --worker-ttl 600 \
    indexing
```

**Parameters:**
- `--url` - Redis connection
- `--name` - Worker identifier
- `--worker-ttl` - Worker timeout (600 seconds)
- `indexing` - Queue name to consume from

**Job Handling:**
- Consumes from `indexing` queue
- Async indexing with comprehensive error logging
- Service pool reuse for efficiency
- Automatic timing metrics collection

---

## 10. DATABASE SCHEMA & MIGRATIONS

### 10.1 Database Setup

**Engine Configuration (infra/database.py):**

```python
engine = create_async_engine(
    settings.database_url,
    echo=False,  # Set True for SQL logging
    pool_pre_ping=True,  # Verify connections before use
    pool_size=20,  # Connection pool size
    max_overflow=10,  # Additional connections if pool full
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)
```

**Connection Pool:**
- Base pool: 20 connections
- Overflow: 10 additional connections
- Pre-ping: Verifies connection health before use

### 10.2 Models & Schema

**Schema Name:** `webhook` (PostgreSQL schema)

**Tables:**

1. **request_metrics**
   - Stores HTTP request-level timings
   - Indexed: timestamp, method, path, status_code, duration_ms, request_id
   - Stores: client IP, user agent, query/path params

2. **operation_metrics**
   - Stores service operation timings
   - Operation types: chunking, embedding, indexing, search
   - Indexed: timestamp, operation_type, success, request_id
   - Stores: error messages, document URLs, job IDs

3. **change_events**
   - Tracks changedetection.io webhook events
   - Indexed: watch_id, detected_at, rescrape_status
   - Stores: diff summary, snapshot URL, rescrape job status

### 10.3 Alembic Migrations

**Configuration:** `/compose/pulse/apps/webhook/alembic/`

**Environment Configuration (alembic/env.py):**
```python
# Uses settings.database_url from config.py
config.set_main_option("sqlalchemy.url", str(settings.database_url))

# Supports both sync (offline) and async migrations
async def run_async_migrations() -> None:
    """Run migrations asynchronously."""
```

**Migration Files (versions/):**
1. `57f2f0e22bad_add_timing_metrics_tables.py` - Initial tables
2. `20251109_100516_add_webhook_schema.py` - Schema creation
3. `20251110_000000_add_change_events.py` - Change events table

**Usage:**
```bash
# Apply migrations
alembic upgrade head

# Create new migration
alembic revision --autogenerate -m "description"

# Downgrade
alembic downgrade -1
```

---

## 11. API ROUTER STRUCTURE

### 11.1 Router Organization

**Router Aggregation (api/__init__.py):**

```python
router = APIRouter()

# Include feature routers with prefixes
router.include_router(search.router, prefix="/api", tags=["search"])
router.include_router(webhook.router, prefix="/api/webhook", tags=["webhooks"])
router.include_router(indexing.router, prefix="/api", tags=["indexing"])
router.include_router(health.router, tags=["health"])
router.include_router(metrics.router, tags=["metrics"])

# Main app includes router
app.include_router(api_router)
```

### 11.2 Endpoints by Router

**Search Router (/api/search)**
- `POST /api/search` - Search documents (hybrid, semantic, or keyword)
- Rate limit: 50 requests/minute
- Requires: `Authorization: Bearer <api_secret>`
- Returns: Ranked results with scores

**Webhook Router (/api/webhook)**
- `POST /api/webhook/firecrawl` - Firecrawl crawl completion
  - Signature verification required
  - Rate limit: Exempt (internal service)
  - Enqueues indexing jobs to Redis queue

- `POST /api/webhook/changedetection` - Change detected
  - HMAC verification
  - Triggers rescrape and auto-watch creation

**Indexing Router (/api/indexing)**
- `POST /api/index` - Index a single document
  - Requires API secret
  - Can be synchronous or queue-based
  - Returns: Chunks indexed, vector and BM25 counts

**Health Router (/health)**
- `GET /health` - Service health check
- No authentication required
- Returns: Overall status + per-service status

**Metrics Router (/metrics)**
- `GET /metrics/stats` - Index statistics
- `GET /metrics/requests` - Recent requests
- `GET /metrics/operations` - Operation timings
- No authentication required

---

## 12. SERVICE ARCHITECTURE

### 12.1 Core Services

**EmbeddingService** (`services/embedding.py`)
- Wraps HuggingFace Text Embeddings Inference API
- Lazy HTTP client creation
- Retry logic with exponential backoff
- Health check via GET /health
- Batch embedding support

**VectorStore** (`services/vector_store.py`)
- Qdrant vector database client
- Async operations
- Lazy client initialization
- Collection creation and verification
- Point insertion, filtering, search
- Timeout: Configurable (default 60s)

**BM25Engine** (`services/bm25_engine.py`)
- In-memory BM25 index
- Persisted to disk (BM25 index file)
- Token-based frequency analysis
- Configurable k1 and b parameters
- Document count tracking

**SearchOrchestrator** (`services/search.py`)
- Hybrid search combining vector + BM25
- Reciprocal Rank Fusion (RRF) fusion
- Configurable alpha (0.0 = BM25 only, 1.0 = vector only)
- Filter support (domain, language, country, mobile flag)
- Result ranking and deduplication

**IndexingService** (`services/indexing.py`)
- Orchestrates document indexing pipeline
- Text chunking with semantic splitting
- Embedding generation (batch)
- Vector storage (Qdrant)
- BM25 index updates
- Comprehensive timing metrics

**ServicePool** (`services/service_pool.py`)
- Singleton managing all service instances
- Ensures efficient resource reuse
- Cleanup on shutdown
- Used by worker thread for consistency

---

## 13. REQUEST/RESPONSE SCHEMAS

### 13.1 Search Schemas (api/schemas/search.py)

```python
class SearchRequest(BaseModel):
    query: str
    mode: Literal["hybrid", "semantic", "bm25", "keyword"]
    limit: int = 10
    filters: Optional[SearchFilters] = None

class SearchResponse(BaseModel):
    results: List[SearchResult]
    total: int
    mode: str
    execution_time_ms: float

class SearchResult(BaseModel):
    id: str
    score: float
    url: str
    title: str
    description: str
    domain: Optional[str] = None
    language: Optional[str] = None
    snippet: Optional[str] = None
```

### 13.2 Indexing Schemas (api/schemas/indexing.py)

```python
class IndexDocumentRequest(BaseModel):
    url: str
    title: str
    description: str
    content: str
    metadata: Optional[Dict[str, Any]] = None

class IndexResponse(BaseModel):
    success: bool
    url: str
    chunks_indexed: int
    job_id: Optional[str] = None
    execution_time_ms: float
```

### 13.3 Webhook Schemas (api/schemas/webhook.py)

```python
class FirecrawlWebhookEvent(BaseModel):
    type: str
    id: str
    success: bool
    data: List[FirecrawlData]
    metadata: Optional[Dict[str, Any]] = None

class ChangeDetectionPayload(BaseModel):
    watch_uuid: str
    watch_url: str
    diff: str
    snapshot_url: Optional[str] = None
```

---

## 14. CONFIGURATION VALIDATION & TESTING

### 14.1 Validation Features

**Secret Validation:**
- Whitespace detection in secrets
- Weak default detection
- Minimum length enforcement (32 chars)

**CORS Validation:**
- JSON array parsing
- Comma-separated parsing
- URL format validation
- Wildcard detection with warning

**Numeric Validation:**
- Alpha between 0.0 and 1.0
- Positive port numbers
- Reasonable timeout values

**Database URL Validation:**
- Connection string format
- Async driver detection
- Schema specification

### 14.2 Testing Configuration

**Test Mode (WEBHOOK_TEST_MODE=true):**
- Stubs all external services
- No actual HTTP calls
- No database access
- Instant responses for testing
- Useful for CI/CD pipelines

**Marker-Based Test Organization:**
```bash
# Run only tests not requiring external services
pytest -m "not external"

# Run specific test file
pytest tests/unit/test_config.py

# Run with coverage
pytest --cov=. --cov-report=html
```

---

## 15. SECURITY CONSIDERATIONS

### 15.1 Credential Management

**No Hardcoded Secrets:**
- All secrets loaded from environment variables
- `.env` file is gitignored
- `.env.example` provided as template
- Validation enforces secure defaults

**Secret Validation:**
- Minimum 32-character length in production
- Rejects known weak patterns
- Whitespace detection
- Timing-attack resistant comparison

### 15.2 Authentication Layers

**API Secret (Bearer Token):**
- Used for all search/indexing endpoints
- Standard Authorization header
- Constant-time comparison

**Webhook Signature (HMAC-SHA256):**
- Firecrawl events verified with signature
- SHA256 hash of request body
- Hex-encoded in X-Firecrawl-Signature header
- Constant-time comparison to prevent timing attacks

### 15.3 Rate Limiting

**Default:** 100 requests/minute per IP
**Storage:** Redis backend (persists across requests)
**Exemptions:** Webhook endpoint (internal service)

### 15.4 CORS Security

**Production Requirements:**
- Never use wildcard `*`
- Specify exact origins
- Logs warning if misconfigured
- Configuration validated on startup

### 15.5 Data Protection

**Sensitive Data in Logs:**
- API tokens not logged
- Query content logged (can be disabled)
- Error messages sanitized
- User data in extra_metadata (JSONB in DB)

---

## 16. DEPLOYMENT PATTERNS

### 16.1 Recommended Deployment

**Single Container (Embedded Worker):**
```bash
docker run -e WEBHOOK_ENABLE_WORKER=true \
           -e WEBHOOK_API_SECRET="<32+ chars>" \
           -e WEBHOOK_SECRET="<32+ chars>" \
           -p 50108:52100 \
           pulse_webhook
```

**Two-Container Setup (Recommended):**
```yaml
pulse_webhook:
  # API server (WEBHOOK_ENABLE_WORKER=false)
  # Handles HTTP requests only
  # Single replica sufficient

pulse_webhook-worker:
  # Background worker (RQ)
  # Processes indexing jobs
  # Can scale independently
```

### 16.2 Environment Variables Setup

**Production Checklist:**
```bash
# 1. Generate secrets
export WEBHOOK_API_SECRET=$(openssl rand -hex 32)
export WEBHOOK_SECRET=$(openssl rand -hex 32)

# 2. Set CORS origins (no wildcard!)
export WEBHOOK_CORS_ORIGINS='["https://app.example.com"]'

# 3. Configure infrastructure URLs
export WEBHOOK_QDRANT_URL=http://qdrant-host:6333
export WEBHOOK_TEI_URL=http://tei-host:80
export WEBHOOK_DATABASE_URL=postgresql+asyncpg://user:pass@db-host/db

# 4. Copy to .env
echo WEBHOOK_API_SECRET=$WEBHOOK_API_SECRET >> .env
echo WEBHOOK_SECRET=$WEBHOOK_SECRET >> .env
# ... etc
```

### 16.3 Health Check Verification

```bash
# Check health
curl -s http://localhost:50108/health | jq .

# Expected output:
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

---

## Summary: Configuration & Deployment Hierarchy

```
┌─────────────────────────────────────┐
│  Docker Compose (docker-compose.yaml) │
│  - Port mapping (50108:52100)        │
│  - Volume mounts (BM25, cache)      │
│  - Depends_on (postgres, redis)     │
│  - Healthcheck (HTTP GET /health)    │
└──────────────────┬──────────────────┘
                   │
        ┌──────────┴──────────┐
        │                     │
   ┌────▼──────────┐   ┌─────▼───────────┐
   │ Dockerfile    │   │ .env Variables   │
   │ - Base image  │   │ - Secrets        │
   │ - uv install  │   │ - Endpoints      │
   │ - Non-root    │   │ - Config         │
   │ - Healthcheck │   └─────────────────┘
   └────┬──────────┘
        │
   ┌────▼──────────────────────────┐
   │  FastAPI Application (main.py) │
   │  - Lifespan manager            │
   │  - Middleware stack            │
   │  - Router registration         │
   │  - Exception handling          │
   └────┬──────────────────────────┘
        │
   ┌────┴──────────────────────────────────┐
   │  Configuration (config.py)            │
   │  - Pydantic Settings                  │
   │  - Environment variable resolution    │
   │  - Validation (secrets, CORS, etc.)  │
   └────┬──────────────────────────────────┘
        │
   ┌────┴──────────────────────────────────┐
   │  Dependency Injection (api/deps.py)   │
   │  - Singleton services                 │
   │  - Test stubs                         │
   │  - Cleanup on shutdown                │
   └────────────────────────────────────────┘
```

---

**Total Configuration Points:** 50+
**Environment Variables:** 40+
**API Endpoints:** 15+
**Database Tables:** 3
**Service Classes:** 8+
**Middleware Layers:** 4
**Lines of Code:** 14,686+
