"""Tests for webhook content metrics summarization."""

from collections.abc import Callable

import pytest

from utils.content_metrics import summarize_firecrawl_payload


@pytest.fixture(name="fake_token_counter")
def fixture_fake_token_counter() -> Callable[[str], int]:
    """Return a deterministic fake token counter for testing."""

    def _counter(text: str) -> int:
        # Each token is 4 characters just for testing determinism
        return len(text) // 4

    return _counter


def test_summarize_payload_counts_metrics(fake_token_counter: Callable[[str], int]) -> None:
    """Summaries include byte, word, and token counts per field."""
    payload = {
        "type": "crawl.page",
        "id": "evt_123",
        "data": [
            {
                "markdown": "Hello world from webhook",
                "html": "<p>Hello world</p>",
                "metadata": {"url": "https://example.com/page"},
            }
        ],
    }

    summary = summarize_firecrawl_payload(payload, token_counter=fake_token_counter)

    assert summary["document_count"] == 1
    document = summary["documents"][0]
    assert document["url"] == "https://example.com/page"
    assert document["markdown"]["byte_length"] == len("Hello world from webhook".encode("utf-8"))
    assert document["markdown"]["word_count"] == 4
    assert document["markdown"]["token_count"] == fake_token_counter("Hello world from webhook")
    assert document["html"]["byte_length"] == len("<p>Hello world</p>".encode("utf-8"))
    assert document["html"]["word_count"] == 2
    assert document["html"]["token_count"] == fake_token_counter("<p>Hello world</p>")

    totals = summary["totals"]
    assert totals["byte_length"] == document["markdown"]["byte_length"] + document["html"]["byte_length"]
    assert totals["word_count"] == document["markdown"]["word_count"] + document["html"]["word_count"]
    assert totals["token_count"] == document["markdown"]["token_count"] + document["html"]["token_count"]


def test_summarize_payload_handles_missing_fields(fake_token_counter: Callable[[str], int]) -> None:
    """Missing markdown/html fields should be treated as empty strings."""
    payload = {
        "type": "crawl.page",
        "id": "evt_456",
        "data": [
            {
                "metadata": {"url": "https://example.com/empty"},
            },
            {
                "markdown": "One more document",
                "metadata": {"url": "https://example.com/second"},
            },
        ],
    }

    summary = summarize_firecrawl_payload(payload, token_counter=fake_token_counter)

    assert summary["document_count"] == 2
    first_doc, second_doc = summary["documents"]
    assert first_doc["markdown"] == {"byte_length": 0, "word_count": 0, "token_count": 0}
    assert first_doc["html"] == {"byte_length": 0, "word_count": 0, "token_count": 0}
    assert second_doc["markdown"]["word_count"] == 3
    assert summary["totals"]["word_count"] == second_doc["markdown"]["word_count"]


def test_summarize_payload_excludes_raw_content(fake_token_counter: Callable[[str], int]) -> None:
    """Summary payload must not include raw document bodies."""
    sensitive_text = "Secret webhook content should not leak"
    payload = {
        "type": "crawl.page",
        "id": "evt_789",
        "data": [
            {
                "markdown": sensitive_text,
                "metadata": {"url": "https://example.com/secret"},
            }
        ],
    }

    summary = summarize_firecrawl_payload(payload, token_counter=fake_token_counter)

    # Ensure the sensitive text is not present anywhere in the summary structure
    summary_str = str(summary)
    assert sensitive_text not in summary_str
    assert summary["documents"][0]["markdown"]["byte_length"] == len(sensitive_text.encode("utf-8"))
