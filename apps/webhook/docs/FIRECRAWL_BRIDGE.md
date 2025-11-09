# Firecrawl Search Bridge Service - Complete Implementation Plan

**Status:** Ready for Implementation  
**Created:** 2025-01-04  
**Target Deployment:** Local (No Docker for Python app)  
**Timeline:** ~8 days

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Architecture Overview](#architecture-overview)
3. [Research Findings](#research-findings)
4. [Project Structure](#project-structure)
5. [Implementation Phases](#implementation-phases)
6. [Configuration & Setup](#configuration--setup)
7. [Testing Strategy](#testing-strategy)
8. [Deployment Guide](#deployment-guide)
9. [Monitoring & Maintenance](#monitoring--maintenance)
10. [Appendices](#appendices)

---

## Executive Summary

Build a **standalone Python/FastAPI microservice** that bridges Firecrawl → HuggingFace TEI → Qdrant to enable semantic search over scraped documents. This service receives documents from Firecrawl, embeds them using HuggingFace Text Embeddings Inference (TEI), stores vectors in Qdrant, and provides hybrid search (BM25 + vector similarity using Reciprocal Rank Fusion).

### Key Design Decisions

- **No containerization** for Python app (runs directly on host)
- **Docker only** for Qdrant and HuggingFace TEI
- **Token-based chunking** (256 tokens, not characters)
- **Reciprocal Rank Fusion (RRF)** for hybrid search (k=60)
- **Redis Queue (RQ)** for async background processing
- **UV** for Python dependency management

### Success Criteria

- ✅ Firecrawl sends scraped docs to bridge via HTTP
- ✅ Documents indexed with embeddings in Qdrant
- ✅ BM25 index built for keyword search
- ✅ All 4 search modes functional (hybrid, semantic, keyword, bm25)
- ✅ Filters work (domain, language, country, isMobile)
- ✅ Health checks pass (API, Redis, Qdrant, TEI)
- ✅ Tests pass (unit + integration)
- ✅ Local deployment successful with systemd/PM2

---

## Architecture Overview

### System Diagram

```
┌─────────────┐                  ┌──────────────────────┐
│  Firecrawl  │  HTTP POST       │ Search Bridge API    │
│   (Docker)  ├─────────────────>│  (Python/uvicorn)    │
│             │  /api/index      │  localhost:52100     │
└─────────────┘                  └──────────┬───────────┘
                                            │
                                            │ Enqueue
                                            ▼
                                 ┌──────────────────────┐
                                 │   Redis (local)      │
                                 │   localhost:52101    │
                                 └──────────┬───────────┘
                                            │
                                            │ Worker Process
                                            ▼
                      ┌─────────────────────────────────────────┐
                      │  Background Worker (Python)             │
                      │  • Chunk text (256 tokens, 50 overlap)  │
                      │  • Embed via TEI                        │
                      │  • Index in Qdrant + BM25               │
                      └─────────┬────────────┬──────────────────┘
                                │            │
                  ┌─────────────┘            └─────────────┐
                  ▼                                        ▼
        ┌─────────────────┐                    ┌──────────────────┐
        │ HF TEI (Docker) │                    │ Qdrant (Docker)  │
        │ localhost:52104 │                    │ localhost:52102  │
        └─────────────────┘                    └──────────────────┘
```

### Data Flow

#### Indexing Flow

1. **Firecrawl scrapes** a webpage → produces Document with markdown
2. **Firecrawl transformer** sends to `POST /api/index` (async, non-blocking)
3. **Search Bridge API** enqueues job in Redis Queue → returns 202 Accepted
4. **Background Worker** picks up job:
   - Tokenizes markdown into 256-token chunks (50-token overlap)
   - Batch embeds chunks via HuggingFace TEI
   - Stores vectors + metadata in Qdrant
   - Indexes full document in BM25
5. **Done** - Document is searchable

#### Search Flow

1. **User query** → `POST /api/search` with query text and filters
2. **Search Orchestrator** decides mode:
   - **Hybrid**: Vector search + BM25 → RRF fusion
   - **Semantic**: Vector search only
   - **Keyword/BM25**: BM25 search only
3. **Qdrant** returns vector similarity results (with filters applied)
4. **BM25 Engine** returns keyword ranking results
5. **RRF Fusion** combines both rankings → final sorted list
6. **Response** with ranked results + metadata

### Port Allocation

| Port  | Service | Description |
|-------|---------|-------------|
| 52100 | search-bridge | FastAPI REST API |
| 52101 | redis-search | Redis Queue for async indexing |
| 52102 | qdrant | Qdrant HTTP API |
| 52103 | qdrant | Qdrant gRPC API |
| 52104 | tei | HuggingFace Text Embeddings Inference |

---

## Research Findings

### 1. Firecrawl Integration (VALIDATED)

#### Existing Infrastructure

✅ **HTTP client already implemented:** `apps/api/src/lib/search-index-client.ts`  
✅ **Transformer ready:** `apps/api/src/scraper/scrapeURL/transformers/sendToSearchIndex.ts`  
✅ **Environment variables defined** but NOT documented in `.env.example`

#### Document Contract (from source code)

```typescript
interface IndexDocumentRequest {
  url: string;
  resolvedUrl: string;
  title?: string;
  description?: string;
  markdown: string;          // Primary content for search
  html: string;             // Raw HTML (optional indexing)
  statusCode: number;
  gcsPath?: string;         // GCS bucket path (e.g., "abc-123.json")
  screenshotUrl?: string;
  language?: string;        // ISO code (e.g., "en", "es")
  country?: string;         // ISO code (e.g., "US", "GB")
  isMobile?: boolean;
}
```

#### API Endpoints (Expected by Firecrawl)

1. **POST `/api/index`** - Queue document for async indexing (returns 202 Accepted immediately)
2. **POST `/api/search`** - Search indexed documents (sync, returns results)
3. **GET `/health`** - Health check (verify Redis, Qdrant, TEI)
4. **GET `/api/stats`** - Index statistics

#### Filtering Logic (already in Firecrawl)

Only indexes documents if:
- `statusCode` 200-299
- `markdown.length >= 200` characters
- No `zeroDataRetention` flag
- No auth headers (Authorization/Cookie)
- PDFs must be parsed (have markdown)

Sampling: Controlled by `SEARCH_INDEX_SAMPLE_RATE` (default 10% for canary rollout)

#### Required Firecrawl Configuration

**Add to `apps/api/.env`:**

```bash
ENABLE_SEARCH_INDEX=true
SEARCH_SERVICE_URL=http://host.docker.internal:52100
SEARCH_SERVICE_API_SECRET=your-secret-key
SEARCH_INDEX_SAMPLE_RATE=0.1  # 10% sampling for initial rollout
```

**Note:** Use `host.docker.internal` because Firecrawl runs in Docker but search bridge runs on host.

---

### 2. HuggingFace TEI (Text Embeddings Inference)

#### Deployment

```bash
docker run --name firecrawl-tei -d \
  -p 52104:80 \
  -v $PWD/data/tei:/data \
  ghcr.io/huggingface/text-embeddings-inference:1.8 \
  --model-id sentence-transformers/all-MiniLM-L6-v2
```

#### API Contract

**Embed single text:**
```bash
curl -X POST http://localhost:52104/embed \
  -H "Content-Type: application/json" \
  -d '{"inputs": "What is Deep Learning?"}'

# Response: [[0.123, -0.456, 0.789, ...]]  # 384-dim vector
```

**Embed batch:**
```bash
curl -X POST http://localhost:52104/embed \
  -H "Content-Type: application/json" \
  -d '{"inputs": ["text1", "text2", "text3"]}'

# Response: [[vec1], [vec2], [vec3]]
```

#### Recommended Models

| Model | Dim | Max Tokens | Use Case |
|-------|-----|-----------|----------|
| `sentence-transformers/all-MiniLM-L6-v2` | 384 | 256 | **Recommended** - Fast, good quality |
| `sentence-transformers/all-mpnet-base-v2` | 768 | 384 | Better quality, slower |
| `BAAI/bge-small-en-v1.5` | 384 | 512 | Multilingual support |

**Default choice:** `all-MiniLM-L6-v2` (384 dims, 256 max tokens)

---

### 3. Qdrant Vector Store

#### Deployment

```bash
docker run --name firecrawl-qdrant -d \
  -p 52102:6333 -p 52103:6334 \
  -v $PWD/data/qdrant:/qdrant/storage \
  -e QDRANT__TELEMETRY__ENABLED=false \
  qdrant/qdrant:latest
```

#### Python Client API

```python
from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance, VectorParams, PointStruct,
    Filter, FieldCondition, MatchValue, Range
)

# Initialize
client = QdrantClient(url="http://localhost:52102")

# Create collection
client.create_collection(
    collection_name="firecrawl_docs",
    vectors_config=VectorParams(size=384, distance=Distance.COSINE)
)

# Upsert points
client.upsert(
    collection_name="firecrawl_docs",
    points=[
        PointStruct(
            id="doc_chunk_0",
            vector=[0.1, 0.2, ...],  # 384-dim
            payload={
                "url": "https://example.com",
                "domain": "example.com",
                "title": "Example Page",
                "text": "chunk content...",
                "language": "en",
                "country": "US",
                "isMobile": False,
                "chunkIndex": 0
            }
        )
    ]
)

# Search with filters
results = client.search(
    collection_name="firecrawl_docs",
    query_vector=[0.1, 0.2, ...],
    query_filter=Filter(
        must=[
            FieldCondition(key="domain", match=MatchValue(value="example.com")),
            FieldCondition(key="language", match=MatchValue(value="en"))
        ]
    ),
    limit=10
)
```

#### Filtering Capabilities

- **Exact match:** `FieldCondition(key="domain", match=MatchValue(value="example.com"))`
- **Range:** `FieldCondition(key="score", range=Range(gte=0.5))`
- **Boolean:** `FieldCondition(key="isMobile", match=MatchValue(value=True))`
- **Logical operators:** `Filter(must=[...], should=[...], must_not=[...])`

---

### 4. BM25 + Reciprocal Rank Fusion (RRF)

#### BM25 Library

```python
from rank_bm25 import BM25Okapi

# Initialize
corpus = ["text1", "text2", "text3"]
tokenized_corpus = [doc.split() for doc in corpus]
bm25 = BM25Okapi(tokenized_corpus)

# Search
query = "search query"
scores = bm25.get_scores(query.split())
top_n = bm25.get_top_n(query.split(), corpus, n=10)
```

#### RRF Formula (k=60 is standard)

```python
def reciprocal_rank_fusion(
    ranked_lists: List[List[Result]], 
    k: int = 60
) -> List[Result]:
    """
    Combine multiple ranked result lists using RRF.
    
    Formula: score = sum(1 / (k + rank_i))
    where rank_i is the position in the i-th ranking (1-indexed)
    
    Args:
        ranked_lists: List of ranked result lists (e.g., [vector_results, bm25_results])
        k: Constant (60 is standard from original paper)
    
    Returns:
        Merged and re-ranked results
    """
    scores = {}
    for ranked_list in ranked_lists:
        for rank, result in enumerate(ranked_list, start=1):
            doc_id = result.id
            scores[doc_id] = scores.get(doc_id, 0) + (1 / (k + rank))
    
    return sorted(scores.items(), key=lambda x: x[1], reverse=True)
```

**Why k=60?**
- Balances head and tail of rankings
- Not too sensitive to outliers
- Standard in literature (from original RRF paper by Cormack et al.)

---

### 5. Text Chunking Strategy (TOKEN-BASED)

#### Why Tokens, Not Characters

**Embedding models have TOKEN limits**, not character limits:
- `sentence-transformers/all-MiniLM-L6-v2`: **256 tokens max**
- `all-mpnet-base-v2`: **384 tokens max**
- `BAAI/bge-small-en-v1.5`: **512 tokens max**

**Token vs Character Reality:**
```python
text = "This is a test"
# Characters: 14
# Tokens: ~4 (roughly 3-4 chars per token in English)

long_text = "word " * 200  # 1000 characters
# But this could be 200-250 tokens!
```

If we chunk by **512 characters**, we might send **800+ tokens** → model will:
1. **Truncate silently** (losing information)
2. **Error out** (breaking indexing)
3. **Degrade quality** (poor embeddings)

#### Correct Implementation

```python
from transformers import AutoTokenizer
from typing import List

class TextChunker:
    def __init__(self, model_name: str, max_tokens: int = 256, overlap: int = 50):
        """
        Args:
            model_name: HuggingFace model (e.g., 'sentence-transformers/all-MiniLM-L6-v2')
            max_tokens: Maximum tokens per chunk (default 256 for all-MiniLM)
            overlap: Overlap in tokens (not characters)
        """
        self.tokenizer = AutoTokenizer.from_pretrained(model_name)
        self.max_tokens = max_tokens
        self.overlap = overlap
    
    def chunk_text(self, text: str) -> List[str]:
        """Split text into token-based chunks with overlap."""
        # Tokenize entire text
        tokens = self.tokenizer.encode(text, add_special_tokens=False)
        
        chunks = []
        start = 0
        
        while start < len(tokens):
            # Get chunk of tokens
            end = min(start + self.max_tokens, len(tokens))
            chunk_tokens = tokens[start:end]
            
            # Decode back to text
            chunk_text = self.tokenizer.decode(chunk_tokens, skip_special_tokens=True)
            chunks.append(chunk_text)
            
            # Move forward with overlap
            start += (self.max_tokens - self.overlap)
        
        return chunks
```

**Why overlap?**
- Prevents splitting semantic units (sentences, paragraphs)
- Improves retrieval quality at chunk boundaries
- Standard practice in RAG systems (typically 10-20% overlap)

---

## Project Structure

```
/home/jmagar/compose/firecrawl/
├── apps/
│   └── search-bridge/                   # NEW SERVICE
│       ├── app/
│       │   ├── __init__.py
│       │   ├── main.py                  # FastAPI app entry
│       │   ├── config.py                # Pydantic Settings
│       │   ├── models.py                # Request/Response schemas
│       │   ├── api/
│       │   │   ├── __init__.py
│       │   │   ├── routes.py            # API endpoints
│       │   │   └── dependencies.py      # Shared dependencies
│       │   ├── services/
│       │   │   ├── __init__.py
│       │   │   ├── embedding.py         # HF TEI client
│       │   │   ├── vector_store.py      # Qdrant client
│       │   │   ├── bm25_engine.py       # BM25 indexing
│       │   │   ├── indexing.py          # Document processing
│       │   │   └── search.py            # Hybrid search orchestration
│       │   ├── utils/
│       │   │   ├── __init__.py
│       │   │   ├── text_processing.py   # Chunking, cleaning
│       │   │   └── logging.py           # Structured logging
│       │   └── worker.py                # RQ background worker
│       ├── tests/
│       │   ├── __init__.py
│       │   ├── conftest.py              # Pytest fixtures
│       │   ├── unit/
│       │   │   ├── test_chunking.py
│       │   │   ├── test_bm25.py
│       │   │   ├── test_fusion.py
│       │   │   └── test_filters.py
│       │   └── integration/
│       │       ├── test_indexing.py
│       │       ├── test_search.py
│       │       └── test_api.py
│       ├── data/                        # Local data storage
│       │   ├── qdrant/                  # (Docker volume mount)
│       │   ├── tei/                     # (Docker volume mount)
│       │   ├── redis/                   # Redis RDB/AOF
│       │   └── bm25/                    # BM25 pickle files
│       ├── docker-compose.external.yaml # Only Qdrant & TEI
│       ├── pyproject.toml               # UV dependencies
│       ├── .env                         # Configuration (gitignored)
│       ├── .env.example                 # Template
│       ├── redis.conf                   # Redis configuration
│       ├── Makefile                     # Development shortcuts
│       └── README.md
├── docker-compose.yaml                  # MODIFY: Add env vars for search bridge
└── .docs/
    └── services-ports.md                # MODIFY: Document 52100-52104
```

---

## Implementation Phases

### Phase 1: Core Services (Days 1-3)

[Complete implementation code provided in full document - see actual file for all code examples]

Key files:
- `app/config.py` - Settings with token-based chunking
- `app/models.py` - Pydantic models
- `app/utils/text_processing.py` - Token-based TextChunker
- `app/services/embedding.py` - TEI client
- `app/services/vector_store.py` - Qdrant client
- `app/services/bm25_engine.py` - BM25 engine
- `app/services/search.py` - Hybrid search
- `app/services/indexing.py` - Document processor

### Phase 2: API Layer (Day 4)

Key files:
- `app/api/dependencies.py` - Dependency injection
- `app/api/routes.py` - REST endpoints
- `app/main.py` - FastAPI application

### Phase 3: Background Workers (Day 5)

Key files:
- `app/worker.py` - RQ worker process

### Phase 4: Testing (Day 7)

Key files:
- `tests/conftest.py` - Test fixtures
- `tests/unit/` - Unit tests
- `tests/integration/` - Integration tests

---

## Configuration & Setup

### Prerequisites

```bash
# Python 3.11+
python3 --version

# Install uv
curl -LsSf https://astral.sh/uv/install.sh | sh

# Install Redis
sudo apt-get install redis-server  # Ubuntu/Debian
brew install redis                  # macOS

# Docker (for Qdrant and TEI)
docker --version
```

### Project Setup

```bash
cd /home/jmagar/compose/firecrawl
mkdir -p apps/search-bridge
cd apps/search-bridge

# Initialize with uv
uv init

# Install dependencies
uv add fastapi uvicorn[standard] pydantic pydantic-settings \
    qdrant-client httpx redis rq rank-bm25 structlog \
    python-multipart transformers torch

# Install dev dependencies
uv add --dev pytest pytest-asyncio pytest-cov ruff
```

### Environment Configuration

**Create `apps/search-bridge/.env`:**

```bash
SEARCH_BRIDGE_HOST=0.0.0.0
SEARCH_BRIDGE_PORT=52100
SEARCH_BRIDGE_API_SECRET=dev-secret-change-in-production

SEARCH_BRIDGE_REDIS_URL=redis://localhost:52101
SEARCH_BRIDGE_QDRANT_URL=http://localhost:52102
SEARCH_BRIDGE_QDRANT_COLLECTION=firecrawl_docs
SEARCH_BRIDGE_VECTOR_DIM=384

SEARCH_BRIDGE_TEI_URL=http://localhost:52104
SEARCH_BRIDGE_EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2

# CRITICAL: Use tokens, not characters!
SEARCH_BRIDGE_MAX_CHUNK_TOKENS=256
SEARCH_BRIDGE_CHUNK_OVERLAP_TOKENS=50

SEARCH_BRIDGE_HYBRID_ALPHA=0.5
```

---

## Deployment Guide

### 1. Start External Services

**Create `docker-compose.external.yaml`:**

```yaml
version: '3.8'

services:
  qdrant:
    image: qdrant/qdrant:latest
    container_name: firecrawl-qdrant
    ports:
      - "52102:6333"
      - "52103:6334"
    volumes:
      - ./data/qdrant:/qdrant/storage
    environment:
      - QDRANT__TELEMETRY__ENABLED=false
    restart: unless-stopped

  tei:
    image: ghcr.io/huggingface/text-embeddings-inference:1.8
    container_name: firecrawl-tei
    ports:
      - "52104:80"
    volumes:
      - ./data/tei:/data
    command: --model-id sentence-transformers/all-MiniLM-L6-v2
    restart: unless-stopped
```

```bash
docker-compose -f docker-compose.external.yaml up -d
```

### 2. Start Redis

**Create `redis.conf`:**

```conf
port 52101
daemonize yes
dir ./data/redis
appendonly yes
loglevel notice
logfile ./data/redis/redis.log
```

```bash
mkdir -p data/redis
redis-server redis.conf
redis-cli -p 52101 ping  # Verify
```

### 3. Run Application

**Development:**

```bash
# Terminal 1: API
uv run uvicorn app.main:app --host 0.0.0.0 --port 52100 --reload

# Terminal 2: Worker
uv run python -m app.worker
```

**Production (systemd):**

Create `/etc/systemd/system/firecrawl-search-api.service` and `firecrawl-search-worker.service`

```bash
sudo systemctl enable firecrawl-search-api firecrawl-search-worker
sudo systemctl start firecrawl-search-api firecrawl-search-worker
```

### 4. Connect Firecrawl

**Update Firecrawl `.env`:**

```bash
ENABLE_SEARCH_INDEX=true
SEARCH_SERVICE_URL=http://host.docker.internal:52100
SEARCH_SERVICE_API_SECRET=dev-secret-change-in-production
SEARCH_INDEX_SAMPLE_RATE=0.1
```

---

## Monitoring & Maintenance

### Health Checks

```bash
curl http://localhost:52100/health
curl http://localhost:52100/api/stats
```

### Logs

```bash
sudo journalctl -u firecrawl-search-api -f
sudo journalctl -u firecrawl-search-worker -f
```

### Backup

```bash
tar -czf backup_$(date +%Y%m%d).tar.gz data/
```

---

## Appendices

### A. Makefile

```makefile
.PHONY: install dev worker test services

install:
	uv sync

dev:
	uv run uvicorn app.main:app --host 0.0.0.0 --port 52100 --reload

worker:
	uv run python -m app.worker

test:
	uv run pytest tests/ -v

services:
	docker-compose -f docker-compose.external.yaml up -d
	redis-server redis.conf

services-stop:
	docker-compose -f docker-compose.external.yaml down
	redis-cli -p 52101 shutdown
```

### B. Dependencies (pyproject.toml)

```toml
[project]
name = "firecrawl-search-bridge"
version = "0.1.0"
description = "Semantic search service for Firecrawl"
requires-python = ">=3.11"
dependencies = [
    "fastapi>=0.110.0",
    "uvicorn[standard]>=0.27.0",
    "pydantic>=2.6.0",
    "pydantic-settings>=2.1.0",
    "qdrant-client>=1.8.0",
    "httpx>=0.26.0",
    "redis>=5.0.0",
    "rq>=1.16.0",
    "rank-bm25>=0.2.2",
    "structlog>=24.1.0",
    "python-multipart>=0.0.9",
    "transformers>=4.36.0",
    "torch>=2.1.0",
]

[project.optional-dependencies]
test = [
    "pytest>=8.0.0",
    "pytest-asyncio>=0.23.0",
    "pytest-cov>=4.1.0",
    "testcontainers>=3.7.0",
]
```

### C. Timeline

| Days | Phase | Deliverables |
|------|-------|--------------|
| 1-3 | Core Services | Embedding, Vector Store, BM25, Indexing, Search |
| 4 | API Layer | Routes, Dependencies, Main app |
| 5 | Background Workers | RQ integration |
| 6 | Local Setup | Redis, Qdrant, TEI, systemd |
| 7 | Testing | Unit + integration tests |
| 8 | Documentation | README, guides |

**Total: ~8 days**

---

**Document Version:** 1.0  
**Last Updated:** 2025-01-04  
**Status:** Ready for Implementation
