# Docker Compose Exploration - Executive Summary

**Date:** 2025-11-10  
**Status:** Complete (Very Thorough Exploration)  
**Output Location:** `.docs/DOCKER_COMPOSE_EXPLORATION_REPORT.md` (1,631 lines)

## Quick Reference

### Current Service Topology
- **6 Core Services:** Firecrawl API, MCP Server, Webhook Bridge, Playwright, PostgreSQL, Redis
- **2 External Services:** TEI (embeddings), Qdrant (vector database)
- **1 Docker Network:** `firecrawl` bridge network
- **Port Range:** 50100-50110 (sequential allocation)

### Key Architecture Decisions

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| Port Strategy | Sequential 50100+ | Avoids conflicts, easy to remember |
| Env Variables | Namespaced (`SERVICE_*`) | Prevents naming conflicts, clear ownership |
| Database | Single PostgreSQL instance | Shared infrastructure, data integrity |
| Cache | Single Redis instance | Unified queue management, caching |
| Network | Docker bridge `firecrawl` | Service isolation, automatic DNS |
| Persistence | Bind mounts to host | Easy backup, visible storage structure |

### Port Allocation Status

**Used (9 ports):**
- 50100: Playwright
- 50102: Firecrawl API
- 50104: Redis
- 50105: PostgreSQL
- 50107: MCP Server
- 50108: Webhook Bridge
- 50200: TEI (external)
- 50201: Qdrant HTTP (external)
- 50202: Qdrant gRPC (external)

**Available (3+ ports):**
- **50109 - Next available** (for changedetection.io)
- **50110** (backup)
- 50201+ (expansion range)

### Service Startup Sequence

```
Phase 1 (Infrastructure - parallel):  DB, Cache, Playwright
  ↓
Phase 2 (Primary services):           API, Webhook
  ↓
Phase 3 (Integration):                MCP Server
  
Total cold start: ~100-120 seconds
Warm start: ~60-70 seconds
```

### Environment Variable Namespaces

| Namespace | Purpose | Count |
|-----------|---------|-------|
| `FIRECRAWL_*` | Firecrawl API | 8 variables |
| `MCP_*` | MCP Server | 10 variables |
| `WEBHOOK_*` | Webhook Bridge | 12 variables |
| `POSTGRES_*` | Database | 4 variables |
| `REDIS_*` | Cache | 3 variables |
| `PLAYWRIGHT_*` | Browser | 2 variables |
| `SEARCH_*` | Search integration | 3 variables |
| `SELF_HOSTED_*` | Deployment flags | 3 variables |
| `OPENAI_*`, `ANTHROPIC_*` | LLM APIs | 3 variables |
| `TEI_*`, `QDRANT_*` | External services | 4 variables |

**Total:** 52+ environment variables (all in root `.env` file)

### Health Check Status

| Service | Health Check | Status |
|---------|---|---|
| firecrawl_mcp | HTTP GET /health | ✅ Configured |
| firecrawl_webhook | HTTP GET /health | ✅ Configured |
| firecrawl_db | None | ⚠️ Recommended |
| firecrawl_cache | None | ⚠️ Recommended |
| firecrawl | None | ⚠️ Recommended |
| firecrawl_playwright | None | ⚠️ Recommended |

## changedetection.io Integration

### Three Implementation Options

**Option A: Standalone (Recommended)**
- Separate container, own database
- Uses shared Playwright for rendering
- Independent monitoring

**Option B: API Integration (Advanced)**
- Monitors URLs via Firecrawl API
- Leverages anti-bot bypass, JS rendering
- Depends on API availability

**Option C: Unified Search Index (Integrated)**
- Posts changes to webhook bridge
- Indexed in BM25 + vector search
- Searchable via MCP scrape tool

### Recommended Approach: A + C Hybrid
```
changedetection.io (Port 50111)
  ├─ Uses: firecrawl_playwright (shared)
  └─ Posts: to firecrawl_webhook (indexing)
```

## Data Persistence Summary

### Volume Structure

```
${APPDATA_BASE:-/mnt/cache/appdata}/
├── firecrawl_postgres/          (Database files - LOW risk)
├── firecrawl_redis/             (Cache + AOF log - MEDIUM risk)
├── firecrawl_mcp_resources/     (Cached content - MEDIUM risk)
├── firecrawl_webhook/           (BM25 index - MEDIUM risk)
├── firecrawl_tei_data/          (Model cache - EXTERNAL)
└── firecrawl_qdrant_storage/    (Vector index - EXTERNAL)
```

