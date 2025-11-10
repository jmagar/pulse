Firecrawl is a web scraper API. The directory you have access to is a monorepo:
 - `apps/api` has the actual API and worker code
 - `apps/js-sdk`, `apps/python-sdk`, and `apps/rust-sdk` are various SDKs

## Monorepo Structure

pulse uses a **multi-language monorepo**:

### Node.js Apps (pnpm workspace)
- `apps/mcp` - MCP server (has internal workspace: local/remote/shared)
- `apps/web` - Web UI
- `packages/*` - Shared libraries

**Build:** `pnpm build` or `pnpm build:web` or `pnpm build:mcp`
**Test:** `pnpm test` or `pnpm test:web`  or `pnpm test:mcp`

### Python Apps (independent)
- `apps/webhook` - Search bridge

**Build:** `cd apps/webhook && uv sync`
**Test:** `cd apps/webhook && make test`

### Shared Infrastructure
- PostgreSQL: Shared database with app-specific schemas
  - `public` schema: Firecrawl API data
  - `webhook` schema: Webhook bridge metrics
- Redis: Shared queue for API and webhook
- Docker network: `firecrawl` (bridge)

### Cross-Service Communication

**Internal URLs (Docker network):**
- API: `http://firecrawl:3002`
- MCP: `http://firecrawl_mcp:3060`
- Webhook: `http://firecrawl_webhook:52100`
- Redis: `redis://firecrawl_cache:6379`
- PostgreSQL: `postgresql://firecrawl_db:5432/firecrawl_db`

**Never hardcode external URLs in code!** Use environment variables.

### Environment Variables

**Single Source of Truth:** The root `.env` file contains ALL environment variables for ALL services.

- `MCP_*` - MCP server variables (namespaced for monorepo)
- `WEBHOOK_*` - Webhook bridge variables (namespaced for monorepo)
- `FIRECRAWL_*` - Firecrawl API variables
- Shared infrastructure: `DATABASE_URL`, `REDIS_URL`

**Docker Compose:** The `env_file: - .env` directive in the common service anchor ensures all containers receive the root `.env`.

**Standalone Deployments:** Individual apps have `.env.example` files for standalone use, but these should NOT be used in monorepo deployments.

**Adding New Variables:**
1. Add to root `.env` and `.env.example`
2. Use namespaced prefixes (`MCP_*`, `WEBHOOK_*`, etc.)
3. Update app-specific code to read from environment
4. Document in this CLAUDE.md

### Adding New Services

1. Add to `docker-compose.yaml` following the anchor pattern
2. Add port to `.docs/services-ports.md`
3. Add environment variables to `.env.example`
4. Update this CLAUDE.md with integration points
5. Add build/test scripts to root `package.json` if Node.js

### Testing Integration

When testing cross-service features:
1. Use `docker compose up -d` to start all services
2. Check health endpoints before tests
3. Use internal service URLs in tests
4. Clean up with `docker compose down` after

When making changes to the API, here are the general steps you should take:
1. Write some end-to-end tests that assert your win conditions, if they don't already exist
  - 1 happy path (more is encouraged if there are multiple happy paths with significantly different code paths taken)
  - 1+ failure path(s)
  - Generally, E2E (called `snips` in the API) is always preferred over unit testing.
  - In the API, always use `scrapeTimeout` from `./lib` to set the timeout you use for scrapes.
  - These tests will be ran on a variety of configurations. You should gate tests in the following manner:
    - If it requires fire-engine: `!process.env.TEST_SUITE_SELF_HOSTED`
    - If it requires AI: `!process.env.TEST_SUITE_SELF_HOSTED || process.env.OPENAI_API_KEY || process.env.OLLAMA_BASE_URL`
2. Write code to achieve your win conditions
3. Run your tests using `pnpm harness jest ...`
  - `pnpm harness` is a command that gets the API server and workers up for you to run the tests. Don't try to `pnpm start` manually.
  - The full test suite takes a long time to run, so you should try to only execute the relevant tests locally, and let CI run the full test suite.
4. Push to a branch, open a PR, and let CI run to verify your win condition.
Keep these steps in mind while building your TODO list.