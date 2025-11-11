# Firecrawl Webhook Flattening & Cleanup Plan (REVISED)

- **Author:** Claude (Sonnet 4.5)
- **Timestamp (EST):** 20:15:00 | 11/10/2025
- **Scope:** `apps/webhook`
- **Goal:** Remove the `app/` wrapper to comply with monorepo guidelines, adopt a layered layout that mirrors runtime responsibilities, and prepare the service for incremental modernization without breaking existing entry points or tests.

## 1. Problem Statement

- **Violates Repo Guideline:** The `app/` wrapper violates the explicit "no `src/`-style wrappers" rule, making imports longer (`from app.services.search` vs `from apps.webhook.services.search`)
- **Mixed Responsibilities:** API routers, background workers, infrastructure clients are intermixed, complicating ownership and future extraction
- **Split Model Confusion:** Both `app/models.py` (Pydantic API schemas) and `app/models/timing.py` (SQLAlchemy) exist without clear separation
- **Hardcoded Build Config:** `pyproject.toml` has `packages = ["app"]` which enforces the wrapper
- **Test Import Debt:** 90+ import statements reference `from app.*` across test suite
- **Docker Coupling:** Dockerfile has `COPY app/ ./app/` and `CMD uvicorn app.main:app` hardcoded

## 2. Design Principles

1. **Eliminate Wrapper** – No `app/` directory; flatten to `apps/webhook/<domain-folders>`
2. **Short Imports** – Target `from apps.webhook.api.routers import search_router` or relative imports
3. **Separate Concerns** – API schemas (Pydantic) in `api/schemas/`, domain models (SQLAlchemy) in `domain/models.py`
4. **Shared Infrastructure First** – Centralize database, Redis, rate limiting in `infra/` for reuse
5. **Drop-In Compatibility** – Keep entry point names (`main.py`, `worker.py`) stable to avoid Docker changes
6. **Tests Mirror Code** – Restructure `tests/unit` and `tests/integration` to match new folders
7. **TDD Enforcement** – Write tests first when touching functionality

## 3. Current State Inventory

### Files at `app/` Root (8 files)
```
app/
├── __init__.py           # 235 bytes - exports
├── config.py             # 11 KB - Pydantic settings
├── database.py           # 2.7 KB - SQLAlchemy async session
├── main.py               # 7 KB - FastAPI app + lifespan
├── models.py             # 8.2 KB - Pydantic API schemas (NOT in original plan!)
├── rate_limit.py         # 353 bytes - SlowAPI setup
├── worker.py             # 8.4 KB - RQ worker bootstrap
└── worker_thread.py      # 3 KB - WorkerThreadManager
```

### Subdirectories (7 folders)
```
app/
├── api/
│   ├── dependencies.py   # 12.8 KB - FastAPI dependencies
│   ├── metrics_routes.py # 11 KB - Metrics endpoints (already split!)
│   └── routes.py         # 23 KB - Monolithic search/webhook/health
├── clients/
│   └── changedetection.py
├── jobs/
│   └── rescrape.py
├── middleware/
│   └── timing.py
├── models/
│   └── timing.py         # SQLAlchemy models (conflicts with app/models.py!)
├── services/            # 7 files - all correct
└── utils/               # 2 files - all correct
```

### Import Pattern
- All imports use `from app.X` (90 occurrences in tests)
- Dockerfile uses `COPY app/ ./app/` and `CMD uvicorn app.main:app`
- `pyproject.toml` has `packages = ["app"]`

## 4. Target Directory Layout

