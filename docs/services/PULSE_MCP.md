# Pulse MCP Server Guide

_Last Updated: 01:30 AM EST | Nov 13 2025_

## Role in Pulse
The MCP server bridges Claude with the Pulse scraping stack. It exposes Firecrawl-powered tools (`scrape`, `crawl`, `map`, `search`, `query`) plus OAuth-protected resource storage so users can orchestrate crawls, serve cached data, and query the webhook index directly from MCP-compatible clients.

### Tool Reference
- [`docs/mcp/INDEX.md`](../mcp/INDEX.md) – overview of every MCP tool and transport option.
- [`docs/mcp/SCRAPE.md`](../mcp/SCRAPE.md) – single-page scraping + batch job orchestration.
- [`docs/mcp/CRAWL.md`](../mcp/CRAWL.md) – Firecrawl crawl jobs (start/status/cancel/errors/list).
- [`docs/mcp/MAP.md`](../mcp/MAP.md) – sitemap-style discovery with country/language defaults.
- [`docs/mcp/SEARCH.md`](../mcp/SEARCH.md) – direct Firecrawl search API wrapper.
- [`docs/mcp/QUERY.md`](../mcp/QUERY.md) – webhook hybrid search integration (hybrid/semantic/keyword modes).
- [`docs/mcp/RESOURCES.md`](../mcp/RESOURCES.md) – resource storage modes, TTL behavior, and download semantics.

## Container & Ports
- **Compose service / container**: `pulse_mcp`
- **Dockerfile**: `apps/mcp/Dockerfile` (context is repo root for shared packages)
- **Host ➜ internal port**: `${MCP_PORT:-50107} ➜ 3060`
- **Volumes**: `${APPDATA_BASE:-/mnt/cache/appdata}/pulse_mcp/resources:/app/resources` for persistent resource cache.
- **Health check**: `wget --spider http://localhost:3060/health` (30 s interval, 3 retries, 5 s start period).

## Configuration & Environment Variables
| Variable | Purpose |
|----------|---------|
| `MCP_PORT`, `MCP_HOST` | HTTP bind configuration. |
| `MCP_FIRECRAWL_BASE_URL` / `MCP_FIRECRAWL_API_KEY` | Credentials for Firecrawl API calls. |
| `MCP_WEBHOOK_BASE_URL` / `MCP_WEBHOOK_API_SECRET` | Webhook query tool connection; defaults to bridge service. |
| `MCP_LLM_PROVIDER`, `MCP_LLM_API_BASE_URL`, `MCP_LLM_MODEL` | Controls extraction LLM for structured scrapes. |
| `MCP_OPTIMIZE_FOR` | `cost`, `quality`, etc. Tunes tool defaults. |
| `MCP_RESOURCE_STORAGE`, `MCP_RESOURCE_TTL` | Persistence backend (memory, filesystem, redis) and TTL for saved artifacts. |
| `MCP_ENABLE_OAUTH` + Google OAuth settings | Enables OAuth2 login for hosted MCP; requires Redis-backed sessions (`MCP_REDIS_URL`). |
| `MCP_MAP_DEFAULT_COUNTRY`, `MCP_MAP_DEFAULT_LANGUAGES`, `MCP_MAP_MAX_RESULTS_PER_PAGE` | Defaults for map tool requests. |

See `.env.example` for the full matrix. Any change requires restarting `pulse_mcp`.

## Dependencies & Networking
- Depends on the Firecrawl API container (`depends_on`), but also consumes the webhook API and Redis (when OAuth enabled) via internal hostnames.
- External clients connect via `http://localhost:50107`; internal services use `http://pulse_mcp:3060`.

## Deployment Workflow
1. Build (when code changes): `docker compose build pulse_mcp`.
2. Start: `docker compose up -d pulse_mcp`.
3. Confirm health: `curl -sf http://localhost:50107/health`.
4. Tail logs for tool registration + dependency wiring: `docker compose logs -f pulse_mcp`.
5. Document deployment metadata in `.docs/deployment-log.md`.

## Operations & Monitoring
- **Logs**: include structured JSON for requests, Firecrawl tool invocations, OAuth flows, and query-tool latency. Filter with `jq` for specific tools.
- **Resource storage**: Files saved via MCP responses live under `${APPDATA_BASE}/pulse_mcp/resources`; prune when disk fills.
- **OAuth**: When `MCP_ENABLE_OAUTH=true`, verify Google credentials and Redis availability before exposing service publicly.

## Failure Modes & Troubleshooting
| Symptom | Likely Cause | Resolution |
|---------|--------------|------------|
| `/health` fails with 500 | Firecrawl base URL unreachable or env misconfiguration | Confirm `http://firecrawl:3002/health`, check env values, restart container. |
| Tool calls return `401 Unauthorized` | Missing or incorrect API secrets for Firecrawl/Webhook | Double-check `MCP_FIRECRAWL_API_KEY` and `MCP_WEBHOOK_API_SECRET`. |
| OAuth redirect loop | Redis unavailable or OAuth secrets unset | Ensure `MCP_REDIS_URL`, `MCP_GOOGLE_CLIENT_ID/SECRET`, and redirect URI match Google console settings. |
| Large scrape responses lost | Resource storage set to `memory` (default) causing eviction | Switch to `filesystem` storage and mount persistent volume. |

## Verification Checklist
- `curl -sf http://localhost:50107/health` returns `ok` status.
- MCP client can run `scrape` and `crawl list` without error.
- Query tool returns results by hitting webhook search (check logs for `query-tool` entries).
- OAuth endpoints (`/auth/status`) respond when enabled.

## Related Documentation
- `apps/mcp/README.md`
- `docs/mcp/*.md` (tool guides)
- `docs/services/FIRECRAWL.md`
- `docs/services/PULSE_WEBHOOK.md`
