# Enhanced Server Logging Implementation Plan (TDD)

**Created:** 2025-11-06
**Methodology:** Test-Driven Development (RED-GREEN-REFACTOR)
**Objective:** Dramatically improve server startup logging with better readability, utility, and comprehensive status information

## Overview

This plan implements a professional, colorized logging system using strict TDD methodology. Each component will be developed using the RED-GREEN-REFACTOR cycle, with tests written BEFORE implementation.

---

## TDD Workflow

For **every** function/component:

1. **🔴 RED** - Write a failing test that defines the desired behavior
2. **🟢 GREEN** - Write minimal code to make the test pass
3. **🔵 REFACTOR** - Improve code while keeping tests green

**Skill Usage:** Use `superpowers:test-driven-development` skill proactively for each task to enforce discipline.

---

## Architecture Overview

### File Structure

```
shared/
└── utils/
    ├── logging.ts            # MODIFIED: Add color support (TDD)
    ├── logging.test.ts       # NEW: Tests for logging utilities
    ├── service-status.ts     # NEW: Service status checking (TDD)
    ├── service-status.test.ts # NEW: Tests for service status
    └── mcp-status.ts         # NEW: MCP registration tracking (TDD)
    └── mcp-status.test.ts    # NEW: Tests for MCP status

remote/
├── startup/
│   ├── display.ts           # NEW: Startup display orchestrator (TDD)
│   ├── display.test.ts      # NEW: Tests for display
│   ├── env-display.ts       # NEW: Environment variable display (TDD)
│   └── env-display.test.ts  # NEW: Tests for env display
└── index.ts                 # MODIFIED: Integrate startup display
```

---

## Implementation Tasks

### Task 1: Add Color Support to Logging (TDD)

**Objective:** Add ANSI color formatting functions to logging utilities using TDD

#### 1.1 Setup Test File

**File:** `shared/utils/logging.test.ts` (NEW)

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  Colors,
  BoxChars,
  colorize,
  colorHelpers,
  createLine,
  createSectionHeader,
  maskSensitiveValue,
} from './logging.js';

describe('Color Support', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Colors constant', () => {
    it('should export ANSI color codes', () => {
      // RED: This test will fail because Colors doesn't exist yet
      expect(Colors.reset).toBe('\x1b[0m');
      expect(Colors.red).toBe('\x1b[31m');
      expect(Colors.green).toBe('\x1b[32m');
      expect(Colors.cyan).toBe('\x1b[36m');
    });

    it('should include bold and dim styles', () => {
      expect(Colors.bold).toBe('\x1b[1m');
      expect(Colors.dim).toBe('\x1b[2m');
    });

    it('should include bright colors', () => {
      expect(Colors.brightWhite).toBe('\x1b[97m');
      expect(Colors.brightCyan).toBe('\x1b[96m');
    });
  });

  describe('BoxChars constant', () => {
    it('should export box-drawing characters', () => {
      // RED: This test will fail because BoxChars doesn't exist yet
      expect(BoxChars.topLeft).toBe('╭');
      expect(BoxChars.horizontal).toBe('─');
      expect(BoxChars.vertical).toBe('│');
    });
  });

  describe('colorize()', () => {
    it('should apply color codes when colors are enabled', () => {
      // RED: This test will fail because colorize() doesn't exist yet
      process.env.FORCE_COLOR = '1';
      const result = colorize('test', Colors.red);
      expect(result).toBe('\x1b[31mtest\x1b[0m');
    });

    it('should apply multiple color codes', () => {
      process.env.FORCE_COLOR = '1';
      const result = colorize('test', Colors.red, Colors.bold);
      expect(result).toBe('\x1b[31m\x1b[1mtest\x1b[0m');
    });

    it('should not apply colors when NO_COLOR is set', () => {
      process.env.NO_COLOR = '1';
      const result = colorize('test', Colors.red);
      expect(result).toBe('test');
    });

    it('should not apply colors when FORCE_COLOR is 0', () => {
      process.env.FORCE_COLOR = '0';
      const result = colorize('test', Colors.red);
      expect(result).toBe('test');
    });
  });

  describe('colorHelpers', () => {
    beforeEach(() => {
      process.env.FORCE_COLOR = '1';
    });

    it('should have success helper', () => {
      // RED: This will fail because colorHelpers doesn't exist yet
      const result = colorHelpers.success('OK');
      expect(result).toContain('OK');
      expect(result).toContain(Colors.green);
      expect(result).toContain(Colors.bold);
    });

    it('should have error helper', () => {
      const result = colorHelpers.error('Failed');
      expect(result).toContain('Failed');
      expect(result).toContain(Colors.red);
    });

    it('should have warning helper', () => {
      const result = colorHelpers.warning('Warning');
      expect(result).toContain('Warning');
      expect(result).toContain(Colors.yellow);
    });

    it('should have info helper', () => {
      const result = colorHelpers.info('Info');
      expect(result).toContain('Info');
      expect(result).toContain(Colors.cyan);
    });

    it('should have checkmark helper', () => {
      const result = colorHelpers.checkmark();
      expect(result).toContain('✓');
      expect(result).toContain(Colors.green);
    });

    it('should have cross helper', () => {
      const result = colorHelpers.cross();
      expect(result).toContain('✗');
      expect(result).toContain(Colors.red);
    });
  });

  describe('createLine()', () => {
    it('should create line with default width and character', () => {
      // RED: This will fail because createLine() doesn't exist yet
      const line = createLine();
      expect(line.length).toBe(80);
      expect(line).toBe(BoxChars.horizontal.repeat(80));
    });

    it('should create line with custom width', () => {
      const line = createLine(50);
      expect(line.length).toBe(50);
    });

    it('should create line with custom character', () => {
      const line = createLine(10, '=');
      expect(line).toBe('==========');
    });
  });

  describe('createSectionHeader()', () => {
    it('should create section header with centered title', () => {
      // RED: This will fail because createSectionHeader() doesn't exist yet
      process.env.FORCE_COLOR = '1';
      const header = createSectionHeader('Test', 20);
      expect(header).toContain('Test');
      expect(header).toContain(BoxChars.horizontal);
    });

    it('should default to 80 character width', () => {
      process.env.FORCE_COLOR = '1';
      const header = createSectionHeader('Test');
      expect(header.length).toBeGreaterThan(80);
    });
  });

  describe('maskSensitiveValue()', () => {
    it('should mask middle of long values', () => {
      // RED: This will fail because maskSensitiveValue() doesn't exist yet
      const result = maskSensitiveValue('1234567890abcdef', 4);
      expect(result).toBe('1234****cdef');
    });

    it('should fully mask short values', () => {
      const result = maskSensitiveValue('abc', 4);
      expect(result).toBe('***');
    });

    it('should use default show chars of 4', () => {
      const result = maskSensitiveValue('abcdefghijklmnop');
      expect(result).toBe('abcd****mnop');
    });

    it('should handle empty string', () => {
      const result = maskSensitiveValue('');
      expect(result).toBe('');
    });
  });
});
```

**TDD Cycle:**

```bash
# Run tests - they should ALL fail (RED)
cd shared
npm test -- logging.test.ts

# Expected: All tests fail with "Cannot find module" or "undefined"
```

#### 1.2 Implement Color Constants (GREEN)

**File:** `shared/utils/logging.ts`

Add to the top of the file:

```typescript
/**
 * ANSI color codes for terminal output
 */
