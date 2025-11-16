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

### Remote Docker Context (Optional)

For GPU acceleration or remote Docker hosts, you can configure SSH access:

**Requirements:**

- SSH key pair for authentication
- Known hosts file for the remote machine
- `MCP_DOCKER_REMOTE_HOST` environment variable set

**Setup:**

1. Create an SSH directory with required files:

   ```bash
   mkdir -p ~/.ssh/pulse_mcp_ssh
   cp ~/.ssh/id_rsa ~/.ssh/pulse_mcp_ssh/
   cp ~/.ssh/known_hosts ~/.ssh/pulse_mcp_ssh/
   chmod 600 ~/.ssh/pulse_mcp_ssh/*
   ```

2. Configure the mount in docker-compose.yaml:

   ```yaml
   volumes:
     - ~/.ssh/pulse_mcp_ssh:/mnt/ssh:ro
   ```

3. Set the remote host in .env:
   ```bash
   MCP_DOCKER_REMOTE_HOST=username@remote-host-ip
   ```

The entrypoint will automatically create a Docker context named `gpu-machine` if the environment variable is set.

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
- **crawl** - Recursively crawl a website. Commands:
  - `crawl <url>` – start a crawl
  - `crawl status <jobId>` – view progress
  - `crawl cancel <jobId>` – stop a crawl
  - `crawl errors <jobId>` – collect crawl errors/robots blocks
  - `crawl list` – show active crawls
- **map** - Generate a sitemap
- **search** - Search indexed content
- **query** - Search the webhook-managed hybrid index and return embedded resources
- **profile_crawl** - Debug and profile crawl performance

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

### Profile Crawl Tool

Debug and profile crawl performance by querying lifecycle metrics from the webhook service.

**Purpose:**

- Identify performance bottlenecks in crawl operations
- Analyze which pages failed and why
- Monitor crawl progress and completion status
- Get actionable optimization insights

**Key Parameters:**

- `crawl_id` (required) - Firecrawl crawl/job identifier returned by the crawl tool
- `include_details` (optional) - Include per-page operation breakdowns (default: false)
- `error_offset` (optional) - Error pagination offset for paging through errors (default: 0)
- `error_limit` (optional) - Maximum errors per page, 1-50 (default: 5)

**Output Format:**
Plain-text diagnostic report with:

- Crawl status and duration
- Pages processed (indexed vs failed)
- Performance breakdown by operation (chunking, embedding, Qdrant, BM25)
- Error details grouped by operation type
- Actionable optimization insights

**Basic Usage:**

```ts
// After triggering a crawl
const crawlResult = await mcp.callTool("crawl", {
  command: "start",
  url: "https://docs.example.com",
});

// Profile the completed crawl
const profile = await mcp.callTool("profile_crawl", {
  crawl_id: crawlResult.id,
});
```

**Detailed Analysis:**

```ts
// Get per-page breakdown of slowest pages
const detailedProfile = await mcp.callTool("profile_crawl", {
  crawl_id: "abc123",
  include_details: true,
});
```

**Error Pagination:**

```ts
// View first page of errors
const errors = await mcp.callTool("profile_crawl", {
  crawl_id: "abc123",
  error_offset: 0,
  error_limit: 10,
});

// View next page of errors
const moreErrors = await mcp.callTool("profile_crawl", {
  crawl_id: "abc123",
  error_offset: 10,
  error_limit: 10,
});
```

**Configuration:**

- `WEBHOOK_BASE_URL` (default: `http://pulse_webhook:52100` inside docker)
- `WEBHOOK_API_SECRET` (required)
- Standalone overrides: `MCP_WEBHOOK_BASE_URL`, `MCP_WEBHOOK_API_SECRET`

Same configuration as the query tool - no additional setup required.
