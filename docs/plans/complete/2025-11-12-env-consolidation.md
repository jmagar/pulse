# Environment Variables Consolidation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate duplicate environment variables in `.env` to reduce confusion and maintenance burden.

**Architecture:** Three-phase approach: (1) Safe removals with no code changes, (2) Variable substitution with minimal code updates, (3) Documentation cleanup.

**Tech Stack:** Docker Compose variable substitution, Pydantic AliasChoices (Python), TypeScript environment config

---

## Phase 1: Safe Removals (No Code Changes)

**Impact:** Remove 6 duplicate variables that already have fallback logic in place.

### Task 1: Create Feature Branch

**Step 1: Create branch**
```bash
git checkout -b cleanup/env-duplicates-phase1
```

**Step 2: Verify clean working directory**
```bash
git status
```
Expected: No uncommitted changes (or confirm changes are intentional)

---

### Task 2: Remove Redis Duplicates

**Files:**
- Modify: `.env.example`

**Step 1: Remove `REDIS_RATE_LIMIT_URL` (line ~36)**

Find and remove:
```bash
REDIS_RATE_LIMIT_URL=redis://pulse_redis:6379
```

**Step 2: Remove `MCP_REDIS_URL` section**

Context - MCP config section. The MCP server already falls back to `REDIS_URL`, so remove any `MCP_REDIS_URL` variable if present.

**Step 3: Remove `WEBHOOK_REDIS_URL` (line ~91)**

Context - Webhook config section. Remove this line (config falls back to `REDIS_URL`):
```bash
WEBHOOK_REDIS_URL=redis://pulse_redis:6379
```

**Step 4: Add comment explaining canonical Redis variable**

After `REDIS_URL=redis://pulse_redis:6379` (line ~35), add:
```bash
REDIS_URL=redis://pulse_redis:6379
# Note: All services use REDIS_URL as the canonical Redis connection string
```

---

### Task 3: Remove API Secret Duplicates

**Files:**
- Modify: `.env.example`

**Step 1: Remove `SEARCH_SERVICE_API_SECRET` (line ~41)**

Find and remove (this duplicates `WEBHOOK_API_SECRET`):
```bash
SEARCH_SERVICE_API_SECRET=8sHRjdGvk6wL58zP2QnM9N3h4ZBYa5M3
```

**Step 2: Remove `WEBHOOK_FIRECRAWL_API_KEY` (line ~174)**

Context - Webhook Firecrawl integration section. Remove this line (config falls back to `FIRECRAWL_API_KEY`):
```bash
WEBHOOK_FIRECRAWL_API_KEY=8sHRjdGvk6wL58zP2QnM9N3h4ZBYa5M3
```

**Step 3: Remove `WEBHOOK_CHANGEDETECTION_API_KEY` (line ~176)**

Context - Webhook changedetection section. Remove this line (config falls back to `CHANGEDETECTION_API_KEY`):
```bash
WEBHOOK_CHANGEDETECTION_API_KEY=a8584d7705c2e6e357a2b89dd2b43c2b
```

---

### Task 4: Verify and Test Changes

**Step 1: Copy updated template to active config**
```bash
cp .env.example .env
```

**Step 2: Restore production secrets in `.env`**

