# Refactor Crawl Tool To Use Webhook Bridge Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the MCP `crawl` tool use the same webhook-proxied Firecrawl client as the other tools so no code path talks to `FirecrawlCrawlClient` directly.

**Architecture:** Treat `WebhookBridgeClient` (already injected via `registerTools`) as the single Firecrawl facade. Introduce a `CrawlClient` interface alias derived from `IFirecrawlClient`, update `crawlPipeline`/`createCrawlTool` to accept that interface, and rewire registration/tests. Rate limiting, schema validation, and formatting stay intact; only dependency wiring changes.

**Tech Stack:** TypeScript, MCP SDK, Vitest, @firecrawl/client typings.

---

### Task 1: Strengthen regression tests before refactor

**Files:**
- Modify: `apps/mcp/tools/registration.test.ts`
- Modify: `apps/mcp/tools/crawl/index.test.ts`
- Modify: `apps/mcp/tools/crawl/pipeline.test.ts`

**Step 1: Write the failing tests**

1. **registration.test.ts** – assert the mocked `createCrawlTool` receives the exact client returned by `mockFirecrawlClientFactory` by inspecting `vi.mocked(createCrawlTool).mock.calls` (there is no tracker accessor for tool instances):
   ```ts
   const mockFirecrawlClient = { listActiveCrawls: vi.fn() } as Partial<IFirecrawlClient>;
   mockFactory.mockReturnValue(mockFirecrawlClient as IFirecrawlClient);
   registerTools(server, mockFactory);
   // NOTE: This test WILL fail until Task 3 - createCrawlTool currently expects FirecrawlConfig, not a client
   expect(vi.mocked(createCrawlTool).mock.calls[0][0]).toBe(mockFirecrawlClient);
   ```

2. **crawl/index.test.ts** – introduce a helper `makeMockCrawlClient()` that returns an object exposing the five crawl methods (each a `vi.fn()` resolving to predictable payloads). Stage the rewrite so the existing fetch-based assertions continue to pass until the implementation switches over: add a new `describe("injected client", ...)` block that instantiates the tool via `createCrawlTool(makeMockCrawlClient())` and asserts the proper mock method was invoked and the formatted response contains expected text, while the legacy fetch block remains temporarily for parity.

3. **crawl/pipeline.test.ts** – import the forthcoming `CrawlClient` alias from `../../types.js` and type the mock accordingly.
   ```ts
   import type { CrawlClient } from "../../types.js";
   let mockClient: CrawlClient;
   ```
   **NOTE: This test WILL fail** because `CrawlClient` type doesn't exist yet (created in Task 2). This is expected RED-phase behavior.

**Step 2: Run tests to prove they fail**

Run each suite individually (they fail for the reasons noted above):
```bash
pnpm test:mcp -- --runTestsByPath apps/mcp/tools/registration.test.ts
pnpm test:mcp -- --runTestsByPath apps/mcp/tools/crawl/index.test.ts
pnpm test:mcp -- --runTestsByPath apps/mcp/tools/crawl/pipeline.test.ts
```

**Step 3: Commit failing tests**

```bash
git add apps/mcp/tools/registration.test.ts apps/mcp/tools/crawl/index.test.ts apps/mcp/tools/crawl/pipeline.test.ts
git commit -m "test: lock crawl tool injection behavior"
```

### Task 2: Define shared CrawlClient interface and wire pipeline

**Files:**
- Modify: `apps/mcp/types.ts`
- Modify: `apps/mcp/tools/crawl/pipeline.ts`
- Modify: `apps/mcp/tools/crawl/pipeline.test.ts`

**Step 1: Implement minimal code**

1. In `apps/mcp/types.ts`, add:
   ```ts
   export type CrawlClient = Pick<
     IFirecrawlClient,
     "startCrawl" | "getCrawlStatus" | "cancelCrawl" | "getCrawlErrors" | "listActiveCrawls"
   >;
   ```
   **Note:** `FirecrawlConfig` will be removed in Task 5 after verifying no references remain.

2. Update `crawlPipeline` signature to accept `CrawlClient` instead of `FirecrawlCrawlClient`, drop the direct import from `@firecrawl/client`, and adjust the call sites accordingly.

3. Update the pipeline test to import and use `CrawlClient` (the change from Task 1), ensuring all mocks satisfy the new type.

**Step 2: Run pipeline tests**

```bash
pnpm test:mcp -- --runTestsByPath apps/mcp/tools/crawl/pipeline.test.ts
```
Expected: PASS.

**Step 3: Commit**

```bash
git add apps/mcp/types.ts apps/mcp/tools/crawl/pipeline.ts apps/mcp/tools/crawl/pipeline.test.ts
git commit -m "refactor: add CrawlClient interface"
```

### Task 3: Refactor crawl tool to accept injected client

**Files:**
- Modify: `apps/mcp/tools/crawl/index.ts`
- Modify: `apps/mcp/tools/crawl/index.test.ts`

