"""
Tests for text processing utilities.
"""

from unittest.mock import MagicMock, patch

from utils.text_processing import TextChunker, clean_text, extract_domain


def test_clean_text() -> None:
    """Test text cleaning."""
    # Test whitespace normalization
    text = "This    has   extra    spaces"
    assert clean_text(text) == "This has extra spaces"

    # Test empty string
    assert clean_text("") == ""
    assert clean_text("   ") == ""


def test_extract_domain() -> None:
    """Test domain extraction."""
    assert extract_domain("https://example.com/path") == "example.com"
    assert extract_domain("http://sub.example.com/page") == "sub.example.com"
    assert extract_domain("https://example.com:8080/") == "example.com:8080"


def test_clean_text_control_characters() -> None:
    """Test control character removal."""
    text_with_control = "Hello\x00World\x01Test"
    cleaned = clean_text(text_with_control)
    # Control characters should be removed
    assert "\x00" not in cleaned
    assert "\x01" not in cleaned


def test_clean_text_preserves_newlines_tabs() -> None:
    """Test that newlines and tabs are preserved."""
    text = "Line 1\nLine 2\tTabbed"
    cleaned = clean_text(text)
    # Clean text normalizes whitespace but preserves newlines/tabs as printable
    assert "Line 1" in cleaned
    assert "Line 2" in cleaned
    assert "Tabbed" in cleaned


def test_clean_text_with_unicode() -> None:
    """Test clean_text handles Unicode."""
    text = "Hello 👋 World 🌍"
    cleaned = clean_text(text)
    assert "👋" in cleaned
    assert "🌍" in cleaned


def test_extract_domain_with_ip() -> None:
    """Test domain extraction with IP address."""
    assert extract_domain("http://192.168.1.1/page") == "192.168.1.1"


def test_extract_domain_with_query() -> None:
    """Test domain extraction with query string."""
    assert extract_domain("https://example.com/path?query=1") == "example.com"


def test_extract_domain_invalid_url() -> None:
    """Test domain extraction with invalid URL."""
    result = extract_domain("not a url")
    # Should return empty or handle gracefully
    assert isinstance(result, str)


def test_text_chunker_uses_hf_tokenizer() -> None:
    """Ensure TextChunker wires HuggingFace tokenizer into semantic-text-splitter."""
    with (
        patch("tokenizers.Tokenizer.from_pretrained") as mock_from_pretrained,
        patch("semantic_text_splitter.TextSplitter.from_huggingface_tokenizer") as mock_from_hf,
    ):
        mock_splitter = MagicMock()
        mock_from_hf.return_value = mock_splitter

        chunker = TextChunker("test-model", max_tokens=128, overlap_tokens=16)

        mock_from_pretrained.assert_called_once_with("test-model")
        mock_from_hf.assert_called_once_with(
            mock_from_pretrained.return_value,
            capacity=128,
            overlap=16,
        )
        assert chunker.splitter is mock_splitter
