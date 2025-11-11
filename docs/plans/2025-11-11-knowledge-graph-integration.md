# Knowledge Graph Integration Plan
**Created:** 2025-11-11
**Status:** DRAFT - Awaiting Approval
**RTX 4070 12GB VRAM Target**

## Executive Summary

Upgrade the RAG pipeline to extract structured knowledge graphs using Ollama (7B-8B model) running on gpu-machine, storing in Neo4j for hybrid retrieval that combines vector search (Qdrant), keyword search (BM25), and graph traversal.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    INDEXING PIPELINE                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Firecrawl Scrape → Webhook Receive → Text Processing           │
│                                                                  │
│         ┌─────────────────┬──────────────────┬────────────┐    │
│         │                 │                  │            │    │
│         v                 v                  v            v    │
│    ┌─────────┐      ┌──────────┐      ┌──────────┐  ┌──────┐ │
│    │ Chunker │      │   TEI    │      │  Ollama  │  │ BM25 │ │
│    │         │──────│Embedding │      │Extraction│  │Engine│ │
│    └─────────┘      └──────────┘      └──────────┘  └──────┘ │
│         │                 │                  │            │    │
│         v                 v                  v            v    │
│    ┌─────────────────────────────────────────────────────┐    │
│    │           TRIPLE STORAGE LAYER                      │    │
│    ├──────────────┬──────────────┬──────────────────────┤    │
│    │   Qdrant     │    Neo4j     │       BM25           │    │
│    │   (Vector)   │   (Graph)    │    (Keyword)         │    │
│    └──────────────┴──────────────┴──────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    SEARCH PIPELINE                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  User Query → Embed Query → Triple Hybrid Search                │
│                                                                  │
│         ┌─────────────┬──────────────┬────────────────┐        │
│         │             │              │                │        │
│         v             v              v                v        │
│    ┌────────┐   ┌─────────┐   ┌──────────┐   ┌──────────┐    │
│    │ Vector │   │  BM25   │   │  Graph   │   │ Graph    │    │
│    │ Search │   │ Search  │   │Traversal │   │Re-ranker │    │
│    └────────┘   └─────────┘   └──────────┘   └──────────┘    │
│         │             │              │                │        │
│         └─────────────┴──────────────┴────────────────┘        │
│                         │                                       │
│                         v                                       │
│              ┌──────────────────────┐                          │
│              │ Reciprocal Rank      │                          │
│              │ Fusion (RRF)         │                          │
│              └──────────────────────┘                          │
│                         │                                       │
│                         v                                       │
│                 Final Ranked Results                            │
└─────────────────────────────────────────────────────────────────┘
```

---

## Model Selection: Qwen2.5:7B-Instruct

### Why Qwen2.5:7B?

**Performance on RTX 4070 (12GB VRAM):**
- Model size: ~7.6B parameters
- Quantization: Q8_0 (8-bit) or FP16
- VRAM usage: ~8-9GB (leaves 3-4GB for TEI embeddings)
- Speed: 40-50 tokens/sec on RTX 4070
- Context: 128K tokens (huge for document-level extraction)

**Strengths:**
- Excellent structured output support (native JSON mode)
- Strong multilingual capabilities (80+ languages)
- Better instruction following than Llama 3.1:8B
- Designed for extraction tasks (Qwen family specializes in this)
- Already using Qwen3-Embedding-0.6B (ecosystem consistency)

**Alternatives:**
- Llama 3.1:8B (good general purpose, 40-45 tok/s)
- Mistral:7B-Instruct (faster but less structured output reliability)
- Gemma 2:9B (good but larger VRAM footprint)

---

## Knowledge Graph Schema

### Node Types (Entities)

```python
from pydantic import BaseModel, Field
from enum import Enum

