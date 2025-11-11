# Knowledge Graph Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add knowledge graph extraction using Ollama (Qwen3:8B) and Neo4j to enhance RAG pipeline with entity/relationship extraction and graph-based search re-ranking.

**Architecture:** Multi-stage extraction pipeline (chunk-level entities → chunk-level relationships → document consolidation) with validation/retry, storing in Neo4j alongside existing Qdrant (vector) and BM25 (keyword) indexes for triple-hybrid search.

**Tech Stack:**
- **Neo4j 2025.10.1**: Graph database for entities/relationships
- **Ollama**: LLM inference server (GPU-accelerated on external machine)
- **Qwen3:8B-Instruct**: Entity/relationship extraction model
- **Python**: neo4j driver, Pydantic schemas, httpx for Ollama API
- **FastAPI**: Graph query endpoints
- **Docker Compose**: Service orchestration

---

## Phase 1: Foundation Setup

### Task 1: Add Neo4j Service to Docker Compose

**Files:**
- Modify: `docker-compose.yaml:123-130`
- Modify: `.env.example`

**Step 1: Add Neo4j service definition**

Edit `docker-compose.yaml`, add after `firecrawl_changedetection` service (before `networks:`):

```yaml
  firecrawl_neo4j:
    <<: *common-service
    image: neo4j:2025.10.1-community-bullseye
    container_name: firecrawl_neo4j
    ports:
      - "${NEO4J_HTTP_PORT:-50210}:7474"
      - "${NEO4J_BOLT_PORT:-50211}:7687"
    volumes:
      - ${APPDATA_BASE:-/mnt/cache/appdata}/firecrawl_neo4j_data:/data
      - ${APPDATA_BASE:-/mnt/cache/appdata}/firecrawl_neo4j_logs:/logs
    healthcheck:
      test: ["CMD-SHELL", "wget -q --spider http://localhost:7474 || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s
```

**Step 2: Update firecrawl_webhook dependencies**

In `docker-compose.yaml`, find `firecrawl_webhook` service and add `firecrawl_neo4j` to `depends_on`:

```yaml
  firecrawl_webhook:
    # ... existing config ...
    depends_on:
      - firecrawl_db
      - firecrawl_cache
      - firecrawl_neo4j  # ADD THIS LINE
```

**Step 3: Add environment variables to .env.example**

Append to `.env.example`:

```bash
# Neo4j Configuration
NEO4J_HTTP_PORT=50210
NEO4J_BOLT_PORT=50211
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=firecrawl_graph_2025
NEO4J_AUTH=neo4j/firecrawl_graph_2025
NEO4J_PLUGINS=["apoc", "graph-data-science"]
NEO4J_dbms_memory_heap_initial__size=512m
NEO4J_dbms_memory_heap_max__size=2g
NEO4J_dbms_memory_pagecache_size=1g

# Webhook Neo4j Connection (uses NEO4J_USERNAME and NEO4J_PASSWORD above)
WEBHOOK_NEO4J_URL=bolt://firecrawl_neo4j:7687

# Graph Extraction Settings
WEBHOOK_GRAPH_EXTRACTION_ENABLED=true
WEBHOOK_GRAPH_EXTRACTION_MODEL=qwen3:8b-instruct
WEBHOOK_GRAPH_HALLUCINATION_CHECK=false
WEBHOOK_GRAPH_MIN_ENTITY_CONFIDENCE=0.6
WEBHOOK_GRAPH_MIN_RELATIONSHIP_CONFIDENCE=0.5
WEBHOOK_GRAPH_BATCH_SIZE=4
WEBHOOK_GRAPH_MAX_RETRIES=3

# Ollama Configuration (External GPU Machine)
OLLAMA_PORT=50203
WEBHOOK_OLLAMA_URL=http://gpu-machine:50203
```

**Step 4: Start Neo4j service**

Run:
```bash
docker compose up -d firecrawl_neo4j
```

Expected: Container starts, health check passes within 30s

**Step 5: Verify Neo4j is running**

Run:
```bash
curl -f http://localhost:50210
```

Expected: HTTP 200 response with Neo4j browser HTML

Run:
```bash
docker exec firecrawl_neo4j cypher-shell -u neo4j -p firecrawl_graph_2025 "RETURN 'Connected!' as status"
```

Expected output:
```
+---------------+
| status        |
+---------------+
| "Connected!"  |
+---------------+
```

**Step 6: Commit**

```bash
git add docker-compose.yaml .env.example
git commit -m "feat(infra): add Neo4j service for knowledge graph storage"
```

