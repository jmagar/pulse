# MCP Resource Storage

> Updated: 03:40 PM | 11/12/2025

## Overview
MCP resources are the persisted outputs of the **scrape** tool. Every scrape request can cache up to three variants of the same URL—`raw` HTML, `cleaned` markdown, and optional `extracted` content—inside a configurable storage backend. These cached artifacts serve two purposes:

1. **Instant reuse:** Subsequent scrapes run `checkCache()` before touching the network, returning the freshest valid variant instantly when cache conditions allow.
2. **Client access:** The MCP server exposes cached resources via the standard `resources/list` and `resources/read` request handlers, so any MCP client can browse, inspect, or cite prior scrapes without re-fetching pages.

Only the scrape pipeline writes to the persistent resource store; other tools (query, search, map, crawl) return embedded data directly in their responses.

```
┌───────────────┐      ┌────────────────┐      ┌──────────────────┐      ┌────────────────────┐
│  MCP Client   │ ───▶ │ scrape handler │ ───▶ │ Resource storage │ ───▶ │ List/Read resources │
│ (Claude/CLI)  │      │ (pipeline.ts)  │      │  (memory/fs)     │      │  + cache hit logic  │
└───────────────┘      └────────────────┘      └──────────────────┘      └────────────────────┘
```

## Storage Backends
`ResourceStorageFactory` loads exactly one backend per process (singleton). Choose the backend with `MCP_RESOURCE_STORAGE` (`memory` by default).

| Backend | URI scheme | Pros | Notes |
| --- | --- | --- | --- |
| Memory (`MCP_RESOURCE_STORAGE=memory`) | `memory://raw/...` | Fast, zero I/O, good for local dev/tests | Bounded by TTL + max items/size (LRU eviction). Data gone on restart. |
| Filesystem (`MCP_RESOURCE_STORAGE=filesystem`) | `file:///path/to/...` | Persistent across restarts, inspectable on disk | Set `MCP_RESOURCE_FILESYSTEM_ROOT` (otherwise defaults to `$TMPDIR/pulse/resources`). Content stored as Markdown with YAML front matter. |

Switching backends requires restarting the MCP server (factory caches the instance). Tests call `ResourceStorageFactory.reset()`; production code does not.

## Configuration
| Variable | Default | Purpose |
| --- | --- | --- |
| `MCP_RESOURCE_STORAGE` | `memory` | Backend selector (`memory` or `filesystem`). |
| `MCP_RESOURCE_FILESYSTEM_ROOT` | `$TMPDIR/pulse/resources` | Root directory when using filesystem storage (creates `raw/`, `cleaned/`, `extracted/`). |
| `MCP_RESOURCE_TTL` | `86400` seconds (24h) | Default TTL for cached entries. `0` disables expiration. Applied to both backends. |
| `MCP_RESOURCE_MAX_SIZE` | `100` MB | Total bytes allowed before LRU eviction kicks in. |
| `MCP_RESOURCE_MAX_ITEMS` | `1000` | Maximum number of cached entries. |
| `MCP_RESOURCE_CLEANUP_INTERVAL` | `60000` ms | How frequently background cleanup prunes expired entries (when `startCleanup()` is used; mainly in tests). |

All options can also be passed programmatically through `ResourceCacheOptions` when constructing storage (tests do this), but production relies on env vars.

## Resource Types & Metadata
`writeMulti()` stores up to three variants per scrape:

| Variant | `resourceType` | Typical content | URI example |
| --- | --- | --- | --- |
| Raw | `raw` | Original HTML/text from the scrape | `memory://raw/docs.firecrawl.dev_20251112...` |
| Cleaned | `cleaned` | Cleaner markdown (if `cleanScrape=true`) | `memory://cleaned/...` |
| Extracted | `extracted` | Prompt-based extraction via the extraction service | `memory://extracted/...` |

Each resource carries `ResourceMetadata`:

| Field | Description |
| --- | --- |
| `url` | Source URL scraped. |
| `timestamp` | ISO timestamp when cached. |
| `resourceType` | `raw`, `cleaned`, or `extracted`. |
| `contentType` | MIME hint (`text/plain`, `text/markdown`, etc.). |
| `description` | Human-readable summary (defaults to “Fetched content from …”). |
| `ttl` | Effective TTL (ms). `0` = never expires. |
| `extractionPrompt` | Prompt used for `extracted` resources. |
| `source` | Scraping strategy identifier (native/firecrawl/etc.). |
| `startIndex`, `maxChars`, `wasTruncated` | Pagination metadata for partial responses. |
| Additional fields | `contentLength`, headers, diagnostics as needed. |

