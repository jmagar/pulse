# Merge Plan: pulse-fetch + fc-bridge Integration

**Date:** 2025-11-08
**Author:** Claude Code
**Status:** Planning Phase

---

## Executive Summary

This document outlines a comprehensive plan to merge the `pulse-fetch` MCP server (TypeScript) with the `fc-bridge` semantic search service (Python/FastAPI) into a unified repository. The merged system will provide intelligent web content acquisition with semantic search, embeddings, and vector storage capabilities.

**Key Goals:**

1. Combine pulse-fetch's scraping/caching with fc-bridge's semantic search
2. Add vector search capabilities to the MCP server
3. Maintain backward compatibility with existing deployments
4. Preserve test coverage and documentation quality
5. Enable unified deployment and configuration

---

## Repository Comparison

### pulse-fetch (Current State)

**Technology:** TypeScript, Node.js 20+, MCP SDK
**Architecture:** 3-layer (shared/local/remote)
**Core Features:**

- 4 MCP tools: scrape, map, crawl, search
- Multi-strategy scraping (native → Firecrawl fallback)
- HTML → Markdown cleaning
- LLM extraction (Anthropic, OpenAI)
- Multi-tier caching (raw/cleaned/extracted)
- Dual transports (stdio for Claude Desktop, HTTP for remote)

**Storage:**

- Memory backend (fast, ephemeral)
- Filesystem backend (persistent, debuggable)
- Multi-dimensional cache keys (URL + extract query)

**Deployment:**

- Port 3060 (remote HTTP server)
- Docker Compose ready
- Health checks, metrics

**Testing:** 644 test cases across functional, integration, e2e, manual

### fc-bridge (Current State)

**Technology:** Python 3.13, FastAPI, Uvicorn
**Architecture:** Microservice with background workers
**Core Features:**

- Firecrawl webhook receiver (HMAC-verified)
- Token-based text chunking (256 tokens, 50 overlap)
- HuggingFace TEI embeddings (1024-dim Qwen3)
- Qdrant vector storage
- BM25 keyword search
- Hybrid search (RRF fusion)

**Storage:**

- Qdrant: Vector database for semantic search
- Redis: Job queue (RQ) for async processing
- PostgreSQL: Timing metrics
- Pickle files: BM25 index persistence

**Deployment:**

- Port 52100 (FastAPI API)
- Background worker process
- External services: Qdrant (qdrant.tootie.tv), TEI (tei.tootie.tv), Redis (10.1.0.6:4303)

**Testing:** Comprehensive unit and integration tests

---

## Integration Architecture

### Proposed Unified System

```
pulse-fetch-unified/
├── typescript/              # TypeScript components (MCP server)
│   ├── shared/             # Core MCP tools and business logic
│   ├── local/              # Stdio transport (Claude Desktop)
│   └── remote/             # HTTP transport (remote MCP)
│
├── python/                 # Python components (semantic search)
│   ├── api/                # FastAPI REST API
│   ├── worker/             # Background job processor
│   ├── services/           # Embeddings, Qdrant, BM25
│   └── shared/             # Shared utilities
│
├── shared-config/          # Cross-language configuration
│   ├── docker-compose.yml  # Unified orchestration
│   ├── .env.example        # Complete environment template
│   └── ports.md            # Port allocation registry
│
├── docs/                   # Unified documentation
├── tests/                  # Cross-system integration tests
└── scripts/                # Build and deployment scripts
```

### Service Communication Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     MCP Client                               │
│              (Claude Desktop, VSCode, etc.)                  │
└────────────────────┬────────────────────────────────────────┘
                     │ stdio or HTTP
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              pulse-fetch MCP Server (TypeScript)             │
│  ┌──────────┬──────────┬──────────┬──────────┬──────────┐  │
│  │ scrape   │   map    │  crawl   │  search  │ vsearch  │  │
│  │  tool    │   tool   │   tool   │   tool   │  tool    │  │
│  └────┬─────┴────┬─────┴────┬─────┴────┬─────┴────┬─────┘  │
│       │          │          │          │          │         │
│       │  ┌───────▼──────────▼──────────▼──────────▼─────┐  │
│       │  │   Resource Storage (FS/Memory/Qdrant)       │  │
│       │  └────────────────────────────────────────────┬─┘  │
│       │                                               │     │
│       │  For semantic search:                         │     │
│       └──────────────────────┐                        │     │
│                              ▼                        │     │
│                    ┌─────────────────┐                │     │
│                    │ HTTP Client     │                │     │
│                    │ to Python API   │                │     │
│                    └────────┬────────┘                │     │
└─────────────────────────────┼─────────────────────────┼─────┘
                              │                         │
                              ▼                         │
