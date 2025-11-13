# Webhook Server Search & Indexing Architecture - Detailed Analysis

**Document**: Complete search pipeline analysis for Pulse webhook bridge  
**Date**: 2025-11-13  
**Scope**: Hybrid vector + BM25 search implementation with RRF fusion

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Document Ingestion Pipeline](#document-ingestion-pipeline)
3. [Hybrid Search Architecture](#hybrid-search-architecture)
4. [Vector Search (Qdrant + TEI)](#vector-search-qdrant--tei)
5. [Keyword Search (BM25)](#keyword-search-bm25)
6. [Search Result Ranking](#search-result-ranking)
7. [Configuration & Performance](#configuration--performance)
8. [Thread Safety & Concurrency](#thread-safety--concurrency)
9. [Error Handling & Resilience](#error-handling--resilience)

---

## System Overview

The webhook bridge implements a **dual-index hybrid search system** that combines semantic vector similarity with traditional keyword search using **Reciprocal Rank Fusion (RRF)** to merge results from both modalities.

### Architecture Components

```
┌─────────────────────────────────────────────────────────────────────┐
│                    DOCUMENT INGESTION PIPELINE                      │
├─────────────────────────────────────────────────────────────────────┤
│  Input: IndexDocumentRequest (from Firecrawl)                       │
│    ├── URL, Title, Description                                      │
│    ├── Markdown (cleaned text)                                      │
│    └── Metadata (language, country, mobile flag)                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Step 1: TEXT CLEANING                                              │
│  ├── clean_text() removes control chars, normalizes whitespace      │
│  └── Produces cleaned markdown ready for processing                 │
│                                                                      │
│  Step 2: TEXT CHUNKING (TOKEN-BASED)                                │
│  ├── TextChunker uses semantic-text-splitter (Rust, high-perf)      │
│  ├── Chunks text into 256 tokens (configurable)                     │
│  ├── Adds 50 token overlap between chunks                           │
│  └── Produces list of ~100-500 chunks per document                  │
│                                                                      │
│  Step 3: EMBEDDINGS GENERATION (BATCH)                              │
│  ├── EmbeddingService calls HF TEI server                           │
│  ├── Batch embeds all chunk texts at once                           │
│  ├── Returns 1024-dim vectors (configurable)                        │
│  └── Handles retries with exponential backoff (3 attempts)          │
│                                                                      │
│  Step 4a: VECTOR INDEXING (Qdrant)                                  │
│  ├── VectorStore.index_chunks() stores embeddings                   │
│  ├── Each chunk → UUID + vector + metadata payload                  │
│  ├── Uses COSINE distance metric                                    │
│  └── Qdrant collection: "pulse_docs"                                │
│                                                                      │
│  Step 4b: KEYWORD INDEXING (BM25)                                   │
│  ├── BM25Engine.index_document() indexes full document text         │
│  ├── Tokenizes text (lowercase, split on whitespace)                │
│  ├── Rebuilds BM25 index from corpus                                │
│  ├── Persists to disk: ./data/bm25/index.pkl                        │
│  └── k1=1.5, b=0.75 (BM25 Okapi tuning parameters)                  │
│                                                                      │
│  Output: IndexingService returns:                                   │
│    ├── chunks_indexed: number of vectors stored                     │
│    ├── total_tokens: sum of chunk tokens                            │
│    └── success: boolean                                             │
└─────────────────────────────────────────────────────────────────────┘
```

### Index Management

- **Qdrant Collection**: One collection (`pulse_docs`) containing all document chunks
- **BM25 Index**: Single disk-persisted file (`index.pkl`) containing full documents
- **Metadata Strategy**: Attached to chunks for filtering (domain, language, country, isMobile)

---

## Document Ingestion Pipeline

### Phase 1: Document Parsing & Cleaning

**File**: `/compose/pulse/apps/webhook/utils/text_processing.py`

```python
def clean_text(text: str) -> str:
    # Remove excessive whitespace
    text = " ".join(text.split())
    
    # Remove control characters (preserve \n and \t)
    text = "".join(char for char in text if char.isprintable() or char in "\n\t")
    
    return text.strip()
```

**Purpose**: Remove artifacts from HTML-to-markdown conversion and normalize text representation.

**Key Operations**:
- Collapses multiple whitespace into single spaces
- Removes non-printable control characters (but preserves newlines/tabs)
- Strips leading/trailing whitespace

---

### Phase 2: Token-Based Chunking

**File**: `/compose/pulse/apps/webhook/utils/text_processing.py`

**Implementation**: `TextChunker` using `semantic-text-splitter` (Rust-based)

```python
class TextChunker:
    def __init__(
        self,
        model_name: str = "Qwen/Qwen3-Embedding-0.6B",
        max_tokens: int = 256,
        overlap_tokens: int = 50,
    ):
        # Load HuggingFace tokenizer
        tokenizer = Tokenizer.from_pretrained(model_name)
        
        # Create semantic splitter
        self.splitter = TextSplitter.from_huggingface_tokenizer(
            tokenizer,
            capacity=max_tokens,
            overlap=overlap_tokens,
        )
```

**Key Design Decisions**:

1. **TOKEN-BASED, not character-based**
   - Embedding models have token limits (e.g., 512, 2048)
   - Character-based chunking can exceed token limits unpredictably
   - semantic-text-splitter guarantees chunks fit within token budget

2. **Semantic Splitting**
   - Uses semantic boundaries (sentence, paragraph breaks)
   - Not just size-based splitting
   - Better context preservation in chunks

3. **Overlap Strategy**
   - 50 tokens overlap between chunks (~20% of max_tokens)
   - Prevents context loss at chunk boundaries
   - Enables better semantic search across boundaries

4. **Performance**
   - Rust-based implementation: 10-100x faster than pure Python
   - Thread-safe by design (no GIL contention)
   - Suitable for high-throughput parallel processing

**Output Format**:
```python
chunks = [
    {
        "text": "chunk content...",
        "chunk_index": 0,
        "token_count": 256,  # Estimated, not exact
        "url": "original_url",
        "canonical_url": "url_without_tracking_params",
        "domain": "example.com",
        "title": "Page Title",
        "description": "Page description",
        "language": "en",
        "country": "US",
        "isMobile": False,
    },
    ...
]
```

**Configuration** (from `config.py`):
```python
max_chunk_tokens: int = 256          # Must match embedding model max
chunk_overlap_tokens: int = 50       # ~20% of max for context
embedding_model: str = "Qwen/Qwen3-Embedding-0.6B"
```

---

### Phase 3: Embedding Generation

**File**: `/compose/pulse/apps/webhook/services/embedding.py`

**Service**: `EmbeddingService` - Client for HuggingFace Text Embeddings Inference (TEI)

```python
class EmbeddingService:
    def __init__(self, tei_url: str, api_key: str | None = None, timeout: float = 30.0):
        self.tei_url = tei_url.rstrip("/")
        self.timeout = timeout
        # Lazy-initialize HTTP client for thread safety
        self._client: httpx.AsyncClient | None = None
    
    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        """Generate embeddings for multiple texts in single request."""
        # Filter out empty texts
        valid_texts = [t for t in texts if t and t.strip()]
        
        # Send to TEI server
        response = await self.client.post(
            f"{self.tei_url}/embed",
            json={"inputs": valid_texts},
        )
        response.raise_for_status()
        
        embeddings = response.json()  # list[list[float]]
        return embeddings
```

**Key Features**:

1. **Batch Processing**
   - Sends all chunk texts in single request to TEI
   - Much more efficient than individual requests
   - Network overhead amortized across chunks

2. **Lazy Client Initialization**
   ```python
   @property
   def client(self) -> httpx.AsyncClient:
       if self._client is None:
           self._client = httpx.AsyncClient(timeout=self.timeout)
       return self._client
   ```
   - Client created on first use in active event loop
   - Prevents issues with thread-local event loops

3. **Automatic Retry Logic**
   ```python
   @retry(
       stop=stop_after_attempt(3),
       wait=wait_exponential(multiplier=1, min=2, max=10),
       retry=retry_if_exception_type(httpx.HTTPError),
       reraise=True,
   )
   async def embed_batch(...):
   ```
   - Retries 3 times on HTTP errors
   - Exponential backoff: 2s, 4s, 8s, 16s
   - Raises exception on final failure

4. **Input Validation**
   - Filters out empty texts before sending
   - Validates TEI response contains embeddings
   - Dimension checking against vector_dim config

**Configuration**:
```python
tei_url: str = "http://localhost:52104"  # TEI server endpoint
tei_api_key: str | None = None           # Optional authentication
vector_dim: int = 1024                   # Embedding dimension
timeout: float = 30.0                    # Request timeout
```

**TEI Server**: HuggingFace Text Embeddings Inference
- Running in Docker: `ghcr.io/huggingface/text-embeddings-inference:1.14`
- Model: Configurable (default: `Qwen/Qwen3-Embedding-0.6B`)
- Returns: Dense vectors (1024-dim by default)

---

### Phase 4a: Vector Indexing (Qdrant)

**File**: `/compose/pulse/apps/webhook/services/vector_store.py`

**Service**: `VectorStore` - Qdrant vector database client

```python
class VectorStore:
    def __init__(
        self,
        url: str,
        collection_name: str,
        vector_dim: int,
        timeout: int = 60,
    ):
        self.url = url
        self.collection_name = collection_name
        self.vector_dim = vector_dim
        # Lazy Qdrant client
        self._client: AsyncQdrantClient | None = None
    
    async def ensure_collection(self) -> None:
        """Create collection if it doesn't exist."""
        await self.client.create_collection(
            collection_name=self.collection_name,
            vectors_config=VectorParams(
                size=self.vector_dim,  # e.g., 1024
                distance=Distance.COSINE,  # Cosine similarity
            ),
        )
    
    async def index_chunks(
        self,
        chunks: list[dict[str, Any]],
        embeddings: list[list[float]],
        document_url: str,
    ) -> int:
        """Index chunk embeddings."""
        points: list[PointStruct] = []
        
        for chunk, embedding in zip(chunks, embeddings):
            point_id = str(uuid4())  # Unique ID per chunk
            
            # Build payload from chunk + embedding metadata
            payload = {
                "url": document_url,
                "text": chunk["text"],
                "chunk_index": chunk["chunk_index"],
                "token_count": chunk["token_count"],
                "canonical_url": chunk["canonical_url"],
                "title": chunk["title"],
                "description": chunk["description"],
                "domain": chunk["domain"],
                "language": chunk["language"],
                "country": chunk["country"],
                "isMobile": chunk["isMobile"],
            }
            
            point = PointStruct(
                id=point_id,
                vector=embedding,
                payload=payload,
            )
            points.append(point)
        
        # Upsert all points at once
        await self.client.upsert(
            collection_name=self.collection_name,
            points=points,
        )
        
        return len(points)
```

**Key Design**:

1. **Point Structure**
   - ID: UUID (unique per chunk)
   - Vector: 1024-dim embedding
   - Payload: All metadata for filtering and reconstruction

2. **Collection Configuration**
   - Distance metric: **COSINE** (standard for embeddings)
   - Indexed fields: domain, language, country, isMobile
   - Collection name: `pulse_docs`

3. **Batch Upsert**
   - All chunks from one document uploaded in single request
   - Much more efficient than individual inserts
   - Transactional at Qdrant level

4. **Retry Logic**
   - Same as embedding service (3 attempts, exponential backoff)
   - Handles network failures gracefully

**Configuration**:
```python
qdrant_url: str = "http://localhost:52102"
qdrant_collection: str = "pulse_docs"
vector_dim: int = 1024
qdrant_timeout: float = 60.0
```

---

### Phase 4b: Keyword Indexing (BM25)

**File**: `/compose/pulse/apps/webhook/services/bm25_engine.py`

**Service**: `BM25Engine` - Disk-persisted BM25 index

```python
class BM25Engine:
    def __init__(
        self,
        index_path: str = "./data/bm25/index.pkl",
        k1: float = 1.5,      # Term frequency saturation
        b: float = 0.75,      # Length normalization
    ):
        self.index_path = Path(index_path)
        self.lock_path = Path(f"{self.index_path}.lock")
        
        # In-memory structures
        self.corpus: list[str] = []              # Original texts
        self.tokenized_corpus: list[list[str]] = []  # Tokenized texts
        self.metadata: list[dict[str, Any]] = []     # Document metadata
        self.bm25: BM25Okapi | None = None           # BM25 index
        
        # Load existing index from disk
        self._load_index()
    
    def index_document(self, text: str, metadata: dict[str, Any]) -> None:
        """Index a single full document."""
        tokens = self._tokenize(text)  # Simple: lowercase + split
        
        self.corpus.append(text)
        self.tokenized_corpus.append(tokens)
        self.metadata.append(metadata)
        
        # Rebuild BM25 index
        self.bm25 = BM25Okapi(
            self.tokenized_corpus,
            k1=self.k1,
            b=self.b,
        )
        
        # Persist to disk
        self._save_index()
    
    def _tokenize(self, text: str) -> list[str]:
        """Simple tokenization: lowercase + split on whitespace."""
        return text.lower().split()
    
    def _save_index(self) -> None:
        """Save index to disk with exclusive lock."""
        with self._acquire_lock(exclusive=True):
            data = {
                "corpus": self.corpus,
                "tokenized_corpus": self.tokenized_corpus,
                "metadata": self.metadata,
            }
            with open(self.index_path, "wb") as f:
                pickle.dump(data, f)
```

**BM25 Algorithm**:

The BM25 Okapi formula is:

```
score(D, Q) = sum over terms t in Q:
    IDF(t) * (f(t, D) * (k1 + 1)) / (f(t, D) + k1 * (1 - b + b * |D| / avgdl))

Where:
- IDF(t) = log((N - df(t) + 0.5) / (df(t) + 0.5))  [inverse document frequency]
- f(t, D) = frequency of term t in document D
- |D| = length of document D in tokens
- avgdl = average document length in corpus
- k1 = saturation parameter (1.5 default) - controls term frequency impact
- b = normalization parameter (0.75 default) - controls length normalization
```

**Parameters**:
- `k1=1.5`: Controls how much additional occurrences of a term increase score
  - Lower k1: Each term occurrence has less impact
  - Higher k1: Term frequency weighted more heavily
- `b=0.75`: Controls length normalization
  - b=0: No length normalization (longer docs always score higher)
  - b=1: Full length normalization (uniform scoring across lengths)
  - b=0.75: Balanced approach

**Key Features**:

1. **File Locking** (Unix/Linux only)
   ```python
   def _acquire_lock(self, exclusive: bool = False) -> Iterator[None]:
       lock_type = fcntl.LOCK_EX if exclusive else fcntl.LOCK_SH
       
       with open(self.lock_path, "a") as lock_file:
           # Try non-blocking lock acquisition
           fcntl.flock(lock_file.fileno(), lock_type | fcntl.LOCK_NB)
           
           # Shared locks: Multiple readers can hold simultaneously
           # Exclusive locks: Only one writer at a time
           yield
           
           fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)
   ```
   - **Shared locks** for reading (multiple workers can read in parallel)
   - **Exclusive locks** for writing (only one worker can write)
   - Prevents corruption from concurrent writes
   - Readers don't block each other

2. **Index Persistence**
   - Pickled to disk: `./data/bm25/index.pkl`
   - Loaded on startup, updated after each document
   - Survives worker restarts

3. **Simple Tokenization**
   - Lowercase + whitespace split
   - No stemming, lemmatization, or stop word removal
   - Fast but less sophisticated than more advanced NLP

4. **Full Document Indexing**
   - Each document → 1 entry in BM25 index
   - Different from vector search (chunks)
   - Better for document-level relevance

---

## Hybrid Search Architecture

**File**: `/compose/pulse/apps/webhook/services/search.py`

### SearchOrchestrator

```python
class SearchOrchestrator:
    def __init__(
        self,
        embedding_service: EmbeddingService,
        vector_store: VectorStore,
        bm25_engine: BM25Engine,
        rrf_k: int = 60,
    ):
        self.embedding_service = embedding_service
        self.vector_store = vector_store
        self.bm25_engine = bm25_engine
        self.rrf_k = rrf_k
    
    async def search(
        self,
        query: str,
        mode: SearchMode,
        limit: int = 10,
        domain: str | None = None,
        language: str | None = None,
        country: str | None = None,
        is_mobile: bool | None = None,
    ) -> list[dict[str, Any]]:
        """Execute search in specified mode."""
        
        if mode == SearchMode.HYBRID:
            return await self._hybrid_search(...)
        elif mode == SearchMode.SEMANTIC:
            return await self._semantic_search(...)
        elif mode in (SearchMode.KEYWORD, SearchMode.BM25):
            return self._keyword_search(...)
```

### Search Modes

#### 1. Semantic Search (Vector Only)

```python
async def _semantic_search(
    self,
    query: str,
    limit: int,
    domain: str | None,
    language: str | None,
    country: str | None,
    is_mobile: bool | None,
) -> list[dict[str, Any]]:
    """Search using vector similarity."""
    
    # 1. Embed the query using same model as documents
    query_vector = await self.embedding_service.embed_single(query)
    
    if not query_vector:
        logger.warning("Failed to generate query embedding")
        return []
    
    # 2. Search Qdrant for similar vectors
    results = await self.vector_store.search(
        query_vector=query_vector,
        limit=limit,
        domain=domain,
        language=language,
        country=country,
        is_mobile=is_mobile,
    )
    
    return results
```

**Process**:
1. Embed query to same dimension as documents (1024-dim)
2. Compute cosine similarity against all vectors in Qdrant
3. Apply filters (domain, language, country, mobile)
4. Return top-K results with similarity scores

**Advantages**:
- Captures semantic meaning
- Finds similar content even if keywords don't match exactly
- Good for conceptual queries ("payment methods" → "checkout process")

**Limitations**:
- Requires TEI server to be available
- Slower than keyword search (embedding overhead)
- May miss exact keyword matches

#### 2. Keyword Search (BM25 Only)

```python
def _keyword_search(
    self,
    query: str,
    limit: int,
    domain: str | None,
    language: str | None,
    country: str | None,
    is_mobile: bool | None,
) -> list[dict[str, Any]]:
    """Search using BM25 algorithm."""
    
    # 1. Tokenize query same way as corpus
    query_tokens = self._tokenize(query)
    
    # 2. Compute BM25 scores for all documents
    scores = self.bm25.get_scores(query_tokens)
    
    # 3. Apply filters and sort
    filtered_results = [
        (idx, score) for idx, score in enumerate(scores)
        if passes_filters(self.metadata[idx], domain, language, country, is_mobile)
    ]
    filtered_results.sort(key=lambda x: x[1], reverse=True)
    
    # 4. Return top-K
    return [
        {
            "index": idx,
            "score": float(score),
            "text": self.corpus[idx],
            "metadata": self.metadata[idx],
        }
        for idx, score in filtered_results[:limit]
    ]
```

**Process**:
1. Tokenize query (lowercase + whitespace split)
2. Compute BM25 scores for all documents
3. Apply filters
4. Return top-K results with BM25 scores

**Advantages**:
- Fast (no ML inference needed)
- Exact keyword matching
- Good for specific queries ("HTTP 404 error")
- Always available (doesn't depend on TEI server)

**Limitations**:
- Doesn't understand synonyms or semantic similarity
- Can miss relevant content with different wording
- Subject to keyword spamming

#### 3. Hybrid Search (Vector + BM25 with RRF)

```python
async def _hybrid_search(
    self,
    query: str,
    limit: int,
    domain: str | None,
    language: str | None,
    country: str | None,
    is_mobile: bool | None,
) -> list[dict[str, Any]]:
    """Hybrid: Vector + BM25 with Reciprocal Rank Fusion."""
    
    # 1. Run both searches in parallel for efficiency
    vector_results = await self._semantic_search(
        query,
        limit * 2,  # Get more results for fusion
        domain, language, country, is_mobile,
    )
    keyword_results = self._keyword_search(
        query,
        limit * 2,  # Get more results for fusion
        domain, language, country, is_mobile,
    )
    
    # 2. Fuse results using RRF
    fused_results = reciprocal_rank_fusion(
        [vector_results, keyword_results],
        k=self.rrf_k,  # Standard: 60
    )
    
    # 3. Return top-K after fusion
    return fused_results[:limit]
```

**Reciprocal Rank Fusion Algorithm**:

```python
def reciprocal_rank_fusion(
    ranked_lists: list[list[dict[str, Any]]],
    k: int = 60,
) -> list[dict[str, Any]]:
    """
    Combine multiple ranked lists using RRF formula:
    score = sum(1 / (k + rank))
    """
    scores: dict[str, float] = {}
    doc_map: dict[str, dict[str, Any]] = {}
    
    for ranked_list in ranked_lists:
        for rank, result in enumerate(ranked_list, start=1):
            # Dedup by canonical_url (handles tracking parameters)
            doc_id = (
                result.get("payload", {}).get("canonical_url")
                or result.get("metadata", {}).get("canonical_url")
                or result.get("id", str(rank))
            )
            
            # Calculate RRF score for this ranking
            rrf_score = 1.0 / (k + rank)
            
            # Accumulate scores
            scores[doc_id] = scores.get(doc_id, 0.0) + rrf_score
            
            # Keep first occurrence metadata
            if doc_id not in doc_map:
                doc_map[doc_id] = result
    
    # Sort by accumulated RRF score
    sorted_docs = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    
    # Build result list
    results = []
    for doc_id, rrf_score in sorted_docs:
        result = doc_map[doc_id].copy()
        result["rrf_score"] = rrf_score
        results.append(result)
    
    return results
```

**RRF Formula Explanation**:

```
For a document appearing in both rankings:
- Rank 1: score = 1/(60+1) = 0.0164
- Rank 2: score = 1/(60+2) = 0.0161
- Rank 3: score = 1/(60+3) = 0.0159
...
- Rank 10: score = 1/(60+10) = 0.0140

If document appears at rank 5 in vector search and rank 3 in BM25:
- Total RRF score = 1/65 + 1/63 ≈ 0.0325

The k=60 constant prevents a single top rank from dominating.
With k=60, even the top-ranked document (rank 1) only gets ~1.7% of
max possible score, allowing multiple sources to influence ranking.
```

**Why RRF Works**:

1. **Balances Different Signals**
   - Neither vector nor keyword search dominates
   - Both contribute equally to final ranking

2. **Deduplicates Results**
   - Canonical URL deduplication removes tracking parameters
   - Same document from both modalities counted once

3. **Robust to Ranking Variations**
   - Disagreements between modalities are reconciled
   - Document in both top-10 lists likely highly relevant

**Configuration**:
```python
rrf_k: int = 60  # Standard value from original RRF paper (Cormack et al.)
```

---

## Vector Search (Qdrant + TEI)

### Qdrant Vector Database

**Container**: `ghcr.io/qdrant/qdrant:latest`  
**Port**: 50102 (external) → 6333 (internal)  
**Collection**: `pulse_docs`

#### Collection Schema

```
Collection: pulse_docs
├── Vector Config
│   ├── Size: 1024 dimensions
│   ├── Distance: COSINE
│   └── Indexed: All vectors indexed with HNSW algorithm
│
├── Payload (per chunk)
│   ├── url: string (original document URL)
│   ├── text: string (chunk text, searchable)
│   ├── chunk_index: integer (position in document)
│   ├── token_count: integer (estimated tokens)
│   ├── canonical_url: string (deduplicated URL)
│   ├── title: string (document title)
│   ├── description: string (document description)
│   ├── domain: string (indexed, filterable)
│   ├── language: string (indexed, filterable - 'en', 'es', etc.)
│   ├── country: string (indexed, filterable - 'US', 'GB', etc.)
│   └── isMobile: boolean (indexed, filterable)
│
└── Metrics
    ├── Total points: number of chunks indexed
    ├── Storage: ~1KB per chunk (vector + metadata)
    └── Typical: ~100-500 chunks per document
```

#### Search Query Process

```python
async def search(
    self,
    query_vector: list[float],
    limit: int = 10,
    domain: str | None = None,
    language: str | None = None,
    country: str | None = None,
    is_mobile: bool | None = None,
) -> list[dict[str, Any]]:
    """Search with filters and return results."""
    
    # Build filter conditions
    must_conditions: list[FieldCondition] = []
    if domain:
        must_conditions.append(
            FieldCondition(key="domain", match=MatchValue(value=domain))
        )
    if language:
        must_conditions.append(
            FieldCondition(key="language", match=MatchValue(value=language))
        )
    if country:
        must_conditions.append(
            FieldCondition(key="country", match=MatchValue(value=country))
        )
    if is_mobile is not None:
        must_conditions.append(
            FieldCondition(key="isMobile", match=MatchValue(value=is_mobile))
        )
    
    # Combine filters with AND logic
    query_filter = Filter(must=must_conditions) if must_conditions else None
    
    # Execute search with filters
    results = await self.client.search(
        collection_name=self.collection_name,
        query_vector=query_vector,
        query_filter=query_filter,
        limit=limit,
    )
    
    # Convert to dict format
    return [
        {
            "id": str(result.id),
            "score": result.score,  # Cosine similarity [0, 2]
            "payload": result.payload,
        }
        for result in results
    ]
```

#### Filter Logic

**AND Filters (must all match)**:
- Filter combinations are AND-ed together
- Only chunks matching ALL filters returned
- Example: `domain='example.com' AND language='en' AND country='US'`

**Score Interpretation**:
- Cosine similarity ranges [0, 2]
- 1.0 = identical vectors
- 0.5 = 60 degree angle
- 0.0 = perpendicular
- Negative = opposite direction

### TEI (Text Embeddings Inference)

**Container**: `ghcr.io/huggingface/text-embeddings-inference:latest`  
**Port**: 50104 (external) → 80 (internal)  
**Model**: `Qwen/Qwen3-Embedding-0.6B` (configurable)

#### Embedding Endpoint

```
POST /embed
Content-Type: application/json

{
  "inputs": [
    "text to embed 1",
    "text to embed 2",
    ...
  ]
}

Response:
[
  [0.1, 0.2, 0.3, ...],  // 1024-dim vector
  [0.4, 0.5, 0.6, ...],
  ...
]
```

#### Key Properties

1. **Deterministic**
   - Same text → same vector every time
   - Important for consistency

2. **Dimensionality**
   - 1024 dimensions (depends on model)
   - Memory: ~4KB per embedding (float32)

3. **Normalization**
   - Embeddings are L2 normalized
   - Magnitude = 1.0
   - All embeddings on unit hypersphere

---

## Keyword Search (BM25)

### BM25 Algorithm Details

**Implementation**: `rank_bm25.BM25Okapi`

The BM25 formula captures two key concepts:

1. **Term Frequency (TF)**
   - Documents with more occurrences of query terms score higher
   - Subject to diminishing returns (saturation) via k1 parameter

2. **Inverse Document Frequency (IDF)**
   - Rare terms weighted more heavily
   - Common words (the, a, is) contribute less

**Example Calculation**:

Given corpus:
```
Doc1: "python programming tutorial"  (3 tokens)
Doc2: "python tutorial"               (2 tokens)
Doc3: "javascript programming"        (2 tokens)
```

Query: "python"
```
avgdl = (3 + 2 + 2) / 3 = 2.33

IDF("python") = log((3 - 2 + 0.5) / (2 + 0.5))
               = log(1.5 / 2.5)
               = log(0.6)
               = -0.511  (or: log(1 + (N - n_docs + 0.5) / (n_docs + 0.5)))

For Doc1 (contains "python"):
  TF = 1
  score = IDF * (TF * (k1 + 1)) / (TF + k1 * (1 - b + b * len/avgdl))
        = -0.511 * (1 * 2.5) / (1 + 1.5 * (1 - 0.75 + 0.75 * 3/2.33))
        = -0.511 * 2.5 / (1 + 1.5 * 0.712)
        = -0.511 * 2.5 / 2.068
        ≈ -0.618

For Doc2 (contains "python"):
  TF = 1
  score = -0.511 * 2.5 / (1 + 1.5 * 0.393)
        ≈ -0.548
```

(Note: Implementations typically use log(N/n_docs) which is positive)

### Concurrent Access & File Locking

**Problem**: Multiple workers might try to update BM25 index simultaneously

**Solution**: POSIX file locking (Unix/Linux only)

```python
def _acquire_lock(self, exclusive: bool = False) -> Iterator[None]:
    """
    Acquire file lock with timeout.
    
    exclusive=False: Shared lock (multiple readers)
    exclusive=True: Exclusive lock (single writer)
    """
    lock_type = fcntl.LOCK_EX if exclusive else fcntl.LOCK_SH
    lock_file = open(self.lock_path, "a")
    
    try:
        start_time = time.time()
        while True:
            try:
                # Non-blocking lock attempt
                fcntl.flock(lock_file.fileno(), lock_type | fcntl.LOCK_NB)
                break  # Lock acquired
            except OSError as e:
                if e.errno != errno.EWOULDBLOCK:
                    raise
                
                # Lock held by another process
                if time.time() - start_time >= self.lock_timeout:
                    raise TimeoutError(f"Could not acquire lock within {self.lock_timeout}s")
                
                # Wait before retrying
                time.sleep(self.lock_retry_delay)  # 0.1s
        
        yield  # Critical section
    
    finally:
        fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)
        lock_file.close()
```

**Lock Types**:

| Lock | Behavior | Use Case |
|------|----------|----------|
| Shared (SH) | Multiple processes can hold | Reading index |
| Exclusive (EX) | Only one process can hold | Updating index |

**Timeline Example**:

```
Time  Worker1              Worker2              State
────  ──────────────────   ──────────────────   ─────────────────
t0    acquire_lock(EX)                          Writer lock held
t1    save_index()                              Index being written
t2                         wait for lock         Writer lock held
t3                         timeout? retry        Writer lock held
t4    release_lock()                            Writer lock free
t5                         acquire_lock(EX)     Writer lock held (W2)
t6                         save_index()         Index being written
```

### Persistence & Loading

**File Format**: Pickle (Python binary serialization)

```python
# Save
data = {
    "corpus": self.corpus,              # list[str] - all document texts
    "tokenized_corpus": self.tokenized_corpus,  # list[list[str]]
    "metadata": self.metadata,          # list[dict[str, Any]]
}
with open(index_path, "wb") as f:
    pickle.dump(data, f)

# Load
with open(index_path, "rb") as f:
    data = pickle.load(f)
self.corpus = data["corpus"]
self.tokenized_corpus = data["tokenized_corpus"]
self.metadata = data["metadata"]

# Rebuild index
self.bm25 = BM25Okapi(self.tokenized_corpus, k1=1.5, b=0.75)
```

**Benefits**:
- Fast serialization/deserialization
- Preserves Python types exactly
- No separate schema needed

**Limitations**:
- Binary format (not human-readable)
- Python-specific (can't use with other languages)
- File locking required for safety

---

## Search Result Ranking

### RRF Deduplication Strategy

**Problem**: Same document can appear in both vector and BM25 results with different IDs

**Solution**: Canonical URL deduplication

```python
def reciprocal_rank_fusion(ranked_lists, k=60):
    scores = {}
    doc_map = {}
    
    for ranked_list in ranked_lists:
        for rank, result in enumerate(ranked_list, start=1):
            # Priority order for dedup key
            payload = result.get("payload", {})
            metadata = result.get("metadata", {})
            
            doc_id = (
                payload.get("canonical_url")           # Vector results (priority 1)
                or metadata.get("canonical_url")       # BM25 results (priority 2)
                or payload.get("url")                  # Fallback to full URL
                or metadata.get("url")
                or result.get("id", str(rank))         # Last resort: use ID
            )
            
            # RRF score: 1/(k + rank)
            rrf_score = 1.0 / (k + rank)
            
            # Accumulate scores for duplicate entries
            scores[doc_id] = scores.get(doc_id, 0.0) + rrf_score
            
            # Keep first occurrence (metadata from first ranking source)
            if doc_id not in doc_map:
                doc_map[doc_id] = result
    
    # Sort by combined RRF score
    sorted_docs = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    
    return [
        {**doc_map[doc_id], "rrf_score": score}
        for doc_id, score in sorted_docs
    ]
```

**Deduplication Example**:

```
Vector search results:
1. ID=vec-001, canonical_url=https://example.com/page, score=0.95
2. ID=vec-002, canonical_url=https://example.com/other, score=0.87

BM25 search results:
1. Index=0, metadata={canonical_url=https://example.com/page}, score=5.2
2. Index=5, metadata={canonical_url=https://example.com/other}, score=4.1

RRF Fusion:
- https://example.com/page: 1/61 + 1/61 = 0.0328 (rank 1 in both)
- https://example.com/other: 1/62 + 1/62 = 0.0323 (rank 2 in both)

Final ranking:
1. https://example.com/page (rrf_score=0.0328)
2. https://example.com/other (rrf_score=0.0323)
```

### Response Formatting

**File**: `/compose/pulse/apps/webhook/api/routers/search.py`

```python
# Convert internal format to API response
results = []
for result in raw_results:
    # Handle both vector and BM25 result formats
    payload = result.get("payload") or result.get("metadata", {})
    text = payload.get("text") or result.get("text", "")
    
    results.append(
        SearchResult(
            url=payload.get("url", ""),
            title=payload.get("title"),
            description=payload.get("description"),
            text=text,
            score=result.get("score") or result.get("rrf_score", 0.0),
            metadata=payload,
        )
    )

return SearchResponse(
    results=results,
    total=len(results),
    query=search_request.query,
    mode=search_request.mode,
)
```

### Score Normalization

**Current Implementation**: No explicit normalization between vector and BM25 scores

**Issue**: Scores from different algorithms are on different scales:
- Cosine similarity: [0, 2]
- BM25: [0, ∞) (unbounded)
- RRF: [0, 1] (normalized by fusion)

**RRF Advantage**: By using rank-based fusion instead of score-based fusion, both modalities are already normalized to the same scale (reciprocal rank).

---

## Configuration & Performance

### Configuration Settings

**File**: `/compose/pulse/apps/webhook/config.py`

```python
# Text Chunking
max_chunk_tokens: int = 256              # Must match model's max_seq_length
chunk_overlap_tokens: int = 50           # ~20% overlap

# Embeddings
embedding_model: str = "Qwen/Qwen3-Embedding-0.6B"
vector_dim: int = 1024                   # Output dimension

# Vector Store
qdrant_url: str = "http://localhost:52102"
qdrant_collection: str = "pulse_docs"
qdrant_timeout: float = 60.0

# Keyword Search
bm25_k1: float = 1.5                     # Term frequency saturation
bm25_b: float = 0.75                     # Length normalization

# Hybrid Search
rrf_k: int = 60                          # RRF constant (standard)
hybrid_alpha: float = 0.5                # Currently unused (for future score-based fusion)

# API
api_secret: str = "<generated>"
webhook_secret: str = "<generated>"
cors_origins: list[str] = ["*"]          # SECURITY: Use specific origins in prod

# Search Bridge specific
tei_url: str = "http://localhost:52104"
tei_api_key: str | None = None

# Other
log_level: str = "INFO"
enable_worker: bool = True               # Background job processing
test_mode: bool = False                  # Use stub services
```

### Performance Characteristics

#### Indexing Performance

| Phase | Time | Dependencies |
|-------|------|--------------|
| Text Cleaning | ~10ms | CPU (text processing) |
| Chunking | ~50-200ms | CPU (tokenizer overhead, text length) |
| Embeddings | ~500-2000ms | Network (TEI), GPU (TEI inference) |
| Vector Indexing | ~100-500ms | Network (Qdrant), disk (Qdrant) |
| BM25 Indexing | ~50-200ms | CPU (tokenization), disk (pickle) |
| **Total** | **~700-3000ms** | All services |

**Scaling**: For 1000-word document with 256-token chunks:
- ~4-8 chunks created
- ~4-8 embeddings generated (batched)
- ~1 BM25 entry

#### Search Performance

| Phase | Time | Dependencies |
|-------|------|--------------|
| Query Embedding | ~50-200ms | Network (TEI), GPU (inference) |
| Vector Search | ~10-100ms | Network (Qdrant), index lookup |
| BM25 Search | ~1-10ms | CPU (BM25 computation), memory (index) |
| RRF Fusion | ~1-5ms | CPU (ranking merge) |
| Response Formatting | ~5-20ms | CPU (object construction) |
| **Semantic (vector)** | **~60-310ms** | TEI + Qdrant |
| **Keyword (BM25)** | **~1-10ms** | Local |
| **Hybrid** | **~62-320ms** | All services |

**Scaling**: Linear with result limit
- Limit=10: fast
- Limit=100: still ~300ms (network dominant)
- Limit=1000: may timeout

### Deployment Considerations

#### Memory Usage

- **TextChunker**: ~500MB (tokenizer model in memory)
- **BM25 Index**: ~1MB per 1000 documents
- **Qdrant**: Managed externally
- **TEI**: Managed externally

**Total per worker**: ~1GB base + index size

#### Network Latency

- **TEI latency**: ~100-500ms per batch (depends on GPU)
- **Qdrant latency**: ~10-100ms per search
- **Network overhead**: ~20-50ms round trip

#### Bottlenecks

1. **TEI Inference** (most common)
   - GPU inference for embeddings is slow
   - Solution: Use faster models or inference optimization

2. **Network Latency**
   - TEI/Qdrant on different machine adds latency
   - Solution: Colocate services

3. **BM25 Lock Contention**
   - Multiple workers updating index can cause timeouts
   - Solution: Use separate BM25 instances or lock-free approach

---

## Thread Safety & Concurrency

### Async/Await Design

**All I/O operations are async**:
- HTTP calls to TEI: `await embedding_service.embed_batch()`
- Qdrant calls: `await vector_store.search()`
- Database calls: `await database.query()`

**Benefits**:
- Single thread can handle multiple concurrent requests
- I/O wait time reused for other work
- No thread pool overhead

### Service Thread Safety

#### TextChunker
- **Implementation**: semantic-text-splitter (Rust)
- **Thread-safe**: YES (by design, Rust guarantees)
- **Locking**: None needed
- **Safe for**: Multi-threaded workers without changes

#### EmbeddingService
- **Implementation**: httpx.AsyncClient
- **Thread-safe**: YES (uses connection pooling)
- **Locking**: None needed
- **Safe for**: Multiple concurrent requests

#### VectorStore
- **Implementation**: AsyncQdrantClient
- **Thread-safe**: YES (async client with pool)
- **Locking**: None needed
- **Safe for**: Multiple concurrent searches

#### BM25Engine
- **Implementation**: File locking + BM25Okapi
- **Thread-safe**: YES (but with caveats)
- **Locking**: fcntl file locks (POSIX/Unix only)
- **Considerations**:
  - Multiple readers: Concurrent (shared locks)
  - Single writer: Exclusive lock acquired
  - Read-during-write: Blocked until write completes
  - Write-during-read: Blocked until reads complete

**File Locking Deadlock Prevention**:
```python
# Non-blocking lock attempt with timeout
lock_timeout = 30.0  # Seconds
lock_retry_delay = 0.1  # Seconds

while True:
    try:
        fcntl.flock(lock_file, LOCK_EX | LOCK_NB)  # Non-blocking
        break  # Lock acquired
    except OSError:  # EWOULDBLOCK if locked
        elapsed = time.time() - start_time
        if elapsed >= lock_timeout:
            raise TimeoutError(f"Lock timeout after {lock_timeout}s")
        time.sleep(lock_retry_delay)  # Wait before retry
```

### Service Pool Singleton

**File**: `/compose/pulse/apps/webhook/services/service_pool.py`

```python
class ServicePool:
    _instance: ClassVar["ServicePool | None"] = None
    _lock: ClassVar[threading.Lock] = threading.Lock()
    
    @classmethod
    def get_instance(cls) -> "ServicePool":
        # Fast path: instance exists
        if cls._instance is not None:
            return cls._instance
        
        # Slow path: double-checked locking
        with cls._lock:
            if cls._instance is None:
                cls._instance = cls()  # Expensive initialization
            return cls._instance
```

**Purpose**: Share expensive services across worker jobs
- Load tokenizer once (1-5 seconds)
- Reuse HTTP clients (connection pooling)
- Reuse BM25 index in memory
- Reuse Qdrant client

**Performance Impact**: 
- Without pool: 1-5s overhead per job
- With pool: 0.001s overhead per job
- **~1000x improvement** for high-throughput workers

---

## Error Handling & Resilience

### Retry Logic

**Implementation**: tenacity library with exponential backoff

```python
@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    retry=retry_if_exception_type(httpx.HTTPError),
    before=before_log(logger, logging.WARNING),
    reraise=True,
)
async def embed_batch(self, texts: list[str]) -> list[list[float]]:
    # Retries 3 times on HTTP errors
    # Waits: 2s, 4s, 8s (exponential backoff)
    response = await self.client.post(f"{self.tei_url}/embed", json={"inputs": texts})
    response.raise_for_status()
    return response.json()
```

**Retry Strategy**:
- Attempt 1: Immediate
- Attempt 2: Wait 2 seconds
- Attempt 3: Wait 4 seconds (2 * 2)
- Attempt 4: Wait 8 seconds (4 * 2), capped at 10 seconds
- Final: Raise exception

**Error Types Retried**: Only `httpx.HTTPError` (network issues)

**Error Types NOT Retried**:
- `ValueError` (invalid configuration)
- `httpx.InvalidURL` (bad URL)
- Application errors

### Graceful Degradation

#### TEI Unavailable

```python
# EmbeddingService.embed_batch() raises exception
# IndexingService catches and returns failure:
{
    "success": False,
    "url": "...",
    "chunks_indexed": 0,
    "error": "Embedding failed: Connection refused"
}

# Search returns empty results:
# _semantic_search() returns []
# _hybrid_search() falls back to BM25 only results
```

#### Qdrant Unavailable

```python
# VectorStore.index_chunks() raises exception
# IndexingService continues with BM25:
# (logs warning, but completes)

# Search in semantic mode: returns empty []
# Search in hybrid mode: returns BM25 results only
# Search in keyword mode: works normally
```

#### BM25 Lock Timeout

```python
# BM25Engine._acquire_lock() raises TimeoutError
# During initialization: log warning, start with empty index
# During indexing: log error, skip BM25 (vector indexing succeeds)
# During search: skip BM25 (vector search succeeds)
```

### Health Checks

```python
# Embedding service
async def health_check(self) -> bool:
    response = await self.client.get(f"{self.tei_url}/health")
    return response.status_code == 200

# Vector store
async def health_check(self) -> bool:
    collections = await self.client.get_collections()
    return len(collections.collections) >= 0
```

### Timing Metrics & Observability

**File**: `/compose/pulse/apps/webhook/utils/timing.py`

```python
class TimingContext:
    """Context manager for measuring operation timing."""
    
    async def __aenter__(self):
        self.start_time = time.perf_counter()
        return self
    
    async def __aexit__(self, *args):
        self.duration_ms = (time.perf_counter() - self.start_time) * 1000
        
        # Store in database for monitoring
        metric = OperationMetric(
            operation_type=self.operation_type,
            operation_name=self.operation_name,
            duration_ms=self.duration_ms,
            success=not args[0],  # args[0] is exception type
            error_message=str(args[1]) if args[1] else None,
            job_id=self.job_id,
            document_url=self.document_url,
        )
        await database.insert(metric)
```

**Usage in Indexing**:

```python
# Phase 1: Chunking
async with TimingContext("chunking", "chunk_text") as ctx:
    chunks = self.text_chunker.chunk_text(cleaned_markdown)
    ctx.metadata = {"chunks_created": len(chunks)}
# Logged: "chunk_text" took 145ms

# Phase 2: Embeddings
async with TimingContext("embedding", "embed_batch") as ctx:
    embeddings = await self.embedding_service.embed_batch(chunk_texts)
    ctx.metadata = {"batch_size": len(chunk_texts)}
# Logged: "embed_batch" took 1234ms

# Phase 3: Vector indexing
async with TimingContext("qdrant", "index_chunks") as ctx:
    indexed_count = await self.vector_store.index_chunks(chunks, embeddings)
    ctx.metadata = {"chunks_indexed": indexed_count}
# Logged: "index_chunks" took 567ms

# Phase 4: BM25 indexing
async with TimingContext("bm25", "index_document") as ctx:
    self.bm25_engine.index_document(text, metadata)
    ctx.metadata = {"text_length": len(cleaned_markdown)}
# Logged: "index_document" took 89ms
```

---

## Summary

The webhook server implements a sophisticated hybrid search system that combines:

1. **Vector Search (Semantic)**
   - Token-based chunking with overlap
   - Dense embeddings via HuggingFace TEI
   - Cosine similarity matching in Qdrant
   - Fast for conceptual queries

2. **Keyword Search (Exact)**
   - Full document indexing with BM25
   - TF-IDF based relevance scoring
   - File-locked concurrent access
   - Fast for exact matches

3. **Hybrid Fusion (RRF)**
   - Reciprocal Rank Fusion combines both signals
   - Canonical URL deduplication
   - Rank-based combination (scale-independent)
   - Best of both worlds

4. **Resilience & Monitoring**
   - Automatic retries with exponential backoff
   - Graceful degradation when services unavailable
   - Comprehensive timing metrics
   - Health checks and observability

The system is designed for:
- **Concurrency**: Thread-safe async/await architecture
- **Performance**: Service pooling, batch processing, connection pooling
- **Reliability**: Retries, timeouts, error handling
- **Observability**: Detailed timing metrics and logging

