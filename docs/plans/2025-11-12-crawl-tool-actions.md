# Crawl Tool Actions Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add full command-style crawl controls (start, status, cancel, errors, list) to the MCP crawl tool and supporting Firecrawl client so the CLI can run `crawl <url>`, `crawl status <jobId>`, `crawl cancel <jobId>`, `crawl errors <jobId>`, and `crawl list`.

**Architecture:** Extend the shared `@firecrawl/client` package with new methods for fetching crawl errors and listing active crawls, then refactor the MCP crawl tool schema/pipeline to route explicit commands to those methods while reusing existing merge helpers. Responses should be formatted per action, and documentation must reflect the new CLI syntax.

**Tech Stack:** TypeScript, Vitest, Zod, MCP tooling, pnpm.

---

### Task 1: Extend Firecrawl client for errors & active crawls

**Files:**
- Modify: `packages/firecrawl-client/src/types.ts`
- Modify: `packages/firecrawl-client/src/operations/crawl.ts`
- Modify: `packages/firecrawl-client/src/client.ts`
- Modify: `packages/firecrawl-client/src/clients/crawl-client.ts`
- Modify: `packages/firecrawl-client/src/index.ts`
- Test: `packages/firecrawl-client/src/operations/crawl.test.ts` (new)

**Step 1: Write failing tests (RED)**
- Add a new Vitest suite that stubs `global.fetch` and asserts:
  - `startCrawl` still posts to `/v2/crawl`.
  - New `getCrawlErrors` hits `/v2/crawl/<id>/errors` and normalizes `{ errors, robotsBlocked }`.
  - New `getActiveCrawls` hits `/v2/crawl/active` and returns the parsed list.
- Run `pnpm --filter './packages/firecrawl-client' test` and confirm failures (missing methods / wrong exports).

**Step 2: Implement client changes (GREEN)**
- Introduce `CrawlError`, `CrawlErrorsResult`, `ActiveCrawlJob`, and `ActiveCrawlsResult` types.
- Export utility functions from `operations/crawl.ts` for `getCrawlErrors` and `getActiveCrawls`, including error handling mirroring the Python SDK.
- Update `FirecrawlClient` + `FirecrawlCrawlClient` wrappers to expose `getCrawlErrors` and `listActiveCrawls` (naming the method to match CLI wording) while re-exporting the new types via `index.ts`.
- Ensure `startCrawl` response detection uses `success` guard before referencing `id`.

**Step 3: Re-run package tests**
- Execute `pnpm --filter './packages/firecrawl-client' test` and verify the new tests pass.

### Task 2: Refactor MCP crawl tool to support the five commands

**Files:**
- Modify: `apps/mcp/tools/crawl/schema.ts`
- Modify: `apps/mcp/tools/crawl/pipeline.ts`
- Modify: `apps/mcp/tools/crawl/pipeline.test.ts`
- Modify: `apps/mcp/tools/crawl/index.ts`
- Modify: `apps/mcp/tools/crawl/index.test.ts`
- Modify: `apps/mcp/tools/crawl/response.ts`
- Modify: `apps/mcp/tools/crawl/response.test.ts`
- Modify: `apps/mcp/tools/crawl/schema.test.ts`

**Step 1: Write failing tests (RED)**
- Update schema tests to require a `command` enum (`start`, `status`, `cancel`, `errors`, `list`) and validate necessary fields per command.
- In `pipeline.test.ts`, add cases ensuring:
  - `start` merges excludes/scrapeOptions (existing coverage) and rejects missing url.
  - `status` calls `getCrawlStatus` with jobId.
  - `cancel` calls `cancelCrawl` with jobId.
  - `errors` calls the new `getCrawlErrors` method and returns normalized shape.
  - `list` calls `listActiveCrawls` and returns data untouched.
- Expand response tests to assert formatted text for:
  - Errors payload (list of messages + robots-blocked summary).
  - Active crawl list (table/summary plus JSON block for automation).
- Ensure `index.test.ts` covers handler routing for each command and failure messaging when Firecrawl config missing.
- Run `pnpm --filter './apps/mcp' test` to capture the expected failures.

**Step 2: Implement schema + pipeline changes (GREEN)**
- Replace the XOR url/jobId schema with an explicit `{ command, target, options }` structure:
  - `command` enum described above.
  - `target` object holding `url` or `jobId` as needed.
  - Keep legacy fields but gate them per command for backwards compatibility.
- Update `crawlPipeline` to switch on `command` and invoke the appropriate Firecrawl client method (`startCrawl`, `getCrawlStatus`, `cancelCrawl`, `getCrawlErrors`, `listActiveCrawls`). Keep reuse of `mergeExcludePaths` + `mergeScrapeOptions` for the `start` case.
- Extend `formatCrawlResponse` to render human-friendly text for errors/list while still short-circuiting to `StartCrawlResult`, `CrawlStatusResult`, or `CancelResult`.
- Update tool metadata/description in `index.ts` to describe the five actions.

**Step 3: Re-run MCP tests**
- Execute `pnpm --filter './apps/mcp' test` and ensure all suites (schema, pipeline, response, handler) pass.

### Task 3: Update documentation & usage notes

**Files:**
- Modify: `apps/mcp/README.md`
- Modify: `apps/mcp/tools/CLAUDE.md`
- Modify: `.docs/sessions/...` if we log session summary (optional per repo rules)
- Modify: `AGENTS.md` or project root documentation referencing CLI usage (if applicable)

**Step 1: Document new command syntax**
- Update README/tool docs to show example invocations for `crawl <url>`, `crawl status <jobId>`, `crawl cancel <jobId>`, `crawl errors <jobId>`, `crawl list`.
- Note the new schema fields (`command`, `jobId`, `url`) for non-CLI users.

**Step 2: Verification**
- No automated tests, but proofread for accuracy, ensure lint/format as needed.

### Task 4: Final verification & housekeeping

**Step 1: Run targeted + full checks**
- `pnpm --filter './packages/firecrawl-client' build`
- `pnpm --filter './apps/mcp' build`
- `pnpm lint:js` (if time permits) to ensure type safety.

**Step 2: Summarize & handoff**
- Prepare final notes describing the new commands, tests added, and any follow-up considerations (e.g., rate limits for `crawl list`).

---

**Next Steps After Plan Approval:** Choose between subagent-driven execution in this session (requires `superpowers:subagent-driven-development`) or spin up a fresh session dedicated to implementation using `superpowers:executing-plans`.
