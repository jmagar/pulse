# pulse & FC-Bridge Integration Plan

**Version:** 2.0
**Date:** 2025-11-08
**Status:** Planning Phase
**Architecture:** Python-First (All Firecrawl operations through Python)

---

## Executive Summary

This document outlines the comprehensive plan to merge **fc-bridge** (Firecrawl webhook server with semantic search) into **pulse** (MCP server for web scraping). The integration will create a unified, full-stack semantic search and scraping platform combining the best of both systems.

### Integration Goals

1. **Unified Repository**: Single monorepo with TypeScript (MCP tools) + Python (semantic search)
2. **Shared Services**: Consolidated Firecrawl, Qdrant, TEI, and Redis infrastructure
3. **Enhanced Capabilities**: Add semantic search, webhooks, and embeddings to pulse
4. **Maintained Compatibility**: Preserve existing MCP tool interfaces
5. **Production Ready**: Unified deployment, testing, and documentation

### Key Benefits

- **For Users**: Single installation, unified API, seamless semantic search
- **For Development**: Shared services, unified configuration, reduced duplication
- **For Operations**: Single deployment, unified monitoring, simplified maintenance

---

## Table of Contents

1. [Current State Analysis](#1-current-state-analysis)
2. [Target Architecture](#2-target-architecture)
3. [Integration Strategy](#3-integration-strategy)
4. [Repository Structure](#4-repository-structure)
5. [Technology Stack Alignment](#5-technology-stack-alignment)
6. [Service Integration](#6-service-integration)
7. [Storage Layer Integration](#7-storage-layer-integration)
8. [Embedding Pipeline Integration](#8-embedding-pipeline-integration)
9. [API & Tool Integration](#9-api--tool-integration)
10. [Configuration Management](#10-configuration-management)
11. [Docker & Deployment](#11-docker--deployment)
12. [Testing Strategy](#12-testing-strategy)
13. [Migration Plan](#13-migration-plan)
14. [Implementation Phases](#14-implementation-phases)
15. [Risk Assessment](#15-risk-assessment)
16. [Success Criteria](#16-success-criteria)

---

## 1. Current State Analysis

### 1.1 pulse (TypeScript MCP Server)

**Location:** `/home/jmagar/code/pulse`

**Architecture:**

- **Language:** TypeScript/Node.js 20+
- **Framework:** MCP SDK (Model Context Protocol)
- **Structure:** Monorepo with workspaces (shared/local/remote)
- **Transport:** Dual (stdio for local, HTTP for remote)

**Core Capabilities:**

- **4 MCP Tools:** scrape, map, crawl, search
- **Smart Scraping:** Multi-strategy fallback (native → Firecrawl)
- **Content Processing:** HTML cleaning, LLM extraction
- **Storage:** Memory + Filesystem backends (Qdrant planned)
- **LLM Integration:** Anthropic, OpenAI, OpenAI-compatible

**External Dependencies:**

- Firecrawl API (optional, for enhanced scraping)
- LLM providers (optional, for extraction)

**Current Limitations:**

- No vector embeddings or semantic search
- No webhook support for incoming data
- Storage limited to memory/filesystem
- No background job processing

### 1.2 FC-Bridge (Python Webhook Server)

**Location:** `/home/jmagar/code/fc-bridge`

**Architecture:**

- **Language:** Python 3.12+
- **Framework:** FastAPI + RQ (Redis Queue)
- **Structure:** Single package with services

**Core Capabilities:**

- **Firecrawl Webhooks:** Receives scraped documents via HMAC-verified webhooks
- **Semantic Search:** Hybrid search (vector + BM25) with RRF fusion
- **Embeddings:** HuggingFace TEI integration with token-based chunking
- **Vector Storage:** Qdrant database with rich metadata filtering
- **Background Processing:** Redis Queue for async indexing

**External Dependencies:**

- Firecrawl (webhook source)
- HuggingFace TEI (embedding generation)
- Qdrant (vector storage)
- Redis (job queue)
- PostgreSQL (metrics, optional)

**Current Limitations:**

- Not integrated with MCP ecosystem
- No direct scraping capabilities
- Relies on external Firecrawl for content
- No LLM extraction features

### 1.3 Overlap & Complementarity

**Shared Services:**

- ✅ Firecrawl API (both use for scraping)
- ✅ Qdrant (pulse planned, fc-bridge implemented)

**Complementary Features:**

| Feature         | pulse | FC-Bridge |
| --------------- | ----------- | --------- |
| MCP Tools       | ✅          | ❌        |
| Direct Scraping | ✅          | ❌        |
| Webhook Server  | ❌          | ✅        |
| Embeddings      | ❌          | ✅        |
| Vector Search   | ❌          | ✅        |
| BM25 Search     | ❌          | ✅        |
| Hybrid Search   | ❌          | ✅        |
| LLM Extraction  | ✅          | ❌        |
| Token Chunking  | ❌          | ✅        |

**Key Insight:** The projects are highly complementary with minimal duplication.

---

## 2. Target Architecture

### 2.1 Unified System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    pulse Unified Platform                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  MCP Server (TypeScript)                                 │  │
│  │  ┌────────────┬────────────┬────────────┬──────────────┐ │  │
│  │  │  Scrape    │    Map     │   Crawl    │   Search     │ │  │
│  │  │   Tool     │    Tool    │   Tool     │   Tool       │ │  │
│  │  └────────────┴────────────┴────────────┴──────────────┘ │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │  NEW: Semantic Search Tool (delegates to Python)   │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────┬───────────────────────────────┘  │
│                             │                                   │
│  ┌──────────────────────────▼───────────────────────────────┐  │
│  │  Python Services (FastAPI)                               │  │
│  │  ┌────────────────┬──────────────────┬─────────────────┐ │  │
│  │  │ Webhook Server │ Embedding Service│ Search Service  │ │  │
│  │  └────────────────┴──────────────────┴─────────────────┘ │  │
│  └──────────────────────────┬───────────────────────────────┘  │
│                             │                                   │
│  ┌──────────────────────────▼───────────────────────────────┐  │
│  │  Shared Infrastructure                                    │  │
│  │  ┌─────────┬─────────┬─────────┬─────────┬────────────┐  │  │
│  │  │Firecrawl│  Qdrant │   TEI   │  Redis  │ PostgreSQL │  │  │
│  │  └─────────┴─────────┴─────────┴─────────┴────────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Data Flow

**Scraping Flow (Push - via Webhook):**

```
Firecrawl Webhook → Python Webhook Server → Redis Queue →
Background Worker → [Chunk → Embed → Index] → Qdrant + BM25
```

**Scraping Flow (Pull - via MCP Tool):**

```
MCP Client → TypeScript MCP Tool → Python API → Firecrawl API →
[Scrape → Chunk → Embed → Index → Return Content]
```

**Key Change:** ALL MCP tools route through Python service to Firecrawl. Python owns the Firecrawl integration.

**Search Flow:**

```
MCP Client → Semantic Search Tool → Python Search Service →
[Embed Query → Vector Search (Qdrant) + BM25 Search → RRF Fusion] → Results
```

**LLM Extraction Flow:**

```
MCP Client → Scrape Tool → Python API → Firecrawl API →
Python [Clean Content] → TypeScript [LLM Extract] → Return to Client
```

**Note:** LLM extraction remains in TypeScript (Anthropic/OpenAI integration already exists)

### 2.3 Key Architectural Decisions

**Decision 1: Monorepo with Multi-Language Support**

- **Choice:** Extend pulse workspace with Python package
- **Rationale:** Maintains existing MCP structure, adds Python capabilities
- **Alternative Rejected:** Separate repositories (increases complexity)

**Decision 2: MCP as Primary Interface**

- **Choice:** Expose Python capabilities through MCP tools
- **Rationale:** Unified API for AI assistants, maintains compatibility
- **Alternative Rejected:** Dual APIs (confusing for users)

**Decision 3: Python for Backend-Heavy Processing**

- **Choice:** Keep Python for embeddings, webhooks, vector operations
- **Rationale:** Leverage existing HuggingFace/ML ecosystem
- **Alternative Rejected:** Rewrite in TypeScript (significant effort, worse ecosystem)

**Decision 4: Shared Service Layer**

- **Choice:** Single instances of Firecrawl, Qdrant, TEI, Redis
- **Rationale:** Resource efficiency, configuration simplicity
- **Alternative Rejected:** Separate instances (resource waste)

**Decision 5: Python-First Firecrawl Integration (CRITICAL)**

- **Choice:** ALL MCP tools route through Python service to access Firecrawl
- **Rationale:**
  - Single Firecrawl integration point (easier maintenance)
  - Automatic semantic indexing for all scraped content
  - Python owns webhooks, embeddings, and chunking - natural fit
  - Simpler architecture (one client, not two)
  - Python is core platform component (not optional)
- **Alternative Rejected:**
  - Dual integration (TypeScript + Python talk to Firecrawl separately)
  - Optional Python (adds complexity without benefit)
- **Impact:** Python service becomes required dependency (breaking change from v1)

---

## 3. Integration Strategy

### 3.1 Integration Approach: "Expand and Integrate"

**Phase 1: Repository Preparation**

- Migrate fc-bridge into pulse as `python/` workspace
- Preserve git history for both projects
- Update build systems for multi-language support

**Phase 2: Service Integration**

- Unify Docker Compose configuration
- Consolidate environment variables
- Share Firecrawl, Qdrant, TEI instances

**Phase 3: Storage Layer Integration**

- Implement Qdrant backend for pulse storage
- Migrate fc-bridge vector store to unified interface
- Unify storage configuration

**Phase 4: API Integration**

- Create new MCP tools that delegate to Python services
- Implement HTTP bridge between TypeScript and Python
- Add semantic search capabilities to existing tools

**Phase 5: Testing & Documentation**

- Create unified test suite
- Update documentation
- Migration guides for existing users

### 3.2 Integration Philosophy

**Unified Platform, Not Optional Services:**

- This is **pulse v2.0**: A complete rewrite of the architecture
- Python services are **required**, not optional add-ons
- fc-bridge merges into pulse as core infrastructure
- Users deploy the full platform (MCP + Python + services)

**Preserve MCP Tool Interface:**

- Keep tool names and input schemas identical (scrape, map, crawl, search)
- Add new semantic_search tool
- MCP clients see no breaking changes in tool signatures

**Python-First Processing:**

- Single Firecrawl integration point (Python only)
- TypeScript MCP tools become thin HTTP wrappers
- All scraping automatically indexes for semantic search
- Unified content processing pipeline

**Simplify, Don't Duplicate:**

- Remove TypeScript Firecrawl client (Python owns it)
- Remove TypeScript native scraping strategy (Python handles fallback)
- Single configuration, deployment, and monitoring system

---

## 4. Repository Structure

### 4.1 Proposed Directory Layout

```
pulse/                          # Main repository
├── shared/                           # TypeScript shared code (existing)
│   ├── mcp/                          # MCP registration
│   ├── clients/                      # REMOVED: Firecrawl (Python owns it)
│   │   └── python.ts                 # NEW: Python API client
│   ├── processing/                   # LLM extraction only
│   │   └── extraction/               # Anthropic, OpenAI integration
│   ├── storage/                      # Storage abstractions
│   │   └── resources/
│   │       └── backends/
│   │           ├── memory.ts         # Keep for local dev
│   │           ├── filesystem.ts     # Keep for debugging
│   │           └── qdrant.ts         # NEW: Qdrant backend (via Python)
│   └── utils/
│       └── http.ts                   # Shared HTTP utilities
│
├── local/                            # Stdio transport (existing)
├── remote/                           # HTTP transport (existing)
│
├── python/                           # NEW: Python services workspace (fc-bridge)
│   ├── pyproject.toml                # Python package config
│   ├── uv.lock                       # Dependency lockfile
│   ├── app/                          # FastAPI application
│   │   ├── main.py                   # FastAPI entry point
│   │   ├── config.py                 # Settings (Pydantic)
│   │   ├── worker.py                 # RQ background worker
│   │   │
│   │   ├── api/                      # API layer
│   │   │   ├── routes.py             # Endpoints
│   │   │   └── dependencies.py       # FastAPI deps
│   │   │
│   │   ├── services/                 # Business logic
│   │   │   ├── indexing.py           # Indexing orchestrator
│   │   │   ├── search.py             # Search orchestrator
│   │   │   ├── embedding.py          # TEI client
│   │   │   ├── vector_store.py       # Qdrant client
│   │   │   ├── bm25_engine.py        # BM25 search
│   │   │   └── webhook_handlers.py   # Firecrawl webhooks
│   │   │
│   │   └── utils/                    # Utilities
│   │       ├── text_processing.py    # Token chunking
│   │       └── logging.py            # Structured logging
│   │
│   ├── tests/                        # Python tests
│   │   ├── unit/
│   │   └── integration/
│   │
│   └── Dockerfile.python             # Python service image
│
├── tests/                            # TypeScript tests (existing)
├── docs/                             # Documentation (existing)
├── .docs/                            # Session logs (existing)
│
├── docker-compose.yml                # UNIFIED: All services
├── .env.example                      # UNIFIED: All variables
├── package.json                      # Root npm config (existing)
├── Makefile                          # UNIFIED: Build commands
└── README.md                         # UPDATED: Full platform docs
```

### 4.2 Workspace Configuration

**Root package.json:**

```json
{
  "name": "pulse",
  "version": "1.0.0",
  "workspaces": ["shared", "local", "remote", "python"],
  "scripts": {
    "install:all": "npm install && cd python && uv sync",
    "build": "npm run build:ts && npm run build:python",
    "build:ts": "npm run build --workspaces --if-present",
    "build:python": "cd python && uv build",
    "test": "npm test --workspaces && cd python && uv run pytest",
    "dev:mcp": "npm run dev --workspace=local",
    "dev:python": "cd python && make dev",
    "dev:worker": "cd python && make worker",
    "services:up": "docker compose up -d",
    "services:down": "docker compose down"
  }
}
```

**Python workspace integration:**

```json
// python/package.json (minimal, for workspace compatibility)
{
  "name": "@pulse/python",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "build": "cd .. && echo 'Python build handled by uv'",
    "test": "cd .. && uv run pytest"
  }
}
```

---

## 5. Technology Stack Alignment

### 5.1 Multi-Language Strategy

**TypeScript (Node.js 20+) - MCP Interface Layer:**

- MCP server implementation (stdio + HTTP transports)
- MCP tool registration and schema definition
- HTTP client for Python API delegation
- LLM extraction (Anthropic, OpenAI, OpenAI-compatible)
- Response formatting for MCP protocol

**Python (3.12+) - Processing & Storage Layer:**

- **Firecrawl Integration** (ALL operations: scrape, map, crawl, search)
- Webhook server (Firecrawl → indexing pipeline)
- Content processing (cleaning, chunking, embedding)
- Vector operations (Qdrant client)
- Hybrid search (Vector + BM25 + RRF)
- Background job processing (Redis Queue)
- Metrics and monitoring (PostgreSQL)

**Rationale for Python-First Firecrawl:**

- Python already owns webhooks, embeddings, and chunking
- Single integration point easier to maintain than two
- Automatic indexing for all scraped content
- Native fit with ML ecosystem (HuggingFace, Qdrant)

### 5.2 Inter-Process Communication

**HTTP API Bridge:**

```
TypeScript MCP Tool → HTTP POST → Python FastAPI Endpoint → Response
```

**Configuration:**

```bash
# Python service runs on dedicated port
PYTHON_SERVICE_URL=http://localhost:52100
PYTHON_SERVICE_API_SECRET=shared-secret-key
```

**Implementation Pattern:**

**TypeScript side (new tool):**

```typescript
// shared/mcp/tools/semantic-search/handler.ts
export async function semanticSearchTool(server: Server) {
  const tool = {
    name: 'semantic_search',
    description: 'Search indexed documents using semantic similarity',
    inputSchema: buildInputSchema(),
    handler: async (args: unknown) => {
      const { query, limit, filters } = validateArgs(args);

      // Delegate to Python service
      const response = await fetch(`${PYTHON_SERVICE_URL}/api/search`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${PYTHON_SERVICE_API_SECRET}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, limit, filters }),
      });

      return formatResponse(await response.json());
    },
  };

  return tool;
}
```

**Python side:**

```python
# python/app/api/routes.py
@router.post("/api/search")
async def search(
    request: SearchRequest,
    search_service: Annotated[SearchOrchestrator, Depends(get_search_service)]
) -> SearchResponse:
    """Semantic search endpoint for MCP tools."""
    results = await search_service.hybrid_search(
        query=request.query,
        limit=request.limit,
        domain=request.domain,
        language=request.language
    )
    return SearchResponse(results=results)
```

### 5.3 Shared Dependencies

**Services Used by Both:**

- Firecrawl API (scraping source)
- Qdrant (vector storage)
- Redis (caching, job queue)
- PostgreSQL (metrics storage)

**Build Tools:**

- TypeScript: npm, tsx, vitest, eslint, prettier
- Python: uv, ruff, mypy, pytest
- Shared: Docker, docker-compose, git

**Code Quality:**

- TypeScript: Strict mode, ESLint, Prettier
- Python: Strict mypy, Ruff (linter + formatter)
- Both: Pre-commit hooks (husky + lint-staged)

---

## 6. Service Integration

### 6.1 Firecrawl Integration (Python-First)

**Current State:**

- **pulse v1:** TypeScript client talks directly to Firecrawl
- **FC-Bridge:** Python webhook receiver for crawled documents

**Unified Approach (v2.0):**

- **Single Integration Point:** Python service owns ALL Firecrawl operations
- **TypeScript Role:** Thin HTTP wrapper that delegates to Python API
- **Automatic Indexing:** All scraped content flows through Python for semantic indexing

**Firecrawl Configuration (Remote Server):**

```bash
# Firecrawl .env (on steamy-wsl)
ENABLE_SEARCH_INDEX=true
SEARCH_SERVICE_URL=http://10.1.0.6:52100  # Python webhook server
SEARCH_SERVICE_API_SECRET=shared-secret
SEARCH_INDEX_SAMPLE_RATE=1.0
```

**pulse Configuration:**

```bash
# Python service configuration (owns ALL Firecrawl operations)
FIRECRAWL_API_KEY=fc-xxx
FIRECRAWL_BASE_URL=https://api.firecrawl.dev

# Python webhook server
PYTHON_WEBHOOK_URL=http://localhost:52100/api/webhook/firecrawl
PYTHON_WEBHOOK_SECRET=shared-secret

# Python API for MCP tools (TypeScript → Python delegation)
PYTHON_SERVICE_URL=http://localhost:52100
PYTHON_SERVICE_API_SECRET=shared-secret-key
```

**Integration Flow (Python-First):**

```
┌──────────────────────────────────────────────────────────────┐
│  MCP Client (Claude Desktop, Cline, etc.)                    │
└─────────────────────────────┬────────────────────────────────┘
                              │
                              │ MCP Protocol
                              │
┌─────────────────────────────▼────────────────────────────────┐
│  TypeScript MCP Tools (scrape, map, crawl, search)           │
│  • Validate input                                            │
│  • Delegate to Python API                                    │
│  • Format response for MCP                                   │
└─────────────────────────────┬────────────────────────────────┘
                              │
                              │ HTTP POST
                              │
┌─────────────────────────────▼────────────────────────────────┐
│  Python API Service (FastAPI)                                │
│  • /api/scrape - Scrape single URL                           │
│  • /api/map - Discover URLs from domain                      │
│  • /api/crawl - Crawl entire site                            │
│  • /api/search - Firecrawl search                            │
└─────────────────────────────┬────────────────────────────────┘
                              │
                              │ Firecrawl API
                              │
┌─────────────────────────────▼────────────────────────────────┐
│  Firecrawl (Remote - steamy-wsl)                             │
│  • Scraping with anti-bot bypass                             │
│  • Sends webhooks to Python service                          │
└──────────────────────────────┬───────────────────────────────┘
                               │
                   Webhook     │
                   (POST)      │
                               │
          ┌────────────────────▼──────────────────┐
          │ Python Webhook Handler                │
          │ • Receive document                    │
          │ • Clean content                       │
          │ • Chunk by tokens                     │
          │ • Generate embeddings                 │
          │ • Index in Qdrant                     │
          └───────────────────────────────────────┘
```

**Benefits of Python-First:**

- ✅ Single Firecrawl integration point (easier maintenance)
- ✅ All scraped content automatically indexed for semantic search
- ✅ Unified chunking, cleaning, and embedding pipeline
- ✅ No duplication between TypeScript and Python clients
- ✅ Python expertise in ML/embedding ecosystem

### 6.2 Qdrant Integration

**Strategy:** Single Qdrant instance shared by both TypeScript and Python

**Configuration:**

```bash
QDRANT_URL=http://localhost:52102  # HTTP API
QDRANT_GRPC_URL=http://localhost:52103  # gRPC API
QDRANT_COLLECTION=pulse_fetch_unified
QDRANT_VECTOR_DIM=1024
```

**TypeScript Qdrant Backend:**

```typescript
// shared/storage/resources/backends/qdrant.ts
import { QdrantClient } from '@qdrant/js-client-rest';

export class QdrantResourceStorage implements ResourceStorage {
  private client: QdrantClient;

  constructor(config: QdrantConfig) {
    this.client = new QdrantClient({
      url: config.url,
      apiKey: config.apiKey,
    });
  }

  async write(url: string, content: string, metadata: ResourceMetadata) {
    // Store in Qdrant with embeddings
    const embedding = await this.getEmbedding(content);
    const point = {
      id: uuidv4(),
      vector: embedding,
      payload: { url, content, ...metadata },
    };
    await this.client.upsert(config.collection, { points: [point] });
  }

  private async getEmbedding(text: string): Promise<number[]> {
    // Delegate to Python embedding service
    const response = await fetch(`${PYTHON_SERVICE_URL}/api/embed`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${API_SECRET}` },
      body: JSON.stringify({ text }),
    });
    return (await response.json()).embedding;
  }
}
```

**Python Qdrant Client:**

```python
# python/app/services/vector_store.py (existing)
# Already implemented, just needs unified collection name
```

### 6.3 HuggingFace TEI (Text Embeddings Inference)

**Strategy:** Python service wraps TEI, TypeScript delegates to Python

**Architecture:**

```
TypeScript → HTTP API → Python Embedding Service → TEI Docker
```

**Python Embedding API:**

```python
# python/app/api/routes.py
@router.post("/api/embed")
async def generate_embedding(
    request: EmbedRequest,
    embedding_service: Annotated[EmbeddingService, Depends(get_embedding_service)]
) -> EmbedResponse:
    """Generate embeddings for MCP tools."""
    embedding = await embedding_service.embed_single(request.text)
    return EmbedResponse(embedding=embedding)

@router.post("/api/embed/batch")
async def generate_embeddings_batch(
    request: EmbedBatchRequest,
    embedding_service: Annotated[EmbeddingService, Depends(get_embedding_service)]
) -> EmbedBatchResponse:
    """Batch embedding generation."""
    embeddings = await embedding_service.embed_batch(request.texts)
    return EmbedBatchResponse(embeddings=embeddings)
```

**Configuration:**

```bash
# TEI Service
TEI_URL=http://localhost:52104
TEI_MODEL=Qwen/Qwen3-Embedding-0.6B
VECTOR_DIM=1024

# Chunking
MAX_CHUNK_TOKENS=256
CHUNK_OVERLAP_TOKENS=50
```

### 6.4 Redis Queue Integration

**Strategy:** Single Redis instance, multiple queues

**Configuration:**

```bash
REDIS_URL=redis://localhost:6379
# Queues:
# - indexing (Python worker for webhook documents)
# - scraping (future: async scraping jobs)
```

**TypeScript Integration (Future):**

```typescript
// Optional: Enqueue scraping jobs for background processing
import { Queue } from 'bullmq';

const scrapingQueue = new Queue('scraping', {
  connection: { host: 'localhost', port: 6379 },
});

await scrapingQueue.add('scrape-url', { url, options });
```

### 6.5 PostgreSQL Metrics Integration

**Strategy:** Shared metrics database

**Configuration:**

```bash
DATABASE_URL=postgresql://user:pass@localhost:5432/pulse_fetch

# Tables:
# - request_metrics (API request timing - Python)
# - tool_metrics (MCP tool execution - TypeScript)
# - indexing_metrics (Document indexing - Python)
```

---

## 7. Storage Layer Integration

### 7.1 Current Storage Systems

**pulse Storage:**

- **Backends:** Memory, Filesystem
- **Interface:** ResourceStorage (CRUD operations)
- **Purpose:** Cache scraped content, support MCP resources
- **Limitations:** No vector search, no semantic retrieval

**FC-Bridge Storage:**

- **Vector Store:** Qdrant (embeddings + metadata)
- **Keyword Index:** BM25 (in-memory, pickled to disk)
- **Purpose:** Semantic + keyword hybrid search
- **Limitations:** Not exposed via MCP

### 7.2 Unified Storage Architecture

**Three-Tier Storage:**

```
┌─────────────────────────────────────────────────────────────┐
│                    Storage Abstraction Layer                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │   Memory     │  │  Filesystem  │  │   Qdrant        │  │
│  │   (Fast)     │  │  (Persist)   │  │   (Semantic)    │  │
│  │              │  │              │  │                 │  │
│  │  Cache       │  │  Archive     │  │  Long-term      │  │
│  │  Temporary   │  │  Debugging   │  │  Search Index   │  │
│  │  Development │  │  Audit       │  │  Production     │  │
│  └──────────────┘  └──────────────┘  └─────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 7.3 Qdrant Backend Implementation

**File:** `shared/storage/resources/backends/qdrant.ts`

**Key Features:**

- Implements existing ResourceStorage interface
- Generates embeddings via Python service
- Stores vectors + content in Qdrant
- Supports semantic search lookups

**Implementation:**

```typescript
import { QdrantClient } from '@qdrant/js-client-rest';
import type { ResourceStorage, ResourceData, ResourceMetadata } from '../types.js';

export class QdrantResourceStorage implements ResourceStorage {
  private client: QdrantClient;
  private collection: string;
  private pythonServiceUrl: string;
  private apiSecret: string;

  constructor(config: QdrantStorageConfig) {
    this.client = new QdrantClient({
      url: config.qdrantUrl,
      apiKey: config.qdrantApiKey,
    });
    this.collection = config.collection;
    this.pythonServiceUrl = config.pythonServiceUrl;
    this.apiSecret = config.apiSecret;
  }

  async init(): Promise<void> {
    // Ensure collection exists
    const collections = await this.client.getCollections();
    const exists = collections.collections.some((c) => c.name === this.collection);

    if (!exists) {
      await this.client.createCollection(this.collection, {
        vectors: {
          size: 1024,
          distance: 'Cosine',
        },
      });
    }
  }

  async write(url: string, content: string, metadata?: Partial<ResourceMetadata>): Promise<string> {
    // Generate embedding via Python service
    const embedding = await this.generateEmbedding(content);

    // Create point ID
    const id = `${url}_${Date.now()}`;

    // Upsert to Qdrant
    await this.client.upsert(this.collection, {
      points: [
        {
          id,
          vector: embedding,
          payload: {
            url,
            content,
            timestamp: new Date().toISOString(),
            ...metadata,
          },
        },
      ],
    });

    return `qdrant://${this.collection}/${id}`;
  }

  async writeMulti(data: MultiResourceWrite): Promise<MultiResourceUris> {
    const timestamp = new Date().toISOString();
    const baseId = `${data.url}_${Date.now()}`;

    const uris: MultiResourceUris = {};

    // Write raw tier
    if (data.raw) {
      uris.raw = await this.write(data.url, data.raw, {
        ...data.metadata,
        resourceType: 'raw',
        timestamp,
      });
    }

    // Write cleaned tier
    if (data.cleaned) {
      uris.cleaned = await this.write(data.url, data.cleaned, {
        ...data.metadata,
        resourceType: 'cleaned',
        timestamp,
      });
    }

    // Write extracted tier
    if (data.extracted) {
      uris.extracted = await this.write(data.url, data.extracted, {
        ...data.metadata,
        resourceType: 'extracted',
        timestamp,
      });
    }

    return uris;
  }

  async read(uri: string): Promise<ResourceContent> {
    // Extract ID from URI: qdrant://collection/id
    const id = uri.split('/').pop()!;

    const points = await this.client.retrieve(this.collection, {
      ids: [id],
    });

    if (points.length === 0) {
      throw new Error(`Resource not found: ${uri}`);
    }

    const point = points[0];
    return {
      uri,
      text: point.payload.content as string,
      mimeType: 'text/plain',
    };
  }

  async findByUrl(url: string): Promise<ResourceData[]> {
    // Use scroll with filter
    const results = await this.client.scroll(this.collection, {
      filter: {
        must: [
          {
            key: 'url',
            match: { value: url },
          },
        ],
      },
      limit: 100,
    });

    return results.points.map((point) => ({
      uri: `qdrant://${this.collection}/${point.id}`,
      name: point.payload.url as string,
      mimeType: 'text/plain',
      metadata: point.payload as ResourceMetadata,
    }));
  }

  async findByUrlAndExtract(url: string, extractPrompt?: string): Promise<ResourceData[]> {
    const filter: any = {
      must: [{ key: 'url', match: { value: url } }],
    };

    if (extractPrompt) {
      filter.must.push({
        key: 'extractionPrompt',
        match: { value: extractPrompt },
      });
    }

    const results = await this.client.scroll(this.collection, {
      filter,
      limit: 100,
    });

    return results.points.map((point) => ({
      uri: `qdrant://${this.collection}/${point.id}`,
      name: point.payload.url as string,
      mimeType: 'text/plain',
      metadata: point.payload as ResourceMetadata,
    }));
  }

  async list(): Promise<ResourceData[]> {
    // Scroll through all points
    const results = await this.client.scroll(this.collection, {
      limit: 1000,
    });

    return results.points.map((point) => ({
      uri: `qdrant://${this.collection}/${point.id}`,
      name: point.payload.url as string,
      mimeType: 'text/plain',
      metadata: point.payload as ResourceMetadata,
    }));
  }

  async exists(uri: string): Promise<boolean> {
    try {
      await this.read(uri);
      return true;
    } catch {
      return false;
    }
  }

  async delete(uri: string): Promise<void> {
    const id = uri.split('/').pop()!;
    await this.client.delete(this.collection, {
      points: [id],
    });
  }

  private async generateEmbedding(text: string): Promise<number[]> {
    const response = await fetch(`${this.pythonServiceUrl}/api/embed`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiSecret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      throw new Error(`Embedding generation failed: ${response.statusText}`);
    }

    const result = await response.json();
    return result.embedding;
  }
}
```

### 7.4 Storage Factory Update

**File:** `shared/storage/resources/factory.ts`

```typescript
import { QdrantResourceStorage } from './backends/qdrant.js';

export class ResourceStorageFactory {
  static async create(): Promise<ResourceStorage> {
    const storageType = process.env.MCP_RESOURCE_STORAGE || 'memory';

    switch (storageType) {
      case 'qdrant':
        const qdrantStorage = new QdrantResourceStorage({
          qdrantUrl: process.env.QDRANT_URL || 'http://localhost:52102',
          qdrantApiKey: process.env.QDRANT_API_KEY,
          collection: process.env.QDRANT_COLLECTION || 'pulse_fetch_unified',
          pythonServiceUrl: process.env.PYTHON_SERVICE_URL || 'http://localhost:52100',
          apiSecret: process.env.PYTHON_SERVICE_API_SECRET!,
        });
        await qdrantStorage.init();
        return qdrantStorage;

      case 'filesystem':
      // Existing implementation

      case 'memory':
      default:
      // Existing implementation
    }
  }
}
```

---

## 8. Embedding Pipeline Integration

### 8.1 Embedding Architecture

**Strategy:** Python handles all embedding generation, TypeScript delegates via HTTP

**Components:**

```
┌─────────────────────────────────────────────────────────────┐
│                    Embedding Pipeline                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  1. Text Preparation (Python)                          │ │
│  │     • Clean text                                       │ │
│  │     • Token-based chunking                             │ │
│  │     • Metadata attachment                              │ │
│  └────────────────────────────────────────────────────────┘ │
│                           ↓                                 │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  2. Embedding Generation (Python → TEI)                │ │
│  │     • Batch processing                                 │ │
│  │     • HuggingFace TEI                                  │ │
│  │     • Retry logic                                      │ │
│  └────────────────────────────────────────────────────────┘ │
│                           ↓                                 │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  3. Vector Storage (Python → Qdrant)                   │ │
│  │     • Qdrant upsert                                    │ │
│  │     • Metadata indexing                                │ │
│  │     • BM25 indexing                                    │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 8.2 Token-Based Chunking

**Implementation:** Python only (uses HuggingFace tokenizers)

**File:** `python/app/utils/text_processing.py` (existing, no changes)

**Configuration:**

```bash
MAX_CHUNK_TOKENS=256
CHUNK_OVERLAP_TOKENS=50
EMBEDDING_MODEL=Qwen/Qwen3-Embedding-0.6B
```

**Why Not TypeScript?**

- HuggingFace tokenizers library (Python) is mature and reliable
- TypeScript alternatives lack feature parity
- Python ecosystem better for ML/NLP processing
- Delegation via HTTP API is efficient and clean

### 8.3 Embedding API Endpoints

**Python API:**

```python
# python/app/api/routes.py

class EmbedRequest(BaseModel):
    text: str

class EmbedBatchRequest(BaseModel):
    texts: list[str]

class EmbedResponse(BaseModel):
    embedding: list[float]
    model: str
    dimensions: int

class EmbedBatchResponse(BaseModel):
    embeddings: list[list[float]]
    model: str
    dimensions: int

@router.post("/api/embed", response_model=EmbedResponse)
async def generate_embedding(
    request: EmbedRequest,
    embedding_service: Annotated[EmbeddingService, Depends(get_embedding_service)]
):
    """Generate embedding for single text."""
    embedding = await embedding_service.embed_single(request.text)
    return EmbedResponse(
        embedding=embedding,
        model=settings.embedding_model,
        dimensions=len(embedding)
    )

@router.post("/api/embed/batch", response_model=EmbedBatchResponse)
async def generate_embeddings_batch(
    request: EmbedBatchRequest,
    embedding_service: Annotated[EmbeddingService, Depends(get_embedding_service)]
):
    """Generate embeddings for multiple texts (batch)."""
    embeddings = await embedding_service.embed_batch(request.texts)
    return EmbedBatchResponse(
        embeddings=embeddings,
        model=settings.embedding_model,
        dimensions=len(embeddings[0]) if embeddings else 0
    )

@router.post("/api/chunk-and-embed")
async def chunk_and_embed(
    request: ChunkAndEmbedRequest,
    text_chunker: Annotated[TextChunker, Depends(get_text_chunker)],
    embedding_service: Annotated[EmbeddingService, Depends(get_embedding_service)]
):
    """
    Complete pipeline: chunk text, generate embeddings, return both.
    Useful for TypeScript Qdrant backend.
    """
    # Chunk text
    chunks = text_chunker.chunk_text(request.text, metadata=request.metadata)

    # Generate embeddings (batch)
    chunk_texts = [chunk["text"] for chunk in chunks]
    embeddings = await embedding_service.embed_batch(chunk_texts)

    # Combine
    result = []
    for chunk, embedding in zip(chunks, embeddings):
        result.append({
            "text": chunk["text"],
            "embedding": embedding,
            "chunk_index": chunk["chunk_index"],
            "token_count": chunk["token_count"],
            "metadata": chunk.get("metadata", {})
        })

    return ChunkAndEmbedResponse(chunks=result)
```

**TypeScript Usage:**

```typescript
// shared/storage/resources/backends/qdrant.ts

private async chunkAndEmbed(text: string, metadata: any) {
  const response = await fetch(`${this.pythonServiceUrl}/api/chunk-and-embed`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${this.apiSecret}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ text, metadata })
  });

  return await response.json();
}
```

### 8.4 Automatic Embedding on Write

**Strategy:** When writing to Qdrant backend, automatically chunk and embed

**Flow:**

```
MCP Tool → write(url, content) → QdrantResourceStorage
    ↓
chunk-and-embed API → Python Service
    ↓
[Chunk text → Generate embeddings] → Return chunks + embeddings
    ↓
QdrantResourceStorage → Upsert to Qdrant with vectors
```

**Benefits:**

- Transparent to MCP tools
- No changes to existing tool implementations
- Automatic semantic indexing of all scraped content

---

## 9. API & Tool Integration

### 9.1 New MCP Tools

**Tool 1: `semantic_search`**

**Purpose:** Search indexed documents using semantic similarity

**Input Schema:**

```typescript
{
  query: string;              // Search query
  limit?: number;             // Max results (default: 10)
  mode?: "hybrid" | "semantic" | "keyword";
  filters?: {
    domain?: string;
    language?: string;
    country?: string;
    isMobile?: boolean;
  };
}
```

**Implementation:**

```typescript
// shared/mcp/tools/semantic-search/handler.ts
export async function semanticSearchTool(server: Server) {
  return {
    name: 'semantic_search',
    description: 'Search indexed documents using semantic similarity and keyword matching',
    inputSchema: buildInputSchema(),
    handler: async (args: unknown) => {
      const validated = validateArgs(args);

      // Delegate to Python search service
      const response = await fetch(`${PYTHON_SERVICE_URL}/api/search`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${PYTHON_SERVICE_API_SECRET}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: validated.query,
          limit: validated.limit || 10,
          mode: validated.mode || 'hybrid',
          domain: validated.filters?.domain,
          language: validated.filters?.language,
          country: validated.filters?.country,
          is_mobile: validated.filters?.isMobile,
        }),
      });

      if (!response.ok) {
        return {
          content: [
            {
              type: 'text',
              text: `Search failed: ${response.statusText}`,
            },
          ],
          isError: true,
        };
      }

      const results = await response.json();

      return {
        content: [
          {
            type: 'text',
            text: formatSearchResults(results),
          },
        ],
      };
    },
  };
}
```

**Tool 2: `index_document`**

**Purpose:** Manually index a document (alternative to webhook)

**Input Schema:**

```typescript
{
  url: string;
  content: string;
  metadata?: {
    title?: string;
    description?: string;
    language?: string;
    country?: string;
  };
}
```

**Implementation:**

```typescript
// shared/mcp/tools/index-document/handler.ts
export async function indexDocumentTool(server: Server) {
  return {
    name: 'index_document',
    description: 'Manually index a document for semantic search',
    inputSchema: buildInputSchema(),
    handler: async (args: unknown) => {
      const validated = validateArgs(args);

      // Delegate to Python indexing service
      const response = await fetch(`${PYTHON_SERVICE_URL}/api/index`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${PYTHON_SERVICE_API_SECRET}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: validated.url,
          markdown: validated.content,
          title: validated.metadata?.title,
          description: validated.metadata?.description,
          language: validated.metadata?.language,
          country: validated.metadata?.country,
        }),
      });

      if (!response.ok) {
        return {
          content: [
            {
              type: 'text',
              text: `Indexing failed: ${response.statusText}`,
            },
          ],
          isError: true,
        };
      }

      const result = await response.json();

      return {
        content: [
          {
            type: 'text',
            text: `Document indexed successfully!\n\nURL: ${validated.url}\nChunks: ${result.chunks}\nVectors: ${result.vectors}`,
          },
        ],
      };
    },
  };
}
```

**Existing Tools Updated for Python-First:**

All existing MCP tools (scrape, map, crawl, search) are updated to delegate to Python API:

- **scrape** → `/api/firecrawl/scrape` (auto-indexes by default)
- **map** → `/api/firecrawl/map`
- **crawl** → `/api/firecrawl/crawl`
- **search** → `/api/firecrawl/search`

**New Parameter (All Firecrawl Tools):**

```typescript
{
  // ... existing tool parameters
  autoIndex?: boolean;  // Default: true for scrape, false for map/crawl
}
```

**Architecture Change:**

- ❌ **REMOVED:** TypeScript Firecrawl clients (`shared/clients/firecrawl/`)
- ❌ **REMOVED:** Native scraping fallback strategy
- ✅ **ADDED:** Python HTTP client (`shared/clients/python.ts`)
- ✅ **ADDED:** Automatic indexing for all scraped content

**See section 9.3 for detailed Python API implementation examples.**

### 9.2 Tool Registration

**File:** `shared/mcp/registration.ts`

```typescript
import { semanticSearchTool } from './tools/semantic-search/handler.js';
import { indexDocumentTool } from './tools/index-document/handler.js';

export async function registerTools(server: Server) {
  const tools = [
    // Existing tools
    scrapeTool(server, clientFactory, configFactory),
    mapTool(server, clientFactory),
    crawlTool(server, clientFactory),
    searchTool(server, clientFactory),

    // NEW: Semantic search tools
    semanticSearchTool(server),
    indexDocumentTool(server),
  ];

  // ... existing registration logic
}
```

### 9.3 Python API Endpoints (Python-First Architecture)

**Firecrawl Operation Endpoints (NEW):**

These endpoints proxy ALL Firecrawl operations from TypeScript MCP tools to the Python service.

| Endpoint                | Method | Purpose                         | Auth         |
| ----------------------- | ------ | ------------------------------- | ------------ |
| `/api/firecrawl/scrape` | POST   | Scrape single URL via Firecrawl | Bearer Token |
| `/api/firecrawl/map`    | POST   | Discover URLs from domain       | Bearer Token |
| `/api/firecrawl/crawl`  | POST   | Crawl entire site               | Bearer Token |
| `/api/firecrawl/search` | POST   | Firecrawl search API            | Bearer Token |

**Implementation Example:**

```python
# python/app/api/firecrawl.py

@router.post("/api/firecrawl/scrape")
async def scrape_url(
    request: ScrapeRequest,
    firecrawl_client: Annotated[FirecrawlClient, Depends(get_firecrawl_client)]
) -> ScrapeResponse:
    """
    Scrape a URL via Firecrawl and automatically index the content.
    This is the single entry point for ALL scraping operations.
    """
    # Call Firecrawl
    result = await firecrawl_client.scrape_url(
        url=request.url,
        formats=request.formats,
        wait_for=request.waitFor,
        timeout=request.timeout
    )

    # Automatically index if enabled (default: true)
    if request.auto_index:
        await index_document(
            url=request.url,
            content=result.markdown,
            metadata=result.metadata
        )

    return ScrapeResponse(
        success=True,
        url=request.url,
        content=result.markdown,
        html=result.html,
        metadata=result.metadata,
        indexed=request.auto_index
    )

@router.post("/api/firecrawl/map")
async def map_domain(
    request: MapRequest,
    firecrawl_client: Annotated[FirecrawlClient, Depends(get_firecrawl_client)]
) -> MapResponse:
    """Map URLs from a domain via Firecrawl."""
    result = await firecrawl_client.map_domain(
        url=request.url,
        search=request.search,
        limit=request.limit
    )
    return MapResponse(
        success=True,
        url=request.url,
        urls=result.urls
    )

@router.post("/api/firecrawl/crawl")
async def crawl_site(
    request: CrawlRequest,
    firecrawl_client: Annotated[FirecrawlClient, Depends(get_firecrawl_client)]
) -> CrawlResponse:
    """
    Crawl a site via Firecrawl.
    Returns job ID for async tracking.
    """
    job_id = await firecrawl_client.crawl_async(
        url=request.url,
        limit=request.limit,
        exclude_paths=request.excludePaths,
        include_paths=request.includePaths
    )
    return CrawlResponse(
        success=True,
        job_id=job_id,
        status="started"
    )

@router.post("/api/firecrawl/search")
async def search_web(
    request: SearchRequest,
    firecrawl_client: Annotated[FirecrawlClient, Depends(get_firecrawl_client)]
) -> SearchResponse:
    """Search the web via Firecrawl."""
    results = await firecrawl_client.search(
        query=request.query,
        limit=request.limit
    )
    return SearchResponse(
        success=True,
        query=request.query,
        results=results
    )
```

**TypeScript Tool Update (Delegation Pattern):**

```typescript
// shared/mcp/tools/scrape/handler.ts (UPDATED for Python-First)

export async function scrapeTool(server: Server) {
  return {
    name: 'scrape',
    description: 'Scrape a URL and optionally index for semantic search',
    inputSchema: buildInputSchema(),
    handler: async (args: unknown) => {
      const validated = validateArgs(args);

      // Delegate to Python Firecrawl API
      const response = await fetch(`${PYTHON_SERVICE_URL}/api/firecrawl/scrape`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${PYTHON_SERVICE_API_SECRET}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: validated.url,
          formats: validated.formats || ['markdown', 'html'],
          waitFor: validated.waitFor,
          timeout: validated.timeout,
          auto_index: validated.autoIndex ?? true, // Default: auto-index
        }),
      });

      if (!response.ok) {
        return {
          content: [
            {
              type: 'text',
              text: `Scrape failed: ${response.statusText}`,
            },
          ],
          isError: true,
        };
      }

      const result = await response.json();

      // Format MCP response
      return {
        content: [
          {
            type: 'resource',
            resource: {
              uri: `scraped://${new URL(validated.url).hostname}/${Date.now()}`,
              name: validated.url,
              text: result.content,
              mimeType: 'text/markdown',
            },
          },
        ],
      };
    },
  };
}
```

**Semantic Search & Indexing Endpoints:**

| Endpoint                 | Method | Purpose                    | Auth           |
| ------------------------ | ------ | -------------------------- | -------------- |
| `/api/webhook/firecrawl` | POST   | Receive Firecrawl webhooks | HMAC Signature |
| `/api/index`             | POST   | Index document manually    | Bearer Token   |
| `/api/search`            | POST   | Semantic/hybrid search     | Bearer Token   |
| `/api/embed`             | POST   | Generate single embedding  | Bearer Token   |
| `/api/embed/batch`       | POST   | Generate batch embeddings  | Bearer Token   |
| `/api/chunk-and-embed`   | POST   | Chunk + embed pipeline     | Bearer Token   |
| `/api/stats`             | GET    | Index statistics           | Bearer Token   |
| `/health`                | GET    | Health check               | None           |

**Benefits of Python-First API:**

- ✅ TypeScript tools become simple HTTP wrappers (5-10 lines)
- ✅ All scraping automatically indexed for semantic search
- ✅ Single Firecrawl client to maintain (Python only)
- ✅ Unified error handling and retry logic
- ✅ Python expertise in ML/embedding ecosystem

---

## 10. Configuration Management

### 10.1 Unified Environment Variables

**File:** `.env.example` (unified for entire platform)

```bash
#######################################
# pulse UNIFIED CONFIGURATION  #
#######################################

# === Docker & Services ===
PORT=52100                              # Python service HTTP port
MCP_REMOTE_PORT=3060                    # MCP remote server port (TypeScript)

# === Firecrawl Configuration ===
FIRECRAWL_API_KEY=fc-...                # Firecrawl API key
FIRECRAWL_BASE_URL=https://api.firecrawl.dev

# === Python Service Configuration ===
PYTHON_SERVICE_URL=http://localhost:52100
PYTHON_SERVICE_API_SECRET=change-this-secret-in-production
PYTHON_WEBHOOK_SECRET=change-this-webhook-secret-in-production

# === Qdrant Vector Database ===
QDRANT_URL=http://localhost:52102      # Qdrant HTTP API
QDRANT_GRPC_URL=http://localhost:52103 # Qdrant gRPC API
QDRANT_API_KEY=                         # Optional API key
QDRANT_COLLECTION=pulse_fetch_unified
QDRANT_TIMEOUT=60.0

# === HuggingFace TEI (Embeddings) ===
TEI_URL=http://localhost:52104
EMBEDDING_MODEL=Qwen/Qwen3-Embedding-0.6B
VECTOR_DIM=1024

# === Chunking Configuration ===
MAX_CHUNK_TOKENS=256
CHUNK_OVERLAP_TOKENS=50

# === Redis Queue ===
REDIS_URL=redis://localhost:6379

# === PostgreSQL (Metrics) ===
DATABASE_URL=postgresql+asyncpg://pulse_fetch:password@localhost:5432/pulse_fetch

# === Storage Configuration ===
# Options: memory, filesystem, qdrant
MCP_RESOURCE_STORAGE=qdrant
MCP_RESOURCE_FILESYSTEM_ROOT=./data/resources
MCP_RESOURCE_TTL=86400                  # 24 hours in seconds
MCP_RESOURCE_MAX_SIZE=500               # Max cache size in MB
MCP_RESOURCE_MAX_ITEMS=5000

# === Search Configuration ===
HYBRID_SEARCH_ALPHA=0.5                 # 0.0=BM25 only, 1.0=vector only
BM25_K1=1.5
BM25_B=0.75
RRF_K=60

# === LLM Extraction (Optional) ===
LLM_PROVIDER=anthropic                  # anthropic, openai, openai-compatible
LLM_API_KEY=sk-...
LLM_API_BASE_URL=                       # For openai-compatible only
LLM_MODEL=                              # Optional override

# === Scraping Strategy ===
OPTIMIZE_FOR=cost                       # cost, speed
STRATEGY_CONFIG_PATH=./data/learned-strategies.md

# === Map Tool Defaults ===
MAP_DEFAULT_COUNTRY=US
MAP_DEFAULT_LANGUAGES=en-US
MAP_MAX_RESULTS_PER_PAGE=200

# === Logging ===
LOG_LEVEL=INFO                          # DEBUG, INFO, WARNING, ERROR
LOG_FORMAT=json                         # json, text
DEBUG=false

# === CORS (Python Service) ===
CORS_ORIGINS=http://localhost:3000,http://localhost:3060

# === Remote MCP Server (TypeScript) ===
ALLOWED_ORIGINS=*
ALLOWED_HOSTS=localhost:3060
ENABLE_RESUMABILITY=false
ENABLE_OAUTH=false
METRICS_AUTH_ENABLED=false
METRICS_AUTH_KEY=
```

### 10.2 Configuration Files by Component

**TypeScript (shared/config/):**

```typescript
// shared/config/settings.ts
export interface UnifiedSettings {
  // Firecrawl
  firecrawlApiKey?: string;
  firecrawlBaseUrl: string;

  // Python service
  pythonServiceUrl: string;
  pythonServiceApiSecret: string;

  // Qdrant
  qdrantUrl: string;
  qdrantCollection: string;
  vectorDim: number;

  // Storage
  resourceStorage: 'memory' | 'filesystem' | 'qdrant';
  resourceFilesystemRoot: string;

  // LLM
  llmProvider?: 'anthropic' | 'openai' | 'openai-compatible';
  llmApiKey?: string;
  llmModel?: string;
}

export function loadSettings(): UnifiedSettings {
  return {
    firecrawlApiKey: process.env.FIRECRAWL_API_KEY,
    firecrawlBaseUrl: process.env.FIRECRAWL_BASE_URL || 'https://api.firecrawl.dev',
    pythonServiceUrl: process.env.PYTHON_SERVICE_URL || 'http://localhost:52100',
    pythonServiceApiSecret: process.env.PYTHON_SERVICE_API_SECRET!,
    qdrantUrl: process.env.QDRANT_URL || 'http://localhost:52102',
    qdrantCollection: process.env.QDRANT_COLLECTION || 'pulse_fetch_unified',
    vectorDim: parseInt(process.env.VECTOR_DIM || '1024'),
    resourceStorage: (process.env.MCP_RESOURCE_STORAGE as any) || 'memory',
    resourceFilesystemRoot: process.env.MCP_RESOURCE_FILESYSTEM_ROOT || './data/resources',
    llmProvider: process.env.LLM_PROVIDER as any,
    llmApiKey: process.env.LLM_API_KEY,
    llmModel: process.env.LLM_MODEL,
  };
}
```

**Python (python/app/config.py):**

```python
# python/app/config.py
from pydantic import Field
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    """Unified platform settings."""

    # API Server
    host: str = Field(default="0.0.0.0", alias="PYTHON_SERVICE_HOST")
    port: int = Field(default=52100, alias="PORT")
    api_secret: str = Field(alias="PYTHON_SERVICE_API_SECRET")
    webhook_secret: str = Field(alias="PYTHON_WEBHOOK_SECRET")

    # CORS
    cors_origins: str = Field(default="*", alias="CORS_ORIGINS")

    # Firecrawl
    firecrawl_api_key: str | None = Field(default=None, alias="FIRECRAWL_API_KEY")
    firecrawl_base_url: str = Field(
        default="https://api.firecrawl.dev",
        alias="FIRECRAWL_BASE_URL"
    )

    # Qdrant
    qdrant_url: str = Field(alias="QDRANT_URL")
    qdrant_collection: str = Field(alias="QDRANT_COLLECTION")
    qdrant_timeout: float = Field(default=60.0, alias="QDRANT_TIMEOUT")

    # TEI
    tei_url: str = Field(alias="TEI_URL")
    tei_api_key: str | None = Field(default=None, alias="TEI_API_KEY")
    embedding_model: str = Field(alias="EMBEDDING_MODEL")
    vector_dim: int = Field(alias="VECTOR_DIM")

    # Chunking
    max_chunk_tokens: int = Field(alias="MAX_CHUNK_TOKENS")
    chunk_overlap_tokens: int = Field(alias="CHUNK_OVERLAP_TOKENS")

    # Redis
    redis_url: str = Field(alias="REDIS_URL")

    # Database
    database_url: str | None = Field(default=None, alias="DATABASE_URL")

    # Search
    hybrid_alpha: float = Field(default=0.5, alias="HYBRID_SEARCH_ALPHA")
    bm25_k1: float = Field(default=1.5, alias="BM25_K1")
    bm25_b: float = Field(default=0.75, alias="BM25_B")
    rrf_k: int = Field(default=60, alias="RRF_K")

    # Logging
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")
    log_format: str = Field(default="json", alias="LOG_FORMAT")

    class Config:
        env_file = ".env"
        case_sensitive = False

settings = Settings()
```

### 10.3 Configuration Validation

**Startup Validation (TypeScript):**

```typescript
// shared/config/validation.ts
export function validateConfig(settings: UnifiedSettings): void {
  const errors: string[] = [];

  if (!settings.pythonServiceApiSecret) {
    errors.push('PYTHON_SERVICE_API_SECRET is required');
  }

  if (settings.resourceStorage === 'qdrant' && !settings.qdrantUrl) {
    errors.push('QDRANT_URL is required when using Qdrant storage');
  }

  if (errors.length > 0) {
    throw new Error(`Configuration errors:\n${errors.join('\n')}`);
  }
}
```

**Startup Validation (Python):**

```python
# python/app/config.py
def validate_settings(settings: Settings) -> None:
    """Validate required settings at startup."""
    errors = []

    if not settings.api_secret or settings.api_secret == "change-this-secret-in-production":
        errors.append("PYTHON_SERVICE_API_SECRET must be changed from default")

    if not settings.qdrant_url:
        errors.append("QDRANT_URL is required")

    if not settings.tei_url:
        errors.append("TEI_URL is required")

    if errors:
        raise ValueError(f"Configuration errors:\n" + "\n".join(errors))

# Call at startup
validate_settings(settings)
```

---

## 11. Docker & Deployment

### 11.1 Unified Docker Compose

**File:** `docker-compose.yml`

```yaml
version: '3.8'

networks:
  pulse-network:
    driver: bridge

volumes:
  qdrant_data:
  redis_data:
  postgres_data:
  tei_cache:
  bm25_data:

services:
  # ==========================================
  # Core Services
  # ==========================================

  qdrant:
    image: qdrant/qdrant:v1.8.0
    container_name: pulse-qdrant
    ports:
      - '52102:6333' # HTTP API
      - '52103:6334' # gRPC API
    volumes:
      - qdrant_data:/qdrant/storage
    networks:
      - pulse-network
    restart: unless-stopped
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:6333/health']
      interval: 30s
      timeout: 10s
      retries: 3

  redis:
    image: redis:7-alpine
    container_name: pulse-redis
    ports:
      - '6379:6379'
    volumes:
      - redis_data:/data
    networks:
      - pulse-network
    restart: unless-stopped
    command: redis-server --appendonly yes
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 30s
      timeout: 10s
      retries: 3

  postgres:
    image: postgres:16-alpine
    container_name: pulse-postgres
    ports:
      - '5432:5432'
    environment:
      POSTGRES_DB: pulse_fetch
      POSTGRES_USER: pulse_fetch
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-change-me}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - pulse-network
    restart: unless-stopped
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U pulse_fetch']
      interval: 30s
      timeout: 10s
      retries: 3

  tei:
    image: ghcr.io/huggingface/text-embeddings-inference:1.8
    container_name: pulse-tei
    ports:
      - '52104:80'
    volumes:
      - tei_cache:/data
    environment:
      MODEL_ID: ${EMBEDDING_MODEL:-Qwen/Qwen3-Embedding-0.6B}
      MAX_BATCH_TOKENS: 163840
      MAX_CLIENT_BATCH_SIZE: 100
    networks:
      - pulse-network
    restart: unless-stopped
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:80/health']
      interval: 60s
      timeout: 30s
      retries: 3
      start_period: 120s

  # ==========================================
  # Application Services
  # ==========================================

  python-api:
    build:
      context: .
      dockerfile: python/Dockerfile
    container_name: pulse-python-api
    ports:
      - '${PORT:-52100}:52100'
    environment:
      # Load from .env
      - PYTHON_SERVICE_API_SECRET
      - PYTHON_WEBHOOK_SECRET
      - QDRANT_URL=http://qdrant:6333
      - TEI_URL=http://tei:80
      - REDIS_URL=redis://redis:6379
      - DATABASE_URL=postgresql+asyncpg://pulse_fetch:${POSTGRES_PASSWORD:-change-me}@postgres:5432/pulse_fetch
      - EMBEDDING_MODEL
      - VECTOR_DIM
      - MAX_CHUNK_TOKENS
      - CHUNK_OVERLAP_TOKENS
      - CORS_ORIGINS
      - LOG_LEVEL
    volumes:
      - ./data/bm25:/app/data/bm25
      - ./data/resources:/app/data/resources
    networks:
      - pulse-network
    depends_on:
      qdrant:
        condition: service_healthy
      redis:
        condition: service_healthy
      tei:
        condition: service_healthy
      postgres:
        condition: service_healthy
    restart: unless-stopped
    command: uvicorn app.main:app --host 0.0.0.0 --port 52100
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:52100/health']
      interval: 30s
      timeout: 10s
      retries: 3

  python-worker:
    build:
      context: .
      dockerfile: python/Dockerfile
    container_name: pulse-python-worker
    environment:
      # Same environment as API
      - PYTHON_SERVICE_API_SECRET
      - QDRANT_URL=http://qdrant:6333
      - TEI_URL=http://tei:80
      - REDIS_URL=redis://redis:6379
      - DATABASE_URL=postgresql+asyncpg://pulse_fetch:${POSTGRES_PASSWORD:-change-me}@postgres:5432/pulse_fetch
      - EMBEDDING_MODEL
      - VECTOR_DIM
      - MAX_CHUNK_TOKENS
      - CHUNK_OVERLAP_TOKENS
      - LOG_LEVEL
    volumes:
      - ./data/bm25:/app/data/bm25
    networks:
      - pulse-network
    depends_on:
      python-api:
        condition: service_healthy
    restart: unless-stopped
    command: python -m app.worker

  mcp-remote:
    build:
      context: .
      dockerfile: Dockerfile
      target: remote
    container_name: pulse-mcp-remote
    ports:
      - '${MCP_REMOTE_PORT:-3060}:3060'
    environment:
      # MCP configuration
      - NODE_ENV=production
      - PORT=3060
      - ALLOWED_ORIGINS
      - ALLOWED_HOSTS

      # Python service connection
      - PYTHON_SERVICE_URL=http://python-api:52100
      - PYTHON_SERVICE_API_SECRET

      # Firecrawl
      - FIRECRAWL_API_KEY
      - FIRECRAWL_BASE_URL

      # Storage
      - MCP_RESOURCE_STORAGE=qdrant
      - QDRANT_URL=http://qdrant:6333
      - QDRANT_COLLECTION
      - VECTOR_DIM

      # LLM (optional)
      - LLM_PROVIDER
      - LLM_API_KEY
      - LLM_MODEL

      # Scraping
      - OPTIMIZE_FOR
    networks:
      - pulse-network
    depends_on:
      python-api:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: ['CMD', 'wget', '--spider', '-q', 'http://localhost:3060/health']
      interval: 30s
      timeout: 10s
      retries: 3
```

### 11.2 Multi-Stage Dockerfiles

**Python Dockerfile:** `python/Dockerfile`

```dockerfile
# python/Dockerfile
FROM python:3.13-slim AS base

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install uv
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.cargo/bin:$PATH"

# Set working directory
WORKDIR /app

# Copy dependency files
COPY pyproject.toml uv.lock ./

# Install dependencies
RUN uv sync --frozen --no-dev

# Copy application code
COPY app/ ./app/

# Create non-root user
RUN useradd -m -u 1000 python && chown -R python:python /app
USER python

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:52100/health || exit 1

# Default command (can be overridden)
CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "52100"]
```

**TypeScript Multi-Target Dockerfile:** `Dockerfile`

```dockerfile
# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace configuration
COPY package*.json ./
COPY shared/package*.json ./shared/
COPY local/package*.json ./local/
COPY remote/package*.json ./remote/

