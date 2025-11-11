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


def test_rrf_canonical_url_deduplication_vector_payload() -> None:
    """
    Test RRF deduplication using canonical_url from vector search payload.

    Vector search returns results with payload containing canonical_url.
    Two documents with same canonical_url should be deduplicated.
    """
    # Vector search results (payload format)
    vector_results = [
        {
            "id": "vec1",
            "score": 0.9,
            "payload": {
                "url": "https://example.com/page?utm_source=social",
                "canonical_url": "https://example.com/page",
                "text": "Vector search snippet",
                "title": "Page Title",
            },
        },
        {
            "id": "vec2",
            "score": 0.7,
            "payload": {
                "url": "https://example.com/other",
                "canonical_url": "https://example.com/other",
                "text": "Other page",
            },
        },
    ]

    # BM25 results (metadata format) - same canonical URL as first vector result
    bm25_results = [
        {
            "index": 0,
            "score": 5.2,
            "text": "Keyword search snippet with matching terms",
            "metadata": {
                "url": "https://example.com/page?utm_source=email",
                "canonical_url": "https://example.com/page",
                "title": "Page Title",
            },
        },
        {
            "index": 1,
            "score": 3.1,
            "text": "Different page",
            "metadata": {
                "url": "https://example.com/different",
                "canonical_url": "https://example.com/different",
            },
        },
    ]

    # Fuse rankings
    result = reciprocal_rank_fusion([vector_results, bm25_results], k=60)

    # Should deduplicate based on canonical_url
    # Expected: 3 unique documents (page, other, different)
    assert len(result) == 3

    # Document with canonical_url "https://example.com/page" should be merged
    # and ranked highest (appears in both lists)
    canonical_urls = [
        r.get("payload", {}).get("canonical_url") or r.get("metadata", {}).get("canonical_url")
        for r in result
    ]
    assert canonical_urls[0] == "https://example.com/page"
    assert "https://example.com/page" in canonical_urls
    assert "https://example.com/other" in canonical_urls
    assert "https://example.com/different" in canonical_urls

    # Ensure rrf_score is present
    assert all("rrf_score" in r for r in result)


def test_rrf_canonical_url_deduplication_bm25_metadata() -> None:
    """
    Test RRF deduplication using canonical_url from BM25 metadata.

    BM25 search returns results with metadata containing canonical_url.
    """
    bm25_list1 = [
        {
            "index": 0,
            "score": 5.0,
            "text": "First result",
            "metadata": {
                "url": "https://site.com/article?ref=twitter",
                "canonical_url": "https://site.com/article",
            },
        },
    ]

    bm25_list2 = [
        {
            "index": 1,
            "score": 4.5,
            "text": "Second result - same canonical",
            "metadata": {
                "url": "https://site.com/article?ref=facebook",
                "canonical_url": "https://site.com/article",
            },
        },
    ]

    result = reciprocal_rank_fusion([bm25_list1, bm25_list2], k=60)

    # Should deduplicate to 1 document
    assert len(result) == 1
    assert result[0]["metadata"]["canonical_url"] == "https://site.com/article"


def test_rrf_canonical_url_fallback_to_url() -> None:
    """
    Test RRF falls back to URL when canonical_url is missing.

    When canonical_url is not present, should use url field for deduplication.
    """
    # Mix of results with and without canonical_url
    list1 = [
        {
            "id": "has_canonical",
            "payload": {
                "url": "https://example.com/page?param=1",
                "canonical_url": "https://example.com/page",
                "text": "Has canonical",
            },
        },
        {
            "id": "no_canonical",
            "payload": {
                "url": "https://example.com/other",
                "text": "No canonical",
            },
        },
    ]

    list2 = [
        {
            "index": 0,
            "score": 3.0,
            "text": "Metadata format",
            "metadata": {
                "url": "https://example.com/other",  # Same URL, no canonical
            },
        },
    ]

    result = reciprocal_rank_fusion([list1, list2], k=60)

    # Should deduplicate: 2 unique (page and other)
    assert len(result) == 2

    # The one with canonical_url should use it
    canonical_found = False
    url_only_found = False

    for r in result:
        payload = r.get("payload") or r.get("metadata", {})
        if payload.get("canonical_url") == "https://example.com/page":
            canonical_found = True
        if payload.get("url") == "https://example.com/other" and not payload.get("canonical_url"):
            url_only_found = True

    assert canonical_found
    assert url_only_found


