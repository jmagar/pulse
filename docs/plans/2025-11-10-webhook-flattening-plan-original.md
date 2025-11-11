# Firecrawl Webhook Flattening & Cleanup Plan

- **Author:** Codex (GPT-5)
- **Timestamp (EST):** 19:21:24 | 11/10/2025
- **Scope:** `apps/webhook`
- **Goal:** Remove the legacy `app/` wrapper, adopt a layered layout that mirrors runtime responsibilities, and prepare the service for incremental modernization without breaking existing entry points or tests.

## 1. Problem Statement

- Nested `app/` package violates repo guideline (“no `src/`-style wrappers”), making imports longer and harder to share across apps.
- Responsibilities are intermixed (e.g., FastAPI routers, background worker thread, infra clients) which complicates ownership and future extraction.
- Tests mirror the old layout, so reorganizing without a plan risks coverage gaps and brittle imports.
- Documentation does not explain how to navigate the service after flattening.

## 2. Design Principles

1. **Single Responsibility Folders** – group files by concern (API, services, domain, infra, workers, utils).
2. **Short Imports** – target paths such as `from apps.webhook.api import routes` instead of `app.api.routes`.
3. **Shared Infrastructure First** – centralize clients and DB/Redis factories so other services can reuse them later.
4. **Drop-In Compatibility** – keep ASGI entry (`main.py`) and worker bootstrap (`worker.py`, `worker_thread.py`) names stable to avoid touching deployment scripts.
5. **Tests Mirror Code** – restructure `tests/unit` and `tests/integration` to match new folders; enforce TDD when touching functionality.

## 3. Target Directory Layout

```
apps/webhook/
├── __init__.py                # export settings, limiter, logging helpers
├── config.py                  # Pydantic settings
├── main.py                    # FastAPI app/lifespan wiring
├── worker.py / worker_thread.py
├── api/
│   ├── __init__.py
│   ├── routers/               # search.py, webhook.py, metrics.py, health.py
│   ├── deps/                  # dependency callables (db sessions, services)
│   ├── middleware/            # timing, logging, etc.
│   └── schemas/               # API-only schema overrides if needed
├── domain/
│   ├── __init__.py
│   ├── events.py              # ChangeDetection + Firecrawl payloads
│   ├── search.py              # SearchRequest, SearchResponse, SearchResult
│   └── models.py              # SQLAlchemy tables for timing metrics
├── services/
│   ├── bm25_engine.py
│   ├── vector_store.py
│   ├── embedding.py
│   ├── search.py              # orchestrator + ranking fusion
│   ├── indexing.py
│   ├── webhook_handlers.py
│   └── auto_watch.py
├── infra/
│   ├── database.py            # async session management
│   ├── redis.py               # queue wiring + limiter storage
│   ├── http_clients.py        # shared httpx clients
│   └── rate_limit.py          # limiter + SlowAPI setup
├── workers/
│   ├── __init__.py
│   ├── jobs.py                # RQ job entrypoints (index_document_job, etc.)
│   └── runner.py              # WorkerThreadManager, queue bootstrap
├── clients/
│   └── changedetection.py     # external API client (thin wrappers belong here)
├── utils/
│   ├── logging.py
│   ├── text_processing.py
│   └── timing.py              # middleware helpers
├── alembic/                   # unchanged, keep alongside app
├── tests/
│   ├── unit/<mirror folders>
│   └── integration/<mirror folders>
└── README.md / docs
```

## 4. Migration Steps

1. **Create New Packages**
   - Add empty `api/routers`, `api/deps`, `domain/`, `infra/`, `services/`, `workers/`, and `utils/` directories with `__init__.py`.
   - Update `pyproject.toml` to ensure `packages = ["apps.webhook"]` or configure Hatch to include nested packages if needed.
2. **Move Modules**
   - Promote all `app/*` modules into their new homes (e.g., `app/api/routes.py → apps/webhook/api/routers/search.py` split, `database.py → infra/database.py`).
   - Update imports across the service and tests to point to the new package paths.
3. **Recompose API Layer**
   - Split the monolithic `routes.py` into feature routers (search, webhook intake, indexing legacy, metrics) to align with FastAPI best practice.
   - Introduce `api/__init__.py` for router aggregation (e.g., `router = fastapi.APIRouter(); router.include_router(search_router, prefix="/api")`).
4. **Stabilize Lifespan + Worker**
   - Move `cleanup_services`, `get_vector_store`, etc., into `api/deps` and `services/`.
   - Ensure `WorkerThreadManager` now lives in `workers/runner.py` and is imported lazily by `main.py`.
5. **Adjust Clients/Infra**
   - Relocate logging helper + limiter setup into `infra/` or `utils/` as per responsibilities.
   - Confirm `__init__.py` exports `settings` and other singletons for convenience.
6. **Restructure Tests**
   - Mirror the new folders inside `tests/unit` and `tests/integration`, keeping existing test content but fixing import paths.
   - Update `pytest` fixtures to consume `apps.webhook` modules.
7. **Documentation + Tooling**
   - Update `apps/webhook/README.md` (architecture diagram, structure section).
   - Cross-link plan from `CLAUDE.md` “Adding New Services” section if relevant.
   - Ensure `.docs/services-ports.md` stays untouched unless ports change.

## 5. Verification Strategy

1. **Static Analysis**
   - `pnpm lint:webhook`, `pnpm typecheck:webhook`, `pnpm format:webhook`.
2. **Unit Tests**
   - Run targeted suites (`pnpm test:webhook -- tests/unit/api tests/unit/services`).
3. **Integration/E2E**
   - `pnpm test:webhook -- tests/integration` focusing on webhook + worker paths.
4. **Smoke Run**
   - `pnpm dev:webhook` to ensure FastAPI serves docs and worker thread initializes.
5. **Docker Compose (Optional)**
   - `pnpm services:up` to ensure container build no longer references `app.main`.

Document any failures plus fixes in `.docs/sessions/` log per workflow.

## 6. Risks & Follow-Ups

- **Import Drift:** Moving modules may leave dangling circular imports; mitigate by keeping `infra` free of `api` references and by introducing factory functions rather than top-level singletons.
- **Test Debt:** Large reorg can hide untested behavior; prioritize TDD when touching logic and expand coverage where missing.
- **Deployment Scripts:** Search for strings like `app.main:app` in Dockerfiles, scripts, or Helm charts before merging.
- **Future Work:** After flattening, consider extracting reusable infra (logging, auto-watch) into `packages/` for other services.

## 7. Next Actions

1. Align stakeholders on this plan.
2. Execute moves in small, reviewed PRs (e.g., “API slice”, “services slice”) while running full test matrix.
3. Update docs/CLI scripts after each slice.
