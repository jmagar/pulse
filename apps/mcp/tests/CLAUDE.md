# Tests Directory

Comprehensive test suite for Pulse Fetch MCP server.

## Test Types

### 1. Functional Tests ([functional/](functional/))

**Purpose**: Unit tests with mocked dependencies
**Location**: `tests/functional/*.test.ts`
**Run**: `npm test`

Tests individual tools and components in isolation:

- [scrape-tool.test.ts](functional/scrape-tool.test.ts) - Scrape tool logic
- [scraping-strategies.test.ts](functional/scraping-strategies.test.ts) - Strategy selection
- [default-config.test.ts](functional/default-config.test.ts) - Default strategy config
- [strategy-config.test.ts](functional/strategy-config.test.ts) - Config file handling
- [extract-clients.test.ts](functional/extract-clients.test.ts) - LLM extraction clients

All external services (Firecrawl, LLMs) are mocked using [mocks/scraping-clients.functional-mock.ts](mocks/scraping-clients.functional-mock.ts).

### 2. Integration Tests ([integration/](integration/))

**Purpose**: Full MCP protocol with TestMCPClient
**Location**: `tests/integration/*.test.ts`
**Run**: `npm run test:integration`

Tests complete server interaction:

- Requires building code first (`npm run build:test`)
- Uses `TestMCPClient` from libs/test-mcp-client
- Mocks external services
- Validates MCP protocol compliance

### 3. Manual Tests ([manual/](manual/))

**Purpose**: Real API calls for validation
**Location**: `tests/manual/{features,pages}/*.test.ts`
**Run**: `npm run test:manual`

**IMPORTANT**: Not run in CI, requires real API keys:

```bash
# Setup (first time)
cp .env.example .env
# Add real API keys to .env
npm run test:manual:setup

# Run tests
npm run test:manual
```

Tests actual external services:

- [manual/features/](manual/features/) - Feature-level tests
- [manual/pages/](manual/pages/) - Specific page tests

### 4. Remote Tests ([remote/](remote/))

**Purpose**: HTTP transport tests
**Location**: `tests/remote/*.test.ts`

Tests the remote server implementation:

- [middleware.test.ts](remote/middleware.test.ts) - Express middleware
- [transport.test.ts](remote/transport.test.ts) - StreamableHTTP transport
- [eventStore.test.ts](remote/eventStore.test.ts) - Event replay

## Running Tests

```bash
# Functional (watch mode)
npm test

# Functional (run once)
npm run test:run

# Integration (requires build)
npm run test:integration

# All automated tests
npm run test:all

# Manual tests (real APIs)
npm run test:manual:setup  # First time
npm run test:manual

# Test UI
npm run test:ui
```

## Test Configuration

- [vitest.config.ts](../vitest.config.ts) - Main vitest config (functional tests)
- [vitest.config.integration.ts](../vitest.config.integration.ts) - Integration test config
- [tsconfig.json](tsconfig.json) - TypeScript config for tests

## Mocks ([mocks/](mocks/))

- [scraping-clients.functional-mock.ts](mocks/scraping-clients.functional-mock.ts) - Mock scraping clients
  - `createMockNativeScraper()` - Mock native fetch
  - `createMockFirecrawlScraper()` - Mock Firecrawl API

## Test Patterns

### Functional Test Pattern

```typescript
import { createMockNativeScraper } from '../mocks/scraping-clients.functional-mock';

const clientFactory = {
  createNativeScraper: createMockNativeScraper,
  createFirecrawlScraper: () => { ... }
};

const result = await scrapeTool(server, clientFactory);
```

### Integration Test Pattern

```typescript
import { TestMCPClient } from '../../libs/test-mcp-client';

const client = new TestMCPClient();
await client.connect(transport);
const result = await client.callTool('scrape', { url: '...' });
await client.disconnect();
```

### Manual Test Pattern

```typescript
// Uses real API keys from .env
process.env.FIRECRAWL_API_KEY; // Must be set
const result = await realFirecrawlClient.scrape(url);
```

## Test Isolation

**IMPORTANT**: Call `ResourceStorageFactory.reset()` in `beforeEach` hooks:

```typescript
beforeEach(() => {
  ResourceStorageFactory.reset();
});
```

This prevents test pollution from singleton storage instances.

## Common Issues

- **"Cannot find module"**: Run `npm install` from project root
- **Tests fail in CI but pass locally**: Check package-lock.json is committed
- **Integration tests fail**: Run `npm run build:test` first
- **Manual tests fail**: Check `.env` has real API keys