┌─────────────────────────────────────────────────────────────┐
│        fc-bridge Semantic Search API (Python/FastAPI)       │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  POST /api/search                                     │  │
│  │  - Vector search via Qdrant                          │  │
│  │  - BM25 keyword search                               │  │
│  │  - Hybrid RRF fusion                                 │  │
│  └────────┬─────────────────────────────────────────────┘  │
│           │                                                 │
│  ┌────────▼─────────────────────────────────────────────┐  │
│  │  POST /api/webhook/firecrawl                         │  │
│  │  - Receive scraped content                           │  │
│  │  - Queue for embedding                               │  │
│  └────────┬─────────────────────────────────────────────┘  │
│           │                                                 │
│           ▼                                                 │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Background Worker (RQ)                              │  │
│  │  - Token-based chunking                              │  │
│  │  - Batch embedding via TEI                           │  │
│  │  - Index in Qdrant + BM25                            │  │
│  └──┬───────────────────────┬───────────────────────────┘  │
└─────┼───────────────────────┼──────────────────────────────┘
      │                       │
      ▼                       ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   Qdrant     │    │  HF TEI      │    │   Redis      │
│ Vector Store │    │ Embeddings   │    │  Job Queue   │
└──────────────┘    └──────────────┘    └──────────────┘
```

---

## Proposed Repository Structure

### Directory Layout

```
pulse-fetch/  (unified repository)
├── typescript/
│   ├── shared/
│   │   ├── src/
│   │   │   ├── mcp/
│   │   │   │   ├── tools/
│   │   │   │   │   ├── scrape/
│   │   │   │   │   ├── map/
│   │   │   │   │   ├── crawl/
│   │   │   │   │   ├── search/
│   │   │   │   │   └── vsearch/        # NEW: Vector search tool
│   │   │   │   └── registration.ts
│   │   │   ├── clients/
│   │   │   │   ├── firecrawl/
│   │   │   │   └── semantic-search/    # NEW: Python API client
│   │   │   ├── storage/
│   │   │   │   ├── resources/
│   │   │   │   │   ├── backends/
│   │   │   │   │   │   ├── memory.ts
│   │   │   │   │   │   ├── filesystem.ts
│   │   │   │   │   │   └── qdrant.ts   # NEW: Qdrant backend
│   │   │   │   │   └── factory.ts
│   │   │   └── processing/
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── local/
│   │   ├── src/
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── remote/
│       ├── src/
│       │   ├── index.ts
│       │   └── server.ts
│       ├── package.json
│       └── tsconfig.json
│
├── python/
│   ├── api/                            # From fc-bridge
│   │   ├── __init__.py
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── models.py
│   │   ├── routes.py
│   │   ├── dependencies.py
│   │   └── middleware/
│   │
│   ├── worker/                         # From fc-bridge
│   │   ├── __init__.py
│   │   └── worker.py
│   │
│   ├── services/                       # From fc-bridge
│   │   ├── __init__.py
│   │   ├── embedding.py
│   │   ├── vector_store.py
│   │   ├── bm25_engine.py
│   │   ├── indexing.py
│   │   ├── search.py
│   │   └── webhook_handlers.py
│   │
│   ├── utils/                          # From fc-bridge
│   │   ├── __init__.py
│   │   ├── text_processing.py
│   │   ├── logging.py
│   │   └── timing.py
│   │
│   ├── database/                       # From fc-bridge
│   │   ├── __init__.py
│   │   ├── models.py
│   │   └── migrations/
│   │
│   ├── pyproject.toml
│   └── uv.lock
│
├── shared-config/
│   ├── docker-compose.yml              # Unified composition
│   ├── docker-compose.dev.yml          # Development overrides
│   ├── .env.example                    # Complete template
│   ├── nginx.conf                      # Reverse proxy (optional)
│   └── ports.md                        # Port registry
│
├── docs/
│   ├── architecture/
│   │   ├── OVERVIEW.md
│   │   ├── MCP_SERVER.md               # TypeScript components
│   │   ├── SEMANTIC_SEARCH.md          # Python components
│   │   └── INTEGRATION.md              # How they work together
│   ├── deployment/
│   │   ├── DOCKER.md
│   │   ├── KUBERNETES.md               # Future
│   │   └── SERVICES.md
│   ├── tools/
│   │   ├── SCRAPE.md
│   │   ├── VSEARCH.md                  # NEW: Vector search
│   │   └── ...
│   └── development/
│       ├── CONTRIBUTING.md
│       ├── TESTING.md
│       └── DEBUGGING.md
│
├── tests/
│   ├── integration/                    # Cross-system tests
│   │   ├── test_scrape_and_index.ts
│   │   ├── test_vsearch_e2e.ts
│   │   └── test_webhook_to_mcp.ts
│   └── performance/
│       └── test_embedding_throughput.ts
│
├── scripts/
│   ├── setup-dev.sh                    # Initialize dev environment
│   ├── build-all.sh                    # Build both TypeScript and Python
│   ├── test-all.sh                     # Run all tests
│   ├── migrate-data.py                 # Data migration utilities
│   └── health-check.sh                 # Check all services
│
├── .github/
│   └── workflows/
│       ├── ci.yml                      # Combined CI for both languages
│       ├── test-typescript.yml
│       └── test-python.yml
│
├── .docs/
│   ├── sessions/
│   ├── deployment-log.md
│   └── services-ports.md
│
├── README.md                           # Unified project overview
├── ARCHITECTURE.md                     # High-level architecture
├── CLAUDE.md                           # Combined AI assistant context
├── package.json                        # Root package (workspaces)
├── .gitignore                          # Combined patterns
└── .env.example                        # Complete environment template
```

---

## Technology Stack Strategy

### Dual-Language Approach

**Why maintain both TypeScript and Python:**

1. **TypeScript (MCP Server):**
   - MCP SDK is TypeScript-native
   - Excellent async/await patterns for I/O
   - Strong typing for tool schemas
   - Easy integration with Claude Desktop/VSCode

2. **Python (Semantic Search):**
   - Superior ML/AI ecosystem (HuggingFace, NumPy, PyTorch)
   - FastAPI for high-performance async APIs
   - Better ML tooling (tokenizers, embeddings, vector ops)
   - Existing fc-bridge production code

### Communication Protocol

**TypeScript → Python:** HTTP REST API

- TypeScript MCP tools call Python FastAPI endpoints
- JSON request/response (Zod validation on TS side, Pydantic on Python side)
- Retry logic with exponential backoff
- Health checks before operations

**Example Flow:**

```typescript
// In vsearch tool (TypeScript)
const response = await httpClient.post('http://localhost:52100/api/search', {
  query: 'machine learning algorithms',
  mode: 'hybrid',
  limit: 10,
  filters: { domain: 'arxiv.org', language: 'en' },
});
```

### Shared Configuration

**Environment Variables:**

- Single `.env` file with sections:
  - `[MCP Server]` - TypeScript configuration
  - `[Python API]` - FastAPI configuration
  - `[Shared Services]` - Qdrant, TEI, Redis, PostgreSQL

**Port Allocation:**

- 3060: pulse-fetch MCP remote server (HTTP transport)
- 52100: fc-bridge Python API
- 52101: Redis (job queue)
- 52102: Qdrant HTTP API
- 52103: Qdrant gRPC API
- 52104: HuggingFace TEI server

---

## Storage Layer Integration

### Current State Analysis

**pulse-fetch Storage:**

- Interface: `ResourceStorage` (read, write, writeMulti, list, findByUrl)
- Backends: Memory, Filesystem
- Multi-tier: raw/cleaned/extracted
- Cache keys: URL + extractionPrompt

**fc-bridge Storage:**

- Qdrant: Vector database with 1024-dim embeddings
- BM25: In-memory keyword search index
- Redis: Job queue
- PostgreSQL: Timing metrics

### Integration Strategy

#### Option 1: Qdrant as Primary Backend (Recommended)

**New ResourceStorage Implementation:**

```typescript
// typescript/shared/src/storage/resources/backends/qdrant.ts
export class QdrantResourceStorage implements ResourceStorage {
  private qdrantClient: QdrantClient;
  private pythonApiClient: SemanticSearchClient;

