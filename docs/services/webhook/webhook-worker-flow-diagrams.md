# Webhook Worker - Flow Diagrams & Sequences

## 1. Job Enqueueing & Processing Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  CLIENT                                                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ POST /api/webhook/firecrawl
                              │ (signed webhook payload)
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  FASTAPI API (Webhook Handler)                                  │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ 1. Verify webhook signature                              │ │
│  │ 2. Parse & validate payload                              │ │
│  │ 3. Extract document data                                 │ │
│  │ 4. Get RQ queue dependency                               │ │
│  └───────────────────────────────────────────────────────────┘ │
│                              │                                  │
│                              ↓                                  │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ queue.enqueue(                                            │ │
│  │   "worker.index_document_job",                           │ │
│  │   document.model_dump(),                                 │ │
│  │   job_timeout="10m"                                      │ │
│  │ )                                                         │ │
│  │ Returns: Job(id="abc123...")                             │ │
│  └───────────────────────────────────────────────────────────┘ │
│                              │                                  │
│                              ↓                                  │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ Response: 202 Accepted                                    │ │
│  │ {                                                         │ │
│  │   "job_id": "abc123...",                                 │ │
│  │   "status": "queued",                                    │ │
│  │   "message": "Document queued for indexing"              │ │
│  │ }                                                         │ │
│  └───────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTP 202 (Accepted)
                              ↓
                         CLIENT ACK
                       (Job queued, not
                        yet processed)
                              │
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  REDIS (pulse_redis)                                            │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ Queue: rq:queue:indexing                                 │ │
│  │ Contents: ["abc123...", "def456...", ...]                │ │
│  └───────────────────────────────────────────────────────────┘ │
│                              │                                  │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ Job: rq:job:abc123...                                    │ │
│  │ Fields:                                                  │ │
│  │  - data: pickled(function, args)                         │ │
│  │  - status: "queued"                                      │ │
│  │  - created_at: timestamp                                 │ │
│  └───────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┴─────────────────────┐
        ↓                                           ↓
   [EMBEDDED MODE]                          [STANDALONE MODE]
   (WEBHOOK_ENABLE_WORKER=true)             (WEBHOOK_ENABLE_WORKER=false)
        │                                           │
        ↓                                           ↓
┌──────────────────────────────┐  ┌──────────────────────────────┐
│ FastAPI Process              │  │ Standalone Worker Container  │
│                              │  │                              │
│ ┌────────────────────────┐   │  │ ┌────────────────────────┐   │
│ │ Main Thread (API)      │   │  │ │ Worker Process         │   │
│ │ - Handle HTTP requests │   │  │ │ - Monitor queue        │   │
│ │ - Enqueue jobs         │   │  │ │ - Execute jobs         │   │
│ │ - Serve responses      │   │  │ │ - Report results       │   │
│ └────────────────────────┘   │  │ └────────────────────────┘   │
│         │                    │  │          │                   │
│         ↓                    │  │          ↓                   │
│ ┌────────────────────────┐   │  │ ┌────────────────────────┐   │
│ │ Background Thread      │   │  │ │ RQ Worker              │   │
│ │ (WorkerThreadManager)  │   │  │ │ - Pop from queue       │   │
│ │                        │   │  │ │ - Execute: execute_job │   │
│ │ _run_worker():         │   │  │ │ - Result → Redis       │   │
│ │ ├─ Init ServicePool    │   │  │ └────────────────────────┘   │
│ │ └─ worker.work()       │   │  │                              │
│ │    [blocking loop]     │   │  │ (Can scale: 0 to N workers) │
│ └────────────────────────┘   │  └──────────────────────────────┘
│         │                    │          │
│  Shared │ ServicePool        │  Independent ServicePool per
│  Reuse  │ (single)           │  worker, init overhead per
│         │                    │  worker startup
└──────────────────────────────┘  └──────────────────────────────┘
        │                                 │
        └─────────────────┬───────────────┘
                          ↓
        ┌─────────────────────────────────┐
        │ RQ Worker Processing Loop        │
        │                                 │
        │ while True:                     │
        │   1. BLPOP rq:queue:indexing    │
        │      [Wait for job]             │
        │   2. HSET rq:job:{id}           │
        │      status="started"           │
        │   3. Execute function:          │
        │      index_document_job(doc)    │
        │   4. Handle result:             │
        │      ├─ Return → success        │
        │      └─ Raise → failed          │
        │   5. HSET rq:job:{id}           │
        │      status="finished|failed"   │
        │      result=...                 │
        │   6. LREM rq:queue:indexing     │
        │      [Remove from queue]        │
        └─────────────────────────────────┘
                      │
                      ↓
        ┌─────────────────────────────────┐
        │ Job Execution                   │
        │                                 │
        │ index_document_job(doc_dict)    │
        │ ├─ Parse → IndexDocumentRequest │
        │ ├─ ServicePool.get_instance()   │
        │ │  └─ FAST reuse (0.001s)       │
        │ ├─ Chunk text (tokens)          │
        │ ├─ Generate embeddings (TEI)    │
        │ ├─ Index to Qdrant (vector)     │
        │ ├─ Index to BM25 (keyword)      │
        │ └─ Return result                │
        │                                 │
        │ Result: {success: true/false}   │
        └─────────────────────────────────┘
                      │
                      ↓
        ┌─────────────────────────────────┐
        │ External Services               │
        │                                 │
        │ ┌──────────────────────────┐    │
        │ │ TEI (embeddings)          │    │
        │ │ POST /encode              │    │
        │ │ [1-5s per document]       │    │
        │ └──────────────────────────┘    │
        │                                 │
        │ ┌──────────────────────────┐    │
        │ │ Qdrant (vector storage)   │    │
        │ │ Upsert collections        │    │
        │ │ [<100ms per batch]        │    │
        │ └──────────────────────────┘    │
        │                                 │
        │ ┌──────────────────────────┐    │
        │ │ PostgreSQL (metrics)      │    │
        │ │ Insert timing records     │    │
        │ └──────────────────────────┘    │
        └─────────────────────────────────┘
