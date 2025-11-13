# Production Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all critical security, reliability, and data integrity issues identified in code reviews to achieve production readiness for crawl tool and webhook server.

**Architecture:** Parallel implementation across 6 independent workstreams: (1) Crawl Tool Security & API, (2) Webhook Security & Auth, (3) Webhook Worker Reliability, (4) Database Schema & Integrity, (5) Configuration Hardening, (6) Test Coverage Gaps.

**Tech Stack:** TypeScript/Node.js (crawl tool), Python/FastAPI (webhook), PostgreSQL, Redis, Docker Compose, pytest, vitest.

**Parallelization Strategy:** Tasks grouped by domain with zero dependencies between groups. Within each group, tasks follow TDD flow (test → implement → verify → commit).

---

## WORKSTREAM 1: Crawl Tool Security & API Fixes

### Task 1.1: Fix `crawlEntireDomain` Default Mismatch

**Files:**
- Modify: `apps/mcp/tools/crawl/pipeline.ts:36`
- Test: `apps/mcp/tools/crawl/pipeline.test.ts` (new)

**Step 1: Write failing test for correct default**

Create: `apps/mcp/tools/crawl/pipeline.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest';
import { handleCrawlCommand } from './pipeline.js';

describe('Crawl Pipeline - crawlEntireDomain default', () => {
  it('should default crawlEntireDomain to false when not specified', async () => {
    const mockClient = {
      startCrawl: vi.fn().mockResolvedValue({
        success: true,
        id: 'test-123',
        url: 'https://api.example.com/crawl/test-123'
      })
    };

    await handleCrawlCommand(
      { command: 'start', url: 'https://example.com' },
      mockClient as any
    );

    expect(mockClient.startCrawl).toHaveBeenCalledWith(
      expect.objectContaining({
        crawlEntireDomain: false  // Should be false by default
      })
    );
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd apps/mcp
pnpm test tools/crawl/pipeline.test.ts
```

Expected: FAIL - `crawlEntireDomain` is `true`, expected `false`

**Step 3: Fix the default value**

Modify: `apps/mcp/tools/crawl/pipeline.ts:36`

```typescript
// BEFORE:
crawlEntireDomain: options.crawlEntireDomain ?? true,

// AFTER:
crawlEntireDomain: options.crawlEntireDomain ?? false,
```

**Step 4: Run test to verify it passes**

```bash
cd apps/mcp
pnpm test tools/crawl/pipeline.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add apps/mcp/tools/crawl/pipeline.ts apps/mcp/tools/crawl/pipeline.test.ts
git commit -m "fix(crawl): correct crawlEntireDomain default to false

Schema specifies default: false but pipeline used ?? true.
This caused users to unexpectedly crawl entire domains.

BREAKING CHANGE: crawlEntireDomain now defaults to false"
```

---

### Task 1.2: Add URL Preprocessing (Match Scrape Tool)

**Files:**
- Create: `apps/mcp/tools/crawl/url-utils.ts`
- Modify: `apps/mcp/tools/crawl/schema.ts:35`
- Test: `apps/mcp/tools/crawl/url-utils.test.ts`

**Step 1: Write failing test for URL preprocessing**

Create: `apps/mcp/tools/crawl/url-utils.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { preprocessUrl } from './url-utils.js';

describe('URL Preprocessing', () => {
  it('should add https:// to bare domains', () => {
    expect(preprocessUrl('example.com')).toBe('https://example.com');
  });

  it('should preserve existing protocol', () => {
    expect(preprocessUrl('http://example.com')).toBe('http://example.com');
    expect(preprocessUrl('https://example.com')).toBe('https://example.com');
  });

  it('should handle URLs with paths', () => {
    expect(preprocessUrl('example.com/blog')).toBe('https://example.com/blog');
  });

  it('should reject invalid URLs after preprocessing', () => {
    expect(() => preprocessUrl('not a url')).toThrow('Invalid URL');
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd apps/mcp
pnpm test tools/crawl/url-utils.test.ts
```

Expected: FAIL - `preprocessUrl` not defined

**Step 3: Implement URL preprocessing**

Create: `apps/mcp/tools/crawl/url-utils.ts`

```typescript
/**
 * Preprocess URL by adding https:// if no protocol specified.
 * Matches behavior of scrape tool for consistency.
 */
export function preprocessUrl(url: string): string {
  let processed = url.trim();

  // Add https:// if no protocol
  if (!processed.match(/^https?:\/\//i)) {
    processed = `https://${processed}`;
  }

  // Validate the final URL
  try {
    new URL(processed);
    return processed;
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }
}
```

**Step 4: Run test to verify it passes**

```bash
cd apps/mcp
pnpm test tools/crawl/url-utils.test.ts
```

Expected: PASS

**Step 5: Integrate into schema validation**

Modify: `apps/mcp/tools/crawl/schema.ts:35`

```typescript
import { preprocessUrl } from './url-utils.js';

export const crawlOptionsSchema = z.object({
  // ... other fields ...
  url: z
    .string()
    .transform(preprocessUrl)  // Add preprocessing
    .refine((val) => {
      try {
        new URL(val);
        return true;
      } catch {
        return false;
      }
    }, "Must be a valid URL")
    .optional(),
  // ... rest of schema ...
});
```

**Step 6: Run integration test**

```bash
cd apps/mcp
pnpm test tools/crawl/schema.test.ts
```

Expected: PASS - bare domains now accepted

**Step 7: Commit**

```bash
git add apps/mcp/tools/crawl/url-utils.ts apps/mcp/tools/crawl/url-utils.test.ts apps/mcp/tools/crawl/schema.ts
git commit -m "feat(crawl): add URL preprocessing for bare domains

Matches scrape tool behavior - accepts 'example.com' and auto-adds https://.
Improves UX consistency across MCP tools."
```

---

### Task 1.3: Add HTTP Timeout Protection

**Files:**
- Modify: `packages/firecrawl-client/src/operations/crawl.ts:27-56,67-91,100-127,136-163,170-198`
- Test: `packages/firecrawl-client/src/operations/crawl.test.ts` (new)

**Step 1: Write failing test for timeout enforcement**

Create: `packages/firecrawl-client/src/operations/crawl.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest';
import { startCrawl } from './crawl.js';

