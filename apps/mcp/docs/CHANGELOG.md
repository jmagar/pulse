# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Search tool**: Web search with multi-source support (web, images, news)
  - Filter by category: GitHub repositories, research papers, PDFs
  - Optional content scraping for search results
  - Geographic targeting with country and language preferences
- **Map tool**: Fast URL discovery (8x faster than crawling)
  - Sitemap integration with skip/include/only options
  - Search filtering to find specific URLs
  - Support for up to 100,000 URLs per request
  - Subdomain and query parameter handling
- **Crawl tool**: Consolidated recursive website crawling with job management
  - Start crawl with `url` parameter (returns job ID)
  - Check status with `jobId` parameter (monitor progress)
  - Cancel with `jobId` + `cancel: true` (stop in-progress jobs)
  - Path filtering with `includePaths` and `excludePaths`
  - Depth control, domain scope, and rate-limiting options
- New client classes: `FirecrawlSearchClient`, `FirecrawlMapClient`, `FirecrawlCrawlClient`
- Comprehensive test coverage for all new tools (78 tests passing)
- Manual testing scripts for each tool in `tests/manual/features/`
- Complete documentation in `docs/tools/` (SEARCH.md, MAP.md, CRAWL.md)
- **documentation**: Complete SCRAPE tool documentation with all 17 parameters
  - 8 browser action types with detailed examples
  - LLM extraction feature setup and usage
  - Multi-tier caching system explanation
  - Response format examples for all modes (saveOnly, saveAndReturn, returnOnly)
  - Advanced usage examples and comprehensive troubleshooting guide
- **documentation**: Complete CRAWL tool documentation
  - Natural language prompt feature with AI-generated parameters
  - Browser actions support (NEW: actions apply to every page in crawl)
  - XOR validation for operation modes (url vs jobId)
  - Job management workflow (start/status/cancel)
  - Response format and status values
- **documentation**: Enhanced SEARCH tool documentation
  - Detailed tbs parameter documentation for time-based filtering
  - Preset time ranges (qdr:h, qdr:d, qdr:w, qdr:m, qdr:y)
  - Custom date range format with examples
- **documentation**: Enhanced MAP tool documentation
  - Environment variable validation details (MAP_MAX_RESULTS_PER_PAGE)
  - Default location behavior clarification
  - Resource URI format specification
  - Token estimation formula (4:1 character-to-token ratio)

### Changed

- Extended tool registration to support 4 total tools (scrape, search, map, crawl)
- Updated shared module exports to include new clients
- Consolidated crawl operations into single tool to reduce token usage

### Fixed

- **search tool**: Fixed `tbs` parameter not being passed to Firecrawl API
  - The tbs parameter was validated in schema but never included in the pipeline mapping
  - Added test verification and fixed pipeline to pass tbs to API calls
  - Time-based search filtering now works correctly
- **Environment Variable Consistency**: Standardized all Firecrawl tools to use `FIRECRAWL_BASE_URL` (previously had inconsistent naming causing authentication failures)
- **Crawl Tool Schema Compatibility**: Fixed Anthropic API validation error by flattening crawl schema to avoid `anyOf` at root level (previously used Zod `.or()` union which generated incompatible JSON schema)
- **Debug Logging**: Added server-side logging to detect schema validation issues at startup (enable with `DEBUG=true` or `NODE_ENV=development`)

### BREAKING CHANGES

#### Removed BrightData Integration

**Removed all BrightData scraping functionality** in favor of a simplified two-tier fallback system (native → firecrawl).

**What Changed:**

- Removed BrightData client implementation
- Simplified scraping strategy from three-tier to two-tier
- Updated optimization modes:
  - `OPTIMIZE_FOR=cost`: Now uses native → firecrawl (previously native → firecrawl → brightdata)
  - `OPTIMIZE_FOR=speed`: Now uses firecrawl only (previously firecrawl → brightdata)
- Removed `BRIGHTDATA_API_KEY` environment variable
- Updated `ScrapingStrategy` type from `'native' | 'firecrawl' | 'brightdata'` to `'native' | 'firecrawl'`

**Migration Guide:**

1. Remove `BRIGHTDATA_API_KEY` from your environment configuration
2. Update any strategy configuration files that reference 'brightdata' to use 'firecrawl' or 'native'
3. Sites requiring anti-bot bypass should now use Firecrawl instead of BrightData
4. Test your scraping workflows to ensure they work with the two-tier fallback

**Why This Change:**
This change simplifies the scraping architecture, reduces maintenance complexity, and focuses on the two most effective strategies for documentation ingestion and RAG use cases.

---

## [0.3.0] - Previous Release

(Previous changelog entries would go here)