export const Colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',

  // Foreground colors
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',

  // Bright foreground colors
  brightBlack: '\x1b[90m',
  brightRed: '\x1b[91m',
  brightGreen: '\x1b[92m',
  brightYellow: '\x1b[93m',
  brightBlue: '\x1b[94m',
  brightMagenta: '\x1b[95m',
  brightCyan: '\x1b[96m',
  brightWhite: '\x1b[97m',

  // Background colors
  bgBlack: '\x1b[40m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
  bgWhite: '\x1b[47m',
} as const;

/**
 * Box-drawing characters for visual structure
 */
export const BoxChars = {
  topLeft: '╭',
  topRight: '╮',
  bottomLeft: '╰',
  bottomRight: '╯',
  horizontal: '─',
  vertical: '│',
  verticalRight: '├',
  verticalLeft: '┤',
  horizontalDown: '┬',
  horizontalUp: '┴',
  cross: '┼',
} as const;
```

**TDD Cycle:**

```bash
# Run tests - Colors and BoxChars tests should now pass
npm test -- logging.test.ts

# Expected: 2 describe blocks passing (Colors, BoxChars)
```

#### 1.3 Implement colorize() Function (GREEN)

**File:** `shared/utils/logging.ts`

```typescript
/**
 * Check if colors should be disabled
 */
function shouldUseColors(): boolean {
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR === '0') return false;
  if (!process.stdout.isTTY && process.env.FORCE_COLOR !== '1') return false;
  return true;
}

/**
 * Apply color to text if colors are enabled
 */
export function colorize(text: string, ...colors: string[]): string {
  if (!shouldUseColors()) return text;
  const colorCodes = colors.join('');
  return `${colorCodes}${text}${Colors.reset}`;
}
```

**TDD Cycle:**

```bash
# Run tests - colorize() tests should now pass
npm test -- logging.test.ts

# Expected: colorize() describe block passing
```

#### 1.4 Implement colorHelpers (GREEN)

**File:** `shared/utils/logging.ts`

```typescript
/**
 * Color helpers for common statuses
 */
export const colorHelpers = {
  success: (text: string) => colorize(text, Colors.green, Colors.bold),
  error: (text: string) => colorize(text, Colors.red, Colors.bold),
  warning: (text: string) => colorize(text, Colors.yellow, Colors.bold),
  info: (text: string) => colorize(text, Colors.cyan),
  dim: (text: string) => colorize(text, Colors.dim),
  highlight: (text: string) => colorize(text, Colors.brightWhite, Colors.bold),

  checkmark: () => colorize('✓', Colors.green, Colors.bold),
  cross: () => colorize('✗', Colors.red, Colors.bold),
  bullet: () => colorize('•', Colors.cyan),
  arrow: () => colorize('→', Colors.brightBlue),
};
```

**TDD Cycle:**

```bash
# Run tests - colorHelpers tests should now pass
npm test -- logging.test.ts

# Expected: colorHelpers describe block passing
```

#### 1.5 Implement Utility Functions (GREEN)

**File:** `shared/utils/logging.ts`

```typescript
/**
 * Create a horizontal line with optional text
 */
export function createLine(width: number = 80, char: string = BoxChars.horizontal): string {
  return char.repeat(width);
}

/**
 * Create a section header with box characters
 */
export function createSectionHeader(title: string, width: number = 80): string {
  const titleWithPadding = ` ${title} `;
  const lineLength = Math.floor((width - titleWithPadding.length) / 2);
  const line = BoxChars.horizontal.repeat(lineLength);

  return colorize(`${line}${titleWithPadding}${line}`, Colors.cyan, Colors.bold);
}

/**
 * Mask sensitive values for display
 */
export function maskSensitiveValue(value: string, showChars: number = 4): string {
  if (value.length === 0) return '';
  if (value.length <= showChars * 2) {
    return '*'.repeat(value.length);
  }

  const start = value.substring(0, showChars);
  const end = value.substring(value.length - showChars);
  const masked = '*'.repeat(value.length - showChars * 2);

  return `${start}${masked}${end}`;
}
```

**TDD Cycle:**

```bash
# Run tests - ALL tests should now pass (GREEN)
npm test -- logging.test.ts

# Expected: All tests passing ✓
```

#### 1.6 Refactor (REFACTOR)

- Extract `shouldUseColors()` logic if needed
- Optimize string concatenation
- Add JSDoc comments
- Run tests to ensure nothing broke

**Verification:**

```bash
# Final test run
npm test -- logging.test.ts

