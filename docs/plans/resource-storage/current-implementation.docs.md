# MCP Resource Storage - Current Implementation Research

## Summary

The MCP server implements a dual-backend resource storage system for persisting scraped content. Resources are created exclusively by the `scrape` tool pipeline and exposed via standard MCP resource handlers (`resources/list`, `resources/read`). The storage layer supports in-memory (development) and filesystem (production) backends with LRU eviction, TTL-based expiration, and configurable size limits. All resource writes happen through `storage.writeMulti()` which saves up to 3 variants per URL (raw HTML, cleaned markdown, extracted content).

## Key Components

- `/compose/pulse/apps/mcp/storage/types.ts`: Core interface definitions (ResourceStorage, ResourceData, ResourceMetadata, etc.)
- `/compose/pulse/apps/mcp/storage/factory.ts`: Singleton factory that creates storage backend from `MCP_RESOURCE_STORAGE` env var
- `/compose/pulse/apps/mcp/storage/memory.ts`: In-memory Map-based storage with LRU eviction (283 lines)
- `/compose/pulse/apps/mcp/storage/filesystem.ts`: Persistent file-based storage with YAML front matter (513 lines)
- `/compose/pulse/apps/mcp/storage/cache-options.ts`: Environment variable parsing for storage configuration
- `/compose/pulse/apps/mcp/tools/scrape/pipeline.ts`: Scraping orchestration with `checkCache()` and `saveToStorage()` functions
- `/compose/pulse/apps/mcp/tools/registration.ts`: MCP handler registration for `ListResourcesRequestSchema` and `ReadResourceRequestSchema`

## Implementation Patterns

### Storage Interface Pattern

The `ResourceStorage` interface defines 10 methods for CRUD operations and cache management:

```typescript
export interface ResourceStorage {
  list(): Promise<ResourceData[]>;
  read(uri: string): Promise<ResourceContent>;
  write(url: string, content: string, metadata?: Partial<ResourceMetadata>): Promise<string>;
  writeMulti(data: MultiResourceWrite): Promise<MultiResourceUris>;
  exists(uri: string): Promise<boolean>;
  delete(uri: string): Promise<void>;
  findByUrl(url: string): Promise<ResourceData[]>;
  findByUrlAndExtract(url: string, extractPrompt?: string): Promise<ResourceData[]>;
  getStats(): Promise<ResourceCacheStats>;
  startCleanup(): void;
  stopCleanup(): void;
}
```

**Critical Design Decision**: The interface uses `writeMulti()` as the primary write operation, which atomically saves up to 3 content variants (raw, cleaned, extracted) from a single scrape. This ensures consistency and enables cache hit prioritization (cleaned > extracted > raw).

### Factory Singleton Pattern

`ResourceStorageFactory.create()` ensures only one storage backend per process:

```typescript
export class ResourceStorageFactory {
  private static instance: ResourceStorage | null = null;

  static async create(): Promise<ResourceStorage> {
    if (this.instance) {
      return this.instance;
    }

    const storageType = (env.resourceStorage || "memory").toLowerCase();

    switch (storageType) {
      case "memory":
        this.instance = new MemoryResourceStorage();
        break;
      case "filesystem":
        const fsStorage = new FileSystemResourceStorage(env.resourceFilesystemRoot);
        await fsStorage.init();
        this.instance = fsStorage;
        break;
    }

    return this.instance;
  }

  static reset(): void {
    this.instance = null;  // Test-only
  }
}
```

**Configuration**: Backend selection via `MCP_RESOURCE_STORAGE` environment variable (default: `memory`).

### Memory Storage Implementation

**Key Characteristics**:
- In-memory `Map<string, MemoryResourceEntry>` indexed by URI
- LRU eviction when limits exceeded (`maxItems`, `maxSizeBytes`)
- TTL-based expiration checked on reads and periodic cleanup
- URI format: `memory://raw/domain_timestamp` (e.g., `memory://cleaned/docs.firecrawl.dev_20251112...`)
- No persistence across restarts

**Eviction Strategy** (`apps/mcp/storage/memory.ts:278-297`):
1. Remove expired entries (TTL check)
2. If still over limits, evict least recently accessed entries until under threshold
3. Tracks `lastAccessTime` on every `read()` and `exists()` call

### Filesystem Storage Implementation

**Key Characteristics**:
- Markdown files with YAML front matter in subdirectories: `<rootDir>/raw/`, `<rootDir>/cleaned/`, `<rootDir>/extracted/`
- URI format: `file:///app/resources/cleaned/docs.firecrawl.dev_20251112.md`
- Persistent across restarts with lazy index loading (`refreshIndex()` on first access)
- Same LRU + TTL eviction as memory storage

**File Format** (`apps/mcp/storage/filesystem.ts:467-480`):
```markdown
---
url: "https://docs.firecrawl.dev/..."
timestamp: "2025-11-12T15:21:00.123Z"
resourceType: "cleaned"
contentType: "text/markdown"
source: "firecrawl"
ttl: 86400000
contentLength: 12345
startIndex: 0
maxChars: 50000
wasTruncated: false
---

<actual scraped content here>
```

