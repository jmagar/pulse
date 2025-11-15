# MCP Server - Claude Memory

Consolidated MCP server for Firecrawl integration. Single package architecture with HTTP streaming transport.

## Architecture Overview

**Entry Point**: `index.ts` - Starts Express server with health checks
**MCP Factory**: `server.ts` - Creates MCP server instance with tool/resource registration
**HTTP Transport**: `server/http.ts` - Express app with streamable HTTP transport

## Core Components

### Server Initialization (`index.ts`)

- Loads `.env` via `dotenv` (quiet mode)
- Validates `OPTIMIZE_FOR` (cost|speed)
- Runs optional health checks (skip: `SKIP_HEALTH_CHECKS=true`)
- Creates Express server on port `PORT` (default 3060)
- Displays startup banner with configuration

### MCP Server Factory (`server.ts`)

Factory function `createMCPServer()` returns `{ server, registerHandlers }`:
- Creates MCP server with name `@pulsemcp/pulse` v0.0.1
- Capabilities: resources (no subscribe), tools (no listChanged)
- `registerHandlers()` registers all tools and resources with dependency injection

### HTTP Server (`server/http.ts`)

Express app with:
- CORS middleware (origins/hosts from env)
- Health check endpoint: `/health`
- Metrics endpoints: `/metrics`, `/metrics/json`, `/metrics/reset` (auth optional)
- OAuth routes (if `MCP_ENABLE_OAUTH=true`)
- Main MCP endpoint: `/mcp` (GET, POST, DELETE)
- Session management (transports map to session IDs)
- Rate limiting: 100 req/min on `/mcp`, 10 req/min on OAuth
- Graceful shutdown handlers (SIGINT, SIGTERM)

## Configuration

**Source**: `config/environment.ts` - Centralized env variable management

Supports **both MCP_* and legacy names** for backward compatibility:
- Server: `MCP_PORT`, `MCP_DEBUG`, `MCP_LOG_FORMAT`
- HTTP: `MCP_ALLOWED_ORIGINS`, `MCP_ALLOWED_HOSTS`, `MCP_ENABLE_OAUTH`
- Firecrawl: `MCP_FIRECRAWL_API_KEY`, `MCP_FIRECRAWL_BASE_URL`
- LLM: `MCP_LLM_PROVIDER`, `MCP_LLM_API_KEY`, `MCP_LLM_MODEL`
- Storage: `MCP_RESOURCE_STORAGE` (memory|filesystem), `MCP_RESOURCE_FILESYSTEM_ROOT`
- Webhook: `MCP_WEBHOOK_BASE_URL`, `MCP_WEBHOOK_API_SECRET`
- OAuth: `MCP_GOOGLE_CLIENT_ID`, `MCP_GOOGLE_CLIENT_SECRET`, `MCP_GOOGLE_REDIRECT_URI`

Helper functions: `parseBoolean()`, `parseNumber()`, `getAllEnvVars()` (with redaction)

## Tool Registration

**Pattern**: `tools/registration.ts` - Registers 5 tools with the server

Tools created in factory:
1. **scrape** - Single URL extraction (native+Firecrawl fallback, caching, pagination)
2. **search** - Semantic search across cached content
3. **map** - Site structure mapping and URL discovery
4. **crawl** - Multi-page crawling (start, status, cancel, errors, list)
5. **query** - Search indexed docs via webhook bridge (requires `WEBHOOK_BASE_URL`, `WEBHOOK_API_SECRET`)

Registration flow:
- `CallToolRequestSchema` handler calls tool functions with tracking
- Failed tool registration doesn't block others
- Logs tool schema (if `DEBUG=true`)
- Tracks registration in `registrationTracker`
- Metrics collected per tool (duration, success/failure)

## Resource Management

**Storage Factory Pattern**: `storage/factory.ts` creates storage backend

Backends:
- **webhook-postgres** (default) - Unified storage via webhook API with Redis caching
- **memory** - In-memory Map with TTL (development only)
- **filesystem** - Persistent files (path: `MCP_RESOURCE_FILESYSTEM_ROOT`)

