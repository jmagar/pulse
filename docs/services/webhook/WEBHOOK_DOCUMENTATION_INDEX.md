# Webhook Server Documentation Index

## Overview

This directory contains comprehensive documentation for the `pulse_webhook` service - a FastAPI-based hybrid search bridge that indexes Firecrawl-crawled content and provides semantic/BM25 search capabilities.

**Service Location:** `/compose/pulse/apps/webhook/`  
**Container Name:** `pulse_webhook` (API server) + `pulse_webhook-worker` (background worker)  
**Internal Port:** 52100 | External Port: 50108 (configurable)  
**Status:** Production-ready with health checks and monitoring

---

## Documentation Files

### Core Reference Documentation

#### 1. **webhook-configuration-deployment-analysis.md** ⭐ START HERE
- **Size:** 37 KB, 1,319 lines
- **Type:** Comprehensive technical reference
- **Contents:**
  - 16 major sections covering every aspect
  - Environment variable configuration and validation
  - Python dependencies with versions
  - FastAPI application lifecycle (startup/shutdown)
  - CORS and security configuration
  - Structured logging with structlog
  - Monitoring and health checks
  - Docker build and deployment
  - Dependency injection architecture
  - Background worker configuration (embedded vs external)
  - Database schema and Alembic migrations
  - API router structure
  - Service architecture
  - Request/response schemas

**Best for:** Deep understanding, troubleshooting, production setup

#### 2. **webhook-quick-reference.md** ⭐ DAILY REFERENCE
- **Size:** 10 KB, ~400 lines
- **Type:** Quick lookup guide
- **Contents:**
  - Service overview and version info
  - Essential configuration snippets
  - Health check commands and expected responses
  - Complete API endpoint table
  - Docker Compose examples (single and two-container)
  - Logging configuration and format
  - Search parameter tuning
  - Rate limiting configuration
  - Test mode activation
  - Troubleshooting checklist
  - Performance tuning tips
  - File locations and dependency counts

**Best for:** Daily development, quick lookups, copy-paste configs

### Existing Documentation

#### 3. webhook-api-endpoints.md
- API endpoint reference
- Request/response examples
- Authentication details
- Error codes

#### 4. webhook-routing-architecture.md
- Router organization
- Endpoint grouping
- Route prefixes
- Middleware ordering

#### 5. webhook-worker-architecture.md
- Worker models (embedded vs external)
- Job queue configuration
- Service pool management
- Scalability considerations

#### 6. webhook-api-quick-reference.md
- Endpoint summary table
- Example requests
- Rate limits per endpoint

---

## Quick Navigation

### For Different Audiences

**👨‍💻 Developers**
1. Start with **webhook-quick-reference.md**
2. Review **webhook-api-endpoints.md** for API details
3. Check **webhook-routing-architecture.md** for code structure

**🔧 DevOps/SRE**
1. Read **webhook-configuration-deployment-analysis.md** (sections 1-7)
2. Review Docker section (7) and health checks (6)
3. Check database migrations (10)
4. Consult **webhook-quick-reference.md** for troubleshooting

**🏗️ Architects/Reviewers**
1. Start with **webhook-configuration-deployment-analysis.md** (sections 1-4)
2. Review service architecture (12)
3. Check dependency injection (8)
4. Review worker architecture (9)

**🧪 QA/Testing**
1. Review API endpoints section (11)
2. Check test mode section in **webhook-quick-reference.md**
3. Review health check section (6)
4. Check rate limiting section

### By Topic

**Configuration & Secrets**
- Quick: `webhook-quick-reference.md` → "Essential Configuration" section
- Deep: `webhook-configuration-deployment-analysis.md` → Section 1

**Security**
- Quick: `webhook-quick-reference.md` → "Essential Configuration" section
- Deep: `webhook-configuration-deployment-analysis.md` → Section 4

**Deployment**
- Quick: `webhook-quick-reference.md` → "Docker Compose" section
- Deep: `webhook-configuration-deployment-analysis.md` → Section 7