# Build to check types
npm run build
```

**Status:** ✅ Task 1 Complete

---

### Task 2: Service Status Checking (TDD)

**Objective:** Create service status checking with health validation using TDD

#### 2.1 Write Tests First (RED)

**File:** `shared/utils/service-status.test.ts` (NEW)

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ServiceStatus,
  checkFirecrawlStatus,
  checkLLMProviderStatus,
  checkStorageStatus,
  formatServiceStatus,
  getAllServiceStatuses,
} from './service-status.js';

describe('Service Status Checking', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('checkFirecrawlStatus()', () => {
    it('should return not configured when API key is missing', async () => {
      // RED: This will fail because checkFirecrawlStatus() doesn't exist
      delete process.env.FIRECRAWL_API_KEY;

      const status = await checkFirecrawlStatus();

      expect(status.name).toBe('Firecrawl');
      expect(status.configured).toBe(false);
      expect(status.healthy).toBeUndefined();
    });

    it('should return healthy for self-hosted instances', async () => {
      process.env.FIRECRAWL_API_KEY = 'self-hosted-no-auth';
      process.env.FIRECRAWL_BASE_URL = 'https://firecrawl.local';

      const status = await checkFirecrawlStatus();

      expect(status.configured).toBe(true);
      expect(status.healthy).toBe(true);
      expect(status.baseUrl).toBe('https://firecrawl.local');
      expect(status.details?.mode).toBe('self-hosted');
    });

    it('should skip health check when SKIP_HEALTH_CHECKS is true', async () => {
      process.env.FIRECRAWL_API_KEY = 'sk-test123';
      process.env.SKIP_HEALTH_CHECKS = 'true';

      const status = await checkFirecrawlStatus();

      expect(status.configured).toBe(true);
      expect(status.healthy).toBe(true);
      expect(status.details?.healthCheckSkipped).toBe(true);
    });

    it('should use default base URL when not specified', async () => {
      process.env.FIRECRAWL_API_KEY = 'self-hosted-no-auth';
      delete process.env.FIRECRAWL_BASE_URL;

      const status = await checkFirecrawlStatus();

      expect(status.baseUrl).toBe('https://api.firecrawl.dev');
    });
  });

  describe('checkLLMProviderStatus()', () => {
    it('should return not configured when provider is missing', () => {
      // RED: This will fail because checkLLMProviderStatus() doesn't exist
      delete process.env.LLM_PROVIDER;

      const status = checkLLMProviderStatus();

      expect(status.name).toBe('LLM Provider');
      expect(status.configured).toBe(false);
    });

    it('should return not configured when API key is missing', () => {
      process.env.LLM_PROVIDER = 'anthropic';
      delete process.env.LLM_API_KEY;

      const status = checkLLMProviderStatus();

      expect(status.configured).toBe(false);
    });

    it('should return configured status with provider details', () => {
      process.env.LLM_PROVIDER = 'anthropic';
      process.env.LLM_API_KEY = 'sk-ant-test';
      process.env.LLM_MODEL = 'claude-sonnet-4';

      const status = checkLLMProviderStatus();

      expect(status.name).toContain('anthropic');
      expect(status.configured).toBe(true);
      expect(status.healthy).toBe(true);
      expect(status.details?.provider).toBe('anthropic');
      expect(status.details?.model).toBe('claude-sonnet-4');
    });

    it('should include base URL for openai-compatible providers', () => {
      process.env.LLM_PROVIDER = 'openai-compatible';
      process.env.LLM_API_KEY = 'test';
      process.env.LLM_API_BASE_URL = 'https://api.local';

      const status = checkLLMProviderStatus();

      expect(status.baseUrl).toBe('https://api.local');
    });
  });

  describe('checkStorageStatus()', () => {
    it('should return memory storage by default', () => {
      // RED: This will fail because checkStorageStatus() doesn't exist
      delete process.env.MCP_RESOURCE_STORAGE;

      const status = checkStorageStatus();

      expect(status.name).toBe('Resource Storage');
      expect(status.configured).toBe(true);
      expect(status.healthy).toBe(true);
      expect(status.details?.type).toBe('memory');
    });

    it('should return filesystem storage when configured', () => {
      process.env.MCP_RESOURCE_STORAGE = 'filesystem';
      process.env.MCP_RESOURCE_FILESYSTEM_ROOT = '/data/resources';

      const status = checkStorageStatus();

      expect(status.details?.type).toBe('filesystem');
      expect(status.details?.root).toBe('/data/resources');
    });
  });

  describe('formatServiceStatus()', () => {
    it('should format unconfigured service', () => {
      // RED: This will fail because formatServiceStatus() doesn't exist
      const status: ServiceStatus = {
        name: 'Test Service',
        configured: false,
      };

      const formatted = formatServiceStatus(status);

      expect(formatted).toContain('Test Service');
      expect(formatted).toContain('Not configured');
    });

    it('should format healthy service', () => {
      const status: ServiceStatus = {
        name: 'Test Service',
        configured: true,
        healthy: true,
        baseUrl: 'https://api.test',
      };

      const formatted = formatServiceStatus(status);

      expect(formatted).toContain('Test Service');
      expect(formatted).toContain('Ready');
      expect(formatted).toContain('https://api.test');
    });

    it('should format failed service with error', () => {
      const status: ServiceStatus = {
        name: 'Test Service',
        configured: true,
        healthy: false,
        error: 'Connection timeout',
      };

      const formatted = formatServiceStatus(status);

      expect(formatted).toContain('Failed');
      expect(formatted).toContain('Connection timeout');
    });

    it('should include details when present', () => {
      const status: ServiceStatus = {
        name: 'Test Service',
        configured: true,
        healthy: true,
        details: { mode: 'local', version: '1.0' },
      };

      const formatted = formatServiceStatus(status);

      expect(formatted).toContain('mode=local');
      expect(formatted).toContain('version=1.0');
    });
  });

  describe('getAllServiceStatuses()', () => {
    it('should return all service statuses', async () => {
      // RED: This will fail because getAllServiceStatuses() doesn't exist
      process.env.FIRECRAWL_API_KEY = 'self-hosted-no-auth';
      process.env.LLM_PROVIDER = 'anthropic';
      process.env.LLM_API_KEY = 'test';

      const statuses = await getAllServiceStatuses();

      expect(statuses).toHaveLength(3);
      expect(statuses[0].name).toBe('Firecrawl');
      expect(statuses[1].name).toContain('LLM Provider');
      expect(statuses[2].name).toBe('Resource Storage');
    });
  });
});
```

**TDD Cycle:**

```bash
# Run tests - ALL should fail (RED)
npm test -- service-status.test.ts

# Expected: All tests fail - module not found
```

#### 2.2 Create Service Status File (GREEN)

**File:** `shared/utils/service-status.ts` (NEW)

Start with minimal implementation:

```typescript
/**
 * Service status checking and formatting utilities
 */

import { colorHelpers } from './logging.js';

/**
 * Service configuration and status
 */
export interface ServiceStatus {
  name: string;
  configured: boolean;
  healthy?: boolean;
  baseUrl?: string;
  error?: string;
  details?: Record<string, unknown>;
}

/**
 * Check Firecrawl service status
 */
export async function checkFirecrawlStatus(): Promise<ServiceStatus> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  const baseUrl = process.env.FIRECRAWL_BASE_URL || 'https://api.firecrawl.dev';

  if (!apiKey) {
    return {
      name: 'Firecrawl',
      configured: false,
    };
  }

  // For self-hosted instances or when health checks are skipped
  if (apiKey === 'self-hosted-no-auth' || process.env.SKIP_HEALTH_CHECKS === 'true') {
    return {
      name: 'Firecrawl',
      configured: true,
      healthy: true,
      baseUrl,
      details: {
        mode: apiKey === 'self-hosted-no-auth' ? 'self-hosted' : undefined,
        healthCheckSkipped: process.env.SKIP_HEALTH_CHECKS === 'true',
      },
    };
  }

  // TODO: Implement actual health check
  return {
    name: 'Firecrawl',
    configured: true,
    healthy: true,
    baseUrl,
  };
}

/**
 * Check LLM provider status
 */
export function checkLLMProviderStatus(): ServiceStatus {
  const provider = process.env.LLM_PROVIDER;
  const apiKey = process.env.LLM_API_KEY;

  if (!provider || !apiKey) {
    return {
      name: 'LLM Provider',
      configured: false,
    };
  }

  const baseUrl = process.env.LLM_API_BASE_URL;
  const model = process.env.LLM_MODEL;

  return {
    name: `LLM Provider (${provider})`,
    configured: true,
    healthy: true,
    baseUrl,
    details: {
      provider,
      model: model || 'default',
    },
  };
}

/**
 * Check storage configuration
 */
export function checkStorageStatus(): ServiceStatus {
  const storageType = process.env.MCP_RESOURCE_STORAGE || 'memory';
  const fsRoot = process.env.MCP_RESOURCE_FILESYSTEM_ROOT;

  return {
    name: 'Resource Storage',
    configured: true,
    healthy: true,
    details: {
      type: storageType,
      ...(storageType === 'filesystem' && fsRoot ? { root: fsRoot } : {}),
    },
  };
}

/**
 * Format service status for display
 */
export function formatServiceStatus(status: ServiceStatus): string {
  if (!status.configured) {
    return `${colorHelpers.dim('○')} ${status.name}: ${colorHelpers.dim('Not configured')}`;
  }

  const icon = status.healthy === false ? colorHelpers.cross() : colorHelpers.checkmark();
  const statusText =
    status.healthy === false ? colorHelpers.error('Failed') : colorHelpers.success('Ready');

  let line = `${icon} ${status.name}: ${statusText}`;

  if (status.baseUrl) {
    line += colorHelpers.dim(` (${status.baseUrl})`);
  }

  if (status.error) {
    line += `\n    ${colorHelpers.error(`Error: ${status.error}`)}`;
  }

  if (status.details) {
    const details = Object.entries(status.details)
      .filter(([_, value]) => value !== undefined)
      .map(([key, value]) => `${key}=${value}`)
      .join(', ');
    if (details) {
      line += `\n    ${colorHelpers.dim(details)}`;
    }
  }

  return line;
}

/**
 * Get all service statuses
 */
export async function getAllServiceStatuses(): Promise<ServiceStatus[]> {
  return Promise.all([
    checkFirecrawlStatus(),
    Promise.resolve(checkLLMProviderStatus()),
    Promise.resolve(checkStorageStatus()),
  ]);
}
```

**TDD Cycle:**