# Install dependencies
RUN npm ci

# Copy source code
COPY shared/ ./shared/
COPY local/ ./local/
COPY remote/ ./remote/
COPY tsconfig.json ./

# Build all packages
RUN npm run build

# ==========================================
# Local MCP Server (stdio)
# ==========================================
FROM node:20-alpine AS local

WORKDIR /app

# Copy built files and dependencies
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/shared/dist ./shared/dist
COPY --from=builder /app/shared/package.json ./shared/
COPY --from=builder /app/local/dist ./local/dist
COPY --from=builder /app/local/package.json ./local/

# Create symlink for shared
RUN cd local/dist && ln -sf ../../shared/dist shared

# Non-root user
RUN adduser -D -u 1000 nodejs
USER nodejs

CMD ["node", "local/dist/local/index.js"]

# ==========================================
# Remote MCP Server (HTTP)
# ==========================================
FROM node:20-alpine AS remote

WORKDIR /app

# Copy built files and dependencies
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/shared/dist ./shared/dist
COPY --from=builder /app/shared/package.json ./shared/
COPY --from=builder /app/remote/dist ./remote/dist
COPY --from=builder /app/remote/package.json ./remote/

# Non-root user
RUN adduser -D -u 1000 nodejs
USER nodejs

# Expose port
EXPOSE 3060

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --spider -q http://localhost:3060/health || exit 1