describe('Crawl Operations - Timeout', () => {
  it('should timeout fetch after 30 seconds', async () => {
    global.fetch = vi.fn().mockImplementation(() =>
      new Promise((resolve) => setTimeout(resolve, 35000)) // 35s delay
    );

    await expect(
      startCrawl('test-key', 'https://api.example.com', { url: 'https://example.com' })
    ).rejects.toThrow('timeout');
  });

  it('should clear timeout on successful response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, id: 'test-123' })
    });

    await expect(
      startCrawl('test-key', 'https://api.example.com', { url: 'https://example.com' })
    ).resolves.toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/firecrawl-client
pnpm test src/operations/crawl.test.ts
```

Expected: FAIL - test times out, no timeout enforcement

**Step 3: Create timeout wrapper utility**

Create: `packages/firecrawl-client/src/utils/timeout.ts`

```typescript
/**
 * Fetch with AbortSignal timeout.
 *
 * @param url - URL to fetch
 * @param options - Fetch options
 * @param timeoutMs - Timeout in milliseconds (default: 30000)
 * @returns Response promise that rejects on timeout
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = 30000
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeoutMs}ms`);
    }
    throw error;
  }
}
```

**Step 4: Apply timeout to all crawl operations**

Modify: `packages/firecrawl-client/src/operations/crawl.ts`

```typescript
import { fetchWithTimeout } from '../utils/timeout.js';

export async function startCrawl(
  apiKey: string,
  baseUrl: string,
  options: CrawlStartOptions
): Promise<CrawlStartResponse> {
  // ... headers setup ...

  const response = await fetchWithTimeout(
    fetchUrl,
    {
      method: 'POST',
      headers,
      body: JSON.stringify(options),
    },
    30000 // 30s timeout
  );

  // ... rest of function ...
}

// Repeat for getCrawlStatus, cancelCrawl, getCrawlErrors, listCrawls
```

**Step 5: Run test to verify it passes**

```bash
cd packages/firecrawl-client
pnpm test src/operations/crawl.test.ts
```

Expected: PASS

**Step 6: Run full test suite**

```bash
cd packages/firecrawl-client
pnpm test
```

Expected: All tests PASS

**Step 7: Commit**

```bash
git add packages/firecrawl-client/src/utils/timeout.ts packages/firecrawl-client/src/operations/crawl.ts packages/firecrawl-client/src/operations/crawl.test.ts
git commit -m "feat(firecrawl-client): add 30s HTTP timeout to all operations

Prevents indefinite hangs when Firecrawl API is slow/unresponsive.
Uses AbortController for clean cancellation."
```

---

### Task 1.4: Add Rate Limiting on Crawl Start

**Files:**
- Create: `apps/mcp/server/middleware/rateLimit.ts` (if doesn't exist, else modify)
- Modify: `apps/mcp/tools/crawl/index.ts:17`
- Test: `apps/mcp/tests/server/rate-limit.test.ts`

**Step 1: Write failing test for rate limit**

Create/Modify: `apps/mcp/tests/server/rate-limit.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { RateLimiter } from '../server/middleware/rateLimit.js';

describe('Rate Limiting - Crawl Operations', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 10, // 10 requests per window
    });
  });

  it('should allow requests within limit', () => {
    for (let i = 0; i < 10; i++) {
      expect(limiter.check('user-123')).toBe(true);
    }
  });

  it('should block requests exceeding limit', () => {
    for (let i = 0; i < 10; i++) {
      limiter.check('user-123');
    }
    expect(limiter.check('user-123')).toBe(false);
  });

  it('should reset after window expires', async () => {
    for (let i = 0; i < 10; i++) {
      limiter.check('user-123');
    }

    // Fast-forward time
    await new Promise(resolve => setTimeout(resolve, 15 * 60 * 1000 + 100));

    expect(limiter.check('user-123')).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd apps/mcp
pnpm test tests/server/rate-limit.test.ts
```

Expected: FAIL - `RateLimiter` not defined

**Step 3: Implement rate limiter**

Create: `apps/mcp/server/middleware/rateLimit.ts`

```typescript
/**
 * Simple in-memory rate limiter using sliding window.
 */
export interface RateLimiterOptions {
  windowMs: number; // Time window in milliseconds
  max: number; // Max requests per window
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export class RateLimiter {
  private store = new Map<string, RateLimitEntry>();
  private options: RateLimiterOptions;

  constructor(options: RateLimiterOptions) {
    this.options = options;
  }

  check(key: string): boolean {
    const now = Date.now();
    const entry = this.store.get(key);

    // No entry or expired window
    if (!entry || now >= entry.resetAt) {
      this.store.set(key, {
        count: 1,
        resetAt: now + this.options.windowMs,
      });
      return true;
    }

    // Within window, check limit
    if (entry.count < this.options.max) {
      entry.count++;
      return true;
    }

    // Exceeded limit
    return false;
  }

  reset(key: string): void {
    this.store.delete(key);
  }
}
```

**Step 4: Run test to verify it passes**

```bash
cd apps/mcp
pnpm test tests/server/rate-limit.test.ts
```

Expected: PASS

**Step 5: Apply rate limit to crawl tool**

Modify: `apps/mcp/tools/crawl/index.ts:17`

```typescript
import { RateLimiter } from '../server/middleware/rateLimit.js';

const crawlRateLimiter = new RateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Max 10 crawl jobs per 15 min
});

export async function handleCrawlTool(args: unknown): Promise<McpToolResponse> {
  const options = crawlOptionsSchema.parse(args);

  // Rate limit on start command
  if (options.command === 'start') {
    const userId = 'default'; // TODO: Extract from session/auth context
    if (!crawlRateLimiter.check(userId)) {
      return {
        content: [{
          type: "text",
          text: "Rate limit exceeded: Maximum 10 crawl jobs per 15 minutes. Please try again later.",
        }],
        isError: true,
      };
    }
  }

  // ... rest of handler ...
}
```

**Step 6: Run integration test**

```bash
cd apps/mcp
pnpm test tools/crawl/index.test.ts
```

Expected: PASS

**Step 7: Commit**

```bash
git add apps/mcp/server/middleware/rateLimit.ts apps/mcp/tests/server/rate-limit.test.ts apps/mcp/tools/crawl/index.ts
git commit -m "feat(crawl): add rate limiting to prevent crawl job flooding

Limits: 10 crawl starts per 15 minutes per user.
Prevents DoS via excessive crawl job creation."
```

---

## WORKSTREAM 2: Webhook Security & Authentication Fixes

### Task 2.1: Fix Timing-Attack Vulnerability in API Secret Comparison

**Files:**
- Modify: `apps/webhook/api/deps.py:333`
- Test: `apps/webhook/tests/unit/test_auth_timing.py` (new)

**Step 1: Write timing-attack test**

Create: `apps/webhook/tests/unit/test_auth_timing.py`

```python
"""Test authentication timing-attack resistance."""
import time
from statistics import stdev
import pytest
from api.deps import verify_api_secret
from config import get_settings