  constructor(config: QdrantConfig) {
    this.qdrantClient = new QdrantClient({ url: config.qdrantUrl });
    this.pythonApiClient = new SemanticSearchClient({ baseUrl: config.pythonApiUrl });
  }

  async write(url: string, content: string, metadata?: ResourceMetadata): Promise<string> {
    // 1. Send to Python API for embedding and indexing
    const indexResponse = await this.pythonApiClient.indexDocument({
      url,
      markdown: content,
      ...metadata,
    });

    // 2. Store reference in Qdrant with metadata
    const uri = this.generateUri(url, metadata?.resourceType);
    await this.qdrantClient.upsert(COLLECTION_NAME, {
      id: uri,
      payload: {
        url,
        content,
        ...metadata,
        indexed: true,
        indexJobId: indexResponse.job_id,
      },
    });

    return uri;
  }

  async writeMulti(data: MultiResourceWrite): Promise<MultiResourceUris> {
    // Batch index all tiers via Python API
    const indexResponse = await this.pythonApiClient.indexDocument({
      url: data.url,
      markdown: data.raw,
      cleanedMarkdown: data.cleaned,
      extractedData: data.extracted,
      ...data.metadata,
    });

    // Generate URIs for all tiers
    return {
      raw: `qdrant://raw/${generateId(data.url)}`,
      cleaned: data.cleaned ? `qdrant://cleaned/${generateId(data.url)}` : undefined,
      extracted: data.extracted ? `qdrant://extracted/${generateId(data.url)}` : undefined,
    };
  }

  async read(uri: string): Promise<ResourceContent> {
    const point = await this.qdrantClient.retrieve(COLLECTION_NAME, [uri]);
    return {
      uri,
      text: point[0].payload.content,
      mimeType: point[0].payload.contentType,
    };
  }

  async findByUrl(url: string): Promise<ResourceData[]> {
    // Query Qdrant by URL filter
    const results = await this.qdrantClient.scroll(COLLECTION_NAME, {
      filter: {
        must: [{ key: 'url', match: { value: url } }],
      },
    });

    return results.points.map((p) => ({
      uri: p.id,
      name: p.payload.title || url,
      metadata: p.payload,
    }));
  }

