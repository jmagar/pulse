"""
Hybrid search orchestrator.

Combines vector similarity and BM25 keyword search using Reciprocal Rank Fusion (RRF).
"""

from typing import Any

from api.schemas.search import SearchMode
from services.bm25_engine import BM25Engine
from services.embedding import EmbeddingService
from services.vector_store import VectorStore
from utils.logging import get_logger

logger = get_logger(__name__)


def reciprocal_rank_fusion(
    ranked_lists: list[list[dict[str, Any]]],
    k: int = 60,
) -> list[dict[str, Any]]:
    """
    Combine multiple ranked result lists using Reciprocal Rank Fusion (RRF).

    Formula: score = sum(1 / (k + rank_i))
    where rank_i is the position in the i-th ranking (1-indexed)

    Deduplication uses canonical_url when available (from payload or metadata),
    falling back to url, then id. This ensures documents with different tracking
    parameters but same canonical URL are merged into a single result.

    Args:
        ranked_lists: List of ranked result lists (each with 'id' or unique identifier)
        k: Constant (60 is standard from original RRF paper by Cormack et al.)

    Returns:
        Merged and re-ranked results
    """
    scores: dict[str, float] = {}
    doc_map: dict[str, dict[str, Any]] = {}

    for ranked_list in ranked_lists:
        for rank, result in enumerate(ranked_list, start=1):
            # Extract canonical URL from vector search (payload) or BM25 (metadata)
            payload = result.get("payload", {})
            metadata = result.get("metadata", {})

            # Prefer canonical_url for deduplication, fallback to url, then id
            # Use hash-based fallback to guarantee uniqueness if ID is missing
            doc_id = (
                payload.get("canonical_url")
                or metadata.get("canonical_url")
                or payload.get("url")
                or metadata.get("url")
                or result.get("id")
                or f"__rank_{rank}_{hash(str(result))}"
            )

            # Calculate RRF score
            rrf_score = 1.0 / (k + rank)

            # Accumulate scores
            scores[doc_id] = scores.get(doc_id, 0.0) + rrf_score

            # Keep first occurrence metadata
            if doc_id not in doc_map:
                doc_map[doc_id] = result

    # Sort by RRF score (descending)
    sorted_docs = sorted(scores.items(), key=lambda x: x[1], reverse=True)

    # Build final result list
    results = []
    for doc_id, rrf_score in sorted_docs:
        result = doc_map[doc_id].copy()
        result["rrf_score"] = rrf_score
        results.append(result)

    logger.debug(
        "RRF fusion complete",
        input_lists=len(ranked_lists),
        unique_docs=len(results),
        k=k,
    )

    return results


