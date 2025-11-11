"""Health check and stats schemas."""

from pydantic import BaseModel, Field


class HealthStatus(BaseModel):
    """Health check status."""

    status: str = Field(description="Overall status")
    services: dict[str, str] = Field(description="Individual service statuses")
    timestamp: str = Field(description="Health check timestamp")


class IndexStats(BaseModel):
    """Index statistics."""

    total_documents: int = Field(description="Total indexed documents")
    total_chunks: int = Field(description="Total chunks")
    qdrant_points: int = Field(description="Total Qdrant points")
    bm25_documents: int = Field(description="Total BM25 documents")
    collection_name: str = Field(description="Qdrant collection name")