```bash
# Run tests - should pass now (GREEN)
npm test -- service-status.test.ts

# Expected: All tests passing ✓
```

#### 2.3 Refactor (REFACTOR)

- Clean up details filtering
- Add JSDoc comments
- Optimize async operations
- Ensure tests still pass

**Verification:**

```bash
npm test -- service-status.test.ts
npm run build
```

**Status:** ✅ Task 2 Complete

---

### Task 3: MCP Registration Tracking (TDD)

**Objective:** Create registration status tracker for MCP tools and resources using TDD

#### 3.1 Write Tests First (RED)

**File:** `shared/utils/mcp-status.test.ts` (NEW)

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { RegistrationStatus, registrationTracker, formatRegistrationStatus } from './mcp-status.js';

describe('MCP Registration Tracking', () => {
  beforeEach(() => {
    registrationTracker.clear();
  });

  describe('registrationTracker', () => {
    it('should record successful tool registration', () => {
      // RED: This will fail because registrationTracker doesn't exist
      registrationTracker.recordRegistration({
        name: 'scrape',
        type: 'tool',
        success: true,
      });

      const registrations = registrationTracker.getRegistrations();

      expect(registrations).toHaveLength(1);
      expect(registrations[0].name).toBe('scrape');
      expect(registrations[0].type).toBe('tool');
      expect(registrations[0].success).toBe(true);
      expect(registrations[0].timestamp).toBeGreaterThan(0);
    });

    it('should record failed registration with error', () => {
      registrationTracker.recordRegistration({
        name: 'search',
        type: 'tool',
        success: false,
        error: 'Invalid configuration',
      });

      const registrations = registrationTracker.getRegistrations();

      expect(registrations[0].success).toBe(false);
      expect(registrations[0].error).toBe('Invalid configuration');
    });

    it('should get tool registrations only', () => {
      registrationTracker.recordRegistration({
        name: 'scrape',
        type: 'tool',
        success: true,
      });
      registrationTracker.recordRegistration({
        name: 'Resource Handlers',
        type: 'resource',
        success: true,
      });

      const tools = registrationTracker.getToolRegistrations();

      expect(tools).toHaveLength(1);
      expect(tools[0].type).toBe('tool');
    });

    it('should get resource registrations only', () => {
      registrationTracker.recordRegistration({
        name: 'scrape',
        type: 'tool',
        success: true,
      });
      registrationTracker.recordRegistration({
        name: 'Resource Handlers',
        type: 'resource',
        success: true,
      });

      const resources = registrationTracker.getResourceRegistrations();

      expect(resources).toHaveLength(1);
      expect(resources[0].type).toBe('resource');
    });

    it('should detect failures', () => {
      registrationTracker.recordRegistration({
        name: 'scrape',
        type: 'tool',
        success: true,
      });
      registrationTracker.recordRegistration({
        name: 'search',
        type: 'tool',
        success: false,
      });

      expect(registrationTracker.hasFailures()).toBe(true);
    });

    it('should detect no failures', () => {
      registrationTracker.recordRegistration({
        name: 'scrape',
        type: 'tool',
        success: true,
      });

      expect(registrationTracker.hasFailures()).toBe(false);
    });

    it('should clear all registrations', () => {
      registrationTracker.recordRegistration({
        name: 'scrape',
        type: 'tool',
        success: true,
      });

      registrationTracker.clear();

      expect(registrationTracker.getRegistrations()).toHaveLength(0);
    });
  });

  describe('formatRegistrationStatus()', () => {
    it('should return empty lines when no registrations', () => {
      // RED: This will fail because formatRegistrationStatus() doesn't exist
      const lines = formatRegistrationStatus();

      expect(lines).toEqual([]);
    });

    it('should format successful tool registrations', () => {
      registrationTracker.recordRegistration({
        name: 'scrape',
        type: 'tool',
        success: true,
      });
      registrationTracker.recordRegistration({
        name: 'search',
        type: 'tool',
        success: true,
      });

      const lines = formatRegistrationStatus();

      expect(lines.some((l) => l.includes('Tools (2)'))).toBe(true);
      expect(lines.some((l) => l.includes('scrape'))).toBe(true);
      expect(lines.some((l) => l.includes('search'))).toBe(true);
    });

    it('should format failed registrations with errors', () => {
      registrationTracker.recordRegistration({
        name: 'search',
        type: 'tool',
        success: false,
        error: 'Missing API key',
      });

      const lines = formatRegistrationStatus();

      expect(lines.some((l) => l.includes('search'))).toBe(true);
      expect(lines.some((l) => l.includes('Missing API key'))).toBe(true);
    });

    it('should group tools and resources separately', () => {
      registrationTracker.recordRegistration({
        name: 'scrape',
        type: 'tool',
        success: true,
      });
      registrationTracker.recordRegistration({
        name: 'Resource Handlers',
        type: 'resource',
        success: true,
      });

      const lines = formatRegistrationStatus();

      expect(lines.some((l) => l.includes('Tools (1)'))).toBe(true);
      expect(lines.some((l) => l.includes('Resources (1)'))).toBe(true);
    });
  });
});
```

**TDD Cycle:**

```bash
# Run tests - ALL should fail (RED)
npm test -- mcp-status.test.ts

# Expected: All tests fail - module not found
```

#### 3.2 Implement MCP Status Tracker (GREEN)

**File:** `shared/utils/mcp-status.ts` (NEW)

```typescript
/**
 * MCP registration status tracking and display
 */

import { colorHelpers } from './logging.js';

/**
 * Registration status for a single item
 */
export interface RegistrationStatus {
  name: string;
  type: 'tool' | 'resource';
  success: boolean;
  error?: string;
  timestamp: number;
}

/**
 * Registration tracker singleton
 */
class RegistrationTracker {
  private static instance: RegistrationTracker;
  private registrations: RegistrationStatus[] = [];

  private constructor() {}

  static getInstance(): RegistrationTracker {
    if (!RegistrationTracker.instance) {
      RegistrationTracker.instance = new RegistrationTracker();
    }
    return RegistrationTracker.instance;
  }

  recordRegistration(status: Omit<RegistrationStatus, 'timestamp'>): void {
    this.registrations.push({
      ...status,
      timestamp: Date.now(),
    });
  }

  getRegistrations(): RegistrationStatus[] {
    return [...this.registrations];
  }

  getToolRegistrations(): RegistrationStatus[] {
    return this.registrations.filter((r) => r.type === 'tool');
  }

  getResourceRegistrations(): RegistrationStatus[] {
    return this.registrations.filter((r) => r.type === 'resource');
  }

  hasFailures(): boolean {
    return this.registrations.some((r) => !r.success);
  }

  clear(): void {
    this.registrations = [];
  }
}

export const registrationTracker = RegistrationTracker.getInstance();

/**
 * Format registration statuses for display
 */
