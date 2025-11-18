# Query Tool Pagination & Filter Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix pagination and filtering for the query tool end-to-end by adding offset support, accurate totals, full filter/metadata wiring, resilient retries, and structured logging across webhook and MCP, while returning 10 results per page and surfacing result IDs for full document retrieval.

**Architecture:** Webhook search returns `(results, total, metadata)` with true pagination and filters applied in backend stores (default page size 10). Each result includes an `id` that can be used to fetch the full document later. MCP client/tool passes offset directly, renders plain-text output with metadata and IDs, shows 10 results, and retries transient failures with jitter. Tests (pytest/vitest) cover contracts. Docs updated after verification.

**Tech Stack:** FastAPI, Pydantic, SQLAlchemy, pytest; TypeScript, Zod, Vitest; MCP SDK.

---

## Task 1: Align webhook search contract to include offset and total tuple

**Files:**
- Modify: `apps/webhook/services/search.py`
- Modify: `apps/webhook/api/routers/search.py`
- Modify: `apps/webhook/api/schemas/search.py`
- Test: `apps/webhook/tests/unit/test_search_orchestrator.py`
- Test: `apps/webhook/tests/unit/test_api_routes.py`

**Step 1: Write failing orchestrator test for offset and tuple return**

Add to `apps/webhook/tests/unit/test_search_orchestrator.py`:

```python
@pytest.mark.asyncio
async def test_search_returns_results_and_total_with_offset(
    search_orchestrator: SearchOrchestrator,
    mock_embedding_service: EmbeddingService,
    mock_vector_store: VectorStore,
    mock_bm25_engine: BM25Engine,
) -> None:
    """Offset is forwarded and total is returned."""
    mock_embedding_service.embed_single.return_value = [0.1] * 384
    all_results = [
        {"id": f"doc{i}", "payload": {"url": f"url/{i}"}, "score": 1.0 - (i * 0.01)}
        for i in range(12)
    ]
    mock_vector_store.search.return_value = all_results[:6]

    results, total = await search_orchestrator.search(
        query="test",
        mode=SearchMode.SEMANTIC,
        limit=5,
        offset=5,
    )

    assert len(results) == 5
    assert results[0]["id"] == "doc5"
    assert total == 12
    mock_vector_store.search.assert_called_once()
    assert mock_vector_store.search.call_args.kwargs["offset"] == 5
```

**Step 2: Run test to verify it fails**

```bash
cd apps/webhook
uv run pytest tests/unit/test_search_orchestrator.py::test_search_returns_results_and_total_with_offset -v
```

Expected: FAIL (offset not accepted; tuple not returned).

**Step 3: Add offset to `SearchRequest` schema and ensure defaults**

Modify `apps/webhook/api/schemas/search.py` to include `offset: int = Field(default=0, ge=0, description="Zero-based pagination offset")`.

**Step 4: Update `SearchOrchestrator.search` signature and return type**

Return `tuple[list[dict[str, Any]], int]` and accept `offset: int = 0` (plus filters).

**Step 5: Route offset and tuple through router**

In `apps/webhook/api/routers/search.py`, call `raw_results, total_count = await orchestrator.search(...)` using `search_request.offset` and return `total=total_count`.

**Step 6: Run orchestrator and router tests**

```bash
uv run pytest tests/unit/test_search_orchestrator.py::test_search_returns_results_and_total_with_offset -v
uv run pytest tests/unit/test_api_routes.py::test_search_returns_accurate_total -v
```

Expected: PASS.

**Step 7: Commit**

```bash
git add apps/webhook/api/schemas/search.py apps/webhook/api/routers/search.py apps/webhook/services/search.py apps/webhook/tests/unit/test_search_orchestrator.py apps/webhook/tests/unit/test_api_routes.py
git commit -m "feat(webhook): add offset and total tuple to search contract"
```

---

## Task 2: Add backend offset and accurate total support

**Files:**
- Modify: `apps/webhook/services/vector_store.py`
- Modify: `apps/webhook/services/bm25_engine.py`
- Modify: `apps/webhook/services/search.py`
- Test: `apps/webhook/tests/unit/test_search_orchestrator.py`
- Test: `apps/webhook/tests/unit/test_api_routes.py`