CMD ["node", "remote/dist/remote/index.js"]
```

### 11.3 Deployment Commands

**Makefile:** (unified commands)

```makefile
.PHONY: help install build test services dev clean

help:  ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

install:  ## Install all dependencies (Node + Python)
	npm install
	cd python && uv sync

build:  ## Build all packages
	npm run build
	cd python && uv build

test:  ## Run all tests
	npm test
	cd python && uv run pytest

services:  ## Start all services (detached)
	docker compose up -d

services-stop:  ## Stop all services
	docker compose down

services-logs:  ## View service logs
	docker compose logs -f

dev-mcp:  ## Run MCP server in development mode
	npm run dev:mcp

dev-python:  ## Run Python API in development mode
	cd python && make dev

dev-worker:  ## Run Python worker in development mode
	cd python && make worker

clean:  ## Clean build artifacts
	rm -rf node_modules shared/dist local/dist remote/dist python/.venv
	find . -name "__pycache__" -type d -exec rm -rf {} +
	find . -name "*.pyc" -delete

deploy:  ## Deploy all services
	docker compose build
	docker compose up -d
	docker compose ps

health:  ## Check health of all services
	@echo "=== Qdrant ==="
	@curl -s http://localhost:52102/health | jq || echo "❌ Failed"
	@echo "\n=== Redis ==="
	@redis-cli ping || echo "❌ Failed"
	@echo "\n=== PostgreSQL ==="
	@pg_isready -h localhost -U pulse_fetch || echo "❌ Failed"
	@echo "\n=== TEI ==="
	@curl -s http://localhost:52104/health || echo "❌ Failed"
	@echo "\n=== Python API ==="
	@curl -s http://localhost:52100/health | jq || echo "❌ Failed"
	@echo "\n=== MCP Remote ==="
	@curl -s http://localhost:3060/health | jq || echo "❌ Failed"
