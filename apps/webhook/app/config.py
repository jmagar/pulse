"""
Configuration management using Pydantic Settings.

All configuration is loaded from environment variables with WEBHOOK_ or SEARCH_BRIDGE_ prefix.
Environment variables are checked in order:
1. WEBHOOK_* (new monorepo naming, highest priority)
2. Shared variables (DATABASE_URL, REDIS_URL) for infrastructure
3. SEARCH_BRIDGE_* (legacy naming, lowest priority)
"""

import json

from pydantic import AliasChoices, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="allow",  # Allow passing values via kwargs for testing
    )

    # API Server
    host: str = Field(
        default="0.0.0.0",
        validation_alias=AliasChoices("WEBHOOK_HOST", "SEARCH_BRIDGE_HOST"),
        description="API server host",
    )
    port: int = Field(
        default=52100,
        validation_alias=AliasChoices("WEBHOOK_PORT", "SEARCH_BRIDGE_PORT"),
        description="API server port",
    )
    api_secret: str = Field(
        validation_alias=AliasChoices("WEBHOOK_API_SECRET", "SEARCH_BRIDGE_API_SECRET"),
        description="API secret key for authentication",
    )
    webhook_secret: str = Field(
        validation_alias=AliasChoices("WEBHOOK_SECRET", "SEARCH_BRIDGE_WEBHOOK_SECRET"),
        description="HMAC secret for verifying inbound webhooks",
        min_length=16,
        max_length=256,
    )

    # CORS Configuration
    # SECURITY: In production, NEVER use "*" - always specify exact origins
    # Example: WEBHOOK_CORS_ORIGINS='["https://app.example.com", "https://admin.example.com"]'
    cors_origins: list[str] = Field(
        default=["http://localhost:3000"],
        validation_alias=AliasChoices("WEBHOOK_CORS_ORIGINS", "SEARCH_BRIDGE_CORS_ORIGINS"),
        description="Allowed CORS origins (use '*' for all, but only in development!)",
    )

    # Redis Queue (shared infrastructure with fallback)
    redis_url: str = Field(
        default="redis://localhost:52101",
        validation_alias=AliasChoices("WEBHOOK_REDIS_URL", "REDIS_URL", "SEARCH_BRIDGE_REDIS_URL"),
        description="Redis connection URL",
    )

    # Qdrant Vector Store
    qdrant_url: str = Field(
        default="http://localhost:52102",
        validation_alias=AliasChoices("WEBHOOK_QDRANT_URL", "SEARCH_BRIDGE_QDRANT_URL"),
        description="Qdrant server URL",
    )
    qdrant_collection: str = Field(
        default="firecrawl_docs",
        validation_alias=AliasChoices("WEBHOOK_QDRANT_COLLECTION", "SEARCH_BRIDGE_QDRANT_COLLECTION"),
        description="Qdrant collection name",
    )
    qdrant_timeout: float = Field(
        default=60.0,
        validation_alias=AliasChoices("WEBHOOK_QDRANT_TIMEOUT", "SEARCH_BRIDGE_QDRANT_TIMEOUT"),
        description="Qdrant request timeout in seconds",
    )
    vector_dim: int = Field(
        default=384,
        validation_alias=AliasChoices("WEBHOOK_VECTOR_DIM", "SEARCH_BRIDGE_VECTOR_DIM"),
        description="Vector dimensions",
    )

    # HuggingFace Text Embeddings Inference
    tei_url: str = Field(
        default="http://localhost:52104",
        validation_alias=AliasChoices("WEBHOOK_TEI_URL", "SEARCH_BRIDGE_TEI_URL"),
        description="TEI server URL",
    )
    tei_api_key: str | None = Field(
        default=None,
        validation_alias=AliasChoices("WEBHOOK_TEI_API_KEY", "SEARCH_BRIDGE_TEI_API_KEY"),
        description="TEI API key for authentication",
    )
    embedding_model: str = Field(
        default="sentence-transformers/all-MiniLM-L6-v2",
        validation_alias=AliasChoices("WEBHOOK_EMBEDDING_MODEL", "SEARCH_BRIDGE_EMBEDDING_MODEL"),
        description="HuggingFace embedding model",
    )

    # Chunking Configuration (TOKEN-BASED!)
    max_chunk_tokens: int = Field(
        default=256,
        validation_alias=AliasChoices("WEBHOOK_MAX_CHUNK_TOKENS", "SEARCH_BRIDGE_MAX_CHUNK_TOKENS"),
        description="Maximum tokens per chunk (must match model limit)",
    )
    chunk_overlap_tokens: int = Field(
        default=50,
        validation_alias=AliasChoices("WEBHOOK_CHUNK_OVERLAP_TOKENS", "SEARCH_BRIDGE_CHUNK_OVERLAP_TOKENS"),
        description="Overlap between chunks in tokens",
    )

    # Search Configuration
    hybrid_alpha: float = Field(
        default=0.5,
        ge=0.0,
        le=1.0,
        validation_alias=AliasChoices("WEBHOOK_HYBRID_ALPHA", "SEARCH_BRIDGE_HYBRID_ALPHA"),
        description="Alpha for hybrid search (0=BM25 only, 1=vector only)",
    )

    # Logging
    log_level: str = Field(
        default="INFO",
        validation_alias=AliasChoices("WEBHOOK_LOG_LEVEL", "SEARCH_BRIDGE_LOG_LEVEL"),
        description="Logging level",
    )

    # BM25 Configuration
    bm25_k1: float = Field(
        default=1.5,
        validation_alias=AliasChoices("WEBHOOK_BM25_K1", "SEARCH_BRIDGE_BM25_K1"),
        description="BM25 k1 parameter",
    )
    bm25_b: float = Field(
        default=0.75,
        validation_alias=AliasChoices("WEBHOOK_BM25_B", "SEARCH_BRIDGE_BM25_B"),
        description="BM25 b parameter",
    )

    # RRF Configuration
    rrf_k: int = Field(
        default=60,
        validation_alias=AliasChoices("WEBHOOK_RRF_K", "SEARCH_BRIDGE_RRF_K"),
        description="RRF k constant (standard is 60)",
    )

    # Worker Configuration
    enable_worker: bool = Field(
        default=True,
        validation_alias=AliasChoices("WEBHOOK_ENABLE_WORKER", "SEARCH_BRIDGE_ENABLE_WORKER"),
        description="Enable background worker thread for processing indexing jobs",
    )

    # PostgreSQL Database (for timing metrics)
    # Supports WEBHOOK_DATABASE_URL or falls back to DATABASE_URL (shared) or SEARCH_BRIDGE_DATABASE_URL (legacy)
    database_url: str = Field(
        default="postgresql+asyncpg://fc_bridge:changeme@localhost:5432/fc_bridge",
        validation_alias=AliasChoices("WEBHOOK_DATABASE_URL", "DATABASE_URL", "SEARCH_BRIDGE_DATABASE_URL"),
        description="PostgreSQL connection URL for timing metrics",
    )

    @field_validator("webhook_secret")
    @classmethod
    def validate_webhook_secret(cls, value: str) -> str:
        """Ensure webhook secret does not contain surrounding whitespace."""

        if value.strip() != value:
            raise ValueError("Webhook secret must not contain leading or trailing whitespace")
        return value

    @field_validator("cors_origins", mode="before")
    @classmethod
    def validate_cors_origins(cls, value: str | list[str]) -> list[str]:
        """
        Parse and validate CORS origins.

        Accepts either:
        - A JSON array string: '["https://app.example.com", "https://admin.example.com"]'
        - A comma-separated string: "https://app.example.com,https://admin.example.com"
        - A Python list: ["https://app.example.com", "https://admin.example.com"]
        - "*" to allow all origins (DEVELOPMENT ONLY - NOT SECURE FOR PRODUCTION)

        Security Note:
            Using "*" disables CORS protection and should NEVER be used in production.
            Always specify exact origins in production environments.
        """
        # Handle different input formats
        if isinstance(value, str):
            raw = value.strip()
            if not raw:
                return ["http://localhost:3000"]

            # Check if it's a JSON array
            if raw.startswith("["):
                try:
                    parsed = json.loads(raw)
                    origins = [str(origin).strip() for origin in parsed]
                except json.JSONDecodeError as exc:
                    raise ValueError(
                        "Invalid CORS origin configuration: expected JSON array or comma-separated string"
                    ) from exc
            else:
                # Comma-separated string
                origins = [origin.strip() for origin in raw.split(",")]
        else:
            # Already a list
            origins = [str(origin).strip() for origin in value]

        # Filter out empty strings
        origins = [origin for origin in origins if origin]
        if not origins:
            return ["http://localhost:3000"]

        # Validate each origin
        for origin in origins:
            if origin == "*":
                # Allow wildcard but it's a security concern
                continue

            # Basic URL validation
            if not origin.startswith(("http://", "https://")):
                raise ValueError(
                    f"Invalid CORS origin '{origin}': must start with http:// or https://, "
                    f"or use '*' for all origins (development only)"
                )

            # Check for trailing slash (should not have one)
            if origin.endswith("/"):
                raise ValueError(
                    f"Invalid CORS origin '{origin}': should not end with a trailing slash"
                )

        return origins


# Global settings instance
settings = Settings()  # type: ignore[call-arg]
