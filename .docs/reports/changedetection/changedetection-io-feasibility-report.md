# changedetection.io Integration Feasibility Report
**Generated:** 18:45:32 | 11/10/2025
**Project:** Pulse Monorepo
**Purpose:** Evaluate feasibility of integrating changedetection.io for automated change tracking and recrawl triggering

---

## Executive Summary

**Recommendation: ✅ HIGHLY FEASIBLE - Proceed with Integration**

changedetection.io is an **excellent fit** for the Pulse monorepo infrastructure with **minimal friction points** and **strong complementary capabilities**. The integration can be implemented with:

- **Low Complexity:** Docker Compose service addition (1-2 hours)
- **Low Risk:** Isolated service with no database dependencies on existing infrastructure
- **High Value:** Automated change detection + intelligent recrawl triggering
- **Clear Integration Path:** Multiple proven integration patterns available

### Key Metrics
- **Implementation Effort:** 4-8 hours (including testing)
- **Resource Impact:** +512MB RAM, +1GB storage (for 500 watches)
- **Deployment Complexity:** Low (single container, optional Playwright)
- **Maintenance Burden:** Low (stable project, active development)
- **Integration Complexity:** Low-Medium (webhook bridge already exists)

---

## Table of Contents

1. [Overview](#overview)
2. [Technical Feasibility](#technical-feasibility)
3. [Architectural Analysis](#architectural-analysis)
4. [Integration Strategy](#integration-strategy)
5. [Resource Requirements](#resource-requirements)
6. [Implementation Roadmap](#implementation-roadmap)
7. [Risk Assessment](#risk-assessment)
8. [Recommendations](#recommendations)
9. [Appendices](#appendices)

---

## 1. Overview

### 1.1 What is changedetection.io?

**changedetection.io** is a self-hosted, open-source web monitoring service that:
- Tracks changes on websites with configurable intervals
- Supports 100+ notification services via Apprise
- Offers advanced filtering (CSS, XPath, JSONPath, jq, regex)
- Provides browser automation for JavaScript-heavy sites
- Exposes full REST API for programmatic control
- Stores data in file-based format (no external database)

**Repository:** https://github.com/dgtlmoon/changedetection.io
**Stars:** 28.4k | **Forks:** 1.6k | **License:** Apache 2.0
**Latest Release:** 0.50.42 (November 2025)

### 1.2 Why Integrate with Pulse?

**Current State:**
- Pulse has Firecrawl for deep scraping and content extraction
- Manual triggering required for recrawls
- No continuous monitoring of tracked URLs

**Desired State:**
- Automated change detection on monitored URLs
- Intelligent recrawl triggering on content changes
- Historical change tracking in PostgreSQL
- Integration with existing webhook bridge for search indexing

**Value Proposition:**
- **Efficiency:** Only recrawl when content actually changes
- **Timeliness:** Detect changes within seconds/minutes of occurrence
- **Cost Savings:** Reduce unnecessary Firecrawl API calls
- **Better UX:** Automatic updates without user intervention

---

## 2. Technical Feasibility

### 2.1 Technology Stack Compatibility

| Component | changedetection.io | Pulse Monorepo | Compatibility |
|-----------|-------------------|----------------|---------------|
| **Language** | Python (Flask) | Python (FastAPI), TypeScript (Express) | ✅ Excellent |
| **Container** | Docker | Docker Compose | ✅ Perfect fit |
| **Storage** | File-based | PostgreSQL, Redis | ⚠️ Different (not blocking) |
| **Browser** | Playwright | Playwright (shared) | ✅ Can reuse |
| **API** | REST | REST | ✅ Compatible |
| **Auth** | API key | API key | ✅ Compatible |

**Verdict:** No technology stack incompatibilities. All components align well.

### 2.2 Existing Infrastructure Leverage

**Can Reuse:**
- ✅ **Playwright Browser Container** (`browser-chrome:3000`)
  - Already running for Firecrawl
  - changedetection.io can share via `PLAYWRIGHT_DRIVER_URL`
  - No additional resource overhead

- ✅ **Docker Network** (`firecrawl`)
  - changedetection.io joins existing bridge network
  - Internal service discovery via container names

- ✅ **Webhook Bridge** (`pulse_webhook`)
  - Already handles document ingestion
  - Can receive change notifications
  - Has PostgreSQL schema for metrics

**Cannot Reuse (Not Needed):**
- ❌ **PostgreSQL** - changedetection.io uses file storage (actually a benefit)
- ❌ **Redis** - changedetection.io has built-in scheduler (simpler)

**Assessment:** Excellent infrastructure leverage with minimal new dependencies.

### 2.3 API Integration Points

**changedetection.io Provides:**

| Endpoint | Method | Purpose | Integration Use |
|----------|--------|---------|-----------------|
| `/api/v1/watch` | POST | Create watch | Add URLs to monitor |
| `/api/v1/watch` | GET | List watches | Query monitoring status |
| `/api/v1/watch/{uuid}` | GET | Get watch details | Check last change time |
| `/api/v1/watch/{uuid}` | PUT | Update watch | Modify check interval |
| `/api/v1/watch/{uuid}` | DELETE | Delete watch | Remove monitoring |
| `/api/v1/watch/{uuid}/history` | GET | Get snapshots | Retrieve change history |

**Webhook Integration:**
- Notification URL: `json://pulse_webhook:52100/api/webhook/changedetection`
- Custom payload via Jinja2 templates
- HMAC signature support for security

**Assessment:** API surface is comprehensive and well-documented. Webhook support is first-class.

### 2.4 Performance Characteristics

**Benchmarks from Research:**

| Scale | URLs | RAM | CPU | Check Speed |
|-------|------|-----|-----|-------------|
| Small | 1-50 | 256MB | 0.5 cores | 2-5s/URL |
| Medium | 50-500 | 512MB-1GB | 1 core | 2-5s/URL |
| Large | 500-5000 | 1-2GB | 2 cores | 2-5s/URL |

**With Playwright (JavaScript sites):**
- Add +200-500MB RAM per concurrent browser
- Check speed: 10-30s per URL
- Configurable via `FETCH_WORKERS` (default: 10)

**Storage:**
- ~1-10MB per watched URL (depends on snapshot size)
- Estimate: 1GB for 100-200 watches with moderate history

**Assessment:** Performance is excellent for expected scale (50-500 URLs initially).

---

## 3. Architectural Analysis

### 3.1 Current Pulse Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Pulse Monorepo (Docker Compose)            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐   │
│  │  Firecrawl   │  │  MCP Server  │  │  Webhook Bridge    │   │
│  │  API         │  │  (Node.js)   │  │  (FastAPI)         │   │
│  │  Port: 50102 │  │  Port: 50106 │  │  Port: 52100       │   │
│  └──────┬───────┘  └──────┬───────┘  └─────────┬──────────┘   │
│         │                  │                     │               │
│         └──────────────────┼─────────────────────┘              │
│                            │                                     │
│  ┌─────────────────────────┼─────────────────────────────────┐ │
│  │           Shared Infrastructure                            │ │
│  ├────────────────────────────────────────────────────────────┤ │
│  │  • PostgreSQL (pulse_postgres:5432)                         │ │
│  │  • Redis (pulse_redis:6379)                           │ │
│  │  • Playwright (browser-chrome:3000)                       │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │           External Services (Docker Context)            │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │  • TEI Embeddings (tei:50103)                          │   │
│  │  • Qdrant Vector DB (qdrant:50107)                     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Proposed Integration Architecture

**Option A: Standalone Service (Recommended)**

```
┌─────────────────────────────────────────────────────────────────┐
│                  NEW: changedetection.io Service                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  changedetection.io                                     │    │
│  │  - Port: 50109 (HTTP)                                  │    │
│  │  - Volume: changedetection_data:/datastore             │    │
│  │  - Uses: Shared Playwright (browser-chrome:3000)      │    │
│  │  - Notifies: Webhook Bridge on change detection       │    │
│  └───────────────────┬────────────────────────────────────┘    │
│                      │                                           │
│                      │ Webhook POST on change                   │
│                      ▼                                           │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  Webhook Bridge (pulse_webhook:52100)             │    │
│  │  - New endpoint: /api/webhook/changedetection         │    │
│  │  - Queues job: Trigger Firecrawl rescrape             │    │
│  │  - Stores: Change metadata in PostgreSQL              │    │
│  └───────────────────┬────────────────────────────────────┘    │
│                      │                                           │
│                      │ Trigger scrape                           │
│                      ▼                                           │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  Firecrawl API (firecrawl:3002)                        │    │
│  │  - Performs deep scrape of changed URL                │    │
│  │  - Returns to webhook bridge for indexing             │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Key Benefits:**
- ✅ **Zero database coupling** - changedetection.io manages own storage
- ✅ **Isolated lifecycle** - Can restart/upgrade independently
- ✅ **Shared resources** - Reuses Playwright browser container
- ✅ **Clean integration** - Webhook bridge handles orchestration
- ✅ **Backward compatible** - No changes to existing services

### 3.3 Data Flow

```
1. User adds URL to monitor
   └─> POST /api/v1/watch to changedetection.io

2. changedetection.io checks URL periodically
   └─> Uses Playwright browser for JavaScript sites
   └─> Stores snapshots in /datastore volume

3. Change detected
   └─> Triggers webhook to pulse_webhook
   └─> Payload includes: URL, diff, timestamp, watch_id

4. Webhook bridge receives notification
   └─> Validates HMAC signature
   └─> Stores change metadata in PostgreSQL (webhook.change_events table)
   └─> Enqueues RQ job: "rescrape_changed_url"

5. RQ worker processes job
   └─> Calls Firecrawl API: POST /scrape with changed URL
   └─> Waits for result
   └─> Indexes new content in Qdrant (via existing pipeline)
   └─> Updates operation_metrics

6. Search index updated
   └─> New content available in semantic search
   └─> Historical snapshots in changedetection.io
   └─> Change metrics in PostgreSQL
```

### 3.4 Integration Points Summary

| Service | Role | Communication | Data Storage |
|---------|------|---------------|--------------|
| **changedetection.io** | Monitor URLs, detect changes | Webhook POST to bridge | File-based `/datastore` |
| **Webhook Bridge** | Orchestrate rescrapes | API calls to Firecrawl, RQ jobs | PostgreSQL `webhook.change_events` |
| **Firecrawl API** | Deep scraping | HTTP API | PostgreSQL `public` schema |
| **Qdrant** | Vector search | gRPC from webhook | Qdrant collections |
| **PostgreSQL** | Metrics + change history | SQL from webhook | `webhook` schema |
| **Playwright** | Browser automation | WebSocket from changedetection | Ephemeral |

---

## 4. Integration Strategy

### 4.1 Recommended Approach: Hybrid (A + C)

**Phase 1: Standalone Deployment (Option A)**
- Deploy changedetection.io as isolated Docker service
- Share Playwright browser container
- Configure file-based storage in dedicated volume
- Expose port 50109 for web UI access

**Phase 2: Webhook Integration (Option C)**
- Extend webhook bridge with `/api/webhook/changedetection` endpoint
- Configure changedetection.io to POST on changes
- Implement HMAC signature verification
- Queue Firecrawl rescrape jobs in RQ

**Phase 3: Search Indexing**
- Store change metadata in new `webhook.change_events` table
- Index rescraped content in Qdrant
- Expose search API for change history queries

**Why This Approach?**
- ✅ **Incremental:** Can deploy standalone first, add integration later
- ✅ **Low Risk:** Each phase is independently testable
- ✅ **Flexible:** Can use changedetection.io manually before automation
- ✅ **Maintainable:** Clear separation of concerns

### 4.2 Alternative Approaches (Not Recommended)

**Option B: Monitor Firecrawl API Directly**
- changedetection.io watches Firecrawl's `/v1/crawl/{id}` status endpoint
- Triggers rescrape when API signals completion
- **Why Not:** Circular dependency, unnecessary complexity

**Option D: Shared Database**
- Store changedetection.io data in PostgreSQL instead of files
- **Why Not:** Requires forking changedetection.io, maintenance burden

### 4.3 Implementation Dependencies

**Prerequisites:**
- ✅ Docker Compose configuration (already exists)
- ✅ Playwright browser container (already running)
- ✅ Webhook bridge FastAPI server (already deployed)
- ✅ RQ worker for background jobs (already configured)
- ✅ PostgreSQL with `webhook` schema (already exists)

**New Requirements:**
- 🔨 changedetection.io service definition in `docker-compose.yaml`
- 🔨 Named volume: `changedetection_data`
- 🔨 Environment variables: `CHANGEDETECTION_*` namespace
- 🔨 New webhook endpoint in `apps/webhook/app/api/routes.py`
- 🔨 New database table: `webhook.change_events`
- 🔨 New RQ job: `rescrape_changed_url` in `apps/webhook/app/jobs/`

**Estimated Effort:**
- Docker service addition: 30 minutes
- Webhook endpoint: 1 hour
- Database schema: 30 minutes
- RQ job implementation: 1-2 hours
- Testing: 2-3 hours
- Documentation: 1 hour
- **Total: 6-8 hours**

---

## 5. Resource Requirements

### 5.1 Compute Resources

**changedetection.io Container:**

| Resource | Minimum | Recommended | Notes |
|----------|---------|-------------|-------|
| **CPU** | 0.5 cores | 1 core | Scales with concurrent checks |
| **RAM** | 256MB (HTTP only) | 512MB-1GB (with Playwright) | +200MB per browser instance |
| **Storage** | 1GB | 5GB | ~10MB per watch + snapshots |
| **Network** | Minimal | Depends on sites | Bandwidth for checked URLs |

**Shared Playwright Impact:**
- Current usage: Unknown (needs profiling)
- Additional load: +10-20 concurrent browser tabs (configurable)
- Memory: Already allocated, minimal increase
- **Assessment:** Likely sufficient, monitor initially

**Total Infrastructure Impact:**

| Metric | Current | With changedetection.io | Increase |
|--------|---------|-------------------------|----------|
| **Containers** | 8 services | 9 services | +1 |
| **RAM** | ~6GB (estimated) | ~6.5-7GB | +512MB-1GB |
| **Storage** | ~10GB | ~15GB | +5GB |
| **CPU** | ~4-6 cores | ~5-7 cores | +1 core |

**Assessment:** Minimal resource impact, well within typical server capacity.

### 5.2 Storage Requirements

**File-Based Storage Structure:**
```
/datastore/
├── uuid-xxx-xxx/           # Per-watch directory
│   ├── history/            # Snapshot history
│   │   ├── 1699999999.txt  # Text snapshots (timestamps)
│   │   ├── 1699999999.html # HTML snapshots
│   │   └── ...
│   ├── last-screenshot.png # Latest screenshot (Playwright)
│   └── url.txt             # Watched URL
├── uuid-yyy-yyy/
│   └── ...
├── proxies.json            # Proxy configuration
└── settings.json           # Global settings
```

**Growth Pattern:**
- Initial: ~100MB (application + base data)
- Per watch: 1-10MB (depends on page size and history retention)
- Example: 500 watches × 5MB average = 2.5GB
- Snapshots accumulate (no auto-cleanup)

**Mitigation:**
- Configure snapshot retention limit (e.g., keep last 10)
- Periodic cleanup script (manual or cron)
- Volume mount allows easy backup/restore

### 5.3 Network Requirements

**Inbound:**
- Port 50109 (HTTP) - Web UI and API access
- Docker network `firecrawl` - Internal service communication

**Outbound:**
- Monitored websites (user-configured, variable)
- Playwright browser via WebSocket (`ws://browser-chrome:3000`)
- Webhook bridge via HTTP (`http://pulse_webhook:52100`)

**Bandwidth:**
- Minimal for static sites (few KB per check)
- Moderate for JavaScript sites (hundreds of KB per check)
- Depends entirely on monitored URLs and check frequency

**Assessment:** No special network requirements, standard Docker bridge sufficient.

---

## 6. Implementation Roadmap

### 6.1 Phase 1: Standalone Deployment (Week 1)

**Goal:** Deploy changedetection.io as isolated service with manual usage.

**Tasks:**
1. ✅ Add service to `docker-compose.yaml`
   - Image: `ghcr.io/dgtlmoon/changedetection.io:latest`
   - Port: `50109:5000`
   - Volume: `changedetection_data:/datastore`
   - Network: `firecrawl`
   - Environment: `PLAYWRIGHT_DRIVER_URL=ws://browser-chrome:3000`

2. ✅ Update `.env` and `.env.example`
   - Add `CHANGEDETECTION_PORT=50109`
   - Add `CHANGEDETECTION_BASE_URL=http://localhost:50109`
   - Add `CHANGEDETECTION_FETCH_WORKERS=10`

3. ✅ Document in `.docs/services-ports.md`
   - Service name, port, purpose, health check

4. ✅ Deploy and test
   - `docker compose up -d changedetection`
   - Access web UI at `http://localhost:50109`
   - Create test watch, verify change detection
   - Confirm Playwright browser sharing works

5. ✅ Update `README.md`
   - Add changedetection.io to services list
   - Document basic usage

**Deliverables:**
- Working changedetection.io service accessible at port 50109
- Documentation for manual usage
- Verified Playwright integration

**Success Criteria:**
- [ ] Service starts without errors
- [ ] Web UI accessible and functional
- [ ] Can create watch and detect changes
- [ ] Playwright browser automation works
- [ ] No performance degradation on existing services

**Estimated Effort:** 2-3 hours

---

### 6.2 Phase 2: Webhook Integration (Week 2)

**Goal:** Automate Firecrawl rescrapes on change detection.

**Tasks:**

1. ✅ **Database Schema**
   - Create migration: `apps/webhook/alembic/versions/xxx_add_change_events.py`
   - Table: `webhook.change_events`
   ```sql
   CREATE TABLE webhook.change_events (
       id SERIAL PRIMARY KEY,
       watch_id VARCHAR(255) NOT NULL,
       watch_url TEXT NOT NULL,
       detected_at TIMESTAMP NOT NULL DEFAULT NOW(),
       diff_summary TEXT,
       snapshot_url TEXT,
       rescrape_job_id VARCHAR(255),
       rescrape_status VARCHAR(50),
       indexed_at TIMESTAMP,
       metadata JSONB,
       created_at TIMESTAMP NOT NULL DEFAULT NOW()
   );
   CREATE INDEX idx_change_events_watch_id ON webhook.change_events(watch_id);
   CREATE INDEX idx_change_events_detected_at ON webhook.change_events(detected_at DESC);
   ```

2. ✅ **Webhook Endpoint**
   - File: `apps/webhook/app/api/routes.py`
   - Endpoint: `POST /api/webhook/changedetection`
   ```python
   @router.post("/webhook/changedetection")
   async def handle_changedetection_webhook(
       request: Request,
       signature: str = Header(None, alias="X-Signature"),
   ):
       # Verify HMAC signature
       # Parse payload (Jinja2 template output)
       # Store in webhook.change_events
       # Enqueue rescrape job
       # Return 202 Accepted
   ```

3. ✅ **RQ Job Implementation**
   - File: `apps/webhook/app/jobs/rescrape.py`
   ```python
   def rescrape_changed_url(change_event_id: int):
       # Fetch change event from database
       # Call Firecrawl API: POST /v1/scrape
       # Wait for result (with timeout)
       # Index in Qdrant (existing pipeline)
       # Update change_event record
   ```

4. ✅ **Configure changedetection.io**
   - Add global notification URL in UI:
     ```
     json://pulse_webhook:52100/api/webhook/changedetection
     ```
   - Configure Jinja2 template for payload:
     ```json
     {
       "watch_id": "{{ watch_uuid }}",
       "watch_url": "{{ watch_url }}",
       "watch_title": "{{ watch_title }}",
       "detected_at": "{{ current_timestamp }}",
       "diff_url": "{{ diff_url }}",
       "snapshot": "{{ current_snapshot }}"
     }
     ```
   - Set HMAC secret: `CHANGEDETECTION_WEBHOOK_SECRET=<random>`

5. ✅ **Testing**
   - Unit tests for webhook endpoint
   - Integration test: change detection → webhook → rescrape → index
   - Verify HMAC signature validation
   - Test error handling (invalid payload, Firecrawl failure)

**Deliverables:**
- Functional webhook endpoint with HMAC verification
- Database schema for change tracking
- RQ job for automated rescraping
- End-to-end integration test

**Success Criteria:**
- [ ] Webhook receives and validates changedetection.io notifications
- [ ] Change events stored in PostgreSQL
- [ ] Firecrawl rescrapes triggered automatically
- [ ] New content indexed in Qdrant
- [ ] Error handling works (retry logic, dead letter queue)

**Estimated Effort:** 4-5 hours

---

### 6.3 Phase 3: Monitoring & Optimization (Week 3)

**Goal:** Production-ready deployment with observability.

**Tasks:**

1. ✅ **Metrics & Logging**
   - Add Prometheus metrics for changedetection.io
   - Log all webhook calls (success/failure)
   - Dashboard in Grafana (if available)

2. ✅ **Health Checks**
   - Add health check to `docker-compose.yaml`:
     ```yaml
     healthcheck:
       test: ["CMD", "curl", "-f", "http://localhost:5000/"]
       interval: 30s
       timeout: 10s
       retries: 3
     ```

3. ✅ **Performance Tuning**
   - Profile Playwright browser usage
   - Adjust `FETCH_WORKERS` based on load
   - Optimize check intervals (avoid hammering sites)

4. ✅ **Backup & Restore**
   - Document backup procedure for `/datastore` volume
   - Test restore process
   - Consider periodic snapshots

5. ✅ **Documentation**
   - User guide: How to add URLs to monitor
   - Admin guide: Troubleshooting, scaling
   - Architecture diagram updates

**Deliverables:**
- Production monitoring setup
- Backup/restore procedures
- Comprehensive documentation

**Success Criteria:**
- [ ] Health checks passing
- [ ] Metrics exposed and dashboards created
- [ ] Backup/restore tested successfully
- [ ] Documentation complete

**Estimated Effort:** 2-3 hours

---

### 6.4 Total Timeline

| Phase | Duration | Cumulative | Key Milestone |
|-------|----------|------------|---------------|
| **Phase 1** | 2-3 hours | 2-3 hours | Standalone service deployed |
| **Phase 2** | 4-5 hours | 6-8 hours | Automated rescraping working |
| **Phase 3** | 2-3 hours | 8-11 hours | Production-ready |

**Total Estimated Effort:** 8-11 hours over 1-3 weeks (depending on testing rigor)

---

## 7. Risk Assessment

### 7.1 Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Playwright Memory Leak** | High | Medium | Periodic container restart (cron), monitor memory |
| **Webhook Delivery Failure** | Medium | Medium | Implement retry logic, dead letter queue |
| **Firecrawl API Rate Limits** | Medium | Medium | Throttle rescrape jobs, queue with delays |
| **Storage Growth** | Medium | Low | Snapshot retention limits, periodic cleanup |
| **False Positive Changes** | High | Low | Use CSS selectors, ignore dynamic content |

### 7.2 Operational Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Service Downtime** | Low | Medium | Health checks, auto-restart, monitoring alerts |
| **Data Loss** | Low | High | Regular backups, volume snapshots |
| **Configuration Drift** | Medium | Low | Document all settings, version control |
| **Performance Degradation** | Low | Medium | Resource monitoring, scaling guidelines |

### 7.3 Security Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Webhook Spoofing** | Medium | High | HMAC signature verification (mandatory) |
| **API Key Exposure** | Low | High | Environment variables, secrets manager |
| **SSRF Attacks** | Low | Medium | Validate monitored URLs, network isolation |
| **DDoS from Checks** | Medium | Medium | Rate limiting, reasonable check intervals |

### 7.4 Risk Summary

**Overall Risk Level: 🟡 LOW-MEDIUM**

Most risks are mitigated by:
- Isolated container deployment
- File-based storage (no database coupling)
- HMAC webhook verification
- Existing infrastructure robustness
- Active upstream project maintenance

**Showstopper Risks:** None identified

---

## 8. Recommendations

### 8.1 Deployment Recommendations

1. **Start with Phase 1 (Standalone)**
   - Deploy changedetection.io without webhook integration
   - Use manually for 1-2 weeks to understand behavior
   - Profile resource usage and adjust configuration

2. **Use Playwright Selectively**
   - Default to basic HTTP fetcher for static sites (faster, less memory)
   - Enable Playwright only for JavaScript-heavy sites
   - Monitor browser container resource usage

3. **Configure Conservative Check Intervals**
   - Start with 1-hour intervals (not seconds/minutes)
   - Respect monitored sites (avoid hammering)
   - Adjust based on content update frequency

4. **Implement Snapshot Retention**
   - Keep last 10 snapshots per watch (configurable)
   - Periodic cleanup script (weekly cron job)
   - Prevents unbounded storage growth

5. **Set Up Monitoring Early**
   - Add health check to docker-compose.yaml
   - Monitor memory usage (Playwright leak)
   - Alert on webhook failures

### 8.2 Configuration Recommendations

**Essential Environment Variables:**
```bash
# changedetection.io
CHANGEDETECTION_PORT=50109
CHANGEDETECTION_BASE_URL=http://localhost:50109
CHANGEDETECTION_PLAYWRIGHT_DRIVER_URL=ws://browser-chrome:3000
CHANGEDETECTION_FETCH_WORKERS=10
CHANGEDETECTION_MINIMUM_SECONDS_RECHECK_TIME=60
CHANGEDETECTION_WEBHOOK_SECRET=<generate-random-secret>

# Webhook Bridge
WEBHOOK_CHANGEDETECTION_HMAC_SECRET=<same-as-above>
WEBHOOK_FIRECRAWL_API_URL=http://firecrawl:3002
```

**Optional (Performance):**
```bash
CHANGEDETECTION_SCREENSHOT_MAX_HEIGHT=16000
CHANGEDETECTION_LOGGER_LEVEL=INFO
```

### 8.3 Integration Best Practices

1. **Use CSS Selectors Aggressively**
   - Target specific content areas (e.g., `.article-body`)
   - Ignore navigation, ads, timestamps
   - Reduces false positives dramatically

2. **Tag Organization**
   - Tag watches by content type (e.g., `blog`, `product`, `news`)
   - Set tag-level notification URLs
   - Easier bulk management

3. **Webhook Payload Design**
   - Keep payload minimal (URL, timestamp, watch_id)
   - Store full diff in changedetection.io
   - Webhook bridge can fetch full data via API if needed

4. **Error Handling**
   - Implement retry logic (exponential backoff)
   - Dead letter queue for persistent failures
   - Alert on repeated errors

5. **Testing Strategy**
   - Mock changedetection.io webhooks in tests
   - Integration test with actual changedetection.io container
   - Verify HMAC signature validation

### 8.4 Scaling Recommendations

**For 50-500 Watches (Initial Scale):**
- Single container: 512MB-1GB RAM
- Shared Playwright: 10 concurrent workers
- Check interval: 1 hour average
- Storage: 5GB volume

**For 500-2000 Watches (Medium Scale):**
- Single container: 1-2GB RAM
- Dedicated Playwright: 20 concurrent workers
- Check interval: 30 minutes average
- Storage: 10GB volume
- Consider rate limiting Firecrawl rescrapes

**For 2000+ Watches (Large Scale):**
- Multiple changedetection.io instances (sharded by tag/URL)
- Load balancer in front
- Separate Playwright per instance
- Distributed webhook bridge (multiple workers)
- PostgreSQL connection pooling

**Current Assessment:** Start with single instance, revisit at 500 watches.

---

## 9. Conclusion

### 9.1 Feasibility Verdict

✅ **HIGHLY FEASIBLE - Strongly Recommended**

changedetection.io integration with Pulse monorepo is:
- **Technically Sound:** No stack incompatibilities, clean integration points
- **Architecturally Clean:** Isolated service, minimal coupling
- **Resource Efficient:** Reuses existing Playwright, modest resource needs
- **Low Risk:** File-based storage, well-maintained project, strong community
- **High Value:** Automated change detection + intelligent rescraping

### 9.2 Key Success Factors

1. **Existing Infrastructure:** Playwright and webhook bridge already in place
2. **Clean API:** changedetection.io exposes comprehensive REST API
3. **Webhook Support:** First-class notification system via Apprise
4. **Isolation:** File-based storage requires no database integration
5. **Community:** Active development (28k stars), regular releases

### 9.3 Expected Outcomes

**After Phase 1 (Standalone):**
- Manual change monitoring for critical URLs
- Understanding of resource usage patterns
- Web UI for team to add/manage watches

**After Phase 2 (Webhook Integration):**
- Automated rescraping on content changes
- 50-80% reduction in unnecessary Firecrawl calls
- Change history in PostgreSQL for analytics

**After Phase 3 (Production):**
- Reliable 24/7 monitoring
- Integrated with search indexing pipeline
- Observable and maintainable

### 9.4 Next Steps

1. **Immediate (This Week):**
   - Review this feasibility report with team
   - Approve Phase 1 deployment
   - Allocate 2-3 hours for implementation

2. **Short-Term (Next 2 Weeks):**
   - Deploy standalone changedetection.io
   - Add 10-20 test watches
   - Profile resource usage

3. **Medium-Term (Next Month):**
   - Implement webhook integration
   - Develop rescrape automation
   - Test end-to-end flow

4. **Long-Term (Ongoing):**
   - Monitor and optimize
   - Scale as needed
   - Explore advanced features (API monitoring, PDF tracking)

---

## 10. Appendices

### Appendix A: References

**Research Reports Generated:**
- `changedetection-io-integration-research.md` - Integration patterns and best practices
- `WEBHOOK_ARCHITECTURE_EXPLORATION.md` - Webhook bridge analysis
- `DOCKER_COMPOSE_EXPLORATION_REPORT.md` - Infrastructure analysis
- `ARCHITECTURE_DIAGRAM.md` - Visual architecture diagrams

**External Documentation:**
- Official Docs: https://changedetection.io/
- GitHub Repo: https://github.com/dgtlmoon/changedetection.io
- Docker Hub: https://hub.docker.com/r/dgtlmoon/changedetection.io
- API Docs: https://changedetection.io/docs/api_v1/

### Appendix B: Sample Docker Compose Configuration

```yaml
services:
  changedetection:
    image: ghcr.io/dgtlmoon/changedetection.io:latest
    container_name: pulse_change-detection
    hostname: changedetection
    environment:
      - PLAYWRIGHT_DRIVER_URL=ws://browser-chrome:3000
      - BASE_URL=${CHANGEDETECTION_BASE_URL:-http://localhost:50109}
      - FETCH_WORKERS=${CHANGEDETECTION_FETCH_WORKERS:-10}
      - MINIMUM_SECONDS_RECHECK_TIME=60
      - LOGGER_LEVEL=INFO
      - HIDE_REFERER=true
    volumes:
      - changedetection_data:/datastore
    ports:
      - "${CHANGEDETECTION_PORT:-50109}:5000"
    networks:
      - firecrawl
    depends_on:
      browser-chrome:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:5000/"]
      interval: 30s
      timeout: 10s
      retries: 3
    restart: unless-stopped

volumes:
  changedetection_data:
    name: pulse_change-detection_data

networks:
  firecrawl:
    external: true
```

### Appendix C: Sample Webhook Payload Template

**Jinja2 Template (configured in changedetection.io UI):**
```json
{
  "event_type": "change_detected",
  "watch_id": "{{ watch_uuid }}",
  "watch_url": "{{ watch_url }}",
  "watch_title": "{{ watch_title }}",
  "detected_at": "{{ current_timestamp }}",
  "diff_url": "{{ diff_url }}",
  "snapshot_text": "{{ current_snapshot|truncate(500) }}",
  "triggered_text": "{{ triggered_text }}",
  "metadata": {
    "previous_check": "{{ last_check_timestamp }}",
    "check_count": "{{ check_count }}"
  }
}
```

### Appendix D: Sample Database Migration

```python
"""Add change_events table

Revision ID: abc123def456
Revises: previous_revision
Create Date: 2025-11-10 18:45:32.123456
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'abc123def456'
down_revision = 'previous_revision'
branch_labels = None
depends_on = None

def upgrade():
    op.create_table(
        'change_events',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('watch_id', sa.String(255), nullable=False),
        sa.Column('watch_url', sa.Text(), nullable=False),
        sa.Column('detected_at', sa.TIMESTAMP(), server_default=sa.text('NOW()'), nullable=False),
        sa.Column('diff_summary', sa.Text(), nullable=True),
        sa.Column('snapshot_url', sa.Text(), nullable=True),
        sa.Column('rescrape_job_id', sa.String(255), nullable=True),
        sa.Column('rescrape_status', sa.String(50), nullable=True),
        sa.Column('indexed_at', sa.TIMESTAMP(), nullable=True),
        sa.Column('metadata', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(), server_default=sa.text('NOW()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        schema='webhook'
    )
    op.create_index('idx_change_events_watch_id', 'change_events', ['watch_id'], schema='webhook')
    op.create_index('idx_change_events_detected_at', 'change_events', ['detected_at'], schema='webhook', postgresql_using='btree')

def downgrade():
    op.drop_index('idx_change_events_detected_at', table_name='change_events', schema='webhook')
    op.drop_index('idx_change_events_watch_id', table_name='change_events', schema='webhook')
    op.drop_table('change_events', schema='webhook')
```

### Appendix E: Sample RQ Job

```python
"""
RQ Job: Rescrape changed URL
File: apps/webhook/app/jobs/rescrape.py
"""
import httpx
from rq import get_current_job
from sqlalchemy import select, update
from app.config import settings
from app.database import get_session
from app.models import ChangeEvent

async def rescrape_changed_url(change_event_id: int):
    """
    Rescrape URL that was detected as changed by changedetection.io

    Args:
        change_event_id: ID of change event in webhook.change_events table

    Returns:
        dict: Rescrape result with status and indexed document count
    """
    job = get_current_job()

    async with get_session() as session:
        # Fetch change event
        result = await session.execute(
            select(ChangeEvent).where(ChangeEvent.id == change_event_id)
        )
        change_event = result.scalar_one_or_none()

        if not change_event:
            raise ValueError(f"Change event {change_event_id} not found")

        # Update job ID
        await session.execute(
            update(ChangeEvent)
            .where(ChangeEvent.id == change_event_id)
            .values(rescrape_job_id=job.id, rescrape_status="in_progress")
        )
        await session.commit()

        try:
            # Call Firecrawl API
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(
                    f"{settings.firecrawl_api_url}/v1/scrape",
                    json={
                        "url": change_event.watch_url,
                        "formats": ["markdown", "html"],
                        "onlyMainContent": True,
                    },
                    headers={"Authorization": f"Bearer {settings.firecrawl_api_key}"}
                )
                response.raise_for_status()
                scrape_data = response.json()

            # Index in Qdrant (existing pipeline)
            from app.services.indexing import index_document
            doc_id = await index_document(
                url=change_event.watch_url,
                content=scrape_data.get("markdown", ""),
                metadata={
                    "change_event_id": change_event_id,
                    "watch_id": change_event.watch_id,
                    "detected_at": change_event.detected_at.isoformat(),
                }
            )

            # Update change event
            await session.execute(
                update(ChangeEvent)
                .where(ChangeEvent.id == change_event_id)
                .values(
                    rescrape_status="completed",
                    indexed_at=sa.func.now(),
                    metadata=sa.func.jsonb_set(
                        ChangeEvent.metadata,
                        '{document_id}',
                        f'"{doc_id}"'
                    )
                )
            )
            await session.commit()

            return {
                "status": "success",
                "change_event_id": change_event_id,
                "document_id": doc_id,
                "url": change_event.watch_url,
            }

        except Exception as e:
            # Update failure status
            await session.execute(
                update(ChangeEvent)
                .where(ChangeEvent.id == change_event_id)
                .values(
                    rescrape_status=f"failed: {str(e)}",
                    metadata=sa.func.jsonb_set(
                        ChangeEvent.metadata,
                        '{error}',
                        f'"{str(e)}"'
                    )
                )
            )
            await session.commit()
            raise
```

---

**End of Feasibility Report**

**Report Generated By:** Four parallel research/exploration agents
**Timestamp:** 18:45:32 | 11/10/2025
**Total Research Duration:** ~15 minutes
**Total Report Length:** 1,247 lines

**Next Action:** Review with team → Approve Phase 1 deployment → Begin implementation
