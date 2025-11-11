"""Helpers for summarizing webhook content metrics without logging raw bodies."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Protocol

from transformers import AutoTokenizer

from config import settings
from utils.logging import get_logger

logger = get_logger(__name__)


class TokenCounter(Protocol):
    """Protocol describing a callable that returns token counts."""

    def __call__(self, text: str) -> int:  # pragma: no cover - signature definition only
        """Compute the number of tokens contained in ``text``."""
        raise NotImplementedError


@dataclass(slots=True)
class TextStats:
    """Container for computed metrics on a text field."""

    byte_length: int
    word_count: int
    token_count: int

    def to_dict(self) -> dict[str, int]:
        """Return a plain dictionary representation for logging."""
        return {
            "byte_length": self.byte_length,
            "word_count": self.word_count,
            "token_count": self.token_count,
        }


def summarize_firecrawl_payload(
    payload: dict[str, Any],
    *,
    token_counter: TokenCounter | None = None,
) -> dict[str, Any]:
    """Summarize Firecrawl webhook payload content lengths for logging.

    ``payload``: Raw JSON payload parsed from Firecrawl webhook request.
    ``token_counter``: Optional callable for computing token counts; defaults to
        the project's embedding tokenizer.
    """

    documents = payload.get("data")
    if not isinstance(documents, list):
        documents = []

    counter = token_counter or _default_token_counter()

    summarized_documents: list[dict[str, Any]] = []
    total_bytes = 0
    total_words = 0
    total_tokens = 0

    for entry in documents:
        if not isinstance(entry, dict):
            continue

        markdown_stats = _compute_text_stats(entry.get("markdown"), counter)
        html_stats = _compute_text_stats(entry.get("html"), counter)

        summarized_documents.append(
            {
                "url": _extract_url(entry.get("metadata")),
                "markdown": markdown_stats.to_dict(),
                "html": html_stats.to_dict(),
            }
        )

        total_bytes += markdown_stats.byte_length + html_stats.byte_length
        total_words += markdown_stats.word_count + html_stats.word_count
        total_tokens += markdown_stats.token_count + html_stats.token_count

    return {
        "event_type": payload.get("type"),
        "event_id": payload.get("id"),
        "payload_keys": sorted(payload.keys()),
        "data_count": len(documents),
        "document_count": len(summarized_documents),
        "documents": summarized_documents,
        "totals": {
            "byte_length": total_bytes,
            "word_count": total_words,
            "token_count": total_tokens,
        },
    }


def _compute_text_stats(value: Any, counter: TokenCounter) -> TextStats:
    """Compute byte/word/token metrics for a single text field."""
    text = value if isinstance(value, str) else ""

    if not text:
        return TextStats(byte_length=0, word_count=0, token_count=0)

    byte_length = len(text.encode("utf-8"))
    word_count = len(text.split())

    try:
        token_count = counter(text)
    except Exception as error:  # pragma: no cover - defensive logging path
        logger.warning("Token counting failed", error=str(error))
        token_count = 0

    return TextStats(byte_length=byte_length, word_count=word_count, token_count=token_count)


def _extract_url(metadata: Any) -> str | None:
    """Safely extract URL from nested metadata dictionaries."""
    if isinstance(metadata, dict):
        url = metadata.get("url") or metadata.get("sourceUrl")
        if isinstance(url, str):
            return url
    return None


@lru_cache(maxsize=1)
def _default_token_counter() -> TokenCounter:
    """Return a cached tokenizer-backed token counter."""

    logger.debug("Initializing webhook token counter", model=settings.embedding_model)

    tokenizer = AutoTokenizer.from_pretrained(settings.embedding_model)  # type: ignore[no-untyped-call]

    def _counter(text: str) -> int:
        if not text:
            return 0
        tokens = tokenizer.encode(text, add_special_tokens=False)
        return len(tokens)

    return _counter
