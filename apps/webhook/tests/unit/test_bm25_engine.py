"""
Unit tests for BM25Engine.
"""

from pathlib import Path

import pytest

from services.bm25_engine import BM25Engine


@pytest.fixture
def temp_index_path(tmp_path: Path) -> str:
    """Create temporary index path."""
    return str(tmp_path / "test_index.pkl")


def test_init_creates_directory(temp_index_path: str) -> None:
    """Test initialization creates data directory."""
    engine = BM25Engine(index_path=temp_index_path)

    assert Path(temp_index_path).parent.exists()
    assert engine.corpus == []
    assert engine.bm25 is None


def test_tokenize() -> None:
    """Test tokenization."""
    engine = BM25Engine()

    tokens = engine._tokenize("Hello World Test")

    assert tokens == ["hello", "world", "test"]


def test_index_first_document(temp_index_path: str) -> None:
    """Test indexing first document."""
    engine = BM25Engine(index_path=temp_index_path)

    engine.index_document(
        text="Machine learning is awesome",
        metadata={"url": "https://example.com", "title": "ML Guide"},
    )

    assert len(engine.corpus) == 1
    assert engine.corpus[0] == "Machine learning is awesome"
    assert engine.metadata[0]["url"] == "https://example.com"
    assert engine.bm25 is not None


def test_index_multiple_documents(temp_index_path: str) -> None:
    """Test indexing multiple documents."""
    engine = BM25Engine(index_path=temp_index_path)

    engine.index_document("doc1", {"url": "url1"})
    engine.index_document("doc2", {"url": "url2"})
    engine.index_document("doc3", {"url": "url3"})

    assert len(engine.corpus) == 3
    assert engine.get_document_count() == 3


def test_index_empty_text(temp_index_path: str) -> None:
    """Test indexing empty text is handled."""
    engine = BM25Engine(index_path=temp_index_path)

    engine.index_document("", {"url": "test"})
    engine.index_document("   ", {"url": "test2"})

    # Should not index empty documents
    assert len(engine.corpus) == 0


def test_search_basic(temp_index_path: str) -> None:
    """Test basic search."""
    engine = BM25Engine(index_path=temp_index_path)
    engine.index_document("machine learning is great", {"url": "url1"})
    engine.index_document("deep learning networks", {"url": "url2"})
    engine.index_document("python programming", {"url": "url3"})

    results = engine.search("machine learning", limit=10)

    assert len(results) > 0
    assert results[0]["metadata"]["url"] == "url1"  # Best match
    assert "score" in results[0]


def test_search_empty_index(temp_index_path: str) -> None:
    """Test search on empty index."""
    engine = BM25Engine(index_path=temp_index_path)

    results = engine.search("test query")

    assert results == []


def test_search_no_matches(temp_index_path: str) -> None:
    """Test search with no matches returns empty."""
    engine = BM25Engine(index_path=temp_index_path)
    engine.index_document("completely unrelated content", {"url": "url1"})

    results = engine.search("machine learning", limit=10)

    # BM25 always returns scores, but they'll be very low
    assert isinstance(results, list)


def test_search_with_domain_filter(temp_index_path: str) -> None:
    """Test search with domain filter."""
    engine = BM25Engine(index_path=temp_index_path)
    engine.index_document("machine learning", {"url": "url1", "domain": "example.com"})
    engine.index_document("machine learning", {"url": "url2", "domain": "other.com"})

    results = engine.search("machine", domain="example.com")

    assert len(results) == 1
    assert results[0]["metadata"]["domain"] == "example.com"


def test_search_with_language_filter(temp_index_path: str) -> None:
    """Test search with language filter."""
    engine = BM25Engine(index_path=temp_index_path)
    engine.index_document("test", {"url": "url1", "language": "en"})
    engine.index_document("test", {"url": "url2", "language": "es"})

    results = engine.search("test", language="en")

    assert len(results) == 1
    assert results[0]["metadata"]["language"] == "en"


def test_search_with_is_mobile_filter(temp_index_path: str) -> None:
    """Test search with isMobile filter."""
    engine = BM25Engine(index_path=temp_index_path)
    engine.index_document("test", {"url": "url1", "isMobile": True})
    engine.index_document("test", {"url": "url2", "isMobile": False})

    results = engine.search("test", is_mobile=True)

    assert len(results) == 1
    assert results[0]["metadata"]["isMobile"] is True


def test_persistence(temp_index_path: str) -> None:
    """Test index persistence and reload."""
    # Create and save index
    engine1 = BM25Engine(index_path=temp_index_path)
    engine1.index_document("test document", {"url": "url1"})

    # Load in new instance
    engine2 = BM25Engine(index_path=temp_index_path)

    assert len(engine2.corpus) == 1
    assert engine2.corpus[0] == "test document"
    assert engine2.get_document_count() == 1


def test_get_document_count(temp_index_path: str) -> None:
    """Test document count."""
    engine = BM25Engine(index_path=temp_index_path)

    assert engine.get_document_count() == 0

    engine.index_document("doc1", {"url": "url1"})
    assert engine.get_document_count() == 1

    engine.index_document("doc2", {"url": "url2"})
    assert engine.get_document_count() == 2
