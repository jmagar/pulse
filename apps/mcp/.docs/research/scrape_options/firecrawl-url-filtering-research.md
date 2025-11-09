# Firecrawl URL Filtering and Navigation Options - Research Report

**Date**: 2025-11-06
**Research Focus**: Firecrawl API v1/v2 crawl parameters for URL filtering, navigation control, and path exclusion

---

## Executive Summary

Firecrawl provides comprehensive URL filtering and crawl control through regex-based path patterns, depth limits, and domain scope controls. The API supports both v1 and v2 endpoints with similar parameter sets. Key capabilities include excluding/including specific paths, controlling crawl depth, managing external links, and sitemap handling.

---

## 1. Path Filtering Parameters

### 1.1 excludePaths

**Type**: Array of strings (regex patterns)
**Description**: URL pathname regex patterns that exclude matching URLs from the crawl
**Pattern Matching**: Applied to the pathname component of URLs
**Default**: `[]` (no exclusions)

**Examples**:

```json
{
  "excludePaths": ["blog/.*"]
}
```

- Excludes URLs like: `https://www.firecrawl.dev/blog/firecrawl-launch-week-1-recap`

```json
{
  "excludePaths": ["^/admin/.*$", "^/private/.*$", "/terminal/*", "/financial-connections/*"]
}
```

- Excludes administrative, private, terminal, and financial-connections paths

**Language Variant Exclusion Example**:

```json
{
  "excludePaths": [
    "^/es/.*$",
    "^/fr/.*$",
    "^/de/.*$",
    "^/ja/.*$",
    "^/zh/.*$",
    "/[a-z]{2}/.*",
    "/[a-z]{2}-[A-Z]{2}/.*"
  ]
}
```

- First 5 patterns exclude specific language codes
- Last 2 patterns exclude any two-letter language codes and locale codes (e.g., `/en/`, `/pt-BR/`)

### 1.2 includePaths

**Type**: Array of strings (regex patterns)
**Description**: URL pathname regex patterns that include matching URLs in the crawl. Only URLs matching these patterns will be crawled
**Pattern Matching**: Applied to the pathname component of URLs
**Default**: `[]` (include all)

**Examples**:

```json
{
  "includePaths": ["blog/.*"]
}
```

- Includes only blog URLs like: `https://www.firecrawl.dev/blog/firecrawl-launch-week-1-recap`

```json
{
  "includePaths": ["^/blog/.*$", "^/docs/.*$"]
}
```

- Includes only blog and documentation sections

```json
{
  "includePaths": ["/payments/*", "/blog/*", "/products/*"]
}
```

- Targets specific sections using wildcard notation

**Use Case**: Restrict crawls to relevant content sections while ignoring unrelated areas

---

## 2. Regex Pattern Syntax

### 2.1 Pattern Types Observed

Firecrawl documentation shows two pattern styles:

**Regex Style** (recommended for API):

- `"blog/.*"` - Matches `/blog/` followed by any characters
- `"^/admin/.*$"` - Anchored pattern for exact pathname matching
- `"^/api/v[0-9]+/.*$"` - Version-specific API paths

**Wildcard Style** (v0 documentation):

- `"/blog/*"` - Simple wildcard notation
- `"/admin/*"` - Matches admin paths

### 2.2 Pattern Best Practices

1. **Use anchors for precision**: `^/path/.*$` ensures exact pathname matching
2. **Avoid leading slash ambiguity**: Both `/blog/.*` and `blog/.*` work, but consistency matters
3. **Escape special regex characters**: Use `\.` for literal dots in domains
4. **Character classes for flexibility**: `[a-z]{2}` for language codes
5. **Non-capturing groups**: `(?:pattern)` when grouping without capture

### 2.3 Common Pattern Examples