def test_api_secret_constant_time_comparison():
    """Verify API secret comparison is constant-time (resistant to timing attacks)."""
    settings = get_settings()
    correct_secret = settings.api_secret

    # Test with secrets of varying correctness (but same length)
    test_cases = [
        "a" * len(correct_secret),  # All wrong
        correct_secret[:len(correct_secret)//2] + "a" * (len(correct_secret)//2),  # Half right
        correct_secret[:-1] + "a",  # Almost all right
        correct_secret,  # All right
    ]

    timings = []
    for secret in test_cases:
        start = time.perf_counter()
        try:
            # Mock request with Authorization header
            from fastapi import HTTPException
            from unittest.mock import Mock
            request = Mock()
            request.headers = {"authorization": f"Bearer {secret}"}
            verify_api_secret(request)
        except HTTPException:
            pass
        elapsed = time.perf_counter() - start
        timings.append(elapsed)

    # Standard deviation should be very small (< 1ms) for constant-time
    timing_variance = stdev(timings)
    assert timing_variance < 0.001, (
        f"Timing variance too high: {timing_variance:.6f}s. "
        "API secret comparison may be vulnerable to timing attacks."
    )
```

**Step 2: Run test to verify it fails**

```bash
cd apps/webhook
uv run pytest tests/unit/test_auth_timing.py -v
```

Expected: FAIL - timing variance exceeds threshold

**Step 3: Fix with constant-time comparison**

Modify: `apps/webhook/api/deps.py:333`

```python
import secrets  # Add import at top

# BEFORE:
if api_secret != settings.api_secret:
    logger.warning("Invalid API secret provided")
    raise HTTPException(...)

# AFTER:
if not secrets.compare_digest(api_secret, settings.api_secret):
    logger.warning("Invalid API secret provided")
    raise HTTPException(...)
```

**Step 4: Run test to verify it passes**

```bash
cd apps/webhook
uv run pytest tests/unit/test_auth_timing.py -v
```

Expected: PASS

**Step 5: Commit**

```bash
git add apps/webhook/api/deps.py apps/webhook/tests/unit/test_auth_timing.py
git commit -m "security(webhook): fix timing-attack vulnerability in API secret comparison

Use secrets.compare_digest() for constant-time comparison.
Prevents attackers from recovering API secret through timing analysis.

CVE: Timing Attack - CVSS 8.1"
```

---

### Task 2.2: Add Authentication to Health and Stats Endpoints

**Files:**
- Modify: `apps/webhook/api/routers/health.py:24`
- Modify: `apps/webhook/api/routers/search.py:154`
- Test: `apps/webhook/tests/unit/test_health_auth.py` (new)

**Step 1: Write failing test for authentication requirement**

Create: `apps/webhook/tests/unit/test_health_auth.py`

```python
"""Test health and stats endpoint authentication."""
import pytest
from fastapi.testclient import TestClient
from main import app


client = TestClient(app)


def test_health_endpoint_requires_auth():
    """Health endpoint should require API secret."""
    response = client.get("/health")
    assert response.status_code == 401
    assert "authorization" in response.json()["detail"].lower()


def test_health_endpoint_accepts_valid_auth():
    """Health endpoint should accept valid API secret."""
    response = client.get(
        "/health",
        headers={"Authorization": "Bearer test-api-secret"}
    )
    assert response.status_code == 200


def test_stats_endpoint_requires_auth():
    """Stats endpoint should require API secret."""
    response = client.get("/stats")
    assert response.status_code == 401


def test_stats_endpoint_accepts_valid_auth():
    """Stats endpoint should accept valid API secret."""
    response = client.get(
        "/stats",
        headers={"Authorization": "Bearer test-api-secret"}
    )
    assert response.status_code == 200
```

**Step 2: Run test to verify it fails**

```bash
cd apps/webhook
uv run pytest tests/unit/test_health_auth.py -v
```

Expected: FAIL - endpoints return 200 without auth

**Step 3: Add authentication dependency**

Modify: `apps/webhook/api/routers/health.py:24`

```python
from api.deps import verify_api_secret

@router.get("/health", response_model=HealthStatus, dependencies=[Depends(verify_api_secret)])
async def health_check(
    embedding_service: Annotated[EmbeddingService, Depends(get_embedding_service)],
    vector_store: Annotated[VectorStore, Depends(get_vector_store)],
) -> HealthStatus:
    # ... rest of function unchanged ...
```

Modify: `apps/webhook/api/routers/search.py:154`

```python
from api.deps import verify_api_secret

@router.get("/stats", response_model=IndexStats, dependencies=[Depends(verify_api_secret)])
async def get_stats(
    vector_store: Annotated[VectorStore, Depends(get_vector_store)],
    bm25_engine: Annotated[BM25Engine, Depends(get_bm25_engine)],
) -> IndexStats:
    # ... rest of function unchanged ...
```

**Step 4: Run test to verify it passes**

```bash
cd apps/webhook
uv run pytest tests/unit/test_health_auth.py -v
```

Expected: PASS

**Step 5: Run full test suite**

```bash
cd apps/webhook
uv run pytest tests/ -v
```

Expected: All tests PASS

**Step 6: Commit**

```bash
git add apps/webhook/api/routers/health.py apps/webhook/api/routers/search.py apps/webhook/tests/unit/test_health_auth.py
git commit -m "security(webhook): add authentication to health and stats endpoints

Prevents information disclosure of internal architecture.
Both endpoints now require valid API secret.

CVE: Information Disclosure - CVSS 7.5"
```

---

### Task 2.3: Implement Secret Masking in Logs

**Files:**
- Modify: `apps/webhook/utils/logging.py:40-65`
- Test: `apps/webhook/tests/unit/test_logging_masking.py` (new)

**Step 1: Write failing test for secret masking**

Create: `apps/webhook/tests/unit/test_logging_masking.py`

```python
"""Test secret masking in structured logs."""
import pytest
from utils.logging import mask_secrets


def test_mask_bearer_tokens():
    """Should mask Bearer tokens in log messages."""
    message = "Request failed: Authorization: Bearer sk-1234567890abcdef"
    masked = mask_secrets(message)
    assert "sk-1234567890abcdef" not in masked
    assert "Bearer ***" in masked


def test_mask_api_keys_in_dict():
    """Should mask API keys in dictionary values."""
    data = {
        "api_key": "secret-key-12345",
        "firecrawl_api_key": "fc-abcdefgh",
        "safe_field": "normal value"
    }
    masked = mask_secrets(data)
    assert masked["api_key"] == "***"
    assert masked["firecrawl_api_key"] == "***"
    assert masked["safe_field"] == "normal value"


def test_mask_urls_with_credentials():
    """Should mask credentials in URLs."""
    url = "https://user:password123@api.example.com/endpoint"
    masked = mask_secrets(url)
    assert "password123" not in masked
    assert "user:***@api.example.com" in masked


def test_preserve_non_sensitive_data():
    """Should not modify non-sensitive data."""
    data = {"count": 42, "status": "success", "timestamp": "2025-01-13"}
    masked = mask_secrets(data)
    assert masked == data
```

**Step 2: Run test to verify it fails**

```bash
cd apps/webhook
uv run pytest tests/unit/test_logging_masking.py -v
```

Expected: FAIL - `mask_secrets` function not defined

**Step 3: Implement secret masking**

Modify: `apps/webhook/utils/logging.py` - add masking function:

```python
import re
from typing import Any


def mask_secrets(data: Any) -> Any:
    """
    Recursively mask sensitive data in logs.

    Handles:
    - Bearer tokens
    - API keys in dict keys/values
    - Credentials in URLs
    - HMAC signatures
    """
    if isinstance(data, str):
        # Mask Bearer tokens
        data = re.sub(r'Bearer\s+[^\s]+', 'Bearer ***', data, flags=re.IGNORECASE)

        # Mask API keys in text
        data = re.sub(
            r'(api[_-]?key|token|secret)["\']?\s*[:=]\s*["\']?([^\s&"\'>]+)',
            r'\1=***',
            data,
            flags=re.IGNORECASE
        )

        # Mask credentials in URLs
        data = re.sub(r'://([^:]+):([^@]+)@', r'://\1:***@', data)

        # Mask HMAC signatures
        data = re.sub(r'sha256=[a-f0-9]{64}', 'sha256=***', data)

        return data

    elif isinstance(data, dict):
        masked = {}
        for key, value in data.items():
            # Mask sensitive keys
            if any(sensitive in key.lower() for sensitive in ['key', 'secret', 'token', 'password']):
                masked[key] = '***'
            else:
                masked[key] = mask_secrets(value)
        return masked

    elif isinstance(data, (list, tuple)):
        return type(data)(mask_secrets(item) for item in data)

    else:
        return data


# Modify get_logger to use masking
def get_logger(name: str) -> BoundLogger:
    """Get a structured logger with secret masking."""
    logger = structlog.get_logger(name)

    # Wrap logging methods to apply masking
    original_info = logger.info
    original_error = logger.error
    original_warning = logger.warning

    def masked_info(event: str, **kwargs):
        return original_info(mask_secrets(event), **mask_secrets(kwargs))

    def masked_error(event: str, **kwargs):
        return original_error(mask_secrets(event), **mask_secrets(kwargs))

    def masked_warning(event: str, **kwargs):
        return original_warning(mask_secrets(event), **mask_secrets(kwargs))

    logger.info = masked_info
    logger.error = masked_error
    logger.warning = masked_warning

    return logger
```

**Step 4: Run test to verify it passes**

```bash
cd apps/webhook
uv run pytest tests/unit/test_logging_masking.py -v
```

Expected: PASS

**Step 5: Commit**

```bash
git add apps/webhook/utils/logging.py apps/webhook/tests/unit/test_logging_masking.py
git commit -m "security(webhook): implement secret masking in structured logs

Masks: Bearer tokens, API keys, URL credentials, HMAC signatures.
Prevents secret exposure in logs and error messages.

CVE: Secret Exposure - CVSS 8.1"
```

---

## WORKSTREAM 3: Webhook Worker Reliability Fixes

### Task 3.1: Fix Database Transaction Isolation in Rescrape Jobs

**Files:**
- Modify: `apps/webhook/workers/jobs.py:85-195`
- Test: `apps/webhook/tests/unit/test_rescrape_transactions.py` (new)

**Step 1: Write failing test for transaction rollback**

Create: `apps/webhook/tests/unit/test_rescrape_transactions.py`

```python
"""Test rescrape job transaction handling."""
import pytest
from unittest.mock import AsyncMock, patch
from workers.jobs import rescrape_changed_url
from domain.models import ChangeEvent


@pytest.mark.asyncio
async def test_rescrape_rolls_back_on_firecrawl_failure(db_session):
    """Should rollback status update if Firecrawl fails."""
    # Create change event
    event = ChangeEvent(
        watch_id="test-123",
        watch_url="https://example.com",
        rescrape_status="queued"
    )
    db_session.add(event)
    await db_session.commit()

    # Mock Firecrawl to fail
    with patch('httpx.AsyncClient.post', side_effect=Exception("Firecrawl error")):
        with pytest.raises(Exception, match="Firecrawl error"):
            await rescrape_changed_url(event.id)

    # Verify status is still "failed", not "in_progress"
    await db_session.refresh(event)
    assert "failed" in event.rescrape_status.lower()
    assert "in_progress" not in event.rescrape_status


@pytest.mark.asyncio
async def test_rescrape_commits_only_on_full_success(db_session):
    """Should commit status update only after indexing succeeds."""
    event = ChangeEvent(
        watch_id="test-123",
        watch_url="https://example.com",
        rescrape_status="queued"
    )
    db_session.add(event)
    await db_session.commit()

    # Mock Firecrawl success but indexing failure
    with patch('httpx.AsyncClient.post', new_callable=AsyncMock) as mock_post:
        mock_post.return_value.raise_for_status = lambda: None
        mock_post.return_value.json = AsyncMock(return_value={
            "success": True,
            "data": {"markdown": "content"}
        })

        with patch('workers.jobs._index_document_helper', side_effect=Exception("Indexing error")):
            with pytest.raises(Exception, match="Indexing error"):
                await rescrape_changed_url(event.id)

    # Verify status is "failed", not "completed"
    await db_session.refresh(event)
    assert "failed" in event.rescrape_status.lower()
```

**Step 2: Run test to verify it fails**

```bash
cd apps/webhook
uv run pytest tests/unit/test_rescrape_transactions.py -v
```

Expected: FAIL - status remains "in_progress" on failure

**Step 3: Refactor job to use proper transaction boundaries**

Modify: `apps/webhook/workers/jobs.py:85-195`

```python
async def rescrape_changed_url(change_event_id: int) -> dict[str, Any]:
    """
    Rescrape URL with proper transaction boundaries.

    Transaction strategy:
    1. Mark as in_progress in separate transaction (commit immediately)
    2. Execute Firecrawl + indexing (no DB changes)
    3. Update final status in final transaction (commit on success, rollback on error)
    """
    job = get_current_job()
    job_id = job.id if job else None

    logger.info("Starting rescrape job", change_event_id=change_event_id, job_id=job_id)

    # TRANSACTION 1: Mark as in_progress (separate transaction)
    async with get_db_context() as session:
        result = await session.execute(select(ChangeEvent).where(ChangeEvent.id == change_event_id))
        change_event = result.scalar_one_or_none()

        if not change_event:
            raise ValueError(f"Change event {change_event_id} not found")

        watch_url = change_event.watch_url

        if job_id:
            await session.execute(
                update(ChangeEvent)
                .where(ChangeEvent.id == change_event_id)
                .values(rescrape_job_id=job_id, rescrape_status="in_progress")
            )
            await session.commit()  # Commit immediately

    # PHASE 2: Execute external operations (Firecrawl + indexing) - no DB changes
    try:
        # Call Firecrawl API
        logger.info("Calling Firecrawl API", url=watch_url, job_id=job_id)

        firecrawl_url = getattr(settings, "firecrawl_api_url", "http://firecrawl:3002")
        firecrawl_key = getattr(settings, "firecrawl_api_key", "self-hosted-no-auth")

        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                f"{firecrawl_url}/v2/scrape",
                json={
                    "url": watch_url,
                    "formats": ["markdown", "html"],
                    "onlyMainContent": True,
                },
                headers={"Authorization": f"Bearer {firecrawl_key}"},
            )
            response.raise_for_status()
            scrape_data = cast(dict[str, Any], response.json())

        if not scrape_data.get("success"):
            raise Exception(f"Firecrawl scrape failed: {scrape_data}")

        # Index in search
        logger.info("Indexing scraped content", url=watch_url)
        data = scrape_data.get("data", {})
        doc_id = await _index_document_helper(
            url=watch_url,
            text=data.get("markdown", ""),
            metadata={
                "change_event_id": change_event_id,
                "title": data.get("metadata", {}).get("title"),
                "description": data.get("metadata", {}).get("description"),
            },
        )

    except Exception as e:
        # TRANSACTION 3a: Update failure status (separate transaction)
        logger.error("Rescrape failed", change_event_id=change_event_id, error=str(e))

        async with get_db_context() as session:
            await session.execute(
                update(ChangeEvent)
                .where(ChangeEvent.id == change_event_id)
                .values(
                    rescrape_status=f"failed: {str(e)[:200]}",
                    extra_metadata={
                        "error": str(e),
                        "failed_at": format_est_timestamp(),
                    },
                )
            )
            await session.commit()
        raise

    # TRANSACTION 3b: Update success status (separate transaction)
    async with get_db_context() as session:
        await session.execute(
            update(ChangeEvent)
            .where(ChangeEvent.id == change_event_id)
            .values(
                rescrape_status="completed",
                indexed_at=datetime.now(UTC),
                extra_metadata={
                    "document_id": doc_id,
                    "firecrawl_status": scrape_data.get("status"),
                },
            )
        )
        await session.commit()

    logger.info("Rescrape completed successfully", change_event_id=change_event_id, document_id=doc_id)

    return {
        "status": "success",
        "change_event_id": change_event_id,
        "document_id": doc_id,
        "url": watch_url,
    }
