# MCP Server

Model Context Protocol server for Firecrawl integration.

## Architecture

The MCP server is a single consolidated package (previously split across local/shared/remote).

**Directory Structure:**
```
apps/mcp/
├── index.ts         # Entry point
├── mcp-server.ts    # MCP protocol handler
├── server.ts        # HTTP server
├── server/          # HTTP routes and middleware
├── tools/           # MCP tools (scrape, crawl, map, search)
├── scraping/        # Scraping strategies
├── processing/      # Content processing
├── storage/         # Resource storage
├── config/          # Configuration
├── utils/           # Utilities
├── monitoring/      # Monitoring
├── tests/           # Test files
└── dist/            # Compiled output
```

## Development

**Install dependencies:**
```bash
pnpm install
```

**Build:**
```bash
pnpm --filter @pulsemcp/mcp-server run build
```

**Run locally:**
```bash
pnpm --filter @pulsemcp/mcp-server run start
```

**Run tests:**
```bash
pnpm --filter @pulsemcp/mcp-server run test
```

## Docker

**Build:**
```bash
docker compose build firecrawl_mcp
```

**Deploy:**
```bash
docker compose up -d firecrawl_mcp
```

**Logs:**
```bash
docker compose logs -f firecrawl_mcp
```

## Configuration

All configuration is via environment variables. See `.env.example` in the project root for available options.

Key variables:
- `MCP_PORT` - External host port (default: 50107, maps to internal container port 3060)
- `MCP_HOST` - Bind address (default: 0.0.0.0)
- `FIRECRAWL_API_URL` - Firecrawl API endpoint
- `FIRECRAWL_API_KEY` - Firecrawl API key

**Port Configuration:**
- **Container Internal Port**: 3060 (hardcoded in Dockerfile, always the same)
- **Host External Port**: Configurable via `MCP_PORT` environment variable (default: 50107)
- **Docker Mapping**: `${MCP_PORT:-50107}:3060` maps the external port to the internal port

## MCP Tools

The server exposes the following MCP tools:

- **scrape** - Extract content from a single URL
- **crawl** - Recursively crawl a website
- **map** - Generate a sitemap
- **search** - Search indexed content

See individual tool implementations in `tools/` for detailed parameters and response formats.