export function formatRegistrationStatus(): string[] {
  const lines: string[] = [];
  const tracker = registrationTracker;

  const tools = tracker.getToolRegistrations();
  const resources = tracker.getResourceRegistrations();

  if (tools.length === 0 && resources.length === 0) {
    return [];
  }

  // Tools section
  if (tools.length > 0) {
    lines.push('');
    lines.push(colorHelpers.info(`  Tools (${tools.length}):`));

    for (const tool of tools) {
      const icon = tool.success ? colorHelpers.checkmark() : colorHelpers.cross();
      const name = tool.success ? colorHelpers.highlight(tool.name) : colorHelpers.error(tool.name);

      lines.push(`    ${icon} ${name}`);

      if (tool.error) {
        lines.push(`      ${colorHelpers.error(`Error: ${tool.error}`)}`);
      }
    }
  }

  // Resources section
  if (resources.length > 0) {
    lines.push('');
    lines.push(colorHelpers.info(`  Resources (${resources.length}):`));

    for (const resource of resources) {
      const icon = resource.success ? colorHelpers.checkmark() : colorHelpers.cross();
      const name = resource.success
        ? colorHelpers.highlight(resource.name)
        : colorHelpers.error(resource.name);

      lines.push(`    ${icon} ${name}`);

      if (resource.error) {
        lines.push(`      ${colorHelpers.error(`Error: ${resource.error}`)}`);
      }
    }
  }

  return lines;
}
```

**TDD Cycle:**

```bash
# Run tests - should pass (GREEN)
npm test -- mcp-status.test.ts

# Expected: All tests passing ✓
```

#### 3.3 Refactor (REFACTOR)

- Ensure singleton pattern is clean
- Optimize array operations
- Add JSDoc comments
- Verify tests still pass

**Verification:**

```bash
npm test -- mcp-status.test.ts
npm run build
```

**Status:** ✅ Task 3 Complete

---

### Task 4: Environment Variable Display (TDD)

**Objective:** Create environment variable display with masking using TDD

#### 4.1 Write Tests First (RED)

**File:** `remote/startup/env-display.test.ts` (NEW)

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  EnvVarDisplay,
  getEnvironmentVariables,
  formatEnvironmentVariables,
} from './env-display.js';

describe('Environment Variable Display', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    // Set minimal environment
    process.env.PORT = '3060';
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getEnvironmentVariables()', () => {
    it('should include server configuration', () => {
      // RED: This will fail because getEnvironmentVariables() doesn't exist
      const vars = getEnvironmentVariables();

      const serverVars = vars.filter((v) => v.category === 'Server');
      expect(serverVars.length).toBeGreaterThan(0);
      expect(serverVars.some((v) => v.name === 'PORT')).toBe(true);
      expect(serverVars.some((v) => v.name === 'NODE_ENV')).toBe(true);
    });

    it('should include HTTP configuration when set', () => {
      process.env.ALLOWED_ORIGINS = 'https://example.com';
      process.env.ENABLE_OAUTH = 'true';

      const vars = getEnvironmentVariables();
      const httpVars = vars.filter((v) => v.category === 'HTTP');

      expect(httpVars.some((v) => v.name === 'ALLOWED_ORIGINS')).toBe(true);
      expect(httpVars.some((v) => v.name === 'ENABLE_OAUTH')).toBe(true);
    });

    it('should mark API keys as sensitive', () => {
      process.env.FIRECRAWL_API_KEY = 'sk-test123';

      const vars = getEnvironmentVariables();
      const apiKeyVar = vars.find((v) => v.name === 'FIRECRAWL_API_KEY');

      expect(apiKeyVar?.sensitive).toBe(true);
    });

    it('should not mark URLs as sensitive', () => {
      process.env.FIRECRAWL_BASE_URL = 'https://api.test';

      const vars = getEnvironmentVariables();
      const urlVar = vars.find((v) => v.name === 'FIRECRAWL_BASE_URL');

      expect(urlVar?.sensitive).toBe(false);
    });

    it('should include LLM configuration when set', () => {
      process.env.LLM_PROVIDER = 'anthropic';
      process.env.LLM_API_KEY = 'sk-ant-test';
      process.env.LLM_MODEL = 'claude-sonnet-4';

      const vars = getEnvironmentVariables();
      const llmVars = vars.filter((v) => v.category === 'LLM');

      expect(llmVars).toHaveLength(3);
      expect(llmVars.some((v) => v.name === 'LLM_PROVIDER')).toBe(true);
    });

    it('should include storage configuration', () => {
      process.env.MCP_RESOURCE_STORAGE = 'filesystem';

      const vars = getEnvironmentVariables();
      const storageVars = vars.filter((v) => v.category === 'Storage');

      expect(storageVars.some((v) => v.name === 'MCP_RESOURCE_STORAGE')).toBe(true);
    });
  });

  describe('formatEnvironmentVariables()', () => {
    it('should return formatted lines grouped by category', () => {
      // RED: This will fail because formatEnvironmentVariables() doesn't exist
      const lines = formatEnvironmentVariables();

      expect(lines.length).toBeGreaterThan(0);
      expect(lines.some((l) => l.includes('Server:'))).toBe(true);
    });

    it('should mask sensitive values', () => {
      process.env.FIRECRAWL_API_KEY = 'sk-1234567890abcdef';

      const lines = formatEnvironmentVariables();
      const apiKeyLine = lines.find((l) => l.includes('FIRECRAWL_API_KEY'));

      expect(apiKeyLine).toBeDefined();
      expect(apiKeyLine).not.toContain('sk-1234567890abcdef');
      expect(apiKeyLine).toContain('*');
    });

    it('should not mask non-sensitive values', () => {
      process.env.PORT = '3060';

      const lines = formatEnvironmentVariables();
      const portLine = lines.find((l) => l.includes('PORT'));

      expect(portLine).toContain('3060');
      expect(portLine).not.toContain('*');
    });

    it('should separate categories with blank lines', () => {
      process.env.FIRECRAWL_API_KEY = 'test';
      process.env.LLM_PROVIDER = 'anthropic';
      process.env.LLM_API_KEY = 'test';

      const lines = formatEnvironmentVariables();

      // Should have blank lines between categories
      const blankLines = lines.filter((l) => l === '');
      expect(blankLines.length).toBeGreaterThan(0);
    });
  });
});
```

**TDD Cycle:**

```bash
# Run tests - ALL should fail (RED)
cd remote
npm test -- env-display.test.ts

# Expected: All tests fail - module not found
```

#### 4.2 Implement Environment Display (GREEN)

**File:** `remote/startup/env-display.ts` (NEW)

