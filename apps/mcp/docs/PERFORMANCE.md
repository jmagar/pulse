# Performance Guide

Optimization strategies and performance tuning for Pulse Fetch MCP server.

## Table of Contents

- [Performance Overview](#performance-overview)
- [Multi-Tier Caching](#multi-tier-caching)
- [Storage Backends](#storage-backends)
- [Strategy Selection](#strategy-selection)
- [Resource Limits](#resource-limits)
- [Cache Eviction](#cache-eviction)
- [Performance Tuning](#performance-tuning)
- [Benchmarks](#benchmarks)
- [Monitoring](#monitoring)

---

## Performance Overview

Pulse Fetch uses multiple optimization layers to minimize latency and API costs:

```
Request
   │
   ├─→ Cache Lookup (0-5ms)
   │      ├─ Hit: Return cached (immediate)
   │      └─ Miss: Continue ↓
   │
   ├─→ Strategy Selection (1-2ms)
   │      ├─ Cost mode: Native → Firecrawl
   │      └─ Speed mode: Firecrawl only
   │
   ├─→ Content Fetching (500-5000ms)
   │      ├─ Native: 500-2000ms
   │      └─ Firecrawl: 1000-5000ms
   │
   ├─→ Content Cleaning (10-50ms)
   │      └─ HTML → Markdown conversion
   │
   ├─→ LLM Extraction (optional, 1000-10000ms)
   │      └─ Anthropic/OpenAI API call
   │
   └─→ Cache Storage (5-100ms)
          ├─ Memory: 5-10ms
          └─ Filesystem: 20-100ms
```

**Performance targets:**

- **Cache hit**: <10ms total
- **Cache miss (native)**: 500-2500ms
- **Cache miss (Firecrawl)**: 1000-6000ms
- **With extraction**: +1000-10000ms

---

## Multi-Tier Caching

### Architecture

Pulse Fetch stores scraped content in **three tiers**:

```
┌─────────────────────────────────────┐
│  Request: scrape + cleanScrape + extract  │
└─────────────┬───────────────────────┘
              │
    ┌─────────┴──────────┬──────────────┐
    │                    │              │
┌───▼────┐       ┌───────▼──┐     ┌────▼──────┐
│  RAW   │       │ CLEANED  │     │ EXTRACTED │
│  HTML  │  →    │ Markdown │  →  │  LLM Data │
└────────┘       └──────────┘     └───────────┘
   5KB              3KB               1KB
```

**Tier details:**

| Tier          | Content                 | When Created                     | Use Case                   |
| ------------- | ----------------------- | -------------------------------- | -------------------------- |
| **raw**       | Original HTML/markdown  | Always                           | Debugging, re-processing   |
| **cleaned**   | Markdown (main content) | If `cleanScrape: true` (default) | Reading, LLM input         |
| **extracted** | LLM-extracted data      | If `extract` param provided      | Structured data, summaries |

**Benefits:**

- **Flexibility**: Access any tier for different use cases
- **Reusability**: Cleaned content available for multiple extraction queries
- **Debugging**: Raw HTML preserved for troubleshooting
- **Storage efficiency**: Each tier progressively smaller

### Cache Key Generation

**Standard cache key:**

```
URL only → findByUrl(url)
Returns: All resources for that URL (raw, cleaned, extracted)
```

**Extraction cache key:**

```
URL + extract prompt → findByUrlAndExtract(url, "Extract pricing")
Returns: Only resources matching exact prompt
```

**Importance of multi-dimensional keys:**

```typescript
// Different extractions from same URL use separate cache entries
scrape({ url, extract: 'Extract title' }); // Cache entry 1
scrape({ url, extract: 'Extract pricing' }); // Cache entry 2
scrape({ url, extract: 'Summarize in bullets' }); // Cache entry 3
```

### Cache Lookup Flow

```typescript
// 1. Check if cache bypass requested
if (forceRescrape || resultHandling === 'saveOnly') {
  // Skip cache, scrape fresh
}

// 2. Lookup in cache
const cached = await storage.findByUrlAndExtract(url, extractPrompt);

// 3. Return if found (cache hit)
if (cached.length > 0) {
  return formatResponse(cached[0]); // Immediate return
}

// 4. Scrape if not found (cache miss)
const scraped = await scrapeWithStrategy(url);
```

**Cache hit rate optimization:**

- Use consistent URLs (avoid unnecessary query params)
- Set appropriate TTL for content type
- Use `forceRescrape: false` unless content changes frequently

---

## Storage Backends

### Memory Storage (Default)

**Implementation:** JavaScript `Map<uri, CacheEntry>`

**Performance characteristics:**

- **Read**: O(n) scan for URL/extract queries (fast for <1000 items)
- **Write**: O(1) insertion
- **Size calculation**: `Buffer.byteLength()` for accurate sizing

**Pros:**

- ✅ Fastest performance (5-10ms per operation)
- ✅ Zero disk I/O
- ✅ Simple setup (no configuration needed)
- ✅ Ideal for development and testing

**Cons:**

- ❌ Lost on restart
- ❌ Memory-limited (not suitable for >1GB caches)
- ❌ Timestamp collisions possible (millisecond precision)

**When to use:**

- Stateless deployments (serverless, Kubernetes with ephemeral storage)
- Development and testing
- Highly dynamic content (frequent changes)
- Memory is abundant, persistence not needed

**Configuration:**

```bash
MCP_RESOURCE_STORAGE=memory
MCP_RESOURCE_MAX_SIZE=100      # MB
MCP_RESOURCE_MAX_ITEMS=1000    # Count
MCP_RESOURCE_TTL=86400         # Seconds
```

---

### Filesystem Storage (Production)

**Implementation:** Markdown files with YAML frontmatter

**Directory structure:**

```
{MCP_RESOURCE_FILESYSTEM_ROOT}/
├── raw/
│   ├── example.com_page_20250108123456789.md
│   └── test.com_article_20250108234567890.md
├── cleaned/
│   ├── example.com_page_20250108123456789.md
│   └── test.com_article_20250108234567890.md
└── extracted/
    ├── example.com_page_20250108123456789.md
    └── test.com_article_20250108234567890.md
```

**File format:**

```markdown
---
url: 'https://example.com/page'
timestamp: '2025-01-08T12:34:56.789Z'
resourceType: 'cleaned'
title: 'Page Title'
lastAccessTime: 1736346896789
ttl: 86400000
---

# Page Title

Content in Markdown format...
```

**Performance characteristics:**

- **Read**: O(n) directory scan + file read (slower for >10000 files)
- **Write**: O(1) file write + eviction check
- **Eviction**: O(n) scan + unlink operations

**Pros:**

- ✅ Persistent across restarts
- ✅ Survives crashes
- ✅ Debuggable (inspect files directly)
- ✅ Suitable for large caches (GB scale)

**Cons:**

- ❌ Slower than memory (20-100ms per operation)
- ❌ Requires disk space
- ❌ Volume management in Docker

**When to use:**

- Production deployments
- Long-running servers
- Large caches (>100MB)
- Debugging needed
- Persistence required

**Configuration:**

```bash
MCP_RESOURCE_STORAGE=filesystem
MCP_RESOURCE_FILESYSTEM_ROOT=/var/cache/pulse
MCP_RESOURCE_TTL=0             # Infinite TTL
MCP_RESOURCE_MAX_SIZE=1000     # MB
MCP_RESOURCE_MAX_ITEMS=10000   # Count
```

**Docker volume setup:**

```yaml
# docker-compose.yml
volumes:
  - ./resources:/app/resources

# Permissions
chmod 755 ./resources
chown -R 1001:1001 ./resources  # Docker user
```

---

### Storage Backend Comparison

| Metric                | Memory       | Filesystem     |
| --------------------- | ------------ | -------------- |
| **Read latency**      | 5-10ms       | 20-100ms       |
| **Write latency**     | 5-10ms       | 20-100ms       |
| **Cache hit latency** | <5ms         | 10-50ms        |
| **Persistence**       | None         | Yes            |
| **Max size**          | RAM limit    | Disk limit     |
| **Typical max**       | 1-2GB        | 100GB+         |
| **Development**       | ✅ Ideal     | ⚠️ Overhead    |
| **Production**        | ⚠️ Ephemeral | ✅ Recommended |

---

## Strategy Selection

### Optimization Modes

**OPTIMIZE_FOR=cost (default):**

```
Native fetch (free, fast)
    ↓ (on failure)
Firecrawl API (paid, robust)
```

**Benefits:**

- Minimize API costs (free native fetch first)
- Native fetch succeeds for ~70% of simple pages
- Firecrawl fallback for anti-bot protection

**Use when:**

- Budget-conscious deployments
- Mixed content (simple + complex sites)
- Self-hosting Firecrawl not available

**OPTIMIZE_FOR=speed:**

```
Firecrawl API only (skip native fetch)
```

**Benefits:**

- Maximum reliability (Firecrawl handles all anti-bot)
- Consistent quality across all sites
- 1-2 second faster (no native attempt)

**Use when:**

- Self-hosted Firecrawl (no additional cost)
- Sites with heavy bot protection
- Speed > cost optimization
- Budget allows direct Firecrawl usage

### Learned Strategy Configuration

**Auto-learning successful strategies:**

When a strategy succeeds, Pulse Fetch can learn and reuse it:

**strategy-config.md format:**

```markdown
# Scraping Strategy Configuration

## Pattern: Yelp business pages

- Matches: `yelp.com/biz/*`
- Strategy: firecrawl
- Reason: Requires JavaScript rendering and anti-bot bypass

## Pattern: Documentation sites

- Matches: `*.readthedocs.io/*`, `docs.python.org/*`
- Strategy: native
- Reason: Static HTML, no bot protection
```

**Enable:**

```bash
STRATEGY_CONFIG_PATH=/path/to/strategy-config.md
```

**Benefits:**

- Skip failed strategies for known patterns
- Faster scraping (no trial-and-error)
- Lower costs (avoid unnecessary Firecrawl calls)

### Strategy Performance Comparison

| Strategy      | Latency     | Success Rate | Cost             | Use Case                   |
| ------------- | ----------- | ------------ | ---------------- | -------------------------- |
| **Native**    | 500-2000ms  | ~70%         | Free             | Simple pages, docs         |
| **Firecrawl** | 1000-5000ms | ~95%         | $0.001-0.01/page | Anti-bot, JavaScript-heavy |

---

## Resource Limits

### Configuration Options

```bash
# Time-to-live (seconds)
MCP_RESOURCE_TTL=86400    # 24 hours (default)
MCP_RESOURCE_TTL=0        # Infinite (never expire)

# Maximum total cache size (MB)
MCP_RESOURCE_MAX_SIZE=100     # Default
MCP_RESOURCE_MAX_SIZE=1000    # Large deployments

# Maximum cached items (count)
MCP_RESOURCE_MAX_ITEMS=1000   # Default
MCP_RESOURCE_MAX_ITEMS=10000  # Large deployments
```

### Content Truncation

**Applied when content exceeds `maxChars`:**

```typescript
// Default: 100,000 characters
if (content.length > maxChars) {
  content = content.substring(0, maxChars) + '\n\n[Content truncated]';
}
```

**Tuning:**

```json
{
  "url": "https://very-long-page.com",
  "maxChars": 200000 // Allow longer content
}
```

**Token estimation:**

- 1 character ≈ 0.3 tokens (English text)
- 100,000 chars ≈ 30,000 tokens
- 200,000 chars ≈ 60,000 tokens

### Pagination (Map Tool)

**Control response size:**

```json
{
  "url": "https://large-site.com",
  "maxResults": 100,      // Return 100 URLs per request
  "startIndex": 0         // Start at position 0
}

// Next page:
{
  "url": "https://large-site.com",
  "maxResults": 100,
  "startIndex": 100       // Next 100 results
}
```

**Token usage optimization:**

- 100 results ≈ 6.5k tokens
- 200 results ≈ 13k tokens (default)
- 500 results ≈ 32k tokens
- 1000 results ≈ 65k tokens

---

## Cache Eviction

### TTL-Based Eviction

**How it works:**

```typescript
const createdAt = new Date(metadata.timestamp).getTime();
const expiresAt = createdAt + metadata.ttl;
const isExpired = Date.now() >= expiresAt;

if (isExpired) {
  await storage.delete(uri); // Lazy eviction on access
}
```

**When eviction occurs:**

- ✅ On read (lazy eviction)
- ✅ On list operation
- ✅ Background cleanup (if enabled)
- ❌ NOT on write (check done during eviction pass)

**Configuration strategies:**

```bash
# Short TTL (frequent updates)
MCP_RESOURCE_TTL=3600  # 1 hour

# Medium TTL (balanced)
MCP_RESOURCE_TTL=86400  # 24 hours (default)

# Long TTL (stable content)
MCP_RESOURCE_TTL=604800  # 1 week

# Infinite (manual invalidation)
MCP_RESOURCE_TTL=0
```

### LRU Eviction

**Least Recently Used eviction:**

```typescript
// Sort by lastAccessTime (ascending)
const sorted = resources.sort((a, b) => a.lastAccessTime - b.lastAccessTime);

// Evict oldest until within limits
while (totalSize > maxSizeBytes || itemCount > maxItems) {
  const oldest = sorted.shift();
  await storage.delete(oldest.uri);
}
```

**Triggers:**

- Total cache size exceeds `MCP_RESOURCE_MAX_SIZE`
- Item count exceeds `MCP_RESOURCE_MAX_ITEMS`

**Last access time updated:**

- Every `read()` operation
- NOT updated on `list()` or `exists()`

**Optimization tips:**

- Frequently accessed content stays cached
- One-time scrapes evicted first
- Increase limits if eviction too aggressive

### Background Cleanup

**Periodic eviction (optional):**

```typescript
storage.startCleanup(); // Starts interval timer

// Runs every cleanupInterval (default: 60s)
setInterval(async () => {
  await removeExpired(); // TTL-based eviction
  await enforceLimits(); // LRU eviction
}, cleanupInterval);

storage.stopCleanup(); // Clears interval
```

**Default behavior:**

- **Local mode**: Cleanup NOT started (stdio, short-lived)
- **Remote mode**: Cleanup NOT started (lazy eviction sufficient)
- **Manual**: Call `storage.startCleanup()` if needed

**When to enable:**

- Long-running servers (weeks/months uptime)
- Large caches (>1000 items)
- Strict memory limits
- Automated eviction preferred over lazy

---

## Performance Tuning

### High-Volume Deployments

**Target: Maximize throughput**

```bash
# Optimization
OPTIMIZE_FOR=speed           # Skip native, use Firecrawl directly
MCP_RESOURCE_STORAGE=memory  # Fastest cache lookups
MCP_RESOURCE_TTL=3600        # 1-hour cache (more hits)
MCP_RESOURCE_MAX_SIZE=500    # Larger cache
MCP_RESOURCE_MAX_ITEMS=5000  # More cached items

# Docker resources
deploy:
  resources:
    limits:
      cpus: '4.0'
      memory: 8G
```

**Expected performance:**

- Cache hit: <5ms
- Cache miss: 1-3s
- Throughput: 100+ req/min

---

### Cost-Optimized Deployments

**Target: Minimize API costs**

```bash
# Optimization
OPTIMIZE_FOR=cost            # Native first, Firecrawl fallback
MCP_RESOURCE_STORAGE=filesystem  # Persistent cache
MCP_RESOURCE_TTL=0           # Infinite TTL (maximum reuse)
MCP_RESOURCE_MAX_SIZE=1000   # Large persistent cache
STRATEGY_CONFIG_PATH=/app/strategy-config.md  # Learn patterns
```

**Expected savings:**

- 70% requests avoid Firecrawl (native success)
- Persistent cache survives restarts
- Learned strategies skip trials

---

### Memory-Constrained Environments

**Target: Minimize memory usage**

```bash
# Optimization
MCP_RESOURCE_STORAGE=filesystem  # Use disk instead of RAM
MCP_RESOURCE_MAX_SIZE=50     # Limit to 50MB
MCP_RESOURCE_MAX_ITEMS=500   # Fewer cached items
MCP_RESOURCE_TTL=3600        # 1-hour TTL (faster eviction)

# Docker resources
deploy:
  resources:
    limits:
      memory: 512M
    reservations:
      memory: 256M
```

---

### Development and Testing

**Target: Fast iteration, easy debugging**

```bash
# Optimization
DEBUG=true                   # Verbose logging
MCP_RESOURCE_STORAGE=memory  # Fast, isolated tests
MCP_RESOURCE_TTL=0           # No expiration during debugging
SKIP_HEALTH_CHECKS=true      # Faster startup

# Test-specific
forceRescrape=true           # Bypass cache for fresh data
```

---

## Benchmarks

### Cache Performance

**Memory Storage:**

```
Read (hit):     3-5ms
Read (miss):    2-3ms
Write:          5-10ms
List (100):     10-15ms
List (1000):    50-100ms
```

**Filesystem Storage:**

```
Read (hit):     20-50ms
Read (miss):    15-30ms
Write:          30-100ms
List (100):     50-100ms
List (1000):    500-1000ms
```

### Scraping Performance

**Native Fetch:**

```
Simple HTML:     500-1000ms
JavaScript-heavy: 1000-2000ms (may fail)
Anti-bot:        Fails (403/429)
```

**Firecrawl:**

```
Simple HTML:     1000-2000ms
JavaScript-heavy: 2000-5000ms
Anti-bot:        3000-6000ms
```

### End-to-End Latency

**Scrape (cache hit):**

```
Memory:          <10ms
Filesystem:      10-50ms
```

**Scrape (cache miss, no extraction):**

```
Native success:  500-2500ms
Firecrawl:       1000-6000ms
```

**Scrape (with extraction):**

```
+ LLM call:      1000-10000ms
Total:           1500-16000ms
```

---

## Monitoring

### Metrics to Track

**Cache efficiency:**

- Hit rate: `cacheHits / (cacheHits + cacheMisses)`
- Target: >60% hit rate
- Low hit rate indicates: TTL too short, frequently changing content, or `forceRescrape` overuse

**Latency:**

- P50 latency: Median response time
- P95 latency: 95th percentile
- P99 latency: 99th percentile
- Track separately for cache hits and misses

**Storage:**

- Total cache size (MB)
- Item count
- Eviction rate (items/hour)

**API costs:**

- Firecrawl API calls per hour
- Native vs Firecrawl ratio
- Failed request rate

### Metrics Endpoint

**Current metrics (remote mode):**

```bash
curl -H "X-Metrics-Key: $KEY" http://localhost:3060/metrics/json
```

**Example response:**

```json
{
  "totalRequests": 1234,
  "successful": 1200,
  "failed": 34,
  "cacheHits": 890,
  "cacheMisses": 344,
  "uptime": 86400
}
```

### Performance Alerts

**Recommended alerts:**

```yaml
# High cache miss rate
- name: HighCacheMissRate
  condition: cacheHits / totalRequests < 0.4
  action: Increase TTL or investigate cache invalidation

# High latency
- name: HighP95Latency
  condition: p95_latency > 10000ms
  action: Check Firecrawl API status, review strategy selection

# High eviction rate
- name: HighEvictionRate
  condition: evictions_per_hour > 100
  action: Increase cache size limits

# Storage approaching limit
- name: StorageNearLimit
  condition: totalSize > maxSize * 0.9
  action: Increase max size or reduce TTL
```

---

## Next Steps

- **[Configuration](CONFIGURATION.md)** - Environment variables for tuning
- **[Deployment](DEPLOYMENT.md)** - Production setup
- **[Troubleshooting](TROUBLESHOOTING.md)** - Common performance issues
- **[Architecture](ARCHITECTURE.md)** - System design and data flows
