# Remove Scrape Auto-Crawl Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Stop the scrape tool from silently launching Firecrawl crawls after every scrape request.

**Architecture:** Replace the implicit “base URL crawl” side-effect with no-op behavior, enforce the change with regression tests, and delete the helper/config plumbing that existed only for this feature so future regressions are impossible.

**Tech Stack:** TypeScript (MCP server), Vitest, pnpm.

---

### Task 1: Add regression tests that fail while auto-crawl exists

**Files:**
- Modify: `apps/mcp/tools/scrape/pipeline.test.ts`

**Step 1: Write failing tests**

Add a new `describe("scrapeContent auto crawl prevention", …)` after the existing batch tests.

```ts
import { scrapeContent } from "./pipeline.js";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { scrapeWithStrategy } from "../../scraping/strategies/selector.js";

vi.mock("../../scraping/strategies/selector.js", () => ({
  scrapeWithStrategy: vi.fn(),
}));

const mockedScrapeWithStrategy = vi.mocked(scrapeWithStrategy);

describe("scrapeContent auto crawl prevention", () => {
  const strategyClient = {} as any;

  beforeEach(() => {
    mockedScrapeWithStrategy.mockReset();
  });

  it("does not call firecrawl.startCrawl when screenshot scraping succeeds", async () => {
    const firecrawl = {
      scrape: vi.fn().mockResolvedValue({
        success: true,
        data: {
          html: "<html/>",
          screenshot: "base64",
          metadata: { screenshotMetadata: { format: "png" } },
        },
      }),
      startCrawl: vi.fn(),
    };

    await scrapeContent(
      "https://example.com/page",
      60000,
      { native: {} as any, firecrawl },
      strategyClient,
      { formats: ["screenshot"] },
    );

    expect(firecrawl.startCrawl).not.toHaveBeenCalled();
  });

  it("does not call firecrawl.startCrawl during standard strategy scraping", async () => {
    mockedScrapeWithStrategy.mockResolvedValue({
      success: true,
      content: "<html/>",
      source: "native",
    });
    const firecrawl = { startCrawl: vi.fn() };

    await scrapeContent(
      "https://example.com/docs",
      60000,
      { native: {} as any, firecrawl: firecrawl as any },
      strategyClient,
      {},
    );

    expect(firecrawl.startCrawl).not.toHaveBeenCalled();
  });
});
```

**Step 2: Run the focused test file to see it fail**

```bash
cd apps/mcp
pnpm test -- tools/scrape/pipeline.test.ts
```

Expected: both new specs fail because `firecrawl.startCrawl` is invoked by the legacy helper.

---

### Task 2: Remove `startBaseUrlCrawl` helper and its callers

**Files:**
- Modify: `apps/mcp/tools/scrape/helpers.ts`
- Modify: `apps/mcp/tools/scrape/pipeline.ts`

**Step 1: Delete the helper**

- Remove the `IScrapingClients` import and the `startBaseUrlCrawl` function block from `helpers.ts`.
- Leave `detectContentType` untouched.

**Step 2: Stop importing/using the helper**

In `pipeline.ts`:
- Delete `startBaseUrlCrawl` from the helpers import line.
- Remove the two `startBaseUrlCrawl(url, clients);` calls (one in the screenshot branch, one after `scrapeWithStrategy` succeeds).

**Step 3: Run targeted tests**

```bash
cd apps/mcp
pnpm test -- tools/scrape/pipeline.test.ts
```

Expected: New regression tests still fail, but now because `firecrawl.startCrawl` is undefined (helper removed) or because TypeScript compilation fails. The failure confirms the helper is gone.

---

### Task 3: Delete the crawl-config plumbing that only supported auto-crawl

**Files:**
- Modify: `apps/mcp/config/crawl-config.ts`
- Modify: `apps/mcp/config/crawl-config.test.ts`
- Modify: `apps/mcp/server.ts`

**Step 1: Prune `CrawlRequestConfig` utilities**

In `crawl-config.ts`:
- Remove the `CrawlRequestConfig` interface, `buildCrawlRequestConfig`, and `shouldStartCrawl` exports.
- Ensure remaining exports (`DEFAULT_LANGUAGE_EXCLUDES`, `mergeExcludePaths`, `DEFAULT_SCRAPE_OPTIONS`, `mergeScrapeOptions`) stay intact.

**Step 2: Update tests**

In `crawl-config.test.ts`, drop the test that exercised `buildCrawlRequestConfig` and remove the import.

**Step 3: Remove unused interfaces from the MCP server**

In `apps/mcp/server.ts`:
- Delete the import of `CrawlRequestConfig`.
- Remove the `startCrawl` method from `IFirecrawlClient` and the corresponding implementation inside `DefaultFirecrawlClient` (the `async startCrawl(config)` block).
- Ensure no other code references the removed type; re-run `rg 'CrawlRequestConfig'` to confirm zero matches.

**Step 4: Re-run lint/typecheck quickly**

```bash
cd apps/mcp
pnpm typecheck
```

Expected: passes with no references to the removed interfaces.

---

### Task 4: Make the regression tests pass & clean up docs/logs

**Files:**
- Modify: `apps/mcp/tools/scrape/pipeline.test.ts` (if any tweaks needed after removals)
- Modify: `docs/mcp/SCRAPE.md`
- Update log: `.docs/tmp/crawl-tool-actions.md`

**Step 1: Ensure the new tests now pass**

Re-run the focused suite:

```bash
cd apps/mcp
pnpm test -- tools/scrape/pipeline.test.ts
```

Expected: both new “does not call startCrawl” tests pass now that no code references it.

**Step 2: Run the full MCP test/build pipeline**

```bash
cd apps/mcp
pnpm test
pnpm build
```

Both commands must succeed before proceeding.

**Step 3: Update documentation**

In `docs/mcp/SCRAPE.md`, add a short “Behavior note” indicating that scrapes no longer spawn background crawls and that users should use the `crawl` tool explicitly if they need site-wide discovery.

**Step 4: Extend the running session log**

Append a new section titled “2025-11-12 – Removed Scrape Auto-Crawl” to `.docs/tmp/crawl-tool-actions.md` that summarizes:
- tests added,
- helper/config deletions,
- docs updated,
- verification commands.

---

**Plan complete and saved to `docs/plans/2025-11-12-remove-scrape-autocrawl.md`. Two execution options:**

1. **Subagent-Driven (this session)** – Fresh subagent per task, review between tasks for fast iteration.
2. **Parallel Session** – Spin up a new session/worktree and run `superpowers:executing-plans` there.

Which approach should we take?