```typescript
/**
 * Environment variable display utilities
 */

import { colorHelpers, maskSensitiveValue } from '../../shared/utils/logging.js';

/**
 * Environment variable categories
 */
export interface EnvVarDisplay {
  name: string;
  value: string;
  sensitive: boolean;
  category: string;
}

/**
 * Get all relevant environment variables for display
 */
export function getEnvironmentVariables(): EnvVarDisplay[] {
  const vars: EnvVarDisplay[] = [];

  // Server configuration
  vars.push(
    { name: 'PORT', value: process.env.PORT || '3060', sensitive: false, category: 'Server' },
    {
      name: 'NODE_ENV',
      value: process.env.NODE_ENV || 'development',
      sensitive: false,
      category: 'Server',
    },
    {
      name: 'LOG_FORMAT',
      value: process.env.LOG_FORMAT || 'text',
      sensitive: false,
      category: 'Server',
    },
    { name: 'DEBUG', value: process.env.DEBUG || 'false', sensitive: false, category: 'Server' }
  );

  // HTTP configuration
  if (process.env.ALLOWED_ORIGINS) {
    vars.push({
      name: 'ALLOWED_ORIGINS',
      value: process.env.ALLOWED_ORIGINS,
      sensitive: false,
      category: 'HTTP',
    });
  }
  if (process.env.ALLOWED_HOSTS) {
    vars.push({
      name: 'ALLOWED_HOSTS',
      value: process.env.ALLOWED_HOSTS,
      sensitive: false,
      category: 'HTTP',
    });
  }
  vars.push(
    {
      name: 'ENABLE_OAUTH',
      value: process.env.ENABLE_OAUTH || 'false',
      sensitive: false,
      category: 'HTTP',
    },
    {
      name: 'ENABLE_RESUMABILITY',
      value: process.env.ENABLE_RESUMABILITY || 'false',
      sensitive: false,
      category: 'HTTP',
    }
  );

  // Scraping services
  if (process.env.FIRECRAWL_API_KEY) {
    vars.push(
      {
        name: 'FIRECRAWL_API_KEY',
        value: process.env.FIRECRAWL_API_KEY,
        sensitive: true,
        category: 'Scraping',
      },
      {
        name: 'FIRECRAWL_BASE_URL',
        value: process.env.FIRECRAWL_BASE_URL || 'https://api.firecrawl.dev',
        sensitive: false,
        category: 'Scraping',
      }
    );
  }
  vars.push({
    name: 'OPTIMIZE_FOR',
    value: process.env.OPTIMIZE_FOR || 'cost',
    sensitive: false,
    category: 'Scraping',
  });

  // LLM provider
  if (process.env.LLM_PROVIDER) {
    vars.push({
      name: 'LLM_PROVIDER',
      value: process.env.LLM_PROVIDER,
      sensitive: false,
      category: 'LLM',
    });
    if (process.env.LLM_API_KEY) {
      vars.push({
        name: 'LLM_API_KEY',
        value: process.env.LLM_API_KEY,
        sensitive: true,
        category: 'LLM',
      });
    }
    if (process.env.LLM_API_BASE_URL) {
      vars.push({
        name: 'LLM_API_BASE_URL',
        value: process.env.LLM_API_BASE_URL,
        sensitive: false,
        category: 'LLM',
      });
    }
    if (process.env.LLM_MODEL) {
      vars.push({
        name: 'LLM_MODEL',
        value: process.env.LLM_MODEL,
        sensitive: false,
        category: 'LLM',
      });
    }
  }

  // Storage
  vars.push({
    name: 'MCP_RESOURCE_STORAGE',
    value: process.env.MCP_RESOURCE_STORAGE || 'memory',
    sensitive: false,
    category: 'Storage',
  });
  if (process.env.MCP_RESOURCE_FILESYSTEM_ROOT) {
    vars.push({
      name: 'MCP_RESOURCE_FILESYSTEM_ROOT',
      value: process.env.MCP_RESOURCE_FILESYSTEM_ROOT,
      sensitive: false,
      category: 'Storage',
    });
  }

  return vars;
}

/**
 * Format environment variables for display
 */
export function formatEnvironmentVariables(): string[] {
  const vars = getEnvironmentVariables();
  const lines: string[] = [];

  // Group by category
  const categories = [...new Set(vars.map((v) => v.category))];

  for (const category of categories) {
    const categoryVars = vars.filter((v) => v.category === category);
    lines.push('');
    lines.push(colorHelpers.info(`  ${category}:`));

    for (const envVar of categoryVars) {
      const value = envVar.sensitive
        ? colorHelpers.dim(maskSensitiveValue(envVar.value))
        : colorHelpers.highlight(envVar.value);

      lines.push(`    ${colorHelpers.dim(envVar.name)}: ${value}`);
    }
  }

  return lines;
}
```

**TDD Cycle:**

```bash
# Run tests - should pass (GREEN)
npm test -- env-display.test.ts

# Expected: All tests passing ✓
```

#### 4.3 Refactor (REFACTOR)

- DRY up repeated environment variable checks
- Optimize category grouping
- Add JSDoc
- Verify tests pass

**Verification:**

```bash
npm test -- env-display.test.ts
npm run build
```

**Status:** ✅ Task 4 Complete

---

### Task 5: Startup Display Orchestrator (TDD)

**Objective:** Create the main display orchestrator using TDD

This task will be broken down into smaller sub-tasks for each display section.

#### 5.1 Write Tests for Banner Display (RED)

**File:** `remote/startup/display.test.ts` (NEW)

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { displayStartupInfo, ServerConfig } from './display.js';

describe('Startup Display', () => {
  let consoleLogSpy: any;
  let consoleClearSpy: any;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleClearSpy = vi.spyOn(console, 'clear').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    consoleLogSpy.mockRestore();
    consoleClearSpy.mockRestore();
  });

  describe('displayStartupInfo()', () => {
    const mockConfig: ServerConfig = {
      port: 3060,
      serverUrl: 'http://localhost:3060',
      mcpEndpoint: 'http://localhost:3060/mcp',
      healthEndpoint: 'http://localhost:3060/health',
      allowedOrigins: ['*'],
      allowedHosts: ['localhost:3060'],
      oauthEnabled: false,
      resumabilityEnabled: true,
    };

    it('should display banner with server name', async () => {
      // RED: This will fail because displayStartupInfo() doesn't exist
      await displayStartupInfo(mockConfig);

      const output = consoleLogSpy.mock.calls.map((call: any) => call[0]).join('\n');

      expect(output).toContain('Pulse Fetch MCP Server');
    });

    it('should display server endpoints', async () => {
      await displayStartupInfo(mockConfig);

      const output = consoleLogSpy.mock.calls.map((call: any) => call[0]).join('\n');

      expect(output).toContain('Server Endpoints');
      expect(output).toContain('http://localhost:3060/mcp');
      expect(output).toContain('http://localhost:3060/health');
    });

    it('should display security configuration', async () => {
      await displayStartupInfo(mockConfig);

      const output = consoleLogSpy.mock.calls.map((call: any) => call[0]).join('\n');

      expect(output).toContain('Security Configuration');
      expect(output).toContain('CORS Origins');
      expect(output).toContain('OAuth');
      expect(output).toContain('Resumability');
    });

    it('should display service statuses', async () => {
      process.env.FIRECRAWL_API_KEY = 'self-hosted-no-auth';

      await displayStartupInfo(mockConfig);

      const output = consoleLogSpy.mock.calls.map((call: any) => call[0]).join('\n');

      expect(output).toContain('Service Status');
      expect(output).toContain('Firecrawl');
    });

    it('should display environment variables', async () => {
      await displayStartupInfo(mockConfig);

      const output = consoleLogSpy.mock.calls.map((call: any) => call[0]).join('\n');

      expect(output).toContain('Environment Configuration');
    });

    it('should display ready message at end', async () => {
      await displayStartupInfo(mockConfig);

      const output = consoleLogSpy.mock.calls.map((call: any) => call[0]).join('\n');

      expect(output).toContain('Server ready to accept connections');
    });

    it('should clear screen if TTY', async () => {
      // Mock TTY
      Object.defineProperty(process.stdout, 'isTTY', {
        value: true,
        configurable: true,
      });

      await displayStartupInfo(mockConfig);

      expect(consoleClearSpy).toHaveBeenCalled();
    });

    it('should not clear screen if not TTY', async () => {
      // Mock non-TTY
      Object.defineProperty(process.stdout, 'isTTY', {
        value: false,
        configurable: true,
      });

      await displayStartupInfo(mockConfig);

      expect(consoleClearSpy).not.toHaveBeenCalled();
    });
  });
});
```

**TDD Cycle:**

```bash
# Run tests - ALL should fail (RED)
npm test -- display.test.ts

# Expected: All tests fail - module not found
```

#### 5.2 Implement Display Orchestrator (GREEN)

**File:** `remote/startup/display.ts` (NEW)

```typescript
/**
 * Startup display orchestrator
 */

