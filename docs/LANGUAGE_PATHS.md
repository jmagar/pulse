# Documentation Site Language Paths

This document contains language path information for various documentation sites, useful for configuring `excludePaths` when crawling.

## Summary

| Site | Total Links | Languages Found |
|------|-------------|-----------------|
| docs.firecrawl.dev | 637 | es, fr, ja, pt-BR, zh |
| docs.claude.com | 2,525 | de, en, es, fr, id, it, ja, ko, pt, ru, zh-CN, zh-TW |
| docs.unraid.net | 635 | de, es, fr, zh |
| gofastmcp.com | 175 | None (English only) |

## Exclude Patterns by Site

### docs.firecrawl.dev

**Languages**: Spanish, French, Japanese, Brazilian Portuguese, Chinese

```json
"excludePaths": ["^/es/", "^/fr/", "^/ja/", "^/pt-BR/", "^/zh/"]
```

### docs.claude.com

**Languages**: German, English, Spanish, French, Indonesian, Italian, Japanese, Korean, Portuguese, Russian, Simplified Chinese, Traditional Chinese

```json
"excludePaths": ["^/de/", "^/es/", "^/fr/", "^/id/", "^/it/", "^/ja/", "^/ko/", "^/pt/", "^/ru/", "^/zh-CN/", "^/zh-TW/"]
```

**Note**: If you want English only, exclude all except `^/en/` OR exclude all the language paths above.

### docs.unraid.net

**Languages**: German, Spanish, French, Chinese

```json
"excludePaths": ["^/de/", "^/es/", "^/fr/", "^/zh/"]
```

### gofastmcp.com

**No language paths detected** - Site appears to be English only.

## Universal Exclude Pattern

To exclude most common language variants across sites:

```json
"excludePaths": [
  "^/de/",     // German
  "^/es/",     // Spanish
  "^/fr/",     // French
  "^/it/",     // Italian
  "^/pt/",     // Portuguese
  "^/pt-BR/",  // Brazilian Portuguese
  "^/ja/",     // Japanese
  "^/ko/",     // Korean
  "^/zh/",     // Chinese
  "^/zh-CN/",  // Simplified Chinese
  "^/zh-TW/",  // Traditional Chinese
  "^/ru/",     // Russian
  "^/id/"      // Indonesian
]
```

## Example Crawl Configuration

### Crawl docs.firecrawl.dev (English only)

```bash
curl -X POST 'https://firecrawl.tootie.tv/v2/crawl' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer test-key' \
  -d '{
    "url": "https://docs.firecrawl.dev",
    "excludePaths": ["^/es/", "^/fr/", "^/ja/", "^/pt-BR/", "^/zh/"],
    "scrapeOptions": {
      "formats": ["markdown", "html"]
    }
  }'
```

### Crawl docs.claude.com (English only)

```bash
curl -X POST 'https://firecrawl.tootie.tv/v2/crawl' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer test-key' \
  -d '{
    "url": "https://docs.claude.com",
    "excludePaths": ["^/de/", "^/es/", "^/fr/", "^/id/", "^/it/", "^/ja/", "^/ko/", "^/pt/", "^/ru/", "^/zh-CN/", "^/zh-TW/"],
    "scrapeOptions": {
      "formats": ["markdown", "html"]
    }
  }'
```

### Crawl docs.unraid.net (English only)

```bash
curl -X POST 'https://firecrawl.tootie.tv/v2/crawl' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer test-key' \
  -d '{
    "url": "https://docs.unraid.net",
    "excludePaths": ["^/de/", "^/es/", "^/fr/", "^/zh/"],
    "scrapeOptions": {
      "formats": ["markdown", "html"]
    }
  }'
```

## Notes

- All language paths use regex patterns
- The `^` anchor ensures matching from the start of the path
- The trailing `/` ensures we match the directory
- Map endpoint results generated: 2025-11-05
- Firecrawl instance: https://firecrawl.tootie.tv