Manually edit `.env` and update these values (keep them secret, don't commit):
- `POSTGRES_PASSWORD`
- `FIRECRAWL_API_KEY`
- `WEBHOOK_API_SECRET`
- `WEBHOOK_SECRET`
- `CHANGEDETECTION_WEBHOOK_SECRET`
- `CHANGEDETECTION_API_KEY`

**Step 3: Verify Docker Compose config resolution**
```bash
docker compose config 2>&1 | head -50
```
Expected: No errors, all `${VAR}` expansions resolved

**Step 4: Start services**
```bash
pnpm services:up
```
Expected: All services start successfully

**Step 5: Health checks**
```bash
curl http://localhost:50107/health  # MCP server
curl http://localhost:50108/health  # Webhook bridge
```
Expected: Both return 200 OK

**Step 6: Run test suite**
```bash
pnpm test
```
Expected: All tests pass

---

### Task 5: Commit Phase 1

**Step 1: Stage changes**
```bash
git add .env.example
```

**Step 2: Commit with descriptive message**
```bash
git commit -m "$(cat <<'EOF'
chore: remove duplicate environment variables (phase 1)

Removed 6 duplicate variables that have fallback logic:
- REDIS_RATE_LIMIT_URL → use REDIS_URL
- MCP_REDIS_URL → use REDIS_URL
- WEBHOOK_REDIS_URL → use REDIS_URL
- SEARCH_SERVICE_API_SECRET → use WEBHOOK_API_SECRET
- WEBHOOK_FIRECRAWL_API_KEY → use FIRECRAWL_API_KEY
- WEBHOOK_CHANGEDETECTION_API_KEY → use CHANGEDETECTION_API_KEY

All services already have fallback logic via AliasChoices (Python)
and getEnvVar() (TypeScript), so no code changes required.

Testing: All services started successfully, health checks pass.
EOF
)"
```

---

## Phase 2: Variable Substitution and Code Updates

**Impact:** Use Docker Compose variable substitution for changedetection HMAC secret, add internal Docker network URL.

### Task 6: Update Changedetection HMAC to Use Substitution

**Files:**
- Modify: `.env.example`

**Step 1: Replace HMAC secret with substitution**

Find line ~179:
```bash
WEBHOOK_CHANGEDETECTION_HMAC_SECRET=Hc7y9sDfT1qLp0vW4zXg2nRb6mJpQs8K
```

Replace with:
```bash
# ⚠️  IMPORTANT: HMAC secret uses substitution to stay in sync with changedetection webhook secret
WEBHOOK_CHANGEDETECTION_HMAC_SECRET=${CHANGEDETECTION_WEBHOOK_SECRET}
```

**Step 2: Add comment to source variable**

Find line ~171 (`CHANGEDETECTION_WEBHOOK_SECRET=...`) and update comment:
```bash
# Webhook signature secret (changedetection.io signs webhooks with this)
# Note: WEBHOOK_CHANGEDETECTION_HMAC_SECRET uses substitution to match this value
CHANGEDETECTION_WEBHOOK_SECRET=Hc7y9sDfT1qLp0vW4zXg2nRb6mJpQs8K
```

---

### Task 7: Add Changedetection Internal URL

**Files:**
- Modify: `.env.example`

**Step 1: Add internal URL variable**

After line ~175 (`WEBHOOK_CHANGEDETECTION_API_URL=...`), add:
```bash
# Internal Docker network URL (for webhook bridge API calls to changedetection)
CHANGEDETECTION_INTERNAL_URL=http://pulse_change-detection:5000
```

**Step 2: Remove placeholder variable**

Remove line ~175:
```bash
WEBHOOK_CHANGEDETECTION_API_URL=http://pulse_change-detection:5000
```

(This was a placeholder that's now replaced by the explicit `CHANGEDETECTION_INTERNAL_URL`)

---

### Task 8: Update Webhook Config Fallback Chain

**Files:**
- Modify: `apps/webhook/config.py`

**Step 1: Read current config**
```bash
cat apps/webhook/config.py | grep -A 5 "changedetection_api_url"
```

**Step 2: Update fallback chain for changedetection_api_url**

Find the field definition (search for `changedetection_api_url`):
```python
changedetection_api_url: str = Field(
    validation_alias=AliasChoices(
        "WEBHOOK_CHANGEDETECTION_API_URL",
        "CHANGEDETECTION_API_URL",
    ),
    default="http://pulse_change-detection:5000",
)
```

Replace with:
```python
changedetection_api_url: str = Field(
    validation_alias=AliasChoices(
        "WEBHOOK_CHANGEDETECTION_API_URL",  # Legacy (keep for backward compat)
        "CHANGEDETECTION_INTERNAL_URL",      # Preferred internal Docker URL
        "CHANGEDETECTION_API_URL",           # External fallback
    ),
    default="http://pulse_change-detection:5000",
)
```

---

### Task 9: Test Changedetection Integration

**Step 1: Copy updated .env**
```bash
cp .env.example .env
# Restore production secrets as in Task 4
```

**Step 2: Verify Docker Compose variable expansion**
```bash
docker compose config | grep -A 2 "WEBHOOK_CHANGEDETECTION_HMAC_SECRET"
```
Expected: Shows expanded value matching `CHANGEDETECTION_WEBHOOK_SECRET`

**Step 3: Run changedetection-specific tests**
```bash
cd apps/webhook
uv run pytest tests/unit/test_changedetection_client.py -v
uv run pytest tests/integration/test_changedetection_e2e.py -v
```
Expected: All tests pass

**Step 4: Full integration test**
```bash
cd /compose/pulse
pnpm services:restart
pnpm test
```
Expected: All tests pass, all services healthy

---

### Task 10: Commit Phase 2

**Step 1: Stage changes**
```bash
git add .env.example apps/webhook/config.py
```

**Step 2: Commit**
```bash
git commit -m "$(cat <<'EOF'
chore: use variable substitution for changedetection HMAC secret

Changes:
- WEBHOOK_CHANGEDETECTION_HMAC_SECRET now uses ${CHANGEDETECTION_WEBHOOK_SECRET}
- Added CHANGEDETECTION_INTERNAL_URL for explicit Docker network access
- Removed WEBHOOK_CHANGEDETECTION_API_URL placeholder
- Updated webhook config.py fallback chain to prefer CHANGEDETECTION_INTERNAL_URL

Benefits:
- Single source of truth for changedetection webhook secret
- Eliminates risk of HMAC mismatch from copy-paste errors
- Explicit internal URL prevents localhost resolution issues

Testing: Changedetection integration tests pass, HMAC verification works.
EOF
)"
```

---

## Phase 3: Documentation Cleanup

### Task 11: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Update "Environment Variables" section**

Find the section starting with `### Key Variable Namespaces` and add a new subsection:

```markdown
### Canonical Variables (After Consolidation)

**Shared Infrastructure:**
- `REDIS_URL` - All services use this (no more duplicates)
- `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` - Base credentials
- `NUQ_DATABASE_URL` - Firecrawl/MCP (postgres:// protocol)
- `WEBHOOK_DATABASE_URL` - Webhook bridge (postgresql+asyncpg:// protocol)

**Service URLs (Internal vs External):**
- `MCP_FIRECRAWL_BASE_URL` - Internal Docker network (http://firecrawl:3002)
- `FIRECRAWL_API_URL` - External access (https://firecrawl.tootie.tv)
- `WEBHOOK_BASE_URL` - Internal Docker network (http://pulse_webhook:52100)
- `CHANGEDETECTION_INTERNAL_URL` - Internal Docker network (http://pulse_change-detection:5000)

**Secrets:**
- `FIRECRAWL_API_KEY` - Base Firecrawl key
- `MCP_FIRECRAWL_API_KEY` - MCP override (self-hosted-no-auth)
- `WEBHOOK_API_SECRET` - Webhook API authentication
- `WEBHOOK_SECRET` - Webhook HMAC verification
- `CHANGEDETECTION_WEBHOOK_SECRET` - changedetection.io webhook signature
- `WEBHOOK_CHANGEDETECTION_HMAC_SECRET` - Uses ${CHANGEDETECTION_WEBHOOK_SECRET} substitution
```

---

### Task 12: Update .env.example Comments

**Files:**
- Modify: `.env.example`

**Step 1: Add header comment explaining consolidation**

At the top of `.env.example` (after line 9), add:
```bash
#
# IMPORTANT: This file has been consolidated to eliminate duplicates.
# - All services use REDIS_URL (no service-specific Redis URLs)
# - changedetection HMAC secret uses variable substitution
# - Prefer CHANGEDETECTION_INTERNAL_URL for Docker network access
# - Database URLs have different protocols (postgres:// vs postgresql+asyncpg://)
#
```

**Step 2: Add section headers for clarity**

Reorganize `.env.example` with clear section markers:
```bash
# ==============================================================================
# SHARED INFRASTRUCTURE
# ==============================================================================

# PostgreSQL (shared across all services)
POSTGRES_USER=firecrawl
...

# Redis (canonical URL used by all services)
REDIS_URL=redis://pulse_redis:6379
...

# ==============================================================================
# FIRECRAWL API
# ==============================================================================
...

# ==============================================================================
# MCP SERVER
# ==============================================================================
...

# ==============================================================================
# WEBHOOK BRIDGE
# ==============================================================================
...

# ==============================================================================
# CHANGEDETECTION.IO INTEGRATION
# ==============================================================================
...
```

---

### Task 13: Update App READMEs

**Files:**
- Modify: `apps/mcp/README.md`
- Modify: `apps/webhook/README.md`

**Step 1: Update environment setup sections**

In both README files, ensure environment configuration sections reference root `.env`:
```markdown
## Environment Configuration

All environment variables are configured in the **root `.env` file**.

```bash
# Copy template and update with your values
cp .env.example .env
```

See root `.env.example` for all available configuration options.
```

---

### Task 14: Commit Documentation Updates

**Step 1: Stage all documentation changes**
```bash
git add CLAUDE.md .env.example apps/mcp/README.md apps/webhook/README.md
```

**Step 2: Commit**
```bash
git commit -m "$(cat <<'EOF'
docs: update environment variable documentation after consolidation

Changes:
- Updated CLAUDE.md with canonical variable list
- Added consolidation notes to .env.example header
- Organized .env.example with section headers for clarity
- Updated app READMEs to reference root .env

Result: Single source of truth for environment configuration.
EOF
)"
```

---

## Verification and Rollback

### Task 15: Final Verification

**Step 1: Full stack test**
```bash
pnpm services:down
pnpm services:up
pnpm test
```
Expected: All services start, all tests pass

**Step 2: Manual smoke tests**
- Test MCP query tool (requires webhook connection)
- Test changedetection webhook delivery
- Verify Redis connection in all services
- Check logs for "variable not found" warnings

**Step 3: Document rollback plan**

If issues occur:
```bash
# Rollback all changes
git checkout main -- .env.example apps/webhook/config.py CLAUDE.md
cp .env.example .env
# Restore production secrets
pnpm services:restart
```

---

## Summary

**Total Changes:**
- **Removed:** 8 duplicate variables
- **Added:** 1 new variable (`CHANGEDETECTION_INTERNAL_URL`)
- **Net Reduction:** 7 variables (~5% reduction in total count)
- **Code Changes:** 1 file (`apps/webhook/config.py`)
- **Documentation:** 3 files updated

**Benefits:**
- Single source of truth for Redis, API secrets
- Eliminated changedetection HMAC mismatch risk
- Clearer documentation and organization
- Easier deployment with fewer variables to configure
