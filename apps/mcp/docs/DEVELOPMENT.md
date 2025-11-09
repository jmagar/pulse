# Development Guide

Guide for contributing to and developing Pulse Fetch MCP server.

## Table of Contents

- [Quick Start](#quick-start)
- [Project Structure](#project-structure)
- [Development Setup](#development-setup)
- [Build Process](#build-process)
- [Testing](#testing)
- [Code Quality](#code-quality)
- [Adding Features](#adding-features)
- [Debugging](#debugging)
- [Release Process](#release-process)

---

## Quick Start

```bash
# Clone repository
git clone https://github.com/your-org/pulse.git
cd pulse

# Install dependencies (from root)
npm install

# Build all packages
npm run build

# Run tests
npm run test:run

# Start development server (local mode)
cd local
npm run dev

# Or start remote server (Docker)
docker compose up --build
```

---

## Project Structure

### Monorepo Layout

```
pulse/
├── shared/               # Core business logic (published as @pulsemcp/pulse-shared)
│   ├── mcp/              # MCP tools (scrape, search, map, crawl)
│   ├── clients/          # Service clients (Firecrawl, LLM providers)
│   ├── scraping/         # Scraping strategies and strategy selection
│   ├── storage/          # Resource storage backends (memory, filesystem)
│   ├── processing/       # Content processing (cleaning, extraction)
│   ├── config/           # Configuration validation and health checks
│   ├── utils/            # Shared utilities (logging, validation)
│   └── types.ts          # Shared TypeScript types
│
├── local/                # Stdio transport (published as @pulsemcp/pulse)
│   ├── dist/             # Compiled JavaScript (gitignored)
│   ├── index.ts          # Entry point (stdio transport wrapper)
│   ├── setup-dev.js      # Development symlink setup
│   └── package.json      # Dependencies and scripts
│
├── remote/               # HTTP/SSE transport (published as @pulsemcp/pulse-remote)
│   ├── startup/          # Server startup and initialization
│   ├── middleware/       # Express middleware (CORS, health, validation)
│   ├── transport.ts      # StreamableHTTP transport implementation
│   ├── server.ts         # Express server setup
│   ├── index.ts          # Entry point
│   ├── dist/             # Compiled JavaScript (gitignored)
│   └── package.json      # Dependencies and scripts
│
├── tests/                # Test suites
│   ├── functional/       # Unit tests with mocked dependencies
│   ├── integration/      # Full MCP protocol tests
│   ├── manual/           # Real API tests (not run in CI)
│   ├── mocks/            # Mock implementations for testing
│   └── tsconfig.json     # Test TypeScript configuration
│
├── scripts/              # Build and maintenance scripts
│   ├── run-vitest.js     # Vitest runner with ES module support
│   ├── sync-dependencies.js
│   ├── validate-dependencies.js
│   └── setup-manual-tests.js
│
├── docs/                 # Documentation
│   ├── tools/            # Tool-specific documentation
│   ├── GETTING_STARTED.md
│   ├── CONFIGURATION.md
│   └── ARCHITECTURE.md
│
├── .github/workflows/    # CI/CD pipelines
│   └── ci.yml            # GitHub Actions workflow
│
├── docker-compose.yml    # Docker Compose configuration
├── Dockerfile            # Multi-stage Docker build
├── package.json          # Root workspace configuration
└── .env.example          # Environment variable template
```

### Package Dependencies

```
┌─────────────┐
│    root     │  (workspace coordinator)
└──────┬──────┘
       │
   ┌───┴────────────────────┐
   │                        │
┌──▼──────┐          ┌──────▼───┐
│ shared  │◄─────────┤  local   │
└──┬──────┘          └──────────┘
   │
   │                 ┌──────────┐
   └─────────────────┤  remote  │
                     └──────────┘
```

**Key points:**

- `shared` is independent (no local/remote dependencies)
- `local` and `remote` depend on `shared`
- Development uses symlinks (`local/shared → ../shared/dist`)
- Production packages copy shared dist files

---

## Development Setup

### Prerequisites

- **Node.js**: 18+ (LTS recommended)
- **npm**: 9+ (comes with Node.js)
- **Git**: 2.30+
- **(Optional) Docker**: 20.10+ for remote development

### Installation

```bash
# Install all dependencies (includes workspace packages)
npm install

# Build shared package first
cd shared && npm run build

# Build local package
cd ../local && npm run build

# Build remote package
cd ../remote && npm run build

# Or build all from root
cd ..
npm run build
```

### Environment Configuration

```bash
# Copy example environment file
cp .env.example .env

# Edit with your API keys
nano .env
```

**Required for development:**

```bash
# Optional but recommended
FIRECRAWL_API_KEY=your-key-here
LLM_PROVIDER=anthropic
LLM_API_KEY=your-key-here

# Development settings
DEBUG=true
LOG_FORMAT=text
SKIP_HEALTH_CHECKS=false  # Test auth during development
```

### IDE Configuration

**VS Code (recommended):**

`.vscode/settings.json`:

```json
{
  "typescript.tsdk": "node_modules/typescript/lib",
  "typescript.enablePromptUseWorkspaceTsdk": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "eslint.workingDirectories": ["shared", "local", "remote"]
}
```

**Extensions:**

- ESLint
- Prettier
- TypeScript and JavaScript Language Features

---

## Build Process

### Build Commands

**From root (recommended):**

```bash
npm run build         # Build all packages
npm run clean         # Remove all dist/ folders
```

**Per package:**

```bash
# Shared
cd shared
npm run build         # tsc → dist/

# Local
cd local
npm run build         # prebuild → tsc → postbuild
                      # prebuild: builds shared, runs setup-dev.js
                      # postbuild: creates symlink to shared/dist

# Remote
cd remote
npm run build         # Same as local
```

### Build Order

**Critical:** Shared must be built before local/remote

```bash
# ✅ Correct order
npm run build  # Handled automatically

# ❌ Wrong (will fail)
cd local && npm run build  # Error: shared/dist not found
```

### TypeScript Configuration

**Root `tsconfig.json`:**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

**Per-package tsconfig.json:**

- Extends root configuration
- Specifies include/exclude patterns
- Sets outDir to `./dist`

---

## Testing

### Test Types

#### 1. Functional Tests (`tests/functional/`)

**Purpose:** Unit tests with mocked dependencies

**Run:**

```bash
npm test              # Watch mode
npm run test:run      # Run once
npm run test:ui       # Open Vitest UI
```

**Configuration:** `vitest.config.ts`

**Example test structure:**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { scrapeTool } from '../../shared/mcp/tools/scrape/index.js';
import { createMockScrapingClients } from '../mocks/scraping-clients.functional-mock.js';

describe('Scrape Tool', () => {
  let mockClients;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClients = createMockScrapingClients();
  });

  it('should scrape successfully', async () => {
    mockClients.mocks.native.setMockResponse({
      success: true,
      status: 200,
      data: '<h1>Test</h1>',
    });

    const result = await scrapeTool.handler({ url: 'https://example.com' });

    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain('Test');
  });
});
```

**Key practices:**

- Use `createMockScrapingClients()` helper
- Call `ResourceStorageFactory.reset()` in `beforeEach`
- Test both success and error paths
- Verify response structure against MCP schema

#### 2. Integration Tests (`tests/integration/`)

**Purpose:** Full MCP protocol tests with TestMCPClient

**Run:**

```bash
npm run test:integration          # Run once
npm run test:integration:watch    # Watch mode
```

**Configuration:** `vitest.config.integration.ts`

**Example:**

```typescript
import { TestMCPClient } from '@pulsemcp/mcp-test-client';

describe('Integration: Scrape Tool', () => {
  let client: TestMCPClient;

  beforeEach(async () => {
    client = new TestMCPClient('local/dist/index.js');
    await client.connect();
  });

  afterEach(async () => {
    await client.disconnect();
  });

  it('should list scrape tool', async () => {
    const tools = await client.listTools();
    expect(tools.find((t) => t.name === 'scrape')).toBeDefined();
  });

  it('should call scrape tool', async () => {
    const result = await client.callTool('scrape', {
      url: 'https://example.com',
    });
    expect(result.isError).toBe(false);
  });
});
```

#### 3. Manual Tests (`tests/manual/`)

**Purpose:** Real API calls (not run in CI)

**Setup:**

```bash
npm run test:manual:setup
```

**Run:**

```bash
npm run test:manual
```

**Why manual tests:**

- Test real Firecrawl API integration
- Test real LLM provider integration
- Consume API credits
- Verify actual external service behavior

**Structure:**

```
tests/manual/
├── features/
│   ├── firecrawl-scraping.test.ts
│   ├── scrape-tool.test.ts
│   └── crawl.test.ts
├── pages/
│   └── pages.manual.test.ts
└── .env  # Copied from root during setup
```

### Running Tests

**All tests:**

```bash
npm run test:all  # Functional + Integration
```

**With coverage:**

```bash
npm run test:run -- --coverage
```

**Specific file:**

```bash
npm test scrape-tool
```

**Watch mode:**

```bash
npm test  # Functional only
npm run test:integration:watch  # Integration only
```

### Test Patterns

**✅ Good practices:**

```typescript
// 1. Always reset storage
beforeEach(() => {
  ResourceStorageFactory.reset();
});

// 2. Use unique URLs to avoid cache pollution
const url = `https://example.com/test-${Date.now()}`;

// 3. Wait for timestamps to differ (memory storage)
await new Promise((resolve) => setTimeout(resolve, 1));

// 4. Verify MCP response structure
const validation = CallToolResultSchema.safeParse(result);
expect(validation.success).toBe(true);

// 5. Test both success and error paths
it('should handle network errors', async () => {
  mockClients.mocks.native.setMockResponse({
    success: false,
    error: 'Network timeout',
  });
  const result = await tool.handler({ url });
  expect(result.isError).toBe(true);
});
```

**❌ Anti-patterns:**

```typescript
// Don't share state between tests
let sharedClient; // ❌

// Don't use real URLs in functional tests
const url = 'https://google.com'; // ❌ Use mocks

// Don't skip storage reset
// beforeEach(() => {
//   // Missing: ResourceStorageFactory.reset();
// });  // ❌

// Don't test implementation details
expect(tool.internalMethod).toHaveBeenCalled(); // ❌
```

---

## Code Quality

### Linting

**Run ESLint:**

```bash
npm run lint          # Check for issues
npm run lint:fix      # Auto-fix issues
```

**Configuration:** `eslint.config.js`

**Rules:**

- TypeScript ESLint recommended rules
- No unused variables
- No explicit `any` types
- Consistent import order

**Pre-commit hook:** Husky runs linting automatically

### Formatting

**Run Prettier:**

```bash
npm run format        # Format all files
npm run format:check  # Check formatting
```

**Configuration:** `.prettierrc.json`

```json
{
  "semi": true,
  "singleQuote": true,
  "printWidth": 100,
  "tabWidth": 2,
  "trailingComma": "es5"
}
```

### Type Checking

**Run TypeScript compiler:**

```bash
npm run build  # Compilation errors shown during build
```

**Strict mode enabled:**

- `strict: true`
- No implicit `any`
- Strict null checks
- Strict function types

### Pre-commit Hooks

**Configured with Husky + lint-staged:**

`.husky/pre-commit`:

```bash
#!/bin/sh
npx lint-staged
```

**lint-staged.config.js:**

```javascript
export default {
  'shared/**/*.ts': ['eslint --fix', 'prettier --write'],
  'local/**/*.ts': ['eslint --fix', 'prettier --write'],
  'remote/**/*.ts': ['eslint --fix', 'prettier --write'],
  '*.{js,json,md}': ['prettier --write'],
};
```

**Bypass (not recommended):**

```bash
git commit --no-verify
```

---

## Adding Features

### Adding a New Tool

**1. Create tool directory:**

```bash
mkdir -p shared/mcp/tools/your-tool
```

**2. Define schema (`shared/mcp/tools/your-tool/schema.ts`):**

```typescript
import { z } from 'zod';

export const yourToolSchema = z.object({
  url: z.string().url(),
  // ... other parameters
});

export type YourToolParams = z.infer<typeof yourToolSchema>;
```

**3. Implement handler (`shared/mcp/tools/your-tool/index.ts`):**

```typescript
import type { ToolDefinition } from '../../types.js';
import { yourToolSchema } from './schema.js';

export const yourTool: ToolDefinition = {
  name: 'your-tool',
  description: 'Description of your tool',
  inputSchema: yourToolSchema,
  async handler(args: unknown) {
    // Validate
    const validated = yourToolSchema.parse(args);

    // Implement logic
    // ...

    // Return MCP response
    return {
      content: [
        {
          type: 'text',
          text: 'Result',
        },
      ],
      isError: false,
    };
  },
};
```

**4. Register tool (`shared/server.ts`):**

```typescript
import { yourTool } from './mcp/tools/your-tool/index.js';

export function registerTools(server: Server) {
  registerTool(server, yourTool);
  // ... other tools
}
```

**5. Write tests (`tests/functional/your-tool.test.ts`):**

```typescript
import { yourTool } from '../../shared/mcp/tools/your-tool/index.js';

describe('Your Tool', () => {
  it('should handle valid input', async () => {
    const result = await yourTool.handler({ url: 'https://example.com' });
    expect(result.isError).toBe(false);
  });
});
```

**6. Document (`docs/tools/YOUR_TOOL.md`):**

- Parameters
- Usage examples
- Response format

### Adding a New Client

**1. Create client (`shared/clients/your-service/index.ts`):**

```typescript
export class YourServiceClient {
  constructor(private apiKey: string) {}

  async fetch(url: string): Promise<YourServiceResponse> {
    // Implementation
  }
}
```

**2. Add factory (`shared/clients/index.ts`):**

```typescript
export function createYourServiceClient(): YourServiceClient | null {
  const apiKey = process.env.YOUR_SERVICE_API_KEY;
  if (!apiKey) return null;
  return new YourServiceClient(apiKey);
}
```

**3. Update environment validation (`shared/config/validation-schemas.ts`):**

```typescript
YOUR_SERVICE_API_KEY: z.string().optional(),
```

**4. Document in `docs/CONFIGURATION.md`**

---

## Debugging

### Local Mode Debugging

**VS Code launch configuration (`.vscode/launch.json`):**

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Local",
      "program": "${workspaceFolder}/local/dist/index.js",
      "env": {
        "DEBUG": "true"
      }
    }
  ]
}
```

### Remote Mode Debugging

**Terminal 1 (server):**

```bash
cd remote
DEBUG=true npm run dev
```

**Terminal 2 (test requests):**

```bash
curl -X POST http://localhost:3060/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "scrape",
      "arguments": { "url": "https://example.com" }
    },
    "id": 1
  }'
```

### Debug Logging

**Enable verbose logging:**

```bash
DEBUG=true npm start
```

**Log locations:**

- Local mode: stdout (Claude Desktop logs)
- Remote mode: Docker logs (`docker compose logs -f`)

**Log format:**

```
[2025-01-08 12:34:56] [INFO] Scraping https://example.com using native strategy
[2025-01-08 12:34:57] [DEBUG] Cache lookup: miss
[2025-01-08 12:34:58] [INFO] Scrape successful (1234ms)
```

---

## Release Process

### Version Bumping

```bash
# From root
npm version patch  # 0.0.1 → 0.0.2
npm version minor  # 0.0.2 → 0.1.0
npm version major  # 0.1.0 → 1.0.0
```

**This updates:**

- `package.json` (root, shared, local, remote)
- `package-lock.json`
- Creates git tag

### Changelog

**Update `CHANGELOG.md`:**

```markdown
## [0.1.0] - 2025-01-08

### Added

- New `your-tool` for X functionality
- LLM provider support for Y

### Changed

- Improved error messages for scrape failures

### Fixed

- Cache key generation bug with extraction

### Deprecated

- Old parameter format (removed in 1.0.0)
```

### Publishing (NPM)

**Prepare packages:**

```bash
# Build all packages
npm run build

# Run all tests
npm run test:all

# Validate dependencies
npm run deps:validate
```

**Publish:**

```bash
# Publish shared
cd shared
npm publish --access public

# Publish local
cd ../local
npm publish --access public

# Publish remote
cd ../remote
npm publish --access public
```

### CI/CD Pipeline

**GitHub Actions (`.github/workflows/ci.yml`):**

```yaml
name: CI

on: [push, pull_request]

jobs:
  validate-dependencies:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm install
      - run: npm run deps:validate

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm install
      - run: npm run build
      - run: npm run test:run
      - run: npm run test:integration

  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm install
      - run: npm run lint
```

---

## Contribution Checklist

Before submitting a PR:

- [ ] Code follows TypeScript style guide
- [ ] Added tests for new features
- [ ] All tests pass (`npm run test:all`)
- [ ] Linting passes (`npm run lint`)
- [ ] Formatting passes (`npm run format:check`)
- [ ] Dependencies validated (`npm run deps:validate`)
- [ ] Updated documentation
- [ ] Updated CHANGELOG.md
- [ ] Commit messages are descriptive
- [ ] Branch is up to date with main

---

## Getting Help

- **Documentation**: [Documentation Index](index.md)
- **Architecture**: [ARCHITECTURE.md](ARCHITECTURE.md)
- **Troubleshooting**: [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
- **GitHub Issues**: [github.com/your-org/pulse/issues](https://github.com/your-org/pulse/issues)
- **Discussions**: [github.com/your-org/pulse/discussions](https://github.com/your-org/pulse/discussions)

---

## Next Steps

- **[Architecture](ARCHITECTURE.md)** - Understand system design
- **[API Reference](API_REFERENCE.md)** - Tool schemas and types
- **[Performance Guide](PERFORMANCE.md)** - Optimization strategies