---

### Task 2: Add Ollama Service to External GPU Stack

**Files:**
- Modify: `docker-compose.external.yaml:46-47`

**Step 1: Add Ollama service definition**

Edit `docker-compose.external.yaml`, add after `firecrawl_qdrant` service:

```yaml
  firecrawl_ollama:
    <<: *common-service
    image: ollama/ollama:latest
    container_name: firecrawl_ollama
    ports:
      - "${OLLAMA_PORT:-50203}:11434"
    volumes:
      - ${APPDATA_BASE:-/mnt/cache/appdata}/firecrawl_ollama:/root/.ollama
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    environment:
      - OLLAMA_HOST=0.0.0.0:11434
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:11434/api/tags"]
      interval: 30s
      timeout: 10s
      retries: 3
```

**Step 2: Start Ollama service on GPU machine**

Run (on gpu-machine with docker context):
```bash
docker compose -f docker-compose.external.yaml up -d firecrawl_ollama
```

Expected: Container starts, GPU allocated

**Step 3: Pull Qwen3:8B model**

Run:
```bash
docker exec firecrawl_ollama ollama pull qwen3:8b-instruct
```

Expected: Model downloads (takes 5-10 minutes, ~5.2GB)

**Step 4: Verify model loaded**

Run:
```bash
docker exec firecrawl_ollama ollama list
```

Expected output includes `qwen3:8b-instruct`

**Step 5: Test model inference**

Run:
```bash
curl http://gpu-machine:50203/api/generate -d '{
  "model": "qwen3:8b-instruct",
  "prompt": "Say hello",
  "stream": false
}'
```

Expected: JSON response with generated text

**Step 6: Commit**

```bash
git add docker-compose.external.yaml
git commit -m "feat(infra): add Ollama service on GPU machine for graph extraction"
```

---

### Task 3: Add Neo4j Configuration to Settings

**Files:**
- Modify: `apps/webhook/config.py:232-304`

**Step 1: Write failing test for Neo4j config**

Create `apps/webhook/tests/unit/test_config_neo4j.py`:

```python
"""Tests for Neo4j configuration settings."""

import pytest
from pydantic import ValidationError

from config import Settings


def test_neo4j_url_default():
    """Test default Neo4j URL."""
    settings = Settings(
        api_secret="test-secret",
        webhook_secret="test-webhook-secret-1234567890",
    )

    assert settings.neo4j_url == "bolt://firecrawl_neo4j:7687"


def test_neo4j_url_from_env(monkeypatch):
    """Test Neo4j URL loaded from WEBHOOK_NEO4J_URL."""
    monkeypatch.setenv("WEBHOOK_NEO4J_URL", "bolt://custom-neo4j:7687")
    monkeypatch.setenv("WEBHOOK_API_SECRET", "test-secret")
    monkeypatch.setenv("WEBHOOK_SECRET", "test-webhook-secret-1234567890")

    settings = Settings()

    assert settings.neo4j_url == "bolt://custom-neo4j:7687"


def test_neo4j_credentials_default():
    """Test default Neo4j credentials."""
    settings = Settings(
        api_secret="test-secret",
        webhook_secret="test-webhook-secret-1234567890",
    )

    assert settings.neo4j_username == "neo4j"
    assert settings.neo4j_password == "firecrawl_graph_2025"


def test_ollama_url_default():
    """Test default Ollama URL."""
    settings = Settings(
        api_secret="test-secret",
        webhook_secret="test-webhook-secret-1234567890",
    )

    assert settings.ollama_url == "http://gpu-machine:50203"


def test_graph_extraction_settings():
    """Test graph extraction configuration."""
    settings = Settings(
        api_secret="test-secret",
        webhook_secret="test-webhook-secret-1234567890",
    )

    assert settings.graph_extraction_enabled is True
    assert settings.graph_extraction_model == "qwen3:8b-instruct"
    assert settings.graph_min_entity_confidence == 0.6
    assert settings.graph_min_relationship_confidence == 0.5
    assert settings.graph_batch_size == 4
    assert settings.graph_max_retries == 3


def test_graph_extraction_confidence_bounds():
    """Test confidence values are between 0.0 and 1.0."""
    with pytest.raises(ValidationError, match="greater than or equal to 0"):
        Settings(
            api_secret="test-secret",
            webhook_secret="test-webhook-secret-1234567890",
            graph_min_entity_confidence=-0.1,
        )

    with pytest.raises(ValidationError, match="less than or equal to 1"):
        Settings(
            api_secret="test-secret",
            webhook_secret="test-webhook-secret-1234567890",
            graph_min_entity_confidence=1.5,
        )
```

