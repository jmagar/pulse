# Crawl Tool Wrong URL Investigation and Fix

**Date:** 2025-01-10
**Issue:** MCP crawl tool was using cloud Firecrawl API (`https://api.firecrawl.dev/v2`) instead of self-hosted instance

## Problem Discovery

### Initial Symptoms
- User requested to scrape `docs.unraid.net` using self-hosted Firecrawl
- Crawl tool returned 401 authentication errors
- User repeatedly indicated the issue was using the wrong URL

### Debug Process

1. **Added debug logging to crawl operation** ([packages/firecrawl-client/src/operations/crawl.ts:11-14](packages/firecrawl-client/src/operations/crawl.ts#L11-L14))
   ```typescript
   function debugLog(message: string, data?: any) {
     process.stderr.write(`[FIRECRAWL-CLIENT-DEBUG] ${message} ${data ? JSON.stringify(data) : ''}\n`);
   }
   ```

2. **Debug logs revealed the actual problem:**
   ```
   [FIRECRAWL-CLIENT-DEBUG] startCrawl called {"apiKey":"8sHRjdGvk6wL58zP2QnM9N3h4ZBYa5M3","baseUrl":"https://api.firecrawl.dev/v2","targetUrl":"https://docs.unraid.net"}
   ```
   - Using cloud API URL instead of self-hosted
   - Using real API key instead of `self-hosted-no-auth`

## Root Cause Analysis

### Configuration Hierarchy Issues

1. **Environment Variables in `.env`:**
   ```bash
   FIRECRAWL_API_KEY=8sHRjdGvk6wL58zP2QnM9N3h4ZBYa5M3
   MCP_FIRECRAWL_API_KEY=self-hosted-no-auth
   MCP_FIRECRAWL_BASE_URL=https://firecrawl.tootie.tv
   ```

2. **Registration code using wrong variables** ([apps/mcp/shared/mcp/registration.ts:54-57](apps/mcp/shared/mcp/registration.ts#L54-L57))
   ```typescript
   // BEFORE (WRONG)
   const firecrawlConfig: FirecrawlConfig = {
     apiKey: process.env.FIRECRAWL_API_KEY || '',
     baseUrl: process.env.FIRECRAWL_BASE_URL || 'https://api.firecrawl.dev',
   };
   ```
   - Reading `FIRECRAWL_API_KEY` instead of `MCP_FIRECRAWL_API_KEY`
   - Reading `FIRECRAWL_BASE_URL` (not set) instead of `MCP_FIRECRAWL_BASE_URL`
   - Falling back to hardcoded cloud URL `https://api.firecrawl.dev`

3. **Docker Compose override prevented `.env` usage** ([docker-compose.yaml:67](docker-compose.yaml#L67))
   ```yaml
   # BEFORE (WRONG)
   environment:
     - MCP_FIRECRAWL_API_KEY=${MCP_FIRECRAWL_API_KEY:-self-hosted-no-auth}
     - MCP_FIRECRAWL_BASE_URL=http://firecrawl:${FIRECRAWL_INTERNAL_PORT:-3002}
   ```
   - Hardcoded override prevented `.env` value from being used

## Fixes Applied

### Fix 1: Use Centralized Environment Config

**File:** [apps/mcp/shared/mcp/registration.ts](apps/mcp/shared/mcp/registration.ts#L29)

Added import:
```typescript
import { env } from '../config/environment.js';
```

Updated config creation ([apps/mcp/shared/mcp/registration.ts:54-57](apps/mcp/shared/mcp/registration.ts#L54-L57)):
```typescript
// AFTER (CORRECT)
const firecrawlConfig: FirecrawlConfig = {
  apiKey: env.firecrawlApiKey || 'self-hosted-no-auth',
  baseUrl: env.firecrawlBaseUrl || 'http://firecrawl:3002',
};
```

**Why this works:**
- `env.firecrawlApiKey` reads `MCP_FIRECRAWL_API_KEY` with fallback to `FIRECRAWL_API_KEY`
- `env.firecrawlBaseUrl` reads `MCP_FIRECRAWL_BASE_URL` with fallback to `FIRECRAWL_BASE_URL`
- Defined in [apps/mcp/shared/config/environment.ts:62-63](apps/mcp/shared/config/environment.ts#L62-L63)

### Fix 2: Remove Docker Compose Overrides

**File:** [docker-compose.yaml:65-68](docker-compose.yaml#L65-L68)

**Before:**
```yaml
environment:
  - MCP_FIRECRAWL_API_KEY=${MCP_FIRECRAWL_API_KEY:-self-hosted-no-auth}
  - MCP_FIRECRAWL_BASE_URL=${MCP_FIRECRAWL_BASE_URL:-http://firecrawl:3002}
  - FORCE_COLOR=1
```

**After:**
```yaml
# Removed - using env_file from common-service anchor instead
```

**Why this works:**
- All services inherit `env_file: - .env` from `common-service` anchor ([docker-compose.yaml:3-8](docker-compose.yaml#L3-L8))
- Explicit overrides were preventing `.env` values from being used
- Now all environment variables load cleanly from `.env`

### Fix 3: Authorization Header Handling

**Files:** All Firecrawl operations (scrape, crawl, map, search)

**Example from** [packages/firecrawl-client/src/operations/crawl.ts:37-39](packages/firecrawl-client/src/operations/crawl.ts#L37-L39):
```typescript
// Only add Authorization header if API key is not a self-hosted placeholder
if (apiKey && apiKey !== 'self-hosted-no-auth') {
  headers['Authorization'] = `Bearer ${apiKey}`;
}
```

**Applied to:**
- [packages/firecrawl-client/src/operations/scrape.ts](packages/firecrawl-client/src/operations/scrape.ts)
- [packages/firecrawl-client/src/operations/crawl.ts](packages/firecrawl-client/src/operations/crawl.ts)
- [packages/firecrawl-client/src/operations/map.ts](packages/firecrawl-client/src/operations/map.ts)
- [packages/firecrawl-client/src/operations/search.ts](packages/firecrawl-client/src/operations/search.ts)

## URL Construction

**Client automatically appends `/v2`** ([packages/firecrawl-client/src/client.ts:65-66](packages/firecrawl-client/src/client.ts#L65-L66)):
```typescript
const base = config.baseUrl || 'https://api.firecrawl.dev';
this.baseUrl = `${base}/v2`;
```

So `MCP_FIRECRAWL_BASE_URL=https://firecrawl.tootie.tv` becomes `https://firecrawl.tootie.tv/v2`

## Verification

After fixes, container environment should show:
```bash
MCP_FIRECRAWL_API_KEY=self-hosted-no-auth
MCP_FIRECRAWL_BASE_URL=https://firecrawl.tootie.tv
```

Debug logs should now show:
```
[FIRECRAWL-CLIENT-DEBUG] startCrawl called {"apiKey":"self-hosted-no-auth","baseUrl":"https://firecrawl.tootie.tv/v2","targetUrl":"https://docs.unraid.net"}
[FIRECRAWL-CLIENT-DEBUG] Fetching {"url":"https://firecrawl.tootie.tv/v2/crawl","hasAuth":false}
```

## Key Learnings

1. **Don't override environment variables in docker-compose.yaml when using `env_file`**
   - The `common-service` anchor already loads `.env`
   - Explicit overrides prevent user customization

2. **Use centralized environment configuration**
   - [apps/mcp/shared/config/environment.ts](apps/mcp/shared/config/environment.ts) provides proper fallback logic
   - Prevents inconsistent `process.env` access across codebase

3. **Debug logging is critical for distributed systems**
   - Initial assumptions about authentication were wrong
   - Logs revealed the actual config being used

4. **Listen to the user**
   - User said "LIKE I SAID EARLIER ITS PROBABLY USING THE WRONG FIRECRAWL URL"
   - They were exactly right - spent too much time on auth when URL was the issue

## Files Modified

1. [apps/mcp/shared/mcp/registration.ts](apps/mcp/shared/mcp/registration.ts) - Use centralized env config
2. [docker-compose.yaml](docker-compose.yaml) - Remove MCP environment overrides
3. [packages/firecrawl-client/src/operations/crawl.ts](packages/firecrawl-client/src/operations/crawl.ts) - Add debug logging, fix auth headers
4. [packages/firecrawl-client/src/operations/scrape.ts](packages/firecrawl-client/src/operations/scrape.ts) - Fix auth headers
5. [packages/firecrawl-client/src/operations/map.ts](packages/firecrawl-client/src/operations/map.ts) - Fix auth headers
6. [packages/firecrawl-client/src/operations/search.ts](packages/firecrawl-client/src/operations/search.ts) - Fix auth headers
