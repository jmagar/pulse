# Scrape Tool Documentation

> Updated: 03:30 PM | 11/12/2025

## Overview
The MCP **scrape** tool handles single-page extractions (with caching) and Firecrawl-powered batch scraping when you pass multiple URLs or batch commands. It shares the crawl tool’s command structure so conversational prompts like “scrape status …” or “scrape cancel …” just work.

| Attribute | Value |
| --- | --- |
| Tool name | `scrape` |
| Location | `apps/mcp/tools/scrape/index.ts` |
| Backends | Native fetch strategies + Firecrawl batch scrape API |
| Default timeout | 60 000 ms |
| Result handling | `saveAndReturn` (resource + inline text) |

## Natural-Language Invocation
The resolver maps conversational prompts to structured payloads automatically. Examples:

1. **Single scrape** – “Scrape https://docs.firecrawl.dev/getting-started and give me the cleaned markdown.”
2. **Forced refresh** – “Re-scrape https://example.com/privacy with forceRescrape=true and returnOnly mode.”
3. **Batch start** – “Scrape these five docs in a batch: [list of URLs].”
4. **Batch status** – “What’s the status of scrape job `3c8d…`?”
5. **Batch cancel** – “Cancel batch scrape job `3c8d…`.”
6. **Batch errors** – “Show the errors (including robots blocks) for batch job `3c8d…`.”

Commands default to `start` when you only provide URLs; supplying `jobId` or explicit `command` switches modes automatically. Legacy payloads with `cancel: true` continue to work because the schema resolves them to the new command enum.

## Options Reference
(Schema: `apps/mcp/tools/scrape/schema.ts`)

| Option | Type / Range | Default | Applies To | Description |
| --- | --- | --- | --- | --- |
| `command` | `start\|status\|cancel\|errors` | `start` | all | Operation selector (legacy payloads without `command` still work). |
| `jobId` | string | — | `status`, `cancel`, `errors` | Batch scrape identifier returned by the start command. |
| `url` | URL string | — | `start` | Primary URL when scraping a single page. |
| `urls` | URL[] | — | `start` | Provide multiple URLs to trigger Firecrawl batch scraping automatically (must contain ≥2 entries to batch). |
| `timeout` | number (ms) | `60000` | `start` | Page-load timeout passed to scraping strategies / Firecrawl API. |
| `maxChars` / `startIndex` | number | `100000` / `0` | `start` | Pagination knobs for returned content. |
| `resultHandling` | `saveOnly\|saveAndReturn\|returnOnly` | `saveAndReturn` | `start` | Determines whether scraped data is saved as an MCP resource, returned inline, or both. |
| `forceRescrape` | boolean | `false` | `start` | Bypass cache lookup. |
| `cleanScrape` | boolean | `true` | `start` | Enable markdown cleaning pipeline. |
| `formats` / `parsers` / `onlyMainContent` / `actions` / `headers` / `blockAds` / `proxy` / `waitFor` / `includeTags` / `excludeTags` | see schema | — | `start` | Forwarded to scraping strategies (native + Firecrawl) and batch payloads. |

Validation rules:
- `start` requires at least one `url` or `urls` entry.
- Batch subcommands require `jobId`.
- `cancel: true` without `command` automatically maps to `command: "cancel"`.

### Default `scrapeOptions`
The crawl/scrape pipeline injects a consistent set of defaults via `apps/mcp/config/crawl-config.ts` whenever you omit or partially define `scrapeOptions`:

| Field | Default | Notes |
|-------|---------|-------|
| `formats` | `['markdown', 'html', 'summary', 'changeTracking', 'links']` | Requests multiple Firecrawl output formats so downstream tooling (diffs, summaries, resources) always has the data it needs. Override to limit payload size. |
| `onlyMainContent` | `true` | Strips nav, ads, and footers for cleaner NotebookLM ingestion. Set to `false` if you need complete HTML. |
| `blockAds` | `true` | Enables Firecrawl’s ad / cookie banner blocking. |
| `removeBase64Images` | `true` | Prevents large inline images from bloating responses. |
| `parsers` | `[]` | Disables PDF parsing by default (Firecrawl charges extra credits). Provide objects like `{ type: 'pdf', maxPages: 5 }` to enable. |

When you supply custom `scrapeOptions`, the merge logic keeps these defaults unless you explicitly override a field; `parsers` always falls back to an array (never `undefined`) to avoid batch API regressions. The same defaults flow into Firecrawl batch jobs, crawl jobs, and any MCP flow that pulls from `mergeScrapeOptions`.