**Step 2: Run test to verify it fails**

Run:
```bash
cd apps/webhook
uv run pytest tests/unit/test_config_neo4j.py -v
```

Expected: FAIL - AttributeError: 'Settings' object has no attribute 'neo4j_url'

**Step 3: Add Neo4j and Ollama settings to config.py**

Edit `apps/webhook/config.py`, add after `changedetection_enable_auto_watch` field (line ~231):

```python
    # Neo4j Graph Database
    neo4j_url: str = Field(
        default="bolt://firecrawl_neo4j:7687",
        validation_alias=AliasChoices("WEBHOOK_NEO4J_URL", "NEO4J_URL"),
        description="Neo4j bolt connection URL",
    )
    neo4j_username: str = Field(
        default="neo4j",
        validation_alias=AliasChoices("WEBHOOK_NEO4J_USERNAME", "NEO4J_USERNAME"),
        description="Neo4j username",
    )
    neo4j_password: str = Field(
        default="firecrawl_graph_2025",
        validation_alias=AliasChoices("WEBHOOK_NEO4J_PASSWORD", "NEO4J_PASSWORD"),
        description="Neo4j password",
    )

    # Ollama LLM Service
    ollama_url: str = Field(
        default="http://gpu-machine:50203",
        validation_alias=AliasChoices("WEBHOOK_OLLAMA_URL", "OLLAMA_URL"),
        description="Ollama API URL for LLM inference",
    )

    # Graph Extraction Configuration
    graph_extraction_enabled: bool = Field(
        default=True,
        validation_alias=AliasChoices(
            "WEBHOOK_GRAPH_EXTRACTION_ENABLED", "GRAPH_EXTRACTION_ENABLED"
        ),
        description="Enable knowledge graph extraction",
    )
    graph_extraction_model: str = Field(
        default="qwen3:8b-instruct",
        validation_alias=AliasChoices(
            "WEBHOOK_GRAPH_EXTRACTION_MODEL", "GRAPH_EXTRACTION_MODEL"
        ),
        description="Ollama model for entity/relationship extraction",
    )
    graph_min_entity_confidence: float = Field(
        default=0.6,
        ge=0.0,
        le=1.0,
        validation_alias=AliasChoices(
            "WEBHOOK_GRAPH_MIN_ENTITY_CONFIDENCE", "GRAPH_MIN_ENTITY_CONFIDENCE"
        ),
        description="Minimum confidence threshold for extracted entities",
    )
    graph_min_relationship_confidence: float = Field(
        default=0.5,
        ge=0.0,
        le=1.0,
        validation_alias=AliasChoices(
            "WEBHOOK_GRAPH_MIN_RELATIONSHIP_CONFIDENCE",
            "GRAPH_MIN_RELATIONSHIP_CONFIDENCE",
        ),
        description="Minimum confidence threshold for extracted relationships",
    )
    graph_batch_size: int = Field(
        default=4,
        ge=1,
        validation_alias=AliasChoices("WEBHOOK_GRAPH_BATCH_SIZE", "GRAPH_BATCH_SIZE"),
        description="Number of chunks to process in parallel during extraction",
    )
    graph_max_retries: int = Field(
        default=3,
        ge=1,
        le=10,
        validation_alias=AliasChoices("WEBHOOK_GRAPH_MAX_RETRIES", "GRAPH_MAX_RETRIES"),
        description="Maximum retry attempts for failed extractions",
    )
```

**Step 4: Run test to verify it passes**

Run:
```bash
uv run pytest tests/unit/test_config_neo4j.py -v
```

Expected: PASS - all 6 tests green

**Step 5: Commit**

```bash
git add apps/webhook/config.py apps/webhook/tests/unit/test_config_neo4j.py
git commit -m "feat(config): add Neo4j and Ollama configuration settings"
```

---

## Phase 2: Entity and Relationship Schemas

### Task 4: Create Graph Domain Models

**Files:**
- Create: `apps/webhook/domain/graph.py`
- Create: `apps/webhook/tests/unit/test_graph_models.py`

**Step 1: Write failing test for entity types**

Create `apps/webhook/tests/unit/test_graph_models.py`:

```python
"""Tests for graph domain models."""

from domain.graph import Entity, EntityType, Relationship, RelationType


def test_entity_type_enum():
    """Test EntityType enum values."""
    assert EntityType.PERSON == "Person"
    assert EntityType.ORGANIZATION == "Organization"
    assert EntityType.TECHNOLOGY == "Technology"


def test_entity_creation():
    """Test creating an Entity."""
    entity = Entity(
        id="test-123",
        name="Claude",
        type=EntityType.TECHNOLOGY,
        description="AI assistant",
        confidence=0.95,
    )

    assert entity.id == "test-123"
    assert entity.name == "Claude"
    assert entity.type == EntityType.TECHNOLOGY
    assert entity.confidence == 0.95
    assert entity.aliases == []
    assert entity.source_chunk_ids == []


def test_entity_with_aliases():
    """Test entity with aliases."""
    entity = Entity(
        id="test-456",
        name="GPT-4",
        type=EntityType.TECHNOLOGY,
        aliases=["GPT4", "gpt-4"],
        confidence=0.9,
    )

    assert "GPT4" in entity.aliases
    assert "gpt-4" in entity.aliases


def test_relationship_creation():
    """Test creating a Relationship."""
    rel = Relationship(
        source_entity="entity-1",
        target_entity="entity-2",
        relation_type=RelationType.MENTIONS,
        confidence=0.85,
    )

    assert rel.source_entity == "entity-1"
    assert rel.target_entity == "entity-2"
    assert rel.relation_type == RelationType.MENTIONS
    assert rel.confidence == 0.85
    assert rel.properties == {}


def test_relationship_with_properties():
    """Test relationship with properties."""
    rel = Relationship(
        source_entity="doc-1",
        target_entity="person-1",
        relation_type=RelationType.CREATED_BY,
        properties={"date": "2025-01-01", "role": "author"},
        confidence=1.0,
    )

    assert rel.properties["date"] == "2025-01-01"
    assert rel.properties["role"] == "author"
```

**Step 2: Run test to verify it fails**

Run:
```bash
uv run pytest tests/unit/test_graph_models.py -v
```

Expected: FAIL - ModuleNotFoundError: No module named 'domain.graph'

**Step 3: Create graph domain models**

Create `apps/webhook/domain/graph.py`:

```python
"""
Knowledge graph domain models.

Defines entities, relationships, and extraction results for knowledge graph.
"""

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class EntityType(str, Enum):
    """Types of entities that can be extracted from text."""

    # Core entities
    DOCUMENT = "Document"
    CHUNK = "Chunk"

    # Named entities
    PERSON = "Person"
    ORGANIZATION = "Organization"
    LOCATION = "Location"

    # Conceptual entities
    CONCEPT = "Concept"
    TECHNOLOGY = "Technology"
    PRODUCT = "Product"
    EVENT = "Event"

    # Temporal entities
    DATE = "Date"
    TIME_PERIOD = "TimePeriod"

    # Quantitative entities
    METRIC = "Metric"
    MEASUREMENT = "Measurement"

    # Web-specific
    URL = "Url"
    DOMAIN = "Domain"
    TOPIC = "Topic"


class Entity(BaseModel):
    """Entity extracted from text."""

    id: str = Field(description="Unique identifier")
    name: str = Field(description="Entity name/label")
    type: EntityType = Field(description="Entity type")
    description: str | None = Field(default=None, description="Brief description")
    aliases: list[str] = Field(default_factory=list, description="Alternative names")
    confidence: float = Field(ge=0.0, le=1.0, description="Extraction confidence")
    source_chunk_ids: list[str] = Field(
        default_factory=list, description="Source chunk IDs"
    )


class RelationType(str, Enum):
    """Types of relationships between entities."""

    # Structural relationships
    LINKS_TO = "LINKS_TO"
    CITES = "CITES"
    REFERENCES = "REFERENCES"
    PART_OF = "PART_OF"
    CONTAINS = "CONTAINS"

    # Semantic relationships
    MENTIONS = "MENTIONS"
    DISCUSSES = "DISCUSSES"
    RELATED_TO = "RELATED_TO"
    SIMILAR_TO = "SIMILAR_TO"

    # Entity-specific
    WORKS_FOR = "WORKS_FOR"
    LOCATED_IN = "LOCATED_IN"
    CREATED_BY = "CREATED_BY"
    OWNS = "OWNS"
    USES = "USES"
    PRODUCES = "PRODUCES"

    # Temporal
    BEFORE = "BEFORE"
    AFTER = "AFTER"
    DURING = "DURING"
    HAPPENED_AT = "HAPPENED_AT"

    # Hierarchical
    SUBCATEGORY_OF = "SUBCATEGORY_OF"
    INSTANCE_OF = "INSTANCE_OF"
    HAS_PROPERTY = "HAS_PROPERTY"

    # Causal
    CAUSES = "CAUSES"
    CAUSED_BY = "CAUSED_BY"
    ENABLES = "ENABLES"
    PREVENTS = "PREVENTS"


class Relationship(BaseModel):
    """Relationship between two entities."""

    source_entity: str = Field(description="Source entity ID")
    target_entity: str = Field(description="Target entity ID")
    relation_type: RelationType = Field(description="Relationship type")
    properties: dict[str, Any] = Field(
        default_factory=dict, description="Additional metadata"
    )
    confidence: float = Field(ge=0.0, le=1.0, description="Extraction confidence")
    source_chunk_id: str | None = Field(default=None, description="Source chunk ID")
```