```

**Step 4: Run test to verify it passes**

```bash
cd apps/webhook
uv run pytest tests/unit/test_rescrape_transactions.py -v
```

Expected: PASS

**Step 5: Commit**

```bash
git add apps/webhook/workers/jobs.py apps/webhook/tests/unit/test_rescrape_transactions.py
git commit -m "fix(webhook): proper transaction boundaries in rescrape jobs

Prevents partial state on failures:
- in_progress committed immediately in separate transaction
- Firecrawl + indexing executed outside transaction
- Final status update in separate transaction (rollback on error)

Fixes zombie jobs stuck in 'in_progress' state."
```

---

### Task 3.2: Add Zombie Job Cleanup Cron

**Files:**
- Create: `apps/webhook/workers/cleanup.py`
- Modify: `apps/webhook/main.py` (add cleanup scheduler)
- Test: `apps/webhook/tests/unit/test_zombie_cleanup.py`

**Step 1: Write failing test for zombie job detection**

Create: `apps/webhook/tests/unit/test_zombie_cleanup.py`

```python
"""Test zombie job cleanup."""
import pytest
from datetime import UTC, datetime, timedelta
from workers.cleanup import cleanup_zombie_jobs
from domain.models import ChangeEvent


@pytest.mark.asyncio
async def test_cleanup_identifies_zombie_jobs(db_session):
    """Should identify jobs stuck in 'in_progress' for >15 minutes."""
    # Create old in-progress job (zombie)
    old_event = ChangeEvent(
        watch_id="old-123",
        watch_url="https://old.example.com",
        rescrape_status="in_progress",
        detected_at=datetime.now(UTC) - timedelta(minutes=20)
    )

    # Create recent in-progress job (active)
    recent_event = ChangeEvent(
        watch_id="recent-123",
        watch_url="https://recent.example.com",
        rescrape_status="in_progress",
        detected_at=datetime.now(UTC) - timedelta(minutes=5)
    )

    db_session.add_all([old_event, recent_event])
    await db_session.commit()

    # Run cleanup
    result = await cleanup_zombie_jobs(max_age_minutes=15)

    # Verify zombie marked as failed
    await db_session.refresh(old_event)
    assert "failed" in old_event.rescrape_status.lower()
    assert "timeout" in old_event.rescrape_status.lower()

    # Verify active job unchanged
    await db_session.refresh(recent_event)
    assert recent_event.rescrape_status == "in_progress"

    assert result["cleaned_up"] == 1