def test_rrf_canonical_url_fallback_to_id() -> None:
    """
    Test RRF falls back to id when both canonical_url and url are missing.

    This is an edge case for malformed data.
    """
    list1 = [
        {"id": "doc1", "score": 1.0},  # No metadata or payload at all
        {"id": "doc2", "score": 0.9, "metadata": {}},  # Empty metadata
    ]

    result = reciprocal_rank_fusion([list1], k=60)

    # Should not crash, should have 2 results
    assert len(result) == 2
    assert result[0]["rrf_score"] > result[1]["rrf_score"]


def test_rrf_mixed_sources_with_text_snippets() -> None:
    """
    Test that RRF preserves text snippets from both vector and BM25 sources.

    Vector results have text in payload, BM25 results have text as top-level field.
    The merged result should preserve the text field for response building.
    """
    # Vector results with text in payload
    vector_results = [
        {
            "id": "v1",
            "score": 0.85,
            "payload": {
                "url": "https://test.com/doc1",
                "canonical_url": "https://test.com/doc1",
                "text": "This is the semantic snippet from vector search",
                "title": "Document 1",
            },
        },
    ]

    # BM25 results with text as top-level field
    bm25_results = [
        {
            "index": 0,
            "score": 4.2,
            "text": "This is the keyword snippet from BM25 search",
            "metadata": {
                "url": "https://test.com/doc2",
                "canonical_url": "https://test.com/doc2",
                "title": "Document 2",
            },
        },
    ]

    result = reciprocal_rank_fusion([vector_results, bm25_results], k=60)

    assert len(result) == 2

    # Verify text is preserved in both results
    for r in result:
        # Text should be accessible either from payload or top-level
        has_text = ("payload" in r and "text" in r["payload"]) or ("text" in r)
        assert has_text, f"Result missing text field: {r}"


def test_rrf_duplicate_canonical_urls_accumulate_scores() -> None:
    """
    Test that duplicate canonical URLs accumulate RRF scores correctly.

    When the same canonical URL appears multiple times in rankings,
    its RRF score should be the sum of all individual rank contributions.
    """
    # Same canonical URL appears in different positions across lists
    list1 = [
        {
            "id": "v1",
            "payload": {
                "canonical_url": "https://example.com/article",
                "url": "https://example.com/article?utm_source=1",
                "text": "First occurrence",
            },
        },  # Rank 1: score = 1/(60+1)
    ]

    list2 = [
        {
            "index": 0,
            "metadata": {
                "canonical_url": "https://example.com/article",
                "url": "https://example.com/article?utm_source=2",
            },
            "text": "Second occurrence",
        },  # Rank 1: score = 1/(60+1)
    ]

    list3 = [
        {
            "id": "other",
            "payload": {
                "canonical_url": "https://example.com/other",
                "url": "https://example.com/other",
            },
        },  # Rank 1: score = 1/(60+1)
        {
            "id": "v2",
            "payload": {
                "canonical_url": "https://example.com/article",
                "url": "https://example.com/article?utm_source=3",
            },
        },  # Rank 2: score = 1/(60+2)
    ]

    result = reciprocal_rank_fusion([list1, list2, list3], k=60)

    # Article appears 3 times, other appears once
    # Article score = 1/61 + 1/61 + 1/62 ≈ 0.0492
    # Other score = 1/61 ≈ 0.0164
    # Article should rank higher

    assert len(result) == 2
    assert result[0]["payload"]["canonical_url"] == "https://example.com/article"
    assert result[1]["payload"]["canonical_url"] == "https://example.com/other"
    assert result[0]["rrf_score"] > result[1]["rrf_score"]

    # Verify specific score calculation
    expected_article_score = 1 / 61 + 1 / 61 + 1 / 62
    assert abs(result[0]["rrf_score"] - expected_article_score) < 0.0001