**Step 1: Add failing tests for backend offset/total passthrough**

Extend `apps/webhook/tests/unit/test_search_orchestrator.py` with:

```python
@pytest.mark.asyncio
async def test_hybrid_search_uses_backend_totals(
    search_orchestrator: SearchOrchestrator,
    mock_vector_store: VectorStore,
    mock_bm25_engine: BM25Engine,
    mock_embedding_service: EmbeddingService,
) -> None:
    mock_embedding_service.embed_single.return_value = [0.2] * 384
    mock_vector_store.search.return_value = (
        [{"id": "v1", "score": 0.9}],
        20,
    )
    mock_bm25_engine.search.return_value = (
        [{"id": "k1", "score": 0.8}],
        30,
    )

    results, total = await search_orchestrator.search(
        query="q",
        mode=SearchMode.HYBRID,
        limit=1,
        offset=0,
    )

    assert total == 30  # MAX of backend totals after de-dupe
    assert mock_vector_store.search.call_args.kwargs["offset"] == 0
    assert mock_bm25_engine.search.call_args.kwargs["offset"] == 0
```

**Step 2: Run tests to see failure**

```bash
uv run pytest tests/unit/test_search_orchestrator.py::test_hybrid_search_uses_backend_totals -v
```

Expected: FAIL (backend not returning totals / offset).

**Step 3: Update vector and BM25 APIs**

- Ensure `search(...) -> tuple[list[dict[str, Any]], int]` and accept `offset: int`.
- Add `count()` if needed, or reuse returned totals.

**Step 4: Update orchestrator hybrid/semantic/keyword paths**

- For HYBRID, fetch using backend offsets (no manual over-fetch slicing). Fuse lists, compute total as `max(vector_total, bm25_total)` after de-duplication by `id`.
- For SEMANTIC/KEYWORD, just return backend `(results, total)`.

**Step 5: Update router response to carry backend totals**

Ensure `SearchResponse.total` uses orchestrator total (already wired in Task 1).

**Step 6: Run tests**

```bash
uv run pytest tests/unit/test_search_orchestrator.py -v
uv run pytest tests/unit/test_api_routes.py::test_search_returns_accurate_total -v
```

Expected: PASS.

**Step 7: Commit**

```bash
git add apps/webhook/services/vector_store.py apps/webhook/services/bm25_engine.py apps/webhook/services/search.py apps/webhook/tests/unit/test_search_orchestrator.py
git commit -m "feat(webhook): add backend offset and accurate total handling"
```

---

## Task 3: Wire filters and metadata end-to-end in webhook

**Files:**
- Modify: `apps/webhook/api/routers/search.py`
- Modify: `apps/webhook/api/schemas/search.py`
- Modify: `apps/webhook/services/search.py`
- Test: `apps/webhook/tests/unit/test_api_routes.py`

**Step 1: Add failing test for filters and metadata passthrough**

Add to `apps/webhook/tests/unit/test_api_routes.py`:

```python
@pytest.mark.asyncio
async def test_search_returns_metadata_and_applies_filters(
    client: AsyncClient,
    mock_search_orchestrator: SearchOrchestrator,
) -> None:
    mock_search_orchestrator.search.return_value = (
        [
            {
                "id": "doc1",
                "payload": {
                    "url": "https://example.com",
                    "title": "Title",
                    "snippet": "Snippet",
                },
                "metadata": {
                    "domain": "example.com",
                    "language": "en",
                    "country": "us",
                    "is_mobile": True,
                    "section": "API Reference",
                    "source_type": "documentation",
                },
                "score": 0.9,
            }
        ],
        1,
    )

    response = await client.post(
        "/api/search",
        json={
            "query": "q",
            "limit": 1,
            "offset": 0,
            "filters": {"domain": "example.com", "language": "en", "is_mobile": True},
        },
        headers={"Authorization": "Bearer test-secret"},
    )

    data = response.json()
    assert data["results"][0]["metadata"]["is_mobile"] is True
    assert data["results"][0]["metadata"]["domain"] == "example.com"
    assert data["total"] == 1
```

