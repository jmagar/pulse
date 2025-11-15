# Scrape Tool Batch Support & Commands Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow the MCP `scrape` tool to accept multiple URLs—using Firecrawl batch scrape when >1 URL—and expose command-style controls similar to the crawl tool (`scrape <url(s)>`, `scrape status <jobId>`, `scrape cancel <jobId>`, `scrape errors <jobId>`).

**Architecture:** Extend the shared `@firecrawl/client` with batch-scrape helpers (start/status/cancel/errors). Update the MCP scrape schema/pipeline/response to detect lists of URLs, dispatch batch scrapes, and format textual responses. Mirror the crawl tool’s command resolver for consistency.

**Tech Stack:** TypeScript, Vitest, MCP server, `@firecrawl/client`, pnpm.

---

### Task 1: Firecrawl client batch helpers

**Files:**
- Modify: `packages/firecrawl-client/src/types.ts`
- Modify: `packages/firecrawl-client/src/operations/scrape.ts` (or new `batch-scrape.ts`)
- Modify: `packages/firecrawl-client/src/client.ts`
- Modify: `packages/firecrawl-client/src/clients/scrape-client.ts`
- Create tests: `packages/firecrawl-client/src/operations/batch-scrape.test.ts`

**Steps:**
1. **Red:** Write Vitest cases for `startBatchScrape`, `getBatchScrapeStatus`, `cancelBatchScrape`, `getBatchScrapeErrors` that mock `fetch` and assert proper endpoints/payloads/normalization (batch endpoints documented in Firecrawl repo: `/v2/batch-scrape`, `/v2/batch-scrape/{id}`, `/v2/batch-scrape/{id}/errors`).
2. **Green:** Implement the operations + type definitions (results, errors). Wire methods through unified client and typed scrape client.
3. **Tests:** `pnpm --filter './packages/firecrawl-client' test`.

### Task 2: Scrape tool schema & command routing

**Files:**
- Modify: `apps/mcp/tools/scrape/schema.ts`
- Modify: `apps/mcp/tools/scrape/schema.test.ts`
- Modify: `apps/mcp/tools/scrape/index.ts`
- Modify/create: `apps/mcp/tools/scrape/index.test.ts`

**Steps:**
1. Add `command` enum with resolver (default `start`, plus `status`, `cancel`, `errors`).
2. Accept `url` (single) or `urls` (array) in schema; validation ensures at least one source for `start`.
3. Update tests to cover new permutations.

### Task 3: Scrape pipeline & response handling

**Files:**
- Modify: `apps/mcp/tools/scrape/pipeline.ts` (or introduce one if logic currently inline)
- Modify/create tests: `apps/mcp/tools/scrape/pipeline.test.ts`
- Modify: `apps/mcp/tools/scrape/response.ts` + `response.test.ts`

**Steps:**
1. Implement pipeline logic:
   - For `start`: if `urls.length > 1`, call batch helper; otherwise call single scrape.
   - For command mode: `status/cancel/errors` call batch helpers.
2. Format responses as text (single scrape summary or batch status). If the batch has results ready, show top few entries.
3. Tests assert behavior for single vs multi URL, success vs errors.

### Task 4: Documentation & session log

**Files:**
- Modify: `docs/mcp/SCRAPE.md`
- Update log: `.docs/tmp/crawl-tool-actions.md` (append scrape section) or new session log.

**Steps:**
1. Document multi-URL usage, command syntax, batch behaviors, pagination if applicable.

### Task 5: Verification

**Commands:**
- `pnpm --filter './packages/firecrawl-client' test && pnpm --filter './packages/firecrawl-client' build`
- `pnpm --filter './apps/mcp' test tools/scrape && pnpm --filter './apps/mcp' test`
- `pnpm --filter './apps/mcp' build`

Ensure all tests/builds pass.

---

Plan complete and saved to `docs/plans/2025-11-12-scrape-batch.md`. Two execution options: 

1. **Subagent-Driven (this session)** – fresh subagent per task, code review between tasks.
2. **Parallel Session (executing-plans)** – run plan elsewhere.

Which approach?
