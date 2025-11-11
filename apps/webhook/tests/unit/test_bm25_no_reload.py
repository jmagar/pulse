"""
Tests to verify BM25 index reload logic is removed.

Now that worker and API share the same process and BM25Engine instance,
we should NOT reload from disk on every search/count operation.
"""

import tempfile
from pathlib import Path
from unittest.mock import patch


def test_search_does_not_reload_index():
    """search() should not reload index from disk (shared in-memory)."""
    from app.services.bm25_engine import BM25Engine

    # Use isolated temp path for this test
    with tempfile.TemporaryDirectory() as tmpdir:
        index_path = str(Path(tmpdir) / "test_search.pkl")
        engine = BM25Engine(index_path=index_path)
        engine.index_document("test document", {"url": "http://example.com"})

        # Mock _load_index to ensure it's never called
        with patch.object(engine, "_load_index") as mock_load:
            results = engine.search("test", limit=5)

            # Should not reload
            mock_load.assert_not_called()

            # Should return result
            assert len(results) > 0


def test_get_document_count_does_not_reload_index():
    """get_document_count() should not reload index from disk (shared in-memory)."""
    from app.services.bm25_engine import BM25Engine

    # Use isolated temp path for this test
    with tempfile.TemporaryDirectory() as tmpdir:
        index_path = str(Path(tmpdir) / "test_count.pkl")
        engine = BM25Engine(index_path=index_path)
        engine.index_document("test document", {"url": "http://example.com"})

        # Mock _load_index to ensure it's never called
        with patch.object(engine, "_load_index") as mock_load:
            count = engine.get_document_count()

            # Should not reload
            mock_load.assert_not_called()

            # Should return count
            assert count == 1
