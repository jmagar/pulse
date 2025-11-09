"""
Tests for search and RRF fusion.
"""




from app.services.search import reciprocal_rank_fusion


def test_rrf_basic() -> None:
    """Test basic RRF fusion."""
    # Two ranking lists
    list1 = [
        {"id": "doc1", "metadata": {"url": "url1"}},
        {"id": "doc2", "metadata": {"url": "url2"}},
        {"id": "doc3", "metadata": {"url": "url3"}},
    ]

    list2 = [
        {"id": "doc3", "metadata": {"url": "url3"}},  # doc3 appears in both
        {"id": "doc4", "metadata": {"url": "url4"}},
        {"id": "doc5", "metadata": {"url": "url5"}},
    ]

    # Fuse rankings
    result = reciprocal_rank_fusion([list1, list2], k=60)

    # doc3 should rank highest (appears in both lists)
    assert len(result) == 5
    assert result[0]["metadata"]["url"] == "url3"
    assert "rrf_score" in result[0]


def test_rrf_empty_lists() -> None:
    """Test RRF with empty input."""
    result = reciprocal_rank_fusion([[], []])
    assert result == []


def test_rrf_single_list() -> None:
    """Test RRF with single ranking list."""
    list1 = [
        {"id": "doc1", "metadata": {"url": "url1"}},
        {"id": "doc2", "metadata": {"url": "url2"}},
    ]

    result = reciprocal_rank_fusion([list1], k=60)

    assert len(result) == 2
    # First item should have higher score
    assert result[0]["rrf_score"] > result[1]["rrf_score"]


def test_rrf_k_parameter() -> None:
    """Test RRF with different k values."""
    list1 = [{"id": "doc1", "metadata": {"url": "url1"}}]

    result_k10 = reciprocal_rank_fusion([list1], k=10)
    result_k100 = reciprocal_rank_fusion([list1], k=100)

    # Different k values should produce different scores
    assert result_k10[0]["rrf_score"] != result_k100[0]["rrf_score"]
    # Lower k means higher score for same rank
    assert result_k10[0]["rrf_score"] > result_k100[0]["rrf_score"]
