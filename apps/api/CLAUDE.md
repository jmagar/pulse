# Firecrawl API - Pulse Integration

## Overview

Local build of Firecrawl API with PR #2381 patches applied for production stability.

## PR #2381: Scrape Reliability & Cancellation

**Applied commits:**
- `7c697331` - Initial implementation
- `b613ae9d` - Review fixes (race conditions, test assertions)

**Fixes:**

1. **Infinite Retry Loop Prevention**
   - `ScrapeRetryTracker` with global cap (`SCRAPE_MAX_ATTEMPTS=6`)
   - Per-error type limits (PDF, document, feature toggles)
   - New error: `ScrapeRetryLimitError` with detailed stats

2. **Client Disconnect Cancellation**
   - Controllers detect `req.on("close")` / `req.on("aborted")`
   - Workers poll Redis cancellation flags every 1s
   - Propagates `AbortSignal` through scraping pipeline
   - Returns HTTP 499 for cancelled jobs
   - No billing for cancelled work

3. **NuQ Finalization Retry**
   - Wraps `jobFinish()` / `jobFail()` with exponential backoff
   - 3 retry attempts before failing fast
   - Prevents silent database update failures

## Environment Variables

See root `.env.example` for all variables. Key PR #2381 additions:

```bash
SCRAPE_MAX_ATTEMPTS=6
SCRAPE_MAX_PDF_PREFETCHES=2
SCRAPE_CANCELLATION_POLL_INTERVAL_MS=1000
NUQ_FINALIZE_RETRY_ALERT_THRESHOLD=3
```

## Building & Running

**Local build:**
```bash
docker compose build firecrawl
```

**Start service:**
```bash
docker compose up -d firecrawl
```

**Check logs:**
```bash
docker logs firecrawl -f
```

**Health check:**
```bash
curl http://localhost:50102/health
```

## Upstream Sync

**Fetch updates:**
```bash
git fetch firecrawl
```

**Check for new PRs:**
```bash
git log --oneline firecrawl/main ^HEAD -- apps/api | head -20
```

**Cherry-pick additional fixes:**
```bash
git fetch firecrawl pull/<PR_NUMBER>/head:pr-<PR_NUMBER>
git cherry-pick <commit-sha>
```

## Testing

**Run API tests:**
```bash
cd apps/api
npm test
```

**Test PR #2381 specifically:**
```bash
npm test -- retryTracker
npm test -- job-cancellation
npm test -- job-finalizer
```

## Known Issues

- E2E tests excluded from PR #2381 (unit tests only)
- Requires upstream merge for long-term maintenance

## References

- Upstream repo: https://github.com/firecrawl/firecrawl
- PR #2381: https://github.com/firecrawl/firecrawl/pull/2381
- Issues fixed: #2350, #2364, #1848, #2280
