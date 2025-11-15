# Test Infrastructure Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix broken test infrastructure across the monorepo to enable `pnpm test` to run successfully in CI/CD.

**Architecture:**
- Fix webhook tests to use PostgreSQL test database instead of SQLite
- Add no-op test scripts to apps/web and packages/firecrawl-client to unblock root test command
- Ensure all test dependencies are properly installed
- Make tests hermetic and reproducible

**Tech Stack:**
- Python: pytest, pytest-asyncio, pytest-cov, asyncpg (PostgreSQL async driver)
- Node.js: pnpm workspaces, vitest
- PostgreSQL: Test database with dedicated schema

---

## Task 1: Fix Webhook PostgreSQL Test Configuration

**Problem:** `tests/conftest.py` still references SQLite (`sqlite+aiosqlite:///./.cache/test_webhook.db`) but the app has migrated to PostgreSQL, causing `ModuleNotFoundError: No module named 'aiosqlite'`.

**Files:**
- Modify: `apps/webhook/tests/conftest.py:15`
- Test: Run `cd apps/webhook && uv run pytest tests/ -v`

### Step 1: Update conftest.py to use PostgreSQL test database

Replace the SQLite database URL with PostgreSQL:

```python
# OLD (line 15):
os.environ.setdefault("SEARCH_BRIDGE_DATABASE_URL", "sqlite+aiosqlite:///./.cache/test_webhook.db")

# NEW:
os.environ.setdefault(
    "WEBHOOK_DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:5432/webhook_test"
)
```

**Expected change:**
- Remove SQLite connection string
- Use PostgreSQL with asyncpg driver
- Use `WEBHOOK_DATABASE_URL` (highest priority env var per config.py:171-173)
- Point to dedicated test database `webhook_test`

### Step 2: Verify configuration loads correctly

Run the following to ensure no import errors:

```bash
cd apps/webhook && uv run python -c "from tests.conftest import *; print('✓ conftest loads successfully')"
```

**Expected output:**
```
✓ conftest loads successfully
```

### Step 3: Run tests to verify PostgreSQL connection

```bash
cd apps/webhook && uv run pytest tests/unit/test_config.py -v
```

**Expected outcome:**
- Tests should connect to PostgreSQL
- No `ModuleNotFoundError: No module named 'aiosqlite'`
- May fail if `webhook_test` database doesn't exist (handled in Task 2)

### Step 4: Commit the fix

```bash
git add apps/webhook/tests/conftest.py
git commit -m "fix(webhook): replace SQLite with PostgreSQL in test config

- Update conftest.py to use postgresql+asyncpg URL
- Remove outdated sqlite+aiosqlite reference
- Use WEBHOOK_DATABASE_URL with dedicated test database
- Aligns with migration to PostgreSQL in production"
```

---

## Task 2: Create Test Database Setup Script

**Problem:** Tests need a dedicated PostgreSQL database to avoid polluting production data.

**Files:**
- Create: `apps/webhook/scripts/setup-test-db.sh`
- Modify: `apps/webhook/pyproject.toml` (add test setup script)

### Step 1: Write test database setup script

Create `apps/webhook/scripts/setup-test-db.sh`:

```bash
#!/bin/bash
# Setup test database for webhook pytest suite

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Configuration
DB_HOST="${WEBHOOK_TEST_DB_HOST:-localhost}"
DB_PORT="${WEBHOOK_TEST_DB_PORT:-5432}"
DB_USER="${WEBHOOK_TEST_DB_USER:-postgres}"
DB_NAME="${WEBHOOK_TEST_DB_NAME:-webhook_test}"
DB_SCHEMA="${WEBHOOK_TEST_DB_SCHEMA:-webhook}"

echo "Setting up test database: ${DB_NAME}"

# Check if PostgreSQL is running
if ! pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" &>/dev/null; then
    echo -e "${RED}✗ PostgreSQL is not running on ${DB_HOST}:${DB_PORT}${NC}"
    echo "Start PostgreSQL with: docker compose up -d pulse_postgres"
    exit 1
fi

# Drop existing test database
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "DROP DATABASE IF EXISTS ${DB_NAME};" 2>/dev/null || true

# Create fresh test database
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "CREATE DATABASE ${DB_NAME};"

# Create schema
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "CREATE SCHEMA IF NOT EXISTS ${DB_SCHEMA};"

echo -e "${GREEN}✓ Test database ${DB_NAME} created successfully${NC}"
echo "Connection string: postgresql+asyncpg://${DB_USER}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
```

### Step 2: Make script executable

```bash
chmod +x apps/webhook/scripts/setup-test-db.sh
```

