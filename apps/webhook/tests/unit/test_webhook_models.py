"""Unit tests for Firecrawl webhook models."""

import pytest
from pydantic import TypeAdapter, ValidationError

from api.schemas.webhook import (
    FirecrawlDocumentPayload,
    FirecrawlLifecycleEvent,
    FirecrawlPageEvent,
    FirecrawlWebhookEvent,
)


def test_firecrawl_webhook_event_validation() -> None:
    """Base webhook event should validate required fields."""

    event = FirecrawlLifecycleEvent(
        success=True,
        type="crawl.started",
        id="job-123",
        metadata={"source": "firecrawl"},
    )

    assert event.success is True
    assert event.type == "crawl.started"
    assert event.id == "job-123"
    assert event.metadata["source"] == "firecrawl"
    assert event.data == []


def test_crawl_page_event_parsing() -> None:
    """crawl.page events should parse document payload into typed model."""

    payload = {
        "success": True,
        "type": "crawl.page",
        "id": "crawl-1",
        "data": [
            {
                "markdown": "# Title",
                "html": "<h1>Title</h1>",
                "metadata": {
                    "url": "https://example.com",
                    "title": "Example",
                    "description": "Example page",
                    "statusCode": 200,
                },
            }
        ],
    }

    event = FirecrawlPageEvent.model_validate(payload)

    assert len(event.data) == 1
    document = event.data[0]
    assert isinstance(document, FirecrawlDocumentPayload)
    assert document.metadata.url == "https://example.com"
    assert document.metadata.title == "Example"


def test_document_payload_accepts_nested_metadata() -> None:
    """Document-level metadata should be preserved when provided."""

    payload = {
        "success": True,
        "type": "crawl.page",
        "id": "crawl-1",
        "data": [
            {
                "markdown": "Content",
                "html": "<p>Content</p>",
                "metadata": {
                    "url": "https://example.com",
                    "statusCode": 200,
                    "proxyUsed": "basic",
                },
            }
        ],
    }

    adapter: TypeAdapter[FirecrawlWebhookEvent] = TypeAdapter(FirecrawlWebhookEvent)
    event = adapter.validate_python(payload)

    assert isinstance(event, FirecrawlPageEvent)
    assert event.data[0].metadata.url == "https://example.com"
    assert event.data[0].metadata.status_code == 200
    assert event.data[0].metadata.proxy_used == "basic"


def test_batch_scrape_page_event_parsing() -> None:
    """batch_scrape.page events should parse into typed document payloads."""

    payload = {
        "success": True,
        "type": "batch_scrape.page",
        "id": "batch-1",
        "data": [
            {
                "markdown": "Content A",
                "html": "<p>A</p>",
                "metadata": {"url": "https://example.com/a", "statusCode": 200},
            },
            {
                "markdown": "Content B",
                "html": "<p>B</p>",
                "metadata": {"url": "https://example.com/b", "statusCode": 200},
            },
        ],
    }

    event = FirecrawlPageEvent.model_validate(payload)

    assert len(event.data) == 2
    assert event.data[0].metadata.url == "https://example.com/a"
    assert event.data[1].markdown == "Content B"


def test_webhook_event_invalid_format() -> None:
    """Invalid event structures should raise validation errors."""

    payload = {
        "success": True,
        "type": "crawl.page",
        # Missing id and data
    }

    with pytest.raises(ValidationError):
        FirecrawlPageEvent.model_validate(payload)


def test_webhook_accepts_job_id_alias() -> None:
    """Payloads using jobId should populate the id field."""

    payload = {
        "success": True,
        "type": "crawl.started",
        "jobId": "legacy-job",
    }

    event = FirecrawlLifecycleEvent.model_validate(payload)

    assert event.id == "legacy-job"


def test_webhook_metadata_preservation() -> None:
    """Metadata and error fields should be preserved across models."""

    payload = {
        "success": False,
        "type": "crawl.failed",
        "id": "crawl-2",
        "metadata": {"retry": 1},
        "error": "Timeout",
    }

    # Validate through discriminated union alias
    adapter: TypeAdapter[FirecrawlWebhookEvent] = TypeAdapter(FirecrawlWebhookEvent)
    event = adapter.validate_python(payload)

    assert isinstance(event, FirecrawlLifecycleEvent)
    assert event.error == "Timeout"
    assert event.metadata == {"retry": 1}


def test_extract_events_parse_as_lifecycle() -> None:
    """extract.* events should parse as lifecycle events."""

    payload = {
        "success": True,
        "type": "extract.completed",
        "id": "extract-42",
        "metadata": {"pages": 3},
    }

    event = FirecrawlLifecycleEvent.model_validate(payload)

    assert event.type == "extract.completed"
    assert event.id == "extract-42"
    assert event.metadata["pages"] == 3
