# Firecrawl API Service Guide

_Last Updated: 01:30 AM EST | Nov 13 2025_

## Role in Pulse
The Firecrawl API is the core scraping/orchestration backend. MCP tools (`scrape`, `crawl`, `map`, `search`, `query`) and the webhook worker all rely on it to fetch raw pages, execute headless Playwright sessions, and normalize content into Markdown/JSON. Without Firecrawl the Pulse stack cannot scrape, crawl, or refresh documents.

## Container & Ports
- **Compose service / container**: `firecrawl`
- **Image**: `ghcr.io/firecrawl/firecrawl` (preferred over the legacy `apps/api` build)
- **Host ➜ internal port**: `${FIRECRAWL_PORT:-50102} ➜ ${FIRECRAWL_INTERNAL_PORT:-3002}`
- **Command**: `node dist/src/harness.js --start-docker`
- **Health**: no explicit compose health check; rely on `/health` endpoint (manual) or MCP readiness (fails fast if Firecrawl is unreachable).
- **Network**: joins `pulse` bridge so other containers reach it at `http://firecrawl:3002`.

## Configuration & Environment Variables
| Variable | Purpose |
|----------|---------|
| `FIRECRAWL_PORT` | Host port exposed to developers (default `50102`). |
| `FIRECRAWL_INTERNAL_PORT` | Internal service port (default `3002`). |
| `FIRECRAWL_API_URL` | Host URL for CLI/testing (default `http://localhost:50102`). |
| `FIRECRAWL_API_KEY` | API key required for authenticated requests. For self-hosted deployments we default to `self-hosted-no-auth`; rotate for production. |
| `MCP_FIRECRAWL_BASE_URL` | MCP server internal URL (`http://firecrawl:3002`). |
| `MCP_FIRECRAWL_API_KEY` | Key the MCP server presents when calling Firecrawl (defaults to `self-hosted-no-auth`). |
| `WEBHOOK_FIRECRAWL_API_URL` / `WEBHOOK_FIRECRAWL_API_KEY` | Used by the webhook worker when initiating re-scrapes. |

Other knobs (concurrency, timeouts, Playwright pool size) are controlled via Firecrawl’s own config file inside the container; use env overrides if upgrading the image.

## Dependencies & Networking
- **depends_on**: `pulse_redis`, `pulse_playwright`, `pulse_postgres` must be online first.
- **Internal URLs**: referenced as `http://firecrawl:3002` by MCP and webhook, and `http://localhost:50102` externally.
- **Outbound requirements**: Firecrawl needs unrestricted internet egress for crawling target sites. Ensure firewall rules allow HTTP/HTTPS from the container.

## Data & Storage
- Firecrawl stores crawl metadata in PostgreSQL (`pulse_postgres` database, `public` schema) and uses Redis for task coordination, job throttling, and caching.
- No persistent volume is mounted because the official image persists only transient data. Database backups cover scrape history.

## Deployment & Lifecycle
1. Verify Redis (50104), PostgreSQL (50105), and Playwright (50100) are healthy.
2. Start or rebuild: `docker compose up -d firecrawl`.
3. Confirm readiness:
   ```bash
   curl -sf http://localhost:50102/health
   docker compose logs -f firecrawl
   ```
4. When upgrading the image, restart dependent services (`pulse_mcp`, `pulse_webhook`, `pulse_webhook-worker`) to ensure they reconnect with the updated API.
5. Record deployments in `.docs/deployment-log.md`.

## Operations & Monitoring
- **Logs**: `docker compose logs -f firecrawl` show crawl queue events, Playwright allocations, scraping errors, and rate limiting.
- **Health**: `GET /health` returns `{ "status": "ok" }`. MCP tools will error with `Firecrawl API unavailable` if this fails.
- **Metrics**: Use logs to track concurrency; integrate with external monitoring later (Prometheus explicitly disallowed).
- **Rate limits**: Firecrawl obeys target-site `robots.txt`. Failures reference `ROBOTS_BLOCKED` or `RATE_LIMITED` in logs.

## Failure Modes & Troubleshooting
| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| HTTP 502/timeout from MCP scrape tool | Firecrawl container down or health endpoint failing | Restart `firecrawl`, verify dependencies, check `docker compose ps`. |
| Pages render blank | Playwright service unreachable (`ECONNREFUSED pulse_playwright:3000`) | Restart Playwright, confirm `docker compose logs pulse_playwright`. |
| Jobs stuck in `queued` state | Redis unavailable or credentials wrong | Verify `redis://pulse_redis:6379`, check `docker compose logs pulse_redis`. |
| Database errors | PostgreSQL not reachable (e.g., `ECONNREFUSED pulse_postgres:5432`) or schema drift | Ensure DB container is up, run migrations if custom build reintroduced. |

## Verification Checklist
- `curl -sf http://localhost:50102/health` succeeds.
- MCP `scrape` command against a test URL returns content.
- Webhook worker logs show successful `firecrawl scrape` invocations after change notifications.
- PostgreSQL contains fresh crawl rows (check `public.jobs` table if using Firecrawl schema).

## Related Documentation
- `docs/services/PORTS.md`
- `docs/ARCHITECTURE_DIAGRAM.md`
- `docs/mcp/SCRAPE.md`, `docs/mcp/CRAWL.md`, `docs/mcp/MAP.md`
- `packages/firecrawl-client/README.md` (client bindings)
