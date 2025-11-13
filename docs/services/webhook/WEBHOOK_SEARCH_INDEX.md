# Webhook Search & Indexing - Documentation Index

**Last Updated**: 2025-11-13

This index guides you through the comprehensive analysis of the Pulse webhook server's search and indexing system.

---

## Quick Start

Start here if you want a fast overview:

📄 **[Quick Reference Guide](webhook-search-quick-reference.md)** (300+ lines)
- Pipeline stages diagram
- Search modes comparison
- Key files & classes
- Configuration parameters
- Performance benchmarks
- Common troubleshooting

---

## Deep Dive Documentation

Read these for comprehensive understanding:

📚 **[Complete Architecture Analysis](webhook-search-architecture.md)** (1565 lines)

### Sections:
1. **System Overview** - Architecture diagram, index management
2. **Document Ingestion Pipeline** - All 5 indexing phases with detailed code
   - Phase 1: Text Cleaning
   - Phase 2: Token-Based Chunking (semantic-text-splitter)
   - Phase 3: Embedding Generation (HF TEI)
   - Phase 4a: Vector Indexing (Qdrant)
   - Phase 4b: Keyword Indexing (BM25)
3. **Hybrid Search Architecture** - All 3 search modes
   - SearchOrchestrator class
   - Semantic search (vector only)
   - Keyword search (BM25 only)
   - Hybrid search (RRF fusion)
4. **Vector Search** - Qdrant + TEI details
   - Qdrant vector database
   - Collection schema
   - Search query process
   - TEI embedding endpoint
5. **Keyword Search** - BM25 implementation
   - BM25 algorithm formula
   - Parameters (k1, b)
   - File locking (concurrent access)
   - Persistence & loading
6. **Search Result Ranking** - RRF deduplication
   - Reciprocal Rank Fusion formula
   - Canonical URL deduplication
   - Response formatting
7. **Configuration & Performance** - Settings & benchmarks
   - All configuration parameters
   - Performance characteristics
   - Deployment considerations
8. **Thread Safety & Concurrency** - Async/await patterns
   - Service thread safety
   - Service pool singleton
   - File locking deadlock prevention
9. **Error Handling & Resilience** - Reliability patterns
   - Retry logic with exponential backoff
   - Graceful degradation
   - Health checks
   - Timing metrics & observability

---

## Navigation by Topic

### If you're interested in...

**Document Processing:**
- Read: Architecture → Document Ingestion Pipeline
- Key files: `utils/text_processing.py`, `services/indexing.py`

**Vector Search:**
- Read: Architecture → Vector Search (Qdrant + TEI)
- Key files: `services/embedding.py`, `services/vector_store.py`

**Keyword Search:**
- Read: Architecture → Keyword Search (BM25)
- Key files: `services/bm25_engine.py`

**Hybrid Search & Ranking:**
- Read: Architecture → Hybrid Search Architecture + Search Result Ranking
- Read: Quick Reference → RRF Deduplication Strategy
- Key files: `services/search.py`

**Performance & Optimization:**
- Read: Architecture → Configuration & Performance
- Read: Quick Reference → Performance Benchmarks
- Key files: `services/service_pool.py`

**Concurrency & Reliability:**
- Read: Architecture → Thread Safety & Concurrency + Error Handling
- Key files: `services/bm25_engine.py`, `services/embedding.py`

**API Usage:**
- Read: Quick Reference → API Endpoints
- Key files: `api/routers/search.py`, `api/routers/indexing.py`

**Configuration:**
- Read: Quick Reference → Configuration
- Key file: `config.py`

**Troubleshooting:**
- Read: Quick Reference → Common Troubleshooting
- Read: Architecture → Error Handling & Resilience

---

## Key Concepts Explained

### RRF (Reciprocal Rank Fusion)
- **What**: Algorithm to combine multiple ranked lists
- **Why**: Balances signals from vector and keyword search equally
- **Formula**: `score = sum(1/(k+rank))` where k=60
- **Where**: `services/search.py` → `reciprocal_rank_fusion()`

### Token-Based Chunking
- **What**: Split text into token-sized chunks (not character-sized)
- **Why**: Ensures chunks fit within embedding model token limits
- **Technology**: semantic-text-splitter (Rust-based, 10-100x faster)
- **Where**: `utils/text_processing.py` → `TextChunker`

### Hybrid Search
- **What**: Combines vector (semantic) and keyword (exact match) search
- **Why**: Gets benefits of both conceptual matching and keyword precision
- **Process**: Run both searches, merge with RRF
- **Where**: `services/search.py` → `SearchOrchestrator._hybrid_search()`

### Canonical URL Deduplication
- **What**: Removes tracking parameters from URLs before comparison
- **Why**: Same page with different tracking params counts as one result
- **Example**: `?utm_source=social` removed for deduplication
- **Where**: `services/search.py` → `reciprocal_rank_fusion()`

