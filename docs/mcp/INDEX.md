# MCP Tools Index

> Updated: 03:35 PM | 11/12/2025

| Tool | Purpose | Key Capabilities | Documentation |
| --- | --- | --- | --- |
| `scrape` | Single-page scraping + Firecrawl batch jobs | Cache-aware single fetches, batch start/status/cancel/errors, resource handling modes | [SCRAPE.md](./SCRAPE.md) |
| `crawl` | Site-wide discovery via Firecrawl crawl API | Start/status/cancel/errors/list commands, prompt-driven parameter tuning, language-path filtering | [CRAWL.md](./CRAWL.md) |
| `map` | Lightweight URL enumeration (sitemap + on-site) | Pagination (`startIndex`/`maxResults`), query-based narrowing, resource link output | [MAP.md](./MAP.md) |
| `search` | Federated web/images/news search | Source/category filters, time filters (`tbs`), optional scraping of landing pages | [SEARCH.md](./SEARCH.md) |
| `query` | Hybrid (vector + BM25) documentation search | Modes (`hybrid`, `semantic`, `keyword`), domain/language/country filters, webhook-authenticated requests | [QUERY.md](./QUERY.md) |
| `resources` | Persistent cache + MCP resource endpoints | Memory/filesystem backends, TTL/eviction, MCP `resources/list` + `resources/read` handlers | [RESOURCES.md](./RESOURCES.md) |

Each linked document covers natural-language prompts, schema options, response formats, testing references, troubleshooting tips, and related implementation files.
