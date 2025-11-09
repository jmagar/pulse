# Firecrawl MAP Endpoint API Analysis

## Date: 2025-11-07

### Executive Summary

This document provides a comprehensive analysis of Firecrawl's MAP endpoint API parameters, comparing what the API offers against what Pulse Fetch currently implements. The goal is to identify missing parameters, advanced options, and configuration improvements.

---

## Firecrawl MAP Endpoint Documentation

### Official API Parameters

Based on [Firecrawl API Reference - MAP Endpoint](https://docs.firecrawl.dev/api-reference/endpoint/map):

#### Required Parameters

| Parameter | Type         | Default  | Description                         |
| --------- | ------------ | -------- | ----------------------------------- |
| `url`     | string (URI) | Required | The base URL to start crawling from |

#### Optional Parameters - Core Functionality

| Parameter               | Type    | Default   | Description                                                                                                                                                 |
| ----------------------- | ------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `search`                | string  | None      | Search query to filter/order results by relevance. Returns URLs matching the search term ordered by relevance (e.g., 'blog' returns URLs containing 'blog') |
| `limit`                 | integer | 5000      | Maximum number of links to return. Range: 1-100000                                                                                                          |
| `sitemap`               | enum    | 'include' | Sitemap handling mode: `skip` (ignore), `include` (use + other methods), `only` (sitemap URLs only)                                                         |
| `includeSubdomains`     | boolean | true      | Include subdomains of the website                                                                                                                           |
| `ignoreQueryParameters` | boolean | true      | Do not return URLs with query parameters                                                                                                                    |
| `timeout`               | integer | None      | Timeout in milliseconds. No timeout by default                                                                                                              |

#### Optional Parameters - Geolocation & Language

| Parameter            | Type                        | Default              | Description                                        |
| -------------------- | --------------------------- | -------------------- | -------------------------------------------------- |
| `location`           | object                      | `{ country: 'US' }`  | Location settings for proxy and language emulation |
| `location.country`   | string (ISO 3166-1 alpha-2) | 'US'                 | Country code (e.g., 'US', 'AU', 'DE', 'JP')        |
| `location.languages` | array of strings            | Language of location | Preferred languages/locales in order of priority   |

#### Response Structure

The API returns:

```json
{
  "success": boolean,
  "links": [
    {
      "url": string,
      "title": string (optional),
      "description": string (optional)
    }
  ]
}
```

**Note**: Title and description are not guaranteed to be present on all URLs.

---

## Current Pulse Fetch Implementation

### Schema Definition

**File**: `/shared/mcp/tools/map/schema.ts`

```typescript
export const mapOptionsSchema = z.object({
  url: z.string().url('Valid URL is required'),
  search: z.string().optional(),
  limit: z.number().int().min(1).max(100000).optional().default(5000),
  sitemap: z.enum(['skip', 'include', 'only']).optional().default('include'),
  includeSubdomains: z.boolean().optional().default(true),
  ignoreQueryParameters: z.boolean().optional().default(true),
  timeout: z.number().int().positive().optional(),
  location: z
    .object({
      country: z.string().optional().default('US'),
      languages: z.array(z.string()).optional(),
    })
    .optional()
    .default({ country: 'US' }),

  // Pagination parameters (custom)
  startIndex: z.number().int().min(0, 'startIndex must be non-negative').optional().default(0),
  maxResults: z
    .number()
    .int()
    .min(1, 'maxResults must be at least 1')
    .max(5000, 'maxResults cannot exceed 5000')
    .optional()
    .default(200),

  // Result handling mode (custom)
  resultHandling: z
    .enum(['saveOnly', 'saveAndReturn', 'returnOnly'])
    .optional()
    .default('saveAndReturn'),
});
```

### Current Tool Implementation

**File**: `/shared/mcp/tools/map/index.ts`

- Basic error handling with formatted error messages
- Input schema validation using Zod
- Simple handler with try-catch

### Client Implementation

**File**: `/shared/clients/firecrawl-map.client.ts`

```typescript
export interface MapOptions {
  url: string;
  search?: string;
  limit?: number;
  sitemap?: 'skip' | 'include' | 'only';
  includeSubdomains?: boolean;
  ignoreQueryParameters?: boolean;
  timeout?: number;
  location?: {
    country?: string;
    languages?: string[];
  };
}
```

**Note**: Does not pass custom pagination/result handling parameters to the API.

### Response Formatting

**File**: `/shared/mcp/tools/map/response.ts`

Current features:

- Pagination support with `startIndex` and `maxResults`
- Statistics: total URLs, unique domains, title coverage percentage
- Result handling modes: `saveOnly`, `saveAndReturn`, `returnOnly`
- Automatic resource URI generation with hostname and page number
- Indication of more results available

---

## Comparison: API vs Implementation

### What We're Implementing Correctly ✓

All core Firecrawl parameters are properly supported:

- ✓ `url` - Required parameter
- ✓ `search` - Search filtering
- ✓ `limit` - Result limit (1-100000)
- ✓ `sitemap` - Sitemap handling ('skip', 'include', 'only')
- ✓ `includeSubdomains` - Subdomain inclusion control
- ✓ `ignoreQueryParameters` - Query parameter filtering
- ✓ `timeout` - Request timeout
- ✓ `location` - Geolocation with country and languages

### Missing or Not Utilized ✗

1. **No advanced error diagnostics** - The Firecrawl API returns specific HTTP status codes (429 rate limit, 402 payment required, etc.) but we don't differentiate them
2. **No API response metadata** - The actual Firecrawl response may contain additional metadata we're not exposing
3. **No request/response logging** - No diagnostics about the actual API call
4. **No retry strategy** - No built-in retry for transient failures (rate limits, timeouts)
5. **No parameter descriptions in schema** - Unlike the scrape tool, map doesn't have detailed parameter documentation in the schema

### Custom Extensions (Not in Firecrawl API) ✓

1. **Pagination** - `startIndex` and `maxResults` - Client-side pagination of Firecrawl results
2. **Result handling modes** - `saveOnly`, `saveAndReturn`, `returnOnly` - Control over how results are returned
3. **Statistics** - Summary with domain count, title coverage, pagination info
4. **Resource formatting** - MCP resource formatting with unique URIs

---

## Recommended Improvements

### Priority 1: Parameter Documentation (High Impact, Low Effort)

Add comprehensive parameter descriptions following the scrape tool pattern.

**Why**: The scrape tool has excellent documentation that helps users understand each parameter. The map tool should have similar clarity.

**Current State**: Schema has no descriptions
**Target**: Add `describe()` calls to each Zod field with user-friendly explanations

**Example from scrape tool**:

```typescript
url: z.string().describe('The webpage URL to scrape (e.g., "https://example.com/article"...)'),
timeout: z.string().describe('Maximum time to wait for page load in milliseconds...'),
```

### Priority 2: Enhanced Error Handling (Medium Impact, Medium Effort)

Differentiate between error types and provide actionable feedback.

**Why**: Users need to understand whether they hit rate limits, auth failures, payment issues, or server errors.

**Implementation**:

- Parse HTTP status codes: 429 (rate limit), 402 (payment required), 401 (auth), 400 (validation)
- Return diagnostics with error details and retry guidance
- Include original error message from Firecrawl API

**Example return format**:

```typescript
{
  isError: true,
  content: [{
    type: 'text',
    text: `Map error: Rate limit exceeded (429). Retry after 60 seconds.\n\nOriginal message: ${errorDetail}`
  }],
  diagnostics: {
    statusCode: 429,
    errorType: 'RATE_LIMIT',
    retryable: true,
    suggestedRetryAfter: 60
  }
}
```

### Priority 3: API Response Metadata Exposure (Low Impact, Low Effort)

Expose any additional metadata returned by Firecrawl.

**Why**: Some API responses may include timing, URL counts, or processing information useful for debugging and optimization.

**Implementation**:

- Store raw Firecrawl response before processing
- Include metadata in resource data or separate content block
- Document what metadata is available

**Example**:

```typescript
{
  success: true,
  links: [...],
  metadata?: {
    processingTime?: number,
    robotsChecked?: boolean,
    sitemapFound?: boolean
  }
}
```

### Priority 4: Retry Strategy (Medium Impact, High Effort)

Implement automatic retries with exponential backoff.

**Why**: Network issues and temporary rate limits are common. Silent retries improve reliability without user intervention.

**Implementation**:

- Add `maxRetries` parameter (default: 3)
- Implement exponential backoff: 1s, 2s, 4s
- Catch 429 (rate limit) and 5xx errors
- Don't retry on 4xx client errors
- Log retry attempts

**Example parameters to add**:

```typescript
maxRetries: z.number().int().min(0).max(10).optional().default(3).describe(
  'Maximum number of retries on transient failures (rate limits, timeouts, server errors). Default: 3'
),
retryDelayMs: z.number().int().min(100).optional().default(1000).describe(
  'Base delay in milliseconds for exponential backoff retries. Default: 1000'
),
```

### Priority 5: Request/Response Diagnostics (Low Impact, Medium Effort)

Include request/response timing and diagnostics.

**Why**: Helps users understand performance characteristics and troubleshoot slow requests.

**Implementation**:

- Track request start/end times
- Include DNS lookup, connection, and request times if available
- Count actual API calls (especially useful if retry happens)
- Include in summary text and resource metadata

**Example**:

```
Map Results for https://example.com
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total URLs discovered: 156
Unique domains: 12
URLs with titles: 87%
Showing: 1-50 of 156

Performance:
Request time: 2.34s
API calls: 1 (retries: 0)
Cache hit: false
```

---

## API Insights from Documentation

### Location/Language Support

The MAP endpoint supports comprehensive location emulation:

- Uses appropriate proxies based on country
- Emulates timezone and language settings
- Defaults to 'US' if not specified
- Supports any ISO 3166-1 alpha-2 country code

**Current Implementation**: Fully supported but not documented for users

**Recommendation**: Add description explaining location benefits:

```
"Specify country and preferred languages to get location-specific content.
When specified, Firecrawl will use appropriate proxies and emulate the
corresponding timezone and language settings. Example: { country: 'JP',
languages: ['ja', 'en'] }"
```

### Sitemap Handling v2

The new v2 API provides three explicit modes:

- `skip` - Completely ignore sitemap
- `include` - Use sitemap + discover other pages (default, most comprehensive)
- `only` - Return only sitemap URLs (fastest)

**Use case guidance**:

- Use `only` for very large sites where you only need sitemap URLs
- Use `skip` if sitemap is outdated/incomplete
- Use `include` (default) for most comprehensive results

**Recommendation**: Add these use case descriptions to parameter documentation

### Performance Considerations

From documentation:

> "This endpoint prioritizes speed, so it may not capture all website links. We are working on improvements."

**Implication**: The endpoint is optimized for speed over completeness. Users expecting 100% coverage may be disappointed.

**Recommendation**:

- Add a warning to the tool description
- Consider adding `exhaustive` parameter (if API adds it in future) to trade speed for completeness

---

## Schema Validation Analysis

### Current Validation Strengths

- ✓ URL format validation
- ✓ Limit bounds validation (1-100000)
- ✓ Enum validation for sitemap modes
- ✓ Boolean type safety
- ✓ Positive timeout validation

### Current Validation Gaps

- No URL domain validation (could catch obvious typos)
- No regex patterns for search parameter
- No language code format validation (ISO 639-1)
- No country code format validation (ISO 3166-1 alpha-2)

### Recommended Additions

```typescript
country: z.string()
  .regex(/^[A-Z]{2}$/, 'Country must be ISO 3166-1 alpha-2 code (e.g., US, JP, DE)')
  .optional()
  .default('US'),

languages: z.array(
  z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/, 'Language must be ISO 639-1 code, optionally with region')
).optional(),

search: z.string()
  .max(100, 'Search query should be concise (max 100 characters)')
  .optional(),
```

---

## Comparison with Similar Tools

### Scrape Tool (for reference)

The scrape tool in Pulse Fetch implements:

- Detailed parameter descriptions with examples
- Conditional feature availability (LLM extraction)
- Advanced features: URL preprocessing, content cleaning, extraction
- Comprehensive error handling
- Request/response diagnostics

**Recommendation**: Apply similar patterns to map tool for consistency

### Crawl Tool (future)

When crawl tool is implemented, it will likely need:

- Max depth parameter
- Include/exclude paths
- Similar location/language support
- Performance trade-offs documentation

---

## Environment Variables

### Current Usage in Map Tool

None currently exposed for map-specific configuration.

### Potential Future Additions

```bash
MAP_DEFAULT_COUNTRY=US              # Default country for location
MAP_DEFAULT_LANGUAGES=en            # Default languages
MAP_MAX_RESULTS_PER_PAGE=200        # Default pagination limit
MAP_DEFAULT_LIMIT=5000              # Default API limit
MAP_TIMEOUT_MS=30000                # Default timeout
MAP_MAX_RETRIES=3                   # Default retry count
MAP_RETRY_DELAY_MS=1000             # Base retry delay
```

**Note**: Some env vars are already referenced in commit history but implementation may be incomplete:

- `MAP_DEFAULT_COUNTRY`
- `MAP_DEFAULT_LANGUAGES`
- `MAP_MAX_RESULTS_PER_PAGE`

---

## Implementation Roadmap

### Phase 1: Documentation & Validation (Quick Win)

1. Add parameter descriptions to schema
2. Add format validation for country/language codes
3. Update tool description with performance notes
4. Add parameter documentation to tool handler

**Effort**: 1-2 hours
**Value**: High (better UX, catches user errors early)

### Phase 2: Enhanced Error Handling

1. Parse HTTP status codes in client
2. Return structured error responses
3. Provide retry guidance for transient errors
4. Add error diagnostics to response

**Effort**: 2-3 hours
**Value**: High (better debugging, user confidence)

### Phase 3: Retry Strategy (Optional)

1. Add maxRetries and retryDelayMs parameters
2. Implement exponential backoff in client
3. Add retry diagnostics
4. Test with rate limit simulation

**Effort**: 3-4 hours
**Value**: Medium (improves reliability, may not be needed if users retry)

### Phase 4: Advanced Features (Polish)

1. Expose Firecrawl API metadata
2. Add request/response timing
3. Add cache hit indication
4. Performance metrics in summary

**Effort**: 2-3 hours
**Value**: Low (nice-to-have, good for debugging)

---

## Test Coverage Recommendations

### Current Test Coverage

- Basic tool creation and structure
- Handler execution with mock data
- Basic response formatting

### Recommended Additions

- Pagination edge cases (startIndex > total, etc.)
- Error handling for different HTTP status codes
- Parameter validation (invalid country codes, etc.)
- Response metadata parsing
- Retry strategy (if implemented)
- Resource formatting for different result modes

### Test Files to Update

- `/shared/mcp/tools/map/index.test.ts` - Add error handling tests
- Create `/shared/clients/firecrawl-map.client.test.ts` - Add client tests
- Create `/tests/functional/map-tool-errors.test.ts` - Error scenarios

---

## Summary Table

| Item                             | Status        | Priority | Effort | Value  |
| -------------------------------- | ------------- | -------- | ------ | ------ |
| All core API parameters          | ✓ Implemented | -        | -      | -      |
| Parameter documentation          | ✗ Missing     | High     | Low    | High   |
| Enhanced error handling          | ✗ Missing     | Medium   | Medium | High   |
| Retry strategy                   | ✗ Missing     | Low      | High   | Medium |
| API metadata exposure            | ✗ Missing     | Low      | Low    | Low    |
| Request/response diagnostics     | ✗ Missing     | Low      | Medium | Medium |
| Format validation (country/lang) | ✗ Missing     | Medium   | Low    | Medium |
| Comprehensive test coverage      | ✗ Incomplete  | Medium   | Medium | High   |

---

## Conclusions

### What's Working Well

1. All Firecrawl MAP API parameters are correctly implemented
2. Custom pagination and result handling modes add value
3. Response formatting with statistics is helpful
4. Integration with MCP resource system works properly

### Key Gaps

1. **No parameter documentation** - Users don't understand what each parameter does
2. **Basic error handling** - Rate limits, auth failures not distinguished from other errors
3. **No retry strategy** - Transient failures aren't automatically retried
4. **No format validation** - Invalid country/language codes won't be caught until API call

### Recommended Next Steps

1. **Immediate** (1-2 hours): Add parameter descriptions and format validation
2. **Short-term** (2-3 hours): Enhance error handling with status code parsing
3. **Medium-term** (3-4 hours): Add retry strategy with exponential backoff
4. **Nice-to-have**: Expose API metadata and timing information

### Strategic Alignment

These improvements align with Pulse Fetch's goals:

- Better error messages = better debugging
- Parameter validation = catch errors early
- Retry strategy = more reliable
- Consistent with scrape tool = better user experience

The implementation is solid; the recommendations focus on documentation, error handling, and reliability improvements that will make it more production-ready.
