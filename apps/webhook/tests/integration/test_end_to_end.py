"""End-to-end flow tests exercising the in-memory service doubles."""

from collections.abc import Callable

from fastapi.testclient import TestClient

from api.deps import get_search_orchestrator
from config import settings
from main import app


def _build_search_orchestrator(
    vector_store_collections: dict[str, list[dict[str, object]]],
) -> Callable[[], object]:
    """Create a dependency override that searches the in-memory vector store."""

    class InMemorySearchOrchestrator:
        async def search(self, query: str, mode: str, limit: int, **_: object):
            """Search for chunks whose text contains the provided query string."""

            records = vector_store_collections.get(settings.qdrant_collection, [])
            lowered_query = query.lower()
            results: list[dict[str, object]] = []
            for record in records:
                chunk = record["chunk"]
                text = str(chunk["text"])
                if lowered_query not in text.lower():
                    continue

                url = str(record["document_url"])
                results.append(
                    {
                        "id": f"{url}#{chunk.get('chunk_index', 0)}",
                        "score": 1.0,
                        "payload": {
                            "url": url,
                            "title": chunk.get("title") or "Indexed Document",
                            "description": chunk.get("description"),
                            "text": text,
                        },
                    }
                )

                if len(results) >= limit:
                    break

            return results

    return lambda: InMemorySearchOrchestrator()


def test_webhook_to_search_end_to_end(
    client: TestClient,
    api_secret: str,
    in_memory_queue,
    in_memory_vector_store_cls,
) -> None:
    """Validate webhook indexing through to search using in-memory doubles."""

    document = {
        "url": "https://example.com/test",
        "resolvedUrl": "https://example.com/test",
        "markdown": "This is a test document about Python programming.",
        "html": "<p>This is a test document about Python programming.</p>",
        "title": "Test Document",
        "description": "A test document",
        "statusCode": 200,
    }

    response = client.post(
        "/api/index",
        json=document,
        headers={"Authorization": f"Bearer {api_secret}"},
    )
    assert response.status_code == 202

    assert len(in_memory_queue.jobs) == 1, f"Expected 1 job, got {len(in_memory_queue.jobs)}"
    job = in_memory_queue.jobs[0]
    job.perform()

    assert job.is_finished, job.get_status()
    result = job.result
    assert isinstance(result, dict)
    assert result["success"] is True
    assert result["chunks_indexed"] > 0

    app.dependency_overrides[get_search_orchestrator] = _build_search_orchestrator(
        in_memory_vector_store_cls.collections,
    )
    try:
        search_response = client.post(
            "/api/search",
            headers={"Authorization": f"Bearer {api_secret}"},
            json={"query": "Python programming", "mode": "hybrid", "limit": 5},
        )
    finally:
        app.dependency_overrides.pop(get_search_orchestrator, None)

    assert search_response.status_code == 200
    search_data = search_response.json()
    assert search_data["total"] > 0
    urls = [entry["url"] for entry in search_data["results"]]
    assert document["url"] in urls

    stats_response = client.get("/api/stats")
    assert stats_response.status_code == 200
    stats = stats_response.json()
    assert stats["qdrant_points"] >= 1
    assert stats["total_chunks"] >= 1