```

### 11.4 Port Allocation

| Port  | Service           | Protocol | Purpose              |
| ----- | ----------------- | -------- | -------------------- |
| 3060  | MCP Remote Server | HTTP     | Remote MCP transport |
| 5432  | PostgreSQL        | TCP      | Metrics database     |
| 6379  | Redis             | TCP      | Job queue + cache    |
| 52100 | Python API        | HTTP     | Webhook + search API |
| 52102 | Qdrant HTTP       | HTTP     | Vector database API  |
| 52103 | Qdrant gRPC       | gRPC     | Vector database gRPC |
| 52104 | TEI               | HTTP     | Embedding service    |

---

## 12. Testing Strategy

### 12.1 Test Organization

```
tests/
├── typescript/                    # TypeScript tests (existing)
│   ├── functional/
│   ├── integration/
│   ├── e2e/
│   └── shared/
│
├── python/                        # Python tests (migrated from fc-bridge)
│   ├── unit/
│   ├── integration/
│   └── conftest.py
│
└── integration/                   # Cross-language integration tests
    ├── test_typescript_to_python.test.ts
    ├── test_embedding_pipeline.test.ts
    ├── test_qdrant_storage.test.ts
    └── test_semantic_search_tool.test.ts
```

### 12.2 Cross-Language Integration Tests

**Test 1: TypeScript → Python Embedding**

```typescript
// tests/integration/test_embedding_pipeline.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { QdrantResourceStorage } from '../../shared/storage/resources/backends/qdrant.js';

