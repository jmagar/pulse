"""
Text processing utilities including token-based chunking.

CRITICAL: We use TOKEN-based chunking, not character-based!
Embedding models have token limits, not character limits.
"""

import threading
from typing import Any

from transformers import AutoTokenizer

from utils.logging import get_logger

logger = get_logger(__name__)


class TextChunker:
    """
    Token-based text chunker with overlap.

    This correctly handles the token limits of embedding models by:
    1. Tokenizing text using the model's tokenizer
    2. Splitting by token count (not characters)
    3. Adding overlap in tokens (not characters)
    4. Decoding back to text for embedding

    Thread-safety:
    - Uses a lock to protect tokenizer access for concurrent use
    - Safe for use in multi-threaded environments (e.g., RQ workers)
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
        self._lock = threading.Lock()

        logger.info(
            "Initializing text chunker",
            model=model_name,
            max_tokens=max_tokens,
            overlap_tokens=overlap_tokens,
        )

        try:
            self.tokenizer = AutoTokenizer.from_pretrained(model_name)  # type: ignore[no-untyped-call]
            logger.info("Tokenizer loaded successfully", model=model_name)
        except Exception as e:
            logger.error("Failed to load tokenizer", model=model_name, error=str(e))
            raise

    def chunk_text(self, text: str, metadata: dict[str, Any] | None = None) -> list[dict[str, Any]]:
        """
        Split text into token-based chunks with overlap.

        Thread-safe: Uses lock to protect tokenizer access.

        Args:
            text: Text to chunk
            metadata: Optional metadata to attach to each chunk

        Returns:
            List of chunk dictionaries with 'text', 'chunk_index', and optional metadata
        """
        if not text or not text.strip():
            logger.warning("Empty text provided for chunking")
            return []

        # Protect tokenizer access with lock for thread-safety
        with self._lock:
            # Tokenize entire text (without special tokens for more accurate counting)
            try:
                tokens = self.tokenizer.encode(text, add_special_tokens=False)
            except Exception as e:
                logger.error("Failed to tokenize text", error=str(e))
                raise

            total_tokens = len(tokens)
            logger.debug(
                "Tokenized text",
                total_tokens=total_tokens,
                text_length=len(text),
                tokens_per_char=total_tokens / len(text) if text else 0,
            )

            chunks = []
            start = 0
            chunk_index = 0

            while start < total_tokens:
                # Get chunk of tokens
                end = min(start + self.max_tokens, total_tokens)
                chunk_tokens = tokens[start:end]

                # Decode back to text
                try:
                    chunk_text = self.tokenizer.decode(chunk_tokens, skip_special_tokens=True)
                except Exception as e:
                    logger.error(
                        "Failed to decode chunk",
                        chunk_index=chunk_index,
                        start=start,
                        end=end,
                        error=str(e),
                    )
                    raise

                # Create chunk dictionary
                chunk = {
                    "text": chunk_text,
                    "chunk_index": chunk_index,
                    "token_count": len(chunk_tokens),
                    "start_token": start,
                    "end_token": end,
                }

                # Add metadata if provided
                if metadata:
                    chunk.update(metadata)

                chunks.append(chunk)

                logger.debug(
                    "Created chunk",
                    chunk_index=chunk_index,
                    tokens=len(chunk_tokens),
                    chars=len(chunk_text),
                )

                chunk_index += 1

                # Move forward with overlap
                # Ensure we make progress even with overlap
                step = max(1, self.max_tokens - self.overlap_tokens)
                start += step

            logger.info(
                "Chunking complete",
                total_chunks=len(chunks),
                total_tokens=total_tokens,
                avg_tokens_per_chunk=total_tokens / len(chunks) if chunks else 0,
            )

            return chunks


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
