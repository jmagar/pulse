"""
Configuration management using Pydantic Settings.

All configuration is loaded from environment variables with the SEARCH_BRIDGE_ prefix.
"""

import json

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_prefix="SEARCH_BRIDGE_",
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # API Server
    host: str = Field(default="0.0.0.0", description="API server host")
    port: int = Field(default=52100, description="API server port")
    api_secret: str = Field(description="API secret key for authentication")
    webhook_secret: str = Field(
        description="HMAC secret for verifying inbound webhooks",
        min_length=16,
        max_length=256,
    )

    # CORS Configuration
    # SECURITY: In production, NEVER use "*" - always specify exact origins
    # Example: ["https://app.example.com", "https://admin.example.com"]
    cors_origins: list[str] = Field(
        default=["http://localhost:3000"],
        description="Allowed CORS origins (use '*' for all, but only in development!)",
    )

    # Redis Queue
    redis_url: str = Field(default="redis://localhost:52101", description="Redis connection URL")

    # Qdrant Vector Store
    qdrant_url: str = Field(default="http://localhost:52102", description="Qdrant server URL")
    qdrant_collection: str = Field(default="firecrawl_docs", description="Qdrant collection name")
    qdrant_timeout: float = Field(default=60.0, description="Qdrant request timeout in seconds")
    vector_dim: int = Field(default=384, description="Vector dimensions")

    # HuggingFace Text Embeddings Inference
    tei_url: str = Field(default="http://localhost:52104", description="TEI server URL")
    tei_api_key: str | None = Field(default=None, description="TEI API key for authentication")
    embedding_model: str = Field(
        default="sentence-transformers/all-MiniLM-L6-v2",
        description="HuggingFace embedding model",
    )

    # Chunking Configuration (TOKEN-BASED!)
    max_chunk_tokens: int = Field(
        default=256, description="Maximum tokens per chunk (must match model limit)"
    )
    chunk_overlap_tokens: int = Field(default=50, description="Overlap between chunks in tokens")

    # Search Configuration
    hybrid_alpha: float = Field(
        default=0.5,
        ge=0.0,
        le=1.0,
        description="Alpha for hybrid search (0=BM25 only, 1=vector only)",
    )

    # Logging
    log_level: str = Field(default="INFO", description="Logging level")

    # BM25 Configuration
    bm25_k1: float = Field(default=1.5, description="BM25 k1 parameter")
    bm25_b: float = Field(default=0.75, description="BM25 b parameter")

    # RRF Configuration
    rrf_k: int = Field(default=60, description="RRF k constant (standard is 60)")

    # PostgreSQL Database (for timing metrics)
    database_url: str = Field(
        default="postgresql+asyncpg://fc_bridge:changeme@localhost:5432/fc_bridge",
        description="PostgreSQL connection URL for timing metrics (set SEARCH_BRIDGE_DATABASE_URL)"
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
