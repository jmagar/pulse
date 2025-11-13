# Query Tool Documentation

> Updated: 07:30 AM | 11/12/2025

## Overview
The MCP **query** tool lets Claude (or any MCP-compatible client) query the webhook service’s hybrid (vector + BM25) index of Firecrawl documentation. Requests go to the webhook `/api/search` endpoint with Bearer auth; responses are returned as a concise plain-text summary listing the top five hits (title, URL, snippet, metadata) plus pagination guidance for the remaining results.

| Attribute | Value |
| --- | --- |
| Tool name | `query` |
| Location | `apps/mcp/tools/query/index.ts` |
| Backend dependency | Webhook service (`apps/webhook`) |
| Default limit | 10 results |
| Default internal URL | `http://pulse_webhook:52100` |

## Natural-Language Invocation
1. “Use the query tool to search for *firecrawl scrape options* on docs.firecrawl.dev.”
2. “Run a semantic search for ‘how to extract data from websites’ and share the top matches.”
3. “Perform a keyword-only search for ‘markdown html rawHtml’.”
4. “Search for ‘API authentication’ but only show Spanish content.”
5. “Give me the next five results about Firecrawl pagination (offset 5 so I can see items 6‑10).”

The assistant converts these requests into the structured options below.

## Options Reference
(Schema: `apps/mcp/tools/query/schema.ts`)

| Option | Type / Range | Default | Description |
| --- | --- | --- | --- |
| `query` | string | — | Required search text (min length 1). |
| `mode` | `hybrid | semantic | keyword | bm25` | `hybrid` | Chooses vector + BM25 fusion, vector-only, or lexical-only search. |
| `limit` | integer `1-100` | `5` | Number of hits to request from the webhook (output still shows at most five per call). |
| `offset` | integer ≥0 | `0` | Zero-based cursor for pagination (`offset=5` fetches results 6‑10). |
| `filters.domain` | string | — | Restrict matches to a specific domain (e.g., `docs.firecrawl.dev`). |
| `filters.language` | string | — | ISO language code filter (optional). |
| `filters.country` | string | — | ISO country code filter (optional). |

## Configuration
| Variable | Scope | Default | Notes |
| --- | --- | --- | --- |
| `WEBHOOK_BASE_URL` | root `.env` | `http://pulse_webhook:52100` | Internal docker URL used by the MCP server |
| `WEBHOOK_API_SECRET` | root `.env` | _required_ | Bearer token forwarded to the webhook service |
| `MCP_WEBHOOK_BASE_URL` | `apps/mcp/.env` (standalone) | `http://localhost:50108` | Override when running MCP outside docker |
| `MCP_WEBHOOK_API_SECRET` | `apps/mcp/.env` | _required_ | Secret for standalone override |
| `RUN_QUERY_TOOL_INTEGRATION` | runtime env | `false` | Enable the live integration test (requires webhook running) |

The MCP server checks `MCP_WEBHOOK_*` first and falls back to the root `WEBHOOK_*` values. Missing secrets prevent the tool from registering.

## Response Format
`apps/mcp/tools/query/response.ts` emits a single plain-text block:

```
Query: firecrawl scrape options
Mode: hybrid

Results 1-5 (of ~18)

1. Scrape | Firecrawl
   URL: https://docs.firecrawl.dev/features/scrape
   Description: Turn any URL into clean data…
   Snippet: Scrape formats…
   Meta: Domain=docs.firecrawl.dev | Lang=en | Score=0.95

...

Showing 5 of 18 results. Re-run with offset=5 to continue.
```

- Only the first five hits are shown to keep CLI output readable.
- The footer instructs you to re-run with `offset` bumped by the number of displayed entries.
- If no results exist, the tool responds with `No results found for query: "…"`. Errors continue to set `isError: true` with the message.

## Usage Patterns
- **Hybrid search with filtering:** “Use the query tool to search for *firecrawl scrape options* on docs.firecrawl.dev.”
- **Semantic search:** “Query the docs semantically for ‘how to extract data from websites’.”
- **Keyword-only:** “Ask the query tool to perform a keyword-only search for ‘markdown html rawHtml’ and share the snippets.”
- **Localized queries:** “Search for ‘API authentication’ but return Spanish-language matches only.”
- **Short summaries:** After retrieving results, ask the assistant to summarize the returned resources (each contains the chunk text and metadata).

## Deployment Checklist
1. Ensure the webhook service is running and reachable (Docker: `pulse_webhook:52100`).
2. Populate `WEBHOOK_BASE_URL`/`WEBHOOK_API_SECRET` (or MCP overrides) in `.env`.
3. Restart the MCP server and confirm the startup banner lists the query tool.

## Testing
| Command | Purpose |
| --- | --- |
| `cd apps/mcp && pnpm test tools/query` | Schema, client, response, handler, and registration tests |
| `RUN_QUERY_TOOL_INTEGRATION=true … pnpm test tests/integration/query-tool.test.ts` | Live test against the webhook service |
| `cd apps/mcp && pnpm test:run` | Full MCP server test suite |

## Troubleshooting
| Symptom | Likely Cause | Resolution |
| --- | --- | --- |
| MCP server startup logs `WEBHOOK_API_SECRET is required for the query tool` | Secret missing from `.env` or MCP overrides | Add `WEBHOOK_BASE_URL` + `WEBHOOK_API_SECRET`, restart server |
| Tool returns `Query error: 401 Unauthorized` | Invalid webhook secret | Regenerate secret in webhook service and update `.env` |
| Results always empty | Filters too strict or index stale | Remove filters or verify webhook index job completed |
| Integration tests skipped | `RUN_QUERY_TOOL_INTEGRATION` not true | Export env flag and ensure webhook service is running |

## Related References
- `docs/mcp-query-tool.md` – expanded architecture & examples
- `apps/mcp/tools/query/` – implementation (schema, client, response, tests)
- `apps/webhook/api/routers/search.py` – webhook-side search handler
- `docs/ARCHITECTURE_DIAGRAM.md` – monorepo overview