**Step 4: Run test to verify it passes**

Run:
```bash
uv run pytest tests/unit/test_graph_models.py -v
```

Expected: PASS - all 6 tests green

**Step 5: Commit**

```bash
git add apps/webhook/domain/graph.py apps/webhook/tests/unit/test_graph_models.py
git commit -m "feat(domain): add entity and relationship models for knowledge graph"
```

---

### Task 5: Create Extraction Result Schemas

**Files:**
- Modify: `apps/webhook/domain/graph.py:95-end`
- Modify: `apps/webhook/tests/unit/test_graph_models.py:59-end`

**Step 1: Write failing test for extraction results**

Append to `apps/webhook/tests/unit/test_graph_models.py`:

```python
from domain.graph import EntityExtractionResult, RelationshipExtractionResult


def test_entity_extraction_result():
    """Test EntityExtractionResult schema."""
    entity = Entity(
        id="e1",
        name="Test",
        type=EntityType.CONCEPT,
        confidence=0.8,
    )

    result = EntityExtractionResult(
        entities=[entity],
        chunk_id="chunk-123",
        processing_time_ms=250.5,
    )

    assert len(result.entities) == 1
    assert result.chunk_id == "chunk-123"
    assert result.processing_time_ms == 250.5


def test_relationship_extraction_result():
    """Test RelationshipExtractionResult schema."""
    rel = Relationship(
        source_entity="e1",
        target_entity="e2",
        relation_type=RelationType.RELATED_TO,
        confidence=0.75,
    )

    result = RelationshipExtractionResult(
        relationships=[rel],
        chunk_id="chunk-456",
        processing_time_ms=180.0,
    )

    assert len(result.relationships) == 1
    assert result.chunk_id == "chunk-456"
    assert result.processing_time_ms == 180.0
```

**Step 2: Run test to verify it fails**

Run:
```bash
uv run pytest tests/unit/test_graph_models.py::test_entity_extraction_result -v
```

Expected: FAIL - ImportError: cannot import name 'EntityExtractionResult'

**Step 3: Add extraction result models**

Append to `apps/webhook/domain/graph.py`:

```python
class EntityExtractionResult(BaseModel):
    """Result from entity extraction on a single chunk."""

    entities: list[Entity] = Field(description="Extracted entities")
    chunk_id: str = Field(description="Source chunk ID")
    processing_time_ms: float = Field(description="Processing time in milliseconds")


class RelationshipExtractionResult(BaseModel):
    """Result from relationship extraction on a single chunk."""

    relationships: list[Relationship] = Field(description="Extracted relationships")
    chunk_id: str = Field(description="Source chunk ID")
    processing_time_ms: float = Field(description="Processing time in milliseconds")


class DocumentExtractionResult(BaseModel):
    """Complete extraction result for a document."""

    entities: list[Entity] = Field(description="All extracted entities (deduplicated)")
    relationships: list[Relationship] = Field(
        description="All extracted relationships"
    )
    document_url: str = Field(description="Source document URL")
    total_chunks: int = Field(description="Number of chunks processed")
    total_time_ms: float = Field(description="Total processing time in milliseconds")
```

**Step 4: Run test to verify it passes**

Run:
```bash
uv run pytest tests/unit/test_graph_models.py -v
```

Expected: PASS - all 8 tests green

**Step 5: Commit**

```bash
git add apps/webhook/domain/graph.py apps/webhook/tests/unit/test_graph_models.py
git commit -m "feat(domain): add extraction result schemas for graph pipeline"
```

---

## Phase 3: Ollama Integration

### Task 6: Create Ollama Client Service

**Files:**
- Create: `apps/webhook/services/ollama_client.py`
- Create: `apps/webhook/tests/unit/test_ollama_client.py`

**Step 1: Write failing test for Ollama client**