**API Usage**
- Quick: `webhook-api-quick-reference.md`
- Deep: `webhook-api-endpoints.md`
- Complete: `webhook-configuration-deployment-analysis.md` → Section 11

**Health & Monitoring**
- Quick: `webhook-quick-reference.md` → "Health Check" section
- Deep: `webhook-configuration-deployment-analysis.md` → Section 6

**Troubleshooting**
- Quick: `webhook-quick-reference.md` → "Troubleshooting" section
- Deep: `webhook-configuration-deployment-analysis.md` → Section 14 (partially covered in section 1.3)

**Performance**
- Quick: `webhook-quick-reference.md` → "Performance Tuning" section
- Deep: `webhook-configuration-deployment-analysis.md` → Section 13

---

## Key Facts at a Glance

**Technology Stack:**
- Python 3.13 (min 3.12)
- FastAPI 0.121.1+
- Uvicorn ASGI server
- PostgreSQL (async) + Redis + Qdrant + TEI
- SQLAlchemy 2.0 async ORM
- Alembic migrations
- structlog structured logging
- uv package manager (NOT pip)

**Configuration:**
- 40+ environment variables
- Pydantic Settings with multi-source resolution
- Comprehensive validation (secrets, CORS, numeric)
- Single source of truth: `.env` file

**Security:**
- API secret authentication (Bearer tokens)
- Webhook signature verification (HMAC-SHA256)
- Rate limiting (100/min default, Redis-backed)
- CORS configuration with wildcard warnings
- 32-character minimum secrets in production

**Database:**
- PostgreSQL schema: `webhook`
- 3 tables: request_metrics, operation_metrics, change_events
- Connection pool: 20 base + 10 overflow
- Pre-ping health verification
- Alembic migrations (3 existing)

**API Endpoints:**
- `/api/search` - Search documents (50/min, Bearer auth)
- `/api/index` - Index document (100/min, Bearer auth)
- `/api/webhook/firecrawl` - Webhook (signature auth, exempt)
- `/health` - Health check (public)
- `/metrics/*` - Statistics (public)

**Deployment Models:**
1. Single container with embedded worker (simple, limited scaling)
2. Two containers (recommended): API + external worker (scalable, isolated)

**Code Quality:**
- 14,686 lines of Python
- 100+ files organized by function
- Type hints required (mypy strict mode)
- Ruff linting (100 char lines, PEP 8)
- 85%+ test coverage target
- Comprehensive docstrings

---

## Common Tasks

### Setting Up Secrets

See: `webhook-quick-reference.md` → "Essential Configuration" section

### Health Check

See: `webhook-quick-reference.md` → "Health Check" section

### Deploying to Production

See: `webhook-quick-reference.md` → "Docker Compose" section +  
`webhook-configuration-deployment-analysis.md` → Sections 1.3, 7

### API Authentication

See: `webhook-quick-reference.md` → "API Endpoints" section +  
`webhook-api-endpoints.md`

### Tuning Search

See: `webhook-quick-reference.md` → "Search Configuration" section

### Adding a Migration

See: `webhook-configuration-deployment-analysis.md` → Section 10

### Troubleshooting

See: `webhook-quick-reference.md` → "Troubleshooting" section

---

## File Structure