  async findByUrlAndExtract(url: string, extractPrompt?: string): Promise<ResourceData[]> {
    // Semantic search by embedding the extract query
    if (extractPrompt) {
      const searchResponse = await this.pythonApiClient.search({
        query: extractPrompt,
        filters: { url },
        mode: 'semantic',
        limit: 10,
      });

      return searchResponse.results.map((r) => ({
        uri: r.id,
        name: r.payload.title,
        metadata: r.payload,
      }));
    }

    // Fallback to URL-only lookup
    return this.findByUrl(url);
  }
}
```

**Benefits:**

- Unified storage across both systems
- Semantic search capabilities in MCP server
- Automatic embedding of cached content
- Efficient vector similarity for cache lookups

**Challenges:**

- Requires Python API to be running for storage operations
- More complex than file-based storage
- Need health checks and fallback strategies

#### Option 2: Hybrid Storage (Filesystem + Qdrant)

**Strategy:**

- Use **Filesystem** for primary storage (raw/cleaned/extracted tiers)
- **Optionally** index in Qdrant for semantic search
- Python API reads from filesystem to index documents

**Benefits:**

- Simpler storage model (no Python API dependency for basic ops)
- Filesystem remains source of truth
- Qdrant is enhancement, not requirement

**Implementation:**

```typescript
async writeMulti(data: MultiResourceWrite): Promise<MultiResourceUris> {
  // 1. Write to filesystem (existing implementation)
  const uris = await this.filesystemStorage.writeMulti(data);

  // 2. Optionally index in Qdrant (fire-and-forget)
  if (this.config.enableSemanticSearch) {
    this.pythonApiClient.indexDocument({
      url: data.url,
      markdown: data.raw,
      ...data.metadata
    }).catch(err => {
      logger.warn('Failed to index in Qdrant', err);
      // Don't fail storage operation
    });
  }

  return uris;
}
```

#### Recommended Approach: Hybrid with Smart Routing

**Configuration-based backend selection:**

```bash
# .env
MCP_RESOURCE_STORAGE=hybrid
MCP_RESOURCE_PRIMARY=filesystem
MCP_RESOURCE_SECONDARY=qdrant
ENABLE_SEMANTIC_SEARCH=true
```

**Behavior:**

- **Writes:** Save to filesystem first, then async index to Qdrant
- **Reads:** Filesystem for simple URI lookups
- **Semantic queries:** Use Qdrant via Python API
- **Fallback:** If Qdrant unavailable, degrade gracefully to filesystem-only

---

## Service Integration Plan

### New MCP Tool: `vsearch` (Vector Search)

**Purpose:** Semantic search over previously scraped content

**Input Schema:**

```typescript
{
  query: string;              // Natural language query
  mode?: 'semantic' | 'keyword' | 'hybrid';  // Default: hybrid
  limit?: number;             // Max results (default: 10)
  filters?: {
    domain?: string;          // Filter by domain
    language?: string;        // ISO language code
    country?: string;         // ISO country code
    isMobile?: boolean;       // Mobile content only
  };
  alpha?: number;             // Hybrid search weight (0=keyword, 1=semantic)
}
```

**Output:**

```typescript
{
  content: [
    {
      type: 'text',
      text: "Found 5 results for 'machine learning'\n\n1. Title: Introduction to ML\n   URL: https://example.com/ml-intro\n   Relevance: 0.92\n   Snippet: Machine learning is...\n\n2. ...",
    },
  ];
}
```

**Implementation:**

```typescript
// typescript/shared/src/mcp/tools/vsearch/handler.ts
export async function vsearchHandler(args: VSearchArgs): Promise<ToolResponse> {
  const semanticClient = getSemanticSearchClient();

  // Call Python API for semantic search
  const searchResponse = await semanticClient.search({
    query: args.query,
    mode: args.mode || 'hybrid',
    limit: args.limit || 10,
    domain: args.filters?.domain,
    language: args.filters?.language,
    country: args.filters?.country,
    is_mobile: args.filters?.isMobile,
    alpha: args.alpha,
  });

  // Format results as MCP response
  return {
    content: [
      {
        type: 'text',
        text: formatSearchResults(searchResponse),
      },
    ],
  };
}
```

### Enhanced Scrape Tool Integration

**Auto-indexing scraped content:**

```typescript
// typescript/shared/src/mcp/tools/scrape/pipeline.ts
async function saveToStorage(
  scrapedContent: ScrapedContent,
  processedContent: ProcessedContent,
  options: ScrapeOptions
): Promise<MultiResourceUris> {
  // Save to storage (filesystem/memory/qdrant)
  const uris = await storage.writeMulti({
    url: options.url,
    raw: scrapedContent.content,
    cleaned: processedContent.cleaned,
    extracted: processedContent.extracted,
    metadata: {
      source: scrapedContent.source,
      timestamp: new Date().toISOString(),
      ...options.metadata,
    },
  });

  // If Qdrant backend enabled, content is automatically indexed
  // via writeMulti() implementation calling Python API

  return uris;
}
```

### Webhook Integration

**Two approaches:**

#### Approach 1: Python API Continues Receiving Webhooks

- Firecrawl sends webhooks to Python API (`POST /api/webhook/firecrawl`)
- Python API indexes content into Qdrant + BM25
- MCP server queries via `vsearch` tool

**Benefits:**

- Minimal changes to existing webhook setup
- Python API handles all indexing complexity
- Clean separation of concerns

#### Approach 2: MCP Server as Webhook Proxy

- Firecrawl sends webhooks to MCP remote server
- MCP server saves to storage (which calls Python API)
- Enables MCP-side processing before indexing

**Benefits:**

- Centralized webhook management
- Can apply MCP-side transformations
- Unified resource tracking

**Recommendation:** Approach 1 (simpler, less risky)

---

## Migration Strategy

### Phase 1: Repository Setup (Week 1)

**Tasks:**

1. Create new repository structure
2. Move fc-bridge to `python/` directory
3. Keep existing pulse-fetch TypeScript in `typescript/`
4. Create `shared-config/` for Docker Compose and env templates
5. Update all relative imports and build paths
6. Verify independent operation of both systems

**Validation:**

- [ ] TypeScript tests pass
- [ ] Python tests pass
- [ ] Both can build independently
- [ ] Docker Compose starts both services

### Phase 2: Storage Integration (Week 2)

**Tasks:**

1. Implement `QdrantResourceStorage` backend in TypeScript
2. Create `SemanticSearchClient` for Python API communication
3. Add configuration for hybrid storage mode
4. Implement health checks and fallback logic
5. Test storage operations with Qdrant backend

**Validation:**

- [ ] Can write to Qdrant from TypeScript
- [ ] Can read from Qdrant from TypeScript
- [ ] Multi-tier writes work correctly
- [ ] Fallback to filesystem works when Qdrant unavailable

### Phase 3: Vector Search Tool (Week 3)

**Tasks:**

1. Implement `vsearch` MCP tool
2. Create input/output schemas
3. Integrate with Python API search endpoint
4. Add result formatting and pagination
5. Write comprehensive tests

**Validation:**

- [ ] `vsearch` tool registered in MCP server
- [ ] Can perform semantic, keyword, and hybrid searches
- [ ] Filtering by domain/language/country works
- [ ] Results formatted correctly for MCP clients

### Phase 4: Auto-Indexing Integration (Week 4)

**Tasks:**

1. Modify scrape tool to auto-index when using Qdrant backend
2. Add configuration flag for enabling/disabling auto-indexing
3. Test indexing pipeline end-to-end
4. Verify embeddings generation and storage

**Validation:**

- [ ] Scraped content automatically indexed in Qdrant
- [ ] Can search for recently scraped content
- [ ] Chunking and embedding work correctly
- [ ] BM25 index updated alongside vector index

### Phase 5: Documentation & Testing (Week 5)

**Tasks:**

1. Write comprehensive integration documentation
2. Create cross-system integration tests
3. Update all READMEs and architecture docs
4. Create deployment guides
5. Performance testing and optimization

**Validation:**

- [ ] All documentation up to date
- [ ] Integration tests pass
- [ ] Performance benchmarks met
- [ ] Deployment guides validated

### Phase 6: Production Deployment (Week 6)

**Tasks:**

1. Create production Docker Compose configuration
2. Set up monitoring and logging
3. Deploy to staging environment
4. Run smoke tests and load tests
5. Deploy to production
6. Monitor for issues

**Validation:**

- [ ] Staging deployment successful
- [ ] Load tests pass
- [ ] Production deployment successful
- [ ] No regressions in existing functionality

---

## Docker & Deployment Strategy

### Unified Docker Compose

```yaml
# shared-config/docker-compose.yml
version: '3.9'