**Metadata Parsing**: Simple regex-based YAML parser that extracts front matter and JSON-parses each field value.

### Scrape Pipeline Integration

**Write Path** (`apps/mcp/tools/scrape/pipeline.ts:450-486`):
```typescript
export async function saveToStorage(
  url: string,
  rawContent: string,
  cleanedContent: string | undefined,
  extractedContent: string | undefined,
  extract: string | undefined,
  source: string,
  startIndex: number,
  maxChars: number,
  wasTruncated: boolean,
): Promise<{ raw?: string; cleaned?: string; extracted?: string } | null> {
  const storage = await ResourceStorageFactory.create();
  const uris = await storage.writeMulti({
    url,
    raw: rawContent,
    cleaned: cleanedContent,
    extracted: extractedContent,
    metadata: {
      url,
      source,
      timestamp: new Date().toISOString(),
      extract: extract || undefined,
      contentLength: rawContent.length,
      startIndex,
      maxChars,
      wasTruncated,
      contentType: detectContentType(rawContent),
    },
  });
  return uris;
}
```

**Read Path - Cache Lookup** (`apps/mcp/tools/scrape/pipeline.ts:72-168`):
```typescript
export async function checkCache(
  url: string,
  extract: string | undefined,
  resultHandling: string,
  forceRescrape: boolean,
): Promise<{ found: true; content: string; ... } | { found: false }> {
  // Skip cache if forceRescrape or saveOnly mode
  if (forceRescrape || resultHandling === "saveOnly") {
    return { found: false };
  }

  const storage = await ResourceStorageFactory.create();
  const cachedResources = await storage.findByUrlAndExtract(url, extract);

  if (cachedResources.length > 0) {
    // Prioritize cleaned > extracted > raw
    const preferredResource =
      cachedResources.find((r) => r.uri.includes("/cleaned/")) ||
      cachedResources.find((r) => r.uri.includes("/extracted/")) ||
      cachedResources[0];

    const cachedContent = await storage.read(preferredResource.uri);
    return { found: true, content: cachedContent.text || "", ... };
  }

  return { found: false };
}
```

**Priority Order**: Cleaned markdown is preferred over extracted content, which is preferred over raw HTML. This ensures the most readable/useful content is returned on cache hits.

### MCP Resource Handler Registration

**Registration** (`apps/mcp/tools/registration.ts:230-388`):
```typescript
export function registerResources(server: Server): void {
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    const storage = await ResourceStorageFactory.create();
    const resources = await storage.list();

    return {
      resources: resources.map((resource) => ({
        uri: resource.uri,
        name: resource.name,
        mimeType: resource.mimeType,
        description: resource.description,
      })),
    };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;
    const storage = await ResourceStorageFactory.create();
    const resource = await storage.read(uri);

    return {
      contents: [{
        uri: resource.uri,
        mimeType: resource.mimeType,
        text: resource.text,
      }],
    };
  });
}
```

**Docker Logs Extension**: The registration also includes a `DockerLogsProvider` that exposes Docker container logs as MCP resources (e.g., `docker://logs/firecrawl?lines=100`). This is a separate resource provider unrelated to scrape storage.

## Configuration

### Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `MCP_RESOURCE_STORAGE` | `memory` | Backend selector (`memory` or `filesystem`) |
| `MCP_RESOURCE_FILESYSTEM_ROOT` | `$TMPDIR/pulse/resources` | Root directory for filesystem backend |
| `MCP_RESOURCE_TTL` | `86400` seconds (24h) | Default TTL for cached entries (0 = never expire) |
| `MCP_RESOURCE_MAX_SIZE` | `100` MB | Total bytes before LRU eviction |
| `MCP_RESOURCE_MAX_ITEMS` | `1000` | Maximum number of cached entries |
| `MCP_RESOURCE_CLEANUP_INTERVAL` | `60000` ms | Background cleanup frequency (when `startCleanup()` is called) |

**Configuration Loading** (`apps/mcp/storage/cache-options.ts:18-50`):
- Parses env vars with fallback to defaults
- Converts TTL from seconds to milliseconds
- Converts max size from MB to bytes
- Validates numeric values (ignores negatives, uses defaults on NaN)

### Example `.env` Configuration

```bash
# Memory backend (development - no persistence)
MCP_RESOURCE_STORAGE=memory
MCP_RESOURCE_TTL=86400          # 24 hours
MCP_RESOURCE_MAX_SIZE=100       # 100 MB
MCP_RESOURCE_MAX_ITEMS=1000     # 1000 resources

# Filesystem backend (production - persists across restarts)
MCP_RESOURCE_STORAGE=filesystem
MCP_RESOURCE_FILESYSTEM_ROOT=/app/resources
MCP_RESOURCE_TTL=604800         # 7 days
```

## Considerations

### Resource Creation is Scrape-Only

**Critical Limitation**: Only the `scrape` tool writes to resource storage. Other tools (`crawl`, `map`, `search`, `query`) return embedded JSON resources in responses but DO NOT persist them to the global storage system. This means:

