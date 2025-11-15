# Query Tool Plain Text Output Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Return clean, formatted plain-text responses for the `query` tool (top 5 results inline, remainder paginated) instead of embedded resources.

**Architecture:** Modify the MCP `query` tool to post-process webhook hits into structured text (ranked list + pagination notice). Update schema/pipeline if necessary, rewrite response formatting, adjust tests, and document the new behavior. Webhook API remains unchanged; the transformation happens entirely inside the MCP layer.

**Tech Stack:** TypeScript, Vitest, MCP server (`apps/mcp`), pnpm.

---

### Task 1: Update query response formatting

**Files:**
- Modify: `apps/mcp/tools/query/response.ts`
- Test: `apps/mcp/tools/query/response.test.ts`

**Step 1: Write failing tests (RED)**
- Expand `response.test.ts` to assert that the tool returns a single text block listing the top 5 results with numbering, title, URL, snippet, and metadata line, plus a footer if more results remain ("5 shown of N, run again with offset…" or similar).
- Ensure tests capture no-resource behavior and pagination notice.
- Run `pnpm --filter './apps/mcp' test tools/query/response.test.ts` (expect failures).

**Step 2: Implement formatting (GREEN)**
- Replace embedded-resource logic in `response.ts` with plain text builder (ranking bullets). Keep `isError` semantics, include optional filters/res mode stub if helpful.
- Include snippet (first paragraph) truncated ~200 chars and metadata (score/domain/language when available).
- Add pagination note when `results.length > 5` or webhook indicates additional pages.

**Step 3: Re-run targeted tests**
- `pnpm --filter './apps/mcp' test tools/query/response.test.ts`

### Task 2: Support pagination controls

**Files:**
- Modify: `apps/mcp/tools/query/schema.ts`
- Modify: `apps/mcp/tools/query/pipeline.ts`
- Test: `apps/mcp/tools/query/schema.test.ts`, `apps/mcp/tools/query/pipeline.test.ts`

**Step 1: Write failing tests (RED)**
- Add schema coverage for new optional fields (`offset`, `pageSize` or `afterId`) if needed to support pagination.
- Add pipeline tests ensuring we cap results at 5 for display and surface pagination instructions referencing `limit`/`offset`.

**Step 2: Implement schema & pipeline updates (GREEN)**
- Introduce optional `offset` parameter that maps to webhook `skip` or similar (confirm actual webhook contract in `apps/webhook/api/routers/search.py`).
- Ensure pipeline clamps requested limit to >5 but response renderer only prints 5 while relaying `total` in footer.

**Step 3: Re-run targeted tests**
- `pnpm --filter './apps/mcp' test tools/query/schema.test.ts tools/query/pipeline.test.ts`

### Task 3: Update tool handler tests

**Files:**
- Modify: `apps/mcp/tools/query/index.test.ts`
- Modify: `apps/mcp/tools/query/index.ts` (if new params or description changes)

**Step 1: Write failing integration-style test**
- Ensure handler returns plain text, not resource arrays, for a mocked webhook response with >5 hits.

**Step 2: Implement adjustments**
- Update description to mention plain text output + pagination.
- Ensure handler wiring passes new pagination fields to pipeline.

**Step 3: Run tests**
- `pnpm --filter './apps/mcp' test tools/query/index.test.ts`

### Task 4: Documentation & cleanup

**Files:**
- Modify: `docs/mcp/QUERY.md`
- Modify: `.docs/tmp/crawl-tool-actions.md` (append summary) or new session log entry

**Steps:**
1. Update docs to describe plain-text response format, top-5 limit, pagination instructions.
2. Mention new pagination parameters.

### Task 5: Full verification

**Commands:**
- `pnpm --filter './apps/mcp' test`
- `pnpm --filter './apps/mcp' build`

Ensure no regressions and responses now textual.

---

Plan complete and saved to `docs/plans/2025-11-12-query-plain-text.md`. Two execution options:

1. **Subagent-Driven (this session)** – fresh subagent per task + code review checkpoints.
2. **Parallel Session with executing-plans** – run plan elsewhere.

Which approach?