```

---

## 2. Rescrape Job Workflow (changedetection.io)

```
┌─────────────────────────────────────────────────────────┐
│  changedetection.io                                     │
│  (Detects URL has changed)                              │
└─────────────────────────────────────────────────────────┘
                      │
                      │ POST /api/webhook/changedetection
                      │ X-Signature: sha256=HMAC(body)
                      │ {
                      │   "watch_id": "abc123",
                      │   "watch_url": "https://example.com",
                      │   "snapshot": "changed content",
                      │   "detected_at": "2025-11-13T14:30:00Z"
                      │ }
                      ↓
┌─────────────────────────────────────────────────────────┐
│  FastAPI Webhook Handler                                │
│  ┌───────────────────────────────────────────────────┐ │
│  │ 1. Verify HMAC signature                          │ │
│  │ 2. Parse & validate payload                       │ │
│  │ 3. Create ChangeEvent record                      │ │
│  │    {                                              │ │
│  │      watch_id: "abc123",                          │ │
│  │      watch_url: "https://example.com",            │ │
│  │      detected_at: timestamp,                      │ │
│  │      rescrape_status: "queued"                    │ │
│  │    }                                              │ │
│  │ 4. Enqueue rescrape job                           │ │
│  └───────────────────────────────────────────────────┘ │
│                      │                                  │
│                      ↓                                  │
│  ┌───────────────────────────────────────────────────┐ │
│  │ Response: 202 Accepted                            │ │
│  │ {                                                 │ │
│  │   "status": "queued",                             │ │
│  │   "job_id": "def456...",                          │ │
│  │   "change_event_id": 42                           │ │
│  │ }                                                 │ │
│  └───────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
                      │
                      ↓
┌─────────────────────────────────────────────────────────┐
│  PostgreSQL (webhook schema)                            │
│                                                         │
│  ┌────────────────────────────────────────────────┐    │
│  │ webhook.change_events                          │    │
│  │                                                │    │
│  │ id: 42                                         │    │
│  │ watch_id: "abc123"                             │    │
│  │ watch_url: "https://example.com"               │    │
│  │ detected_at: 2025-11-13 14:30:00               │    │
│  │ rescrape_status: "queued"                      │    │
│  │ rescrape_job_id: "def456..."                   │    │
│  │ indexed_at: null (will be set on completion)   │    │
│  └────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
                      │
                      ↓
┌─────────────────────────────────────────────────────────┐
│  Redis Queue                                            │
│                                                         │
│  rq:queue:indexing: ["def456...", ...]                 │
│  rq:job:def456...:                                      │
│    - function: "app.jobs.rescrape.rescrape_changed_url"│
│    - args: [42]  (change_event_id)                     │
│    - status: "queued"                                  │
└─────────────────────────────────────────────────────────┘
                      │
                      ↓
