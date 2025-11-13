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
docker compose build pulse_mcp
```

**Deploy:**

```bash
docker compose up -d pulse_mcp
```

**Logs:**

```bash
docker compose logs -f pulse_mcp
```

## Configuration

All environment variables are configured in the **root `.env` file**.

```bash
# Copy template and update with your values
cp .env.example .env
```

See root `.env.example` for all available configuration options.

**Key variables:**

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
- **crawl** - Recursively crawl a website. Commands:
  - `crawl <url>` – start a crawl
  - `crawl status <jobId>` – view progress
  - `crawl cancel <jobId>` – stop a crawl
  - `crawl errors <jobId>` – collect crawl errors/robots blocks
  - `crawl list` – show active crawls
- **map** - Generate a sitemap
- **search** - Search indexed content
- **query** - Search the webhook-managed hybrid index and return embedded resources

See individual tool implementations in `tools/` for detailed parameters and response formats.

**Crawl usage example:**

```ts
await mcp.callTool("crawl", {
  command: "status",
  jobId: "crawl-job-123",
});
```

### Query Tool

Search indexed documentation leveraging the webhook service's hybrid (vector + BM25) pipeline.

**Features:**
- Hybrid, semantic, and keyword/BM25-only modes
- Domain filtering plus locale preferences (country/language) derived from map defaults
- Results returned as embedded MCP resources (markdown payloads + metadata)
- Automatic formatting of scores, descriptions, and metadata fields

**Usage:**
```ts
const result = await mcp.callTool("query", {
  query: "firecrawl scrape options",
  mode: "hybrid",
  limit: 10,
  filters: {
    domain: "docs.firecrawl.dev",
    language: "en",
  },
});
```

**Configuration:**
- `WEBHOOK_BASE_URL` (default: `http://pulse_webhook:52100` inside docker)
- `WEBHOOK_API_SECRET` (required)
- Standalone overrides: `MCP_WEBHOOK_BASE_URL`, `MCP_WEBHOOK_API_SECRET`
- Optional `RUN_QUERY_TOOL_INTEGRATION=true` to enable the live integration tests