```
apps/webhook/
├── __init__.py                # export settings, limiter, logging helpers
├── config.py                  # Pydantic settings (no change)
├── main.py                    # FastAPI app/lifespan (update imports only)
├── worker.py                  # RQ worker bootstrap (update imports only)
├── worker_thread.py           # WorkerThreadManager (update imports only)
│
├── api/
│   ├── __init__.py            # router aggregation
│   ├── routers/               # SPLIT routes.py (714 lines) into 4 files
│   │   ├── __init__.py
│   │   ├── search.py          # POST /api/search + GET /api/stats
│   │   ├── webhook.py         # POST /api/webhook/changedetection + /api/webhook/firecrawl
│   │   ├── indexing.py        # POST /api/index (legacy endpoint)
│   │   └── health.py          # GET /health
│   ├── deps.py                # RENAME from dependencies.py (FastAPI deps)
│   ├── middleware/            # MOVE from app/middleware/
│   │   ├── __init__.py
│   │   └── timing.py
│   └── schemas/               # NEW: API request/response schemas
│       ├── __init__.py
│       ├── search.py          # MOVE from app/models.py (SearchRequest, SearchResponse, etc.)
│       ├── indexing.py        # IndexDocumentRequest, IndexDocumentResponse
│       └── webhook.py         # Webhook payloads (if needed)
│
├── domain/
│   ├── __init__.py
│   └── models.py              # MOVE from app/models/timing.py (SQLAlchemy: RequestMetric, OperationMetric, ChangeEvent)
│
├── services/
│   ├── __init__.py
│   ├── bm25_engine.py         # no change
│   ├── vector_store.py        # no change
│   ├── embedding.py           # no change
│   ├── search.py              # no change (orchestrator + RRF)
│   ├── indexing.py            # no change
│   ├── webhook_handlers.py   # no change
│   └── auto_watch.py          # no change
│
├── infra/
│   ├── __init__.py
│   ├── database.py            # MOVE from app/database.py (SQLAlchemy session)
│   ├── redis.py               # EXTRACT from worker.py (Redis connection factory)
│   └── rate_limit.py          # MOVE from app/rate_limit.py (SlowAPI limiter)
│
├── workers/
│   ├── __init__.py
│   └── jobs.py                # MOVE from app/jobs/rescrape.py (RQ job entrypoints)
│
├── clients/
│   ├── __init__.py
│   └── changedetection.py     # no change
│
├── utils/
│   ├── __init__.py
│   ├── logging.py             # no change
│   └── text_processing.py     # no change
│
├── alembic/                   # no change
│   ├── env.py                 # UPDATE: import from apps.webhook.domain.models
│   └── versions/
├── tests/
│   ├── unit/                  # MIRROR new structure + fix imports
│   │   ├── api/
│   │   ├── services/
│   │   ├── infra/
│   │   └── ...
│   └── integration/           # MIRROR new structure + fix imports
├── .dockerignore              # ADD app/, __pycache__, tests/
├── Dockerfile                 # UPDATE: COPY . . (filter via .dockerignore), CMD uvicorn main:app
├── pyproject.toml             # REMOVE packages = ["app"] or change to workspace config
└── README.md                  # UPDATE: architecture diagram, structure section
```

## 5. Migration Steps

### Phase 1: Create New Structure (Non-Breaking)

**Goal:** Set up new directories without moving files yet

```bash
# Create new directories
mkdir -p api/routers api/middleware api/schemas
mkdir -p domain infra workers
mkdir -p tests/unit/{api,domain,infra,services,workers,clients,utils}
mkdir -p tests/integration/{api,services,workers}

# Create __init__.py files
touch api/__init__.py api/routers/__init__.py api/middleware/__init__.py api/schemas/__init__.py
touch domain/__init__.py infra/__init__.py workers/__init__.py
```

**Verification:**
```bash
tree apps/webhook -d -L 2 -I '__pycache__|.venv|.cache|data'
```

### Phase 2: Move Infrastructure Layer

**Goal:** Move database, Redis, rate limiting to `infra/` (no business logic)

```bash
# Move files
mv app/database.py infra/database.py
mv app/rate_limit.py infra/rate_limit.py

# Extract Redis factory from worker.py
# Create infra/redis.py with:
# - get_redis_connection()
# - get_redis_queue()
```

**Update Imports:**
- `from app.database import` → `from apps.webhook.infra.database import`
- `from app.rate_limit import` → `from apps.webhook.infra.rate_limit import`

**Tests to Write (TDD):**
1. `tests/unit/infra/test_database.py` - Test async session creation, cleanup
2. `tests/unit/infra/test_redis.py` - Test Redis connection, queue factory
3. `tests/unit/infra/test_rate_limit.py` - Test limiter initialization

**Verification:**
```bash
cd apps/webhook && uv run pytest tests/unit/infra/ -v
```

### Phase 3: Move Domain Models

**Goal:** Separate SQLAlchemy (domain) from Pydantic (API schemas)

```bash
# Move SQLAlchemy models
mv app/models/timing.py domain/models.py
rm -rf app/models/  # Remove empty directory

# Create API schemas
# Split app/models.py into:
# - api/schemas/search.py (SearchRequest, SearchResponse, SearchResult, SearchFilter, SearchMode)
# - api/schemas/indexing.py (IndexDocumentRequest, IndexDocumentResponse)
```