services:
  # MCP Server (TypeScript) - Remote HTTP transport
  mcp-server:
    build:
      context: ../typescript
      dockerfile: Dockerfile
    ports:
      - '3060:3060'
    environment:
      - NODE_ENV=production
      - MCP_RESOURCE_STORAGE=qdrant
      - PYTHON_API_URL=http://semantic-search:52100
      - FIRECRAWL_API_KEY=${FIRECRAWL_API_KEY}
      - LLM_PROVIDER=${LLM_PROVIDER}
      - LLM_API_KEY=${LLM_API_KEY}
    depends_on:
      - semantic-search
    healthcheck:
      test: ['CMD', 'wget', '-q', '--spider', 'http://localhost:3060/health']
      interval: 30s
      timeout: 3s
      retries: 3
    restart: unless-stopped

  # Semantic Search API (Python)
  semantic-search:
    build:
      context: ../python
      dockerfile: Dockerfile
    ports:
      - '52100:52100'
    environment:
      - SEARCH_BRIDGE_HOST=0.0.0.0
      - SEARCH_BRIDGE_PORT=52100
      - SEARCH_BRIDGE_REDIS_URL=redis://redis:6379
      - SEARCH_BRIDGE_QDRANT_URL=http://qdrant:6333
      - SEARCH_BRIDGE_TEI_URL=http://tei:80
      - SEARCH_BRIDGE_DATABASE_URL=${POSTGRES_URL}
      - SEARCH_BRIDGE_API_SECRET=${API_SECRET}
      - SEARCH_BRIDGE_WEBHOOK_SECRET=${WEBHOOK_SECRET}
    depends_on:
      - redis
      - qdrant
      - tei
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:52100/health']
      interval: 30s
      timeout: 3s
      retries: 3
    restart: unless-stopped

  # Background Worker (Python)
  worker:
    build:
      context: ../python
      dockerfile: Dockerfile
    command: python -m app.worker
    environment:
      - SEARCH_BRIDGE_REDIS_URL=redis://redis:6379
      - SEARCH_BRIDGE_QDRANT_URL=http://qdrant:6333
      - SEARCH_BRIDGE_TEI_URL=http://tei:80
    depends_on:
      - redis
      - qdrant
      - tei
    restart: unless-stopped

  # Redis (Job Queue)
  redis:
    image: redis:7-alpine
    ports:
      - '52101:6379'
    volumes:
      - redis-data:/data
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 10s
      timeout: 3s
      retries: 3
    restart: unless-stopped

  # Qdrant (Vector Database)
  qdrant:
    image: qdrant/qdrant:v1.8.0
    ports:
      - '52102:6333' # HTTP API
      - '52103:6334' # gRPC API
    volumes:
      - qdrant-data:/qdrant/storage
    environment:
      - QDRANT__SERVICE__GRPC_PORT=6334
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:6333/healthz']
      interval: 30s
      timeout: 3s
      retries: 3
    restart: unless-stopped

  # HuggingFace TEI (Text Embeddings Inference)
  tei:
    image: ghcr.io/huggingface/text-embeddings-inference:1.8
    ports:
      - '52104:80'
    volumes:
      - tei-data:/data
    environment:
      - MODEL_ID=Qwen/Qwen3-Embedding-0.6B
      - MAX_BATCH_TOKENS=16384
      - MAX_CLIENT_BATCH_SIZE=512
    command:
      - --model-id
      - Qwen/Qwen3-Embedding-0.6B
      - --port
      - '80'
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:80/health']
      interval: 30s
      timeout: 10s
      retries: 3
    restart: unless-stopped

  # PostgreSQL (Optional - for timing metrics)
  postgres:
    image: postgres:16-alpine
    ports:
      - '5432:5432'
    environment:
      - POSTGRES_USER=pulse
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
      - POSTGRES_DB=pulse_unified
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD', 'pg_isready', '-U', 'pulse']
      interval: 10s
      timeout: 3s
      retries: 3
    restart: unless-stopped

