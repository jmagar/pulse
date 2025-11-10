# @firecrawl/client

Shared TypeScript client for the Firecrawl API, used across the Pulse monorepo.

## Overview

This package provides a unified, type-safe client for interacting with the Firecrawl API. It includes support for all Firecrawl operations: scraping, searching, mapping, and crawling.

## Features

- **Unified Client**: Single `FirecrawlClient` class for all operations
- **Specialized Clients**: Dedicated clients for scraping, search, map, and crawl
- **Type Safety**: Full TypeScript support with Zod runtime validation
- **Zero Dependencies**: Only depends on Zod for validation
- **Tree-Shakeable**: ESM exports for optimal bundle size

## Installation

This package is intended for internal use within the Pulse monorepo. It's automatically available via pnpm workspaces:

```json
{
  "dependencies": {
    "@firecrawl/client": "workspace:*"
  }
}
```

## Usage

### Unified Client (Recommended)

```typescript
import { FirecrawlClient } from '@firecrawl/client';

const client = new FirecrawlClient({
  apiKey: process.env.FIRECRAWL_API_KEY,
  baseUrl: 'https://api.firecrawl.dev', // optional
});

// Scrape a single page
const scrapeResult = await client.scrape('https://example.com', {
  formats: ['markdown', 'html'],
  onlyMainContent: true,
});

// Search for content
const searchResult = await client.search({
  query: 'artificial intelligence',
  limit: 10,
});

// Map website structure
const mapResult = await client.map({
  url: 'https://example.com',
  search: 'documentation',
});

// Start a crawl
const crawlResult = await client.startCrawl({
  url: 'https://example.com',
  limit: 100,
  scrapeOptions: {
    formats: ['markdown'],
  },
});

// Check crawl status
const status = await client.getCrawlStatus(crawlResult.id);

// Cancel crawl
await client.cancelCrawl(crawlResult.id);
```

### Specialized Clients

For operations requiring advanced configuration, use specialized clients:

```typescript
import {
  FirecrawlScrapingClient,
  FirecrawlSearchClient,
  FirecrawlMapClient,
  FirecrawlCrawlClient,
} from '@firecrawl/client';

const config = {
  apiKey: process.env.FIRECRAWL_API_KEY,
  baseUrl: 'https://api.firecrawl.dev',
};

const scrapingClient = new FirecrawlScrapingClient(config);
const result = await scrapingClient.scrape('https://example.com');
```

## API Reference

### FirecrawlClient

Main client class providing all Firecrawl operations.

#### Methods

##### `scrape(url: string, options?: FirecrawlScrapingOptions): Promise<FirecrawlScrapingResult>`

Scrape a single webpage.

**Options:**
- `formats`: Output formats (`markdown`, `html`, `rawHtml`, `links`, `screenshot`)
- `onlyMainContent`: Extract only main content (default: `true`)
- `includeTags`: HTML tags to include
- `excludeTags`: HTML tags to exclude
- `headers`: Custom HTTP headers
- `waitFor`: Milliseconds to wait before scraping
- `timeout`: Request timeout in milliseconds

##### `search(options: SearchOptions): Promise<SearchResult>`

Search for content using Firecrawl.

**Options:**
- `query`: Search query (required)
- `limit`: Maximum results (default: `10`)
- `lang`: Language code (default: `en`)
- `country`: Country code
- `tbs`: Time-based search filter
- `scrapeOptions`: Options for scraping search results

##### `map(options: MapOptions): Promise<MapResult>`

Map website structure to discover URLs.

**Options:**
- `url`: Base URL to map (required)
- `search`: Optional search query to filter URLs
- `ignoreSitemap`: Skip sitemap discovery
- `includeSubdomains`: Include subdomain URLs
- `limit`: Maximum URLs to return

##### `startCrawl(options: CrawlOptions): Promise<StartCrawlResult>`

Start a multi-page crawl job.

**Options:**
- `url`: Starting URL (required)
- `limit`: Maximum pages to crawl
- `includePaths`: URL patterns to include
- `excludePaths`: URL patterns to exclude
- `maxDepth`: Maximum crawl depth
- `allowBackwardLinks`: Allow links to already-visited pages
- `allowExternalLinks`: Follow external links
- `scrapeOptions`: Options for scraping each page

##### `getCrawlStatus(jobId: string): Promise<CrawlStatusResult>`

Get status and results of a crawl job.

##### `cancelCrawl(jobId: string): Promise<CancelResult>`

Cancel a running crawl job.

## Type Exports

All types are exported for use in consuming applications:

```typescript
import type {
  FirecrawlConfig,
  FirecrawlScrapingOptions,
  FirecrawlScrapingResult,
  SearchOptions,
  SearchResult,
  MapOptions,
  MapResult,
  CrawlOptions,
  StartCrawlResult,
  CrawlStatusResult,
  CancelResult,
} from '@firecrawl/client';
```

## Error Handling

All operations throw errors with descriptive messages:

```typescript
import { FirecrawlClient } from '@firecrawl/client';

try {
  const client = new FirecrawlClient({
    apiKey: process.env.FIRECRAWL_API_KEY,
  });

  const result = await client.scrape('https://example.com');
} catch (error) {
  if (error instanceof Error) {
    console.error('Scraping failed:', error.message);
  }
}
```

## Development

### Building

```bash
# From repository root
pnpm build:packages

# Or from this package
pnpm build
```

### Type Checking

TypeScript configuration is in `tsconfig.json`:
- Target: ES2022
- Module: ESNext
- Strict mode enabled
- Declaration files generated

## Dependencies

- **zod**: Runtime type validation (^3.24.2)

## License

Part of the Pulse monorepo. See repository root for license information.