### Step 3: Test the script

```bash
apps/webhook/scripts/setup-test-db.sh
```

**Expected output:**
```
Setting up test database: webhook_test
✓ Test database webhook_test created successfully
Connection string: postgresql+asyncpg://postgres@localhost:5432/webhook_test
```

### Step 4: Commit the script

```bash
git add apps/webhook/scripts/setup-test-db.sh
git commit -m "feat(webhook): add test database setup script

- Create setup-test-db.sh for clean test database
- Supports environment variable overrides
- Drops and recreates database for hermetic tests
- Creates webhook schema automatically"
```

---

## Task 3: Add Test Setup to Root Package Scripts

**Problem:** Tests should auto-setup database before running.

**Files:**
- Modify: `package.json:17` (update test:webhook script)

### Step 1: Update test:webhook script to setup database first

```json
{
  "scripts": {
    "test:webhook": "apps/webhook/scripts/setup-test-db.sh && cd apps/webhook && uv run pytest tests/ -v"
  }
}
```

### Step 2: Run test to verify setup works

```bash
pnpm test:webhook
```

**Expected outcome:**
- Script creates database
- Tests run against fresh PostgreSQL database
- No SQLite errors

### Step 3: Commit the change

```bash
git add package.json
git commit -m "feat: auto-setup test database before webhook tests

- Update test:webhook script to run setup-test-db.sh
- Ensures hermetic test environment
- Prevents test pollution across runs"
```

---

## Task 4: Add No-Op Test Scripts for apps/web

**Problem:** `pnpm test:apps` filters to `apps/web` which has no `test` script, causing the command to fail.

**Files:**
- Modify: `apps/web/package.json:4-11`

### Step 1: Add test script that exits successfully

Add to `apps/web/package.json`:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "echo 'No tests configured for apps/web yet' && exit 0",
    "lint": "eslint",
    "format": "prettier --write .",
    "format:check": "prettier --check ."
  }
}
```

### Step 2: Verify test script works

```bash
pnpm --filter './apps/web' test
```

**Expected output:**
```
No tests configured for apps/web yet
```

### Step 3: Commit the change

```bash
git add apps/web/package.json
git commit -m "feat(web): add no-op test script

- Unblocks pnpm test:apps by providing test script
- Returns exit code 0 (success)
- Documents that tests are not yet implemented"
```

---

## Task 5: Add No-Op Test Scripts for packages/firecrawl-client

**Problem:** `pnpm test:packages` filters to `packages/firecrawl-client` which has no `test` script.

**Files:**
- Modify: `packages/firecrawl-client/package.json:14-16`

### Step 1: Add test script that exits successfully

```json
{
  "scripts": {
    "build": "tsc",
    "clean": "rm -rf dist",
    "test": "echo 'No tests configured for @firecrawl/client yet' && exit 0"
  }
}
```

### Step 2: Verify test script works

```bash
pnpm --filter '@firecrawl/client' test
```

**Expected output:**
```
No tests configured for @firecrawl/client yet
```

### Step 3: Commit the change

```bash
git add packages/firecrawl-client/package.json
git commit -m "feat(firecrawl-client): add no-op test script

- Unblocks pnpm test:packages by providing test script
- Returns exit code 0 (success)
- Documents that tests are not yet implemented"
```

---

## Task 6: Run Full Test Suite

**Goal:** Verify all tests pass end-to-end.

### Step 1: Clean test artifacts

```bash
pnpm clean
rm -rf apps/webhook/.cache apps/webhook/.pytest_cache
```

### Step 2: Run full test suite

```bash
pnpm test
```

**Expected outcome:**
```
> pulse@1.0.0 test
> pnpm test:packages && pnpm test:apps && pnpm test:webhook

> pulse@1.0.0 test:packages
> pnpm --filter './packages/*' test

@firecrawl/client: No tests configured for @firecrawl/client yet

> pulse@1.0.0 test:apps
> pnpm --filter './apps/mcp' --filter './apps/web' test

apps/mcp: ✓ 231 tests passed
apps/web: No tests configured for apps/web yet

> pulse@1.0.0 test:webhook
> apps/webhook/scripts/setup-test-db.sh && cd apps/webhook && uv run pytest tests/ -v

✓ Test database webhook_test created successfully
[... pytest output ...]
====== X passed in Y.YYs ======
```

### Step 3: Verify exit code

```bash
echo $?
```

**Expected:** `0` (success)

### Step 4: Document test infrastructure status

Create `.docs/test-infrastructure-status.md`:

```markdown
# Test Infrastructure Status

**Last Updated:** 2025-11-10

