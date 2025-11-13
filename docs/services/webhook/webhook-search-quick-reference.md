# Webhook Search & Indexing - Quick Reference

## Pipeline Stages (Document Ingestion)

```
Raw Document (from Firecrawl)
         ↓
     [CLEANING]  → clean_text() removes control chars
         ↓
    [CHUNKING]   → semantic-text-splitter: 256 tokens, 50 overlap
         ↓
   [EMBEDDING]   → HF TEI /embed: batch request for efficiency
         ↓
   ┌───────────────────────────┐
   ├─ VECTOR INDEXING         │  Parallel
   │  ├─ Qdrant upsert        │
   │  ├─ COSINE distance      │
   │  └─ UUID + vector + meta │
   │                           │
   ├─ KEYWORD INDEXING        │
   │  ├─ BM25Okapi index      │
   │  ├─ File lock protection │
   │  └─ Pickle persistence   │
   └───────────────────────────┘
         ↓
   Indexed in both systems
```

## Search Modes

### 1. Semantic (Vector Only)
```
Query → Embed with TEI → Search Qdrant (cosine similarity) → Return chunks
Performance: ~100-300ms
Strength: Conceptual matching
Weakness: Requires TEI server
```

### 2. Keyword (BM25 Only)
```
Query → Tokenize → BM25.get_scores() → Filter & sort → Return documents
Performance: ~1-10ms
Strength: Exact matches, always available
Weakness: No semantic understanding
```

### 3. Hybrid (RRF Fusion)
```
Query ──┬→ [Vector Search] ──┐
        │                    ├→ RRF Fusion → Deduplicate → Return merged
        └→ [BM25 Search] ────┘

RRF Formula: score = sum(1/(k+rank)) where k=60
Performance: ~100-300ms (parallel execution)
Strength: Best of both worlds
```

---

## Key Files & Classes

| File | Class | Purpose |
|------|-------|---------|
| `services/search.py` | `SearchOrchestrator` | Orchestrates hybrid search |
| `services/search.py` | `reciprocal_rank_fusion()` | Merges vector + BM25 results |
| `services/indexing.py` | `IndexingService` | Orchestrates full indexing pipeline |
| `services/embedding.py` | `EmbeddingService` | HF TEI client (batch embeddings) |
| `services/vector_store.py` | `VectorStore` | Qdrant client (vector search) |
| `services/bm25_engine.py` | `BM25Engine` | BM25 index with file locking |
| `utils/text_processing.py` | `TextChunker` | Token-based chunking (semantic-text-splitter) |
| `utils/text_processing.py` | `clean_text()` | Text cleaning & normalization |
| `api/routers/search.py` | `search_documents()` | POST /search endpoint |
| `api/routers/indexing.py` | `index_document()` | POST /index endpoint |

---

## Configuration (config.py)

### Text Processing
```python
max_chunk_tokens: int = 256              # Per chunk limit
chunk_overlap_tokens: int = 50           # 20% overlap
embedding_model: str = "Qwen/Qwen3-Embedding-0.6B"
```

### Vector Search
```python
qdrant_url: str = "http://localhost:52102"
qdrant_collection: str = "pulse_docs"
vector_dim: int = 1024                   # Embedding dimension
qdrant_timeout: float = 60.0
```

### Keyword Search
```python
bm25_k1: float = 1.5                     # TF saturation
bm25_b: float = 0.75                     # Length normalization
```

### Hybrid
```python
rrf_k: int = 60                          # Standard RRF constant
hybrid_alpha: float = 0.5                # Currently unused
```

### Embeddings
```python
tei_url: str = "http://localhost:52104"
tei_api_key: str | None = None           # Optional auth
```

---

## Concurrency & Thread Safety

| Component | Thread-Safe | Method |
|-----------|-------------|--------|
| TextChunker | YES | Rust implementation (no GIL) |
| EmbeddingService | YES | Async HTTP client + connection pooling |
| VectorStore | YES | Async Qdrant client + connection pooling |
| BM25Engine | YES | POSIX fcntl file locks (shared/exclusive) |
| SearchOrchestrator | YES | Stateless, no shared mutable state |

**File Locking Details** (BM25Engine):
- **Shared locks** for reading (multiple readers)
- **Exclusive locks** for writing (single writer)
- Non-blocking with timeout (30s default)
- Retry delay: 0.1s between attempts

---

## Error Handling

### Retry Logic
```python
@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    retry=retry_if_exception_type(httpx.HTTPError),
)
```
- 3 attempts
- Exponential backoff: 2s, 4s, 8s
- Only retries HTTP errors

### Graceful Degradation
- **TEI down**: Search skips semantic mode
- **Qdrant down**: Search skips vector mode
- **Both down**: Keyword search only
- **BM25 lock timeout**: Continue without BM25

---

## Performance Benchmarks

### Indexing (per document)
| Phase | Time | Note |
|-------|------|------|
| Cleaning | ~10ms | CPU |
| Chunking | ~50-200ms | CPU + tokenizer |
| Embedding | ~500-2000ms | GPU bottleneck |
| Vector indexing | ~100-500ms | Network to Qdrant |
| BM25 indexing | ~50-200ms | Disk I/O |
| **Total** | **~700-3000ms** | ~1000 words → 4-8 chunks |

### Search (per query)
| Mode | Time | Components |
|------|------|------------|
| Semantic | ~100-300ms | TEI embed + Qdrant search |
| Keyword | ~1-10ms | BM25 scoring |
| Hybrid | ~100-300ms | Parallel vector + BM25 + RRF |

---

## RRF Deduplication Strategy

**Problem**: Same document in both vector and BM25 results