**Step 2: Run failing test**

```bash
uv run pytest tests/unit/test_api_routes.py::test_search_returns_metadata_and_applies_filters -v
```

Expected: FAIL (metadata/filters missing).

**Step 3: Ensure filters forwarded and metadata serialized**

- Router: forward `domain`, `language`, `country`, `is_mobile` to orchestrator.
- Orchestrator: pass filters to backend.
- Ensure response includes metadata fields.

**Step 4: Run tests**

```bash
uv run pytest tests/unit/test_api_routes.py::test_search_returns_metadata_and_applies_filters -v
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/webhook/api/routers/search.py apps/webhook/api/schemas/search.py apps/webhook/services/search.py apps/webhook/tests/unit/test_api_routes.py
git commit -m "feat(webhook): wire filters and metadata end-to-end"
```

---

## Task 4: Simplify MCP client pagination (remove slicing workaround)

**Files:**
- Modify: `apps/mcp/tools/query/client.ts`
- Test: `apps/mcp/tests/tools/query/client.test.ts`

**Step 1: Write failing test for offset passthrough**

Ensure `apps/mcp/tests/tools/query/client.test.ts` asserts `offset` is sent and `response.offset` echoes input.

**Step 2: Run failing test**

```bash
cd apps/mcp
pnpm test tests/tools/query/client.test.ts
```

Expected: FAIL (offset missing or limit adjusted).

**Step 3: Update client**

- Send `{ query, mode, limit, offset, filters }` directly.
- Do not adjust limit/offset locally.
- Return payload with `offset` added.

**Step 4: Run test**

```bash
pnpm test tests/tools/query/client.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/mcp/tools/query/client.ts apps/mcp/tests/tools/query/client.test.ts
git commit -m "refactor(mcp): pass offset through without client-side slicing"
```

---

## Task 5: Align MCP tool output contract with integration tests (plain text) and include IDs

**Files:**
- Modify: `apps/mcp/tools/query/index.ts`
- Modify: `apps/mcp/tools/query/response.ts`
- Test: `apps/mcp/tests/integration/query-tool.test.ts`
- Test: `apps/mcp/tests/tools/query/response.test.ts`

**Step 1: Update response formatter tests to expect metadata fields**

Adjust `apps/mcp/tests/tools/query/response.test.ts` to assert `Domain`, `Lang`, `Country`, `Mobile`, `Section`, `Type`, `Score` appear.

**Step 2: Update integration tests to match plain-text output (10 results)**

In `apps/mcp/tests/integration/query-tool.test.ts`, expect `content[0].type == "text"` and text contains query/mode/results lines showing 10 results per page.

**Step 3: Implement formatting with IDs**

In `apps/mcp/tools/query/response.ts`, render plain-text with metadata lines and include each result `id` so consumers can fetch the full document by ID.

**Step 4: Run tests**

```bash
pnpm test tests/tools/query/response.test.ts
pnpm test tests/integration/query-tool.test.ts
```

Expected: PASS (integration requires webhook running if enabled).

**Step 5: Commit**

```bash
git add apps/mcp/tools/query/index.ts apps/mcp/tools/query/response.ts apps/mcp/tests/integration/query-tool.test.ts apps/mcp/tests/tools/query/response.test.ts
git commit -m "feat(mcp): align query tool output with plain-text contract"
```

---

## Task 7: Surface metadata fields from webhook to MCP output

**Files:**
- Modify: `apps/mcp/tools/query/response.ts`
- Modify: `apps/mcp/tests/tools/query/response.test.ts`
- Ensure webhook returns metadata (Task 3)

**Step 1: Update failing test to require extra metadata**

`apps/mcp/tests/tools/query/response.test.ts` should assert presence of Domain/Lang/Country/Mobile/Section/Type.

**Step 2: Run failing test**

```bash
pnpm test tests/tools/query/response.test.ts
```

Expected: FAIL (metadata missing).

**Step 3: Format metadata**

In `formatQueryResponse`, include all metadata keys when present.

