# Crawl Tool Documentation

> Updated: 03:30 PM | 11/12/2025

## Overview
The MCP **crawl** tool orchestrates Firecrawl-powered site crawls with a structured command set. It wraps the shared `@firecrawl/client` package so MCP clients can start jobs, monitor progress, cancel work, inspect errors, and list active crawls from a single interface.

| Attribute | Value |
| --- | --- |
| Tool name | `crawl` |
| Location | `apps/mcp/tools/crawl/index.ts` |
| Backend | Firecrawl crawl API (`/v2/crawl`, status, errors, active) |
| Default limit | 100 pages |
| Default result handling | `saveAndReturn` for downstream tools |

## Natural-Language Invocation
The `crawl` tool understands conversational requests—no CLI syntax needed. Examples:

1. **Start a crawl** – “Use the crawl tool to index docs.firecrawl.dev, limit it to 500 pages, and skip anything under `/blog`.”
2. **Check status** – “Ask the crawl tool for the latest status of job `cf7e0630-…`.”
3. **Cancel** – “Cancel the crawl job `cf7e0630-…` via the crawl tool.”
4. **Fetch errors** – “Show me the errors (including robots blocks) for job `cf7e0630-…`.”
5. **List active crawls** – “List every crawl currently running for my Firecrawl workspace.”

The assistant solves these by mapping your intent to the structured payload (defaulting to `command: start` when only a URL is supplied).

## Options Reference
The crawl tool schema (`apps/mcp/tools/crawl/schema.ts`) exposes the following fields:

| Option | Type / Range | Default | Applies To | Description |
| --- | --- | --- | --- | --- |
| `command` | `start\|status\|cancel\|errors\|list` | `start` | all | Determines the Firecrawl operation. |
| `url` | string (URL) | — | `start` | Starting URL for new crawl jobs (required for `start`). |
| `jobId` | string | — | `status`, `cancel`, `errors` | Crawl identifier returned by `start` (required for these commands). |
| `prompt` | string | — | `start` | Natural-language hint that lets Firecrawl auto-tune parameters (overrides manual options). |
| `limit` | integer `1-100000` | `100` | `start` | Maximum number of pages to fetch. |
| `maxDiscoveryDepth` | integer ≥1 | — | `start` | Restrict crawl depth when not traversing the entire domain. |
| `crawlEntireDomain` | boolean | `false` | `start` | Crawl every path under the host regardless of depth. |
| `allowSubdomains` | boolean | `false` | `start` | Follow links to subdomains. |
| `allowExternalLinks` | boolean | `false` | `start` | Follow links off-site. |
| `includePaths` / `excludePaths` | string[] (regex) | — | `start` | Whitelist/blacklist URL patterns; exclusions merge with `DEFAULT_LANGUAGE_EXCLUDES`. |
| `ignoreQueryParameters` | boolean | `true` | `start` | Treat URL variants with different query strings as identical. |
| `sitemap` | `include\|skip` | `include` | `start` | Whether to seed the crawl from the target's sitemap. |
| `delay` | integer ms | — | `start` | Delay between requests. |
| `maxConcurrency` | integer ≥1 | — | `start` | Maximum simultaneous requests Firecrawl may perform. |
| `scrapeOptions.formats` | enum[] | `['markdown','html']` | `start` | Output formats for scraped content. |
| `scrapeOptions.parsers` | array of `{ type: 'pdf', maxPages? }` | `[]` | `start` | PDF parsing configuration (disabled unless explicitly set). |
| `scrapeOptions.onlyMainContent` | boolean | `true` | `start` | Request main-content extraction only. |
| `scrapeOptions.includeTags/excludeTags` | string[] | — | `start` | Fine-grained selector filters. |
| `scrapeOptions.actions` | action[] | — | `start` | Browser automation steps (wait, click, write, etc.) applied before scraping each page. |

Validation errors (missing `url` on `start`, absent `jobId` on status/cancel/errors, invalid limits, etc.) are surfaced immediately to the caller with `isError: true` responses.

