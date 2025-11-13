# Scraping Clients - Web Content Fetching

Unified scraping client implementations with automatic strategy selection and fallback patterns.

## Architecture

**Directory Structure**:
- `native/` - Native HTTP scraping (Node.js fetch)
- `index.ts` - Client exports

**Actual Implementations**:
1. **NativeScrapingClient** - Node.js fetch ([native/native-scrape-client.ts](native/native-scrape-client.ts))
2. **FirecrawlScrapingClient** - Firecrawl API (`@firecrawl/client` package)

## Interfaces

**INativeScrapingClient**: Synchronous HTTP scraping
```typescript
scrape(url: string, options?: NativeScrapingOptions): Promise<NativeScrapingResult>
```

**FirecrawlScrapingClient**: JavaScript rendering + anti-bot
```typescript
scrape(url: string, options?: FirecrawlScrapingOptions): Promise<FirecrawlScrapingResult>
```

## Native Scraper

**Uses**: Node.js `fetch()` API  
**Best For**: Static HTML, simple content, low-cost operations  
**Limitations**: No JavaScript execution, cannot bypass anti-bot

**Features**:
- Timeout handling via AbortController
- Custom headers (defaults: User-Agent, Accept, Cache-Control)
- Content-Type detection with ContentParserFactory
- Binary/text routing for PDF, HTML, etc.
- Never throws—always returns result object

**Content Parsing**:
- Routes HTML/text through HTML parser
- Routes PDF through PDF parser
- Returns parsed content + metadata

## Firecrawl Scraper

**Uses**: Firecrawl API (v2, requires `FIRECRAWL_API_KEY`)  
**Best For**: JavaScript-heavy sites, anti-bot protection, dynamic content  
**Client**: `@firecrawl/client` (unified package for scrape, search, map, crawl)

**Scrape Features**:
- Formats: markdown, html, rawHtml, links, images, screenshot, summary
- Browser actions: click, type, scroll, wait, execute JavaScript
- Anti-bot: proxy modes (basic/stealth/auto)
- Content extraction: schema-based extraction via LLM
- Error handling: Authentication errors flagged separately

**Batch Operations**:
- `startBatchScrape()` / `getBatchScrapeStatus()` / `cancelBatchScrape()`
- Webhook support for job notifications

## Strategy Selection

Handled by `../strategies/selector.ts`:

**scrapeUniversal()** - Automatic fallback based on `OPTIMIZE_FOR`:
- `cost` (default): native → firecrawl fallback
- `speed`: firecrawl only (skip native)
- Metrics: timing, success/failure per strategy

**scrapeWithStrategy()** - Learned patterns (filesystem-based):
1. Check config for URL pattern → try configured strategy
2. Fall back to universal if configured fails
3. Auto-save successful strategy for future URLs

**scrapeWithSingleStrategy()** - Direct strategy execution:
- Attempts single specified strategy without fallback
- Used for testing or when strategy is predetermined

**URL Pattern Extraction**: `yelp.com/biz/` matches `yelp.com/biz/*`

## Error Handling

**Consistent Contract**:
```typescript
{ success: false, content?: string, error?: string, metadata?: {} }
```

**Special Cases**:
- Native: timeout → "Request timeout", HTTP error → "HTTP 404: Not Found", result includes `statusCode` field
- Firecrawl: auth errors (lowercase check for "unauthorized", "invalid token", "authentication") flagged with `isAuthError: true`
- All errors logged to metrics collector
- Fallback tracking: `metrics.recordFallback(fromStrategy, toStrategy)` when strategies fail

**No Exception Throwing**: Functions never throw; errors returned in result object.

## Client Exports

From `index.ts`:
- `NativeScrapingClient` + types (`INativeScrapingClient`, `NativeScrapingOptions`, `NativeScrapingResult`)
- `FirecrawlScrapingClient` + types (`FirecrawlScrapingOptions`, `FirecrawlScrapingResult`)

From `native/index.ts`:
- All native client exports

## Integration Points

**Scraping Pipeline** (`../tools/scrape/`):
- Uses strategy selector to choose client
- Passes IScrapingClients interface to handlers

**Monitoring**:
- Metrics: recordStrategyExecution, recordStrategyError, recordFallback
- Diagnostics: strategiesAttempted, strategyErrors, timing

## Testing

Mocks available at `../../tests/mocks/scraping-clients.functional-mock.ts`