volumes:
  redis-data:
  qdrant-data:
  tei-data:
  postgres-data:

networks:
  default:
    name: pulse-unified-network
```

### Environment Configuration

```bash
# shared-config/.env.example

# ==================== MCP Server (TypeScript) ====================
NODE_ENV=production
MCP_RESOURCE_STORAGE=qdrant          # memory | filesystem | qdrant
MCP_RESOURCE_FILESYSTEM_ROOT=/app/resources
PYTHON_API_URL=http://semantic-search:52100

# Firecrawl
FIRECRAWL_API_KEY=your-firecrawl-api-key
FIRECRAWL_BASE_URL=https://api.firecrawl.dev

# LLM Extraction
LLM_PROVIDER=anthropic               # anthropic | openai | openai-compatible
LLM_API_KEY=your-llm-api-key
LLM_MODEL=claude-sonnet-4-20250514   # Optional override

# Strategy Optimization
OPTIMIZE_FOR=cost                    # cost | speed

# ==================== Python API (Semantic Search) ====================
SEARCH_BRIDGE_HOST=0.0.0.0
SEARCH_BRIDGE_PORT=52100
SEARCH_BRIDGE_API_SECRET=change-this-secret-key
SEARCH_BRIDGE_WEBHOOK_SECRET=change-this-webhook-secret

# External Services
SEARCH_BRIDGE_REDIS_URL=redis://redis:6379
SEARCH_BRIDGE_QDRANT_URL=http://qdrant:6333
SEARCH_BRIDGE_QDRANT_COLLECTION=firecrawl_docs
SEARCH_BRIDGE_QDRANT_TIMEOUT=60.0
SEARCH_BRIDGE_TEI_URL=http://tei:80
SEARCH_BRIDGE_DATABASE_URL=postgresql+asyncpg://pulse:${POSTGRES_PASSWORD}@postgres:5432/pulse_unified

# Vector Configuration
SEARCH_BRIDGE_VECTOR_DIM=1024
SEARCH_BRIDGE_EMBEDDING_MODEL=Qwen/Qwen3-Embedding-0.6B

# Chunking (TOKEN-BASED!)
SEARCH_BRIDGE_MAX_CHUNK_TOKENS=256
SEARCH_BRIDGE_CHUNK_OVERLAP_TOKENS=50

# Search Configuration
SEARCH_BRIDGE_HYBRID_ALPHA=0.5       # 0=BM25 only, 1=vector only
SEARCH_BRIDGE_RRF_K=60               # RRF constant

# CORS (NEVER use "*" in production!)
SEARCH_BRIDGE_CORS_ORIGINS=http://localhost:3000

# ==================== Shared Services ====================
POSTGRES_PASSWORD=secure-password-here