```
/compose/pulse/apps/webhook/
├── main.py                      # FastAPI app entry point
├── config.py                    # Pydantic Settings
├── Dockerfile                   # Container build
├── pyproject.toml              # Dependencies
├── uv.lock                     # Lock file
├── api/
│   ├── deps.py                 # Dependency injection
│   ├── middleware/
│   │   ├── timing.py           # Request timing
│   ├── routers/
│   │   ├── health.py           # Health check
│   │   ├── search.py           # Search endpoint
│   │   ├── indexing.py         # Indexing endpoint
│   │   ├── webhook.py          # Webhook handling
│   │   ├── metrics.py          # Metrics endpoint
│   └── schemas/                # Pydantic models
├── services/                   # Business logic
│   ├── search.py               # SearchOrchestrator
│   ├── embedding.py            # EmbeddingService
│   ├── vector_store.py         # VectorStore (Qdrant)
│   ├── indexing.py             # IndexingService
│   ├── bm25_engine.py          # BM25Engine
│   ├── service_pool.py         # ServicePool singleton
│   └── webhook_handlers.py     # Webhook processing
├── infra/                      # Infrastructure
│   ├── database.py             # PostgreSQL setup
│   ├── redis.py                # Redis client
│   ├── rate_limit.py           # Rate limiting
├── domain/                     # Models
│   └── models.py               # SQLAlchemy models
├── utils/                      # Utilities
│   ├── logging.py              # structlog config
│   ├── content_metrics.py      # Payload analysis
│   ├── timing.py               # Timing context
│   └── url.py                  # URL normalization
├── workers/                    # Background work
│   ├── worker.py               # RQ worker (deprecated)
│   └── worker_thread.py        # Thread manager
├── alembic/                    # Database migrations
│   ├── env.py                  # Alembic config
│   └── versions/               # 3 migration files
└── tests/                      # Test suite (100+ files)
    ├── unit/                   # Unit tests
    ├── integration/            # Integration tests
    └── conftest.py             # Pytest fixtures
```

---

## Environment Variables

**Total:** 40+  
**Critical (Production):** 3 (API_SECRET, WEBHOOK_SECRET, CORS_ORIGINS)  
**Infrastructure:** 8 (Database, Redis, Qdrant, TEI, etc.)  
**Feature Toggles:** 2 (ENABLE_WORKER, TEST_MODE)  
**Performance:** 6 (Chunk tokens, Alpha, K1, B, RRF_K, Timeout)

**Quick Reference:**
```env
# SECRETS (MUST SET)
WEBHOOK_API_SECRET=<32+ chars>
WEBHOOK_SECRET=<32+ chars>

# INFRASTRUCTURE
WEBHOOK_DATABASE_URL=postgresql+asyncpg://...
WEBHOOK_REDIS_URL=redis://...
WEBHOOK_QDRANT_URL=http://...
WEBHOOK_TEI_URL=http://...

# SECURITY
WEBHOOK_CORS_ORIGINS=["https://app.example.com"]

# DEPLOYMENT
WEBHOOK_ENABLE_WORKER=false

# SEARCH
WEBHOOK_HYBRID_ALPHA=0.5
WEBHOOK_BM25_K1=1.5
WEBHOOK_BM25_B=0.75
```

See `webhook-configuration-deployment-analysis.md` Section 1 for complete list.

---

## External Service Dependencies

| Service | Port | Purpose |
|---------|------|---------|
| PostgreSQL | 5432 | Timing metrics, change events |
| Redis | 6379 | Background jobs, rate limiting |
| Qdrant | 6333 | Vector search storage |
| TEI | 80 | Text embeddings |
| Firecrawl | 3002 | Rescraping URLs |
| changedetection.io | 5000 | Change monitoring |

All URLs configured via environment variables. All must be accessible from container network.

---

## Related Documentation

See also:
- `/compose/pulse/CLAUDE.md` - Monorepo guidelines
- `/compose/pulse/docker-compose.yaml` - Service configuration
- `/compose/pulse/.env.example` - Environment template
- `/compose/pulse/docs/services-ports.md` - Service port mapping

---

## Document Maintenance

**Last Updated:** 2025-11-13  
**Coverage:** Complete (all aspects of webhook service)  
**Review Cycle:** Quarterly or when features change  
**Status:** Production documentation

For questions or updates, refer to:
- **Code Issues:** `/compose/pulse/apps/webhook/` source files
- **Architecture Questions:** `webhook-configuration-deployment-analysis.md`
- **Quick Help:** `webhook-quick-reference.md`

