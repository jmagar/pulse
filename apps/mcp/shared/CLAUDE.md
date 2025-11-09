# Shared Module - Core Business Logic

Contains all core functionality shared between local (stdio) and remote (HTTP) implementations.

**NOT a standalone server** - shared library used by `local/` and `remote/`

**Design Goal**: Feature parity across stdio and HTTP transports

## Major Subsystems

### [tools/](tools/) - MCP Tool Implementations

Currently: scrape tool. Future: crawl, map, search tools.
See [tools/CLAUDE.md](tools/CLAUDE.md) for details.

### [scraping-client/](scraping-client/) - Web Content Fetching

Native fetch and Firecrawl API clients with fallback strategies.
See [scraping-client/CLAUDE.md](scraping-client/CLAUDE.md) for details.

### [storage/](storage/) - Resource Persistence

Memory and filesystem backends for cached scrape results.
See [storage/CLAUDE.md](storage/CLAUDE.md) for details.

### [extract/](extract/) - LLM Extraction

Anthropic, OpenAI, and OpenAI-compatible providers for natural language queries.
See [extract/CLAUDE.md](extract/CLAUDE.md) for details.

### [strategy-config/](strategy-config/) - Strategy Configuration

Markdown-based config for URL-specific scraping strategies with auto-learning.

## Other Components

- [clean/](clean/) - HTML-to-Markdown conversion (dom-to-semantic-markdown)
- [content-parsers/](content-parsers/) - PDF, HTML parsers
- [crawl/](crawl/) - Crawl configuration types
- [resources.ts](resources.ts) - MCP resource registration
- [scraping-strategies.ts](scraping-strategies.ts) - Strategy selection logic

## Core Files

- [index.ts](index.ts) - Main exports (`registerTools`, `registerResources`)
- [types.ts](types.ts) - Shared TypeScript types
- [validation.ts](validation.ts) - Zod schemas for tool parameters
- [errors.ts](errors.ts) - Custom error classes
- [logging.ts](logging.ts) - Structured logging utilities
- [server.ts](server.ts) - Server initialization helpers
- [healthcheck.ts](healthcheck.ts) - External service health checks

## Environment Variables

```bash
FIRECRAWL_API_KEY=...              # Firecrawl API key
OPTIMIZE_FOR=cost|speed             # Strategy optimization mode
STRATEGY_CONFIG_PATH=...            # Path to strategy config
MCP_RESOURCE_STORAGE=memory|filesystem
MCP_RESOURCE_FILESYSTEM_ROOT=...    # Filesystem storage root
LLM_PROVIDER=anthropic|openai|openai-compatible
LLM_API_KEY=...                     # LLM API key
LLM_API_BASE_URL=...                # OpenAI-compatible base URL
LLM_MODEL=...                       # Model override
```

## Development

```bash
npm run build  # Build TypeScript to dist/
npm test       # Run tests (from project root)
```

## Architecture Patterns

**Client Factory** - Dependency injection for scraping clients
**Storage Factory** - Singleton for storage backend selection
**Strategy Selection** - Auto-learning URL pattern → strategy mapping

## Testing

Tests in [../tests/](../tests/) at project root
Mocks in [../tests/mocks/](../tests/mocks/)

**Test Isolation**: Always call `ResourceStorageFactory.reset()` in `beforeEach`

## Claude Learnings

### Zod Schema Export and Cross-Module Boundaries

- **The Dual-Package Hazard**: When Zod schemas are compiled to dist/ and imported, they reference a different Zod instance than libraries like zod-to-json-schema use. The library's internal `instanceof` checks fail, returning empty schemas: `{ "$schema": "..." }`
- **Symptom**: Tools show as registered but clients see "no tools available" because inputSchema has no properties
- **Root Cause**: Multiple Zod module instances in module graph (one in source, one in dist, one in zod-to-json-schema)
- **instanceof Failure**: Zod uses prototype-based instanceof which fails across module boundaries, even with same version
- **Solution**: Manual JSON Schema construction via buildInputSchema() functions, avoiding zodToJsonSchema() entirely
- **Testing**: Simple schemas work (same module), imported schemas fail (cross-module)
- **Pattern**: Follow scrape tool's proven buildInputSchema() approach for all MCP tools
- **Future**: Zod v4 will use Symbol.hasInstance for cross-module instanceof, but manual construction is still more reliable
