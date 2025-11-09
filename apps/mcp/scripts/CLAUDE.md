# Scripts Directory

Helper scripts for building, testing, and maintaining the Pulse Fetch MCP server.

## Scripts Overview

### Build & Setup

- **prepare-npm-readme.js** - Prepares README.md for npm publication
  - Removes monorepo-specific content
  - Adjusts relative paths for standalone package
  - Called automatically during publishing

### Testing

- **run-vitest.js** - Wrapper for running Vitest with proper configuration
  - Sets up test environment
  - Handles vitest binary location
  - Passes through all CLI arguments

- **setup-manual-tests.js** - Prepares manual test environment
  - Copies .env file to tests/manual/ directory
  - Validates required API keys are present
  - Run before manual tests that hit real APIs

- **run-manual-built.js** - Executes manual tests against built code
  - Runs tests in `tests/manual/features/` or `tests/manual/pages/`
  - Uses compiled JavaScript from dist/ directories
  - Requires successful build first

## Usage Examples

```bash
# Run functional tests
npm test  # Uses run-vitest.js

# Run manual tests (real APIs)
npm run test:manual:setup  # First time setup
npm run test:manual         # Runs all manual tests

# Run manual test suites separately
npm run test:manual:features  # Feature tests
npm run test:manual:pages     # Page-specific tests
```

## Script Patterns

### JavaScript vs. TypeScript

- All scripts are JavaScript (not TypeScript)
- Can be run directly with `node script-name.js`
- Don't require compilation

### Error Handling

- Scripts exit with non-zero codes on failure
- Descriptive error messages to stdout/stderr
- Safe to use in CI/CD pipelines

## Testing Scripts Details

### Functional vs. Manual Tests

**Functional Tests** (mocked dependencies):

- Run via: `npm test` or `npm run test:run`
- No API keys needed
- Fast execution
- Run in CI

**Manual Tests** (real APIs):

- Run via: `npm run test:manual`
- Requires real API keys in `.env`
- Slower execution (network calls)
- NOT run in CI
- Must call `npm run test:manual:setup` first

### Manual Test Setup Flow

1. Copy `.env.example` to `.env` in project root
2. Add real API keys to `.env`
3. Run `npm run test:manual:setup` (copies env to tests/manual/)
4. Run `npm run test:manual` to execute tests

## Common Operations

```bash
# Build everything before running manual tests
npm run build:test

# Run integration tests (requires build)
npm run test:integration

# Clean build artifacts
npm run clean
```

## Script Locations Reference

All scripts are in `/home/jmagar/code/pulse-crawl/scripts/`:

- [prepare-npm-readme.js](prepare-npm-readme.js)
- [run-vitest.js](run-vitest.js)
- [setup-manual-tests.js](setup-manual-tests.js)
- [run-manual-built.js](run-manual-built.js)
