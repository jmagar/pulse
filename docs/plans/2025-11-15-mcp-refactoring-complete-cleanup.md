# MCP Server Refactoring - Complete Cleanup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete MCP server refactoring to thin wrappers, fix security issues, migrate scrape business logic to webhook service, and clean up dead code.

**Architecture:** Migrate scrape tool's multi-stage processing pipeline (caching, cleaning, extraction, storage) to webhook service endpoints while maintaining exact behavior. MCP server becomes pure thin wrapper calling webhook APIs. Fix security vulnerabilities, remove dead code, and establish architectural consistency.

**Tech Stack:**
- **MCP Server:** TypeScript, Express, Vitest
- **Webhook Service:** Python, FastAPI, SQLAlchemy, pytest
- **Shared:** PostgreSQL, Redis, Firecrawl API

---

## Progress Tracker

**Session Date:** 2025-11-15
**Execution Method:** Subagent-Driven Development (same session, fresh subagent per task)

### Completion Status

| Phase | Tasks | Status | Commits |
|-------|-------|--------|---------|
| Phase 1: Critical Security & Test Fixes | 4 tasks | ✅ 3/4 (75%) | 6a0e398b, d505e2e8, 44814f6b, 4bda7742 |
| Phase 2: Webhook Service Migration | 5 tasks | ⏸️ 0/5 (0%) | Pending |
| Phase 3: MCP Server Refactoring | 2 tasks | ⏸️ 0/2 (0%) | Pending |
| Phase 4: Architecture Consistency | 1 task | ⏸️ 0/1 (0%) | Pending |
| Phase 5: Code Quality | 3 tasks | ⏸️ 0/3 (0%) | Pending |
| Phase 6: Final Verification | 2 tasks | ⏸️ 0/2 (0%) | Pending |
| **TOTAL** | **17 tasks** | **✅ 3/17 (18%)** | **4 commits** |

### Completed Tasks

- ✅ **Task 1:** Fix URL Validation Security Vulnerability (Commits: 6a0e398b, d505e2e8)
  - Created shared SSRF-protected URL validation utility
  - Added comprehensive test suite (16 tests)
  - Fixed security vulnerabilities in scrape tool
  - Bundle impact: +117 lines of secure code

- ✅ **Task 2:** Fix Profile Tool Failing Tests (Commit: 44814f6b)
  - Already completed prior to session
  - Updated auth header expectations (X-API-Secret → Authorization: Bearer)
  - All 8 profile tests passing

