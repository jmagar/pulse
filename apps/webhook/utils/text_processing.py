"""
Text processing utilities including token-based chunking.

CRITICAL: We use TOKEN-based chunking, not character-based!
Embedding models have token limits, not character limits.

This implementation uses semantic-text-splitter, a high-performance Rust-based
library designed for parallel processing and high-throughput workloads.
"""

from typing import Any

from semantic_text_splitter import HuggingFaceTextSplitter

from utils.logging import get_logger

logger = get_logger(__name__)


class TextChunker:
    """
    Token-based text chunker with overlap using semantic-text-splitter.

    This high-performance implementation:
    1. Uses Rust-based semantic-text-splitter for speed
    2. Supports HuggingFace tokenizers natively
    3. Splits by token count (not characters)
    4. Adds overlap in tokens (not characters)
    5. Thread-safe by design (Rust implementation)

    Thread-safety:
    - semantic-text-splitter is thread-safe by design (Rust implementation)
    - No explicit locking needed for concurrent use
    - Safe for use in multi-threaded environments (e.g., RQ workers)
    - Optimized for parallel processing and high-throughput workloads

    Performance:
    - ~10-100x faster than pure Python implementations
    - No GIL contention (Rust native code)
    - Designed for high-throughput parallel workers
    """

    def __init__(
        self,
        model_name: str,
        max_tokens: int = 256,
        overlap_tokens: int = 50,
    ) -> None:
        """
        Initialize the text chunker.

        Args:
            model_name: HuggingFace model name (e.g., 'Qwen/Qwen3-Embedding-0.6B')
            max_tokens: Maximum tokens per chunk (must match model's max_seq_length)
            overlap_tokens: Overlap between chunks in tokens (typically 10-20% of max_tokens)
        """
        self.model_name = model_name
        self.max_tokens = max_tokens
        self.overlap_tokens = overlap_tokens

        logger.info(
            "Initializing text chunker with semantic-text-splitter",
            model=model_name,
            max_tokens=max_tokens,
            overlap_tokens=overlap_tokens,
        )

        try:
            # Initialize semantic-text-splitter with HuggingFace tokenizer
            # This is thread-safe and optimized for parallel processing
            self.splitter = HuggingFaceTextSplitter.from_pretrained(
                model_name,
                capacity=(max_tokens, max_tokens),
                overlap=overlap_tokens,
            )
            logger.info("Semantic text splitter initialized successfully", model=model_name)
        except Exception as e:
            logger.error("Failed to initialize text splitter", model=model_name, error=str(e))
            raise

    def chunk_text(self, text: str, metadata: dict[str, Any] | None = None) -> list[dict[str, Any]]:
        """
        Split text into token-based chunks with overlap.

        Thread-safe: semantic-text-splitter is thread-safe by design (no lock needed).

        Args:
            text: Text to chunk
            metadata: Optional metadata to attach to each chunk

        Returns:
            List of chunk dictionaries with 'text', 'chunk_index', and optional metadata
        """
        if not text or not text.strip():
            logger.warning("Empty text provided for chunking")
            return []

        try:
            # Use semantic-text-splitter (thread-safe, high-performance Rust implementation)
            chunk_texts = self.splitter.chunks(text)

            # Convert to list of chunks with metadata
            chunks = []
            for chunk_index, chunk_text in enumerate(chunk_texts):
                # Estimate token count (semantic-text-splitter ensures within limits)
                # This is approximate but faster than re-tokenizing
                token_count = min(self.max_tokens, len(chunk_text.split()) * 1.3)

                chunk = {
                    "text": chunk_text,
                    "chunk_index": chunk_index,
                    "token_count": int(token_count),  # Approximate
                }

                # Add metadata if provided
                if metadata:
                    chunk.update(metadata)

                chunks.append(chunk)

                logger.debug(
                    "Created chunk",
                    chunk_index=chunk_index,
                    chars=len(chunk_text),
                    approx_tokens=int(token_count),
                )

            logger.info(
                "Chunking complete",
                total_chunks=len(chunks),
                text_length=len(text),
                avg_chars_per_chunk=len(text) / len(chunks) if chunks else 0,
            )

            return chunks

        except Exception as e:
            logger.error("Failed to chunk text", error=str(e), text_length=len(text))
            raise


def clean_text(text: str) -> str:
    """
    Clean and normalize text for indexing.

    Args:
        text: Raw text

    Returns:
        Cleaned text
    """
    if not text:
        return ""

    # Remove excessive whitespace
    text = " ".join(text.split())

    # Remove control characters (but keep newlines and tabs)
    text = "".join(char for char in text if char.isprintable() or char in "\n\t")

    return text.strip()


def extract_domain(url: str) -> str:
    """
    Extract domain from URL.

    Args:
        url: Full URL

    Returns:
        Domain name
    """
    from urllib.parse import urlparse

    try:
        parsed = urlparse(url)
        return parsed.netloc or parsed.path.split("/")[0]
    except Exception as e:
        logger.warning("Failed to extract domain", url=url, error=str(e))
        return ""
