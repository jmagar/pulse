# Scraping Client - Web Content Fetching

Scraping client implementations with fallback strategies.

## Architecture

**Interface-Based**: [scraping-client.ts](scraping-client.ts) defines `ScrapingClient` interface

**Implementations**:

1. **Native** - Node.js fetch ([native-scrape-client.ts](native-scrape-client.ts))
2. **Firecrawl** - Firecrawl API ([firecrawl-scrape-client.ts](firecrawl-scrape-client.ts))

**Library Wrappers** ([lib/](lib/)):

- [firecrawl-scrape.ts](lib/firecrawl-scrape.ts) - Low-level Firecrawl API calls

## Files

- [scraping-client.ts](scraping-client.ts) - `ScrapingClient` interface, `ClientFactory` type
- [native-scrape-client.ts](native-scrape-client.ts) - Native fetch implementation
- [firecrawl-scrape-client.ts](firecrawl-scrape-client.ts) - Firecrawl API client
- [lib/firecrawl-scrape.ts](lib/firecrawl-scrape.ts) - Firecrawl HTTP client

## ScrapingClient Interface

```typescript
interface ScrapingClient {
  scrape(request: ScrapeRequest): Promise<ScrapeResult>;
}
```

**Request**: URL, timeout, format, headers, etc.
**Result**: Content, metadata, success status, error details

## Native Scraper

**Uses**: Node.js `fetch()` API
**Best For**: Simple pages, static content, no JavaScript
**Limitations**: No JavaScript execution, basic HTML only

Features:

- Follow redirects (default: enabled)
- Custom headers support
- Timeout handling
- Basic error detection

## Firecrawl Scraper

**Uses**: Firecrawl API (requires `FIRECRAWL_API_KEY`)
**Best For**: Complex pages, anti-bot protection, JavaScript-heavy sites
**Features**:

- JavaScript rendering
- Anti-bot bypass
- Smart content extraction
- Multiple format support (markdown, HTML, screenshot)

**API Endpoint**: `POST /v1/scrape`

## Strategy Selection

Handled by [../scraping-strategies.ts](../scraping-strategies.ts):

1. Check configured strategy for URL pattern
2. Try configured strategy first
3. Fall back to optimization mode:
   - `OPTIMIZE_FOR=cost`: native → firecrawl
   - `OPTIMIZE_FOR=speed`: firecrawl only
4. Save successful strategy to config

## ClientFactory Pattern

Used for dependency injection:

```typescript
interface ClientFactory {
  createNativeScraper(): ScrapingClient;
  createFirecrawlScraper(): ScrapingClient;
}
```

Allows test mocking:

```typescript
const factory = {
  createNativeScraper: () => mockNativeClient,
  createFirecrawlScraper: () => mockFirecrawlClient,
};
```

## Error Handling

Consistent format: `{ success: false, content: '', error: '...', metadata: {...} }`
Never throw - always return result with `success: false`.

## Testing

Mocks in [../../tests/mocks/scraping-clients.functional-mock.ts](../../tests/mocks/scraping-clients.functional-mock.ts)