**Step 4: Run test**

```bash
pnpm test tests/tools/query/response.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/mcp/tools/query/response.ts apps/mcp/tests/tools/query/response.test.ts
git commit -m "feat(mcp): surface full metadata in query output"
```

---

## Task 8: Add retry with jitter and bounded time; fast tests

**Files:**
- Create/Modify: `apps/mcp/tools/query/retry.ts`
- Modify: `apps/mcp/tools/query/client.ts`
- Test: `apps/mcp/tests/tools/query/retry.test.ts`

**Step 1: Write failing retry test with fake timers**

Use Vitest fake timers to avoid real sleeps; expect retry on 429 and stop on 404.

**Step 2: Run failing test**

```bash
pnpm test tests/tools/query/retry.test.ts
```

Expected: FAIL (module or behavior missing).

**Step 3: Implement retry**

- Retry on 429/5xx with exponential backoff + jitter (e.g., random 0–baseDelay/2 added).
- Cap total delay (maxDelay).
- Accept abort via `AbortSignal.timeout(this.timeout)` in client.

**Step 4: Wire client to use retry**

Wrap fetch call in `retryWithBackoff`; propagate status on error for retry decisions.

**Step 5: Run tests**

```bash
pnpm test tests/tools/query/retry.test.ts
```

Expected: PASS (fast via fake timers).

**Step 6: Commit**

```bash
git add apps/mcp/tools/query/retry.ts apps/mcp/tools/query/client.ts apps/mcp/tests/tools/query/retry.test.ts
git commit -m "feat(mcp): add jittered retry with bounded backoff"
```

---

## Task 9: Add structured logging to MCP query handler

**Files:**
- Modify: `apps/mcp/tools/query/index.ts`
- Test: `apps/mcp/tests/tools/query/handler.test.ts`

**Step 1: Write failing logging test**

Use Vitest spy on `console.log`/`console.error` to assert start/complete/fail logs contain query/mode/limit/offset/duration_ms.

**Step 2: Run failing test**

```bash
pnpm test tests/tools/query/handler.test.ts
```

Expected: FAIL (logs missing).

**Step 3: Implement structured logging**

- Log start with filters and pagination.
- Log completion with results count, total, duration_ms.
- Log errors with message and duration_ms.

**Step 4: Run test**

```bash
pnpm test tests/tools/query/handler.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/mcp/tools/query/index.ts apps/mcp/tests/tools/query/handler.test.ts
git commit -m "feat(mcp): add structured logging to query handler"
```

---

## Task 10: Documentation updates

**Files:**
- Create/Update: `apps/mcp/tools/query/README.md`
- Modify: `docs/plans/2025-11-17-query-tool-pagination-fixes.md` (status section)

**Step 1: Document query tool features and usage**

Add README covering modes, filters (including `is_mobile`), pagination, metadata, retry, logging, testing commands.

**Step 2: Add status checklist AFTER implementation**

Append at end of this plan:

```markdown
## Implementation Status

- [x] Task 1: Webhook offset + total tuple
- [x] Task 2: Backend offset + totals
- [x] Task 3: Filters + metadata wiring
- [x] Task 4: MCP client pagination
- [x] Task 5: MCP output contract + IDs + 10 results
- [x] Task 7: Metadata surfacing
- [x] Task 8: Retry with jitter
- [x] Task 9: Structured logging
- [x] Task 10: Documentation

**Completed:** 2025-11-18
**Validation:** Unit tests (webhook + MCP) passing; integration tests optional/gated by env
```

**Step 3: Commit**

```bash
git add apps/mcp/tools/query/README.md docs/plans/2025-11-17-query-tool-pagination-fixes.md
git commit -m "docs: add query tool docs and plan status checklist"
```

---

## Execution Handoff

Plan saved to `docs/plans/2025-11-17-query-tool-pagination-fixes.md`.

Two execution options:

1) **Subagent-Driven (this session):** Dispatch fresh subagent per task with review between tasks.  
2) **Parallel Session (separate):** Open new session with superpowers:executing-plans and run tasks in batches with checkpoints.

Which approach? 