> Backwards compatibility: legacy payloads that omit `command` still work. Providing only `jobId` (or `cancel: true`) automatically maps to the appropriate command via the resolver in `apps/mcp/tools/crawl/schema.ts`.

## Responses

Formatting is handled by `apps/mcp/tools/crawl/response.ts`:

- **start**: returns job ID + status URL ready for polling.
- **status**: prints progress summary, credits consumed, expiry, and whether
  pagination is required (`next` link) when payload exceeds 10MB.
- **cancel**: confirms cancellation state.
- **errors**: enumerates Firecrawl error objects (`error`, `url`, `timestamp`,
  `statusCode`) plus `robots-blocked` URLs.
- **list**: lists active jobs with ID + URL; displays `0` rows when empty.

Each response sets `isError` to `false` on success. Transport-level or schema
failures produce `isError: true` with a prefixed message ("Crawl error:").

## Usage Examples (Natural Language)
- “Start a crawl on docs.firecrawl.dev, cap it at 500 pages, and exclude `/blog`.”
- “What’s the current status of crawl job `cf7e0630-…`?”
- “Cancel crawl job `cf7e0630-…` right now.”
- “Show me the error log for crawl job `cf7e0630-…`, including robots blocks.”
- “List every active crawl job for my account.”

Each instruction is translated into the corresponding structured payload (command + options) automatically.

## Firecrawl Client Integration

The MCP tool consumes `FirecrawlCrawlClient` from `packages/firecrawl-client`.
Functions used:

- `startCrawl(options)`
- `getCrawlStatus(jobId)`
- `cancelCrawl(jobId)`
- `getCrawlErrors(jobId)` *(new)*
- `listActiveCrawls()` *(new)*

Those methods delegate to `src/operations/crawl.ts`, which calls Firecrawl's
`/v2/crawl`, `/v2/crawl/{id}`, `/v2/crawl/{id}/errors`, and `/v2/crawl/active`.

## Testing

| Area | Tests |
| --- | --- |
| Firecrawl SDK | `packages/firecrawl-client/src/operations/crawl.test.ts` validates all API calls using mocked `fetch`. Run with `pnpm --filter './packages/firecrawl-client' test`. |
| MCP Schema | `apps/mcp/tools/crawl/schema.test.ts` covers command validation & scrape actions. |
| MCP Pipeline | `apps/mcp/tools/crawl/pipeline.test.ts` asserts start/status/cancel/errors/list routing + option merging. |
| MCP Responses | `apps/mcp/tools/crawl/response.test.ts` validates formatting for new result types. |
| Tool Handler | `apps/mcp/tools/crawl/index.test.ts` ensures handler wires commands properly. |

CI/local scripts:

```bash
pnpm --filter './packages/firecrawl-client' test
pnpm --filter './apps/mcp' test
```

## Troubleshooting & Failure Modes

- **Missing `WEBHOOK_API_SECRET`:** When running MCP server tests, the query
  tool logs an error if `WEBHOOK_API_SECRET` isn't set. Harmless for crawl tool;
  documented in `apps/mcp/tests/server/oauth-disabled.test.ts` output.
- **Firecrawl creds:** Set `MCP_FIRECRAWL_API_KEY` (or global `FIRECRAWL_API_KEY`)
  and optional `MCP_FIRECRAWL_BASE_URL` to point at self-hosted endpoints.
- **Robots restrictions:** Firecrawl refuses to crawl sites whose `robots.txt`
  cannot be retrieved or explicitly forbid the path. Use `getCrawlErrors` to
  inspect `robotsBlocked` results before retrying.
- **Large payloads:** When `status` responses include `next`, fetch that URL to
  paginate results; the MCP tool surfaces the link but does not auto-fetch >10MB
  payloads.

## References
- Plan: `docs/plans/2025-11-12-crawl-tool-actions.md`
- Schema/Pipeline: `apps/mcp/tools/crawl/schema.ts`, `pipeline.ts`, `response.ts`, `index.ts`
- Firecrawl client: `packages/firecrawl-client/src/operations/crawl.ts`
- Session log: `.docs/tmp/crawl-tool-actions.md`