┌─────────────────────────────────────────────────────────┐
│  RQ Worker (Processing rescrape_changed_url job)        │
│                                                         │
│  1. TRANSACTION 1: Mark in_progress                    │
│     ├─ Fetch ChangeEvent by id=42                      │
│     ├─ UPDATE rescrape_status="in_progress"            │
│     └─ COMMIT                                          │
│                                                         │
│  2. EXTERNAL OPERATIONS (no DB changes)                │
│     ├─ Call Firecrawl API                              │
│     │  POST /v2/scrape                                 │
│     │  {url: "https://example.com", ...}               │
│     │  Response: {markdown: "...", html: "..."}        │
│     │                                                  │
│     └─ Index via _index_document_helper()              │
│        ├─ Parse markdown                               │
│        ├─ ServicePool.get_instance()                   │
│        ├─ Chunk text                                   │
│        ├─ Generate embeddings                          │
│        ├─ Index to Qdrant + BM25                       │
│        └─ Return document_id                           │
│                                                         │
│  3. TRANSACTION 2: Mark completed                      │
│     ├─ UPDATE ChangeEvent                              │
│     │  rescrape_status="completed"                     │
│     │  indexed_at=now()                                │
│     │  extra_metadata={document_id, ...}               │
│     └─ COMMIT                                          │
│                                                         │
│  On error:                                             │
│  ├─ TRANSACTION 2a: Mark failed                        │
│  │  UPDATE rescrape_status="failed: ..."               │
│  │  extra_metadata={error, failed_at, ...}             │
│  └─ Re-raise (mark job as failed)                      │
└─────────────────────────────────────────────────────────┘
                      │
                      ↓
┌─────────────────────────────────────────────────────────┐
│  Firecrawl API (pulse_firecrawl)                        │
│                                                         │
│  POST /v2/scrape                                        │
│  {                                                      │
│    "url": "https://example.com",                        │
│    "formats": ["markdown", "html"],                     │
│    "onlyMainContent": true                              │
│  }                                                      │
│                                                         │
│  Response:                                              │
│  {                                                      │
│    "success": true,                                     │
│    "data": {                                            │
│      "markdown": "# Updated Content\n...",              │
│      "html": "<h1>Updated...</h1>",                     │
│      "metadata": {                                      │
│        "title": "Page Title",                           │
│        "description": "..."                             │
│      }                                                  │
│    }                                                    │
│  }                                                      │
└─────────────────────────────────────────────────────────┘
                      │
                      ↓
┌─────────────────────────────────────────────────────────┐
│  Index Updated Content                                  │
│  (Same as regular indexing job)                         │
│                                                         │
│  ├─ TextChunker.chunk_text(markdown)                    │
│  ├─ EmbeddingService.embed(chunks)  [TEI]              │
│  ├─ VectorStore.upsert(chunks, vectors)  [Qdrant]      │
│  └─ BM25Engine.index(chunks)                           │
│                                                         │
│  Result: Document re-indexed with new content          │
└─────────────────────────────────────────────────────────┘
                      │
                      ↓
┌─────────────────────────────────────────────────────────┐
│  Database Updated                                       │
│                                                         │
│  change_events record now shows:                        │
│  ├─ rescrape_status: "completed"                        │
│  ├─ indexed_at: 2025-11-13 14:31:00                     │
│  ├─ extra_metadata: {document_id, timestamp, ...}       │
│  └─ [Searchable content updated in Qdrant]              │
└─────────────────────────────────────────────────────────┘
```

---

## 3. Service Pool Lifecycle

```
┌─────────────────────────────────────────────────────────┐
│  FastAPI Startup                                        │
└─────────────────────────────────────────────────────────┘
                      │
                      ↓
        [Check WEBHOOK_ENABLE_WORKER]
                      │
        ┌─────────────┴──────────────┐
        │                            │
        ↓ true                        ↓ false
        │                            │
        │                   [Embedded worker disabled]
        │                            │
        ↓                            ↓
┌──────────────────────┐   ┌────────────────────────┐
│ WorkerThreadManager  │   │ API Only                │
│ .start()             │   │ (Worker runs separately)│
└──────────────────────┘   └────────────────────────┘
        │
        ↓
┌──────────────────────────────────────────────────────┐
│ Background Thread Starts                             │
│ _run_worker()                                        │
└──────────────────────────────────────────────────────┘
        │
        ↓