### Data Loss Risk Assessment

| Component | Risk Level | Impact | Recovery |
|-----------|---|---|---|
| PostgreSQL | LOW | Critical | Restore from backup |
| Redis | MEDIUM | High | Re-index/re-queue |
| BM25 Index | MEDIUM | Medium | Reindex from source |
| MCP Resources | MEDIUM | Low | Recrawl pages (TTL cleanup) |
| Embeddings | LOW | Low | Recalculate (reproducible) |

## Network Communication

### Internal URLs (Container Names - Docker Network)
- Firecrawl API: `http://firecrawl:3002`
- MCP Server: `http://firecrawl_mcp:3060`
- Webhook: `http://firecrawl_webhook:52100`
- Redis: `redis://firecrawl_cache:6379`
- PostgreSQL: `postgresql://firecrawl_db:5432/firecrawl_db`
- Playwright: `http://firecrawl_playwright:3000`

### External URLs (Host Machine)
- Firecrawl API: `http://localhost:50102`
- MCP Server: `http://localhost:50107`
- Webhook: `http://localhost:50108`
- Redis: `redis://localhost:50104`
- PostgreSQL: `postgresql://localhost:50105/firecrawl_db`
- Playwright: `http://localhost:50100`

**Critical Rule:** Use internal container names in code, NOT localhost or external domains

## Constraints & Considerations

### Resource Constraints
- **CPU:** Firecrawl (1.0), Playwright (1.0+), others (0.1-0.5)
- **Memory:** ~100MB baseline + growth with data
- **Disk I/O:** High for DB, Medium for Redis/BM25
- **Bandwidth:** High for scraping, reduced with `BLOCK_MEDIA=true`

### Scalability Limits
- **Currently:** Single-node deployment
- **Vertical Scaling:** Possible (more resources per service)
- **Horizontal Scaling:** Not supported (no DB replication, stateful webhook)

### Security Gaps (Current)
- Plaintext secrets in .env file
- No network policies
- No encryption at rest
- HMAC only (no TLS between services)

## Service Addition Checklist

When adding a new service (like changedetection.io):

- [ ] 1. Allocate port (50109 recommended)
- [ ] 2. Create docker-compose.yaml entry with common-service anchor
- [ ] 3. Add environment variables to .env and .env.example
- [ ] 4. Update .docs/services-ports.md registry
- [ ] 5. Create Dockerfile or use existing image
- [ ] 6. Add healthcheck endpoint
- [ ] 7. Configure depends_on for infrastructure services
- [ ] 8. Add build/test scripts to package.json if applicable
- [ ] 9. Test: `docker compose up -d`, verify service runs
- [ ] 10. Document in CLAUDE.md with integration points

## Key Files

| File | Purpose | Loc |
|------|---------|-----|
| `docker-compose.yaml` | Main service definitions | Root |
| `docker-compose.external.yaml` | GPU services (TEI, Qdrant) | Root |
| `.env.example` | Environment variable template | Root |
| `.docs/services-ports.md` | Port registry | .docs/ |
| `CLAUDE.md` | Architecture & conventions | Root |
| Full Report | Comprehensive exploration | `.docs/DOCKER_COMPOSE_EXPLORATION_REPORT.md` |

## Next Steps

1. **Immediate:** Review changedetection.io integration options
2. **Short-term:** Add health checks for unchecked services
3. **Medium-term:** Implement monitoring (Prometheus, logging)
4. **Long-term:** Plan horizontal scaling strategy if needed

## Report Details

- **File:** `/compose/pulse/.docs/DOCKER_COMPOSE_EXPLORATION_REPORT.md`
- **Size:** 1,631 lines
- **Sections:** 12 comprehensive sections
- **Coverage:** 100% of deployment configuration
- **Depth:** Very thorough (all subsystems analyzed)

See the full report for:
- Detailed service specifications
- Complete environment variable reference
- Startup sequence analysis with timing
- Failure mode recovery procedures
- Complete changedetection.io integration guide
- Implementation recommendations for new services