**Update Imports:**
- SQLAlchemy: `from app.models.timing import` → `from apps.webhook.domain.models import`
- Pydantic: `from app.models import` → `from apps.webhook.api.schemas.search import`

**Update Alembic:**
- `alembic/env.py`: Change `from app.models.timing import Base` → `from apps.webhook.domain.models import Base`

**Tests to Write (TDD):**
1. `tests/unit/domain/test_models.py` - Test SQLAlchemy model creation, relationships
2. `tests/unit/api/test_schemas_search.py` - Test Pydantic validation for search schemas
3. `tests/unit/api/test_schemas_indexing.py` - Test Pydantic validation for indexing schemas

**Verification:**
```bash
cd apps/webhook && uv run pytest tests/unit/domain/ tests/unit/api/ -v
# Run Alembic check
cd apps/webhook && uv run alembic check
```

### Phase 4: Move Workers

**Goal:** Consolidate background job logic into `workers/`

```bash
# Move RQ jobs
mv app/jobs/rescrape.py workers/jobs.py
rm -rf app/jobs/  # Remove empty directory
```

**Update Imports:**
- `from app.jobs.rescrape import` → `from apps.webhook.workers.jobs import`

**Update `worker.py`:**
- Import jobs from new location
- Use `infra.redis` for Redis connection

**Tests to Write (TDD):**
1. `tests/unit/workers/test_jobs.py` - Test rescrape job logic
2. `tests/integration/workers/test_worker_lifecycle.py` - Test worker startup/shutdown

**Verification:**
```bash
cd apps/webhook && uv run pytest tests/unit/workers/ tests/integration/workers/ -v
```

### Phase 5: Split API Routers

**Goal:** Break monolithic `routes.py` (714 lines) into feature routers

**Router Breakdown:**
1. **`api/routers/search.py`** (~200 lines)
   - `POST /api/search` - Search endpoint
   - `GET /api/stats` - Index statistics
2. **`api/routers/webhook.py`** (~250 lines)
   - `POST /api/webhook/changedetection` - Changedetection.io webhook
   - `POST /api/webhook/firecrawl` - Firecrawl webhook (if exists)
3. **`api/routers/indexing.py`** (~150 lines)
   - `POST /api/index` - Legacy document indexing
4. **`api/routers/health.py`** (~50 lines)
   - `GET /health` - Health check

**Router Aggregation (`api/__init__.py`):**
```python
from fastapi import APIRouter
from apps.webhook.api.routers import search, webhook, indexing, health

router = APIRouter()
router.include_router(search.router, prefix="/api", tags=["search"])
router.include_router(webhook.router, prefix="/api/webhook", tags=["webhooks"])
router.include_router(indexing.router, prefix="/api", tags=["indexing"])
router.include_router(health.router, tags=["health"])
```

**Move Existing Metrics:**
```bash
# Rename to match new convention
mv app/api/metrics_routes.py api/routers/metrics.py
```

**Update `main.py`:**
```python
from apps.webhook.api import router as api_router
app.include_router(api_router)
```

**Move Dependencies:**
```bash
mv app/api/dependencies.py api/deps.py
```

**Move Middleware:**
```bash
mv app/middleware/timing.py api/middleware/timing.py
rm -rf app/middleware/
```

**Tests to Write (TDD):**
1. `tests/unit/api/routers/test_search.py` - Test search endpoint logic
2. `tests/unit/api/routers/test_webhook.py` - Test webhook handling
3. `tests/unit/api/routers/test_indexing.py` - Test indexing endpoint
4. `tests/unit/api/routers/test_health.py` - Test health check
5. `tests/integration/api/test_api_routes.py` - E2E API tests

**Verification:**
```bash
cd apps/webhook && uv run pytest tests/unit/api/routers/ -v
cd apps/webhook && uv run pytest tests/integration/api/ -v
```

### Phase 6: Move Services and Clients (No Changes)

**Goal:** Move to top-level without changing code

```bash
# Services (already correct structure, just move)
mv app/services/* services/
rm -rf app/services/

# Clients
mv app/clients/* clients/
rm -rf app/clients/

# Utils
mv app/utils/* utils/
rm -rf app/utils/
```

**Update Imports:**
- `from app.services.X import` → `from apps.webhook.services.X import`
- `from app.clients.X import` → `from apps.webhook.clients.X import`
- `from app.utils.X import` → `from apps.webhook.utils.X import`