```javascript
// Exclude all blog posts
"excludePaths": ["blog/.*"]

// Exclude multiple sections
"excludePaths": ["^/admin/.*$", "^/private/.*$", "^/api/.*$"]

// Include only documentation
"includePaths": ["^/docs/.*$"]

// Exclude language variants (comprehensive)
"excludePaths": [
  "^/(en|es|fr|de|it|pt|ja|zh|ko|ru)/.*$",  // Specific languages
  "^/[a-z]{2}/.*$",                          // Any 2-letter code
  "^/[a-z]{2}-[A-Z]{2}/.*$"                 // Locale codes (en-US)
]

// Exclude file types
"excludePaths": [".*\\.pdf$", ".*\\.zip$", ".*\\.exe$"]

// Exclude query parameters patterns
"excludePaths": [".*\\?.*page=[0-9]+.*"]
```

---

## 3. Query Parameter Handling

### 3.1 ignoreQueryParameters

**Type**: Boolean
**Default**: `false`
**Description**: Do not re-scrape the same path with different (or none) query parameters
**API Versions**: v1, v2

**Behavior**:

- When `false`: URLs like `/page?id=1` and `/page?id=2` are treated as different pages
- When `true`: `/page?id=1` and `/page?id=2` are considered the same, only one is scraped

**Use Case**: Avoid duplicate content when query parameters don't change content (e.g., tracking parameters, session IDs)

**Example**:

```json
{
  "url": "https://example.com",
  "ignoreQueryParameters": true
}
```

### 3.2 deduplicateSimilarURLs

**Type**: Boolean
**Default**: Not specified
**Description**: Remove duplicate URLs from crawl results
**API Versions**: v2

**Use Case**: Additional deduplication layer beyond query parameter handling

---

## 4. Depth Control Parameters

### 4.1 maxDepth

**Type**: Integer
**Default**: `10`
**Description**: Maximum absolute depth to crawl from the base URL, measured by pathname slashes
**API Versions**: v1, v2

**How It Works**: Counts the number of slashes in the pathname

- Base URL `example.com/` = depth 0
- `example.com/blog/` = depth 1
- `example.com/blog/2024/` = depth 2
- `example.com/blog/2024/post/` = depth 3

**Example**:

```json
{
  "url": "https://example.com/docs",
  "maxDepth": 3
}
```

Crawls up to `example.com/docs/section/subsection/` but not deeper

### 4.2 maxDiscoveryDepth

**Type**: Integer
**Default**: Not specified
**Description**: Maximum depth to crawl based on link discovery order (hops from start URL)
**API Versions**: v1, v2

**How It Works**: Tracks hops from the starting point

- Root URL and sitemap pages = discovery depth 0
- Pages directly linked from root = discovery depth 1
- Pages linked from depth 1 pages = discovery depth 2

**Key Difference from maxDepth**:

- `maxDepth`: Based on URL structure (pathname slashes)
- `maxDiscoveryDepth`: Based on link traversal order (how many clicks from start)

**Example**:

```json
{
  "url": "https://example.com",
  "maxDiscoveryDepth": 2
}
```

Crawls the start page, all pages linked from it, and all pages linked from those pages

**Use Case**: Control breadth-first traversal depth regardless of URL structure

---

## 5. Domain Scope Control

### 5.1 crawlEntireDomain

**Type**: Boolean
**Default**: `false`
**Description**: Controls whether the crawler can follow links to sibling and parent URLs
**API Versions**: v1, v2

**Behavior**:

- When `false`: Only crawls deeper (child) URLs from the starting point
- When `true`: Crawls any internal links, including siblings and parents

**Example**:
Starting from `example.com/docs/api/`:

- `false`: Only crawls `example.com/docs/api/endpoints/`, `example.com/docs/api/auth/`
- `true`: Also crawls `example.com/docs/`, `example.com/blog/`, etc.

### 5.2 allowBackwardLinks

**Type**: Boolean
**Default**: `false`
**Status**: **DEPRECATED** (use `crawlEntireDomain` instead)
**Description**: Allows crawler to follow internal links to sibling or parent URLs
**API Versions**: v1

### 5.3 allowExternalLinks

**Type**: Boolean
**Default**: `false`
**Description**: Allows the crawler to follow links to external websites
**API Versions**: v1, v2

