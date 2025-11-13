# Map Tool Documentation

> Updated: 03:25 PM | 11/12/2025

## Overview
The MCP **map** tool enumerates URLs under a given domain using Firecrawl’s discovery pipeline. It understands sitemaps, on-site navigation, and optional search hints to build a structured list of links. Results can be returned inline, saved as embedded MCP resources, or stored as resource links for token-efficient workflows.

| Attribute | Value |
| --- | --- |
| Tool name | `map` |
| Location | `apps/mcp/tools/map/index.ts` |
| Backend | Firecrawl map API (`/v2/map`) via `@firecrawl/client` |
| Default pagination | `startIndex = 0`, `maxResults = MAP_MAX_RESULTS_PER_PAGE` (200 unless overridden) |

## Natural-Language Invocation
Examples of how to request this tool during a conversation:

1. **Basic discovery** – “Use the map tool to list the first 200 URLs under docs.firecrawl.dev.”
2. **Exclude query params** – “Map docs.firecrawl.dev but ignore duplicate links that only differ by query strings.”
3. **Sitemap-only** – “Generate a sitemap-only URL list for docs.firecrawl.dev.”
4. **Search-filtered map** – “Find every page matching ‘pricing’ on firecrawl.com using the map tool.”
5. **Paginate** – “Continue the previous map results starting at index 200 for another 200 URLs.”

The assistant translates these requests into the structured options below; direct TypeScript payloads are not required.

## Options Reference
(See `apps/mcp/tools/map/schema.ts` for the authoritative schema.)

| Option | Type / Range | Default | Description |
| --- | --- | --- | --- |
| `url` | string (URL) | — | Base URL to discover links from (required). |
| `search` | string | — | Optional keyword/selector Firecrawl uses to focus discovery. |
| `limit` | integer `1-100000` | `5000` | Legacy cap on total crawl depth (map-specific pagination uses `maxResults`). |
| `sitemap` | `skip | include | only` | `include` | Whether to use sitemap entries, mix with crawled URLs, or rely on sitemap exclusively. |
| `includeSubdomains` | boolean | `true` | Discover links on subdomains of the base host. |
| `ignoreQueryParameters` | boolean | `true` | Deduplicate URLs that differ only by query string. |
| `timeout` | integer ms | — | Request timeout passed to Firecrawl. |
| `location.country` | string | — | Location hint (reserved for future localized crawling). |
| `location.languages` | string[] | — | Language hint array (optional). |
| `startIndex` | integer ≥0 | `0` | Pagination offset applied after language-exclusion filtering. |
| `maxResults` | integer `1-5000` | `MAP_MAX_RESULTS_PER_PAGE` env (default 200) | Number of URLs to return in the current page. |
| `resultHandling` | `saveOnly | saveAndReturn | returnOnly` | `saveAndReturn` | Controls whether URLs are returned inline, embedded as MCP resources, or stored as resource links only. |

>The tool automatically filters language-specific paths using `DEFAULT_LANGUAGE_EXCLUDES` from `apps/mcp/config/crawl-config.ts`. Adjust that constant to refine exclusions.

## Responses
Formatting logic lives in `apps/mcp/tools/map/response.ts`:

- Summaries include total URLs (post-filter), excluded count, unique domains, title coverage, and display range (`startIndex+1` to `endIndex`).
- Pagination guidance appears when `hasMore` URLs exist (e.g., “Use startIndex: 400 to continue”).
- The URL payload is serialized to JSON and delivered per `resultHandling`:
  - `saveOnly`: adds a `resource_link` (token-light pointer).
  - `saveAndReturn`: embeds the JSON content as an MCP resource (default).
  - `returnOnly`: appends raw JSON text to the response.

## Usage Tips (NL Prompts)
- “Map the docs site but only return resource links (no embedded payload).” → sets `resultHandling = saveOnly`.
- “Show me URLs 201–400 from the last map run.” → set `startIndex = 200`, `maxResults = 200`.
- “Limit the discovery to 60 seconds.” → include `timeout = 60000`.

## Testing References
| Area | Files |
| --- | --- |
| Schema validation | `apps/mcp/tools/map/schema.test.ts` |
| Pipeline behavior | `apps/mcp/tools/map/pipeline.test.ts` |
| Response formatting & pagination | `apps/mcp/tools/map/response.test.ts` |
| Tool handler wiring | `apps/mcp/tools/map/index.test.ts` |
| Firecrawl client operations | `packages/firecrawl-client/src/operations/map.test.ts` |

Run locally:
```bash
pnpm --filter './apps/mcp' test tools/map
pnpm --filter './packages/firecrawl-client' test
override MAP_MAX_RESULTS_PER_PAGE in `.env` to adjust pagination defaults
```

## Troubleshooting
| Symptom | Likely Cause | Mitigation |
| --- | --- | --- |
| “Language paths excluded” count is high | `DEFAULT_LANGUAGE_EXCLUDES` filtering relevant content | Adjust the regex list in `apps/mcp/config/crawl-config.ts`. |
| Repeated URLs with query strings | `ignoreQueryParameters` disabled | Keep the default `true` or re-run with `ignoreQueryParameters: true`. |
| Results truncated at 200 URLs | `maxResults` falling back to env default | Set `maxResults` (≤5000) or increase `MAP_MAX_RESULTS_PER_PAGE`. |
| Desire token-light mode | Need to avoid embedding long JSON | Use `resultHandling: 'saveOnly'` to receive resource links only. |

## Related Docs
- `docs/mcp-query-tool.md` – shared hybrid search concepts
- `apps/mcp/tools/crawl/response.ts` – similar pagination filtering
- `docs/plans/2025-11-12-crawl-tool-actions.md` – background plan for map/crawl pipelines