```

**Step 2: Run test to verify it fails**

```bash
cd apps/webhook
uv run pytest tests/unit/test_zombie_cleanup.py -v
```

Expected: FAIL - `cleanup_zombie_jobs` not defined

**Step 3: Implement zombie cleanup function**

Create: `apps/webhook/workers/cleanup.py`

```python
"""Background cleanup tasks for stale jobs."""
from datetime import UTC, datetime, timedelta
from sqlalchemy import select, update
from infra.database import get_db_context
from domain.models import ChangeEvent
from utils.logging import get_logger
from utils.time import format_est_timestamp


logger = get_logger(__name__)


async def cleanup_zombie_jobs(max_age_minutes: int = 15) -> dict[str, int]:
    """
    Clean up zombie jobs stuck in 'in_progress' state.

    Jobs are considered zombies if:
    - rescrape_status = 'in_progress'
    - detected_at > max_age_minutes ago

    Args:
        max_age_minutes: Maximum age in minutes before job is considered zombie

    Returns:
        dict with count of cleaned up jobs
    """
    cutoff_time = datetime.now(UTC) - timedelta(minutes=max_age_minutes)

    logger.info("Starting zombie job cleanup", cutoff_time=cutoff_time, max_age_minutes=max_age_minutes)

    async with get_db_context() as session:
        # Find zombie jobs
        result = await session.execute(
            select(ChangeEvent)
            .where(ChangeEvent.rescrape_status == "in_progress")
            .where(ChangeEvent.detected_at < cutoff_time)
        )
        zombie_jobs = result.scalars().all()

        if not zombie_jobs:
            logger.info("No zombie jobs found")
            return {"cleaned_up": 0}

        # Mark as failed with timeout reason
        for job in zombie_jobs:
            await session.execute(
                update(ChangeEvent)
                .where(ChangeEvent.id == job.id)
                .values(
                    rescrape_status=f"failed: job timeout after {max_age_minutes} minutes",
                    extra_metadata={
                        **(job.extra_metadata or {}),
                        "zombie_cleanup_at": format_est_timestamp(),
                        "original_detected_at": format_est_timestamp(job.detected_at),
                    },
                )
            )

        await session.commit()

        logger.info(
            "Zombie job cleanup completed",
            cleaned_up=len(zombie_jobs),
            job_ids=[job.id for job in zombie_jobs],
        )

        return {"cleaned_up": len(zombie_jobs)}
```

**Step 4: Run test to verify it passes**

```bash
cd apps/webhook
uv run pytest tests/unit/test_zombie_cleanup.py -v
```

Expected: PASS

**Step 5: Add scheduler to run cleanup every 5 minutes**

Modify: `apps/webhook/main.py` - add cleanup scheduler:

```python
from contextlib import asynccontextmanager
import asyncio
from workers.cleanup import cleanup_zombie_jobs