┌──────────────────────────────────────────────────────┐
│ ServicePool.get_instance()                           │
│                                                      │
│ Double-checked locking:                              │
│ ┌───────────────────────────────────────────────┐   │
│ │ if _instance is not None:                     │   │
│ │     return _instance  [FAST PATH - no lock]   │   │
│ │                                               │   │
│ │ with _lock:                                   │   │
│ │     if _instance is None:                     │   │
│ │         _instance = ServicePool()  [SLOW]     │   │
│ └───────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────┘
        │
        ↓ [First call - INIT, ~1-5 seconds]
┌──────────────────────────────────────────────────────┐
│ ServicePool.__init__()                               │
│                                                      │
│ ┌──────────────────────────────────────────────┐    │
│ │ self.text_chunker = TextChunker(              │    │
│ │   model_name="Qwen/Qwen3-Embedding-0.6B",    │    │
│ │   max_tokens=256,                            │    │
│ │ )                                            │    │
│ │ [Loads HuggingFace tokenizer - SLOW 1-5s]    │    │
│ └──────────────────────────────────────────────┘    │
│                                                      │
│ ┌──────────────────────────────────────────────┐    │
│ │ self.embedding_service = EmbeddingService(   │    │
│ │   tei_url="http://tei:3000",                 │    │
│ │ )                                            │    │
│ │ [Creates httpx.AsyncClient]                  │    │
│ └──────────────────────────────────────────────┘    │
│                                                      │
│ ┌──────────────────────────────────────────────┐    │
│ │ self.vector_store = VectorStore(             │    │
│ │   url="http://qdrant:6333",                  │    │
│ │ )                                            │    │
│ │ [Creates qdrant-client connection]           │    │
│ └──────────────────────────────────────────────┘    │
│                                                      │
│ ┌──────────────────────────────────────────────┐    │
│ │ self.bm25_engine = BM25Engine(...)           │    │
│ │ [Loads/creates BM25 index]                   │    │
│ └──────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────┘
        │
        ↓
