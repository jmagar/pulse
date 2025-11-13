# Search Tool Documentation

> Updated: 03:25 PM | 11/12/2025

## Overview
The MCP **search** tool issues Firecrawl’s federated search requests across web, images, and news endpoints (plus optional category filters like GitHub, research papers, and PDFs). Results can optionally trigger scraping of landing pages with ad blocking and main-content extraction, returning structured JSON resources for downstream processing.

| Attribute | Value |
| --- | --- |
| Tool name | `search` |
| Location | `apps/mcp/tools/search/index.ts` |
| Backend | Firecrawl search API (`@firecrawl/client`) |
| Default limit | 5 results per source |
| Default language | `en` |

## Natural-Language Invocation
- “Use the search tool to find the latest writeups about Firecrawl web scraping.”
- “Search GitHub repositories for ‘firecrawl examples’ and include up to 10 results.”
- “Look up news articles about ‘AI regulation’ published in the past week.”
- “Fetch image results for ‘Firecrawl architecture diagram’ and return the JSON payload.”
- “Run a PDF-focused search for ‘scraping compliance’ but ignore invalid URLs.”

The assistant maps these requests to the structured options described below.

## Options Reference
Schema defined in `apps/mcp/tools/search/schema.ts`.

| Option | Type / Range | Default | Description |
| --- | --- | --- | --- |
| `query` | string | — | Required search phrase (min length 1). |
| `limit` | integer `1-100` | `5` | Maximum results per source or category. |
| `sources` | array of `web | images | news` | — | Restrict which Firecrawl sources to query; defaults to `web` when omitted. |
| `categories` | array of `github | research | pdf` | — | Filter results to specific catalog types. |
| `country` | string | — | Country code for localized search results (e.g., `us`, `gb`). |
| `lang` | string | `en` | Language code for the query. |
| `location` | string | — | Geo location hint for localized searches. |
| `timeout` | integer ms | — | Request timeout passed to Firecrawl. |
| `ignoreInvalidURLs` | boolean | `false` | Skip results whose URLs fail validation. |
| `tbs` | string | — | Time-based search filter (`qdr:h`, `qdr:d`, `cdr:a,cd_min:MM/DD/YYYY,cd_max:MM/DD/YYYY`, etc.). |
| `scrapeOptions.formats` | string[] | — | Additional content formats to capture when scraping result pages. |
| `scrapeOptions.onlyMainContent` | boolean | — | Extract just the main article/body. |
| `scrapeOptions.removeBase64Images` | boolean | `true` | Strip base64 blobs to reduce tokens. |
| `scrapeOptions.blockAds` | boolean | `true` | Enable ad/cookie blocking during scraping. |
| `scrapeOptions.waitFor` | integer ms | — | Delay before scraping dynamic pages. |
| `scrapeOptions.parsers` | string[] | — | Optional custom parsers. |

## Response Format
`apps/mcp/tools/search/response.ts` adapts to two Firecrawl payload styles:

1. **Multi-source object** (e.g., `{ web: [...], images: [...], news: [...] }`)
   - Summary text lists counts per source and credits consumed.
   - Each populated source is attached as a JSON MCP resource (e.g., `pulse://search/web/...`).
2. **Flat array** (legacy style)
   - Summary text shows total matches and credits.
   - A single JSON resource contains the entire result set.

All responses set `isError: false` on success. Transport errors or schema violations bubble up as `isError: true` in the handler.

## Usage Patterns (Natural Language)
- Time-filtered search: “Search the news for ‘Firecrawl release’ limited to the past 7 days.” → sets `tbs = 'qdr:w'`.
- Category search: “Search research papers for multimodal scraping frameworks.” → uses `categories = ['research']`.
- PDF + scraping: “Find PDF documentation for Firecrawl and scrape markdown output.” → `categories = ['pdf']`, `scrapeOptions.formats` includes `markdown`.
- Geo-localized search: “Look up ‘web scraping compliance’ in German news sources.” → sets `lang = 'de'`, optional `country = 'de'`.

## Testing References
| Area | Files |
| --- | --- |
| Schema validation | `apps/mcp/tools/search/schema.test.ts` |
| Pipeline behavior | `apps/mcp/tools/search/pipeline.test.ts` |
| Response formatting | `apps/mcp/tools/search/response.test.ts` |
| Tool handler | `apps/mcp/tools/search/index.test.ts` |
| Firecrawl client | `packages/firecrawl-client/src/operations/search.test.ts` |

Run locally:
```bash
pnpm --filter './apps/mcp' test tools/search
pnpm --filter './packages/firecrawl-client' test
```

## Troubleshooting
| Symptom | Likely Cause | Fix |
| --- | --- | --- |
| `Query is required` error | Empty or missing `query` | Provide a non-empty search phrase. |
| Unexpected language results | `lang` defaulted to `en` | Specify `lang`/`country` explicitly. |
| Too few results | `limit` still set to default `5` | Increase `limit` (≤100) or broaden `sources`. |
| Time filter ignored | Invalid `tbs` syntax | Use supported values (`qdr:d`, `cdr:a,cd_min:...,cd_max:...`). |
| Large payload token usage | Embedded resources heavy | Post-process resource JSON or reduce `limit`. |

## Related Docs
- `docs/mcp/QUERY.md` – hybrid vector/BM25 tool (post-index search)
- `docs/mcp/CRAWL.md` – site discovery and pagination
- `docs/mcp-query-tool.md` – architecture patterns shared across tools