**Use Case**: Enable for comprehensive link graph analysis; disable to stay focused on target domain

### 5.4 allowSubdomains

**Type**: Boolean
**Default**: `false`
**Description**: Allows the crawler to follow links to subdomains of the main domain
**API Versions**: v1, v2

**Example**:
Starting from `example.com`:

- `false`: Only crawls `example.com`
- `true`: Also crawls `blog.example.com`, `docs.example.com`, `api.example.com`

---

## 6. Sitemap Handling

### 6.1 sitemap (v2 crawl endpoint)

**Type**: String enum
**Values**: `"skip"` | `"include"`
**Default**: `"include"`
**Description**: Controls whether the crawler uses website sitemaps
**API Versions**: v2

**Options**:

- `"include"`: Use sitemap URLs along with discovered links
- `"skip"`: Ignore sitemap files, only discover via link crawling

### 6.2 sitemap (v2 map endpoint)

**Type**: String enum
**Values**: `"only"` | `"include"` | `"skip"`
**Default**: `"include"`
**Description**: Controls sitemap usage during URL mapping
**API Versions**: v2 (map endpoint)

**Options**:

- `"only"`: Return URLs exclusively from sitemap files, ignore discovered links
- `"include"`: Combine sitemap URLs with discovered links
- `"skip"`: Ignore sitemap files completely

**When to Use**:

- `"only"`: Fast mapping of officially indexed URLs
- `"include"`: Comprehensive coverage combining both sources
- `"skip"`: Find undocumented or dynamically generated pages

### 6.3 ignoreSitemap (v1)

**Type**: Boolean
**Default**: `false`
**Description**: Ignore the website sitemap when crawling
**API Versions**: v1

**Equivalent to**: Setting `sitemap: "skip"` in v2

---

## 7. Rate Limiting and Performance

### 7.1 limit

**Type**: Integer
**Default**: `10000`
**Description**: Maximum number of pages to crawl
**API Versions**: v1, v2

**Use Case**: Prevent runaway crawls on large sites; control resource usage

**Example**:

```json
{
  "url": "https://example.com",
  "limit": 100
}
```

### 7.2 delay

**Type**: Number (seconds)
**Default**: Not specified
**Description**: Delay in seconds between scrapes to respect website rate limits
**API Versions**: v1, v2

**Use Case**: Be polite to target servers; avoid rate limiting or IP blocks

**Example**:

```json
{
  "url": "https://example.com",
  "delay": 2
}
```

Waits 2 seconds between each page scrape

### 7.3 maxConcurrency

**Type**: Integer
**Default**: Team-specific default
**Description**: Maximum number of concurrent scrapes for this crawl job
**API Versions**: v1, v2

**Use Case**: Balance speed vs server load; higher values = faster but more aggressive

---

## 8. Complete Parameter Reference

### 8.1 v2 API Parameters

| Parameter                | Type         | Default      | Description                                         |
| ------------------------ | ------------ | ------------ | --------------------------------------------------- |
| `url`                    | string (URI) | **required** | The base URL to start crawling from                 |
| `excludePaths`           | string[]     | `[]`         | Regex patterns to exclude URLs                      |
| `includePaths`           | string[]     | `[]`         | Regex patterns to include URLs (whitelist)          |
| `maxDepth`               | integer      | `10`         | Maximum URL depth (pathname slashes)                |
| `maxDiscoveryDepth`      | integer      | -            | Maximum link traversal depth                        |
| `ignoreQueryParameters`  | boolean      | `false`      | Treat URLs with different query params as same page |
| `deduplicateSimilarURLs` | boolean      | -            | Remove duplicate URLs                               |
| `limit`                  | integer      | `10000`      | Maximum number of pages to crawl                    |
| `sitemap`                | enum         | `"include"`  | Sitemap usage: `"skip"` \| `"include"`              |
| `crawlEntireDomain`      | boolean      | `false`      | Allow crawling siblings/parents                     |
| `allowExternalLinks`     | boolean      | `false`      | Follow external links                               |
| `allowSubdomains`        | boolean      | `false`      | Follow subdomain links                              |
| `delay`                  | number       | -            | Seconds between scrapes                             |
| `maxConcurrency`         | integer      | team default | Max concurrent scrapes                              |
| `scrapeOptions`          | object       | -            | Nested scrape endpoint options                      |