Create `apps/webhook/tests/unit/test_ollama_client.py`:

```python
"""Tests for Ollama client service."""

import pytest
from pydantic import BaseModel

from services.ollama_client import OllamaClient


class TestSchema(BaseModel):
    """Test schema for structured output."""

    message: str
    confidence: float


@pytest.mark.asyncio
async def test_ollama_client_initialization():
    """Test OllamaClient initialization."""
    client = OllamaClient(
        base_url="http://localhost:11434",
        model="qwen3:8b-instruct",
    )

    assert client.base_url == "http://localhost:11434"
    assert client.model == "qwen3:8b-instruct"

    await client.close()


@pytest.mark.asyncio
async def test_health_check_success(httpx_mock):
    """Test health check succeeds when Ollama is available."""
    httpx_mock.add_response(
        url="http://localhost:11434/api/tags",
        json={"models": []},
        status_code=200,
    )

    client = OllamaClient(
        base_url="http://localhost:11434",
        model="test-model",
    )

    is_healthy = await client.health_check()

    assert is_healthy is True

    await client.close()


@pytest.mark.asyncio
async def test_health_check_failure(httpx_mock):
    """Test health check fails when Ollama is unavailable."""
    httpx_mock.add_response(
        url="http://localhost:11434/api/tags",
        status_code=500,
    )

    client = OllamaClient(
        base_url="http://localhost:11434",
        model="test-model",
    )

    is_healthy = await client.health_check()

    assert is_healthy is False

    await client.close()
```

**Step 2: Run test to verify it fails**

Run:
```bash
uv run pytest tests/unit/test_ollama_client.py -v
```

Expected: FAIL - ModuleNotFoundError: No module named 'services.ollama_client'

**Step 3: Create Ollama client service**

Create `apps/webhook/services/ollama_client.py`:

```python
"""
Ollama LLM client for structured extraction.

Provides interface to Ollama API with Pydantic schema validation.
"""

import httpx
from pydantic import BaseModel

from utils.logging import get_logger

logger = get_logger(__name__)


class OllamaClient:
    """Client for Ollama API with structured output support."""

    def __init__(
        self,
        base_url: str,
        model: str,
        timeout: float = 120.0,
    ) -> None:
        """
        Initialize Ollama client.

        Args:
            base_url: Ollama server URL (e.g., 'http://localhost:11434')
            model: Model name (e.g., 'qwen3:8b-instruct')
            timeout: Request timeout in seconds
        """
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.timeout = timeout

        self.client = httpx.AsyncClient(timeout=timeout)

        logger.info(
            "Ollama client initialized",
            base_url=self.base_url,
            model=self.model,
        )

    async def close(self) -> None:
        """Close HTTP client."""
        await self.client.aclose()
        logger.info("Ollama client closed")

    async def health_check(self) -> bool:
        """
        Check if Ollama server is healthy.

        Returns:
            True if healthy, False otherwise
        """
        try:
            response = await self.client.get(f"{self.base_url}/api/tags")
            is_healthy = response.status_code == 200
            logger.debug("Ollama health check", healthy=is_healthy)
            return is_healthy
        except Exception as e:
            logger.error("Ollama health check failed", error=str(e))
            return False
```

**Step 4: Run test to verify it passes**

Run:
```bash
uv run pytest tests/unit/test_ollama_client.py -v
```

Expected: PASS - all 3 tests green

**Step 5: Commit**

```bash
git add apps/webhook/services/ollama_client.py apps/webhook/tests/unit/test_ollama_client.py
git commit -m "feat(services): add Ollama client for LLM inference"
```

---

### Task 7: Add Structured Extraction with Retry

**Files:**
- Modify: `apps/webhook/services/ollama_client.py:44-end`
- Modify: `apps/webhook/tests/unit/test_ollama_client.py:55-end`

**Step 1: Write failing test for structured extraction**

Append to `apps/webhook/tests/unit/test_ollama_client.py`:

