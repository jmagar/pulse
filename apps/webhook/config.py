"""
Configuration management using Pydantic Settings.

All configuration is loaded from environment variables with WEBHOOK_ or SEARCH_BRIDGE_ prefix.
Environment variables are checked in order:
1. WEBHOOK_* (new monorepo naming, highest priority)
2. Shared variables (DATABASE_URL, REDIS_URL) for infrastructure
3. SEARCH_BRIDGE_* (legacy naming, lowest priority)
"""

import json
import re
from typing import Any

from pydantic import (
    AliasChoices,
    BaseModel,
    ConfigDict,
    Field,
    ValidationInfo,
    field_validator,
    model_validator,
)
from pydantic_settings import BaseSettings, SettingsConfigDict


class ExternalServiceConfig(BaseModel):
    """Configuration for an external Docker service monitored by the webhook."""

    model_config = ConfigDict(extra="allow")

    name: str
    context: str | None = None
    port: int | None = None
    health_host: str | None = None
    health_port: int | None = None
    health_path: str | None = None
    volumes: list[str] = Field(default_factory=list)

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        """Validate service name contains only alphanumeric, underscore, and hyphen characters."""
        if not re.match(r"^[a-zA-Z0-9_-]+$", v):
            raise ValueError(f"Service name contains invalid characters: {v}")
        return v

    @field_validator("volumes")
    @classmethod
    def validate_volumes(cls, v: list[str]) -> list[str]:
        """Validate volume paths do not contain path traversal patterns and are absolute."""
        for path in v:
            if ".." in path:
                raise ValueError(f"Volume paths cannot contain '..': {path}")
            if not path.startswith("/"):
                raise ValueError(f"Volume paths must be absolute: {path}")
        return v

    @field_validator("volumes", mode="before")
    @classmethod
    def parse_volumes(cls, value: Any) -> list[str]:
        """Normalize volume paths into a list."""

        if value is None:
            return []

        if isinstance(value, str):
            return [value]

        if isinstance(value, list):
            return [str(item) for item in value]

        raise ValueError("Volumes must be a string or list of strings")


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
        default="pulse_docs",
        validation_alias=AliasChoices(
            "WEBHOOK_QDRANT_COLLECTION", "SEARCH_BRIDGE_QDRANT_COLLECTION"
        ),
        description="Qdrant collection name",
    )
    qdrant_timeout: float = Field(
        default=60.0,
        validation_alias=AliasChoices("WEBHOOK_QDRANT_TIMEOUT", "SEARCH_BRIDGE_QDRANT_TIMEOUT"),
        description="Qdrant request timeout in seconds",
    )
    vector_dim: int = Field(
        default=1024,
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
        default="Qwen/Qwen3-Embedding-0.6B",
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
        validation_alias=AliasChoices(
            "WEBHOOK_CHUNK_OVERLAP_TOKENS", "SEARCH_BRIDGE_CHUNK_OVERLAP_TOKENS"
        ),
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
    test_mode: bool = Field(
        default=False,
        validation_alias=AliasChoices("WEBHOOK_TEST_MODE", "SEARCH_BRIDGE_TEST_MODE"),
        description="Enable test mode to stub external services",
    )

    # Worker batch processing
    worker_batch_size: int = Field(
        default=4,
        validation_alias=AliasChoices("WEBHOOK_WORKER_BATCH_SIZE"),
        description="Number of documents to process concurrently per worker (1-10 recommended)",
    )

    # Job Configuration
    indexing_job_timeout: str = Field(
        default="10m",
        description="RQ job timeout for document indexing (e.g., '10m', '1h', '600')",
        validation_alias=AliasChoices(
            "WEBHOOK_INDEXING_JOB_TIMEOUT",
            "INDEXING_JOB_TIMEOUT",
        ),
    )

    # PostgreSQL Database (for timing metrics)
    # Supports WEBHOOK_DATABASE_URL or falls back to DATABASE_URL (shared) or SEARCH_BRIDGE_DATABASE_URL (legacy)
    database_url: str = Field(
        default="postgresql+asyncpg://fc_bridge:changeme@localhost:5432/fc_bridge",
        validation_alias=AliasChoices(
            "WEBHOOK_DATABASE_URL", "DATABASE_URL", "SEARCH_BRIDGE_DATABASE_URL"
        ),
        description="PostgreSQL connection URL for timing metrics",
    )

    # changedetection.io integration
    firecrawl_api_url: str = Field(
        default="http://firecrawl:3002",
        validation_alias=AliasChoices(
            "WEBHOOK_FIRECRAWL_API_URL",
            "FIRECRAWL_API_URL",
        ),
        description="Firecrawl API base URL for rescraping",
    )

    firecrawl_api_key: str = Field(
        default="self-hosted-no-auth",
        validation_alias=AliasChoices(
            "WEBHOOK_FIRECRAWL_API_KEY",
            "FIRECRAWL_API_KEY",
        ),
        description="Firecrawl API key",
    )

    # changedetection.io API configuration
    changedetection_api_url: str = Field(
        default="http://pulse_change-detection:5000",
        validation_alias=AliasChoices(
            "WEBHOOK_CHANGEDETECTION_API_URL",
            "CHANGEDETECTION_API_URL",
        ),
        description="changedetection.io API base URL",
    )

    changedetection_api_key: str | None = Field(
        default=None,
        validation_alias=AliasChoices(
            "WEBHOOK_CHANGEDETECTION_API_KEY",
            "CHANGEDETECTION_API_KEY",
        ),
        description="changedetection.io API key (optional for self-hosted)",
    )

    changedetection_default_check_interval: int = Field(
        default=3600,
        validation_alias=AliasChoices(
            "WEBHOOK_CHANGEDETECTION_CHECK_INTERVAL",
            "CHANGEDETECTION_CHECK_INTERVAL",
        ),
        description="Default check interval in seconds (default: 1 hour)",
    )

    changedetection_enable_auto_watch: bool = Field(
        default=True,
        validation_alias=AliasChoices(
            "WEBHOOK_CHANGEDETECTION_ENABLE_AUTO_WATCH",
            "CHANGEDETECTION_ENABLE_AUTO_WATCH",
        ),
        description="Enable automatic watch creation for scraped URLs",
    )

    docker_bin: str = Field(
        default="/usr/bin/docker",
        validation_alias=AliasChoices("WEBHOOK_DOCKER_BIN"),
        description="Path to the Docker CLI binary inside the webhook container",
    )

    external_context: str | None = Field(
        default=None,
        validation_alias=AliasChoices("WEBHOOK_EXTERNAL_CONTEXT"),
        description="Default Docker context to use for external service monitoring",
    )

    external_services: list[ExternalServiceConfig] = Field(
        default_factory=list,
        validation_alias=AliasChoices("WEBHOOK_EXTERNAL_SERVICES"),
        description="External services monitored via Docker context for stats",
    )

    @field_validator("api_secret", "webhook_secret", mode="after")
    @classmethod
    def validate_whitespace(cls, value: str, info: ValidationInfo) -> str:
        """Ensure secrets do not contain surrounding whitespace."""
        if value.strip() != value:
            raise ValueError(f"{info.field_name} must not contain leading or trailing whitespace")
        return value

    @model_validator(mode="after")
    def validate_secret_strength(self) -> "Settings":
        """
        Validate secrets are strong and not default values.

        Requirements:
        - Minimum 32 characters in production
        - Not a weak default (dev-unsafe-*, changeme, secret, etc.)

        Weak secrets are allowed in test_mode for development/testing.
        """
        # In test mode, skip validation for testing convenience
        if self.test_mode:
            return self

        # Define weak default secrets
        weak_defaults = {
            "dev-unsafe-api-secret-change-in-production",
            "dev-unsafe-hmac-secret-change-in-production",
            "your-api-key-here",
            "changeme",
            "secret",
        }

        # Validate api_secret
        if self.api_secret in weak_defaults:
            raise ValueError(
                "Weak default secret detected for api_secret. "
                "Generate a secure secret: openssl rand -hex 32"
            )

        if len(self.api_secret) < 32:
            raise ValueError(
                f"api_secret must be at least 32 characters in production. "
                f"Current length: {len(self.api_secret)}. "
                f"Generate with: openssl rand -hex 32"
            )

        # Validate webhook_secret
        if self.webhook_secret in weak_defaults:
            raise ValueError(
                "Weak default secret detected for webhook_secret. "
                "Generate a secure secret: openssl rand -hex 32"
            )

        if len(self.webhook_secret) < 32:
            raise ValueError(
                f"webhook_secret must be at least 32 characters in production. "
                f"Current length: {len(self.webhook_secret)}. "
                f"Generate with: openssl rand -hex 32"
            )

        return self

    @field_validator("external_services", mode="before")
    @classmethod
    def parse_external_services(cls, value: Any) -> list[Any]:
        """Parse external services from JSON string or list inputs."""

        if value is None:
            return []

        if isinstance(value, str):
            raw = value.strip()
            if not raw:
                return []
            try:
                parsed = json.loads(raw)
            except json.JSONDecodeError as exc:
                raise ValueError(
                    "WEBHOOK_EXTERNAL_SERVICES must be a JSON array or object"
                ) from exc
            if isinstance(parsed, list):
                return parsed
            if isinstance(parsed, dict):
                return [parsed]
            raise ValueError("WEBHOOK_EXTERNAL_SERVICES must decode to list or object")

        if isinstance(value, dict):
            return [value]

        if isinstance(value, list):
            return value

        raise ValueError("WEBHOOK_EXTERNAL_SERVICES must be a list, dict, or JSON string")

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