┌──────────────────────────────────────────────────────┐
│ worker.work() - Blocking Loop                        │
│                                                      │
│ while True:                                          │
│   1. BLPOP redis:rq:queue:indexing [WAIT]           │
│      [Blocks until job arrives]                      │
│                                                      │
│   2. Pop job from queue                             │
│      - Job ID: "abc123..."                          │
│      - Function: index_document_job                 │
│      - Args: {document_dict}                        │
│                                                      │
│   3. Mark job started                               │
│      HSET redis:rq:job:abc123... status=started    │
│                                                      │
│   4. Execute: index_document_job(doc_dict)          │
│      │                                              │
│      └─→ ServicePool.get_instance()  [FAST 0.001s]  │
│          [Already initialized, just return]         │
│          └─→ indexing_service.index_document()      │
│              ├─ text_chunker.chunk()  [pooled]      │
│              ├─ embedding_service.embed()  [pooled] │
│              ├─ vector_store.upsert()  [pooled]     │
│              └─ bm25_engine.index()  [pooled]       │
│                                                      │
│   5. Get result                                     │
│      result = {success: true, ...}                  │
│                                                      │
│   6. Mark job finished                              │
│      HSET redis:rq:job:abc123...                   │
│        status=finished                              │
│        result=pickled(result)                       │
│                                                      │
│   7. Remove from queue                              │
│      LREM redis:rq:queue:indexing abc123...        │
│                                                      │
│   8. Log completion                                 │
│      logger.info("Job completed", job_id=abc123...) │
│                                                      │
│   [Loop back to step 1 - wait for next job]         │
└──────────────────────────────────────────────────────┘
```

---

## 4. Dual-Mode Worker Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                         DEVELOPMENT MODE                         │
│                  (WEBHOOK_ENABLE_WORKER=true)                    │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────┐
│  Docker Container            │
│  (pulse_webhook)             │
│                              │
│  ┌────────────────────────┐  │
│  │ Main Thread            │  │
│  │ (FastAPI)              │  │
│  │                        │  │
│  │ - Handle webhooks      │  │
│  │ - Enqueue jobs         │  │
│  │ - Return 202           │  │
│  │ - API never blocked    │  │
│  └────────────────────────┘  │
│            ↑                 │
│            │                 │
│  ┌────────────────────────┐  │
│  │ Background Thread      │  │
│  │ (RQ Worker)            │  │
│  │                        │  │
│  │ - Process jobs         │  │
│  │ - Index documents      │  │
│  │ - Update Qdrant, BM25  │  │
│  └────────────────────────┘  │
│            ↓                 │
│  ┌────────────────────────┐  │
│  │ Shared ServicePool     │  │
│  │                        │  │
│  │ - TextChunker (shared) │  │
│  │ - EmbeddingService     │  │
│  │ - VectorStore          │  │
│  │ - BM25Engine           │  │
│  │                        │  │
│  │ (Single instance)      │  │
│  └────────────────────────┘  │
└──────────────────────────────┘
         │         │         │
         │         │         │
    ┌────┴────┬────┴────┬────┴──────┐
    │          │         │            │
    ↓          ↓         ↓            ↓
 Redis      Qdrant    TEI      PostgreSQL

PROS:
✓ Simple deployment (1 container)
✓ Shared service pool (best perf)
✓ No file sync needed
✓ Easy debugging

CONS:
✗ API can block during job processing
✗ Worker can't scale independently
✗ Tight coupling


┌──────────────────────────────────────────────────────────────────┐
│                         PRODUCTION MODE                          │
│                  (WEBHOOK_ENABLE_WORKER=false)                   │
└──────────────────────────────────────────────────────────────────┘

┌────────────────────────────┐    ┌────────────────────────────────┐
│  Container 1               │    │  Container 2                   │
│  (pulse_webhook - API)     │    │  (pulse_webhook-worker)        │
│                            │    │                                │
│ ┌──────────────────────┐   │    │  ┌──────────────────────────┐  │
│ │ FastAPI              │   │    │  │ RQ Worker Process        │  │
│ │                      │   │    │  │                          │  │
│ │ - Handle webhooks    │   │    │  │ - Monitor queue          │  │
│ │ - Enqueue jobs       │   │    │  │ - Pop jobs               │  │
│ │ - Return 202         │   │    │  │ - Execute index_document │  │
│ │ - Never blocked      │   │    │  │ - Store results          │  │
│ │                      │   │    │  │                          │  │
│ │ ServicePool (minimal)│   │    │  │ ServicePool (main)       │  │
│ │ - Cache results      │   │    │  │ - TextChunker            │  │
│ │ - Search only        │   │    │  │ - EmbeddingService       │  │
│ └──────────────────────┘   │    │  │ - VectorStore            │  │
│          ↓                 │    │  │ - BM25Engine             │  │
│  No long-running jobs      │    │  │                          │  │
└────────────────────────────┘    │  └──────────────────────────┘  │
         │         │              │          │          │     │
         │         │              │          │          │     │
         └─────────┴──────────────┴──────────┴──────────┴─────┘
                        │
         ┌──────────────┴──────────────┐
         │                             │
         ↓                             ↓
    ┌─────────────────────┐    ┌────────────────────┐
    │  Redis Queue        │    │ Shared Services    │
    │ rq:queue:indexing   │    │                    │
    │ [Job queue]         │    │ - Qdrant           │
    │                     │    │ - TEI              │
    │ Both workers        │    │ - PostgreSQL       │
    │ pull from same      │    │ - BM25 files       │
    │ queue (scalable)    │    └────────────────────┘
    └─────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│  Optional: Scale Worker                                      │
│                                                              │
│  Docker Compose (docker-compose override):                  │
│  services:                                                  │
│    pulse_webhook-worker-2:                                  │
│      <<: *common-service                                    │
│      container_name: pulse_webhook-worker-2                 │
│      # Same image, same queue, different worker instance    │
│    pulse_webhook-worker-3:                                  │
│      # ... (as needed)                                      │
└──────────────────────────────────────────────────────────────┘

PROS:
✓ API never blocked
✓ Worker can scale 0 to N
✓ Separate logs/monitoring
✓ Independent restarts
✓ Higher throughput

CONS:
✗ More complex deployment
✗ ServicePool init per worker
✗ Separate resource management


┌──────────────────────────────────────────────────────────────────┐
│                      HYBRID MODE (RECOMMENDED)                   │
│                  (pulse_webhook + pulse_webhook-worker)           │
└──────────────────────────────────────────────────────────────────┘

Best of both worlds:
1. Lightweight API container (WEBHOOK_ENABLE_WORKER=false)
2. Dedicated worker container(s) (pulse_webhook-worker)
3. Both consume same Redis queue
4. Scale API and workers independently

Docker Compose layout:
  pulse_webhook:
    - API only, lightweight
    - No background worker thread
    - Multiple replicas: api-1, api-2, api-3...
    
  pulse_webhook-worker:
    - Dedicated to background jobs
    - Multiple replicas: worker-1, worker-2...
    - Scales based on queue depth
    
All services share:
  - Redis (queue + cache)
  - Qdrant (vector storage)
  - TEI (embeddings)
  - PostgreSQL (metrics)
```

