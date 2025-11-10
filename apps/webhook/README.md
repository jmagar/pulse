# Firecrawl Search Bridge

A semantic search service that bridges Firecrawl web scraping with vector search capabilities using HuggingFace Text Embeddings Inference (TEI) and Qdrant.

## Architecture

```
Firecrawl (steamy-wsl) → Search Bridge API → Redis Queue → Background Worker
                                                              ├─> HuggingFace TEI (embeddings)
                                                              ├─> Qdrant (vector storage)
                                                              └─> BM25 (keyword search)
```

## Features

- **Hybrid Search**: Combines vector similarity (semantic) + BM25 (keyword) using Reciprocal Rank Fusion (RRF)
- **Token-based Chunking**: Intelligent text splitting using actual token counts (not characters)
- **Async Processing**: Background job queue for non-blocking document indexing
- **Rich Filtering**: Domain, language, country, mobile device filters
- **Multiple Search Modes**: Hybrid, semantic-only, keyword-only, BM25-only

## Quick Start

### Prerequisites

- Python 3.11+
- Docker & Docker Compose
- UV package manager

### Installation

Run from monorepo root:

```bash
# Copy environment template
cp .env.example .env
# Edit .env with your configuration

# Install dependencies
cd apps/webhook && make install

# Start all services via Docker Compose
cd /compose/pulse
docker compose up -d firecrawl_webhook firecrawl_webhook_worker
```

For standalone deployment, see root `docker-compose.yaml` for service definition.

### API Endpoints

- `POST /api/index` - Queue document for indexing
- `POST /api/search` - Search indexed documents
- `GET /health` - Health check
- `GET /api/stats` - Index statistics

## Configuration

### Port Allocation

| Port  | Service | Description |
|-------|---------|-------------|
| 52100 | search-bridge | FastAPI REST API |
| 52101 | redis | Redis Queue |
| 52102 | qdrant | Qdrant HTTP API |
| 52103 | qdrant | Qdrant gRPC API |
| 52104 | tei | HuggingFace TEI |

### Firecrawl Integration

Update Firecrawl's `.env` (on steamy-wsl):

```bash
ENABLE_SEARCH_INDEX=true
SEARCH_SERVICE_URL=http://<IP_OF_THIS_MACHINE>:52100
SEARCH_SERVICE_API_SECRET=your-secret-key
SEARCH_INDEX_SAMPLE_RATE=0.1
```

To find this machine's IP:
```bash
hostname -I | awk '{print $1}'
```

## Development

```bash
# Run tests
make test

# Format code
make format

# Lint code
make lint

# Type check
make type-check

# Run all checks
make check
```

## Project Structure

```
fc-bridge/
├── app/
│   ├── main.py              # FastAPI application
│   ├── config.py            # Settings
│   ├── models.py            # Pydantic schemas
│   ├── api/
│   │   ├── routes.py        # API endpoints
│   │   └── dependencies.py  # Shared dependencies
│   ├── services/
│   │   ├── embedding.py     # HF TEI client
│   │   ├── vector_store.py  # Qdrant client
│   │   ├── bm25_engine.py   # BM25 indexing
│   │   ├── search.py        # Hybrid search
│   │   └── indexing.py      # Document processing
│   ├── utils/
│   │   └── text_processing.py  # Token-based chunking
│   └── worker.py            # Background worker
├── tests/
├── data/                    # Docker volume mounts
├── docker-compose.yaml
├── pyproject.toml
└── README.md
```

## Search Modes

### 1. Hybrid (Default)
Combines vector similarity + BM25 using RRF:
```json
{
  "query": "machine learning",
  "mode": "hybrid",
  "limit": 10
}
```

### 2. Semantic Only
Pure vector similarity:
```json
{
  "query": "machine learning",
  "mode": "semantic"
}
```

### 3. Keyword / BM25
Traditional keyword search:
```json
{
  "query": "machine learning",
  "mode": "keyword"
}
```

## Monitoring

```bash
# View service logs
make services-logs

# Check health
curl http://localhost:52100/health

# View stats
curl http://localhost:52100/api/stats
```

## License

MIT

## Documentation

See [FIRECRAWL_BRIDGE.md](FIRECRAWL_BRIDGE.md) for complete implementation details.