class EntityType(str, Enum):
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
    """Base entity extracted from text."""
    id: str = Field(description="Unique identifier (generated)")
    name: str = Field(description="Entity name/label")
    type: EntityType = Field(description="Entity type")
    description: str | None = Field(default=None, description="Brief description")
    aliases: list[str] = Field(default_factory=list, description="Alternative names")
    confidence: float = Field(ge=0.0, le=1.0, description="Extraction confidence")
    source_chunk_ids: list[str] = Field(default_factory=list, description="Source chunks")
```

### Relationship Types (Edges)

```python
class RelationType(str, Enum):
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
    properties: dict[str, Any] = Field(default_factory=dict, description="Additional metadata")
    confidence: float = Field(ge=0.0, le=1.0, description="Extraction confidence")
    source_chunk_id: str | None = Field(default=None, description="Source chunk")
```

### Document/Chunk Nodes

```python
class DocumentNode(BaseModel):
    """Document-level node in knowledge graph."""
    url: str
    canonical_url: str | None
    title: str
    description: str | None
    domain: str
    language: str
    country: str | None
    is_mobile: bool
    scraped_at: datetime
    indexed_at: datetime
    embedding: list[float] | None = None  # Optional: for hybrid vector-graph search

class ChunkNode(BaseModel):
    """Chunk-level node in knowledge graph."""
    chunk_id: str
    document_url: str
    text: str
    chunk_index: int
    token_count: int
    embedding: list[float] | None = None  # Optional: for hybrid search
```

---

## Extraction Pipeline

### Multi-Stage Extraction Strategy

We'll use a **3-stage pipeline** to maximize richness while handling errors:

#### Stage 1: Entity Extraction (Chunk-Level)

**Prompt Template:**
```python
ENTITY_EXTRACTION_PROMPT = """You are an expert entity extractor. Extract ALL entities from the following text.

Text:
{chunk_text}

Extract entities of these types:
- Person: People, authors, historical figures
- Organization: Companies, institutions, groups
- Location: Cities, countries, regions, addresses
- Technology: Software, frameworks, programming languages, tools
- Product: Software products, services, physical products
- Concept: Abstract ideas, methodologies, theories
- Event: Conferences, releases, incidents, milestones
- Date: Specific dates or time references
- Metric: Numbers with units (performance metrics, statistics)
- Topic: Main subjects or themes discussed

For EACH entity provide:
- name: The entity name as it appears
- type: One of the types above
- description: Brief context (1-2 sentences)
- confidence: Your confidence (0.0-1.0)

Be comprehensive. Extract even minor entities. Err on the side of over-extraction.

Output valid JSON matching this schema:
{json_schema}
"""

class EntityExtractionResult(BaseModel):
    """Result from entity extraction."""
    entities: list[Entity]
    chunk_id: str
    processing_time_ms: float
```

#### Stage 2: Relationship Extraction (Chunk-Level)

**Prompt Template:**
```python
RELATIONSHIP_EXTRACTION_PROMPT = """You are an expert relationship extractor. Given entities and text, extract ALL relationships.

Text:
{chunk_text}

Known Entities:
{entity_list}

Extract relationships between these entities. Types:
- MENTIONS, DISCUSSES, RELATED_TO (semantic)
- LINKS_TO, CITES, REFERENCES (structural)
- WORKS_FOR, LOCATED_IN, CREATED_BY, OWNS, USES, PRODUCES (specific)
- BEFORE, AFTER, DURING, HAPPENED_AT (temporal)
- SUBCATEGORY_OF, INSTANCE_OF, HAS_PROPERTY (hierarchical)
- CAUSES, CAUSED_BY, ENABLES, PREVENTS (causal)

For EACH relationship provide:
- source_entity: Entity name (must be in entity list)
- target_entity: Entity name (must be in entity list)
- relation_type: Relationship type from list above
- properties: Additional context (dict)
- confidence: Your confidence (0.0-1.0)

Be thorough. Include implicit relationships. Over-extract rather than under-extract.

Output valid JSON:
{json_schema}
"""

class RelationshipExtractionResult(BaseModel):
    """Result from relationship extraction."""
    relationships: list[Relationship]
    chunk_id: str
    processing_time_ms: float