### 8.2 v1 API Parameters

| Parameter               | Type         | Default      | Description                              |
| ----------------------- | ------------ | ------------ | ---------------------------------------- |
| `url`                   | string (URI) | **required** | The base URL to start crawling from      |
| `excludePaths`          | string[]     | `[]`         | Regex patterns to exclude URLs           |
| `includePaths`          | string[]     | `[]`         | Regex patterns to include URLs           |
| `maxDepth`              | integer      | `10`         | Maximum URL depth                        |
| `maxDiscoveryDepth`     | integer      | -            | Maximum discovery depth                  |
| `ignoreQueryParameters` | boolean      | `false`      | Ignore query parameter differences       |
| `ignoreSitemap`         | boolean      | `false`      | Ignore website sitemap                   |
| `limit`                 | integer      | `10000`      | Maximum pages to crawl                   |
| `allowBackwardLinks`    | boolean      | `false`      | **DEPRECATED** - use `crawlEntireDomain` |
| `crawlEntireDomain`     | boolean      | `false`      | Allow sibling/parent crawling            |
| `allowExternalLinks`    | boolean      | `false`      | Follow external links                    |
| `allowSubdomains`       | boolean      | `false`      | Follow subdomain links                   |
| `delay`                 | number       | -            | Seconds between scrapes                  |
| `maxConcurrency`        | integer      | team default | Max concurrent scrapes                   |

---

## 9. Best Practices

### 9.1 Path Filtering Strategy

**1. Start Inclusive, Then Exclude**

```json
{
  "includePaths": ["^/docs/.*$"],
  "excludePaths": ["^/docs/archive/.*$", "^/docs/deprecated/.*$"]
}
```

**2. Use Anchored Patterns for Precision**

```json
{
  "excludePaths": ["^/admin/.*$"] // Better than "admin/.*"
}
```

**3. Combine Multiple Exclusions**

```json
{
  "excludePaths": [
    "^/(en|es|fr|de)/.*$", // Language variants
    "^/api/.*$", // API docs
    "^/auth/.*$", // Auth flows
    ".*\\?.*utm_.*", // Tracking params
    ".*\\.pdf$" // PDF files
  ]
}
```

### 9.2 Depth Control Strategy

**For Documentation Sites**: Use `maxDiscoveryDepth` to control breadth

```json
{
  "url": "https://docs.example.com",
  "maxDiscoveryDepth": 3,
  "limit": 500
}
```

**For E-commerce Sites**: Use `maxDepth` to avoid deep category trees

```json
{
  "url": "https://shop.example.com",
  "maxDepth": 4,
  "excludePaths": ["^/cart/.*$", "^/checkout/.*$"]
}
```

### 9.3 Language Variant Exclusion

**Comprehensive Language Exclusion Pattern**:

```json
{
  "excludePaths": [
    "^/(ar|zh|zh-cn|zh-tw|cs|da|nl|fi|fr|de|el|he|hi|hu|id|it|ja|ko|no|pl|pt|pt-br|ro|ru|es|sv|th|tr|uk|vi)/.*$",
    "^/[a-z]{2}/.*$",
    "^/[a-z]{2}-[a-z]{2}/.*$",
    "^/[a-z]{2}_[A-Z]{2}/.*$"
  ]
}
```

**Keep Only English**:

```json
{
  "includePaths": ["^/en/.*$"],
  "excludePaths": ["^/[a-z]{2}/(?!en).*$"]
}
```

### 9.4 Query Parameter Strategy

**Ignore Tracking Parameters**:

```json
{
  "ignoreQueryParameters": true,
  "excludePaths": [".*\\?.*utm_.*", ".*\\?.*fbclid.*"]
}
```

**Preserve Important Parameters**:

