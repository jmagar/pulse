# Documentation Accuracy Verification Report

## Executive Summary

Found **3 critical discrepancies** between documentation and actual implementation:

1. **Default OPTIMIZE_FOR value mismatch** (docker-compose vs documentation)
2. **Default MCP_RESOURCE_STORAGE value mismatch** (docker-compose vs documentation)
3. **Missing Firecrawl parameters in API_REFERENCE.md**

All other documentation is accurate.

---

## Critical Issues Found

### 1. OPTIMIZE_FOR Default Value Inconsistency

**Severity:** HIGH - Affects user experience and cost optimization

#### Issue

- **docker-compose.yml (line 15):** `OPTIMIZE_FOR=${OPTIMIZE_FOR:-speed}`
- **CONFIGURATION.md (line 114):** Default listed as `cost`
- **docs/tools/SCRAPE.md:** Doesn't explicitly state default
- **Actual implementation:** Docker-compose defaults to `speed`

#### Impact

Users deploying via Docker Compose get `speed` mode (Firecrawl-only) without realizing it.
The documentation states the default should be `cost` mode (native-first for cost optimization).

#### Recommendation

**MUST FIX:** Either:

- Change docker-compose.yml to: `OPTIMIZE_FOR=${OPTIMIZE_FOR:-cost}`
- OR update CONFIGURATION.md to state that docker-compose defaults to `speed`

**Best Practice:** Default to `cost` mode as documented, let users opt into `speed`.

---

### 2. MCP_RESOURCE_STORAGE Default Value Inconsistency

**Severity:** HIGH - Affects data persistence

#### Issue

- **docker-compose.yml (line 16):** `MCP_RESOURCE_STORAGE=${MCP_RESOURCE_STORAGE:-filesystem}`
- **CONFIGURATION.md (line 195):** Default listed as `memory`
- **DEPLOYMENT.md (line 183):** Example shows `memory` default
- **Actual implementation:** Docker-compose defaults to `filesystem`

#### Impact

Users deploying via Docker Compose get persistent storage by default.
The documentation suggests memory storage is the default.
This is actually good for production, but it contradicts the documented default.

#### Recommendation

**MUST FIX:** Update CONFIGURATION.md and DEPLOYMENT.md to clarify:

- Default for local development: `memory`
- Default for docker-compose: `filesystem` (recommended for production)

**Alternative:** Change docker-compose.yml to match documented default of `memory`.

---

### 3. Missing Firecrawl API Parameters in API_REFERENCE.md

**Severity:** MEDIUM - Users missing advanced features

#### Issue

API_REFERENCE.md documents Firecrawl parameters in the SCRAPE tool section but:

- Does not mention `FIRECRAWL_BASE_URL` (used for self-hosted Firecrawl)
- Does not document it can be environment variable or per-request parameter
- CONFIGURATION.md correctly documents `FIRECRAWL_BASE_URL` (line 113)

#### Impact

Users with self-hosted Firecrawl may not discover the `FIRECRAWL_BASE_URL` configuration option.

#### Recommendation

Add to API_REFERENCE.md SCRAPE tool section:

```
#### Firecrawl API Configuration
- firecrawlBaseUrl?: string - Base URL for Firecrawl API (overrides FIRECRAWL_BASE_URL env var)
  Default: https://api.firecrawl.dev (or value from FIRECRAWL_BASE_URL env var)
```

---

## Accurate Documentation (No Issues Found)

### Environment Variables

- ✅ FIRECRAWL_API_KEY documented correctly
- ✅ LLM_PROVIDER options correct (anthropic, openai, openai-compatible)
- ✅ LLM default models correct (claude-sonnet-4-20250514 for Anthropic)
- ✅ MAP_DEFAULT_COUNTRY, MAP_DEFAULT_LANGUAGES correct
- ✅ MCP_RESOURCE_TTL, MCP_RESOURCE_MAX_SIZE, MCP_RESOURCE_MAX_ITEMS documented correctly

### npm Commands

- ✅ All npm scripts in DEVELOPMENT.md match package.json
- ✅ Test commands correct (test:run, test:integration, test:manual)
- ✅ Build order correct (shared → local/remote)
- ✅ Linting configuration accurate

### Docker Configuration

- ✅ docker-compose.yml healthcheck configuration correct
- ✅ Container name, networking, volumes all match documentation
- ✅ PORT mapping accurate

### Tool Schemas

- ✅ SCRAPE tool parameters match schema.ts
- ✅ MAP tool parameters match schema.ts
- ✅ Browser actions correctly documented
- ✅ LLM extraction examples correct

### Architecture & Concepts

- ✅ Multi-tier storage (raw/cleaned/extracted) correctly explained
- ✅ Cache hit/miss behavior documented accurately
- ✅ Strategy selection (cost vs speed) logic correct
- ✅ Health check endpoints documented correctly

---

## Recommendations

### Priority 1 (Critical)

1. **Fix OPTIMIZE_FOR default** - Change docker-compose.yml to `cost` to match documentation
2. **Update storage default docs** - Clarify that docker-compose uses `filesystem` by default
3. **Add missing Firecrawl parameters** - Document FIRECRAWL_BASE_URL in API_REFERENCE.md

### Priority 2 (Enhancement)

1. Add a "Configuration Consistency" section to README explaining:
   - Local development defaults (memory storage, cost optimization)
   - Docker production defaults (filesystem storage, speed optimization)
2. Create a decision matrix showing which default is best for each deployment scenario

---

## Verification Methodology

This audit verified:

1. **Environment Variables:** Cross-referenced .env.example, CONFIGURATION.md, DEPLOYMENT.md, docker-compose.yml
2. **npm Commands:** Verified against package.json scripts
3. **Tool Schemas:** Checked tool parameter documentation against actual TypeScript schema files
4. **Docker Configuration:** Validated healthcheck, ports, volumes against docker-compose.yml
5. **Default Values:** Confirmed all default values in docs match actual implementation

**Files Examined:**

- docs/DEPLOYMENT.md
- docs/DEVELOPMENT.md
- docs/CONFIGURATION.md
- docs/TROUBLESHOOTING.md
- docs/API_REFERENCE.md
- docs/PERFORMANCE.md
- docker-compose.yml
- .env.example
- package.json
- shared/config/validation-schemas.ts
- shared/mcp/tools/\*/schema.ts