class SearchOrchestrator:
    """Orchestrates hybrid search across vector and keyword search."""

    def __init__(
        self,
        embedding_service: EmbeddingService,
        vector_store: VectorStore,
        bm25_engine: BM25Engine,
        rrf_k: int = 60,
    ) -> None:
        """
        Initialize search orchestrator.

        Args:
            embedding_service: Embedding service instance
            vector_store: Vector store instance
            bm25_engine: BM25 engine instance
            rrf_k: RRF k constant
        """
        self.embedding_service = embedding_service
        self.vector_store = vector_store
        self.bm25_engine = bm25_engine
        self.rrf_k = rrf_k

        logger.info("Search orchestrator initialized", rrf_k=rrf_k)

    async def search(
        self,
        query: str,
        mode: SearchMode = SearchMode.HYBRID,
        limit: int = 10,
        offset: int = 0,
        domain: str | None = None,
        language: str | None = None,
        country: str | None = None,
        is_mobile: bool | None = None,
    ) -> tuple[list[dict[str, Any]], int]:
        """
        Execute search with specified mode.

        Args:
            query: Search query text
            mode: Search mode (hybrid, semantic, keyword, bm25)
            limit: Maximum results
            offset: Zero-based pagination offset
            domain: Filter by domain
            language: Filter by language
            country: Filter by country
            is_mobile: Filter by mobile flag

        Returns:
            Tuple of (results, total_count)
        """
        logger.info(
            "Executing search",
            query=query,
            mode=mode,
            limit=limit,
            offset=offset,
            filters={
                "domain": domain,
                "language": language,
                "country": country,
                "is_mobile": is_mobile,
            },
        )

        if mode == SearchMode.HYBRID:
            return await self._hybrid_search(
                query, limit, offset, domain, language, country, is_mobile
            )
        elif mode == SearchMode.SEMANTIC:
            return await self._semantic_search(
                query, limit, offset, domain, language, country, is_mobile
            )
        elif mode in (SearchMode.KEYWORD, SearchMode.BM25):
            return self._keyword_search(query, limit, offset, domain, language, country, is_mobile)
        else:
            raise ValueError(f"Unknown search mode: {mode}")

    async def _hybrid_search(
        self,
        query: str,
        limit: int,
        offset: int,
        domain: str | None,
        language: str | None,
        country: str | None,
        is_mobile: bool | None,
    ) -> tuple[list[dict[str, Any]], int]:
        """
        Hybrid search: Vector + BM25 with RRF fusion.
        """
        # Fetch enough results before fusion to maintain ranking accuracy across pages
        # We need to fetch (limit + offset) results from each search to ensure proper ranking
        # Add buffer factor to account for deduplication during RRF fusion
        dedup_buffer_factor = 1.5
        fetch_limit = int((limit + offset) * dedup_buffer_factor)

        # Run both searches with expanded limit
        vector_results, vector_total = await self._semantic_search(
            query=query,
            limit=fetch_limit,
            offset=0,  # Fetch from beginning, apply offset after fusion
            domain=domain,
            language=language,
            country=country,
            is_mobile=is_mobile,
        )
        keyword_results, keyword_total = self._keyword_search(
            query=query,
            limit=fetch_limit,
            offset=0,  # Fetch from beginning, apply offset after fusion
            domain=domain,
            language=language,
            country=country,
            is_mobile=is_mobile,
        )

        # Apply RRF fusion on full result sets
        fused_results = reciprocal_rank_fusion(
            [vector_results, keyword_results],
            k=self.rrf_k,
        )

        total = max(vector_total, keyword_total)

        # Apply pagination after fusion to maintain ranking accuracy
        return fused_results[offset : offset + limit], total

    async def _semantic_search(
        self,
        query: str,
        limit: int,
        offset: int,
        domain: str | None,
        language: str | None,
        country: str | None,
        is_mobile: bool | None,
    ) -> tuple[list[dict[str, Any]], int]:
        """
        Semantic search: Vector similarity only.
        """
        # Embed query
        query_vector = await self.embedding_service.embed_single(query)

        if not query_vector:
            logger.warning("Failed to generate query embedding")
            return [], 0

        # Search vector store
        result = await self.vector_store.search(
            query_vector=query_vector,
            limit=limit,
            offset=offset,
            domain=domain,
            language=language,
            country=country,
            is_mobile=is_mobile,
        )

        results, total = self._normalize_results(result)

        logger.info("Semantic search completed", results=len(results), total=total)
        return results, total

    def _keyword_search(
        self,
        query: str,
        limit: int,
        offset: int,
        domain: str | None,
        language: str | None,
        country: str | None,
        is_mobile: bool | None,
    ) -> tuple[list[dict[str, Any]], int]:
        """
        Keyword search: BM25 only.
        """
        result = self.bm25_engine.search(
            query=query,
            limit=limit,
            offset=offset,
            domain=domain,
            language=language,
            country=country,
            is_mobile=is_mobile,
        )

        results, total = self._normalize_results(result)

        logger.info("Keyword search completed", results=len(results), total=total)
        return results, total

    @staticmethod
    def _normalize_results(
        result: list[dict[str, Any]] | tuple[list[dict[str, Any]], int],
    ) -> tuple[list[dict[str, Any]], int]:
        """Normalize backend results to (list, total)."""
        if isinstance(result, tuple):
            results, total = result
            return results, int(total)
        return result, len(result)