# ==================== Feature Flags ====================
ENABLE_SEMANTIC_SEARCH=true
ENABLE_AUTO_INDEXING=true
SKIP_HEALTH_CHECKS=false
DEBUG=false
```

---

## Testing Strategy

### Test Organization

```
tests/
├── typescript/                  # TypeScript unit & integration
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
├── python/                      # Python unit & integration
│   ├── unit/
│   ├── integration/
│   └── functional/
│
└── cross-system/                # NEW: Cross-language integration
    ├── test_scrape_and_index/
    │   ├── test_scrape_indexes_in_qdrant.ts
    │   └── test_indexed_content_searchable.ts
    │
    ├── test_vsearch/
    │   ├── test_vsearch_semantic.ts
    │   ├── test_vsearch_hybrid.ts
    │   └── test_vsearch_filters.ts
    │
    ├── test_storage/
    │   ├── test_qdrant_backend.ts
    │   └── test_storage_fallback.ts
    │
    └── test_webhook_integration/
        ├── test_webhook_to_mcp_resources.py
        └── test_webhook_searchable_via_mcp.ts
```

### Test Scenarios

**1. Scrape → Index → Search Flow:**

```typescript
// tests/cross-system/test_scrape_and_index/test_full_flow.ts
describe('Scrape and Index Integration', () => {
  it('should scrape, auto-index, and enable vector search', async () => {
    // 1. Scrape a page via MCP tool
    const scrapeResult = await mcpClient.callTool('scrape', {
      url: 'https://example.com/article',
    });

    // 2. Wait for async indexing (or query indexing API)
    await waitForIndexing(scrapeResult.uris.raw, { timeout: 30000 });

    // 3. Search via vsearch tool
    const searchResult = await mcpClient.callTool('vsearch', {
      query: 'machine learning algorithms',
      filters: { domain: 'example.com' },
    });

    // 4. Verify scraped content in results
    expect(searchResult.content[0].text).toContain('example.com/article');
  });
});
```

**2. Webhook → MCP Resource Flow:**

```python
# tests/cross-system/test_webhook_integration/test_webhook_to_mcp.py
async def test_webhook_creates_mcp_resource():
    # 1. Send Firecrawl webhook
    webhook_payload = {
        "type": "crawl.page",
        "id": "test-crawl",
        "data": [{
            "markdown": "# Test Page",
            "metadata": {"url": "https://test.com"}
        }]
    }

    response = await api_client.post('/api/webhook/firecrawl', json=webhook_payload)
    assert response.status_code == 202

    # 2. Wait for worker to process
    await asyncio.sleep(5)

    # 3. Query MCP server for resource
    mcp_resources = await mcp_client.list_resources()
    assert any(r['uri'].endswith('test.com') for r in mcp_resources)
