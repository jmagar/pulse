"""
Tests for Pydantic models.
"""

import pytest
from pydantic import ValidationError

from app.models import (
    IndexDocumentRequest,
    SearchFilter,
    SearchMode,
    SearchRequest,
)


def test_index_document_request_valid() -> None:
    """Test valid IndexDocumentRequest."""
    doc = IndexDocumentRequest(
        url="https://example.com",
        resolvedUrl="https://example.com",
        markdown="# Hello World",
        html="<h1>Hello World</h1>",
        statusCode=200,
    )

    assert doc.url == "https://example.com"
    assert doc.resolved_url == "https://example.com"
    assert doc.markdown == "# Hello World"
    assert doc.status_code == 200
    assert doc.is_mobile is False  # Default value


def test_index_document_request_with_metadata() -> None:
    """Test IndexDocumentRequest with all metadata."""
    doc = IndexDocumentRequest(
        url="https://example.com",
        resolvedUrl="https://example.com/page",
        title="Example Page",
        description="A test page",
        markdown="Content",
        html="<html></html>",
        statusCode=200,
        language="en",
        country="US",
        isMobile=True,
    )

    assert doc.title == "Example Page"
    assert doc.language == "en"
    assert doc.country == "US"
    assert doc.is_mobile is True


def test_index_document_request_missing_required() -> None:
    """Test IndexDocumentRequest with missing required fields."""
    data: dict[str, str] = {
        "url": "https://example.com",
        # Missing: resolvedUrl, markdown, html, statusCode
    }

    with pytest.raises(ValidationError) as exc_info:
        IndexDocumentRequest(**data)  # type: ignore[arg-type]

    errors = exc_info.value.errors()
    error_fields = {err["loc"][0] for err in errors}

    assert "resolvedUrl" in error_fields or "resolved_url" in error_fields
    assert "markdown" in error_fields
    assert "html" in error_fields
    assert "statusCode" in error_fields or "status_code" in error_fields


def test_search_request_defaults() -> None:
    """Test SearchRequest with defaults."""
    request = SearchRequest(query="test")

    assert request.query == "test"
    assert request.mode == SearchMode.HYBRID
    assert request.limit == 10
    assert request.filters is None


def test_search_request_with_filters() -> None:
    """Test SearchRequest with filters."""
    request = SearchRequest(
        query="machine learning",
        mode=SearchMode.SEMANTIC,
        limit=20,
        filters=SearchFilter(
            domain="example.com",
            language="en",
            country="US",
            isMobile=False,
        ),
    )

    assert request.query == "machine learning"
    assert request.mode == SearchMode.SEMANTIC
    assert request.limit == 20
    assert request.filters is not None
    assert request.filters.domain == "example.com"
    assert request.filters is not None
    assert request.filters.language == "en"


def test_search_request_limit_validation() -> None:
    """Test SearchRequest limit validation."""
    # Valid limits
    SearchRequest(query="test", limit=1)
    SearchRequest(query="test", limit=50)
    SearchRequest(query="test", limit=100)

    # Invalid: too low
    with pytest.raises(ValidationError):
        SearchRequest(query="test", limit=0)

    # Invalid: too high
    with pytest.raises(ValidationError):
        SearchRequest(query="test", limit=101)


def test_search_mode_enum() -> None:
    """Test SearchMode enum values."""
    assert SearchMode.HYBRID.value == "hybrid"
    assert SearchMode.SEMANTIC.value == "semantic"
    assert SearchMode.KEYWORD.value == "keyword"
    assert SearchMode.BM25.value == "bm25"

    # Can create from string
    mode = SearchMode("hybrid")
    assert mode == SearchMode.HYBRID
