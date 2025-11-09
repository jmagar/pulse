"""
Models package.

Exports both Pydantic models (for API validation) and SQLAlchemy models (for database).
"""

# Re-export Pydantic models from app.models.py module for backward compatibility
# This allows existing imports like: from app.models import SearchMode, IndexDocumentRequest
# to continue working after we created the app/models/ package for SQLAlchemy models

import importlib.util
import sys
from pathlib import Path

# Directly load app/models.py as a module (bypassing the package resolution)
models_py_path = Path(__file__).parent.parent / "models.py"
spec = importlib.util.spec_from_file_location("app._pydantic_models", models_py_path)
if spec and spec.loader:
    pydantic_models = importlib.util.module_from_spec(spec)
    sys.modules["app._pydantic_models"] = pydantic_models
    spec.loader.exec_module(pydantic_models)
else:
    raise ImportError("Could not load app/models.py")

# Re-export all Pydantic models
SearchMode = pydantic_models.SearchMode
IndexDocumentRequest = pydantic_models.IndexDocumentRequest
IndexDocumentResponse = pydantic_models.IndexDocumentResponse
SearchFilter = pydantic_models.SearchFilter
SearchRequest = pydantic_models.SearchRequest
SearchResult = pydantic_models.SearchResult
SearchResponse = pydantic_models.SearchResponse
HealthStatus = pydantic_models.HealthStatus
IndexStats = pydantic_models.IndexStats
FirecrawlDocumentMetadata = pydantic_models.FirecrawlDocumentMetadata
FirecrawlDocumentPayload = pydantic_models.FirecrawlDocumentPayload
FirecrawlWebhookBase = pydantic_models.FirecrawlWebhookBase
FirecrawlPageEvent = pydantic_models.FirecrawlPageEvent
FirecrawlLifecycleEvent = pydantic_models.FirecrawlLifecycleEvent
FirecrawlWebhookEvent = pydantic_models.FirecrawlWebhookEvent

__all__ = [
    # Pydantic models
    "SearchMode",
    "IndexDocumentRequest",
    "IndexDocumentResponse",
    "SearchFilter",
    "SearchRequest",
    "SearchResult",
    "SearchResponse",
    "HealthStatus",
    "IndexStats",
    "FirecrawlDocumentMetadata",
    "FirecrawlDocumentPayload",
    "FirecrawlWebhookBase",
    "FirecrawlPageEvent",
    "FirecrawlLifecycleEvent",
    "FirecrawlWebhookEvent",
]