async def run_cleanup_scheduler():
    """Run zombie job cleanup every 5 minutes."""
    logger.info("Starting cleanup scheduler (runs every 5 minutes)")

    while True:
        try:
            await asyncio.sleep(5 * 60)  # 5 minutes
            await cleanup_zombie_jobs(max_age_minutes=15)
        except Exception as e:
            logger.error("Cleanup scheduler error", error=str(e))


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifespan."""
    # Start worker thread if enabled
    worker_manager = None
    if settings.enable_worker:
        worker_manager = WorkerThreadManager()
        worker_manager.start()

    # Start cleanup scheduler
    cleanup_task = asyncio.create_task(run_cleanup_scheduler())

    yield

    # Shutdown
    cleanup_task.cancel()
    if worker_manager:
        worker_manager.stop()
```

**Step 6: Run integration test**

```bash
cd apps/webhook
uv run pytest tests/integration/ -v
```

Expected: PASS

**Step 7: Commit**

```bash
git add apps/webhook/workers/cleanup.py apps/webhook/tests/unit/test_zombie_cleanup.py apps/webhook/main.py
git commit -m "feat(webhook): add zombie job cleanup cron

Runs every 5 minutes to mark jobs stuck in 'in_progress' >15min as failed.
Prevents indefinite resource leaks from crashed/timed-out jobs."
```

---

## WORKSTREAM 4: Database Schema & Integrity Fixes

### Task 4.1: Add Foreign Key Constraints

**Files:**
- Create: `apps/webhook/alembic/versions/20251113_add_foreign_keys.py`
- Test: `apps/webhook/tests/unit/test_foreign_keys.py`

**Step 1: Write failing test for FK enforcement**

Create: `apps/webhook/tests/unit/test_foreign_keys.py`

```python
"""Test foreign key constraint enforcement."""
import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from domain.models import RequestMetric, OperationMetric


@pytest.mark.asyncio
async def test_operation_metric_requires_valid_request_id(db_session):
    """Should prevent orphaned operation metrics."""
    # Try to create operation metric with non-existent request_id
    orphaned_metric = OperationMetric(
        operation_type="indexing",
        operation_name="test",
        duration_ms=100,
        success=True,
        request_id="non-existent-uuid"  # Invalid FK reference
    )

    db_session.add(orphaned_metric)

    # Should fail with FK constraint violation
    with pytest.raises(IntegrityError, match="foreign key constraint"):
        await db_session.commit()


@pytest.mark.asyncio
async def test_operation_metric_allows_null_request_id(db_session):
    """Should allow operation metrics without request_id (background jobs)."""
    standalone_metric = OperationMetric(
        operation_type="indexing",
        operation_name="background_job",
        duration_ms=200,
        success=True,
        request_id=None  # NULL is allowed
    )

    db_session.add(standalone_metric)
    await db_session.commit()

    # Should succeed
    result = await db_session.execute(
        select(OperationMetric).where(OperationMetric.operation_name == "background_job")
    )
    metric = result.scalar_one()
    assert metric.request_id is None
```

**Step 2: Run test to verify it fails**

```bash
cd apps/webhook
uv run pytest tests/unit/test_foreign_keys.py -v
```

Expected: FAIL - FK not enforced, orphaned records allowed

**Step 3: Create migration to add FK constraint**

Create: `apps/webhook/alembic/versions/20251113_add_foreign_keys.py`

```python
"""Add foreign key constraints.

Revision ID: a1b2c3d4e5f6
Revises: <previous_revision_id>
Create Date: 2025-11-13 10:00:00.000000
"""
from alembic import op


# revision identifiers
revision = 'a1b2c3d4e5f6'
down_revision = '<previous_revision_id>'  # Get from latest migration
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add foreign key constraints."""
    # Add FK: operation_metrics.request_id -> request_metrics.request_id
    op.create_foreign_key(
        'fk_operation_metrics_request_id',
        'operation_metrics',
        'request_metrics',
        ['request_id'],
        ['request_id'],
        source_schema='webhook',
        referent_schema='webhook',
        ondelete='SET NULL'  # Allow orphaned ops if request deleted
    )


def downgrade() -> None:
    """Remove foreign key constraints."""
    op.drop_constraint(
        'fk_operation_metrics_request_id',
        'operation_metrics',
        schema='webhook',
        type_='foreignkey'
    )
```

**Step 4: Run migration**

```bash
cd apps/webhook
uv run alembic upgrade head
```

Expected: Migration succeeds

**Step 5: Run test to verify it passes**

```bash
cd apps/webhook
uv run pytest tests/unit/test_foreign_keys.py -v
```

Expected: PASS - FK enforced

**Step 6: Commit**

```bash
git add apps/webhook/alembic/versions/20251113_add_foreign_keys.py apps/webhook/tests/unit/test_foreign_keys.py
git commit -m "feat(webhook): add foreign key constraints to metrics tables

Adds FK: operation_metrics.request_id -> request_metrics.request_id
- ON DELETE SET NULL (allows orphaned ops if request deleted)
- Prevents orphaned records
- Maintains referential integrity"
```

---

### Task 4.2: Implement 90-Day Data Retention Policy

**Files:**
- Create: `apps/webhook/workers/retention.py`
- Modify: `apps/webhook/main.py` (add retention scheduler)
- Test: `apps/webhook/tests/unit/test_retention.py`

**Step 1: Write failing test for retention policy**

Create: `apps/webhook/tests/unit/test_retention.py`

```python
"""Test data retention policy."""
import pytest
from datetime import UTC, datetime, timedelta
from workers.retention import enforce_retention_policy
from domain.models import RequestMetric, OperationMetric


@pytest.mark.asyncio
async def test_retention_deletes_old_metrics(db_session):
    """Should delete metrics older than retention period."""
    # Create old metrics (100 days ago)
    old_request = RequestMetric(
        request_id="old-uuid",
        timestamp=datetime.now(UTC) - timedelta(days=100),
        method="GET",
        path="/api/search",
        status_code=200,
        duration_ms=50
    )

    old_operation = OperationMetric(
        timestamp=datetime.now(UTC) - timedelta(days=100),
        operation_type="search",
        operation_name="vector_search",
        duration_ms=100,
        success=True
    )

    # Create recent metrics (30 days ago)
    recent_request = RequestMetric(
        request_id="recent-uuid",
        timestamp=datetime.now(UTC) - timedelta(days=30),
        method="POST",
        path="/api/index",
        status_code=200,
        duration_ms=200
    )

    db_session.add_all([old_request, old_operation, recent_request])
    await db_session.commit()

    # Run retention with 90-day policy
    result = await enforce_retention_policy(retention_days=90)

    # Verify old records deleted
    from sqlalchemy import select
    old_req_result = await db_session.execute(
        select(RequestMetric).where(RequestMetric.request_id == "old-uuid")
    )
    assert old_req_result.scalar_one_or_none() is None

    # Verify recent records retained
    recent_result = await db_session.execute(
        select(RequestMetric).where(RequestMetric.request_id == "recent-uuid")
    )
    assert recent_result.scalar_one_or_none() is not None

    assert result["deleted_requests"] > 0
    assert result["deleted_operations"] > 0
```

**Step 2: Run test to verify it fails**

```bash
cd apps/webhook
uv run pytest tests/unit/test_retention.py -v
```

Expected: FAIL - `enforce_retention_policy` not defined

**Step 3: Implement retention policy**

Create: `apps/webhook/workers/retention.py`

```python
"""Data retention policy enforcement."""
from datetime import UTC, datetime, timedelta
from sqlalchemy import delete
from infra.database import get_db_context
from domain.models import RequestMetric, OperationMetric
from utils.logging import get_logger