### Webhook-Postgres Storage (Recommended)

**Benefits:**
- **Single Source of Truth**: Reads from `webhook.scraped_content` table
- **Redis Caching**: Sub-5ms response for hot data via webhook's ContentCacheService
- **Zero Duplication**: No separate MCP storage, shares data with webhook service
- **Automatic Indexing**: Content automatically indexed for semantic search
- **Persistence**: PostgreSQL backend survives container restarts

**Configuration:**
```bash
MCP_RESOURCE_STORAGE=webhook-postgres
MCP_WEBHOOK_BASE_URL=http://pulse_webhook:52100
MCP_WEBHOOK_API_SECRET=your-secret-key
MCP_RESOURCE_TTL=3600  # Optional, TTL in seconds (default: 1 hour)
```

**API Endpoints Used:**
- `GET /api/content/by-url?url={url}&limit=10` - Find content by URL
- `GET /api/content/{id}` - Read content by ID

**URI Format**: `webhook://{content_id}` (e.g., `webhook://42`)

**Limitations:**
- Read-only from MCP perspective (writes happen via Firecrawl → webhook pipeline)
- No list() operation (webhook API doesn't expose full content listing)
- No delete() operation (content lifecycle managed by webhook retention policy)

**Data Flow:**
1. User scrapes URL via MCP scrape tool
2. Firecrawl API scrapes content
3. Webhook receives webhook event
4. Content stored in `webhook.scraped_content` table
5. MCP reads content via `WebhookPostgresStorage.findByUrl()`
6. Redis cache provides fast subsequent reads

### Legacy Storage Backends

**Memory Storage:**
- In-memory Map with TTL
- Lost on container restart
- Use for development/testing only
- URI Format: `scraped://domain/name_timestamp`

**Filesystem Storage:**
- Persistent files on disk
- Path: `MCP_RESOURCE_FILESYSTEM_ROOT`
- Slower than Redis-cached webhook storage
- URI Format: `scraped://domain/name_timestamp`

### Resource Registration

Register via `registerResources()`:
- `ListResourcesRequestSchema` - Returns all resources from storage
- `ReadResourceRequestSchema` - Fetches resource text by URI
- Error tracking in `registrationTracker`

## Middleware Stack

**Order in HTTP server**:
1. `express.json()`
2. `cors()` - Checks allowed origins/hosts
3. `securityHeaders` - Prevents MIME sniffing, clickjacking, etc.
4. (Conditional) `attachRedisSession` - OAuth sessions (if enabled)
5. (Conditional) `csrfTokenMiddleware` - CSRF protection (if OAuth enabled)
6. `hostValidationLogger` - Logs suspicious hosts
7. `rateLimiters.mcp` - 100 req/min per IP
8. `authMiddleware` - OAuth/metrics auth
9. `scopeMiddleware` - Token scope validation

## Key Patterns

**Dependency Injection**: `ClientFactory` and `StrategyConfigFactory` for testability
**Error Tracking**: `registrationTracker` records tool/resource registration status
**Structured Logging**: `logInfo()`, `logError()` with context objects
**Session Management**: `transports` map stores active HTTP streaming sessions
**Health Checks**: Pre-startup validation of authentication services (optional)

## Environment Variables (MCP_* Namespace)

Required for query tool:
- `MCP_WEBHOOK_BASE_URL` (default: `http://pulse_webhook:52100`)
- `MCP_WEBHOOK_API_SECRET`

Optional for OAuth:
- `MCP_ENABLE_OAUTH` (default: false)
- `MCP_GOOGLE_CLIENT_ID`, `MCP_GOOGLE_CLIENT_SECRET`, `MCP_GOOGLE_REDIRECT_URI`
- `MCP_OAUTH_SESSION_SECRET`, `MCP_OAUTH_TOKEN_KEY` (32+ bytes)
- `MCP_REDIS_URL` (for session storage)

See `config/environment.ts` for complete list with defaults.