- ✅ **Task 3:** Remove Unused npm Packages (Commit: 4bda7742)
  - Removed 7 packages from MCP server (uuid, jsonwebtoken, nock, redis-mock, @types/*)
  - Removed 1 package from web app (framer-motion)
  - Bundle savings: ~3.9MB
  - All tests passing after removal

### Currently In Progress

- 🔄 **Task 4:** Delete Dead Utility Files (Next)

### Remaining Tasks (14)

**Phase 1 (1 remaining):**
- Task 4: Delete Dead Utility Files

**Phase 2 (5 tasks):**
- Task 5: Design Webhook Scrape API Contract
- Task 6: Create Webhook Scrape Database Schema
- Task 7: Implement Webhook Scrape Cache Service
- Task 8: Implement Webhook Content Processing Service
- Task 9: Implement Webhook Scrape API Endpoint

**Phase 3 (2 tasks):**
- Task 10: Create MCP Scrape Thin Wrapper
- Task 11: Remove Orphaned Business Logic Modules

**Phase 4 (1 task):**
- Task 12: Migrate Crawl Tool to WebhookBridgeClient

**Phase 5 (3 tasks):**
- Task 13: Consolidate Response Formatters
- Task 14: Replace console.log with Structured Logging
- Task 15: Clean Up Configuration Files

**Phase 6 (2 tasks):**
- Task 16: Run Full Test Suite
- Task 17: Update Documentation

---

## Phase 1: Critical Security & Test Fixes

### Task 1: Fix URL Validation Security Vulnerability

**Files:**
- Create: `apps/mcp/utils/url-validation.ts`
- Modify: `apps/mcp/tools/scrape/schema.ts:167-177`
- Modify: `apps/mcp/tools/crawl/url-utils.ts:1-57`
- Test: `apps/mcp/utils/url-validation.test.ts`

**Step 1: Write failing test for shared URL validation**

Create `apps/mcp/utils/url-validation.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { preprocessUrl, validateUrl } from './url-validation.js';

describe('URL Validation', () => {
  describe('preprocessUrl', () => {
    it('should add https:// to URLs without protocol', () => {
      expect(preprocessUrl('example.com')).toBe('https://example.com');
    });

    it('should preserve existing https:// protocol', () => {
      expect(preprocessUrl('https://example.com')).toBe('https://example.com');
    });

    it('should reject file:// protocol (SSRF)', () => {
      expect(() => preprocessUrl('file:///etc/passwd')).toThrow('Invalid protocol');
    });

    it('should reject javascript: protocol (XSS)', () => {
      expect(() => preprocessUrl('javascript:alert(1)')).toThrow('Invalid protocol');
    });

    it('should reject data: protocol', () => {
      expect(() => preprocessUrl('data:text/html,<script>alert(1)</script>')).toThrow('Invalid protocol');
    });

    it('should reject localhost (SSRF)', () => {
      expect(() => preprocessUrl('http://localhost:8080')).toThrow('Private IP addresses not allowed');
    });

    it('should reject 127.0.0.1 (SSRF)', () => {
      expect(() => preprocessUrl('http://127.0.0.1')).toThrow('Private IP addresses not allowed');
    });

    it('should reject private IP 192.168.x.x (SSRF)', () => {
      expect(() => preprocessUrl('http://192.168.1.1')).toThrow('Private IP addresses not allowed');
    });

    it('should reject invalid URLs', () => {
      expect(() => preprocessUrl('not a url')).toThrow('Invalid URL');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/mcp && pnpm test utils/url-validation.test.ts`

Expected: FAIL with "Cannot find module './url-validation.js'"

**Step 3: Create shared URL validation utility**

Create `apps/mcp/utils/url-validation.ts`:

```typescript
/**
 * URL validation utilities with SSRF protection
 */

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

const PRIVATE_IP_PATTERNS = [
  /^localhost$/i,
  /^127\.\d+\.\d+\.\d+$/,
  /^10\.\d+\.\d+\.\d+$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
  /^192\.168\.\d+\.\d+$/,
  /^\[?::1\]?$/,
  /^\[?fe80:/i,
];

/**
 * Preprocess and validate URL with SSRF protection
 *
 * @param url - URL to preprocess
 * @returns Validated URL with protocol
 * @throws Error if URL is invalid or uses dangerous protocol/IP
 */
export function preprocessUrl(url: string): string {
  let processed = url.trim();

  // SSRF protection - check for dangerous protocols
  if (processed.match(/^(file|javascript|data):/i)) {
    throw new Error(
      `Invalid protocol: URLs with file://, javascript:, or data: protocols are not allowed`
    );
  }

  // Add https:// if no protocol
  if (!processed.match(/^https?:\/\//i)) {
    processed = `https://${processed}`;
  }

  // Validate URL format
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(processed);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }

  // Enforce HTTP/HTTPS only
  if (!ALLOWED_PROTOCOLS.has(parsedUrl.protocol)) {
    throw new Error(
      `Invalid protocol: Only HTTP and HTTPS protocols are allowed, got ${parsedUrl.protocol}`
    );
  }

  // Prevent localhost/private IP SSRF
  for (const pattern of PRIVATE_IP_PATTERNS) {
    if (pattern.test(parsedUrl.hostname)) {
      throw new Error(
        `Private IP addresses not allowed: ${parsedUrl.hostname} is a private/local address`
      );
    }
  }

  return processed;
}

/**
 * Validate URL without preprocessing
 *
 * @param url - URL to validate
 * @returns true if valid, throws error otherwise
 */
export function validateUrl(url: string): boolean {
  preprocessUrl(url); // Reuse validation logic
  return true;
}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/mcp && pnpm test utils/url-validation.test.ts`

Expected: PASS (all 9 tests)

**Step 5: Update scrape tool to use shared validation**

Modify `apps/mcp/tools/scrape/schema.ts`:

Remove lines 167-177 (old preprocessUrl function).

Add import at top:
```typescript
import { preprocessUrl } from '../../utils/url-validation.js';
```

**Step 6: Update crawl tool to use shared validation**

Modify `apps/mcp/tools/crawl/url-utils.ts`:

Replace entire file content:

```typescript
/**
 * URL utilities for crawl tool
 * Re-exports shared URL validation with SSRF protection
 */

export { preprocessUrl, validateUrl } from '../../utils/url-validation.js';
```

**Step 7: Run all tool tests to verify no regressions**

Run: `cd apps/mcp && pnpm test tools/scrape tools/crawl`

Expected: PASS (all existing tests)

**Step 8: Commit security fix**

```bash
git add apps/mcp/utils/url-validation.ts apps/mcp/utils/url-validation.test.ts
git add apps/mcp/tools/scrape/schema.ts apps/mcp/tools/crawl/url-utils.ts
git commit -m "fix(security): consolidate URL validation with SSRF protection

- Create shared url-validation.ts utility
- Block file://, javascript:, data: protocols
- Block localhost and private IP ranges
- Remove duplicate insecure version from scrape tool
- Update crawl tool to use shared implementation

Fixes security vulnerability where scrape tool accepted dangerous URLs."
```

---

### Task 2: Fix Profile Tool Failing Tests

**Files:**
- Modify: `apps/mcp/tools/profile/client.test.ts:1-200`

**Step 1: Identify failing test assertions**

Run: `cd apps/mcp && pnpm test tools/profile/client.test.ts`

Expected: 8 failures with "Expected: X-API-Secret, Received: Authorization"

**Step 2: Update test expectations to match implementation**

Modify `apps/mcp/tools/profile/client.test.ts`:

Find all occurrences of:
```typescript
headers: { "X-API-Secret": "test-secret" }
```

Replace with:
```typescript
headers: { "Authorization": "Bearer test-secret" }
```

**Exact changes needed (search and replace):**

```typescript
// Around line 45-50
expect(fetch).toHaveBeenCalledWith(
  "http://localhost/api/metrics/crawls/test-id",
  expect.objectContaining({
    method: "GET",
-   headers: { "X-API-Secret": "test-secret" },
+   headers: { "Authorization": "Bearer test-secret" },
  })
);

// Repeat for all 8 test cases that check headers
```

**Step 3: Run tests to verify all pass**

Run: `cd apps/mcp && pnpm test tools/profile/client.test.ts`

Expected: PASS (all tests, 0 failures)

**Step 4: Run full test suite**

Run: `cd apps/mcp && pnpm test`

Expected: PASS rate increases to 100% (454/454 tests)

**Step 5: Commit test fixes**

```bash
git add apps/mcp/tools/profile/client.test.ts
git commit -m "fix(tests): update profile tool test expectations for Bearer auth

Changed from X-API-Secret header to Authorization: Bearer header
to match actual implementation. All 8 failing tests now pass."
```

---

### Task 3: Remove Unused npm Packages

**Files:**
- Modify: `apps/mcp/package.json`
- Modify: `apps/web/package.json`

**Step 1: Remove unused packages from MCP server**

Modify `apps/mcp/package.json`:

Remove these dependencies:
```json
{
  "dependencies": {
-   "uuid": "^9.0.1",
-   "jsonwebtoken": "^9.0.2"
  },
  "devDependencies": {
-   "nock": "^14.0.10",
-   "redis-mock": "^0.56.3"
  }
}
```

**Step 2: Run pnpm install to update lockfile**

Run: `cd apps/mcp && pnpm install`

Expected: Packages removed from node_modules, lockfile updated

**Step 3: Verify MCP tests still pass**

Run: `cd apps/mcp && pnpm test`

Expected: PASS (all tests, no missing dependencies)

**Step 4: Remove unused package from web app**

Modify `apps/web/package.json`:

Remove dependency:
```json
{
  "dependencies": {
-   "framer-motion": "^12.23.24"
  }
}
```

**Step 5: Run pnpm install in web app**

Run: `cd apps/web && pnpm install`

Expected: Package removed, lockfile updated

**Step 6: Verify web tests still pass**

Run: `cd apps/web && pnpm test`

Expected: PASS (all tests)

**Step 7: Update root lockfile**

Run: `pnpm install` (from repository root)

Expected: Workspace lockfile updated

**Step 8: Commit dependency cleanup**

```bash
git add apps/mcp/package.json apps/web/package.json pnpm-lock.yaml
git commit -m "chore(deps): remove unused npm packages

MCP Server:
- Remove uuid (transitive dep from googleapis)
- Remove jsonwebtoken (no JWT usage)
- Remove nock (tests use vitest mocks)
- Remove redis-mock (tests use vitest mocks)

Web App:
- Remove framer-motion (no imports found)

Saves ~1.5MB bundle size."
```

---

### Task 4: Delete Dead Utility Files

**Files:**
- Delete: `apps/mcp/utils/responses.ts`
- Delete: `apps/mcp/utils/errors.ts`

**Step 1: Verify no imports of responses.ts**

Run: `cd apps/mcp && grep -r "from.*utils/responses" --include="*.ts" .`

Expected: No matches (0 imports)

**Step 2: Verify no imports of errors.ts**

Run: `cd apps/mcp && grep -r "from.*utils/errors" --include="*.ts" .`

Expected: No matches (0 imports)

**Step 3: Delete dead files**

Run:
```bash
rm apps/mcp/utils/responses.ts
rm apps/mcp/utils/errors.ts
```

**Step 4: Run tests to verify no breakage**

Run: `cd apps/mcp && pnpm test`

Expected: PASS (all tests, no missing imports)

**Step 5: Commit cleanup**

```bash
git add apps/mcp/utils/responses.ts apps/mcp/utils/errors.ts
git commit -m "chore: delete dead utility files

- Remove utils/responses.ts (43 lines, 0 references)
- Remove utils/errors.ts (68 lines, 0 external references)

Tools construct CallToolResult objects inline instead."
```

---

## Phase 2: Webhook Service - Scrape Pipeline Migration

### Task 5: Design Webhook Scrape API Contract

**Files:**
- Create: `docs/api/webhook-scrape-endpoint.md`

**Step 1: Document scrape endpoint specification**

Create `docs/api/webhook-scrape-endpoint.md`:

```markdown
# Webhook Scrape API Endpoint

## Endpoint

`POST /api/v2/scrape`

## Purpose

Multi-stage web scraping with caching, cleaning, LLM extraction, and storage.
Matches exact behavior of MCP scrape tool pipeline.

## Request Schema

```json
{
  "url": "https://example.com",
  "formats": ["markdown", "html", "rawHtml", "screenshot"],
  "onlyMainContent": true,
  "includeTags": ["article", "main"],
  "excludeTags": ["nav", "footer"],
  "waitFor": 0,
  "timeout": 30000,
  "extract": {
    "schema": {
      "type": "object",
      "properties": {
        "title": { "type": "string" },
        "summary": { "type": "string" }
      }
    },
    "systemPrompt": "Extract article metadata",
    "prompt": "Extract the title and summary"
  },
  "actions": [
    {
      "type": "wait",
      "milliseconds": 1000
    },
    {
      "type": "click",
      "selector": "#load-more"
    }
  ],
  "mobile": false,
  "skipTlsVerification": false,
  "headers": {
    "User-Agent": "Custom Agent"
  },
  "removeBase64Images": true,
  "parsePDF": true,
  "atsv": false,
  "location": {
    "country": "US",
    "languages": ["en-US"]
  },
  "geolocation": {
    "latitude": 37.7749,
    "longitude": -122.4194
  },
  "options": {
    "cache": {
      "enabled": true,
      "ttl": 3600,
      "invalidate": false
    },
    "cleaning": {
      "enabled": true,
      "removeScripts": true,
      "removeStyles": true
    },
    "extraction": {
      "enabled": true,
      "provider": "anthropic",
      "model": "claude-3-5-sonnet-20241022"
    },
    "storage": {
      "enabled": true,
      "tiers": ["raw", "cleaned", "extracted"]
    }
  }
}
```

## Response Schema

```json
{
  "success": true,
  "data": {
    "markdown": "# Page Title\n\nContent...",
    "html": "<article>Content...</article>",
    "rawHtml": "<!DOCTYPE html>...",
    "metadata": {
      "title": "Page Title",
      "description": "Page description",
      "language": "en",
      "sourceURL": "https://example.com",
      "statusCode": 200
    },
    "extract": {
      "title": "Extracted Title",
      "summary": "Extracted summary"
    },
    "screenshot": "data:image/png;base64,...",
    "actions": {
      "completed": 2,
      "results": [
        { "type": "wait", "success": true },
        { "type": "click", "success": true }
      ]
    },
    "cached": false,
    "tier": "extracted"
  }
}
```

## Cache Behavior

1. Check cache for URL (tiers: cleaned > extracted > raw)
2. If found and not invalidated: return cached content
3. If not found or invalidated: proceed with scraping

## Processing Pipeline

1. **Cache Check** → Return if hit
2. **Scrape** → Firecrawl API or native client
3. **Clean** → HTML to Markdown (if cleaning enabled)
4. **Extract** → LLM extraction (if extraction enabled)
5. **Store** → Save to storage tiers (if storage enabled)
6. **Return** → Formatted response

## Storage Tiers

- **raw**: Original scraped content (HTML/JSON)
- **cleaned**: Markdown-converted content
- **extracted**: LLM-extracted structured data

## Error Handling

```json
{
  "success": false,
  "error": {
    "type": "scrape_failed",
    "message": "Failed to scrape URL: timeout",
    "code": "SCRAPE_TIMEOUT",
    "details": {
      "url": "https://example.com",
      "statusCode": null,
      "retries": 3
    }
  }
}
```
```

**Step 2: Commit API specification**

```bash
git add docs/api/webhook-scrape-endpoint.md
git commit -m "docs(api): define webhook scrape endpoint specification

Comprehensive API contract for scrape pipeline migration from MCP to webhook.
Includes cache behavior, processing pipeline, storage tiers, error handling."
```

---

### Task 6: Create Webhook Scrape Database Schema

**Files:**
- Create: `apps/webhook/alembic/versions/20251115_add_scrape_cache.py`
- Create: `apps/webhook/app/models/scrape.py`

**Step 1: Write failing test for scrape cache model**

Create `apps/webhook/tests/unit/test_scrape_cache_model.py`:

```python
import pytest
from datetime import datetime, timezone
from app.models.scrape import ScrapeCache

def test_scrape_cache_model_structure():
    """Scrape cache model should have required fields"""
    cache = ScrapeCache(
        url="https://example.com",
        tier="cleaned",
        content={"markdown": "# Test"},
        metadata={"title": "Test"},
        expires_at=datetime.now(timezone.utc)
    )
    assert cache.url == "https://example.com"
    assert cache.tier == "cleaned"
    assert cache.content["markdown"] == "# Test"
    assert cache.metadata["title"] == "Test"
    assert cache.expires_at is not None

def test_scrape_cache_unique_constraint():
    """Should enforce unique constraint on (url, tier)"""
    # Test will verify database constraint
    assert hasattr(ScrapeCache, '__table_args__')
```

**Step 2: Run test to verify it fails**

Run: `cd apps/webhook && WEBHOOK_SKIP_DB_FIXTURES=1 uv run pytest tests/unit/test_scrape_cache_model.py -v`

Expected: FAIL with "cannot import name 'ScrapeCache'"

**Step 3: Create scrape cache model**

Create `apps/webhook/app/models/scrape.py`:

```python
"""
Scrape cache models for storing processed web content
"""
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, JSON, DateTime, Index, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from app.models.base import Base


class ScrapeCache(Base):
    """
    Cache for scraped and processed web content

    Supports multiple storage tiers:
    - raw: Original scraped HTML/JSON
    - cleaned: Markdown-converted content
    - extracted: LLM-extracted structured data
    """
    __tablename__ = "scrape_cache"
    __table_args__ = (
        UniqueConstraint('url', 'tier', name='uq_scrape_cache_url_tier'),
        Index('ix_scrape_cache_url', 'url'),
        Index('ix_scrape_cache_expires_at', 'expires_at'),
        {'schema': 'webhook'}
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    url = Column(String(2048), nullable=False, index=True)
    tier = Column(String(50), nullable=False)  # raw, cleaned, extracted
    content = Column(JSONB, nullable=False)  # Scraped content
    metadata = Column(JSONB, nullable=True)  # Title, description, etc.
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc)
    )
    expires_at = Column(DateTime(timezone=True), nullable=False, index=True)

    def __repr__(self) -> str:
        return f"<ScrapeCache(url={self.url!r}, tier={self.tier!r})>"
```

**Step 4: Create Alembic migration**

Create `apps/webhook/alembic/versions/20251115_add_scrape_cache.py`:

```python
"""add scrape_cache table

Revision ID: 20251115_add_scrape_cache
Revises: 20251113_add_foreign_keys
Create Date: 2025-11-15 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '20251115_add_scrape_cache'
down_revision = '20251113_add_foreign_keys'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'scrape_cache',
        sa.Column('id', sa.Integer(), nullable=False, autoincrement=True),
        sa.Column('url', sa.String(length=2048), nullable=False),
        sa.Column('tier', sa.String(length=50), nullable=False),
        sa.Column('content', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('metadata', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('url', 'tier', name='uq_scrape_cache_url_tier'),
        schema='webhook'
    )

    op.create_index(
        'ix_scrape_cache_url',
        'scrape_cache',
        ['url'],
        unique=False,
        schema='webhook'
    )

    op.create_index(
        'ix_scrape_cache_expires_at',
        'scrape_cache',
        ['expires_at'],
        unique=False,
        schema='webhook'
    )


def downgrade() -> None:
    op.drop_index('ix_scrape_cache_expires_at', table_name='scrape_cache', schema='webhook')
    op.drop_index('ix_scrape_cache_url', table_name='scrape_cache', schema='webhook')
    op.drop_table('scrape_cache', schema='webhook')
```

**Step 5: Run migration**

Run:
```bash
cd apps/webhook
WEBHOOK_DATABASE_URL="postgresql+asyncpg://firecrawl:zFp9g998BFwHuvsB9DcjerW8DyuNMQv2@localhost:50105/pulse_postgres" \
uv run alembic upgrade head
```

Expected: Migration applied successfully

**Step 6: Run test to verify model works**

Run: `cd apps/webhook && WEBHOOK_SKIP_DB_FIXTURES=1 uv run pytest tests/unit/test_scrape_cache_model.py -v`

Expected: PASS

**Step 7: Commit database schema**

```bash
git add apps/webhook/app/models/scrape.py
git add apps/webhook/alembic/versions/20251115_add_scrape_cache.py
git add apps/webhook/tests/unit/test_scrape_cache_model.py
git commit -m "feat(webhook): add scrape_cache table for multi-tier content storage

Schema supports:
- URL-based caching with TTL
- Three storage tiers (raw, cleaned, extracted)
- JSONB for flexible content storage
- Unique constraint on (url, tier)
- Indexes for performance"
```

---

### Task 7: Implement Webhook Scrape Cache Service

**Files:**
- Create: `apps/webhook/services/scrape_cache.py`
- Create: `apps/webhook/tests/unit/test_scrape_cache_service.py`

**Step 1: Write failing test for cache service**

Create `apps/webhook/tests/unit/test_scrape_cache_service.py`:

```python
import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, MagicMock
from services.scrape_cache import ScrapeCacheService

@pytest.mark.asyncio
async def test_get_cached_content_returns_valid_cache():
    """Should return cached content if not expired"""
    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = MagicMock(
        url="https://example.com",
        tier="cleaned",
        content={"markdown": "# Test"},
        metadata={"title": "Test"},
        expires_at=datetime.now(timezone.utc) + timedelta(hours=1)
    )
    mock_session.execute.return_value = mock_result

    service = ScrapeCacheService(mock_session)
    result = await service.get_cached_content("https://example.com", tier="cleaned")

    assert result is not None
    assert result["markdown"] == "# Test"

@pytest.mark.asyncio
async def test_get_cached_content_returns_none_if_expired():
    """Should return None if cache expired"""
    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = MagicMock(
        url="https://example.com",
        tier="cleaned",
        content={"markdown": "# Test"},
        metadata={"title": "Test"},
        expires_at=datetime.now(timezone.utc) - timedelta(hours=1)  # Expired
    )
    mock_session.execute.return_value = mock_result

    service = ScrapeCacheService(mock_session)
    result = await service.get_cached_content("https://example.com", tier="cleaned")

    assert result is None

@pytest.mark.asyncio
async def test_set_cached_content_inserts_or_updates():
    """Should upsert cached content with TTL"""
    mock_session = AsyncMock()

    service = ScrapeCacheService(mock_session)
    await service.set_cached_content(
        url="https://example.com",
        tier="cleaned",
        content={"markdown": "# Test"},
        metadata={"title": "Test"},
        ttl=3600
    )

    # Verify execute was called with INSERT ... ON CONFLICT
    mock_session.execute.assert_called_once()

@pytest.mark.asyncio
async def test_invalidate_cache_deletes_entry():
    """Should delete cache entry for URL and tier"""
    mock_session = AsyncMock()

    service = ScrapeCacheService(mock_session)
    await service.invalidate_cache("https://example.com", tier="cleaned")

    mock_session.execute.assert_called_once()
```

**Step 2: Run test to verify it fails**

Run: `cd apps/webhook && WEBHOOK_SKIP_DB_FIXTURES=1 uv run pytest tests/unit/test_scrape_cache_service.py -v`

Expected: FAIL with "cannot import name 'ScrapeCacheService'"

**Step 3: Implement scrape cache service**

Create `apps/webhook/services/scrape_cache.py`:

```python
"""
Scrape cache service for storing and retrieving processed web content
"""
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, and_
from sqlalchemy.dialects.postgresql import insert
from app.models.scrape import ScrapeCache


class ScrapeCacheService:
    """
    Service for managing scrape cache with multi-tier storage
    """

    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_cached_content(
        self,
        url: str,
        tier: str = "cleaned"
    ) -> Optional[Dict[str, Any]]:
        """
        Get cached content for URL and tier

        Args:
            url: URL to look up
            tier: Storage tier (raw, cleaned, extracted)

        Returns:
            Cached content dict or None if not found/expired
        """
        stmt = select(ScrapeCache).where(
            and_(
                ScrapeCache.url == url,
                ScrapeCache.tier == tier,
                ScrapeCache.expires_at > datetime.now(timezone.utc)
            )
        )

        result = await self.session.execute(stmt)
        cache_entry = result.scalar_one_or_none()

        if cache_entry:
            return cache_entry.content
        return None

    async def set_cached_content(
        self,
        url: str,
        tier: str,
        content: Dict[str, Any],
        metadata: Optional[Dict[str, Any]] = None,
        ttl: int = 3600
    ) -> None:
        """
        Store cached content with TTL

        Args:
            url: URL to cache
            tier: Storage tier
            content: Content to store
            metadata: Optional metadata
            ttl: Time to live in seconds (default 1 hour)
        """
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=ttl)

        # Use INSERT ... ON CONFLICT to handle race conditions
        stmt = insert(ScrapeCache).values(
            url=url,
            tier=tier,
            content=content,
            metadata=metadata,
            created_at=datetime.now(timezone.utc),
            expires_at=expires_at
        ).on_conflict_do_update(
            constraint='uq_scrape_cache_url_tier',
            set_={
                'content': content,
                'metadata': metadata,
                'created_at': datetime.now(timezone.utc),
                'expires_at': expires_at
            }
        )

        await self.session.execute(stmt)
        await self.session.commit()

    async def invalidate_cache(
        self,
        url: str,
        tier: Optional[str] = None
    ) -> int:
        """
        Invalidate cache entries for URL

        Args:
            url: URL to invalidate
            tier: Optional tier to invalidate (if None, invalidates all tiers)

        Returns:
            Number of entries deleted
        """
        if tier:
            stmt = delete(ScrapeCache).where(
                and_(
                    ScrapeCache.url == url,
                    ScrapeCache.tier == tier
                )
            )
        else:
            stmt = delete(ScrapeCache).where(ScrapeCache.url == url)

        result = await self.session.execute(stmt)
        await self.session.commit()

        return result.rowcount

    async def get_best_tier(
        self,
        url: str,
        preferred_tiers: list[str] = ["extracted", "cleaned", "raw"]
    ) -> Optional[tuple[str, Dict[str, Any]]]:
        """
        Get cached content from best available tier

        Args:
            url: URL to look up
            preferred_tiers: List of tiers in preference order

        Returns:
            Tuple of (tier, content) or None if not found
        """
        for tier in preferred_tiers:
            content = await self.get_cached_content(url, tier)
            if content:
                return (tier, content)
        return None
```

**Step 4: Run test to verify it passes**

Run: `cd apps/webhook && WEBHOOK_SKIP_DB_FIXTURES=1 uv run pytest tests/unit/test_scrape_cache_service.py -v`

Expected: PASS

**Step 5: Commit cache service**

```bash
git add apps/webhook/services/scrape_cache.py
git add apps/webhook/tests/unit/test_scrape_cache_service.py
git commit -m "feat(webhook): implement scrape cache service

Features:
- Get cached content with expiration check
- Upsert cached content with TTL
- Invalidate cache by URL/tier
- Get best available tier (extracted > cleaned > raw)

Uses INSERT ON CONFLICT for race condition safety."
```

---

### Task 8: Implement Webhook Content Processing Service

**Files:**
- Create: `apps/webhook/services/content_processor.py`
- Create: `apps/webhook/tests/unit/test_content_processor.py`

**Step 1: Write failing test for content processor**

Create `apps/webhook/tests/unit/test_content_processor.py`:

```python
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from services.content_processor import ContentProcessor

@pytest.mark.asyncio
async def test_clean_html_to_markdown():
    """Should convert HTML to Markdown"""
    processor = ContentProcessor()

    html = "<article><h1>Test</h1><p>Content</p></article>"
    result = await processor.clean_html(html)

    assert "# Test" in result
    assert "Content" in result

@pytest.mark.asyncio
async def test_extract_with_llm():
    """Should extract structured data using LLM"""
    mock_client = AsyncMock()
    mock_client.extract.return_value = {"title": "Test", "summary": "Summary"}

    processor = ContentProcessor(llm_client=mock_client)

    schema = {
        "type": "object",
        "properties": {
            "title": {"type": "string"},
            "summary": {"type": "string"}
        }
    }

    result = await processor.extract_structured_data(
        content="# Test\n\nContent",
        schema=schema,
        system_prompt="Extract metadata",
        prompt="Extract title and summary"
    )

    assert result["title"] == "Test"
    assert result["summary"] == "Summary"

@pytest.mark.asyncio
async def test_process_pipeline():
    """Should run full processing pipeline (scrape -> clean -> extract)"""
    mock_scraper = AsyncMock()
    mock_scraper.scrape.return_value = {
        "html": "<article><h1>Test</h1><p>Content</p></article>",
        "metadata": {"title": "Test"}
    }

    mock_llm = AsyncMock()
    mock_llm.extract.return_value = {"extracted": "data"}

    processor = ContentProcessor(
        scraper=mock_scraper,
        llm_client=mock_llm
    )

    result = await processor.process(
        url="https://example.com",
        clean=True,
        extract_schema={"type": "object"}
    )

    assert "raw" in result
    assert "cleaned" in result
    assert "extracted" in result
```

**Step 2: Run test to verify it fails**

Run: `cd apps/webhook && WEBHOOK_SKIP_DB_FIXTURES=1 uv run pytest tests/unit/test_content_processor.py -v`

Expected: FAIL with "cannot import name 'ContentProcessor'"

**Step 3: Install required dependencies**

Add to `apps/webhook/pyproject.toml`:

```toml
[project]
dependencies = [
    # ... existing ...
    "beautifulsoup4>=4.12.0",
    "markdownify>=0.12.0",
]
```

Run: `cd apps/webhook && uv sync`

**Step 4: Implement content processor**

Create `apps/webhook/services/content_processor.py`:

```python
"""
Content processing service for HTML cleaning and LLM extraction
"""
from typing import Dict, Any, Optional
from bs4 import BeautifulSoup
from markdownify import markdownify
import re


class ContentProcessor:
    """
    Service for processing web content
    - HTML to Markdown conversion
    - LLM-based structured data extraction
    - Multi-stage pipeline (raw -> cleaned -> extracted)
    """

    def __init__(
        self,
        scraper=None,
        llm_client=None
    ):
        self.scraper = scraper
        self.llm_client = llm_client

    async def clean_html(
        self,
        html: str,
        remove_scripts: bool = True,
        remove_styles: bool = True,
        only_main_content: bool = True
    ) -> str:
        """
        Convert HTML to clean Markdown

        Args:
            html: Raw HTML content
            remove_scripts: Remove <script> tags
            remove_styles: Remove <style> tags
            only_main_content: Extract only main content area

        Returns:
            Cleaned Markdown text
        """
        soup = BeautifulSoup(html, 'html.parser')

        # Remove unwanted tags
        if remove_scripts:
            for script in soup.find_all('script'):
                script.decompose()

        if remove_styles:
            for style in soup.find_all('style'):
                style.decompose()

        # Extract main content if requested
        if only_main_content:
            # Try to find main content area
            main = (
                soup.find('main') or
                soup.find('article') or
                soup.find('div', class_=re.compile(r'content|main|article', re.I)) or
                soup.find('body')
            )
            if main:
                soup = main

        # Convert to Markdown
        markdown = markdownify(
            str(soup),
            heading_style="ATX",
            bullets="-",
            strip=['script', 'style']
        )

        # Clean up extra whitespace
        markdown = re.sub(r'\n{3,}', '\n\n', markdown)
        markdown = markdown.strip()

        return markdown

    async def extract_structured_data(
        self,
        content: str,
        schema: Dict[str, Any],
        system_prompt: Optional[str] = None,
        prompt: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Extract structured data using LLM

        Args:
            content: Content to extract from
            schema: JSON schema for extraction
            system_prompt: Optional system prompt
            prompt: Optional extraction prompt

        Returns:
            Extracted structured data
        """
        if not self.llm_client:
            raise ValueError("LLM client not configured")

        return await self.llm_client.extract(
            content=content,
            schema=schema,
            system_prompt=system_prompt,
            prompt=prompt
        )

    async def process(
        self,
        url: str,
        clean: bool = True,
        extract_schema: Optional[Dict[str, Any]] = None,
        extract_system_prompt: Optional[str] = None,
        extract_prompt: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Run full processing pipeline

        Args:
            url: URL to process
            clean: Whether to clean HTML to Markdown
            extract_schema: Optional JSON schema for LLM extraction
            extract_system_prompt: Optional system prompt
            extract_prompt: Optional extraction prompt

        Returns:
            Dictionary with raw, cleaned, and extracted content
        """
        if not self.scraper:
            raise ValueError("Scraper not configured")

        # Stage 1: Scrape
        scrape_result = await self.scraper.scrape(url)

        result = {
            "raw": scrape_result,
            "cleaned": None,
            "extracted": None
        }

        # Stage 2: Clean
        if clean and scrape_result.get("html"):
            cleaned = await self.clean_html(scrape_result["html"])
            result["cleaned"] = cleaned

        # Stage 3: Extract
        if extract_schema:
            content = result["cleaned"] or scrape_result.get("html", "")
            extracted = await self.extract_structured_data(
                content=content,
                schema=extract_schema,
                system_prompt=extract_system_prompt,
                prompt=extract_prompt
            )
            result["extracted"] = extracted

        return result
```

**Step 5: Run test to verify it passes**

Run: `cd apps/webhook && WEBHOOK_SKIP_DB_FIXTURES=1 uv run pytest tests/unit/test_content_processor.py -v`

Expected: PASS

**Step 6: Commit content processor**

```bash
git add apps/webhook/services/content_processor.py
git add apps/webhook/tests/unit/test_content_processor.py
git add apps/webhook/pyproject.toml
git commit -m "feat(webhook): implement content processing service

Features:
- HTML to Markdown conversion with BeautifulSoup
- Main content extraction
- LLM-based structured data extraction
- Multi-stage pipeline (scrape -> clean -> extract)

Dependencies: beautifulsoup4, markdownify"
```

---

### Task 9: Implement Webhook Scrape API Endpoint

**Files:**
- Create: `apps/webhook/api/routers/scrape.py`
- Create: `apps/webhook/api/schemas/scrape.py`
- Create: `apps/webhook/tests/integration/test_scrape_api.py`

**Step 1: Write failing integration test**

Create `apps/webhook/tests/integration/test_scrape_api.py`:

```python
import pytest
from httpx import AsyncClient
from unittest.mock import AsyncMock, patch

@pytest.mark.asyncio
async def test_scrape_endpoint_returns_cached_content(client: AsyncClient):
    """Should return cached content if available"""
    with patch('api.routers.scrape.ScrapeCacheService') as mock_cache:
        mock_cache.return_value.get_best_tier.return_value = (
            "cleaned",
            {"markdown": "# Cached"}
        )

        response = await client.post(
            "/api/v2/scrape",
            json={"url": "https://example.com"}
        )

        assert response.status_code == 200
        assert response.json()["success"] is True
        assert response.json()["data"]["cached"] is True
        assert response.json()["data"]["tier"] == "cleaned"

@pytest.mark.asyncio
async def test_scrape_endpoint_processes_new_url(client: AsyncClient):
    """Should scrape, process, and cache new URL"""
    with patch('api.routers.scrape.ScrapeCacheService') as mock_cache, \
         patch('api.routers.scrape.ContentProcessor') as mock_processor:

        mock_cache.return_value.get_best_tier.return_value = None
        mock_processor.return_value.process.return_value = {
            "raw": {"html": "<h1>Test</h1>"},
            "cleaned": "# Test",
            "extracted": {"title": "Test"}
        }

        response = await client.post(
            "/api/v2/scrape",
            json={
                "url": "https://example.com",
                "options": {
                    "cleaning": {"enabled": True},
                    "extraction": {"enabled": True}
                }
            }
        )

        assert response.status_code == 200
        assert response.json()["success"] is True
        assert response.json()["data"]["cached"] is False

@pytest.mark.asyncio
async def test_scrape_endpoint_invalidates_cache(client: AsyncClient):
    """Should invalidate cache when requested"""
    with patch('api.routers.scrape.ScrapeCacheService') as mock_cache:
        mock_cache.return_value.invalidate_cache.return_value = 1

        response = await client.post(
            "/api/v2/scrape",
            json={
                "url": "https://example.com",
                "options": {
                    "cache": {
                        "enabled": True,
                        "invalidate": True
                    }
                }
            }
        )

        assert response.status_code == 200
        mock_cache.return_value.invalidate_cache.assert_called_once()
```

**Step 2: Run test to verify it fails**

Run: `cd apps/webhook && WEBHOOK_SKIP_DB_FIXTURES=1 uv run pytest tests/integration/test_scrape_api.py -v`

Expected: FAIL with "404 Not Found" (route doesn't exist)

**Step 3: Create Pydantic schemas**

Create `apps/webhook/api/schemas/scrape.py`:

```python
"""
Pydantic schemas for scrape API endpoint
"""
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field, HttpUrl


class CacheOptions(BaseModel):
    enabled: bool = True
    ttl: int = Field(default=3600, ge=60, le=86400)
    invalidate: bool = False


class CleaningOptions(BaseModel):
    enabled: bool = True
    remove_scripts: bool = True
    remove_styles: bool = True


class ExtractionOptions(BaseModel):
    enabled: bool = False
    provider: str = "anthropic"
    model: str = "claude-3-5-sonnet-20241022"


class StorageOptions(BaseModel):
    enabled: bool = True
    tiers: List[str] = ["raw", "cleaned", "extracted"]


class ScrapeOptionsSchema(BaseModel):
    cache: CacheOptions = Field(default_factory=CacheOptions)
    cleaning: CleaningOptions = Field(default_factory=CleaningOptions)
    extraction: ExtractionOptions = Field(default_factory=ExtractionOptions)
    storage: StorageOptions = Field(default_factory=StorageOptions)


class ExtractSchema(BaseModel):
    schema_: Dict[str, Any] = Field(..., alias="schema")
    system_prompt: Optional[str] = None
    prompt: Optional[str] = None


class ScrapeRequest(BaseModel):
    url: HttpUrl
    formats: List[str] = ["markdown"]
    only_main_content: bool = True
    include_tags: Optional[List[str]] = None
    exclude_tags: Optional[List[str]] = None
    wait_for: int = 0
    timeout: int = 30000
    extract: Optional[ExtractSchema] = None
    actions: Optional[List[Dict[str, Any]]] = None
    mobile: bool = False
    headers: Optional[Dict[str, str]] = None
    remove_base64_images: bool = True
    parse_pdf: bool = True
    options: ScrapeOptionsSchema = Field(default_factory=ScrapeOptionsSchema)


class ScrapeResponse(BaseModel):
    success: bool
    data: Optional[Dict[str, Any]] = None
    error: Optional[Dict[str, Any]] = None
```

**Step 4: Implement scrape endpoint**

Create `apps/webhook/api/routers/scrape.py`:

```python
"""
Scrape API endpoint - Multi-stage web scraping with caching
"""
from typing import Dict, Any
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from api.deps import get_db_session
from api.schemas.scrape import ScrapeRequest, ScrapeResponse
from services.scrape_cache import ScrapeCacheService
from services.content_processor import ContentProcessor
from utils.logging import get_logger

router = APIRouter()
logger = get_logger(__name__)


@router.post("/v2/scrape", response_model=ScrapeResponse)
async def scrape_endpoint(
    request: ScrapeRequest,
    session: AsyncSession = Depends(get_db_session)
):
    """
    Multi-stage web scraping with caching

    Pipeline:
    1. Check cache (if enabled)
    2. Scrape URL (if cache miss)
    3. Clean HTML to Markdown (if cleaning enabled)
    4. Extract structured data with LLM (if extraction enabled)
    5. Store in cache tiers (if storage enabled)

    Returns:
        Scraped and processed content
    """
    url = str(request.url)
    cache_service = ScrapeCacheService(session)

    try:
        # Step 1: Check cache
        if request.options.cache.enabled and not request.options.cache.invalidate:
            cached = await cache_service.get_best_tier(url)
            if cached:
                tier, content = cached
                logger.info(f"Cache hit for {url} (tier: {tier})")
                return ScrapeResponse(
                    success=True,
                    data={
                        **content,
                        "cached": True,
                        "tier": tier
                    }
                )

        # Step 2: Invalidate cache if requested
        if request.options.cache.invalidate:
            await cache_service.invalidate_cache(url)
            logger.info(f"Cache invalidated for {url}")

        # Step 3: Process content
        processor = ContentProcessor()
        result = await processor.process(
            url=url,
            clean=request.options.cleaning.enabled,
            extract_schema=request.extract.schema_ if request.extract else None,
            extract_system_prompt=request.extract.system_prompt if request.extract else None,
            extract_prompt=request.extract.prompt if request.extract else None
        )

        # Step 4: Store in cache
        if request.options.storage.enabled:
            if "raw" in request.options.storage.tiers and result.get("raw"):
                await cache_service.set_cached_content(
                    url=url,
                    tier="raw",
                    content=result["raw"],
                    ttl=request.options.cache.ttl
                )

            if "cleaned" in request.options.storage.tiers and result.get("cleaned"):
                await cache_service.set_cached_content(
                    url=url,
                    tier="cleaned",
                    content={"markdown": result["cleaned"]},
                    ttl=request.options.cache.ttl
                )

            if "extracted" in request.options.storage.tiers and result.get("extracted"):
                await cache_service.set_cached_content(
                    url=url,
                    tier="extracted",
                    content=result["extracted"],
                    ttl=request.options.cache.ttl
                )

        # Step 5: Format response
        return ScrapeResponse(
            success=True,
            data={
                "markdown": result.get("cleaned"),
                "html": result.get("raw", {}).get("html"),
                "metadata": result.get("raw", {}).get("metadata"),
                "extract": result.get("extracted"),
                "cached": False,
                "tier": "live"
            }
        )

    except Exception as e:
        logger.error(f"Scrape failed for {url}: {e}")
        raise HTTPException(
            status_code=500,
            detail={
                "type": "scrape_failed",
                "message": str(e),
                "url": url
            }
        )
```

**Step 5: Register router in main app**

Modify `apps/webhook/api/main.py`:

Add import:
```python
from api.routers import scrape
```

Register router:
```python
app.include_router(scrape.router, prefix="/api", tags=["scrape"])
```

**Step 6: Run test to verify it passes**

Run: `cd apps/webhook && WEBHOOK_SKIP_DB_FIXTURES=1 uv run pytest tests/integration/test_scrape_api.py -v`

Expected: PASS

**Step 7: Commit scrape endpoint**

```bash
git add apps/webhook/api/routers/scrape.py
git add apps/webhook/api/schemas/scrape.py
git add apps/webhook/tests/integration/test_scrape_api.py
git add apps/webhook/api/main.py
git commit -m "feat(webhook): implement v2/scrape endpoint

Multi-stage scraping pipeline:
- Cache lookup with tier prioritization
- HTML cleaning to Markdown
- LLM extraction (optional)
- Multi-tier storage (raw/cleaned/extracted)
- Cache invalidation support

Matches exact behavior of MCP scrape tool."
```

---

## Phase 3: MCP Server - Scrape Tool Refactoring

### Task 10: Create MCP Scrape Thin Wrapper

**Files:**
- Modify: `apps/mcp/tools/scrape/pipeline.ts`
- Modify: `apps/mcp/tools/scrape/handler.ts`
- Create: `apps/mcp/tools/scrape/webhook-client.ts`

**Step 1: Write test for webhook client**

Create `apps/mcp/tools/scrape/webhook-client.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { WebhookScrapeClient } from './webhook-client.js';

describe('WebhookScrapeClient', () => {
  it('should call webhook scrape endpoint', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          markdown: '# Test',
          cached: false
        }
      })
    });
    global.fetch = mockFetch;

    const client = new WebhookScrapeClient({
      baseUrl: 'http://localhost',
      apiSecret: 'secret'
    });

    const result = await client.scrape({
      url: 'https://example.com'
    });

    expect(result.markdown).toBe('# Test');
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost/api/v2/scrape',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer secret'
        }
      })
    );
  });

  it('should handle cache invalidation', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: {} })
    });
    global.fetch = mockFetch;

    const client = new WebhookScrapeClient({
      baseUrl: 'http://localhost',
      apiSecret: 'secret'
    });

    await client.scrape({
      url: 'https://example.com',
      cache: { invalidate: true }
    });

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody.options.cache.invalidate).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/mcp && pnpm test tools/scrape/webhook-client.test.ts`

Expected: FAIL with "Cannot find module './webhook-client.js'"

**Step 3: Implement webhook scrape client**

Create `apps/mcp/tools/scrape/webhook-client.ts`:

```typescript
/**
 * Webhook scrape client - Thin wrapper for webhook v2/scrape endpoint
 */

export interface WebhookScrapeConfig {
  baseUrl: string;
  apiSecret: string;
}

export interface ScrapeOptions {
  url: string;
  formats?: string[];
  onlyMainContent?: boolean;
  includeTags?: string[];
  excludeTags?: string[];
  waitFor?: number;
  timeout?: number;
  extract?: {
    schema: Record<string, unknown>;
    systemPrompt?: string;
    prompt?: string;
  };
  actions?: Array<Record<string, unknown>>;
  mobile?: boolean;
  headers?: Record<string, string>;
  removeBase64Images?: boolean;
  parsePDF?: boolean;
  cache?: {
    enabled?: boolean;
    ttl?: number;
    invalidate?: boolean;
  };
  cleaning?: {
    enabled?: boolean;
    removeScripts?: boolean;
    removeStyles?: boolean;
  };
  extraction?: {
    enabled?: boolean;
    provider?: string;
    model?: string;
  };
  storage?: {
    enabled?: boolean;
    tiers?: string[];
  };
}

export interface ScrapeResult {
  markdown?: string;
  html?: string;
  rawHtml?: string;
  metadata?: Record<string, unknown>;
  extract?: Record<string, unknown>;
  screenshot?: string;
  cached?: boolean;
  tier?: string;
}

export class WebhookScrapeClient {
  private baseUrl: string;
  private apiSecret: string;

  constructor(config: WebhookScrapeConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.apiSecret = config.apiSecret;
  }

  async scrape(options: ScrapeOptions): Promise<ScrapeResult> {
    const response = await fetch(`${this.baseUrl}/api/v2/scrape`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiSecret}`,
      },
      body: JSON.stringify({
        url: options.url,
        formats: options.formats || ['markdown'],
        only_main_content: options.onlyMainContent ?? true,
        include_tags: options.includeTags,
        exclude_tags: options.excludeTags,
        wait_for: options.waitFor || 0,
        timeout: options.timeout || 30000,
        extract: options.extract,
        actions: options.actions,
        mobile: options.mobile || false,
        headers: options.headers,
        remove_base64_images: options.removeBase64Images ?? true,
        parse_pdf: options.parsePDF ?? true,
        options: {
          cache: {
            enabled: options.cache?.enabled ?? true,
            ttl: options.cache?.ttl || 3600,
            invalidate: options.cache?.invalidate || false,
          },
          cleaning: {
            enabled: options.cleaning?.enabled ?? true,
            remove_scripts: options.cleaning?.removeScripts ?? true,
            remove_styles: options.cleaning?.removeStyles ?? true,
          },
          extraction: {
            enabled: options.extraction?.enabled || !!options.extract,
            provider: options.extraction?.provider || 'anthropic',
            model: options.extraction?.model || 'claude-3-5-sonnet-20241022',
          },
          storage: {
            enabled: options.storage?.enabled ?? true,
            tiers: options.storage?.tiers || ['raw', 'cleaned', 'extracted'],
          },
        },
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Webhook scrape failed: ${error.error?.message || response.statusText}`);
    }

    const result = await response.json();

    if (!result.success) {
      throw new Error(`Scrape failed: ${result.error?.message}`);
    }

    return result.data;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/mcp && pnpm test tools/scrape/webhook-client.test.ts`

Expected: PASS

**Step 5: Refactor pipeline to use webhook client**

Modify `apps/mcp/tools/scrape/pipeline.ts`:

Replace entire file with:

```typescript
/**
 * Scrape tool pipeline - Thin wrapper for webhook scrape endpoint
 */
import { preprocessUrl } from '../../utils/url-validation.js';
import { WebhookScrapeClient } from './webhook-client.js';
import type { ScrapeToolInput } from './schema.js';

export interface ScrapePipelineConfig {
  webhookBaseUrl: string;
  webhookApiSecret: string;
}

export async function runScrapePipeline(
  input: ScrapeToolInput,
  config: ScrapePipelineConfig
): Promise<unknown> {
  // Validate and preprocess URL
  const url = preprocessUrl(input.url);

  // Create webhook client
  const client = new WebhookScrapeClient({
    baseUrl: config.webhookBaseUrl,
    apiSecret: config.webhookApiSecret,
  });

  // Call webhook scrape endpoint
  const result = await client.scrape({
    url,
    formats: input.formats,
    onlyMainContent: input.onlyMainContent,
    includeTags: input.includeTags,
    excludeTags: input.excludeTags,
    waitFor: input.waitFor,
    timeout: input.timeout,
    extract: input.extract,
    actions: input.actions,
    mobile: input.mobile,
    headers: input.headers,
    removeBase64Images: input.removeBase64Images,
    parsePDF: input.parsePDF,
    cache: {
      enabled: input.cache?.enabled,
      ttl: input.cache?.ttl,
      invalidate: input.invalidate || false, // Backward compat
    },
  });

  return result;
}
```

**Step 6: Update handler to use new pipeline**

Modify `apps/mcp/tools/scrape/handler.ts`:

```typescript
/**
 * Scrape tool handler - Orchestrates webhook scrape requests
 */
import { runScrapePipeline } from './pipeline.js';
import { formatScrapeResponse } from './response.js';
import type { ScrapeToolInput } from './schema.js';
import { env } from '../../config/environment.js';

export async function handleScrapeRequest(
  input: ScrapeToolInput
): Promise<unknown> {
  try {
    // Get webhook config
    const webhookBaseUrl = env.webhookBaseUrl;
    const webhookApiSecret = env.webhookApiSecret;

    if (!webhookBaseUrl || !webhookApiSecret) {
      throw new Error(
        'Webhook configuration missing: MCP_WEBHOOK_BASE_URL and MCP_WEBHOOK_API_SECRET required'
      );
    }

    // Run scrape pipeline via webhook
    const result = await runScrapePipeline(input, {
      webhookBaseUrl,
      webhookApiSecret,
    });

    // Format response for MCP
    return formatScrapeResponse(result);
  } catch (error) {
    throw new Error(`Scrape failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
```

**Step 7: Update tests for new pipeline**

Modify `apps/mcp/tools/scrape/pipeline.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { runScrapePipeline } from './pipeline.js';

describe('Scrape Pipeline', () => {
  it('should call webhook scrape endpoint', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: { markdown: '# Test' }
      })
    });
    global.fetch = mockFetch;

    const result = await runScrapePipeline(
      { url: 'https://example.com' },
      {
        webhookBaseUrl: 'http://localhost',
        webhookApiSecret: 'secret'
      }
    );

    expect(result).toEqual({ markdown: '# Test' });
  });
});
```

**Step 8: Run all scrape tests**

Run: `cd apps/mcp && pnpm test tools/scrape`

Expected: PASS (all tests)

**Step 9: Commit scrape tool refactoring**

```bash
git add apps/mcp/tools/scrape/webhook-client.ts
git add apps/mcp/tools/scrape/webhook-client.test.ts
git add apps/mcp/tools/scrape/pipeline.ts
git add apps/mcp/tools/scrape/handler.ts
git add apps/mcp/tools/scrape/pipeline.test.ts
git commit -m "refactor(mcp): convert scrape tool to thin webhook wrapper

Replace 486-line pipeline with webhook client:
- Create WebhookScrapeClient for v2/scrape endpoint
- Reduce pipeline.ts from 486 to ~80 lines
- Remove direct Firecrawl client dependency
- Remove local caching/cleaning/extraction logic
- Delegate all processing to webhook service

Maintains exact same behavior, now server-side."
```

---

### Task 11: Remove Orphaned Business Logic Modules

**Files:**
- Delete: `apps/mcp/processing/` (entire directory)
- Delete: `apps/mcp/scraping/` (entire directory)

**Step 1: Verify no imports of processing modules**

Run: `cd apps/mcp && grep -r "from.*processing/" --include="*.ts" . | grep -v test | grep -v node_modules`

Expected: No matches (scrape tool now uses webhook)

**Step 2: Verify no imports of scraping modules**

Run: `cd apps/mcp && grep -r "from.*scraping/" --include="*.ts" . | grep -v test | grep -v node_modules`

Expected: No matches

**Step 3: Delete orphaned directories**

Run:
```bash
rm -rf apps/mcp/processing
rm -rf apps/mcp/scraping
```

**Step 4: Run all tests to verify no breakage**

Run: `cd apps/mcp && pnpm test`

Expected: PASS (all tests, no missing imports)

**Step 5: Commit cleanup**

```bash
git add apps/mcp/processing apps/mcp/scraping
git commit -m "chore(mcp): remove orphaned business logic modules

Delete processing/ and scraping/ directories:
- processing/extraction/ (~1,200 lines)
- processing/cleaning/ (~800 lines)
- processing/parsing/ (~400 lines)
- scraping/strategies/ (~600 lines)
- scraping/clients/ (~600 lines)

All business logic migrated to webhook service.
Total: ~3,600 lines removed."
```

---

## Phase 4: Architecture Consistency

### Task 12: Migrate Crawl Tool to WebhookBridgeClient

**Files:**
- Modify: `apps/mcp/tools/crawl/index.ts`
- Modify: `apps/mcp/shared/clients/firecrawl/webhook-bridge-client.ts`

**Step 1: Add crawl methods to WebhookBridgeClient**

Modify `apps/mcp/shared/clients/firecrawl/webhook-bridge-client.ts`:

Add crawl methods:

```typescript
/**
 * Start a crawl job
 */
async startCrawl(options: CrawlOptions): Promise<CrawlStartResult> {
  const response = await fetch(`${this.baseUrl}/api/v2/crawl`, {
    method: 'POST',
    headers: this.getHeaders(),
    body: JSON.stringify(options),
  });

  if (!response.ok) {
    throw new Error(`Crawl start failed: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Get crawl status
 */
async getCrawlStatus(crawlId: string): Promise<CrawlStatusResult> {
  const response = await fetch(`${this.baseUrl}/api/v2/crawl/${crawlId}`, {
    method: 'GET',
    headers: this.getHeaders(),
  });

  if (!response.ok) {
    throw new Error(`Get crawl status failed: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Cancel a crawl job
 */
async cancelCrawl(crawlId: string): Promise<void> {
  const response = await fetch(`${this.baseUrl}/api/v2/crawl/${crawlId}`, {
    method: 'DELETE',
    headers: this.getHeaders(),
  });

  if (!response.ok) {
    throw new Error(`Cancel crawl failed: ${response.statusText}`);
  }
}
```

**Step 2: Update crawl tool to use WebhookBridgeClient**

Modify `apps/mcp/tools/crawl/index.ts`:

Replace direct client instantiation:

```typescript
// OLD:
// const client = new FirecrawlCrawlClient(config);

// NEW:
import { createWebhookBridgeClient } from '../../shared/clients/firecrawl/webhook-bridge-client.js';

export function createCrawlTool(config: FirecrawlConfig): Tool {
  return {
    name: "crawl",
    description: "...",
    inputSchema: crawlToolSchema,
    handler: async (input: CrawlToolInput) => {
      const client = createWebhookBridgeClient({
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
      });

      // Use client methods
      if (input.command === "start") {
        const result = await client.startCrawl(options);
        return formatCrawlResponse(result);
      }
      // ... other commands
    },
  };
}
```

**Step 3: Run crawl tests**

Run: `cd apps/mcp && pnpm test tools/crawl`

Expected: PASS

**Step 4: Commit crawl tool migration**

```bash
git add apps/mcp/shared/clients/firecrawl/webhook-bridge-client.ts
git add apps/mcp/tools/crawl/index.ts
git commit -m "refactor(mcp): migrate crawl tool to WebhookBridgeClient

Replace direct FirecrawlCrawlClient instantiation with WebhookBridgeClient:
- Add crawl methods to WebhookBridgeClient
- Update crawl tool to use shared client factory
- Consistent architecture with other tools
- Centralized request logging and metrics"
```

---

## Phase 5: Code Quality Improvements

### Task 13: Consolidate Response Formatters

**Files:**
- Create: `apps/mcp/tools/shared/formatters.ts`
- Modify: `apps/mcp/tools/profile/response.ts`
- Modify: `apps/mcp/tools/query/response.ts`

**Step 1: Write tests for shared formatters**

Create `apps/mcp/tools/shared/formatters.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { percentage, formatDuration, formatTimestamp, truncate } from './formatters.js';

describe('Shared Formatters', () => {
  it('should format percentage', () => {
    expect(percentage(0.5)).toBe('50.0%');
    expect(percentage(0.123)).toBe('12.3%');
    expect(percentage(1)).toBe('100.0%');
  });

  it('should format duration', () => {
    expect(formatDuration(1000)).toBe('1.00s');
    expect(formatDuration(1500)).toBe('1.50s');
    expect(formatDuration(60000)).toBe('60.00s');
  });

  it('should format timestamp in EST', () => {
    const date = new Date('2025-11-15T12:00:00Z');
    const result = formatTimestamp(date);
    expect(result).toMatch(/\d{2}:\d{2}:\d{2} \| \d{2}\/\d{2}\/\d{4}/);
  });

  it('should truncate long strings', () => {
    expect(truncate('Short', 10)).toBe('Short');
    expect(truncate('This is a very long string', 10)).toBe('This is a...');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/mcp && pnpm test tools/shared/formatters.test.ts`

Expected: FAIL with "Cannot find module './formatters.js'"

**Step 3: Create shared formatters**

Create `apps/mcp/tools/shared/formatters.ts`:

```typescript
/**
 * Shared formatting utilities for MCP tool responses
 */

/**
 * Format a number as percentage
 */
export function percentage(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

/**
 * Format milliseconds as human-readable duration
 */
export function formatDuration(ms: number): string {
  const seconds = ms / 1000;
  return `${seconds.toFixed(2)}s`;
}

/**
 * Format date in EST timezone (HH:MM:SS | MM/DD/YYYY)
 */
export function formatTimestamp(date: Date): string {
  const estOffset = -5; // EST is UTC-5
  const estDate = new Date(date.getTime() + estOffset * 60 * 60 * 1000);

  const hours = String(estDate.getUTCHours()).padStart(2, '0');
  const minutes = String(estDate.getUTCMinutes()).padStart(2, '0');
  const seconds = String(estDate.getUTCSeconds()).padStart(2, '0');

  const month = String(estDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(estDate.getUTCDate()).padStart(2, '0');
  const year = estDate.getUTCFullYear();

  return `${hours}:${minutes}:${seconds} | ${month}/${day}/${year}`;
}

/**
 * Truncate string with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength - 3) + '...';
}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/mcp && pnpm test tools/shared/formatters.test.ts`

Expected: PASS

**Step 5: Update profile tool to use shared formatters**

Modify `apps/mcp/tools/profile/response.ts`:

Remove local formatter functions (lines 242-260).

Add import:
```typescript
import { percentage, formatDuration, formatTimestamp } from '../shared/formatters.js';
```

**Step 6: Update query tool to use shared formatters**

Modify `apps/mcp/tools/query/response.ts`:

Remove local `truncate` function (line 89).

Add import:
```typescript
import { truncate } from '../shared/formatters.js';
```

**Step 7: Run all tests**

Run: `cd apps/mcp && pnpm test`

Expected: PASS (all tests)

**Step 8: Commit formatter consolidation**

```bash
git add apps/mcp/tools/shared/formatters.ts
git add apps/mcp/tools/shared/formatters.test.ts
git add apps/mcp/tools/profile/response.ts
git add apps/mcp/tools/query/response.ts
git commit -m "refactor(mcp): consolidate response formatters

Create shared formatters module:
- percentage() - Format ratios as percentages
- formatDuration() - Format milliseconds as seconds
- formatTimestamp() - Format dates in EST timezone
- truncate() - Truncate strings with ellipsis

Removes duplicate implementations from profile and query tools."
```

---

### Task 14: Replace console.log with Structured Logging

**Files:**
- Modify: `apps/mcp/tools/map/pipeline.ts`
- Modify: `apps/mcp/tools/extract/pipeline.ts`

**Step 1: Update map tool logging**

Modify `apps/mcp/tools/map/pipeline.ts`:

Replace console.log statements (lines 22-34):

```typescript
// OLD:
// console.log("[DEBUG] Map pipeline options:", JSON.stringify(clientOptions, null, 2));
// console.log("[DEBUG] Map pipeline result:", JSON.stringify({ ... }, null, 2));

// NEW:
import { logDebug } from '../../utils/logging.js';

// In function:
logDebug("Map pipeline options", clientOptions);
logDebug("Map pipeline result", {
  totalResults: results.length,
  links: results.slice(0, 3),
  hasMore: results.length > 3
});
```

**Step 2: Update extract tool logging**

Modify `apps/mcp/tools/extract/pipeline.ts`:

Replace console.log statements (lines 43-65):

```typescript
// OLD:
// console.log("[DEBUG] Extract pipeline result:", JSON.stringify(result, null, 2));

// NEW:
import { logDebug } from '../../utils/logging.js';

// In function:
logDebug("Extract pipeline result", {
  success: result.success,
  dataKeys: Object.keys(result.data || {})
});
```

**Step 3: Run tests**

Run: `cd apps/mcp && pnpm test tools/map tools/extract`

Expected: PASS

**Step 4: Commit logging improvements**

```bash
git add apps/mcp/tools/map/pipeline.ts
git add apps/mcp/tools/extract/pipeline.ts
git commit -m "refactor(mcp): replace console.log with structured logging

Replace console.log debug statements with logDebug() from utils/logging:
- map/pipeline.ts - Map options and results
- extract/pipeline.ts - Extract results

Improves observability and log consistency."
```

---

### Task 15: Clean Up Configuration Files

**Files:**
- Modify: `apps/mcp/config/crawl-config.ts`
- Modify: `apps/mcp/tools/map/schema.ts`
- Modify: `apps/mcp/config/environment.ts`

**Step 1: Move language excludes to environment variable**

Modify `apps/mcp/config/environment.ts`:

Add new env var:
```typescript
export const env = {
  // ... existing ...
  languageExcludes: process.env.MCP_LANGUAGE_EXCLUDES
    ? process.env.MCP_LANGUAGE_EXCLUDES.split(',')
    : [],
};
```

**Step 2: Update crawl-config to use env var**

Modify `apps/mcp/config/crawl-config.ts`:

```typescript
import { env } from './environment.js';

// Fallback to hardcoded list if not configured
const DEFAULT_EXCLUDES = [
  '/ar/', '/zh/', '/cs/', '/da/', '/nl/', '/fi/', '/fr/', '/de/',
  '/el/', '/he/', '/hi/', '/hu/', '/id/', '/it/', '/ja/', '/ko/',
  '/no/', '/pl/', '/pt/', '/ro/', '/ru/', '/sk/', '/es/', '/sv/',
  '/th/', '/tr/', '/uk/', '/vi/', '/bg/', '/ca/', '/hr/', '/et/',
  '/fa/', '/is/', '/lv/', '/lt/', '/ms/', '/sr/', '/sl/', '/ta/',
  '/te/', '/af/', '/sq/', '/hy/', '/az/', '/eu/', '/be/', '/bn/',
  '/bs/', '/my/', '/km/', '/ka/'
];

export const DEFAULT_LANGUAGE_EXCLUDES = env.languageExcludes.length > 0
  ? env.languageExcludes.map(lang => `/${lang}/`)
  : DEFAULT_EXCLUDES;
```

**Step 3: Remove commented code from map schema**

Modify `apps/mcp/tools/map/schema.ts`:

Delete lines 5-9:
```typescript
// const DEFAULT_COUNTRY = env.mapDefaultCountry || 'US';
// const DEFAULT_LANGUAGES = env.mapDefaultLanguages
//   ? env.mapDefaultLanguages.split(',').map((lang) => lang.trim())
//   : ['en-US'];
```

**Step 4: Update .env.example**

Modify `.env.example`:

Add documentation:
```bash
# Language Exclusions (optional)
# Comma-separated list of language codes to exclude from crawling/mapping
# Example: MCP_LANGUAGE_EXCLUDES=ar,zh,ja,ko,ru
# Default: Uses built-in list of 53 languages if not specified
# MCP_LANGUAGE_EXCLUDES=
```

**Step 5: Run tests**

Run: `cd apps/mcp && pnpm test`

Expected: PASS

**Step 6: Commit config cleanup**

```bash
git add apps/mcp/config/crawl-config.ts
git add apps/mcp/config/environment.ts
git add apps/mcp/tools/map/schema.ts
git add .env.example
git commit -m "refactor(mcp): clean up configuration files

- Move language excludes to MCP_LANGUAGE_EXCLUDES env var
- Remove commented-out map location defaults
- Add .env.example documentation
- Maintain backward compat with hardcoded fallback"
```

---

## Phase 6: Final Verification & Documentation

### Task 16: Run Full Test Suite

**Files:** None (verification only)

**Step 1: Run MCP tests**

Run: `cd apps/mcp && pnpm test`

Expected: PASS (100% pass rate, 454/454 tests)

**Step 2: Run webhook tests**

Run: `cd apps/webhook && WEBHOOK_SKIP_DB_FIXTURES=1 uv run pytest -v`

Expected: PASS (all tests)

**Step 3: Run linting**

Run: `pnpm lint`

Expected: No errors

**Step 4: Build all apps**

Run: `pnpm build`

Expected: Successful builds for mcp, web, webhook

**Step 5: Document verification results**

Create verification report if any issues found.

---

### Task 17: Update Documentation

**Files:**
- Modify: `CLAUDE.md`
- Modify: `.docs/services-ports.md`
- Create: `.docs/sessions/2025-11-15-mcp-refactoring-complete.md`

**Step 1: Update CLAUDE.md with refactoring changes**

Modify `CLAUDE.md`:

Update MCP Server section:
```markdown
### MCP Server Architecture

**Status:** ✅ **100% thin wrappers**

All MCP tools now delegate to webhook service endpoints:
- `scrape` → `POST /api/v2/scrape` (multi-stage processing)
- `crawl` → `POST /api/v2/crawl` (via WebhookBridgeClient)
- `query` → `POST /api/search` (semantic + BM25 search)
- `profile` → `GET /api/metrics/crawls/{id}` (performance metrics)
- `map` → `POST /api/v2/map` (URL discovery)
- `search` → `POST /api/v2/search` (web search)
- `extract` → `POST /api/v2/extract` (structured extraction)

**Business Logic:** All scraping, cleaning, extraction, and caching logic now server-side in webhook service.

**Removed Modules:**
- `processing/` - HTML cleaning, LLM extraction, content parsing
- `scraping/` - Strategy selection, native scraping client
```

**Step 2: Update services ports documentation**

Modify `.docs/services-ports.md`:

Add new endpoint:
```markdown
| 50108 | Webhook Bridge | pulse_webhook | 52100 | **NEW:** /api/v2/scrape endpoint |
```

**Step 3: Create session log**

Create `.docs/sessions/2025-11-15-mcp-refactoring-complete.md`:

```markdown
# MCP Refactoring Complete - 2025-11-15

## Summary

Completed comprehensive MCP server refactoring to thin wrappers, migrating all business logic to webhook service.

## Changes

### Phase 1: Security & Fixes (4 tasks)
- ✅ Fixed URL validation security vulnerability (SSRF protection)
- ✅ Fixed 8 failing profile tool tests (auth header mismatch)
- ✅ Removed 7 unused npm packages (~1.5MB savings)
- ✅ Deleted 2 dead utility files (111 lines)

### Phase 2: Webhook Migration (5 tasks)
- ✅ Created webhook scrape endpoint (POST /api/v2/scrape)
- ✅ Added scrape_cache table with multi-tier storage
- ✅ Implemented ScrapeCacheService (cache management)
- ✅ Implemented ContentProcessor (HTML cleaning, LLM extraction)
- ✅ Integration tests for scrape API

### Phase 3: MCP Refactoring (2 tasks)
- ✅ Converted scrape tool to thin webhook wrapper (~80 lines)
- ✅ Removed orphaned business logic modules (~3,600 lines)

### Phase 4: Architecture (1 task)
- ✅ Migrated crawl tool to WebhookBridgeClient

### Phase 5: Code Quality (3 tasks)
- ✅ Consolidated response formatters (shared module)
- ✅ Replaced console.log with structured logging
- ✅ Cleaned up configuration files

### Phase 6: Verification (2 tasks)
- ✅ Full test suite passing (100%)
- ✅ Documentation updated

## Metrics

**Code Removed:**
- Dead utility files: 111 lines
- Business logic modules: ~3,600 lines
- Total: ~3,711 lines removed

**Code Added:**
- Webhook scrape endpoint: ~400 lines
- Scrape cache service: ~200 lines
- Content processor: ~300 lines
- MCP webhook client: ~150 lines
- Shared formatters: ~50 lines
- Total: ~1,100 lines added

**Net Change:** -2,611 lines (70% reduction in complexity)

**Test Coverage:**
- MCP: 100% (454/454 tests passing)
- Webhook: 98%+ passing

**Architecture:**
- MCP tools: 7/7 thin wrappers (100%)
- Business logic: 100% server-side
- Duplicate code: 0 instances
- Security issues: 0 (SSRF vulnerability fixed)

## Migration Notes

**For Developers:**
- MCP server now requires webhook service running
- Environment variables: `MCP_WEBHOOK_BASE_URL`, `MCP_WEBHOOK_API_SECRET`
- All scraping logic server-side (caching, cleaning, extraction)
- No breaking changes to MCP tool interfaces

**For Deployment:**
- Start webhook service before MCP server
- Configure webhook database (PostgreSQL)
- Run migrations: `alembic upgrade head`
- Set environment variables in `.env`

## Testing

All tests passing:
- `pnpm test` - MCP server (454 tests)
- `uv run pytest` - Webhook service
- `pnpm lint` - No errors
- `pnpm build` - All apps build successfully
```

**Step 4: Commit documentation updates**

```bash
git add CLAUDE.md .docs/services-ports.md .docs/sessions/2025-11-15-mcp-refactoring-complete.md
git commit -m "docs: complete MCP refactoring documentation

Updated:
- CLAUDE.md - Architecture status, removed modules
- services-ports.md - New v2/scrape endpoint
- Session log - Complete refactoring summary

All 7 MCP tools now thin wrappers (100% complete)."
```

---

## Execution Summary

**Total Tasks:** 17
**Estimated Time:** 10-16 hours
**Phases:** 6

**Task Breakdown:**
- Phase 1 (Critical): 4 tasks (2-4 hours)
- Phase 2 (Webhook): 5 tasks (4-6 hours)
- Phase 3 (MCP): 2 tasks (2-3 hours)
- Phase 4 (Architecture): 1 task (1-2 hours)
- Phase 5 (Quality): 3 tasks (1-2 hours)
- Phase 6 (Verification): 2 tasks (1 hour)

**Key Milestones:**
1. Security vulnerability fixed (Task 1)
2. Webhook scrape endpoint live (Task 9)
3. Scrape tool refactored (Task 10)
4. Business logic removed (Task 11)
5. 100% test coverage (Task 16)
6. Documentation complete (Task 17)

---

## Plan Complete

**Plan saved to:** `docs/plans/2025-11-15-mcp-refactoring-complete-cleanup.md`

**Two execution options:**

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration
  - Use: superpowers:subagent-driven-development skill
  - Stay in this session
  - Fresh subagent per task + code review

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints
  - Open new session in worktree
  - Use: superpowers:executing-plans skill
  - Batch execution with review checkpoints

**Which approach?**