> **Search tool note:** The `search` MCP tool has its own schema defaults (`blockAds=true`, `removeBase64Images=true`) but leaves `formats`/`onlyMainContent` unset. If you want the full crawl defaults during search-result scraping, pass them explicitly.

## Responses

Formatting logic lives in `apps/mcp/tools/scrape/response.ts`:

- **Single start** – preserves previous behavior (resources or text depending on `resultHandling`). Pagination warnings appended when truncated.
- **Batch start** – returns plain-text summary with job ID, requested URL count, and invalid URL list (if any). Example:
  ```
  Batch scrape started successfully!
  Job ID: 3c8d…
  URLs requested: 5
  Invalid URLs: None
  ```
- **Batch status** – prints `status`, `completed/total`, credits, expiry, and a pagination notice when Firecrawl supplies a `next` link (>10MB payloads).
- **Batch cancel** – confirms cancellation and echoes Firecrawl’s message.
- **Batch errors** – enumerates Firecrawl `errors[]` plus a list of `robotsBlocked` URLs.

Single-URL scrapes continue to return cleaned content/resources according to `resultHandling`. Batch commands, however, only return lightweight plain-text metadata (job ID, progress, errors) so the CLI never emits full result payloads.

### Behavior Notes

- Single-page scrapes still run the cache → scrape → clean → save pipeline and return content according to `resultHandling`.
- Scrapes no longer trigger hidden base-domain crawls. If you need wider discovery, explicitly run the `crawl` tool.

## Single vs Batch Execution

The handler (`apps/mcp/tools/scrape/handler.ts`) routes requests as follows:
1. Parse/normalize arguments via `buildScrapeArgsSchema`.
2. `command !== "start"` → `runBatchScrapeCommand` (status/cancel/errors) followed by the appropriate response helper.
3. `command === "start"` **and** `urls.length > 1` → build Firecrawl batch options (`createBatchScrapeOptions`) and call `startBatchScrapeJob`.
4. Otherwise fall back to the existing cache → scrape → clean → save pipeline for single pages.

Batch helpers (`apps/mcp/tools/scrape/pipeline.ts`) wrap the shared `@firecrawl/client` batch endpoints to keep HTTP details centralized.

## Firecrawl Client Integration

`@firecrawl/client` already exposes:
- `startBatchScrape(options)`
- `getBatchScrapeStatus(jobId)`
- `cancelBatchScrape(jobId)`
- `getBatchScrapeErrors(jobId)`

`apps/mcp/server.ts` adapts those through `DefaultFirecrawlClient`, so MCP code can call the same interface used in tests/mocks.

## Testing

| Area | Tests |
| --- | --- |
| Batch option builder & routing | `apps/mcp/tools/scrape/pipeline.test.ts` verifies option mapping plus command dispatch. |
| Response formatting | `apps/mcp/tools/scrape/response.test.ts` covers start/status/cancel/errors text output. |
| Handler wiring | `apps/mcp/tools/scrape/handler.test.ts` ensures multi-URL requests and batch commands hit the correct pipelines. |
| Schema validation | `apps/mcp/tools/scrape/schema.test.ts` (updated earlier) exercises command resolver + multi-URL acceptance. |

Run the relevant suites with:

```bash
pnpm --filter './apps/mcp' test -- tools/scrape/pipeline.test.ts
pnpm --filter './apps/mcp' test -- tools/scrape/response.test.ts
pnpm --filter './apps/mcp' test -- tools/scrape/handler.test.ts
```

Full validation (per plan `docs/plans/2025-11-12-scrape-batch.md`):

```bash
pnpm --filter './apps/mcp' test
pnpm --filter './apps/mcp' build
```

## Troubleshooting
| Symptom | Likely Cause | Resolution |
| --- | --- | --- |
| `url`/`urls` validation errors | Missing required inputs for `start` | Provide at least one URL (or `urls` array) before invoking the tool. |
| Batch commands rejected | `jobId` omitted | Include the job ID returned from the batch start response. |
| Cached result returned unexpectedly | `forceRescrape` left false | Set `forceRescrape: true` to bypass cache. |
| Large payload exceeds token budget | Using `saveAndReturn` for huge pages | Switch to `saveOnly` and fetch the saved resource when needed. |

## References
- Plan: `docs/plans/2025-11-12-scrape-batch.md`
- Session log: `.docs/tmp/crawl-tool-actions.md` (scrape batch section)
- Implementation: `apps/mcp/tools/scrape/*`
- Shared Firecrawl client: `packages/firecrawl-client/src/operations/batch-scrape.ts`
