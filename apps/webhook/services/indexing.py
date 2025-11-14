"""
Document indexing service.

Orchestrates the complete indexing pipeline:
1. Chunk document text (token-based)
2. Generate embeddings via TEI
3. Index vectors in Qdrant
4. Index full document in BM25
"""

from typing import Any

from api.schemas.indexing import IndexDocumentRequest
from services.bm25_engine import BM25Engine
from services.embedding import EmbeddingService
from services.vector_store import VectorStore
from utils.logging import get_logger
from utils.text_processing import TextChunker, clean_text, extract_domain
from utils.timing import TimingContext
from utils.url import normalize_url

logger = get_logger(__name__)


class IndexingService:
    """Document indexing orchestrator."""

    def __init__(
        self,
        text_chunker: TextChunker,
        embedding_service: EmbeddingService,
        vector_store: VectorStore,
        bm25_engine: BM25Engine,
    ) -> None:
        """
        Initialize indexing service.

        Args:
            text_chunker: Text chunking utility
            embedding_service: Embedding service
            vector_store: Vector store
            bm25_engine: BM25 engine
        """
        self.text_chunker = text_chunker
        self.embedding_service = embedding_service
        self.vector_store = vector_store
        self.bm25_engine = bm25_engine

        logger.info("Indexing service initialized")

    async def index_document(
        self,
        document: IndexDocumentRequest,
        job_id: str | None = None,
    ) -> dict[str, Any]:
        """
        Index a document from Firecrawl.

        Args:
            document: Document to index
            job_id: Optional job ID for correlation

        Returns:
            Indexing result with statistics
        """
        logger.info(
            "Starting document indexing",
            url=document.url,
            markdown_length=len(document.markdown),
            language=document.language,
            country=document.country,
        )

        # Clean markdown text
        cleaned_markdown = clean_text(document.markdown)

        if not cleaned_markdown:
            logger.warning("Document has no content after cleaning", url=document.url)
            return {
                "success": False,
                "url": document.url,
                "chunks_indexed": 0,
                "error": "No content after cleaning",
            }

        # Extract domain and canonical URL
        domain = extract_domain(document.url)
        canonical_url = normalize_url(document.url, remove_tracking=True)

        # Prepare chunk metadata
        chunk_metadata = {
            "url": document.url,
            "canonical_url": canonical_url,
            "domain": domain,
            "title": document.title,
            "description": document.description,
            "language": document.language,
            "country": document.country,
            "isMobile": document.is_mobile,
        }

        # Step 1: Chunk text (token-based)
        try:
            async with TimingContext(
                "chunking",
                "chunk_text",
                job_id=job_id,
                document_url=document.url,
                request_id=None,  # Worker operations have no HTTP request context
            ) as ctx:
                chunks = self.text_chunker.chunk_text(cleaned_markdown, metadata=chunk_metadata)
                ctx.metadata = {
                    "chunks_created": len(chunks),
                    "text_length": len(cleaned_markdown),
                }
            logger.info("Text chunked", url=document.url, chunks=len(chunks))
        except Exception as e:
            logger.error("Failed to chunk text", url=document.url, error=str(e))
            return {
                "success": False,
                "url": document.url,
                "chunks_indexed": 0,
                "error": f"Chunking failed: {str(e)}",
            }

        if not chunks:
            logger.warning("No chunks generated", url=document.url)
            return {
                "success": False,
                "url": document.url,
                "chunks_indexed": 0,
                "error": "No chunks generated",
            }

        # Step 2: Generate embeddings (batch for efficiency)
        try:
            async with TimingContext(
                "embedding",
                "embed_batch",
                job_id=job_id,
                document_url=document.url,
                request_id=None,  # Worker operations have no HTTP request context
            ) as ctx:
                chunk_texts = [chunk["text"] for chunk in chunks]
                embeddings = await self.embedding_service.embed_batch(chunk_texts)
                ctx.metadata = {
                    "batch_size": len(chunk_texts),
                    "embedding_dim": len(embeddings[0]) if embeddings else 0,
                }
            logger.info("Embeddings generated", url=document.url, count=len(embeddings))

            # Validate embedding dimensions match expected vector dimension
            if embeddings and len(embeddings[0]) != self.vector_store.vector_dim:
                error_msg = (
                    f"Embedding dimension mismatch: got {len(embeddings[0])}, "
                    f"expected {self.vector_store.vector_dim}. "
                    f"Check SEARCH_BRIDGE_VECTOR_DIM configuration."
                )
                logger.error("Vector dimension mismatch", url=document.url, error=error_msg)
                return {
                    "success": False,
                    "url": document.url,
                    "chunks_indexed": 0,
                    "error": error_msg,
                }
        except Exception as e:
            logger.error("Failed to generate embeddings", url=document.url, error=str(e))
            return {
                "success": False,
                "url": document.url,
                "chunks_indexed": 0,
                "error": f"Embedding failed: {str(e)}",
            }

        # Step 3: Index vectors in Qdrant
        try:
            async with TimingContext(
                "qdrant",
                "index_chunks",
                job_id=job_id,
                document_url=document.url,
                request_id=None,  # Worker operations have no HTTP request context
            ) as ctx:
                indexed_count = await self.vector_store.index_chunks(
                    chunks=chunks,
                    embeddings=embeddings,
                    document_url=document.url,
                )
                ctx.metadata = {
                    "chunks_indexed": indexed_count,
                    "collection": self.vector_store.collection_name,
                }
            logger.info("Vectors indexed in Qdrant", url=document.url, count=indexed_count)
        except Exception as e:
            logger.error("Failed to index vectors", url=document.url, error=str(e))
            return {
                "success": False,
                "url": document.url,
                "chunks_indexed": 0,
                "error": f"Vector indexing failed: {str(e)}",
            }

        # Step 4: Index full document in BM25
        try:
            bm25_metadata = {
                "url": document.url,
                "canonical_url": canonical_url,
                "domain": domain,
                "title": document.title,
                "description": document.description,
                "language": document.language,
                "country": document.country,
                "isMobile": document.is_mobile,
            }

            async with TimingContext(
                "bm25",
                "index_document",
                job_id=job_id,
                document_url=document.url,
                request_id=None,  # Worker operations have no HTTP request context
            ) as ctx:
                self.bm25_engine.index_document(
                    text=cleaned_markdown,
                    metadata=bm25_metadata,
                )
                ctx.metadata = {
                    "text_length": len(cleaned_markdown),
                }
            logger.info("Document indexed in BM25", url=document.url)
        except Exception as e:
            logger.error("Failed to index in BM25", url=document.url, error=str(e))
            # Not fatal - vector search will still work
            logger.warning("Continuing despite BM25 indexing failure")

        # Success
        logger.info(
            "Document indexing complete",
            url=document.url,
            chunks=indexed_count,
        )

        return {
            "success": True,
            "url": document.url,
            "chunks_indexed": indexed_count,
            "total_tokens": sum(chunk["token_count"] for chunk in chunks),
        }