```python
from pydantic import ValidationError


@pytest.mark.asyncio
async def test_extract_structured_success(httpx_mock):
    """Test successful structured extraction."""
    httpx_mock.add_response(
        url="http://localhost:11434/api/chat",
        json={
            "message": {
                "content": '{"message": "Hello", "confidence": 0.95}'
            }
        },
        status_code=200,
    )

    client = OllamaClient(
        base_url="http://localhost:11434",
        model="test-model",
    )

    result = await client.extract_structured(
        prompt="Say hello",
        schema=TestSchema,
    )

    assert result is not None
    assert result.message == "Hello"
    assert result.confidence == 0.95

    await client.close()


@pytest.mark.asyncio
async def test_extract_structured_retry_on_invalid_json(httpx_mock):
    """Test retry on invalid JSON response."""
    # First attempt: invalid JSON
    httpx_mock.add_response(
        url="http://localhost:11434/api/chat",
        json={"message": {"content": "invalid json"}},
        status_code=200,
    )
    # Second attempt: valid JSON
    httpx_mock.add_response(
        url="http://localhost:11434/api/chat",
        json={
            "message": {
                "content": '{"message": "Hello", "confidence": 0.9}'
            }
        },
        status_code=200,
    )

    client = OllamaClient(
        base_url="http://localhost:11434",
        model="test-model",
    )

    result = await client.extract_structured(
        prompt="Say hello",
        schema=TestSchema,
        max_retries=3,
    )

    assert result is not None
    assert result.message == "Hello"

    await client.close()


@pytest.mark.asyncio
async def test_extract_structured_max_retries_exceeded(httpx_mock):
    """Test returns None after max retries."""
    # All attempts fail
    for _ in range(3):
        httpx_mock.add_response(
            url="http://localhost:11434/api/chat",
            json={"message": {"content": "invalid"}},
            status_code=200,
        )

    client = OllamaClient(
        base_url="http://localhost:11434",
        model="test-model",
    )

    result = await client.extract_structured(
        prompt="Say hello",
        schema=TestSchema,
        max_retries=3,
    )

    assert result is None

    await client.close()
```

**Step 2: Run test to verify it fails**

Run:
```bash
uv run pytest tests/unit/test_ollama_client.py::test_extract_structured_success -v
```

Expected: FAIL - AttributeError: 'OllamaClient' object has no attribute 'extract_structured'

**Step 3: Implement structured extraction with retry**

Append to `apps/webhook/services/ollama_client.py`:

```python
from pydantic import ValidationError
from typing import TypeVar

T = TypeVar("T", bound=BaseModel)


async def extract_structured(
    self,
    prompt: str,
    schema: type[T],
    max_retries: int = 3,
    temperature: float = 0.0,
) -> T | None:
    """
    Extract structured data with automatic retry on validation failure.

    Args:
        prompt: Extraction prompt
        schema: Pydantic schema for response validation
        max_retries: Maximum retry attempts
        temperature: Sampling temperature (0.0 for deterministic)

    Returns:
        Validated schema instance, or None if all retries fail
    """
    for attempt in range(max_retries):
        try:
            response = await self.client.post(
                f"{self.base_url}/api/chat",
                json={
                    "model": self.model,
                    "messages": [{"role": "user", "content": prompt}],
                    "format": schema.model_json_schema(),
                    "options": {"temperature": temperature},
                    "stream": False,
                },
            )
            response.raise_for_status()

            # Parse response
            data = response.json()
            content = data["message"]["content"]

            # Validate with Pydantic
            result = schema.model_validate_json(content)

            logger.info(
                "Extraction successful",
                attempt=attempt + 1,
                schema=schema.__name__,
            )

            return result

        except ValidationError as e:
            logger.warning(
                "Validation failed, retrying",
                attempt=attempt + 1,
                errors=e.errors(),
            )

            if attempt == max_retries - 1:
                logger.error("Extraction failed after max retries")
                return None

        except Exception as e:
            logger.error("Unexpected extraction error", error=str(e))
            return None

    return None


# Add method to class
OllamaClient.extract_structured = extract_structured
```

**Step 4: Run test to verify it passes**

Run:
```bash
uv run pytest tests/unit/test_ollama_client.py -v
```

Expected: PASS - all 6 tests green

**Step 5: Commit**

```bash
git add apps/webhook/services/ollama_client.py apps/webhook/tests/unit/test_ollama_client.py
git commit -m "feat(services): add structured extraction with retry logic to Ollama client"
```

---

## Phase 4: Neo4j Graph Store

### Task 8: Create Neo4j Graph Store Service

**Files:**
- Create: `apps/webhook/services/graph_store.py`
- Create: `apps/webhook/tests/unit/test_graph_store.py`
- Modify: `apps/webhook/pyproject.toml` (add neo4j dependency)

**Step 1: Add neo4j dependency**

Edit `apps/webhook/pyproject.toml`, add to `[project.dependencies]`:

```toml
dependencies = [
    # ... existing dependencies ...
    "neo4j>=5.17.0",
]
```

**Step 2: Install dependency**

