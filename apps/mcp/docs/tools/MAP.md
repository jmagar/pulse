# Map Tool

The `map` tool rapidly discovers URLs from a website, providing fast sitemap generation and link discovery.

## Features

- **High performance**: 8x faster than crawling for URL discovery
- **Search filtering**: Find URLs containing specific keywords
- **Sitemap integration**: Use, skip, or exclusively use sitemaps
- **Subdomain handling**: Include or exclude subdomains
- **Large scale**: Support for up to 100,000 URLs per request
- **Pagination support**: Return results in manageable pages (1-5000 URLs per page)
- **Localization**: Country and language-specific discovery for geo-targeted content
- **Flexible result handling**: Save-only, save-and-return, or return-only modes

## Usage

### Basic URL Discovery

```json
{
  "url": "https://example.com",
  "limit": 100
}
```

### Filtered Discovery

```json
{
  "url": "https://example.com",
  "search": "documentation",
  "limit": 50
}
```

### Sitemap-Only Discovery

```json
{
  "url": "https://example.com",
  "sitemap": "only",
  "limit": 1000
}
```

## Parameters

| Parameter               | Type    | Required | Default         | Description                                                      |
| ----------------------- | ------- | -------- | --------------- | ---------------------------------------------------------------- |
| `url`                   | string  | Yes      | -               | Website URL to map                                               |
| `search`                | string  | No       | -               | Filter URLs containing this keyword                              |
| `limit`                 | number  | No       | 5000            | Maximum URLs to discover (1-100,000)                             |
| `sitemap`               | string  | No       | "include"       | Sitemap handling: `skip`, `include`, `only`                      |
| `includeSubdomains`     | boolean | No       | true            | Include subdomain URLs                                           |
| `ignoreQueryParameters` | boolean | No       | true            | Ignore URL query parameters                                      |
| `timeout`               | number  | No       | -               | Request timeout in milliseconds                                  |
| `location`              | object  | No       | See below       | Geographic location settings (country and languages)             |
| `startIndex`            | number  | No       | 0               | Starting position for pagination (0-based)                       |
| `maxResults`            | number  | No       | 200             | Maximum URLs to return per response (1-5000, for pagination)     |
| `resultHandling`        | string  | No       | "saveAndReturn" | How to return results: `saveOnly`, `saveAndReturn`, `returnOnly` |

### Location Options

Configure geographic location for content localization and proxy selection.

| Option      | Type     | Default   | Description                                                              |
| ----------- | -------- | --------- | ------------------------------------------------------------------------ |
| `country`   | string   | "US"      | ISO 3166-1 alpha-2 country code (e.g., "US", "JP", "DE", "GB")           |
| `languages` | string[] | ["en-US"] | Preferred languages in Accept-Language format (e.g., ["en-US", "es-ES"]) |

**Environment Variable Overrides:**

- `MAP_DEFAULT_COUNTRY` - Override default country code
- `MAP_DEFAULT_LANGUAGES` - Override default languages (comma-separated)
- `MAP_MAX_RESULTS_PER_PAGE` - Override default maxResults value (must be 1-5000)

**Default Location Behavior:**

The `location` parameter always defaults to:

```json
{
  "country": "US", // or MAP_DEFAULT_COUNTRY env var
  "languages": ["en-US"] // or MAP_DEFAULT_LANGUAGES env var
}
```

Location is **always sent to the API**, even when not explicitly specified by the user.

**Environment Variable Validation:**

`MAP_MAX_RESULTS_PER_PAGE` must be between 1-5000. Invalid values trigger a console warning and default to 200:

```bash
# Valid
MAP_MAX_RESULTS_PER_PAGE=500

# Invalid - will use 200 with console warning
MAP_MAX_RESULTS_PER_PAGE=10000
```

## Response Format

Returns an array of discovered URLs with optional metadata:

```json
{
  "success": true,
  "links": [
    {
      "url": "https://example.com/page1",
      "title": "Page 1 Title",
      "description": "Page description"
    },
    {
      "url": "https://example.com/page2",
      "title": "Page 2 Title"
    }
  ]
}
```

## Performance

Typical performance: **~1.4 seconds to discover 1,200+ links**

The map tool is optimized for speed and does not extract page content. It only discovers URLs.

### Token Estimation

Token estimates use a **4:1 character-to-token ratio**:

- 200 URLs ≈ 13,000 tokens
- 1000 URLs ≈ 65,000 tokens

Formula: `estimatedTokens = ceil(characterCount / 4)`

This estimation helps plan pagination and context window usage.

### Resource URI Format

Saved resources use this URI format:

```
pulse://map/{hostname}/{timestamp}/page-{pageNumber}
```

Where `pageNumber = floor(startIndex / maxResults)`

Example: `pulse://map/example.com/1699564800000/page-2`

## Use Cases

Use `map` when you need to:

- **Quick website structure overview**: Understand site organization without crawling
- **URL discovery before selective scraping**: Find URLs, then use `scrape` on specific pages
- **Sitemap generation**: Create comprehensive site maps
- **Link validation**: Check for broken or outdated links
- **Content inventory**: Catalog all pages on a site