**Tests to Update:**
- Fix all imports in `tests/unit/services/`
- Fix all imports in `tests/unit/clients/`
- Fix all imports in `tests/unit/utils/`

**Verification:**
```bash
cd apps/webhook && uv run pytest tests/unit/services/ tests/unit/clients/ tests/unit/utils/ -v
```

### Phase 7: Move Entry Points

**Goal:** Move `main.py`, `worker.py`, `worker_thread.py`, `config.py` to root

```bash
# Move entry points
mv app/main.py main.py
mv app/worker.py worker.py
mv app/worker_thread.py worker_thread.py
mv app/config.py config.py
mv app/__init__.py __init__.py

# Remove empty app/ directory
rm -rf app/
```

**Update Imports in Entry Points:**
- All `from app.X` → `from apps.webhook.X` or relative imports
- Example: `from app.api.deps import` → `from apps.webhook.api.deps import`

**Verification:**
```bash
cd apps/webhook && uv run python -c "from apps.webhook.main import app; print('Import successful')"
```

### Phase 8: Update Build Configuration

**Goal:** Update Docker, pyproject.toml, .dockerignore

**`pyproject.toml` Changes:**
```toml
# BEFORE:
[tool.hatch.build.targets.wheel]
packages = ["app"]

# AFTER (remove section entirely, Hatch auto-discovers):
# [tool.hatch.build.targets.wheel] - DELETED
```

**`.dockerignore` Changes:**
```dockerignore
# Add to prevent copying unnecessary files
app/
__pycache__/
*.pyc
.pytest_cache/
.cache/
.venv/
tests/
*.md
docs/
.git/
.gitignore
```

**`Dockerfile` Changes:**
```dockerfile
# BEFORE:
COPY app/ ./app/
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "52100"]

# AFTER:
COPY . .
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "52100"]
```

**Verification:**
```bash
cd apps/webhook && docker build -t webhook-test .
docker run --rm webhook-test python -c "from apps.webhook.main import app; print('Docker import successful')"
```

### Phase 9: Update All Test Imports

**Goal:** Fix all 90+ `from app.X` imports in tests

**Strategy:**
1. Use `sed` to bulk-replace imports:
   ```bash
   cd apps/webhook/tests
   find . -name "*.py" -exec sed -i 's/from app\./from apps.webhook./g' {} +
   ```
2. Manually verify and fix relative imports where appropriate
3. Run full test suite after each file

**Tests to Run:**
```bash
cd apps/webhook && uv run pytest tests/unit/ -v --tb=short
cd apps/webhook && uv run pytest tests/integration/ -v --tb=short
```

**Verification:**
```bash
# Check for remaining app. imports
cd apps/webhook && grep -r "from app\." tests/ --include="*.py"
# Should return 0 results
```

### Phase 10: Update Documentation

**Goal:** Update README, CLAUDE.md, architecture diagrams

**Files to Update:**
1. `apps/webhook/README.md`
   - Update "Project Structure" section with new layout
   - Update import examples
   - Update development commands
2. `CLAUDE.md`
   - Update webhook service description
   - Update cross-service communication patterns
3. `.docs/sessions/2025-11-10-webhook-flattening.md`
   - Create session log documenting all changes, decisions, and verification results

**Verification:**
```bash
# Check all links work
cd apps/webhook && grep -r "apps/webhook" README.md CLAUDE.md
```

## 6. Verification Strategy

### Static Analysis
```bash
# From monorepo root
pnpm lint:webhook      # Ruff format + lint
pnpm typecheck:webhook # mypy strict mode
```

### Unit Tests
```bash
cd apps/webhook
uv run pytest tests/unit/ -v --cov=apps.webhook --cov-report=term-missing
# Target: 85%+ coverage
```

### Integration Tests
```bash
cd apps/webhook
uv run pytest tests/integration/ -v --tb=short
# Focus on: webhook handlers, worker jobs, E2E API flows
```

### Smoke Tests
```bash
# Development server
cd apps/webhook && uv run uvicorn main:app --reload
# Check:
# - http://localhost:52100/docs (OpenAPI)
# - http://localhost:52100/health
# - Worker thread starts without errors
```

### Docker Compose
```bash
# From monorepo root
pnpm services:up
# Verify:
# - firecrawl_webhook container starts
# - firecrawl_webhook_worker container starts
# - Health check passes (docker compose ps)
# - Logs show no import errors
```