### File Locking (BM25)
- **What**: POSIX fcntl locks for concurrent BM25 index access
- **Why**: Prevents corruption when multiple workers update simultaneously
- **How**: Shared locks for readers, exclusive locks for writers
- **Where**: `services/bm25_engine.py` → `_acquire_lock()`

### Service Pool Singleton
- **What**: Singleton pattern caching expensive service initializations
- **Why**: Tokenizer loads once (~1-5s), reused across all jobs
- **Benefit**: ~1000x performance improvement
- **Where**: `services/service_pool.py` → `ServicePool`

---

## Source Code Reference

### Core Services
```
apps/webhook/services/
├── search.py              # SearchOrchestrator, RRF fusion
├── indexing.py            # IndexingService pipeline
├── embedding.py           # EmbeddingService (HF TEI client)
├── vector_store.py        # VectorStore (Qdrant client)
├── bm25_engine.py         # BM25Engine (keyword search)
├── service_pool.py        # ServicePool singleton
└── webhook_handlers.py    # Webhook event processing
```

### Utilities
```
apps/webhook/utils/
├── text_processing.py     # TextChunker, clean_text()
├── url.py                 # URL normalization
├── timing.py              # TimingContext for metrics
└── logging.py             # Structured logging
```

### API
```
apps/webhook/api/
├── routers/
│   ├── search.py          # POST /search, GET /stats
│   ├── indexing.py        # POST /index, POST /test-index
│   ├── webhook.py         # POST /webhook/firecrawl
│   └── metrics.py         # GET /metrics
├── schemas/
│   ├── search.py          # SearchRequest, SearchResponse
│   ├── indexing.py        # IndexDocumentRequest
│   └── health.py          # IndexStats
└── deps.py                # Dependency injection
```

### Tests
```
apps/webhook/tests/
├── unit/
│   ├── test_search.py
│   ├── test_indexing_service.py
│   ├── test_vector_store.py
│   ├── test_bm25_engine.py
│   └── test_embedding_service.py
└── integration/
    ├── test_api.py
    ├── test_end_to_end.py
    └── test_worker_integration.py
```

---

## Performance Summary

### Indexing (per document)
- **Total**: 700-3000ms for ~1000 words
- **Bottleneck**: GPU embedding (~500-2000ms)

### Search (per query)
- **Semantic**: 100-300ms (TEI + Qdrant)
- **Keyword**: 1-10ms (BM25)
- **Hybrid**: 100-300ms (parallel execution)

---

## Configuration Parameters

**Key settings in `config.py`:**

| Parameter | Default | Purpose |
|-----------|---------|---------|
| max_chunk_tokens | 256 | Chunk size limit |
| chunk_overlap_tokens | 50 | Chunk overlap (context) |
| vector_dim | 1024 | Embedding dimensions |
| rrf_k | 60 | RRF constant (standard) |
| bm25_k1 | 1.5 | BM25 TF saturation |
| bm25_b | 0.75 | BM25 length normalization |

---

## Thread Safety Summary

| Component | Safe? | Method |
|-----------|-------|--------|
| TextChunker | ✓ | Rust (no GIL) |
| EmbeddingService | ✓ | Async + pooling |
| VectorStore | ✓ | Async + pooling |
| BM25Engine | ✓ | fcntl locks |
| SearchOrchestrator | ✓ | Stateless |

---

## Common Questions

**Q: Why token-based chunking?**
A: Embedding models have token limits, not character limits. Token-based ensures chunks fit within model limits reliably.

**Q: Why RRF instead of weighted score fusion?**
A: RRF is scale-independent (works with any score ranges) and treats both modalities equally.

**Q: How does file locking prevent corruption?**
A: Shared locks let multiple readers proceed simultaneously. Exclusive locks ensure only one writer at a time.

**Q: Why batch embedding requests?**
A: Single request for all chunks is ~10x faster than individual requests (amortized network overhead).

**Q: What if TEI goes down?**
A: Search skips semantic mode, still works with BM25 keyword search.

**Q: What if Qdrant goes down?**
A: Search skips vector mode, still works with BM25 keyword search.

---

## Further Reading

- **Reciprocal Rank Fusion Paper**: Cormack et al. (2009)
- **BM25 Algorithm**: Okapi ranking function (Robertson & Walker, 1994)
- **Semantic Text Splitter**: https://github.com/rupeshs/semantic-text-splitter
- **Qdrant Documentation**: https://qdrant.tech/documentation/
- **HuggingFace TEI**: https://github.com/huggingface/text-embeddings-inference

---

## Document Links

| Document | Lines | Focus |
|----------|-------|-------|
| [Architecture Analysis](webhook-search-architecture.md) | 1565 | Deep technical details |
| [Quick Reference](webhook-search-quick-reference.md) | 300+ | Quick lookup guide |
| This Index | - | Navigation & overview |

---

## Help & Questions

If you need clarification on:
- **Architecture**: See the Architecture Analysis document
- **Quick lookup**: See the Quick Reference guide
- **Specific code**: Check the file paths in the Source Code Reference section
- **Performance**: See the performance benchmarks in either document