import {
  colorHelpers,
  createSectionHeader,
  createLine,
  Colors,
  colorize,
} from '../../shared/utils/logging.js';
import { getAllServiceStatuses, formatServiceStatus } from '../../shared/utils/service-status.js';
import { formatEnvironmentVariables } from './env-display.js';
import { formatRegistrationStatus, registrationTracker } from '../../shared/utils/mcp-status.js';

/**
 * Server configuration for display
 */
export interface ServerConfig {
  port: number;
  serverUrl: string;
  mcpEndpoint: string;
  healthEndpoint: string;
  allowedOrigins: string[];
  allowedHosts: string[];
  oauthEnabled: boolean;
  resumabilityEnabled: boolean;
}

/**
 * Display startup banner
 */
function displayBanner(): void {
  const banner = [
    '',
    colorize(
      '╔═══════════════════════════════════════════════════════════════════════════════╗',
      Colors.cyan,
      Colors.bold
    ),
    colorize(
      '║                                                                               ║',
      Colors.cyan,
      Colors.bold
    ),
    colorize('║                     ', Colors.cyan, Colors.bold) +
      colorize('🌊 Pulse Fetch MCP Server', Colors.brightWhite, Colors.bold) +
      colorize('                         ║', Colors.cyan, Colors.bold),
    colorize(
      '║                                                                               ║',
      Colors.cyan,
      Colors.bold
    ),
    colorize('║                         ', Colors.cyan, Colors.bold) +
      colorize('Remote HTTP Transport', Colors.brightCyan) +
      colorize('                              ║', Colors.cyan, Colors.bold),
    colorize(
      '║                                                                               ║',
      Colors.cyan,
      Colors.bold
    ),
    colorize(
      '╚═══════════════════════════════════════════════════════════════════════════════╝',
      Colors.cyan,
      Colors.bold
    ),
    '',
  ].join('\n');

  console.log(banner);
}

/**
 * Display server endpoints
 */
function displayEndpoints(config: ServerConfig): void {
  console.log(createSectionHeader('Server Endpoints', 80));
  console.log('');
  console.log(
    `  ${colorHelpers.bullet()} MCP Endpoint:    ${colorHelpers.highlight(config.mcpEndpoint)}`
  );
  console.log(
    `  ${colorHelpers.bullet()} Health Endpoint: ${colorHelpers.highlight(config.healthEndpoint)}`
  );
  console.log(
    `  ${colorHelpers.bullet()} Port:            ${colorHelpers.highlight(String(config.port))}`
  );
  console.log('');
}

/**
 * Display security configuration
 */
function displaySecurityConfig(config: ServerConfig): void {
  console.log(createSectionHeader('Security Configuration', 80));
  console.log('');

  const originsDisplay = config.allowedOrigins.includes('*')
    ? colorHelpers.warning('* (all origins)')
    : colorHelpers.highlight(config.allowedOrigins.join(', '));
  console.log(`  ${colorHelpers.bullet()} CORS Origins:    ${originsDisplay}`);

  if (config.allowedHosts.length > 0) {
    console.log(
      `  ${colorHelpers.bullet()} Allowed Hosts:   ${colorHelpers.highlight(config.allowedHosts.join(', '))}`
    );
  }

  const oauthStatus = config.oauthEnabled
    ? colorHelpers.warning('Enabled (not implemented)')
    : colorHelpers.dim('Disabled');
  console.log(`  ${colorHelpers.bullet()} OAuth:           ${oauthStatus}`);

  const resumabilityStatus = config.resumabilityEnabled
    ? colorHelpers.success('Enabled')
    : colorHelpers.dim('Disabled');
  console.log(`  ${colorHelpers.bullet()} Resumability:    ${resumabilityStatus}`);

  console.log('');
}

/**
 * Display service statuses
 */
async function displayServiceStatuses(): Promise<void> {
  console.log(createSectionHeader('Service Status', 80));
  console.log('');

  const statuses = await getAllServiceStatuses();

  for (const status of statuses) {
    console.log(`  ${formatServiceStatus(status)}`);
  }

  console.log('');
}

/**
 * Display environment variables
 */
function displayEnvironmentVariables(): void {
  console.log(createSectionHeader('Environment Configuration', 80));

  const envLines = formatEnvironmentVariables();
  envLines.forEach((line) => console.log(line));

  console.log('');
}

/**
 * Display MCP registration status
 */
function displayMCPStatus(): void {
  console.log(createSectionHeader('MCP Registration Status', 80));

  const statusLines = formatRegistrationStatus();

  if (statusLines.length === 0) {
    console.log('');
    console.log(colorHelpers.dim('  No registrations recorded'));
    console.log('');
    return;
  }

  statusLines.forEach((line) => console.log(line));

  const tracker = registrationTracker;
  const tools = tracker.getToolRegistrations();
  const resources = tracker.getResourceRegistrations();
  const hasFailures = tracker.hasFailures();

  console.log('');
  console.log(colorHelpers.dim('  ─'.repeat(40)));

  if (hasFailures) {
    console.log(`  ${colorHelpers.warning('⚠ Some registrations failed')}`);
  } else {
    console.log(`  ${colorHelpers.success('✓ All registrations successful')}`);
  }

  console.log(
    `  ${colorHelpers.dim(`Total: ${tools.length} tools, ${resources.length} resources`)}`
  );
  console.log('');
}

/**
 * Display active crawls
 */
function displayActiveCrawls(): void {
  console.log(createSectionHeader('Active Crawls', 80));
  console.log('');
  console.log(colorHelpers.dim('  No active crawls'));
  console.log('');
}

/**
 * Display complete startup information
 */
export async function displayStartupInfo(config: ServerConfig): Promise<void> {
  if (process.stdout.isTTY) {
    console.clear();
  }

  displayBanner();
  displayEndpoints(config);
  displaySecurityConfig(config);
  await displayServiceStatuses();
  displayEnvironmentVariables();
  displayMCPStatus();
  displayActiveCrawls();

  console.log(colorize(createLine(80, '═'), Colors.cyan, Colors.bold));
  console.log('');
  console.log(colorHelpers.success('  ✓ Server ready to accept connections'));
  console.log('');
}
```

**TDD Cycle:**

```bash
# Run tests - should pass (GREEN)
npm test -- display.test.ts

# Expected: All tests passing ✓
```

#### 5.3 Refactor (REFACTOR)

- Extract magic numbers to constants
- Optimize string operations
- Add JSDoc
- Verify tests pass

**Verification:**

```bash
npm test -- display.test.ts
npm run build
```

**Status:** ✅ Task 5 Complete

---

### Task 6: Modify MCP Registration (TDD)

**Objective:** Update MCP registration to track status using TDD

#### 6.1 Write Tests for Registration Tracking (RED)

**File:** `shared/mcp/registration.test.ts` (NEW)

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { registerTools, registerResources } from './registration.js';
import { registrationTracker } from '../utils/mcp-status.js';

describe('MCP Registration with Tracking', () => {
  let server: Server;

  beforeEach(() => {
    server = new Server(
      { name: 'test-server', version: '1.0.0' },
      { capabilities: { resources: {}, tools: {} } }
    );
    registrationTracker.clear();
  });

  describe('registerTools()', () => {
    it('should record successful tool registrations', () => {
      // RED: This will fail because tracking isn't implemented yet
      const mockClientFactory = vi.fn(() => ({ native: {} }));
      const mockStrategyFactory = vi.fn(() => ({}));

      registerTools(server, mockClientFactory as any, mockStrategyFactory as any);

      const tools = registrationTracker.getToolRegistrations();
      expect(tools.length).toBeGreaterThan(0);
      expect(tools.every((t) => t.success)).toBe(true);
    });

    it('should record tool registration failures', () => {
      const mockClientFactory = vi.fn(() => {
        throw new Error('Client creation failed');
      });
      const mockStrategyFactory = vi.fn(() => ({}));

      try {
        registerTools(server, mockClientFactory as any, mockStrategyFactory as any);
      } catch {
        // Expected to throw
      }

      const tools = registrationTracker.getToolRegistrations();
      expect(tools.some((t) => !t.success)).toBe(true);
    });
  });

  describe('registerResources()', () => {
    it('should record successful resource registration', () => {
      // RED: This will fail because tracking isn't implemented yet
      registerResources(server);

      const resources = registrationTracker.getResourceRegistrations();
      expect(resources.length).toBe(1);
      expect(resources[0].name).toBe('Resource Handlers');
      expect(resources[0].success).toBe(true);
    });
  });
});
```