Run:
```bash
cd apps/webhook
uv sync
```

Expected: neo4j package installed

**Step 3: Write failing test for graph store**

Create `apps/webhook/tests/unit/test_graph_store.py`:

```python
"""Tests for Neo4j graph store service."""

import pytest

from domain.graph import Entity, EntityType
from services.graph_store import GraphStore


@pytest.mark.asyncio
async def test_graph_store_initialization():
    """Test GraphStore initialization."""
    store = GraphStore(
        uri="bolt://localhost:7687",
        username="neo4j",
        password="test",
    )

    assert store.uri == "bolt://localhost:7687"
    assert store.username == "neo4j"

    await store.close()


@pytest.mark.asyncio
async def test_create_entity_node():
    """Test creating entity node in graph."""
    store = GraphStore(
        uri="bolt://localhost:7687",
        username="neo4j",
        password="test",
    )

    entity = Entity(
        id="test-entity-1",
        name="Claude",
        type=EntityType.TECHNOLOGY,
        description="AI assistant",
        confidence=0.95,
    )

    # This will fail until we implement the method
    await store.create_entity(entity)

    await store.close()
```

**Step 4: Run test to verify it fails**

Run:
```bash
uv run pytest tests/unit/test_graph_store.py::test_graph_store_initialization -v
```

Expected: FAIL - ModuleNotFoundError: No module named 'services.graph_store'

**Step 5: Create GraphStore service (basic structure)**

Create `apps/webhook/services/graph_store.py`:

```python
"""
Neo4j graph store service.

Handles all interactions with Neo4j graph database.
"""

from neo4j import AsyncGraphDatabase, AsyncDriver

from domain.graph import Entity
from utils.logging import get_logger

logger = get_logger(__name__)


class GraphStore:
    """Neo4j graph store client."""

    def __init__(self, uri: str, username: str, password: str) -> None:
        """
        Initialize Neo4j connection.

        Args:
            uri: Neo4j bolt URI (e.g., 'bolt://localhost:7687')
            username: Neo4j username
            password: Neo4j password
        """
        self.uri = uri
        self.username = username
        self.driver: AsyncDriver = AsyncGraphDatabase.driver(
            uri, auth=(username, password)
        )

        logger.info("Graph store initialized", uri=uri)

    async def close(self) -> None:
        """Close driver connection."""
        await self.driver.close()
        logger.info("Graph store closed")

    async def create_entity(self, entity: Entity) -> None:
        """
        Create entity node in graph.

        Args:
            entity: Entity to create
        """
        async with self.driver.session() as session:
            await session.run(
                f"""
                MERGE (e:Entity {{id: $id}})
                SET e:{entity.type.value},
                    e.name = $name,
                    e.description = $description,
                    e.confidence = $confidence,
                    e.aliases = $aliases
                """,
                id=entity.id,
                name=entity.name,
                description=entity.description,
                confidence=entity.confidence,
                aliases=entity.aliases,
            )

        logger.debug("Created entity node", entity_id=entity.id, name=entity.name)
```

**Step 6: Run test to verify it passes**

Run:
```bash
uv run pytest tests/unit/test_graph_store.py::test_graph_store_initialization -v
```

Expected: PASS

**Step 7: Commit**

```bash
git add apps/webhook/pyproject.toml apps/webhook/services/graph_store.py apps/webhook/tests/unit/test_graph_store.py
git commit -m "feat(services): add Neo4j graph store service with entity creation"
```

---

## Next Steps

Plan document saved to `docs/plans/2025-11-11-knowledge-graph-implementation.md`.

**Remaining phases to implement:**

**Phase 5**: Graph Extraction Service (Tasks 9-12)
- Entity extraction prompts and logic
- Relationship extraction prompts and logic
- Document consolidation
- Confidence filtering and deduplication

**Phase 6**: Integration with Indexing Pipeline (Tasks 13-15)
- Modify webhook worker to call graph extraction
- Add graph indexing to indexing flow
- Create background job for batch processing

**Phase 7**: Graph-Enhanced Search (Tasks 16-18)
- Graph re-ranking implementation
- Modify search orchestrator
- Create graph search API endpoints

**Phase 8**: MCP Server Tools (Tasks 19-20)
- Add graph query tools for Claude
- Update unified search interface

Each phase follows the same pattern: Write failing test → Implement → Verify passing → Commit

---

**Two execution options:**

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration with @superpowers:subagent-driven-development

**2. Parallel Session (separate)** - Open new session with @superpowers:executing-plans, batch execution with checkpoints

**Which approach?**
