"""Background job for rescraping changed URLs."""

from datetime import UTC, datetime
from typing import Any, cast

import httpx
from rq import get_current_job
from sqlalchemy import select, update

from app.config import settings
from infra.database import get_db_context
from api.schemas.indexing import IndexDocumentRequest
from domain.models import ChangeEvent
from services.bm25_engine import BM25Engine
from services.embedding import EmbeddingService
from services.indexing import IndexingService
from services.vector_store import VectorStore
from utils.logging import get_logger
from utils.text_processing import TextChunker

logger = get_logger(__name__)


async def _index_document_helper(
    url: str,
    text: str,
    metadata: dict[str, Any],
) -> str:
    """
    Helper function to index a document using the IndexingService.

    Args:
        url: Document URL
        text: Document markdown content
        metadata: Document metadata

    Returns:
        Document URL as identifier
    """
    # Initialize services
    text_chunker = TextChunker(
        model_name=settings.embedding_model,
        max_tokens=settings.max_chunk_tokens,
        overlap_tokens=settings.chunk_overlap_tokens,
    )

    embedding_service = EmbeddingService(
        tei_url=settings.tei_url,
        api_key=settings.tei_api_key,
    )

    vector_store = VectorStore(
        url=settings.qdrant_url,
        collection_name=settings.qdrant_collection,
        vector_dim=settings.vector_dim,
        timeout=int(settings.qdrant_timeout),
    )

    bm25_engine = BM25Engine(
        k1=settings.bm25_k1,
        b=settings.bm25_b,
    )

    indexing_service = IndexingService(
        text_chunker=text_chunker,
        embedding_service=embedding_service,
        vector_store=vector_store,
        bm25_engine=bm25_engine,
    )

    try:
        # Ensure collection exists
        await vector_store.ensure_collection()

        # Create IndexDocumentRequest
        document = IndexDocumentRequest(
            url=url,
            markdown=text,
            title=metadata.get("title", ""),
            description=metadata.get("description", ""),
            language="en",  # Default language
            country=None,
            is_mobile=False,
        )

        # Index document
        result = await indexing_service.index_document(document)

        if not result.get("success"):
            raise Exception(f"Indexing failed: {result.get('error')}")

        return url  # Return URL as document ID

    finally:
        # Cleanup resources
        await embedding_service.close()
        await vector_store.close()


async def rescrape_changed_url(change_event_id: int) -> dict[str, Any]:
    """
    Rescrape URL that was detected as changed by changedetection.io.

    Args:
        change_event_id: ID of change event in webhook.change_events table

    Returns:
        dict: Rescrape result with status and indexed document ID

    Raises:
        ValueError: If change event not found
        Exception: If Firecrawl API or indexing fails
    """
    job = get_current_job()
    job_id = job.id if job else None

    logger.info("Starting rescrape job", change_event_id=change_event_id, job_id=job_id)

    async with get_db_context() as session:
        # Fetch change event
        result = await session.execute(select(ChangeEvent).where(ChangeEvent.id == change_event_id))
        change_event = result.scalar_one_or_none()

        if not change_event:
            raise ValueError(f"Change event {change_event_id} not found")

        # Update job ID
        if job_id:
            await session.execute(
                update(ChangeEvent)
                .where(ChangeEvent.id == change_event_id)
                .values(rescrape_job_id=job_id, rescrape_status="in_progress")
            )
            await session.commit()

        try:
            # Call Firecrawl API
            logger.info(
                "Calling Firecrawl API",
                url=change_event.watch_url,
                job_id=job_id,
            )

            firecrawl_url = getattr(settings, "firecrawl_api_url", "http://firecrawl:3002")
            firecrawl_key = getattr(settings, "firecrawl_api_key", "self-hosted-no-auth")

            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(
                    f"{firecrawl_url}/v1/scrape",
                    json={
                        "url": change_event.watch_url,
                        "formats": ["markdown", "html"],
                        "onlyMainContent": True,
                    },
                    headers={"Authorization": f"Bearer {firecrawl_key}"},
                )
                response.raise_for_status()
                scrape_data = cast(dict[str, Any], response.json())

            if not scrape_data.get("success"):
                raise Exception(f"Firecrawl scrape failed: {scrape_data}")

            # Index in search (Qdrant + BM25)
            logger.info("Indexing scraped content", url=change_event.watch_url)

            data = scrape_data.get("data", {})
            doc_id = await _index_document_helper(
                url=change_event.watch_url,
                text=data.get("markdown", ""),
                metadata={
                    "change_event_id": change_event_id,
                    "watch_id": change_event.watch_id,
                    "detected_at": change_event.detected_at.isoformat(),
                    "title": data.get("metadata", {}).get("title"),
                    "description": data.get("metadata", {}).get("description"),
                },
            )

            # Update change event
            await session.execute(
                update(ChangeEvent)
                .where(ChangeEvent.id == change_event_id)
                .values(
                    rescrape_status="completed",
                    indexed_at=datetime.now(UTC),
                    extra_metadata={
                        **(change_event.extra_metadata or {}),
                        "document_id": doc_id,
                        "firecrawl_status": scrape_data.get("status"),
                    },
                )
            )
            await session.commit()

            logger.info(
                "Rescrape completed successfully",
                change_event_id=change_event_id,
                document_id=doc_id,
            )

            return {
                "status": "success",
                "change_event_id": change_event_id,
                "document_id": doc_id,
                "url": change_event.watch_url,
            }

        except Exception as e:
            # Update failure status
            logger.error(
                "Rescrape failed",
                change_event_id=change_event_id,
                error=str(e),
            )

            await session.execute(
                update(ChangeEvent)
                .where(ChangeEvent.id == change_event_id)
                .values(
                    rescrape_status=f"failed: {str(e)[:200]}",
                    extra_metadata={
                        **(change_event.extra_metadata or {}),
                        "error": str(e),
                        "failed_at": datetime.now(UTC).isoformat(),
                    },
                )
            )
            await session.commit()
            raise