**Step 1: Implement code changes**

1. Change the factory signature to `export function createCrawlTool(client: CrawlClient): Tool` and remove the `FirecrawlCrawlClient` constructor + `FirecrawlConfig` import.
2. Inside the handler, keep the rate limiter but pass the injected `client` down to `crawlPipeline`.
3. Update tests to instantiate the tool with the helper mock and assert that each handler call triggers the right method on the mock client and that formatted responses contain expected strings (e.g., `"Crawl Status:"`).

**Step 2: Run crawl tool tests**

```bash
pnpm test:mcp -- --runTestsByPath apps/mcp/tools/crawl/index.test.ts
```
Expected: PASS.

**Step 3: Commit**

```bash
git add apps/mcp/tools/crawl/index.ts apps/mcp/tools/crawl/index.test.ts
git commit -m "feat: inject CrawlClient into crawl tool"
```

### Task 4: Rewire registration to pass WebhookBridgeClient

**Files:**
- Modify: `apps/mcp/tools/registration.ts`
- Modify: `apps/mcp/tools/registration.test.ts`

**Step 1: Implement code changes**

1. Delete the `firecrawlConfig` block in `registerTools` and stop importing `FirecrawlConfig`.
2. Pass the `firecrawlClient` instance returned by `firecrawlClientFactory()` straight into `createCrawlTool`.
3. Ensure `FirecrawlClientFactory` still produces an `IFirecrawlClient` (no additional work needed because `WebhookBridgeClient` already implements the crawl methods).
4. In the tests, update the mocked `createCrawlTool` to expect the client argument and remove any config assertions.

**Step 2: Run registration tests**

```bash
pnpm test:mcp -- --runTestsByPath apps/mcp/tools/registration.test.ts
```
Expected: PASS.

**Step 3: Commit**

```bash
git add apps/mcp/tools/registration.ts apps/mcp/tools/registration.test.ts
git commit -m "chore: register crawl tool with webhook client"
```

### Task 5: Remove dead Firecrawl config types and update docs

**Files:**
- Modify: `apps/mcp/types.ts`
- Modify: `apps/mcp/tools/CLAUDE.md`
- Modify: `docs/services/PULSE_MCP.md`

**Step 1: Clean up code**

1. If `FirecrawlConfig` is no longer referenced after Task 4, remove it from `apps/mcp/types.ts` and delete related imports.
2. Ensure no other modules import `FirecrawlConfig`; run `rg "FirecrawlConfig"` to confirm.

**Step 2: Update documentation**

- In `apps/mcp/tools/CLAUDE.md`, clarify under the **crawl** section that the tool now routes through the webhook bridge (e.g., “Crawl requests proxy through `pulse_webhook` so MCP never talks to Firecrawl directly”).
- In `docs/services/PULSE_MCP.md`, update the architecture section to state “All Firecrawl access (scrape/map/search/crawl) flows through the webhook bridge client injected via `registerTools`.” No need to remove environment variable references, but add a note that the MCP container no longer uses the Firecrawl base URL except for health checks.

**Step 3: Run lint (optional but preferred)**

```bash
pnpm lint:js
```
Expected: PASS.

**Step 4: Commit**

```bash
git add apps/mcp/types.ts apps/mcp/tools/CLAUDE.md docs/services/PULSE_MCP.md
git commit -m "docs: describe crawl webhook routing"
```

### Task 6: Regression and verification sweep

**Files:** None (commands only)

**Step 1: Run crawl-focused suites**

```bash
pnpm test:mcp -- --runTestsByPath \
  apps/mcp/tools/crawl/index.test.ts \
  apps/mcp/tools/crawl/pipeline.test.ts \
  apps/mcp/tools/registration.test.ts
```
Expected: PASS for all.

**Step 2: Run full MCP test suite**

```bash
pnpm test:mcp
```
Expected: PASS.

**Step 3: Manual verification (optional but recommended)**

Start the stack (`pnpm services:up` if not already running) and trigger a crawl via MCP (e.g., using manual `CallTool` or CLI). Verify webhook routing:

```bash
# Confirm requests hit the webhook bridge
docker compose logs pulse_webhook --tail=50 | grep "POST /v2/crawl"
```

**Step 4: Final commit**

```bash
git commit --allow-empty -m "chore: verify crawl webhook migration"
```

**Step 5: Session log**

Document the work in `.docs/sessions/<timestamp>-crawl-webhook.md`, including commands executed and results.

---

Plan complete and saved to `docs/plans/2025-11-16-refactor-crawl-tool.md`. Two execution options:

1. **Subagent-Driven (this session):** I dispatch fresh subagents per task using superpowers:subagent-driven-development, with review checkpoints after each task.
2. **Parallel Session:** Spin up a new session dedicated to execution using superpowers:executing-plans for batched updates.

Which approach do you prefer?
