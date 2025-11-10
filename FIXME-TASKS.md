# FIXME Tasks

## Critical Security Issues

1. **Remove API key from debug logs** (P0 - Critical)
   - File: `packages/firecrawl-client/src/operations/crawl.ts:29`
   - Remove `apiKey` from debugLog payload

2. **Gate debug logging behind environment variable** (P0 - Major)
   - File: `packages/firecrawl-client/src/operations/crawl.ts:11-14`
   - Add `DEBUG` environment variable check before logging

## High Priority Fixes

3. **Fix require('http') in ES module** (P1 - Critical)
   - File: `apps/mcp/shared/config/health-checks.ts:27`
   - Use imported `http` module instead of inline `require()`

4. **Extract 'self-hosted-no-auth' magic string to constant** (Major)
   - Files: `packages/firecrawl-client/src/operations/{crawl,map,scrape,search}.ts`
   - Create shared constant in `packages/firecrawl-client/src/constants.ts`
   - Replace all 13+ occurrences across the codebase

5. **Extract duplicated header-building logic** (Refactor)
   - File: `packages/firecrawl-client/src/operations/crawl.ts:31-39`
   - Create `buildHeaders()` helper function
   - Apply to crawl, map, scrape, search operations

## Medium Priority Issues

6. **Remove or relocate debug logging utility** (Major)
   - File: `packages/firecrawl-client/src/operations/crawl.ts:11-14`
   - Move to shared logging utility OR remove if temporary

7. **Reduce nested if statements** (Refactor)
   - File: `apps/mcp/shared/mcp/tools/scrape/response.ts:263-264`
   - Use early returns or extract to separate function

8. **Improve entrypoint script error handling** (Minor)
   - File: `apps/mcp/Dockerfile:50-51`
   - Log warnings on chown failures instead of silencing

9. **Document removed environment variables** (Minor)
   - File: `docker-compose.yaml:60-61`
   - Add comment referencing .env file for configuration

10. **Extract pagination threshold constant** (Minor)
    - File: `apps/mcp/shared/mcp/tools/crawl/response.ts`
    - Extract hardcoded "10MB" to `PAGINATION_THRESHOLD_MB` constant

## Low Priority/Nitpicks

11. **Pin pnpm version in Dockerfile** (Trivial)
    - File: `apps/mcp/Dockerfile:7`
    - Replace `pnpm@latest` with specific version (e.g., `pnpm@9.15.0`)

12. **Consolidate RUN commands in Dockerfile** (Trivial)
    - File: `apps/mcp/Dockerfile:22-24`
    - Combine package build commands to reduce layers

13. **Use WORKDIR instead of cd in Dockerfile** (Trivial)
    - File: `apps/mcp/Dockerfile:53`
    - Replace `cd` with WORKDIR directive

14. **Extract entrypoint script to separate file** (Trivial)
    - File: `apps/mcp/Dockerfile:63-67`
    - Create `apps/mcp/entrypoint.sh` and pin su-exec version

15. **Fix webhook URL inconsistency in .env.example** (Major)
    - File: `.env.example:554`
    - Change to `http://firecrawl_webhook:52100` (internal Docker network URL)

16. **Fix duplicate environment variables** (Major)
    - File: `.env.example:175-189`
    - Resolve `WEBHOOK_TEI_URL` and `WEBHOOK_QDRANT_URL` duplication

17. **Add heading to AGENTS.md** (Trivial)
    - File: `AGENTS.md`
    - Add markdown heading for structure

18. **Extract status label derivation to helper function** (Trivial)
    - File: `apps/mcp/shared/mcp/tools/crawl/response.ts:28-34`
    - Create `deriveStatusLabel()` for testability

19. **Add Redis mock to worker test** (Major)
    - File: `apps/webhook/tests/unit/test_worker_thread.py:38-49`
    - Add Redis mock to prevent connection attempts

20. **Fix markdown formatting in deployment-log.md** (Minor)
    - File: `docs/deployment-log.md`
    - Add blank lines around headings

21. **Fix markdown formatting in external-services.md** (Minor)
    - File: `docs/external-services.md`
    - Fix ordered list numbering, add blank lines around headings/code blocks

22. **Document gpu-machine Docker context requirement** (Trivial)
    - File: `package.json:44-48`
    - Add setup documentation for gpu-machine context -- Document in the README

23. **Fix Playwright port in README** (Minor)
    - File: `README.md:324`
    - Update from 4302 to 50100

24. **Fix date inconsistency in test results** (Minor)
    - File: `apps/mcp/.docs/test-results-2025-11-09.md:3-6`
    - Verify date vs plan reference (Nov 2025 vs Jan 2025) -- Its november not january
