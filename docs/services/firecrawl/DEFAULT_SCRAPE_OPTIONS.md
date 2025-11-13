# Firecrawl Default Scrape Options

_Last Updated: 02:17 AM EST | Nov 13 2025_

This document captures the canonical defaults injected by the MCP crawl/scrape tooling (and any consumer that imports `mergeScrapeOptions` from `apps/mcp/config/crawl-config.ts`). Use it as a quick reference before overriding `scrapeOptions` in Firecrawl requests. For general service details (ports, env vars, lifecycle) see the [Firecrawl service guide](../FIRECRAWL.md).

## Default Payload
```json
{
  "formats": ["markdown", "html", "summary", "changeTracking", "links"],
  "onlyMainContent": true,
  "blockAds": true,
  "removeBase64Images": true,
  "parsers": []
}
```

## Field Breakdown
| Field | Default | Why It Matters |
|-------|---------|----------------|
| `formats` | `["markdown", "html", "summary", "changeTracking", "links"]` | Guarantees every scrape returns cleaned markdown for the NotebookLM UI, raw HTML for debugging, summary text for quick glances, change-tracking metadata for diffs, and outbound links for graph building. |
| `onlyMainContent` | `true` | Strips nav, sidebars, and footers so our UI works with concise content blocks. Set to `false` if you need the full page chrome. |
| `blockAds` | `true` | Keeps ad/cookie popups from polluting downstream embeddings or LM prompts. |
| `removeBase64Images` | `true` | Prevents base64 blobs from inflating responses (fewer tokens, faster). |
| `parsers` | `[]` | Disables PDF parsing unless explicitly requested (Firecrawl charges extra credits for PDF pages). Add entries like `{ "type": "pdf", "maxPages": 5 }` when needed. |

## Merge Behavior
- The MCP config merges user-provided values on top of these defaults. Unspecified fields inherit the defaults shown above.
- `parsers` always resolves to an array (never `undefined`) to keep Firecrawl’s batch API happy.
- The same helper feeds single-page scrapes, crawls, and batch scrape jobs, ensuring consistent output regardless of tool.
- The `search` tool has its own schema defaults (`blockAds=true`, `removeBase64Images=true`) but does **not** add formats/main-content filtering unless you pass them explicitly.

## When to Override
- **Smaller payloads**: Drop `summary`, `links`, or `changeTracking` if you only need markdown.
- **Full-page captures**: Set `onlyMainContent=false` to keep nav/footers (e.g., for visual QA).
- **PDF ingestion**: Add `parsers: [{ "type": "pdf", "maxPages": 10 }]` when crawling documentation bundles.
- **Media-heavy scrapes**: Set `removeBase64Images=false` if inline images are required for downstream consumers.

Keep this file in sync whenever `DEFAULT_SCRAPE_OPTIONS` changes in code.