describe('Embedding Pipeline Integration', () => {
  let storage: QdrantResourceStorage;

  beforeAll(async () => {
    storage = new QdrantResourceStorage({
      qdrantUrl: process.env.QDRANT_URL!,
      collection: 'test_collection',
      pythonServiceUrl: process.env.PYTHON_SERVICE_URL!,
      apiSecret: process.env.PYTHON_SERVICE_API_SECRET!,
    });
    await storage.init();
  });

  it('should chunk, embed, and store document', async () => {
    const url = 'https://example.com/test';
    const content =
      'This is a test document with enough content to be chunked into multiple pieces. '.repeat(50);

    const uri = await storage.write(url, content, {
      title: 'Test Document',
      language: 'en',
    });

    expect(uri).toMatch(/^qdrant:\/\//);

    // Verify storage
    const retrieved = await storage.read(uri);
    expect(retrieved.text).toBe(content);
  });

  it('should find documents by URL', async () => {
    const url = 'https://example.com/test2';
    await storage.write(url, 'Content 1', {});
    await storage.write(url, 'Content 2', {});

    const results = await storage.findByUrl(url);
    expect(results.length).toBeGreaterThanOrEqual(2);
  });
});
```

**Test 2: Semantic Search Tool**

```typescript
// tests/integration/test_semantic_search_tool.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { TestMCPClient } from '../test-utils/test-mcp-client.js';

describe('Semantic Search MCP Tool', () => {
  let client: TestMCPClient;

  beforeAll(async () => {
    client = new TestMCPClient();
    await client.connect();

    // Index test documents
    await client.callTool('index_document', {
      url: 'https://example.com/doc1',
      content: 'Machine learning is a subset of artificial intelligence.',
      metadata: { title: 'ML Intro' },
    });

    await client.callTool('index_document', {
      url: 'https://example.com/doc2',
      content: 'Python is a popular programming language for data science.',
      metadata: { title: 'Python Guide' },
    });
  });

  it('should perform semantic search', async () => {
    const result = await client.callTool('semantic_search', {
      query: 'What is AI?',
      limit: 5,
    });

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toContain('example.com/doc1');
  });

  it('should respect filters', async () => {
    const result = await client.callTool('semantic_search', {
      query: 'programming',
      limit: 5,
      filters: {
        domain: 'example.com',
      },
    });

    expect(result.content[0].text).toContain('Python');
  });
});
```

**Test 3: Python API Health**

```python
# tests/integration/test_python_api_health.py
import pytest
import httpx

@pytest.mark.asyncio
async def test_python_api_health():
    """Test Python API health endpoint."""
    async with httpx.AsyncClient() as client:
        response = await client.get("http://localhost:52100/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] in ["healthy", "degraded"]

@pytest.mark.asyncio
async def test_embedding_endpoint():
    """Test embedding generation endpoint."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "http://localhost:52100/api/embed",
            json={"text": "Test query"},
            headers={"Authorization": f"Bearer {API_SECRET}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "embedding" in data
        assert len(data["embedding"]) == 1024  # Qwen model
```

### 12.3 Test Commands

**Root package.json:**

```json
{
  "scripts": {
    "test": "npm run test:ts && npm run test:python && npm run test:integration",
    "test:ts": "vitest run --config vitest.config.ts",
    "test:python": "cd python && uv run pytest",
    "test:integration": "vitest run --config vitest.config.integration.ts",
    "test:watch": "vitest --config vitest.config.ts",
    "test:e2e": "npm run services && vitest run --config vitest.config.e2e.ts"
  }
}
```

**Makefile:**

```makefile
test-all:  ## Run all tests (TS + Python + Integration)
	npm test

test-ts:  ## Run TypeScript tests only
	npm run test:ts

test-python:  ## Run Python tests only
	cd python && uv run pytest

test-integration:  ## Run integration tests
	npm run test:integration

test-watch:  ## Run tests in watch mode
	npm run test:watch
```

---

## 13. Migration Plan

### 13.1 Migration Phases

**Phase 1: Repository Preparation (Week 1)**

Tasks:

1. Create integration branch in pulse
2. Copy fc-bridge into `python/` directory
3. Update .gitignore for new structure
4. Preserve git history with subtree merge
5. Create unified .env.example

Commands:

```bash
# In pulse repo
git checkout -b feature/fc-bridge-integration

# Add fc-bridge as subtree
git subtree add --prefix=python ~/code/fc-bridge main --squash

# Update workspace configuration
# ... (manual edits to package.json, etc.)

# Commit
git add .
git commit -m "feat: integrate fc-bridge as python workspace"
```

**Phase 2: Docker & Service Integration (Week 1-2)**

Tasks:

1. Create unified docker-compose.yml
2. Update Dockerfiles for new structure
3. Configure shared services (Qdrant, Redis, TEI)
4. Test service startup and health checks
5. Document port allocations

Verification:

```bash
make services
make health
# Should show all services healthy
```

**Phase 3: Storage Integration (Week 2-3)**

Tasks:

1. Implement Qdrant backend for TypeScript
2. Create embedding delegation endpoints in Python
3. Test write → chunk → embed → store pipeline
4. Verify read operations from both languages
5. Performance benchmarking

Test Checklist:

- [ ] QdrantResourceStorage passes all storage tests
- [ ] Embeddings generated correctly via Python API
- [ ] Multi-tier writes (raw/cleaned/extracted) work
- [ ] Semantic search returns relevant results
- [ ] Cache lookups work with extract prompts

**Phase 4: Tool Integration - Python-First (Week 3-4)**

Tasks:

1. Implement Python Firecrawl API endpoints (scrape, map, crawl, search)
2. Update TypeScript tools to delegate to Python API
3. Implement `semantic_search` MCP tool
4. Implement `index_document` MCP tool
5. Remove TypeScript Firecrawl clients
6. Update tool registration and schemas

Test Checklist:

- [ ] All Firecrawl operations route through Python
- [ ] scrape tool delegates and auto-indexes
- [ ] map, crawl, search tools delegate correctly
- [ ] semantic_search returns results
- [ ] Filters work correctly (domain, language, etc.)
- [ ] Hybrid search mode works
- [ ] index_document successfully indexes content
- [ ] TypeScript Firecrawl clients removed

**Phase 5: Testing & Documentation (Week 4-5)**

Tasks:

1. Write cross-language integration tests
2. Update README with new capabilities
3. Create migration guide for existing users
4. Update CLAUDE.md with new architecture
5. Document all new environment variables

Deliverables:

- [ ] Integration test suite passing
- [ ] Updated README.md
- [ ] Migration guide in docs/
- [ ] Updated CLAUDE.md
- [ ] Updated .env.example with comments

**Phase 6: Production Deployment (Week 5-6)**

Tasks:

1. Deploy to staging environment
2. Performance testing and optimization
3. Monitor logs and metrics
4. Create runbook for operations
5. Train team on new architecture

Verification:

- [ ] All services running stably
- [ ] No memory leaks or resource issues
- [ ] Latency within acceptable ranges
- [ ] Error handling works correctly
- [ ] Monitoring and alerts configured

### 13.2 Data Migration

**Scenario 1: No Existing Data**

Fresh installation → No migration needed, proceed with unified setup

**Scenario 2: Existing FC-Bridge Data**

**Qdrant Migration:**

Current: `firecrawl_docs` collection
Target: `pulse_fetch_unified` collection

Options:

1. **Rename Collection:**

   ```python
   # In Qdrant
   # Collections can't be renamed directly
   # Must create new and copy points

   from qdrant_client import QdrantClient

   client = QdrantClient(url="http://localhost:52102")

   # Get all points from old collection
   points, _ = client.scroll(
       collection_name="firecrawl_docs",
       limit=10000
   )

   # Create new collection
   client.create_collection(
       collection_name="pulse_fetch_unified",
       vectors_config={"size": 1024, "distance": "Cosine"}
   )

   # Upsert to new collection
   client.upsert(
       collection_name="pulse_fetch_unified",
       points=points
   )

   # Verify count
   old_count = client.count("firecrawl_docs")
   new_count = client.count("pulse_fetch_unified")
   assert old_count == new_count

   # Delete old collection (after verification)
   client.delete_collection("firecrawl_docs")
   ```

2. **Keep Both Collections:**
   - Configure `QDRANT_COLLECTION=firecrawl_docs` initially
   - Gradually migrate to new collection name
   - Allows rollback if needed

**BM25 Index Migration:**

Current: `data/bm25/*.pkl` files
Target: Same location, no changes needed

**PostgreSQL Migration:**

Current: Metrics tables (if used)
Target: Same schema, no changes needed

**Scenario 3: Existing pulse Cache**

**Memory Storage → Qdrant:**

Memory storage is ephemeral, no migration needed. New storage backend will start fresh.

**Filesystem Storage → Qdrant:**

Create migration script to read filesystem resources and index into Qdrant:

```typescript
// scripts/migrate-filesystem-to-qdrant.ts
import { FileSystemResourceStorage } from '../shared/storage/resources/backends/filesystem.js';
import { QdrantResourceStorage } from '../shared/storage/resources/backends/qdrant.js';

async function migrate() {
  const fsStorage = new FileSystemResourceStorage('./data/resources');
  const qdrantStorage = new QdrantResourceStorage({
    qdrantUrl: process.env.QDRANT_URL!,
    collection: process.env.QDRANT_COLLECTION!,
    pythonServiceUrl: process.env.PYTHON_SERVICE_URL!,
    apiSecret: process.env.PYTHON_SERVICE_API_SECRET!,
  });

  await qdrantStorage.init();

  // Get all resources from filesystem
  const resources = await fsStorage.list();
  console.log(`Found ${resources.length} resources to migrate`);

  let migrated = 0;
  for (const resource of resources) {
    try {
      const content = await fsStorage.read(resource.uri);
      await qdrantStorage.write(resource.metadata.url, content.text!, resource.metadata);
      migrated++;
      if (migrated % 100 === 0) {
        console.log(`Migrated ${migrated}/${resources.length}`);
      }
    } catch (error) {
      console.error(`Failed to migrate ${resource.uri}:`, error);
    }
  }

  console.log(`Migration complete: ${migrated}/${resources.length} successful`);
}

migrate().catch(console.error);
```

Run with:

```bash
tsx scripts/migrate-filesystem-to-qdrant.ts
```

### 13.3 Rollback Plan

**If Integration Fails:**

1. **Stop New Services:**

   ```bash
   docker compose down
   ```

2. **Restore Original Repos:**

   ```bash
   # pulse
   git checkout main
   git branch -D feature/fc-bridge-integration

   # FC-bridge
   cd ~/code/fc-bridge
   git checkout main
   ```

3. **Restart Original Services:**

   ```bash
   # FC-bridge
   cd ~/code/fc-bridge
   docker compose up -d

   # pulse (if using remote)
   cd ~/code/pulse
   docker compose up -d
   ```

**Data Preservation:**

- Qdrant data persists in volume `qdrant_data`
- BM25 index persists in `./data/bm25`
- Both can be reused if rollback occurs

---

## 14. Implementation Phases

### Phase 1: Foundation (Week 1)

**Goals:**

- ✅ Repository structure in place
- ✅ Services running in Docker
- ✅ Basic connectivity verified

**Tasks:**

1. Create feature branch
2. Merge fc-bridge as subtree
3. Create unified docker-compose.yml
4. Update .gitignore
5. Test service startup

**Success Criteria:**

- [ ] All services start without errors
- [ ] Health checks pass for all services
- [ ] Python API accessible at localhost:52100
- [ ] Qdrant accessible at localhost:52102

### Phase 2: Storage Layer (Week 2-3)

**Goals:**

- ✅ Qdrant backend implemented
- ✅ Embedding pipeline working
- ✅ Storage tests passing

**Tasks:**

1. Implement QdrantResourceStorage class
2. Create Python embedding endpoints
3. Write storage integration tests
4. Benchmark performance
5. Update factory with Qdrant option

**Success Criteria:**

- [ ] write() successfully stores with embeddings
- [ ] read() retrieves content correctly
- [ ] findByUrl() works with semantic search
- [ ] Multi-tier writes (raw/cleaned/extracted) work
- [ ] Performance acceptable (<500ms for write)

### Phase 3: MCP Tools - Python-First (Week 3-4)

**Goals:**

- ✅ Python Firecrawl API implemented
- ✅ TypeScript tools delegating to Python
- ✅ New semantic search tools working
- ✅ Tool tests passing

**Tasks:**

1. Implement Python Firecrawl API endpoints
2. Update TypeScript tools to delegate to Python
3. Remove TypeScript Firecrawl clients
4. Implement semantic_search tool
5. Implement index_document tool
6. Create tool integration tests
7. Update documentation

**Success Criteria:**

- [ ] All Firecrawl operations route through Python
- [ ] scrape, map, crawl, search tools delegate correctly
- [ ] semantic_search returns relevant results
- [ ] Hybrid search mode works
- [ ] Filters apply correctly
- [ ] index_document processes documents
- [ ] Auto-index on scrape works
- [ ] TypeScript Firecrawl clients removed

### Phase 4: Testing & Refinement (Week 4-5)

**Goals:**

- ✅ Comprehensive test coverage
- ✅ Documentation complete
- ✅ Known issues resolved

**Tasks:**

1. Write cross-language integration tests
2. Performance testing and optimization
3. Update all documentation
4. Create migration guides
5. Fix bugs and edge cases

**Success Criteria:**

- [ ] Integration tests passing
- [ ] Test coverage >85%
- [ ] README.md updated
- [ ] Migration guide complete
- [ ] No critical bugs

### Phase 5: Production Ready (Week 5-6)

**Goals:**

- ✅ Deployed to staging
- ✅ Production-ready
- ✅ Team trained

**Tasks:**

1. Deploy to staging environment
2. Load testing and monitoring
3. Create operational runbook
4. Train team on new system
5. Final security review

**Success Criteria:**

- [ ] Staging deployment stable
- [ ] Load tests passing
- [ ] Monitoring configured
- [ ] Team comfortable with operations
- [ ] Security review passed

---

## 15. Risk Assessment

### 15.1 Technical Risks

| Risk                                     | Likelihood | Impact   | Mitigation                                             |
| ---------------------------------------- | ---------- | -------- | ------------------------------------------------------ |
| **Cross-language communication latency** | Medium     | Medium   | Use connection pooling, HTTP/2, local deployment       |
| **Qdrant performance issues**            | Low        | High     | Benchmark early, optimize queries, use proper indexing |
| **TEI service crashes**                  | Medium     | High     | Implement retry logic, health checks, restart policies |
| **Dependency conflicts (TS ↔ Python)**  | Low        | Low      | Use separate virtual environments, test thoroughly     |
| **Storage migration data loss**          | Low        | Critical | Backup before migration, verify counts, test rollback  |

### 15.2 Integration Risks

| Risk                          | Likelihood | Impact | Mitigation                                         |
| ----------------------------- | ---------- | ------ | -------------------------------------------------- |
| **Incompatible data formats** | Medium     | Medium | Define schemas upfront, validate at boundaries     |
| **Authentication issues**     | Low        | Medium | Test auth thoroughly, use strong secrets           |
| **Port conflicts**            | Low        | Low    | Document ports, check availability, use high ports |
| **Service dependencies**      | Medium     | High   | Implement health checks, graceful degradation      |

### 15.3 Operational Risks

| Risk                        | Likelihood | Impact | Mitigation                                        |
| --------------------------- | ---------- | ------ | ------------------------------------------------- |
| **Deployment complexity**   | Medium     | Medium | Automate with Makefile, document thoroughly       |
| **Monitoring gaps**         | Medium     | Medium | Implement comprehensive health checks, metrics    |
| **Team unfamiliarity**      | High       | Medium | Training sessions, runbooks, pair programming     |
| **Breaking existing users** | Low        | High   | Maintain backward compatibility, migration guides |

### 15.4 Mitigation Strategies

**1. Phased Rollout:**

- Deploy to staging first
- Gradual rollout to production
- Canary deployments for new features

**2. Comprehensive Testing:**

- Unit, integration, and E2E tests
- Load testing for performance verification
- Security testing for vulnerabilities

**3. Monitoring & Alerting:**

- Health checks for all services
- Metrics collection (request latency, error rates)
- Alerts for service failures

**4. Documentation:**

- Architecture diagrams
- API documentation
- Operational runbooks
- Troubleshooting guides

**5. Rollback Plan:**

- Documented rollback procedures
- Data backups before migration
- Ability to revert to separate services

---

## 16. Success Criteria

### 16.1 Functional Requirements

**Breaking Change Notice:** This is v1 → v2 migration. Python service becomes required.

- [ ] **All existing MCP tools work** with Python-First delegation
- [ ] **All Firecrawl operations** route through Python API
- [ ] **New semantic search tool** returns relevant results
- [ ] **Qdrant storage backend** functions correctly
- [ ] **Webhook server** receives and processes Firecrawl events
- [ ] **Embedding generation** works via Python service
- [ ] **Hybrid search** combines vector + keyword effectively
- [ ] **Automatic indexing** works for all scraped content

### 16.2 Non-Functional Requirements

- [ ] **Performance:** Search latency <500ms p95
- [ ] **Performance:** Indexing throughput >10 docs/sec
- [ ] **Reliability:** 99.9% uptime for API services
- [ ] **Scalability:** Handle 1000+ docs in Qdrant
- [ ] **Security:** All secrets properly managed
- [ ] **Monitoring:** Health checks and metrics in place

### 16.3 Documentation Requirements

- [ ] **README.md** updated with new capabilities
- [ ] **CLAUDE.md** reflects new architecture
- [ ] **Migration guide** for existing users
- [ ] **API documentation** for all endpoints
- [ ] **Configuration guide** for all variables
- [ ] **Troubleshooting guide** for common issues

### 16.4 Testing Requirements

- [ ] **Unit tests:** >85% coverage for new code
- [ ] **Integration tests:** All critical paths covered
- [ ] **E2E tests:** Full workflow scenarios
- [ ] **Load tests:** Performance verified under load
- [ ] **Security tests:** No critical vulnerabilities

### 16.5 Deployment Requirements

- [ ] **Docker Compose** working configuration
- [ ] **All services** start successfully
- [ ] **Health checks** passing for all services
- [ ] **Monitoring** configured and alerting
- [ ] **Backups** automated for persistent data

---

## Conclusion

This integration plan provides a comprehensive roadmap for merging fc-bridge into pulse, creating **pulse v2.0**: a unified platform with Python-First architecture and enhanced semantic search capabilities. The phased approach minimizes risk while maximizing value delivery.

**Key Takeaways:**

1. **Python-First Architecture:** ALL Firecrawl operations route through Python (single integration point)
2. **TypeScript as Interface:** MCP tools become thin HTTP wrappers for Python API
3. **Automatic Indexing:** All scraped content automatically indexed for semantic search
4. **Shared Infrastructure:** Single instances of services reduce complexity
5. **Breaking Change:** v1 → v2 migration (Python service becomes required dependency)

**Next Steps:**

1. Review this plan with team
2. Get approval for architecture decisions
3. Begin Phase 1: Repository preparation
4. Establish CI/CD pipeline for merged repo
5. Schedule regular check-ins during implementation

**Estimated Timeline:** 5-6 weeks for full integration

**Estimated Effort:** 1-2 engineers full-time

---

_This integration plan is a living document and should be updated as implementation progresses._