---

## 5. Error Handling & Recovery

```
┌─────────────────────────────────────────────────┐
│  Job Execution Flow with Error Handling         │
└─────────────────────────────────────────────────┘

TYPE 1: INDEXING JOB (index_document_job)
────────────────────────────────────────

index_document_job(document_dict)
    │
    ├─→ Try:
    │   ├─ Parse document
    │   ├─ Get ServicePool
    │   ├─ index_document()
    │   └─ Return result
    │
    └─→ Except Exception as e:
        ├─ Log error (exc_info=True)
        └─ Return {
             "success": false,
             "error": str(e),
             "error_type": type(e).__name__
           }

Result behavior:
├─ Success → RQ marks job as "finished"
├─ Failure (error returned) → RQ marks job as "finished"
│  (Job appears successful, but success=false in result)
└─ [No automatic retry - result returned to caller]

Status in Redis:
  rq:job:{id} status=finished
  rq:job:{id} result=pickled({success: false, error: ...})


TYPE 2: RESCRAPE JOB (rescrape_changed_url)
────────────────────────────────────────────

rescrape_changed_url(change_event_id)
    │
    ├─→ Transaction 1:
    │   └─ Mark in_progress, COMMIT
    │
    ├─→ Try:
    │   ├─ Call Firecrawl API
    │   ├─ Parse response
    │   └─ Index document
    │
    └─→ Except Exception as e:
        ├─ Transaction 2a: Mark failed
        │  ├─ rescrape_status = f"failed: {e}"
        │  ├─ extra_metadata = {error, failed_at}
        │  └─ COMMIT
        │
        └─ Raise e  [Re-raise]

Result behavior:
├─ Success → RQ marks job as "finished"
├─ Failure (exception raised) → RQ marks job as "failed"
│  └─ [Could be retried by RQ if configured]
└─ Either way: DB transaction records the outcome

Status in Redis:
  Success:
    rq:job:{id} status=finished
    
  Failure:
    rq:job:{id} status=failed
    rq:job:{id} exc_info=stack trace


ERROR SCENARIOS & RECOVERY
───────────────────────────

Scenario 1: Network failure to Firecrawl
└─ Rescrape job:
   ├─ Catch exception
   ├─ Store error in DB
   ├─ Raise to mark job failed
   └─ [Operator can manually retry job via Redis CLI]

Scenario 2: Qdrant unavailable
└─ Indexing job:
   ├─ Return {success: false, error: "Qdrant connection failed"}
   ├─ Job marked as "finished"
   └─ [No automatic retry - client may re-enqueue]

Scenario 3: TEI timeout
└─ Indexing job:
   ├─ Embedding service timeout
   ├─ Return {success: false, error: "TEI timeout"}
   └─ [Job completes with failure]

Scenario 4: Worker dies mid-job
└─ Redis queue:
   ├─ Job marked as "started" (no end marker)
   ├─ Worker absent from rq:workers after TTL (600s)
   ├─ [Manual recovery: check rq:workers, restart worker]
   └─ [Job orphaned in queue or marked as failed by RQ]


LOGGING & MONITORING
────────────────────

All errors logged with:
├─ error: str(e)
├─ error_type: type(e).__name__
├─ exc_info: True (includes stack trace)
├─ context: url, job_id, document_keys, etc.

Structured logging (structlog):
├─ Machine parseable
├─ JSON output to stdout
├─ Captured by Docker logs
└─ Can be shipped to ELK, etc.

Example error log:
  {
    "event": "Indexing job failed",
    "url": "https://example.com",
    "error": "Connection refused: Qdrant",
    "error_type": "ConnectionError",
    "job_id": "abc123...",
    "timestamp": "2025-11-13T14:30:00.123456Z"
  }
```

---

## Summary: Key Differences

| Aspect | Embedded | Standalone | Hybrid |
|--------|----------|-----------|--------|
| **Containers** | 1 (pulse_webhook) | 2+ (api + worker) | 2+ (api + 1+ workers) |
| **Worker Thread** | In API process | Separate process | Separate process |
| **Scaling** | ✗ (together) | ✓ (independent) | ✓ (independent) |
| **Service Pool** | Shared (fast) | Per-worker (init OHP) | Per-worker (init OHP) |
| **Complexity** | Low | Medium | Medium |
| **Best For** | Dev, small | Scale, high load | Prod, balanced |
| **API Blocking** | Yes (jobs pause) | No (async) | No (async) |
| **Deployment** | Simple | Complex | Balanced |