## Examples

### Discover Documentation Pages

```json
{
  "url": "https://docs.example.com",
  "search": "api",
  "limit": 200
}
```

### Full Site Map with Subdomains

```json
{
  "url": "https://example.com",
  "includeSubdomains": true,
  "limit": 10000
}
```

### Fast Sitemap-Only Scan

```json
{
  "url": "https://example.com",
  "sitemap": "only",
  "ignoreQueryParameters": true,
  "limit": 5000
}
```

### Exclude Query Parameters

```json
{
  "url": "https://shop.example.com",
  "ignoreQueryParameters": true,
  "limit": 500
}
```

### Localized Search (Country-Specific)

```json
{
  "url": "https://example.com",
  "location": {
    "country": "JP"
  },
  "limit": 1000
}
```

### Multi-Language Discovery

```json
{
  "url": "https://docs.example.com",
  "location": {
    "country": "DE",
    "languages": ["de-DE", "en-US"]
  },
  "limit": 500
}
```

### Paginated Results (First Page)

```json
{
  "url": "https://example.com",
  "startIndex": 0,
  "maxResults": 200,
  "limit": 10000
}
```

### Paginated Results (Second Page)

```json
{
  "url": "https://example.com",
  "startIndex": 200,
  "maxResults": 200,
  "limit": 10000
}
```

### Save Only Mode (Token-Efficient)

```json
{
  "url": "https://example.com",
  "resultHandling": "saveOnly",
  "limit": 5000
}
```

## Tips

- Use `map` before `crawl` to estimate the number of pages
- Apply `search` filter to find specific content areas before scraping
- Set `sitemap: "only"` for the fastest discovery on sites with sitemaps
- Use `ignoreQueryParameters: true` to avoid duplicate URLs
- Start with smaller limits and increase as needed
- Combine with `scrape` tool for targeted content extraction

### Country and Language Settings

- **Use `country` for geo-targeted content**: Some sites show different pages based on visitor location
- **Combine country and languages**: For best results, match country code with appropriate language codes
- **Examples**:
  - Japan: `country: "JP"`, `languages: ["ja-JP"]`
  - Germany: `country: "DE"`, `languages: ["de-DE", "en-US"]`
  - UK: `country: "GB"`, `languages: ["en-GB"]`
- **Environment variables**: Set `MAP_DEFAULT_COUNTRY` and `MAP_DEFAULT_LANGUAGES` to avoid repeating these in every request

### Pagination Best Practices

- **Token efficiency**: ~13k tokens per 200 URLs, ~65k tokens per 1000 URLs
- **Recommended page size**: 200 URLs (`maxResults: 200`) balances context window usage with API calls
- **Large sites**: Use pagination instead of one massive request
  - Page 1: `startIndex: 0, maxResults: 200`
  - Page 2: `startIndex: 200, maxResults: 200`
  - Page 3: `startIndex: 400, maxResults: 200`
- **Set appropriate `limit`**: The `limit` parameter controls total discovery, `maxResults` controls response size
  - To discover 10,000 URLs but return 200 at a time: `limit: 10000, maxResults: 200`
- **Override defaults**: Set `MAP_MAX_RESULTS_PER_PAGE` environment variable to change the default page size

### Result Handling Modes

- **`saveAndReturn` (default)**: Returns full URL data AND saves as MCP resource (embedded in response)
- **`saveOnly`**: Only returns summary, saves full data as linked resource (most token-efficient)
- **`returnOnly`**: Returns data without saving to MCP resources (use when you don't need caching)
- **Best for large result sets**: Use `saveOnly` to minimize token usage in responses

## Comparison: Map vs Crawl

| Feature      | Map                              | Crawl                     |
| ------------ | -------------------------------- | ------------------------- |
| Speed        | Fast (8x faster)                 | Slower (extracts content) |
| Content      | URLs only                        | Full-page content         |
| Use case     | URL discovery                    | Content extraction        |
| Max pages    | 100,000                          | 100,000                   |
| Credits      | Lower cost                       | Higher cost               |
| Pagination   | Built-in (startIndex/maxResults) | Not available             |
| Localization | Country and language settings    | Not available             |

Use `map` when you only need URLs. Use `crawl` when you need the actual content from each page.

### When to Use Pagination

**Use pagination when**:

- Discovering large sites (>200 URLs)
- Working with limited context windows
- Need to process URLs in batches
- Want to minimize token usage per request

**How pagination works**:

- `limit`: Total URLs to discover from the site (e.g., 10,000)
- `maxResults`: URLs to return in this response (e.g., 200)
- `startIndex`: Skip first N URLs (e.g., 200 for page 2)

**Example workflow**:

1. First request: `startIndex: 0, maxResults: 200, limit: 10000` → Returns URLs 0-199
2. Second request: `startIndex: 200, maxResults: 200, limit: 10000` → Returns URLs 200-399
3. Continue until no more results

**Token savings**: Returning 200 URLs at a time (~13k tokens) vs. 1000 URLs at once (~65k tokens) allows processing large sites without hitting context limits.