```

**3. Storage Backend Tests:**

```typescript
// tests/cross-system/test_storage/test_qdrant_backend.ts
describe('Qdrant Storage Backend', () => {
  it('should write and read from Qdrant', async () => {
    const storage = await ResourceStorageFactory.create();

    const uri = await storage.write('https://example.com', 'content', {
      resourceType: 'raw',
    });

    const resource = await storage.read(uri);
    expect(resource.text).toBe('content');
  });

  it('should fallback to filesystem when Qdrant unavailable', async () => {
    // Stop Qdrant service
    await stopQdrantContainer();

    const storage = await ResourceStorageFactory.create();

    // Should still work via filesystem fallback
    const uri = await storage.write('https://example.com', 'content');
    expect(uri).toMatch(/^file:\/\//);

    // Restart Qdrant
    await startQdrantContainer();
  });
});
```

### CI/CD Pipeline

```yaml
# .github/workflows/ci.yml
name: CI/CD

on: [push, pull_request]

jobs:
  test-typescript:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: cd typescript && npm ci
      - run: cd typescript && npm run build
      - run: cd typescript && npm test

  test-python:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.13'
      - run: cd python && pip install uv
      - run: cd python && uv pip install -r pyproject.toml
      - run: cd python && pytest

  test-integration:
    runs-on: ubuntu-latest
    needs: [test-typescript, test-python]
    steps:
      - uses: actions/checkout@v4
      - name: Start services
        run: docker-compose -f shared-config/docker-compose.yml up -d
      - name: Wait for services
        run: ./scripts/health-check.sh
      - name: Run integration tests
        run: npm run test:integration
      - name: Cleanup
        run: docker-compose -f shared-config/docker-compose.yml down
```

---

## Risk Assessment

### High Risk Areas

1. **Storage Backend Migration**
   - **Risk:** Data loss or corruption during migration to Qdrant
   - **Mitigation:** Hybrid storage with filesystem as source of truth, async indexing

2. **Service Dependency**
   - **Risk:** MCP server requires Python API to be running
   - **Mitigation:** Health checks, fallback to filesystem-only mode, clear error messages

3. **Performance Degradation**
   - **Risk:** HTTP calls to Python API add latency
   - **Mitigation:** Async indexing, caching, performance benchmarks

4. **Breaking Changes**
   - **Risk:** Existing users affected by architecture changes
   - **Mitigation:** Backward compatibility, feature flags, comprehensive migration guide

### Medium Risk Areas

1. **Configuration Complexity**
   - **Risk:** Too many environment variables, confusing setup
   - **Mitigation:** Sane defaults, comprehensive .env.example, validation

2. **Testing Coverage**
   - **Risk:** Integration bugs due to cross-language interactions
   - **Mitigation:** Comprehensive cross-system tests, CI/CD validation

3. **Docker Orchestration**
   - **Risk:** Services start in wrong order, health checks fail
   - **Mitigation:** Proper depends_on, health checks, startup scripts

### Low Risk Areas

1. **Documentation Drift**
   - **Risk:** Docs become outdated as code evolves
   - **Mitigation:** Documentation in CI checks, PR templates

2. **Port Conflicts**
   - **Risk:** Port allocation conflicts on deployment
   - **Mitigation:** Clear port registry, configurable ports

---

## Implementation Timeline

### Week 1: Repository Setup

- [ ] Create unified repository structure
- [ ] Migrate fc-bridge to `python/`
- [ ] Update build configurations
- [ ] Verify independent operation
- [ ] Update CI/CD pipelines

### Week 2: Storage Integration

- [ ] Implement QdrantResourceStorage backend
- [ ] Create SemanticSearchClient
- [ ] Add hybrid storage mode
- [ ] Test storage operations
- [ ] Add health checks and fallbacks

### Week 3: Vector Search Tool

- [ ] Implement vsearch MCP tool
- [ ] Create schemas and validation
- [ ] Integrate with Python API
- [ ] Format search results
- [ ] Write comprehensive tests

### Week 4: Auto-Indexing

- [ ] Modify scrape tool for auto-indexing
- [ ] Add configuration flags
- [ ] Test end-to-end pipeline
- [ ] Verify embeddings and storage

### Week 5: Documentation & Testing

- [ ] Write integration documentation
- [ ] Create cross-system tests
- [ ] Update all READMEs
- [ ] Performance testing
- [ ] Optimization

### Week 6: Production Deployment

- [ ] Production Docker Compose
- [ ] Monitoring and logging setup
- [ ] Staging deployment
- [ ] Load testing
- [ ] Production deployment

---

## Success Criteria

### Functional Requirements

- [ ] All existing MCP tools continue working
- [ ] New vsearch tool provides semantic search
- [ ] Auto-indexing works for scraped content
- [ ] Hybrid storage mode operational
- [ ] Webhook integration functional

### Non-Functional Requirements

- [ ] <100ms latency for vsearch queries
- [ ] > 95% test coverage maintained
- [ ] Zero downtime deployment possible
- [ ] Documentation complete and accurate
- [ ] CI/CD pipeline green

### User Experience

- [ ] Simple setup with docker-compose up
- [ ] Clear error messages
- [ ] Graceful degradation when services unavailable
- [ ] Comprehensive debugging information

---

## Next Steps

1. **Review this plan** with stakeholders
2. **Prioritize features** based on user needs
3. **Create GitHub issues** for each phase
4. **Set up project board** for tracking
5. **Begin Week 1 implementation**

---

## Appendix

### A. Port Allocation Reference

| Port  | Service           | Protocol | Container Name  |
| ----- | ----------------- | -------- | --------------- |
| 3060  | MCP Remote Server | HTTP     | mcp-server      |
| 52100 | Python API        | HTTP     | semantic-search |
| 52101 | Redis             | TCP      | redis           |
| 52102 | Qdrant HTTP       | HTTP     | qdrant          |
| 52103 | Qdrant gRPC       | gRPC     | qdrant          |
| 52104 | TEI Embeddings    | HTTP     | tei             |
| 5432  | PostgreSQL        | TCP      | postgres        |

### B. Environment Variable Cross-Reference

| Purpose                | TypeScript Var         | Python Var               |
| ---------------------- | ---------------------- | ------------------------ |
| Storage backend        | MCP_RESOURCE_STORAGE   | N/A                      |
| Python API URL         | PYTHON_API_URL         | N/A                      |
| Qdrant URL             | N/A                    | SEARCH_BRIDGE_QDRANT_URL |
| TEI URL                | N/A                    | SEARCH_BRIDGE_TEI_URL    |
| Firecrawl API key      | FIRECRAWL_API_KEY      | N/A                      |
| LLM provider           | LLM_PROVIDER           | N/A                      |
| Vector dimensions      | N/A                    | SEARCH_BRIDGE_VECTOR_DIM |
| Enable semantic search | ENABLE_SEMANTIC_SEARCH | N/A                      |

### C. Migration Checklist

**Pre-Migration:**

- [ ] Backup all existing data
- [ ] Document current system state
- [ ] Verify all tests pass
- [ ] Review configuration

**During Migration:**

- [ ] Follow phase-by-phase plan
- [ ] Test after each phase
- [ ] Monitor for regressions
- [ ] Document issues encountered

**Post-Migration:**

- [ ] Verify all functionality
- [ ] Performance benchmarks
- [ ] Update all documentation
- [ ] Deploy to production
- [ ] Monitor metrics

---

**End of Merge Plan**
