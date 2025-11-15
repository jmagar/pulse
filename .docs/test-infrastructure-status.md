# Test Infrastructure Status

**Last Updated:** 2025-11-10

## Status Summary

❌ Root `pnpm test` command exits with code 1 (failures present)
⚠️  MCP tests: 182 passed, 6 failed (module resolution issues)
❌ Webhook tests: 260 errors (PostgreSQL connection failures)
✅ Web tests: No tests configured (no-op script returns 0)
✅ Firecrawl client tests: No tests configured (no-op script returns 0)

## Test Commands

- `pnpm test` - Run all tests (currently failing)
- `pnpm test:packages` - Test shared packages (passes with no-op)
- `pnpm test:apps` - Test MCP and Web apps (MCP has failures)
- `pnpm test:mcp` - Test MCP server only (6 failing tests)
- `pnpm test:web` - Test Web UI (no-op currently)
- `pnpm test:webhook` - Test webhook service (connection errors)

## Current Issues

### 1. MCP Module Resolution Failures (6 tests failing)

**Error:**
```
Failed to resolve entry for package "@firecrawl/client".
The package may have incorrect main/module/exports specified in its package.json.
```

**Affected Tests:**
- `tools/registration.test.ts` - All 6 tests in this file
  - registerTools() successful registrations
  - registerTools() tool name recording
  - registerTools() error handling
  - registerResources() successful registration
  - registerResources() failed registration

**Impact:** Blocks successful CI/CD runs

**Root Cause:** Vitest cannot resolve the `@firecrawl/client` package import in `tools/registration.ts:16`

**Note:** Package builds successfully with `tsc`, but Vitest has resolution issues

### 2. Webhook PostgreSQL Connection Failures (260 errors)

**Error:**
```
OSError: Multiple exceptions:
[Errno 111] Connect call failed ('::1', 5432, 0, 0),
[Errno 111] Connect call failed ('127.0.0.1', 5432)
```

**Affected Tests:** All webhook tests (260 test errors)

**Root Cause:** Tests attempt to connect to `localhost:5432` but:
- PostgreSQL container binds to host on port `4304` (not 5432)
- Tests run on host machine, not inside Docker network
- Test configuration uses defaults from `conftest.py` (lines 16-19)

**Solution Required:**
- Set `POSTGRES_PORT=4304` environment variable before tests
- OR: Update test setup script to detect actual PostgreSQL port
- OR: Update conftest.py to read from .env file

## Webhook Test Setup

Tests use dedicated PostgreSQL database:
- Database: `webhook_test`
- Auto-created by `apps/webhook/scripts/setup-test-db.sh`
- Hermetic: Fresh database per test run
- Connection: `postgresql+asyncpg://firecrawl@localhost:4304/webhook_test` (actual)
- Expected: `postgresql+asyncpg://postgres@localhost:5432/webhook_test` (conftest default)

## Prerequisites

1. PostgreSQL running on localhost
   ```bash
   docker compose up -d pulse_postgres
   ```
   - Container binds to host port: 4304
   - Internal Docker network port: 5432

2. Install webhook test dependencies:
   ```bash
   cd apps/webhook && uv sync --extra dev
   ```

3. Build packages before testing:
   ```bash
   pnpm build
   ```
   **Important:** `pnpm clean` removes built packages, breaking tests

## Known Gaps

1. **apps/web**: No test framework installed
   - Needs: Vitest + React Testing Library
   - Current: No-op test script (exit 0)

2. **packages/firecrawl-client**: No contract tests
   - Should verify API compatibility
   - Should test schema round-trips
   - Current: No-op test script (exit 0)

3. **MCP Integration Tests**: Module resolution issues
   - 6 tests failing due to package import errors
   - Needs investigation of Vitest configuration
   - May need explicit exports in package.json

4. **Webhook Tests**: Environment configuration mismatch
   - Tests expect PostgreSQL on default port 5432
   - Actual PostgreSQL runs on port 4304
   - Needs environment variable configuration

## Build Requirements

**Critical:** Tests require packages to be built before running.

```bash
# After pnpm clean, must rebuild:
pnpm build

# This builds:
# - packages/firecrawl-client (TypeScript → dist/)
# - apps/mcp (TypeScript → dist/)
# - apps/web (Next.js production build)
```

Without building, MCP tests will fail with module resolution errors.

## Test Results Summary (2025-11-10)

### Package Tests
```
@firecrawl/client: ✅ No tests configured (no-op) - PASSED
```

### App Tests
```
apps/web: ✅ No tests configured (no-op) - PASSED
apps/mcp: ⚠️  182 passed, 6 failed - FAILED
```

### Webhook Tests
```
apps/webhook: ❌ 260 errors (connection refused) - FAILED
```

### Overall Exit Code
```
Exit Code: 1 (FAILURE)
```

## Next Steps

### Immediate Fixes (to make `pnpm test` pass)

1. **Fix MCP module resolution**
   - Investigate Vitest configuration for package imports
   - May need to add `@firecrawl/client` to Vitest optimizeDeps
   - Verify package.json exports are compatible with Vitest

2. **Fix webhook PostgreSQL connection**
   - Option A: Set `POSTGRES_PORT=4304` in test environment
   - Option B: Update `conftest.py` to read from project .env
   - Option C: Update setup-test-db.sh to use actual port

3. **Verify clean environment**
   - Test `pnpm clean && pnpm build && pnpm test` workflow
   - Document build requirement in test scripts
   - Consider adding pre-test build check

### Future Improvements

1. Add Vitest to apps/web
2. Add contract tests to firecrawl-client
3. Add MCP integration tests
4. Add cross-service E2E tests
5. Add test coverage reporting