- Crawl results are not cached (every `crawl status` call refetches from Firecrawl)
- Map results are not cached (URL lists are regenerated on every request)
- Search results are ephemeral (no history or deduplication)
- Query results embed markdown in response but don't save to storage

**Rationale** (from `/compose/pulse/docs/mcp/RESOURCES.md:109-116`):
- Crawl: Returns discovery summaries, not content
- Map: Returns URL lists (already lightweight JSON)
- Search: Results change frequently, caching adds staleness risk
- Query: Hybrid search results from webhook service, not scraped content

### Filesystem Storage Index Refresh

**Performance Gotcha**: The filesystem backend lazy-loads the index on first access (`refreshIndex()` scans all subdirectories). This means:

- First `list()` or `findByUrl()` call after server restart is slow (O(n) file reads)
- Subsequent calls are fast (in-memory index)
- Index is not automatically refreshed when external processes write files

**Workaround**: The `ensureEntry()` method attempts a file read if the URI is not in the index, providing eventual consistency for externally-added files.

### TTL=0 Disables Expiration

**Behavior**: Setting `MCP_RESOURCE_TTL=0` (or `ttl: 0` in metadata) disables expiration for that resource. It will only be evicted if size/item limits are exceeded and it's the least recently used.

**Use Case**: Permanent caching of expensive scrapes (e.g., large PDFs, slow sites).

### LRU Eviction is Synchronous

**Performance Risk**: When limits are exceeded, `enforceLimits()` iterates over all entries to find the LRU candidate. This is O(n) on every write that triggers eviction.

**Current Scale**: With default `maxItems=1000`, this is acceptable. At larger scales (10k+ resources), consider a heap-based LRU or async eviction.

### Metadata is Stored but Not Fully Validated

**Schema Gap**: The `ResourceMetadata` interface uses `[key: string]: unknown` for extensibility, but there's no runtime validation of metadata shape beyond the core fields (`url`, `timestamp`, `resourceType`, etc.).

**Risk**: Malformed metadata can be written to storage and cause issues on read (e.g., non-ISO timestamps, non-string URLs). The filesystem backend's YAML parser uses `try/catch` on JSON.parse but silently falls back to raw strings.

### No Multi-Tenancy or Access Control

**Current Design**: All resources are globally visible to any MCP client. There's no concept of user/session isolation or resource ownership.

**Implication**: If multiple users share the same MCP server, they can access each other's scraped content via `resources/list` and `resources/read`.

### Filesystem Backend Creates Subdirectories on Init

**Deployment Note**: The filesystem storage creates `raw/`, `cleaned/`, `extracted/` subdirectories during `init()`. If `MCP_RESOURCE_FILESYSTEM_ROOT` points to a read-only volume, initialization will fail.

**Fix**: Ensure the root directory is writable or pre-create subdirectories in Docker image build.

## Next Steps

### For Database Migration Planning

**Architecture Decision**: The current storage interface is perfectly suited for a database backend. Key observations:

1. **URI-based Addressing**: Both memory and filesystem use URIs as primary keys. PostgreSQL could use a similar pattern with a `resources` table indexed by `uri`.

2. **Metadata as JSONB**: The flexible `ResourceMetadata` schema maps cleanly to PostgreSQL's `JSONB` type, enabling efficient filtering (e.g., `WHERE metadata->>'url' = ?`).

3. **Blob Storage Consideration**: Large content blobs (raw HTML) could exceed PostgreSQL's practical limits. Consider hybrid approach: metadata in Postgres, content in S3/MinIO.

4. **Multi-Variant Writes**: The `writeMulti()` pattern suggests a database schema with:
   - Single `resources` table with `resource_type` enum column
   - Transaction-based writes to ensure atomicity of 3-variant saves
   - Foreign key relationships if metadata needs normalization (e.g., `scrape_sessions` table)

5. **LRU Eviction**: Database-backed LRU requires either:
   - Periodic cleanup job (query for expired/over-limit entries)
   - Trigger-based eviction (update `last_access_time` on reads, cleanup on writes)
   - Redis-backed LRU index (hybrid approach)

6. **Token Store Precedent**: The `/compose/pulse/apps/mcp/server/storage/` directory already contains a `TokenStore` interface with Postgres/Redis/Filesystem implementations. This pattern can be replicated for resource storage.

**Recommended Investigation**:
- Review `apps/mcp/server/storage/postgres-store.ts` for schema patterns
- Analyze query patterns: cache hits use `findByUrlAndExtract()` heavily (needs index on `url + extraction_prompt`)
- Profile current memory usage to estimate database row size (avg ~50KB per resource based on default 100MB / 1000 items)
- Test write performance: scrape pipeline writes 1-3 resources per scrape (need <100ms p95 latency)

**Migration Path**:
1. Create new `DatabaseResourceStorage` class implementing `ResourceStorage` interface
2. Add `database` option to `ResourceStorageFactory`
3. Define Postgres schema with indexes on `uri`, `url`, `resource_type`, `timestamp`
4. Implement JSONB-based `findByUrlAndExtract()` query
5. Test with existing scrape pipeline (no code changes needed outside storage layer)
6. Add migration script to copy filesystem resources to database (one-time conversion)