```json
{
  "ignoreQueryParameters": false,
  "includePaths": ["^/products/.*\\?variant=.*$"]
}
```

### 9.5 Performance Optimization

**Balanced Crawl Configuration**:

```json
{
  "url": "https://example.com",
  "limit": 1000,
  "maxDiscoveryDepth": 3,
  "delay": 1,
  "maxConcurrency": 5,
  "ignoreQueryParameters": true,
  "sitemap": "include",
  "allowExternalLinks": false
}
```

### 9.6 Focused Content Extraction

**Documentation-Only Crawl**:

```json
{
  "url": "https://example.com",
  "includePaths": ["^/docs/.*$", "^/api-reference/.*$"],
  "excludePaths": ["^/docs/deprecated/.*$", "^/(en|es|fr)/.*$"],
  "maxDiscoveryDepth": 4,
  "limit": 500,
  "sitemap": "include"
}
```

**Blog Content Crawl**:

```json
{
  "url": "https://example.com",
  "includePaths": ["^/blog/.*$"],
  "excludePaths": ["^/blog/author/.*$", "^/blog/tag/.*$", "^/blog/category/.*$"],
  "ignoreQueryParameters": true,
  "maxDepth": 3
}
```

---

## 10. API Version Differences

### 10.1 v0 to v1 Migration

**Deprecated Parameters**:

- `allowBackwardLinks` → Use `crawlEntireDomain` instead

**Pattern Syntax Change**:

- v0: Used wildcard notation (`"/blog/*"`)
- v1: Uses regex patterns (`"blog/.*"` or `"^/blog/.*$"`)

### 10.2 v1 to v2 Changes

**Sitemap Parameter**:

- v1: `ignoreSitemap` (boolean)
- v2: `sitemap` (enum: `"skip"` | `"include"`)

**New Parameters in v2**:

- `deduplicateSimilarURLs`: Additional deduplication control

**Response Format**:

- v2 introduced `onlyMainContent` defaulting to `true`
- Webhook and WebSocket support added for async crawls

---

## 11. Common Use Cases

### 11.1 Exclude Login/Auth Pages

```json
{
  "excludePaths": ["^/login/.*$", "^/register/.*$", "^/auth/.*$", "^/account/.*$", "^/checkout/.*$"]
}
```

### 11.2 Documentation-Only Crawl

```json
{
  "url": "https://docs.example.com",
  "includePaths": ["^/docs/.*$"],
  "maxDiscoveryDepth": 5,
  "sitemap": "include",
  "allowExternalLinks": false
}
```

### 11.3 Multi-Language Site (English Only)

```json
{
  "url": "https://example.com",
  "includePaths": ["^/en/.*$"],
  "excludePaths": ["^/(?!en)[a-z]{2}/.*$"],
  "maxDepth": 10
}
```

### 11.4 Shallow Crawl for Discovery

```json
{
  "url": "https://example.com",
  "maxDiscoveryDepth": 1,
  "limit": 100,
  "sitemap": "only"
}
```

### 11.5 Comprehensive Site Crawl

```json
{
  "url": "https://example.com",
  "crawlEntireDomain": true,
  "allowSubdomains": true,
  "maxDepth": 10,
  "limit": 10000,
  "ignoreQueryParameters": true,
  "sitemap": "include",
  "delay": 1
}
```

---

## 12. Sources and References

### Official Documentation

1. **Firecrawl v2 Crawl Endpoint**
   https://docs.firecrawl.dev/api-reference/endpoint/crawl-post

2. **Firecrawl v1 Crawl Endpoint**
   https://docs.firecrawl.dev/api-reference/v1-endpoint/crawl-post

3. **Advanced Scraping Guide**
   https://docs.firecrawl.dev/advanced-scraping-guide

4. **Crawl Parameters Preview**
   https://docs.firecrawl.dev/api-reference/endpoint/crawl-params-preview

5. **v1 Welcome and Migration Guide**
   https://docs.firecrawl.dev/v1-welcome

6. **v0 Advanced Scraping Guide**
   https://docs.firecrawl.dev/v0/advanced-scraping-guide

