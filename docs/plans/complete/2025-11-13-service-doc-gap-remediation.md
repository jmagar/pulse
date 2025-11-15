# Service Documentation Gap Remediation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Document the web UI service, ensure service indices/ports cross-link correctly, surface Firecrawl scrape defaults, add missing env vars, and clean up outdated references.

**Architecture:** Pure documentation/config update. Create a dedicated service doc for the Next.js app, update shared indexes to link to it, add cross-references for scrape defaults, document frontend env vars, and point lingering references from the removed changedetection integration doc to the new service doc.

**Tech Stack:** Markdown docs under `docs/services`, `.env.example` text update, ripgrep for verification.

---

### Task 1: Author `docs/services/PULSE_WEB.md`

**Files:**
- Create: `docs/services/PULSE_WEB.md`
- Reference: `apps/web/README.md`, `docs/services/PORTS.md`

**Step 1:** Draft the new service guide using the common template (role, container/port, env vars, deployment, operations, troubleshooting, related docs). Capture Next.js 16 + Tailwind stack, current scaffold status, and dependencies (Firecrawl, MCP, Webhook).

**Step 2:** Include sections for configuration (`NEXT_PUBLIC_*` vars), development workflow, deployment expectations (future docker service), and note current port reservation (50110 ➜ 3000).

**Step 3:** Save the markdown file.

**Verification:** Manually proofread for completeness and consistent formatting.

---

### Task 2: Link services in `PORTS.md` and `INDEX.md`

**Files:**
- Modify: `docs/services/PORTS.md`
- Modify: `docs/services/INDEX.md`

**Step 1:** Convert the service names in the main port table to markdown links pointing at their respective service docs (including the newly added web doc).

**Step 2:** Update `docs/services/INDEX.md` quick reference table so each service name links to its doc (host + GPU entries). Ensure the new `PULSE_WEB` row links correctly.

**Verification:** Render markdown (quick preview) to confirm links, and ensure no stray text remains.

---

### Task 3: Cross-link Firecrawl default scrape options

**Files:**
- Modify: `docs/services/FIRECRAWL.md`
- Modify: `docs/services/firecrawl/DEFAULT_SCRAPE_OPTIONS.md`

**Step 1:** In `FIRECRAWL.md`, add a pointer to the standalone default-scrape-options doc (e.g., “See detailed breakdown”).

**Step 2:** In `DEFAULT_SCRAPE_OPTIONS.md`, add a brief reference back to `FIRECRAWL.md` so readers understand context.

**Verification:** Ensure hyperlinks use relative paths and render correctly.

---

### Task 4: Document frontend env vars

**Files:**
- Modify: `.env.example`
- Reference: `apps/web/README.md`

**Step 1:** Add `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_MCP_URL`, `NEXT_PUBLIC_WEBHOOK_URL`, and `NEXT_PUBLIC_GRAPH_URL` placeholders with comments describing each.

**Step 2:** Maintain alphabetical/grouped ordering consistent with existing sections.

**Verification:** `rg NEXT_PUBLIC` should now return entries in `.env.example`.

---

### Task 5: Update references to removed changedetection integration doc

**Files:**
- Use `rg` to locate references to the retired changedetection integration doc path
- Modify any files referencing it (likely under `docs/plans/` or `.docs/` reports)

**Step 1:** Replace references with `docs/services/CHANGEDETECTION.md` (or remove if redundant).

**Step 2:** Ensure surrounding text still makes sense (e.g., “Service guide” wording).

**Verification:** `rg 'changedetection' docs/services` plus a repo-wide `rg` for the old filename should produce no matches.