```

#### Stage 3: Document-Level Consolidation

**Purpose:**
- Deduplicate entities across chunks (e.g., "OpenAI" mentioned 10 times → 1 entity)
- Extract document-level relationships
- Add cross-chunk relationships
- Generate document summary entity

**Prompt Template:**
```python
DOCUMENT_CONSOLIDATION_PROMPT = """You are an expert at consolidating knowledge graphs.

Document: {document_title}
URL: {document_url}

Entities extracted from chunks (may have duplicates):
{all_entities}

Tasks:
1. Merge duplicate entities (same name/type → single entity with combined descriptions)
2. Identify document-level entities not captured in chunks
3. Extract high-level document relationships (e.g., Document DISCUSSES Topic)
4. Resolve entity aliases (e.g., "GPT-4" and "GPT4" are the same)

Output consolidated entities and new relationships:
{json_schema}
"""

class DocumentConsolidationResult(BaseModel):
    """Consolidated graph for entire document."""
    consolidated_entities: list[Entity]
    document_relationships: list[Relationship]
    entity_mappings: dict[str, str]  # old_id -> new_id
    processing_time_ms: float
```

---

## Error Handling & Validation Strategy

### 1. JSON Schema Validation with Retry

```python
from pydantic import ValidationError
import ollama

async def extract_with_retry(
    prompt: str,
    schema: type[BaseModel],
    max_retries: int = 3,
    temperature: float = 0.0,
) -> BaseModel | None:
    """Extract structured data with automatic retry on validation failure."""

    for attempt in range(max_retries):
        try:
            response = await ollama.chat(
                model="qwen2.5:7b-instruct",
                messages=[{"role": "user", "content": prompt}],
                format=schema.model_json_schema(),
                options={"temperature": temperature},
            )

            # Parse and validate
            result = schema.model_validate_json(response["message"]["content"])

            logger.info(
                "Extraction successful",
                attempt=attempt + 1,
                model=schema.__name__,
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
```

### 2. Confidence Thresholding

```python
MIN_ENTITY_CONFIDENCE = 0.6
MIN_RELATIONSHIP_CONFIDENCE = 0.5

def filter_low_confidence(
    entities: list[Entity],
    relationships: list[Relationship],
) -> tuple[list[Entity], list[Relationship]]:
    """Remove low-confidence extractions."""

    filtered_entities = [
        e for e in entities
        if e.confidence >= MIN_ENTITY_CONFIDENCE
    ]

    filtered_relationships = [
        r for r in relationships
        if r.confidence >= MIN_RELATIONSHIP_CONFIDENCE
    ]

    logger.info(
        "Filtered low-confidence extractions",
        entities_removed=len(entities) - len(filtered_entities),
        relationships_removed=len(relationships) - len(filtered_relationships),
    )

    return filtered_entities, filtered_relationships
```

### 3. Hallucination Detection with Cross-Validation

```python
async def validate_extraction_with_minicheck(
    text: str,
    entities: list[Entity],
) -> list[Entity]:
    """Use bespoke-minicheck to validate entity extractions against source text."""

    validated = []

    for entity in entities:
        # Create claim: "The text mentions {entity.name} which is a {entity.type}"
        claim = f"The text mentions {entity.name} which is a {entity.type.value}"

        response = await ollama.chat(
            model="bespoke-minicheck",
            messages=[
                {
                    "role": "user",
                    "content": f"Text: {text}\n\nClaim: {claim}\n\nIs this claim supported by the text?",
                }
            ],
        )

        # Parse yes/no response
        is_valid = "yes" in response["message"]["content"].lower()

        if is_valid:
            validated.append(entity)
        else:
            logger.warning(
                "Entity failed hallucination check",
                entity=entity.name,
                type=entity.type,
            )

    return validated
```

### 4. Fuzzy Entity Deduplication

```python
from rapidfuzz import fuzz

def deduplicate_entities(entities: list[Entity], threshold: int = 85) -> list[Entity]:
    """Merge similar entities using fuzzy string matching."""

    deduplicated = []
    seen = set()

    for entity in entities:
        # Create signature: "type:name"
        sig = f"{entity.type}:{entity.name.lower()}"

        # Check for similar existing entities
        is_duplicate = False
        for existing_sig in seen:
            existing_type, existing_name = existing_sig.split(":", 1)

            if entity.type.value == existing_type:
                similarity = fuzz.ratio(entity.name.lower(), existing_name)

                if similarity >= threshold:
                    is_duplicate = True
                    logger.debug(
                        "Duplicate entity detected",
                        entity=entity.name,
                        similar_to=existing_name,
                        similarity=similarity,
                    )
                    break

        if not is_duplicate:
            deduplicated.append(entity)
            seen.add(sig)

    return deduplicated
```

---

## Neo4j Service Implementation

### Graph Store Service

```python
"""Neo4j graph store service."""

from neo4j import AsyncGraphDatabase
from neo4j.exceptions import Neo4jError

class GraphStore:
    """Neo4j graph store client."""

    def __init__(self, uri: str, username: str, password: str) -> None:
        """Initialize Neo4j connection."""
        self.driver = AsyncGraphDatabase.driver(uri, auth=(username, password))

    async def close(self) -> None:
        """Close driver."""
        await self.driver.close()

    async def create_schema(self) -> None:
        """Create indexes and constraints."""
        async with self.driver.session() as session:
            # Unique constraint on Document URL
            await session.run(
                "CREATE CONSTRAINT document_url IF NOT EXISTS "
                "FOR (d:Document) REQUIRE d.url IS UNIQUE"
            )

            # Unique constraint on Chunk ID
            await session.run(
                "CREATE CONSTRAINT chunk_id IF NOT EXISTS "
                "FOR (c:Chunk) REQUIRE c.chunk_id IS UNIQUE"
            )

            # Index on entity names for fast lookup
            await session.run(
                "CREATE INDEX entity_name IF NOT EXISTS "
                "FOR (e:Entity) ON (e.name)"
            )

            # Vector index for embedding-based search (optional)
            await session.run(
                "CREATE VECTOR INDEX document_embeddings IF NOT EXISTS "
                "FOR (d:Document) ON (d.embedding) "
                "OPTIONS {indexConfig: {`vector.dimensions`: 896, `vector.similarity_function`: 'cosine'}}"
            )

    async def index_document(
        self,
        document: DocumentNode,
        chunks: list[ChunkNode],
        entities: list[Entity],
        relationships: list[Relationship],
    ) -> None:
        """Index document with entities and relationships."""
        async with self.driver.session() as session:
            # Create document node
            await session.run(
                """
                MERGE (d:Document {url: $url})
                SET d.canonical_url = $canonical_url,
                    d.title = $title,
                    d.description = $description,
                    d.domain = $domain,
                    d.language = $language,
                    d.country = $country,
                    d.is_mobile = $is_mobile,
                    d.scraped_at = datetime($scraped_at),
                    d.indexed_at = datetime($indexed_at),
                    d.embedding = $embedding
                """,
                url=document.url,
                canonical_url=document.canonical_url,
                title=document.title,
                description=document.description,
                domain=document.domain,
                language=document.language,
                country=document.country,
                is_mobile=document.is_mobile,
                scraped_at=document.scraped_at.isoformat(),
                indexed_at=document.indexed_at.isoformat(),
                embedding=document.embedding,
            )

            # Create chunk nodes
            for chunk in chunks:
                await session.run(
                    """
                    MATCH (d:Document {url: $document_url})
                    MERGE (c:Chunk {chunk_id: $chunk_id})
                    SET c.text = $text,
                        c.chunk_index = $chunk_index,
                        c.token_count = $token_count,
                        c.embedding = $embedding
                    MERGE (d)-[:CONTAINS]->(c)
                    """,
                    document_url=chunk.document_url,
                    chunk_id=chunk.chunk_id,
                    text=chunk.text,
                    chunk_index=chunk.chunk_index,
                    token_count=chunk.token_count,
                    embedding=chunk.embedding,
                )

            # Create entity nodes
            for entity in entities:
                await session.run(
                    f"""
                    MERGE (e:Entity {{id: $id}})
                    SET e:{entity.type.value},
                        e.name = $name,
                        e.description = $description,
                        e.aliases = $aliases,
                        e.confidence = $confidence
                    """,
                    id=entity.id,
                    name=entity.name,
                    description=entity.description,
                    aliases=entity.aliases,
                    confidence=entity.confidence,
                )

                # Link entities to source chunks
                for chunk_id in entity.source_chunk_ids:
                    await session.run(
                        """
                        MATCH (e:Entity {id: $entity_id})
                        MATCH (c:Chunk {chunk_id: $chunk_id})
                        MERGE (c)-[:MENTIONS]->(e)
                        """,
                        entity_id=entity.id,
                        chunk_id=chunk_id,
                    )

            # Create relationships
            for rel in relationships:
                await session.run(
                    f"""
                    MATCH (source:Entity {{id: $source_id}})
                    MATCH (target:Entity {{id: $target_id}})
                    MERGE (source)-[r:{rel.relation_type.value}]->(target)
                    SET r.confidence = $confidence,
                        r.properties = $properties,
                        r.source_chunk_id = $source_chunk_id
                    """,
                    source_id=rel.source_entity,
                    target_id=rel.target_entity,
                    confidence=rel.confidence,
                    properties=rel.properties,
                    source_chunk_id=rel.source_chunk_id,
                )

    async def search_entities(
        self,
        entity_names: list[str],
        max_depth: int = 2,
    ) -> list[dict]:
        """Search for entities and their relationships."""
        async with self.driver.session() as session:
            result = await session.run(
                """
                MATCH (e:Entity)
                WHERE e.name IN $names
                OPTIONAL MATCH path = (e)-[*1..$max_depth]-(related:Entity)
                RETURN e, collect(distinct related) as related_entities, collect(distinct path) as paths
                """,
                names=entity_names,
                max_depth=max_depth,
            )

            records = await result.data()
            return records

    async def graph_rerank(
        self,
        search_results: list[dict],
        boost_factor: float = 1.5,
    ) -> list[dict]:
        """Re-rank search results based on graph relationships."""
        # For each result, count how many high-confidence entities it contains
        # and boost score accordingly

        reranked = []

        for result in search_results:
            url = result.get("payload", {}).get("url") or result.get("metadata", {}).get("url")

            async with self.driver.session() as session:
                entity_count = await session.run(
                    """
                    MATCH (d:Document {url: $url})-[:CONTAINS]->(c:Chunk)-[:MENTIONS]->(e:Entity)
                    WHERE e.confidence >= 0.7
                    RETURN count(distinct e) as entity_count
                    """,
                    url=url,
                )

                record = await entity_count.single()
                count = record["entity_count"] if record else 0

            # Boost score based on entity richness
            original_score = result.get("score", 0.0) or result.get("rrf_score", 0.0)
            boosted_score = original_score * (1 + (count * 0.1 * boost_factor))

            reranked_result = result.copy()
            reranked_result["graph_boosted_score"] = boosted_score
            reranked_result["entity_count"] = count
            reranked.append(reranked_result)

        # Sort by boosted score
        reranked.sort(key=lambda x: x["graph_boosted_score"], reverse=True)

        return reranked
```

---

## Integration with Existing Pipeline

### Modified Webhook Worker

```python
"""Extended worker with graph extraction."""

from workers.jobs import rescrape_changed_url
from services.graph_extraction import GraphExtractionService
from services.graph_store import GraphStore

async def index_document_with_graph(
    url: str,
    markdown: str,
    metadata: dict[str, Any],
    extract_graph: bool = True,
) -> dict[str, Any]:
    """Index document in vector/BM25 + optionally extract knowledge graph."""

    # Existing indexing (Qdrant + BM25)
    result = await _index_document_helper(url, markdown, metadata)

    if not extract_graph:
        return result

    # NEW: Graph extraction
    graph_service = GraphExtractionService(
        ollama_url=settings.ollama_url,
        model_name="qwen2.5:7b-instruct",
    )

    graph_store = GraphStore(
        uri=settings.neo4j_url,
        username=settings.neo4j_username,
        password=settings.neo4j_password,
    )

    try:
        # Extract entities and relationships
        extraction_result = await graph_service.extract_document(
            url=url,
            markdown=markdown,
            metadata=metadata,
            chunks=result["chunks"],  # Reuse existing chunks
        )

        # Index in Neo4j
        await graph_store.index_document(
            document=extraction_result.document,
            chunks=extraction_result.chunks,
            entities=extraction_result.entities,
            relationships=extraction_result.relationships,
        )

        result["graph"] = {
            "entities": len(extraction_result.entities),
            "relationships": len(extraction_result.relationships),
            "extraction_time_ms": extraction_result.total_time_ms,
        }

    finally:
        await graph_store.close()

    return result
```

### Modified Search Orchestrator

```python
"""Extended search with graph re-ranking."""

class SearchOrchestrator:
    """Orchestrates hybrid search with graph enhancement."""

    def __init__(
        self,
        embedding_service: EmbeddingService,
        vector_store: VectorStore,
        bm25_engine: BM25Engine,
        graph_store: GraphStore,  # NEW
        rrf_k: int = 60,
    ) -> None:
        self.embedding_service = embedding_service
        self.vector_store = vector_store
        self.bm25_engine = bm25_engine
        self.graph_store = graph_store
        self.rrf_k = rrf_k

    async def search(
        self,
        query: str,
        mode: SearchMode = SearchMode.HYBRID,
        use_graph_rerank: bool = True,  # NEW
        limit: int = 10,
        **filters,
    ) -> list[dict[str, Any]]:
        """Execute search with optional graph re-ranking."""

        # Existing hybrid search (Vector + BM25)
        results = await self._hybrid_search(query, limit * 2, **filters)

        # NEW: Graph-based re-ranking
        if use_graph_rerank and mode in (SearchMode.HYBRID, SearchMode.GRAPH_ENHANCED):
            results = await self.graph_store.graph_rerank(results)

        return results[:limit]
```

---

## Docker Configuration

### docker-compose.yaml (Main Stack)

```yaml
services:
  firecrawl_neo4j:
    <<: *common-service
    image: neo4j:5-community
    container_name: firecrawl_neo4j
    ports:
      - "${NEO4J_HTTP_PORT:-50210}:7474"
      - "${NEO4J_BOLT_PORT:-50211}:7687"
    volumes:
      - ${APPDATA_BASE:-/mnt/cache/appdata}/firecrawl_neo4j_data:/data
      - ${APPDATA_BASE:-/mnt/cache/appdata}/firecrawl_neo4j_logs:/logs
    healthcheck:
      test: ["CMD-SHELL", "cypher-shell -u neo4j -p $$NEO4J_PASSWORD 'RETURN 1'"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 60s

  firecrawl_webhook:
    # ... existing config ...
    depends_on:
      - firecrawl_db
      - firecrawl_cache
      - firecrawl_neo4j  # NEW dependency
    # Note: All env vars loaded via common-service anchor (env_file: .env)
```

### docker-compose.external.yaml (GPU Machine)

```yaml
services:
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

  # Existing TEI and Qdrant services...
```

---

## MCP Server Exposure

### Graph Query Tools for Claude

```typescript
// apps/mcp/tools/graph/search-entities.ts

export const searchEntitiesSchema = {
  name: "graph_search_entities",
  description: "Search knowledge graph for entities and their relationships",
  inputSchema: {
    type: "object",
    properties: {
      entity_names: {
        type: "array",
        items: { type: "string" },
        description: "Entity names to search for",
      },
      max_depth: {
        type: "number",
        description: "Maximum relationship traversal depth (default: 2)",
        default: 2,
      },
    },
    required: ["entity_names"],
  },
};

export async function searchEntities(input: {
  entity_names: string[];
  max_depth?: number;
}) {
  const response = await fetch(`${WEBHOOK_URL}/api/graph/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      entity_names: input.entity_names,
      max_depth: input.max_depth || 2,
    }),
  });

  return await response.json();
}
```

```typescript
// apps/mcp/tools/graph/query-cypher.ts

export const queryCypherSchema = {
  name: "graph_query_cypher",
  description: "Execute custom Cypher query on knowledge graph (advanced users)",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Cypher query to execute",
      },
      parameters: {
        type: "object",
        description: "Query parameters",
      },
    },
    required: ["query"],
  },
};

export async function queryCypher(input: {
  query: string;
  parameters?: Record<string, any>;
}) {
  const response = await fetch(`${WEBHOOK_URL}/api/graph/cypher`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: input.query,
      parameters: input.parameters || {},
    }),
  });

  return await response.json();
}
```

### Unified Search Interface

```typescript
// apps/mcp/tools/search/unified-search.ts

export const unifiedSearchSchema = {
  name: "unified_search",
  description: "Search across vector, keyword, and graph with intelligent fusion",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Search query",
      },
      mode: {
        type: "string",
        enum: ["hybrid", "semantic", "keyword", "graph_enhanced"],
        description: "Search mode (default: graph_enhanced)",
        default: "graph_enhanced",
      },
      limit: {
        type: "number",
        description: "Maximum results (default: 10)",
        default: 10,
      },
      use_graph_rerank: {
        type: "boolean",
        description: "Re-rank results using graph relationships (default: true)",
        default: true,
      },
    },
    required: ["query"],
  },
};
```

---

## Performance Considerations

### Extraction Speed (RTX 4070)

**Per Document (2000 tokens, 4 chunks):**
- Entity extraction: ~4 chunks × 2s = 8s
- Relationship extraction: ~4 chunks × 3s = 12s
- Consolidation: ~5s
- **Total: ~25s per document**

**Optimization Strategies:**
1. **Parallel chunk processing**: Process chunks concurrently (4 chunks → ~5s instead of 20s)
2. **Batch processing**: Queue extraction jobs, process in background
3. **Selective extraction**: Extract graphs only for important documents (ML classifier?)
4. **Incremental updates**: Re-extract only changed chunks on update

### Neo4j Memory Tuning

**Recommended for Production:**
```yaml
NEO4J_dbms_memory_heap_initial__size=1g
NEO4J_dbms_memory_heap_max__size=4g
NEO4J_dbms_memory_pagecache_size=2g
```

**For Development:**
```yaml
NEO4J_dbms_memory_heap_initial__size=512m
NEO4J_dbms_memory_heap_max__size=2g
NEO4J_dbms_memory_pagecache_size=1g
```

---

## Migration Strategy

### Phase 1: Foundation (Week 1)

**Tasks:**
1. Add Neo4j to docker-compose.yaml
2. Add Ollama to docker-compose.external.yaml
3. Pull qwen2.5:7b-instruct and bespoke-minicheck models
4. Implement GraphStore service (basic CRUD)
5. Create schema in Neo4j
6. Add environment variables to .env

**Deliverables:**
- Neo4j accessible at localhost:50210 (browser) and localhost:50211 (bolt)
- Ollama responding at gpu-machine:50203
- Basic graph schema created

### Phase 2: Extraction Pipeline (Week 2)

**Tasks:**
1. Implement GraphExtractionService
2. Add entity/relationship extraction with Pydantic schemas
3. Implement retry logic and validation
4. Add hallucination detection (bespoke-minicheck)
5. Test on sample documents

**Deliverables:**
- Working extraction pipeline (chunk-level)
- Validation and error handling
- Metrics logging

### Phase 3: Integration (Week 3)

**Tasks:**
1. Integrate extraction into webhook worker
2. Add graph indexing to existing indexing flow
3. Implement document-level consolidation
4. Add background job for batch processing
5. Create migration script for existing documents

**Deliverables:**
- New documents automatically extract graphs
- Background job for processing existing documents
- Monitoring dashboard for extraction metrics

### Phase 4: Search Enhancement (Week 4)

**Tasks:**
1. Implement graph-based re-ranking
2. Add graph traversal search mode
3. Create unified search API endpoint
4. Add MCP tools for graph queries
5. Performance tuning and optimization

**Deliverables:**
- Graph-enhanced search mode
- MCP tools for Claude
- Performance benchmarks

### Phase 5: Advanced Features (Week 5+)

**Tasks:**
1. Community detection (Leiden algorithm via Neo4j GDS)
2. Community summarization (GraphRAG pattern)
3. Entity resolution and deduplication
4. Graph visualization API
5. Advanced query patterns

**Deliverables:**
- Full GraphRAG implementation
- Rich entity exploration
- Visualization tools

---

## Environment Variables

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

# Ollama Configuration (External GPU Machine)
OLLAMA_PORT=50203
WEBHOOK_OLLAMA_URL=http://gpu-machine:50203

# Graph Extraction Settings
WEBHOOK_GRAPH_EXTRACTION_ENABLED=true
WEBHOOK_GRAPH_EXTRACTION_MODEL=qwen2.5:7b-instruct
WEBHOOK_GRAPH_HALLUCINATION_CHECK=false
WEBHOOK_GRAPH_MIN_ENTITY_CONFIDENCE=0.6
WEBHOOK_GRAPH_MIN_RELATIONSHIP_CONFIDENCE=0.5
WEBHOOK_GRAPH_BATCH_SIZE=4
WEBHOOK_GRAPH_MAX_RETRIES=3

# Search Settings
WEBHOOK_SEARCH_USE_GRAPH_RERANK=true
WEBHOOK_SEARCH_GRAPH_BOOST_FACTOR=1.5
```

---

## Success Metrics

### Extraction Quality

- **Entity precision**: >85% of extracted entities are valid
- **Entity recall**: >75% of important entities extracted
- **Relationship accuracy**: >80% of relationships are correct
- **Hallucination rate**: <5% of extractions are hallucinated

### Performance

- **Extraction speed**: <30s per document (average)
- **Search latency**: <500ms for graph-enhanced search
- **Graph query speed**: <200ms for 2-hop traversal

### Search Improvement

- **Relevance gain**: 15-25% improvement in search relevance (NDCG@10)
- **Context richness**: 3x more contextual relationships per result
- **User satisfaction**: Measured via feedback

---

## Open Questions

1. **Graph visualization**: Should we add a Neo4j Browser endpoint for exploration?
2. **Entity linking**: Link entities to external knowledge bases (Wikidata, DBpedia)?
3. **Temporal analysis**: Track entity evolution over time?
4. **Multi-document reasoning**: Cross-document entity resolution?
5. **Cost optimization**: Which documents deserve full graph extraction?

---

## Next Steps

**Awaiting your approval to proceed with:**

1. ✅ Schema design (entities, relationships)
2. ✅ Model selection (qwen2.5:7b-instruct)
3. ✅ Error handling strategy (retry, validation, hallucination detection)
4. ✅ MCP tool design (unified search + separate graph tools)

**Ready to implement:**
- Phase 1: Foundation setup
- Create implementation plan with file structure
- Write tests for extraction pipeline
- Set up monitoring and metrics

**Your feedback needed on:**
- Priority order of phases (any critical features for Phase 1?)
- Graph visualization requirements
- Any domain-specific entity types to add?
- Search relevance evaluation methodology