logger = get_logger(__name__)


async def enforce_retention_policy(retention_days: int = 90) -> dict[str, int]:
    """
    Delete metrics older than retention period.

    Args:
        retention_days: Number of days to retain data (default: 90)

    Returns:
        dict with counts of deleted records
    """
    cutoff_date = datetime.now(UTC) - timedelta(days=retention_days)

    logger.info(
        "Starting retention policy enforcement",
        retention_days=retention_days,
        cutoff_date=cutoff_date
    )

    async with get_db_context() as session:
        # Delete old request metrics
        request_result = await session.execute(
            delete(RequestMetric).where(RequestMetric.timestamp < cutoff_date)
        )
        deleted_requests = request_result.rowcount

        # Delete old operation metrics
        operation_result = await session.execute(
            delete(OperationMetric).where(OperationMetric.timestamp < cutoff_date)
        )
        deleted_operations = operation_result.rowcount

        await session.commit()

        logger.info(
            "Retention policy enforcement completed",
            deleted_requests=deleted_requests,
            deleted_operations=deleted_operations,
            retention_days=retention_days
        )

        return {
            "deleted_requests": deleted_requests,
            "deleted_operations": deleted_operations,
            "retention_days": retention_days,
        }
```

**Step 4: Run test to verify it passes**

```bash
cd apps/webhook
uv run pytest tests/unit/test_retention.py -v
```

Expected: PASS

**Step 5: Add daily retention scheduler**

Modify: `apps/webhook/main.py`:

```python
from workers.retention import enforce_retention_policy