Filesystem entries serialize metadata as YAML front matter inside Markdown files; memory entries keep metadata in memory alongside the content.

## Cache Behavior
1. **Lookup:** `checkCache()` searches by URL (and optional extract prompt). It skips cache usage when `forceRescrape=true` or when the caller selected `resultHandling='saveOnly'` (since no inline content is returned).
2. **Priority:** Cleaned content is preferred over extracted, which is preferred over raw. First match wins.
3. **Eviction:** Both backends enforce TTL + LRU/size limits. Memory uses in-memory maps; filesystem deletes the oldest files when thresholds are exceeded.
4. **Write policy:** Content is saved only when `resultHandling` is `saveOnly` or `saveAndReturn`. `returnOnly` responses still run the full scrape but skip persistence.

## Accessing Resources via MCP
The MCP server registers the built-in resource handlers in `registerResources()`:

- `resources/list` → returns `uri`, `name`, `mimeType`, `description` for every cached entry.
- `resources/read` → takes `{ uri }` and returns the full text (single `contents` entry). Binary blobs are not currently supported; everything is stored as UTF-8 text/markdown.

These endpoints allow clients to audit cached scrapes, cite earlier results, or download artifacts after long-running operations. Resource URIs from scrape responses (e.g., `memory://cleaned/...`) map 1:1 to the URIs returned by `resources/list`.

## Filesystem Layout
When `filesystem` storage is active:

```
<MCP_RESOURCE_FILESYSTEM_ROOT>/
├── raw/
├── cleaned/
├── extracted/
└── (optional) index.json (built automatically)
```

Each file contains:

```
---
url: "https://docs.firecrawl.dev/..."
timestamp: "2025-11-12T15:21:00.123Z"
resourceType: "cleaned"
contentType: "text/markdown"
...
---
<scraped content>
```

This makes local debugging straightforward (open the markdown files in any editor). The URI exposed to MCP clients is `file:///.../cleaned/<filename>.md`.

## Relationship to Tools
| Tool | Uses persistent resources? | Notes |
| --- | --- | --- |
| `scrape` | ✅ | Writes raw/cleaned/extracted variants via `saveToStorage()`. Cache hits short-circuit scrapes. |
| `crawl` | ❌ | Returns discovery summaries + optional resource links but does not write to the global cache. |
| `map` | ❌ | Returns JSON resources in the response only. |
| `search` | ❌ | Embeds results as JSON resources (per request). |
| `query` | ❌ | Embeds markdown resources built from the webhook payload but does not persist them. |

## Troubleshooting
| Symptom | Likely Cause | Resolution |
| --- | --- | --- |
| `Resource not found: memory://…` when calling `resources/read` | TTL expired or entry evicted | Re-run the scrape or increase TTL / cache limits. |
| Resources disappear after restart | Using memory backend | Switch to filesystem storage for persistence. |
| Filesystem cache grows without bound | Limits too high / cleanup disabled | Adjust `MCP_RESOURCE_MAX_SIZE` / `MCP_RESOURCE_MAX_ITEMS`, or call `startCleanup()` in custom deployments. |
| Cache never hit even when URL was scraped | `forceRescrape` or `saveOnly` mode enabled | Allow cache usage (disable `forceRescrape`, use `saveAndReturn`) or verify URL/extract prompt matches exactly. |
| `MCP_RESOURCE_STORAGE=filesystem` but `file://` URIs still point to tmpdir | Forgot to set `MCP_RESOURCE_FILESYSTEM_ROOT` | Define the path in `.env` and restart MCP. |

## Related Files
- `apps/mcp/tools/scrape/pipeline.ts` – cache lookup (`checkCache`) and persistence (`saveToStorage`).
- `apps/mcp/storage/memory.ts` / `filesystem.ts` – backend implementations.
- `apps/mcp/storage/types.ts` – Resource interface and metadata schema.
- `apps/mcp/tools/registration.ts` – registers `resources/list` and `resources/read` handlers.
- Tests: `apps/mcp/tests/storage/*.test.ts`, `apps/mcp/tools/scrape/handler.test.ts`.