### Migration Database
```bash
cd apps/webhook
uv run alembic upgrade head  # Should apply without errors
uv run alembic check         # Should report no issues
```

## 7. Rollback Plan

If migration fails at any phase:

1. **Git Checkpoint:** Create commits after each phase for easy revert
2. **Backup:** `git stash` or create backup branch before starting
3. **Rollback Command:**
   ```bash
   git reset --hard <phase-commit-sha>
   cd apps/webhook && uv sync
   cd apps/webhook && uv run pytest tests/
   ```

## 8. Risks & Mitigations

### Risk: Import Circular Dependencies
**Symptom:** `ImportError: cannot import name 'X' from partially initialized module`
**Mitigation:**
- Keep `infra/` free of `api/` imports
- Use factory functions instead of top-level singletons
- Add `__init__.py` carefully to avoid eager imports

### Risk: Test Coverage Gaps
**Symptom:** Tests pass but functionality breaks in production
**Mitigation:**
- Write TDD tests BEFORE moving files
- Run integration tests after EACH phase
- Maintain 85%+ coverage throughout

### Risk: Docker Build Failures
**Symptom:** `ModuleNotFoundError: No module named 'app'`
**Mitigation:**
- Update Dockerfile in Phase 8 (not earlier)
- Test Docker build locally before pushing
- Use `.dockerignore` to prevent copying old `app/` directory

### Risk: Alembic Migration Breaks
**Symptom:** `alembic upgrade head` fails with import errors
**Mitigation:**
- Update `alembic/env.py` imports in Phase 3 immediately after moving models
- Test migration on clean database before proceeding
- Keep database schema changes separate from refactor

### Risk: Lost Session State (RQ Worker)
**Symptom:** Background jobs fail after deployment
**Mitigation:**
- Deploy during low-traffic window
- Drain RQ queue before deployment (`rq empty`)
- Monitor job failures post-deployment

## 9. Post-Migration Cleanup

After successful migration:

1. **Remove Old Patterns:**
   ```bash
   # Search for any remaining app. imports
   grep -r "from app\." apps/webhook/ --include="*.py" --exclude-dir=.venv
   grep -r "import app\." apps/webhook/ --include="*.py" --exclude-dir=.venv
   ```

2. **Update Pre-commit Hooks:**
   - Add linting to enforce `apps.webhook.*` imports
   - Prevent reintroduction of `app/` wrapper

3. **Archive Old Docs:**
   - Move obsolete docs to `.docs/archive/`
   - Update all documentation references

4. **Metrics Baseline:**
   - Record test execution time (should improve with cleaner imports)
   - Record Docker image size (should stay same or decrease)

## 10. Success Criteria

- [ ] Zero `from app.` imports in codebase
- [ ] All 100+ tests passing (unit + integration)
- [ ] 85%+ code coverage maintained
- [ ] Static analysis passes (ruff, mypy)
- [ ] Alembic migrations work without errors
- [ ] Docker Compose services start successfully
- [ ] Health checks pass for all services
- [ ] No circular import errors
- [ ] Documentation updated and accurate
- [ ] Session log created with full verification results

## 11. Estimated Effort

| Phase | Effort | Risk | Dependencies |
|-------|--------|------|--------------|
| 1. Create Structure | 15 min | Low | None |
| 2. Move Infra | 45 min | Medium | Phase 1 |
| 3. Move Domain Models | 1 hour | High | Phase 2 |
| 4. Move Workers | 30 min | Medium | Phase 3 |
| 5. Split API Routers | 2 hours | High | Phase 4 |
| 6. Move Services/Clients | 30 min | Low | Phase 5 |
| 7. Move Entry Points | 30 min | Medium | Phase 6 |
| 8. Update Build Config | 45 min | High | Phase 7 |
| 9. Update Test Imports | 1 hour | Medium | Phase 8 |
| 10. Update Docs | 30 min | Low | Phase 9 |

**Total:** ~7-8 hours (with testing and verification)

## 12. Next Actions

1. **Review Plan:** Get stakeholder approval on structure changes
2. **Create Feature Branch:** `git checkout -b feat/webhook-flatten-app-wrapper`
3. **Execute Phases:** Run phases 1-10 sequentially with TDD
4. **Code Review:** Submit PR with full test results and session log
5. **Deploy:** Merge to main and deploy to production

---

**IMPORTANT:** Do NOT skip TDD tests in any phase. Write tests FIRST, see them fail, then move files. This ensures the refactor doesn't break functionality.