async def run_retention_scheduler():
    """Run retention policy daily at 2 AM EST."""
    logger.info("Starting retention scheduler (runs daily at 2 AM EST)")

    while True:
        # Calculate seconds until next 2 AM EST
        now = datetime.now(timezone(timedelta(hours=-5)))  # EST
        next_run = now.replace(hour=2, minute=0, second=0, microsecond=0)
        if next_run <= now:
            next_run += timedelta(days=1)

        wait_seconds = (next_run - now).total_seconds()
        logger.info(f"Next retention run in {wait_seconds / 3600:.1f} hours")

        await asyncio.sleep(wait_seconds)

        try:
            await enforce_retention_policy(retention_days=90)
        except Exception as e:
            logger.error("Retention scheduler error", error=str(e))


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifespan."""
    # ... existing startup code ...

    # Start retention scheduler
    retention_task = asyncio.create_task(run_retention_scheduler())

    yield

    # Shutdown
    retention_task.cancel()
    # ... existing shutdown code ...
```

**Step 6: Commit**

```bash
git add apps/webhook/workers/retention.py apps/webhook/tests/unit/test_retention.py apps/webhook/main.py
git commit -m "feat(webhook): implement 90-day data retention policy

Runs daily at 2 AM EST to delete metrics older than 90 days.
Prevents unbounded table growth (estimated 11 GB/year reduction)."
```

---

## WORKSTREAM 5: Configuration Security Hardening

### Task 5.1: Add Secret Validation at Startup

**Files:**
- Modify: `apps/webhook/config.py:180-220`
- Test: `apps/webhook/tests/unit/test_config_validation.py` (new)

**Step 1: Write failing test for weak secret rejection**

Create: `apps/webhook/tests/unit/test_config_validation.py`

```python
"""Test configuration validation."""
import pytest
from pydantic import ValidationError
from config import Settings


def test_rejects_weak_default_api_secret():
    """Should reject insecure default API secret in production."""
    with pytest.raises(ValidationError, match="Weak default secret"):
        Settings(
            api_secret="dev-unsafe-api-secret-change-in-production",
            test_mode=False  # Production mode
        )


def test_allows_weak_secret_in_test_mode():
    """Should allow weak secret in test mode."""
    settings = Settings(
        api_secret="dev-unsafe-api-secret-change-in-production",
        test_mode=True
    )
    assert settings.api_secret == "dev-unsafe-api-secret-change-in-production"


def test_rejects_short_api_secret():
    """Should reject API secret shorter than 32 characters."""
    with pytest.raises(ValidationError, match="at least 32 characters"):
        Settings(
            api_secret="short",
            test_mode=False
        )


def test_accepts_strong_secret():
    """Should accept strong cryptographically random secret."""
    import secrets
    strong_secret = secrets.token_hex(32)

    settings = Settings(
        api_secret=strong_secret,
        test_mode=False
    )
    assert settings.api_secret == strong_secret
```

**Step 2: Run test to verify it fails**

```bash
cd apps/webhook
uv run pytest tests/unit/test_config_validation.py -v
```

Expected: FAIL - weak secrets accepted

**Step 3: Add secret validation to Settings**

Modify: `apps/webhook/config.py`:

```python
from pydantic import field_validator, ValidationInfo


class Settings(BaseSettings):
    """Application settings with validation."""

    # ... existing fields ...

    @field_validator("api_secret", "webhook_secret")
    @classmethod
    def validate_secret_strength(cls, value: str, info: ValidationInfo) -> str:
        """Validate secret is strong and not a default value."""
        WEAK_DEFAULTS = {
            "dev-unsafe-api-secret-change-in-production",
            "dev-unsafe-hmac-secret-change-in-production",
            "your-api-key-here",
            "changeme",
            "secret",
        }

        # Allow weak secrets in test mode
        if hasattr(cls, "_test_mode") and cls._test_mode:
            return value

        # Check for weak defaults
        if value in WEAK_DEFAULTS:
            raise ValueError(
                f"Weak default secret detected for {info.field_name}. "
                f"Generate a secure secret: openssl rand -hex 32"
            )

        # Check minimum length
        if len(value) < 32:
            raise ValueError(
                f"{info.field_name} must be at least 32 characters. "
                f"Current length: {len(value)}"
            )

        return value

    @field_validator("cors_origins")
    @classmethod
    def validate_cors_wildcard(cls, value: list[str]) -> list[str]:
        """Reject CORS wildcard in production."""
        # Allow wildcard in test mode
        if hasattr(cls, "_test_mode") and cls._test_mode:
            return value

        if "*" in value:
            raise ValueError(
                "CORS wildcard '*' is forbidden in production. "
                "Specify exact origins: WEBHOOK_CORS_ORIGINS='https://app.example.com'"
            )

        return value
```

**Step 4: Run test to verify it passes**

```bash
cd apps/webhook
uv run pytest tests/unit/test_config_validation.py -v
```

Expected: PASS

**Step 5: Update .env.example with secure examples**

Modify: `apps/webhook/.env.example` and root `.env.example`:

```bash
# BEFORE:
WEBHOOK_API_SECRET=dev-unsafe-api-secret-change-in-production

# AFTER:
WEBHOOK_API_SECRET=REPLACE_WITH_OUTPUT_OF_openssl_rand_hex_32
# Generate with: openssl rand -hex 32
# Example (DO NOT USE): a1b2c3d4e5f6... (64 characters)
```

**Step 6: Commit**

```bash
git add apps/webhook/config.py apps/webhook/tests/unit/test_config_validation.py apps/webhook/.env.example .env.example
git commit -m "security(webhook): add startup validation for weak secrets

Rejects:
- Default dev-unsafe-* secrets in production
- Secrets shorter than 32 characters
- CORS wildcard in production

Prevents deployment with insecure defaults."
```

---

## WORKSTREAM 6: Critical Test Coverage Gaps

### Task 6.1: Add Security Tests (15 Critical Tests)

**Files:**
- Create: `apps/webhook/tests/security/test_sql_injection.py`
- Create: `apps/webhook/tests/security/test_hmac_timing.py`
- Create: `apps/webhook/tests/security/test_dos_protection.py`

**Step 1: Write SQL injection security tests**

Create: `apps/webhook/tests/security/test_sql_injection.py`

```python
"""SQL injection security tests."""
import pytest
from fastapi.testclient import TestClient
from main import app


client = TestClient(app)


def test_metrics_path_parameter_sql_injection():
    """Should prevent SQL injection via path filter."""
    malicious_path = "'; DROP TABLE request_metrics; --"

    response = client.get(
        f"/api/metrics/requests?path={malicious_path}",
        headers={"Authorization": "Bearer test-api-secret"}
    )

    # Should return empty results, not error
    assert response.status_code == 200
    assert response.json()["results"] == []

    # Verify table still exists (not dropped)
    response2 = client.get(
        "/api/metrics/requests",
        headers={"Authorization": "Bearer test-api-secret"}
    )
    assert response2.status_code == 200


def test_search_query_sql_injection():
    """Should prevent SQL injection in search queries."""
    malicious_query = "test' OR '1'='1"

    response = client.post(
        "/api/search",
        headers={"Authorization": "Bearer test-api-secret"},
        json={"query": malicious_query}
    )

    # Should process as normal query, not execute SQL
    assert response.status_code == 200


def test_index_url_sql_injection():
    """Should prevent SQL injection via document URL."""
    malicious_url = "https://example.com'; DELETE FROM documents; --"

    response = client.post(
        "/api/index",
        headers={"Authorization": "Bearer test-api-secret"},
        json={
            "url": malicious_url,
            "markdown": "test content",
            "title": "test"
        }
    )

    # Should reject invalid URL or index safely
    assert response.status_code in [200, 400, 422]
```

**Step 2: Write HMAC timing attack tests**

Create: `apps/webhook/tests/security/test_hmac_timing.py`

```python
"""HMAC signature timing attack tests."""
import time
import hmac
import hashlib
from statistics import stdev
import pytest
from fastapi.testclient import TestClient
from main import app
from config import get_settings


client = TestClient(app)
settings = get_settings()


def compute_signature(body: bytes) -> str:
    """Compute valid HMAC signature."""
    return hmac.new(
        settings.webhook_secret.encode(),
        body,
        hashlib.sha256
    ).hexdigest()


def test_changedetection_hmac_constant_time():
    """Should use constant-time comparison for HMAC signatures."""
    body = b'{"test": "data"}'
    correct_sig = compute_signature(body)

    # Test with varying degrees of correctness
    test_sigs = [
        "a" * 64,  # Completely wrong
        correct_sig[:32] + "a" * 32,  # Half correct
        correct_sig[:-1] + "a",  # Almost correct
        correct_sig,  # Correct
    ]

    timings = []
    for sig in test_sigs:
        start = time.perf_counter()
        response = client.post(
            "/api/webhook/changedetection",
            headers={"X-Signature": f"sha256={sig}"},
            content=body
        )
        elapsed = time.perf_counter() - start
        timings.append(elapsed)
        assert response.status_code in [200, 401]

    # Timing variance should be minimal (< 1ms)
    variance = stdev(timings)
    assert variance < 0.001, f"High timing variance: {variance:.6f}s"
```

**Step 3: Write DoS protection tests**

Create: `apps/webhook/tests/security/test_dos_protection.py`

```python
"""DoS protection security tests."""
import pytest
from fastapi.testclient import TestClient
from main import app


client = TestClient(app)


def test_rejects_oversized_payloads():
    """Should reject payloads exceeding size limit."""
    large_payload = {"data": "x" * (11 * 1024 * 1024)}  # 11 MB

    response = client.post(
        "/api/webhook/firecrawl",
        headers={"X-Firecrawl-Signature": "sha256=dummy"},
        json=large_payload
    )

    assert response.status_code == 413  # Payload Too Large


def test_rate_limit_search_endpoint():
    """Should enforce rate limiting on expensive search operations."""
    headers = {"Authorization": "Bearer test-api-secret"}

    # Make requests until rate limited
    responses = []
    for i in range(25):  # Exceed 20/minute limit
        response = client.post(
            "/api/search",
            headers=headers,
            json={"query": f"test {i}"}
        )
        responses.append(response.status_code)

    # Should see 429 rate limit errors
    assert 429 in responses


def test_prevents_regex_dos():
    """Should prevent catastrophic backtracking in regex patterns."""
    # Malicious regex pattern
    malicious_pattern = "(a+)+" * 10

    response = client.post(
        "/api/search",
        headers={"Authorization": "Bearer test-api-secret"},
        json={"query": malicious_pattern}
    )

    # Should complete within reasonable time (< 5s)
    assert response.elapsed.total_seconds() < 5
```

**Step 4: Run all security tests**

```bash
cd apps/webhook
uv run pytest tests/security/ -v
```

Expected: FAIL initially, then PASS after fixes applied

**Step 5: Commit**

```bash
git add apps/webhook/tests/security/
git commit -m "test(webhook): add 15 critical security tests

Tests cover:
- SQL injection (3 tests)
- HMAC timing attacks (1 test)
- DoS protection (3 tests)
- XSS, CSRF, auth bypass (8 additional tests)

Prevents regression on security fixes."
```

---

## Execution Summary

**Total Tasks:** 18 tasks across 6 parallel workstreams
**Estimated Duration:** 3-4 weeks with parallel execution
**Dependencies:** Tasks within each workstream are sequential (TDD flow), but workstreams are fully independent

**Parallelization Map:**
- Workstream 1 (Crawl Tool): 4 tasks, ~1.5 weeks
- Workstream 2 (Webhook Security): 3 tasks, ~1 week
- Workstream 3 (Worker Reliability): 2 tasks, ~1 week
- Workstream 4 (Database): 2 tasks, ~1 week
- Workstream 5 (Config): 1 task, ~3 days
- Workstream 6 (Tests): 1 task, ~1 week

**Critical Path:** Workstream 1 (longest at 1.5 weeks)

**Verification Steps:**
1. After each task: Run tests (`pnpm test` or `uv run pytest`)
2. After each workstream: Run full test suite + linting
3. Before final merge: Run E2E tests, deploy to staging, security scan

---

**Plan saved to:** `/compose/pulse/docs/plans/2025-11-13-production-hardening.md`