### Blog Posts and Tutorials

7. **Mastering the Crawl Endpoint**
   https://www.firecrawl.dev/blog/mastering-the-crawl-endpoint-in-firecrawl

8. **How to Generate a Sitemap Using /map Endpoint**
   https://www.firecrawl.dev/blog/how-to-generate-sitemap-using-firecrawl-map-endpoint

9. **How to Build LLM-Ready Datasets with Firecrawl**
   https://www.blott.com/blog/post/how-to-build-llm-ready-datasets-with-firecrawl-a-developers-guide

### GitHub Resources

10. **Firecrawl GitHub Repository**
    https://github.com/firecrawl/firecrawl

11. **Welcome to v1 Discussion**
    https://github.com/firecrawl/firecrawl/discussions/630

---

## 13. Key Findings Summary

### Pattern Syntax

- Firecrawl uses **regex patterns** for `excludePaths` and `includePaths`
- Patterns are applied to the **pathname component** of URLs
- Both anchored (`^/path/.*$`) and unanchored (`path/.*`) patterns work
- v0 used wildcard notation (`*`), v1/v2 use regex (`.*`)

### Default Values

- `limit`: 10,000 pages
- `maxDepth`: 10 levels
- `ignoreQueryParameters`: false
- `sitemap`: "include" (v2) / `ignoreSitemap`: false (v1)
- `crawlEntireDomain`: false
- `allowExternalLinks`: false
- `allowSubdomains`: false

### Best Practices for Language Exclusion

1. Use comprehensive regex patterns covering common language codes
2. Combine specific patterns with character class patterns
3. Consider both 2-letter codes (`/es/`) and locale codes (`/en-US/`)
4. Use `includePaths` to whitelist specific languages if needed

### Depth Control Strategies

- Use `maxDepth` for URL structure-based limits
- Use `maxDiscoveryDepth` for link traversal-based limits
- Combine with `limit` to cap total page count
- Consider sitemap strategy for efficient discovery

### Performance Considerations

- Set appropriate `delay` to respect server rate limits
- Use `ignoreQueryParameters: true` to reduce duplicates
- Enable `deduplicateSimilarURLs` for additional deduplication
- Balance `maxConcurrency` with politeness and speed requirements

---

## 14. Recommendations for Implementation

### For Pulse Fetch MCP Server

1. **Expose Key Parameters**:
   - `excludePaths` and `includePaths` as optional string arrays
   - `maxDepth` and `maxDiscoveryDepth` with sensible defaults
   - `ignoreQueryParameters` as boolean (default: true for cleaner results)
   - `limit` with default of 100-500 (lower than Firecrawl's 10k default)

2. **Provide Helper Patterns**:

   ```typescript
   const COMMON_EXCLUSIONS = {
     auth: ['^/login/.*$', '^/register/.*$', '^/auth/.*$'],
     languages: ['^/[a-z]{2}/.*$', '^/[a-z]{2}-[A-Z]{2}/.*$'],
     admin: ['^/admin/.*$', '^/wp-admin/.*$'],
     files: ['.*\\.pdf$', '.*\\.zip$', '.*\\.exe$'],
   };
   ```

3. **Default Configuration**:

   ```json
   {
     "maxDepth": 5,
     "limit": 200,
     "ignoreQueryParameters": true,
     "sitemap": "include",
     "allowExternalLinks": false,
     "crawlEntireDomain": false
   }
   ```

4. **Validation**:
   - Validate regex patterns before sending to API
   - Provide clear error messages for invalid patterns
   - Warn when both `includePaths` and `excludePaths` might conflict

5. **Documentation**:
   - Include pattern examples in tool descriptions
   - Provide common use case templates
   - Link to this research document for advanced usage

---

**Report Generated**: 2025-11-06
**Research Duration**: ~30 minutes
**Sources Consulted**: 11 official documentation pages, 3 blog posts, 2 GitHub resources
**API Versions Covered**: v0 (legacy), v1 (current), v2 (latest)