## Status Summary

✅ Root `pnpm test` command runs successfully
✅ MCP tests: 231 tests passing
✅ Webhook tests: PostgreSQL hermetic test database
⚠️  Web tests: No tests configured (no-op script)
⚠️  Firecrawl client tests: No tests configured (no-op script)

## Test Commands

- `pnpm test` - Run all tests
- `pnpm test:packages` - Test shared packages
- `pnpm test:apps` - Test MCP and Web apps
- `pnpm test:mcp` - Test MCP server only
- `pnpm test:web` - Test Web UI (no-op currently)
- `pnpm test:webhook` - Test webhook service

## Webhook Test Setup

Tests use dedicated PostgreSQL database:
- Database: `webhook_test`
- Auto-created by `apps/webhook/scripts/setup-test-db.sh`
- Hermetic: Fresh database per test run
- Connection: `postgresql+asyncpg://postgres@localhost:5432/webhook_test`

## Prerequisites

1. PostgreSQL running on localhost:5432
   ```bash
   docker compose up -d pulse_postgres
   ```

2. Install webhook test dependencies:
   ```bash
   cd apps/webhook && uv sync --extra dev
   ```

## Known Gaps

1. **apps/web**: No test framework installed
   - Needs: Vitest + React Testing Library
   - See: [docs/plans/2025-11-10-add-web-tests.md]

2. **packages/firecrawl-client**: No contract tests
   - Should verify API compatibility
   - Should test schema round-trips

3. **MCP Integration Tests**: Missing
   - No Express server integration tests
   - No auth/CORS coverage
   - No cross-service contract tests

## Next Steps

1. Add Vitest to apps/web
2. Add contract tests to firecrawl-client
3. Add MCP integration tests
4. Add cross-service E2E tests
```

### Step 5: Commit documentation

```bash
git add .docs/test-infrastructure-status.md
git commit -m "docs: add test infrastructure status

- Document current test coverage
- List test commands and setup
- Identify known gaps
- Provide next steps for full coverage"
```

---

## Task 7: Verify CI/CD Readiness

**Goal:** Ensure tests can run in clean CI environment.

### Step 1: Test in fresh environment simulation

```bash
# Simulate CI by removing all caches
pnpm clean
rm -rf node_modules apps/*/node_modules packages/*/node_modules
rm -rf apps/webhook/.venv

# Reinstall
pnpm install
cd apps/webhook && uv sync --extra dev && cd ../..

# Run tests
pnpm test
```

**Expected:** All tests pass

### Step 2: Document CI requirements

Add to README.md:

```markdown
## Running Tests

### Prerequisites

1. **PostgreSQL**: Tests require PostgreSQL running on localhost:5432
   ```bash
   docker compose up -d pulse_postgres
   ```

2. **Node.js Dependencies**:
   ```bash
   pnpm install
   ```

3. **Python Dependencies**:
   ```bash
   cd apps/webhook && uv sync --extra dev
   ```

### Run Tests

```bash
# All tests
pnpm test

# Individual test suites
pnpm test:mcp      # MCP server (Vitest)
pnpm test:web      # Web UI (no-op currently)
pnpm test:webhook  # Webhook service (pytest)
```

### Test Database

Webhook tests use a dedicated PostgreSQL database (`webhook_test`) that is automatically created and reset before each test run. This ensures hermetic, reproducible tests.
```

### Step 3: Commit README updates

```bash
git add README.md
git commit -m "docs: add testing section to README

- Document test prerequisites
- List test commands
- Explain test database setup
- Provide CI/CD guidance"
```

---

## Verification Checklist

Before marking this plan complete, verify:

- [ ] `pnpm test` exits with code 0
- [ ] MCP tests pass (231 tests)
- [ ] Webhook tests connect to PostgreSQL (no SQLite errors)
- [ ] apps/web test script exists and succeeds
- [ ] packages/firecrawl-client test script exists and succeeds
- [ ] Test database auto-creates before webhook tests
- [ ] Fresh install + test run succeeds (CI simulation)
- [ ] Documentation updated in README.md
- [ ] Test infrastructure status documented

## Success Criteria

✅ Root `pnpm test` command runs to completion without errors
✅ All existing tests continue to pass (231 MCP tests)
✅ Webhook tests use PostgreSQL with hermetic test database
✅ No SQLite dependency errors
✅ CI/CD ready (documented prerequisites and clean environment tested)

---

## Notes

- This plan does NOT add new tests to apps/web or packages/firecrawl-client
- This plan ONLY fixes broken test infrastructure
- Future plans should address test coverage gaps
- All changes maintain backward compatibility with existing tests