**Solution**: Canonical URL matching
```python
doc_id = (
    payload.get("canonical_url")        # Vector results
    or metadata.get("canonical_url")    # BM25 results
    or url                               # Fallback
    or id                                # Last resort
)
```

**Example**:
```
Vector: rank 1 = canonical_url="https://example.com/page"
BM25:   rank 1 = canonical_url="https://example.com/page"

Result: Combined RRF score = 1/61 + 1/61 = 0.0328
        (both signals agree → higher final score)
```

---

## Service Pool (Performance)

**File**: `services/service_pool.py`

Singleton pattern for expensive initializations:
- TextChunker loads tokenizer once (~1-5s)
- EmbeddingService HTTP client with pooling
- VectorStore Qdrant client
- BM25Engine disk-loaded index

**Impact**: 
- Without pool: 1-5s init per job
- With pool: 0.001s reuse per job
- **~1000x improvement**

---

## Timing Metrics

All operations tracked with `TimingContext`:
```python
async with TimingContext("chunking", "chunk_text", job_id=job_id):
    chunks = self.text_chunker.chunk_text(text)
    ctx.metadata = {"chunks_created": len(chunks)}
# Stored in PostgreSQL: operation_metrics table
```

Enables monitoring of:
- Per-operation latency
- Success/failure rates
- Bottleneck identification

---

## API Endpoints

### POST /search
```json
{
  "query": "search text",
  "mode": "hybrid|semantic|keyword|bm25",
  "limit": 10,
  "filters": {
    "domain": "example.com",
    "language": "en",
    "country": "US",
    "isMobile": false
  }
}

Response:
{
  "results": [
    {
      "url": "...",
      "title": "...",
      "text": "...",
      "score": 0.95,
      "metadata": {...}
    }
  ],
  "total": 1,
  "query": "search text",
  "mode": "hybrid"
}
```

### POST /index (deprecated - use webhook)
```json
{
  "url": "https://example.com",
  "markdown": "document text",
  "title": "Page Title",
  "description": "...",
  "language": "en",
  "country": "US"
}
```

### GET /stats
```json
{
  "total_documents": 1500,
  "total_chunks": 12000,
  "qdrant_points": 12000,
  "bm25_documents": 1500,
  "collection_name": "pulse_docs"
}
```

---

## Qdrant Collection Schema

```
Collection: pulse_docs

Points (chunks):
├── id: UUID (unique per chunk)
├── vector: [0.1, 0.2, ...] (1024 dims)
└── payload:
    ├── url: string (original document)
    ├── text: string (chunk content)
    ├── chunk_index: int (position in doc)
    ├── token_count: int (estimated)
    ├── canonical_url: string (deduped)
    ├── title: string
    ├── description: string
    ├── domain: string (indexed)
    ├── language: string (indexed)
    ├── country: string (indexed)
    └── isMobile: bool (indexed)

Configuration:
├── Distance: COSINE
├── Size: 1024
└── Index: HNSW (approximate nearest neighbor)
```

---

## BM25 Persistence

**File**: `./data/bm25/index.pkl`

Pickled structure:
```python
{
    "corpus": [doc1_text, doc2_text, ...],
    "tokenized_corpus": [[token, ...], ...],
    "metadata": [{"url": "...", "domain": "...", ...}, ...],
}
```

**Lock file**: `./data/bm25/index.pkl.lock`
- Non-blocking lock attempts with 30s timeout
- Shared locks for readers (can stack)
- Exclusive locks for writers (blocks others)

---

## Embedding Model Details

**Model**: Qwen/Qwen3-Embedding-0.6B
- Lightweight (600M parameters)
- Fast inference
- 1024-dimensional output
- L2 normalized embeddings

**Batch Processing**:
```python
# Single request with all chunk texts
POST /embed
{
  "inputs": [
    "chunk 1 text",
    "chunk 2 text",
    ...
  ]
}

Response: [[...1024 dims...], [...1024 dims...], ...]
```

**Benefits**:
- ~10x faster than individual requests
- Single network round-trip
- GPU efficiently batched

---

## Common Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| Search returns empty | TEI down (semantic) or Qdrant down (vector) | Check service health, use keyword mode |
| Indexing slow (~3s/doc) | TEI inference bottleneck | Use faster model or GPU |
| Search latency high | Network latency to TEI/Qdrant | Colocate services |
| BM25 lock timeout | Multiple workers updating simultaneously | Use separate BM25 instances |
| High memory usage | Large BM25 corpus in memory | Offload to dedicated service |
| Inconsistent results | Canonical URL dedup not matching | Check URL normalization |

---

## Related Services

- **Firecrawl API** (ghcr.io/firecrawl/firecrawl)
  - Web scraping, produces documents
  - Posts to webhook bridge for indexing

- **HF TEI** (ghcr.io/huggingface/text-embeddings-inference)
  - Embedding generation
  - Batch endpoint: POST /embed

- **Qdrant** (ghcr.io/qdrant/qdrant)
  - Vector database
  - HNSW index for similarity search

- **PostgreSQL** (pulse_postgres)
  - Timing metrics storage
  - Operation metrics table

---

## Development

### Run Tests
```bash
pnpm test:webhook          # All webhook tests
pytest apps/webhook        # Pytest directly
pytest -k test_search      # Specific tests
```

### Local Development
```bash
cd apps/webhook
uv sync                    # Install deps
uv run uvicorn main:app   # Run server
```

### Add New Search Mode
1. Add mode to `SearchMode` enum in `api/schemas/search.py`
2. Implement `_<mode>_search()` in `SearchOrchestrator`
3. Update `search()` dispatcher in `SearchOrchestrator`
4. Add tests

