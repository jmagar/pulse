"""
Integration tests for text chunking.

These tests require downloading the actual tokenizer model.
"""


import pytest

from app.utils.text_processing import TextChunker


@pytest.fixture
def chunker() -> TextChunker:
    """Create a TextChunker instance."""
    return TextChunker(
        model_name="sentence-transformers/all-MiniLM-L6-v2",
        max_tokens=256,
        overlap_tokens=50,
    )


@pytest.fixture
def long_text() -> str:
    """Generate long text for chunking."""
    return " ".join([f"This is sentence number {i}." for i in range(200)])


def test_chunker_initialization(chunker: TextChunker) -> None:
    """Test TextChunker initializes correctly."""
    assert chunker.max_tokens == 256
    assert chunker.overlap_tokens == 50
    assert chunker.tokenizer is not None


def test_chunk_short_text(chunker: TextChunker) -> None:
    """Test chunking short text that fits in one chunk."""
    text = "This is a short text that should fit in one chunk."

    chunks = chunker.chunk_text(text)

    assert len(chunks) == 1
    assert chunks[0]["text"].lower() == text.lower()
    assert chunks[0]["chunk_index"] == 0
    assert chunks[0]["token_count"] <= 256


def test_chunk_long_text(chunker: TextChunker, long_text: str) -> None:
    """Test chunking long text into multiple chunks."""
    chunks = chunker.chunk_text(long_text)

    # Should create multiple chunks
    assert len(chunks) > 1

    # Each chunk should have required fields
    for i, chunk in enumerate(chunks):
        assert "text" in chunk
        assert "chunk_index" in chunk
        assert "token_count" in chunk
        assert chunk["chunk_index"] == i
        assert chunk["token_count"] <= 256
        assert chunk["token_count"] > 0


def test_chunk_with_metadata(chunker: TextChunker) -> None:
    """Test chunking with metadata."""
    text = "Test text with metadata."
    metadata = {
        "url": "https://example.com",
        "title": "Test Page",
        "language": "en",
    }

    chunks = chunker.chunk_text(text, metadata=metadata)

    assert len(chunks) == 1
    assert chunks[0]["url"] == "https://example.com"
    assert chunks[0]["title"] == "Test Page"
    assert chunks[0]["language"] == "en"


def test_chunk_empty_text(chunker: TextChunker) -> None:
    """Test chunking empty text."""
    chunks = chunker.chunk_text("")
    assert chunks == []

    chunks = chunker.chunk_text("   ")
    assert chunks == []


def test_chunk_token_count_accuracy(chunker: TextChunker) -> None:
    """Test that token counts are accurate."""
    text = "The quick brown fox jumps over the lazy dog."

    chunks = chunker.chunk_text(text)

    assert len(chunks) == 1

    # Verify token count by re-tokenizing
    actual_tokens = chunker.tokenizer.encode(text, add_special_tokens=False)
    assert chunks[0]["token_count"] == len(actual_tokens)


def test_chunk_overlap(chunker: TextChunker) -> None:
    """Test that overlap works correctly."""
    # Create text that will span multiple chunks
    text = " ".join([f"Word{i}" for i in range(500)])

    chunks = chunker.chunk_text(text)

    # Should have multiple chunks with overlap
    assert len(chunks) >= 2

    # Check that chunks have overlap (not foolproof, but reasonable)
    # The end of chunk N should appear near the start of chunk N+1
    for i in range(len(chunks) - 1):
        chunk1_words = chunks[i]["text"].split()[-10:]  # Last 10 words
        chunk2_words = chunks[i + 1]["text"].split()[:20]  # First 20 words

        # At least some words should overlap
        overlap = set(chunk1_words) & set(chunk2_words)
        assert len(overlap) > 0, "Chunks should have overlapping content"