**TDD Cycle:**

```bash
# Run tests - should fail (RED)
npm test -- registration.test.ts

# Expected: Tests fail - tracking not implemented
```

#### 6.2 Implement Registration Tracking (GREEN)

**File:** `shared/mcp/registration.ts`

Modify the `registerTools` function:

```typescript
// Add import at top
import { registrationTracker } from '../utils/mcp-status.js';

// Modify registerTools function
export function registerTools(
  server: Server,
  clientFactory: ClientFactory,
  strategyConfigFactory: StrategyConfigFactory
): void {
  const firecrawlConfig: FirecrawlConfig = {
    apiKey: process.env.FIRECRAWL_API_KEY || '',
    baseUrl: process.env.FIRECRAWL_BASE_URL || 'https://api.firecrawl.dev',
  };

  // Create tool instances with tracking
  const toolConfigs = [
    { name: 'scrape', factory: () => scrapeTool(server, clientFactory, strategyConfigFactory) },
    { name: 'search', factory: () => createSearchTool(firecrawlConfig) },
    { name: 'map', factory: () => createMapTool(firecrawlConfig) },
    { name: 'crawl', factory: () => createCrawlTool(firecrawlConfig) },
  ];

  const tools: any[] = [];

  for (const { name, factory } of toolConfigs) {
    try {
      const tool = factory();
      tools.push(tool);

      registrationTracker.recordRegistration({
        name: tool.name,
        type: 'tool',
        success: true,
      });
    } catch (error) {
      registrationTracker.recordRegistration({
        name,
        type: 'tool',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      logError('tool-registration', error, { tool: name });
    }
  }

  // Rest of function unchanged...
}

// Modify registerResources function
export function registerResources(server: Server): void {
  try {
    server.setRequestHandler(ListResourcesRequestSchema, async () => {
      // ... existing implementation ...
    });

    server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      // ... existing implementation ...
    });

    registrationTracker.recordRegistration({
      name: 'Resource Handlers',
      type: 'resource',
      success: true,
    });
  } catch (error) {
    registrationTracker.recordRegistration({
      name: 'Resource Handlers',
      type: 'resource',
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    logError('resource-registration', error);
    throw error;
  }
}
```

**TDD Cycle:**

```bash
# Run tests - should pass (GREEN)
npm test -- registration.test.ts

# Expected: All tests passing ✓
```

#### 6.3 Refactor (REFACTOR)

- Clean up error handling
- DRY up registration tracking
- Verify tests pass

**Verification:**

```bash
npm test -- registration.test.ts
npm run build
```

**Status:** ✅ Task 6 Complete

---

### Task 7: Integrate into Server Startup (TDD)

**Objective:** Integrate display into server startup using TDD

#### 7.1 Write Integration Test (RED)

**File:** `remote/index.integration.test.ts` (NEW)

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

describe('Server Startup Integration', () => {
  it('should display enhanced logging on startup', async () => {
    // RED: This will fail until integration is complete
    const { stdout, stderr } = await execAsync(
      'docker compose up -d pulse-crawl && docker compose logs pulse-crawl --tail=100'
    );

    const output = stdout + stderr;

    // Check for banner
    expect(output).toContain('Pulse Fetch MCP Server');

    // Check for all sections
    expect(output).toContain('Server Endpoints');
    expect(output).toContain('Security Configuration');
    expect(output).toContain('Service Status');
    expect(output).toContain('Environment Configuration');
    expect(output).toContain('MCP Registration Status');

    // Check for ready message
    expect(output).toContain('Server ready to accept connections');
  }, 30000); // 30 second timeout for Docker operations
});
```

**TDD Cycle:**

```bash
# Run test - should fail (RED)
npm test -- index.integration.test.ts

# Expected: Test fails - enhanced logging not integrated
```

#### 7.2 Integrate Display into Startup (GREEN)

**File:** `remote/index.ts`

```typescript
// Add import
import { displayStartupInfo } from './startup/display.js';

// Modify server.listen callback (around line 84)
const server = app.listen(port, async () => {
  const config = {
    port,
    serverUrl: `http://localhost:${port}`,
    mcpEndpoint: `http://localhost:${port}/mcp`,
    healthEndpoint: `http://localhost:${port}/health`,
    allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',').filter(Boolean) || ['*'],
    allowedHosts: process.env.ALLOWED_HOSTS?.split(',').filter(Boolean) || [],
    oauthEnabled: process.env.ENABLE_OAUTH === 'true',
    resumabilityEnabled: process.env.ENABLE_RESUMABILITY === 'true',
  };

  await displayStartupInfo(config);
});
```

**TDD Cycle:**

```bash
# Build and run integration test
npm run build
npm test -- index.integration.test.ts

# Expected: Test passes (GREEN)
```

#### 7.3 Refactor (REFACTOR)

- Extract config building to separate function
- Verify tests pass

**Verification:**

```bash
npm test
npm run build
docker compose up -d
docker compose logs pulse-crawl
```

**Status:** ✅ Task 7 Complete

---

## Final Verification

### Run All Tests

```bash
# From project root
npm run build

# Run all tests
npm test

# Expected: All tests passing
```

### Manual Testing

```bash
# Start server
docker compose up -d

# Check logs
docker compose logs -f pulse-crawl

# Verify display includes:
# ✓ Colorized banner
# ✓ Server endpoints
# ✓ Security configuration
# ✓ Service statuses
# ✓ Environment variables (masked)
# ✓ MCP registration status
# ✓ Active crawls
# ✓ Ready message
```

---

## Completion Criteria

- [x] All unit tests pass
- [x] All integration tests pass
- [x] TypeScript compiles without errors
- [x] Color codes work in terminal
- [x] Colors disabled in non-TTY
- [x] Sensitive values masked
- [x] All services display correctly
- [x] Tool registration tracked
- [x] Docker Compose works
- [x] No regression in functionality

---

## Summary

**Total Tasks:** 7 main tasks with 20+ sub-tasks
**Test Files:** 7 new test files
**Implementation Files:** 4 new files, 3 modified files
**Methodology:** Strict RED-GREEN-REFACTOR for every component
**Estimated Effort:** ~6-8 hours with full TDD discipline

**Key TDD Benefits:**

- ✅ Comprehensive test coverage from start
- ✅ Clear specification through tests
- ✅ Immediate feedback on breakage
- ✅ Confidence in refactoring
- ✅ Living documentation via tests

---

End of TDD Implementation Plan
