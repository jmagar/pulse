# Crawl Tool API Contract & Schema Review

**Research Date:** 2025-11-12
**Reviewed Files:**
- `/compose/pulse/apps/mcp/tools/crawl/schema.ts`
- `/compose/pulse/apps/mcp/tools/crawl/index.ts`
- `/compose/pulse/apps/mcp/tools/crawl/response.ts`
- `/compose/pulse/apps/mcp/tools/crawl/pipeline.ts`
- `/compose/pulse/docs/mcp/CRAWL.md`
- `/compose/pulse/apps/mcp/CLAUDE.md`
- `/compose/pulse/packages/firecrawl-client/src/types.ts`

## Summary

The crawl tool's API contract is **production-ready** with minor documentation inconsistencies. Schema validation is comprehensive with good error messages, but has a **breaking semantic inconsistency** with the pipeline layer regarding `crawlEntireDomain`. Type safety is excellent with no `any` types. The tool follows consistent patterns with other MCP tools and provides clear, actionable error messages.

**Critical Issue:** `crawlEntireDomain` defaults differ between schema (`false`) and pipeline (`true`), which could confuse users and cause unexpected behavior.

---

## Key Findings

### 1. Schema Completeness: EXCELLENT ✓

**All parameters documented:**
- ✓ Command structure (`start|status|cancel|errors|list`)
- ✓ URL/jobId requirements per command
- ✓ All crawl configuration options
- ✓ Scrape options including browser actions
- ✓ Natural language `prompt` parameter

**Required vs Optional:** Very clear with proper Zod modifiers
- `url`: Required for `start` (validated in `superRefine`)
- `jobId`: Required for `status|cancel|errors` (validated in `superRefine`)
- All other params: Optional with sensible defaults

**Missing:** None identified

---

### 2. Validation Strictness: EXCELLENT ✓

**Schema catches invalid inputs before Firecrawl:**
- ✓ URL format validation (`z.string().url()`)
- ✓ Command enum validation
- ✓ Numeric ranges (`limit: 1-100000`, `maxDiscoveryDepth: min(1)`)
- ✓ Cross-field validation via `superRefine` (command-specific requirements)
- ✓ Browser actions validated via shared `browserActionsArraySchema`

**Validation Examples:**
```typescript
// Command resolution with backward compatibility
const resolveCommand = (data) => {
  if (data.cancel) return "cancel";           // Legacy flag
  if (data.command && data.command !== "start") return data.command;
  if (!data.url && data.jobId) return "status"; // Infer from context
  return data.command ?? "start";
};

// Cross-field validation
.superRefine((data, ctx) => {
  const command = resolveCommand(data);
  if (command === "start" && !data.url) {
    ctx.addIssue({ code: "custom", message: 'Command "start" requires a "url" field' });
  }
  if (["status", "cancel", "errors"].includes(command) && !data.jobId) {
    ctx.addIssue({ code: "custom", message: `Command "${command}" requires a "jobId" field` });
  }
})
```

**Good practices:**
- Uses `transform()` to normalize data (resolve command, set defaults)
- Validates before calling Firecrawl API
- Clear error messages reference field names

---

### 3. Type Safety: EXCELLENT ✓

**No `any` types found:**
- All TypeScript types derived from Zod schemas via `z.infer<typeof schema>`
- Pipeline uses proper union types for return values
- Response formatter uses discriminated unions to detect result type

**Type alignment:**
```typescript
// Schema exports TypeScript type
export type CrawlOptions = z.infer<typeof crawlOptionsSchema>;

// Pipeline uses typed client from firecrawl-client package
import type {
  FirecrawlCrawlClient,
  StartCrawlResult,
  CrawlStatusResult,
  // ...
} from "@firecrawl/client";

// Response formatter uses union type for all possible results
export function formatCrawlResponse(
  result:
    | StartCrawlResult
    | CrawlStatusResult
    | CancelResult
    | CrawlErrorsResult
    | ActiveCrawlsResult,
): CallToolResult
```

**Type safety wins:**
- Compiler catches mismatches between schema and pipeline
- IntelliSense works correctly
- Refactoring is safe

---

### 4. Backward Compatibility: GOOD (with caveats) ⚠️

**Legacy support:**
- ✓ `cancel: true` flag still works (triggers cancel command)
- ✓ Implicit command resolution (jobId-only → "status")
- ✓ Omitting `command` defaults to "start"

**Breaking change risk:**
```typescript
// Schema default
crawlEntireDomain: z.boolean().optional().default(false)

// Pipeline override
crawlEntireDomain: options.crawlEntireDomain ?? true  // ⚠️ Different default!
```

**Impact:** Users who omit `crawlEntireDomain` will get `true` (crawl entire domain) instead of documented `false` default. This is a **semantic breaking change** even though the API accepts the same inputs.

**Recommendation:** Align defaults or document the pipeline override behavior.

---

### 5. Response Format Consistency: EXCELLENT ✓

**All commands return structured `CallToolResult`:**
```typescript
{
  content: [{ type: "text", text: "..." }],
  isError: false
}
```

**Response patterns:**
- **start**: Job ID + polling instructions
- **status**: Progress summary + pagination warning if `next` present
- **cancel**: Confirmation message
- **errors**: Formatted error list + robots-blocked URLs
- **list**: Table of active crawls (ID + URL)

**Consistency with other tools:**
- Same `CallToolResult` structure as scrape/map/query
- Errors always have `isError: true`
- Text responses are CLI-friendly (bullets, newlines)

**Example output quality:**
```typescript
// Start command
`Crawl job started successfully!

Job ID: ${result.id}
Status URL: ${result.url}

Use crawl tool with jobId "${result.id}" to check progress.`

// Status with pagination warning
`⚠️ Data pagination required!
Next batch URL: ${statusResult.next}

The crawl job has completed, but the results are larger than 10MB.
Use the pagination URL to retrieve the next batch of data.`
```

---

### 6. Documentation Accuracy: GOOD (needs minor updates) ⚠️

**CRAWL.md documentation:**
- ✓ Comprehensive options table
- ✓ Natural language examples
- ✓ Command descriptions accurate
- ✓ References to pipeline/schema files

**Inconsistencies found:**

| Issue | Documentation Says | Code Reality | Severity |
|-------|-------------------|--------------|----------|
| `crawlEntireDomain` default | `false` (schema.ts, CRAWL.md) | Pipeline sets `true` if undefined | **High** |
| `cancel` flag | "Backwards compatibility" | Works but deprecated | Low |
| Error response format | Not documented | Returns structured list with bullets | Low |

**Documentation gaps:**
- Missing examples of `errors` command output format
- No guidance on when to use `prompt` vs manual parameters
- `maxDiscoveryDepth` behavior with `crawlEntireDomain` not explained

---

### 7. Example Coverage: GOOD ✓

**CRAWL.md provides examples for:**
- ✓ Starting crawls with various options
- ✓ Checking status
- ✓ Cancelling jobs
- ✓ Listing active crawls
- ✓ Natural language invocation

**Missing examples:**
- Fetching errors (`crawl errors <jobId>`)
- Using `prompt` parameter
- Combining `includePaths` and `excludePaths`
- Browser actions in crawl context

**Test coverage provides examples:**
- Schema validation tests show parameter combinations
- Pipeline tests demonstrate command routing

---

### 8. Error Messages: EXCELLENT ✓

**Validation errors are clear and actionable:**
```typescript
// Missing required field
'Command "start" requires a "url" field'
'Command "status" requires a "jobId" field'

// Invalid enum
// Zod automatically generates: "Invalid enum value. Expected 'start' | 'status' | ..."

// Range violations
// Zod generates: "Number must be greater than or equal to 1"
```

**Runtime errors:**
```typescript
// Pipeline level
'Command "start" requires a url'
`Unsupported crawl command: ${command}`

// Tool handler wraps all errors
`Crawl error: ${error instanceof Error ? error.message : String(error)}`
```

**Good practices:**
- Errors reference field names
- Suggest valid values
- Distinguish validation vs runtime errors

---

### 9. Default Values: GOOD (one issue) ⚠️

**Sensible defaults:**
- ✓ `command: "start"` (most common operation)
- ✓ `limit: 100` (reasonable for most crawls)
- ✓ `ignoreQueryParameters: true` (avoid duplicate URLs)
- ✓ `sitemap: "include"` (leverage existing structure)
- ✓ `scrapeOptions.formats: ["markdown", "html"]` (useful pair)
- ✓ `scrapeOptions.onlyMainContent: true` (clean content)
- ✓ `scrapeOptions.parsers: []` (avoid unexpected credit usage)

**Problematic default:**
```typescript
// SCHEMA (schema.ts line 57)
crawlEntireDomain: z.boolean().optional().default(false)

// PIPELINE (pipeline.ts line 36)
crawlEntireDomain: options.crawlEntireDomain ?? true  // Overrides schema!
```

**Why this matters:**
- User omits `crawlEntireDomain` expecting `false` behavior
- Pipeline actually sets `true`, crawling entire domain
- Could result in massive crawls beyond user expectations
- Credit overuse risk

**Root cause:** Schema default is conservative (`false`), pipeline default is permissive (`true`).

---

### 10. API Inconsistencies: MINIMAL ✓

**Compared to scrape tool:**

| Feature | Scrape | Crawl | Consistent? |
|---------|--------|-------|-------------|
| Command pattern | `start\|status\|cancel\|errors` | `start\|status\|cancel\|errors\|list` | ✓ Similar |
| Legacy `cancel` flag | Yes | Yes | ✓ |
| URL preprocessing | Adds `https://` | No preprocessing | ⚠️ Different |
| Result handling | `saveOnly\|saveAndReturn\|returnOnly` | Not supported | Expected (different use case) |
| Browser actions | `actions` array | `scrapeOptions.actions` | ⚠️ Different nesting |

**Compared to query tool:**

| Feature | Query | Crawl | Consistent? |
|---------|-------|-------|-------------|
| Pagination | `limit` + `offset` | `limit` + `next` cursor | Different but appropriate |
| Filters | Domain/language/country | includePaths/excludePaths | Different domains |
| Response format | Structured results | Status text | Expected |

**Inconsistency: Browser actions nesting**
```typescript
// Scrape tool
{ actions: [{ type: "wait", milliseconds: 1000 }] }

// Crawl tool
{ scrapeOptions: { actions: [{ type: "wait", milliseconds: 1000 }] } }
```

**Justification:** Crawl tool wraps scrape options because actions apply to all pages in crawl. This is **intentional** and **documented**.

**URL preprocessing inconsistency:**
- Scrape tool: `preprocessUrl("example.com")` → `"https://example.com"`
- Crawl tool: No preprocessing, expects full URL
- **Impact:** User-facing inconsistency in what's accepted

---

## Breaking Change Risks

### High Risk: `crawlEntireDomain` Default Mismatch

**Current behavior:**
```typescript
// User omits crawlEntireDomain
const options = { url: "https://docs.example.com", limit: 100 };

// Schema says: crawlEntireDomain = false (crawl only discovered paths)
// Pipeline actually does: crawlEntireDomain = true (crawl ENTIRE domain)
// Result: User gets surprised by 10,000+ page crawl instead of 100
```

**Fix options:**
1. **Change pipeline to match schema** (set default to `false`)
   - Pro: Matches documentation
   - Pro: Conservative default (prevents surprise costs)
   - Con: Breaking change for users relying on current behavior

2. **Change schema to match pipeline** (set default to `true`)
   - Pro: No behavior change
   - Con: Less conservative default
   - Con: Documentation says `false`

3. **Remove default, make explicit**
   - Pro: Forces users to think about it
   - Con: More friction

**Recommendation:** Option 1 - Change pipeline to `false` default. This is the **conservative choice** and matches documentation.

---

### Medium Risk: URL Preprocessing Inconsistency

**Scrape accepts:** `"example.com"` → auto-adds `https://`
**Crawl requires:** `"https://example.com"` (full URL)

**Fix:** Add `preprocessUrl` to crawl schema like scrape tool:
```typescript
url: z
  .string()
  .transform(preprocessUrl)  // Add this
  .pipe(z.string().url())
  .optional()
```

---

### Low Risk: Deprecated `cancel` Flag

**Current:** `{ cancel: true }` triggers cancel command
**Better:** Explicit `{ command: "cancel", jobId: "..." }`

**Action:** Document deprecation timeline, add warning in future release

---

## Recommended Improvements

### Critical (Fix Before Production)

1. **Align `crawlEntireDomain` default**
   ```typescript
   // pipeline.ts line 36
   - crawlEntireDomain: options.crawlEntireDomain ?? true,
   + crawlEntireDomain: options.crawlEntireDomain ?? false,
   ```

2. **Add URL preprocessing to crawl tool**
   ```typescript
   // schema.ts - import from scrape/schema.ts
   import { preprocessUrl } from "../scrape/schema.js";

   url: z.string().transform(preprocessUrl).pipe(z.string().url()).optional()
   ```

### Important (Improve User Experience)

3. **Document `prompt` vs manual parameters precedence**
   ```markdown
   ## Natural Language Prompts

   When `prompt` is provided, Firecrawl generates optimal parameters automatically.
   Manual parameters are ignored when `prompt` is set.

   Example: `{ url: "...", prompt: "Find all docs pages", limit: 50 }`
   → Firecrawl determines best limit, ignoring your `50`
   ```

4. **Add error command examples to CRAWL.md**
   ```markdown
   ### Fetch Errors

   ```typescript
   {
     command: "errors",
     jobId: "cf7e0630-..."
   }
   ```

   **Output:**
   ```
   Crawl Errors:
   • Timeout after 60s (https://example.com/slow-page)
   • 404 Not Found (https://example.com/missing)

   Robots-blocked URLs:
   - https://example.com/admin
   - https://example.com/private
   ```
   ```

5. **Clarify `maxDiscoveryDepth` with `crawlEntireDomain`**
   ```markdown
   **Important:** `maxDiscoveryDepth` is ignored when `crawlEntireDomain: true`.
   To limit depth, set `crawlEntireDomain: false` and provide `maxDiscoveryDepth`.
   ```

### Nice to Have (Polish)

6. **Add JSON Schema description for `scrapeOptions.actions`**
   ```typescript
   // buildCrawlInputSchema() line 249
   actions: {
     type: "array",
     description: "Browser actions to perform before scraping (same as scrape tool)",
   + items: { /* full action schema */ }  // Currently missing item schema
   }
   ```

7. **Warn about `prompt` overriding manual params**
   ```typescript
   .superRefine((data, ctx) => {
     if (data.prompt && (data.limit || data.maxDiscoveryDepth || data.includePaths)) {
       ctx.addIssue({
         code: z.ZodIssueCode.custom,
         message: "Warning: 'prompt' takes precedence over manual crawl parameters",
         path: ["prompt"]
       });
     }
   })
   ```

---

## Schema Examples

### Valid Inputs (Comprehensive)

```typescript
// Minimal start
{ url: "https://docs.example.com" }

// Natural language prompt
{
  url: "https://docs.example.com",
  prompt: "Find all API reference pages, exclude blog posts"
}

// Manual configuration
{
  url: "https://docs.example.com",
  limit: 500,
  maxDiscoveryDepth: 3,
  crawlEntireDomain: false,
  excludePaths: ["^/blog", "^/changelog"],
  scrapeOptions: {
    formats: ["markdown"],
    onlyMainContent: true,
    actions: [
      { type: "wait", milliseconds: 1000 },
      { type: "click", selector: "#cookie-accept" }
    ]
  }
}

// Status check
{ command: "status", jobId: "cf7e0630-..." }

// Cancel job
{ command: "cancel", jobId: "cf7e0630-..." }

// Fetch errors
{ command: "errors", jobId: "cf7e0630-..." }

// List active crawls
{ command: "list" }
```

### Invalid Inputs (With Error Messages)

```typescript
// Missing URL for start
{ command: "start" }
// Error: 'Command "start" requires a "url" field'

// Missing jobId for status
{ command: "status" }
// Error: 'Command "status" requires a "jobId" field'

// Invalid URL format
{ url: "not-a-url" }
// Error: "Invalid url"

// Limit out of range
{ url: "https://example.com", limit: 200000 }
// Error: "Number must be less than or equal to 100000"

// Invalid command
{ command: "pause" }
// Error: "Invalid enum value. Expected 'start' | 'status' | 'cancel' | 'errors' | 'list'"
```

---

## Comparison with Other Tools

### Schema Validation Pattern (Consistent ✓)

**All tools follow same pattern:**
1. Zod schema with `.describe()` for documentation
2. `.superRefine()` for cross-field validation
3. `.transform()` to normalize/resolve commands
4. Separate `buildInputSchema()` for JSON Schema (manual, not `zodToJsonSchema`)

### Command-Based Architecture (Consistent ✓)

**Scrape and Crawl both use:**
- `command` enum for operations
- `resolveCommand()` for backward compatibility
- `jobId` for async job tracking
- Shared error handling pattern

**Why this works:** Users learn pattern once, applies to both tools.

### Response Format (Consistent ✓)

**All tools return:**
```typescript
{
  content: Array<{ type: "text" | "resource" | "resource_link", ... }>,
  isError?: boolean
}
```

**Crawl-specific:** Text responses are CLI-style (bullets, sections), not embedded resources. This is **appropriate** because crawl is for job management, not content retrieval.

---

## Production Readiness Checklist

- [x] Schema validation comprehensive
- [x] Type safety (no `any` types)
- [x] Error messages actionable
- [x] Documentation exists
- [ ] **BLOCKER:** Fix `crawlEntireDomain` default mismatch (schema vs pipeline)
- [ ] **High Priority:** Add URL preprocessing for consistency with scrape
- [x] Backward compatibility maintained
- [x] Examples cover major use cases
- [ ] **Medium Priority:** Document `prompt` precedence behavior
- [x] Test coverage adequate

**Overall:** 85% production-ready. Critical blocker is the `crawlEntireDomain` default mismatch which could surprise users with unexpectedly large crawls.

---

## Files Needing Updates

### Immediate (Critical Path)

1. **`apps/mcp/tools/crawl/pipeline.ts`** (line 36)
   - Change `crawlEntireDomain: options.crawlEntireDomain ?? true` to `?? false`

2. **`apps/mcp/tools/crawl/schema.ts`** (line 35)
   - Import `preprocessUrl` from scrape tool
   - Add `.transform(preprocessUrl)` to `url` field

### Documentation Updates

3. **`docs/mcp/CRAWL.md`**
   - Add error command output examples
   - Clarify `prompt` vs manual params precedence
   - Explain `maxDiscoveryDepth` behavior with `crawlEntireDomain`
   - Add example of browser actions in crawl context

4. **`apps/mcp/CLAUDE.md`**
   - Update crawl tool section with `prompt` guidance

### Testing

5. **`apps/mcp/tools/crawl/schema.test.ts`**
   - Add test for URL preprocessing (`"example.com"` → `"https://example.com"`)
   - Add test for `crawlEntireDomain` default behavior

6. **`apps/mcp/tools/crawl/pipeline.test.ts`**
   - Verify `crawlEntireDomain: false` when omitted

---

## Related Work

**Similar patterns in codebase:**
- `apps/mcp/tools/scrape/schema.ts` - URL preprocessing implementation
- `apps/mcp/tools/query/schema.ts` - Simple single-command schema (comparison)
- `apps/mcp/tools/map/schema.ts` - Pagination pattern (comparison)

**External dependencies:**
- `packages/firecrawl-client/src/types.ts` - Type definitions
- `packages/firecrawl-client/src/operations/crawl.ts` - API client

**Documentation:**
- `docs/mcp/CRAWL.md` - User-facing documentation
- `docs/plans/2025-11-12-crawl-tool-actions.md` - Implementation plan

---

## Conclusion

The crawl tool's API contract is **well-designed** with excellent type safety, comprehensive validation, and clear error messages. The main issues are:

1. **Critical:** `crawlEntireDomain` default inconsistency (schema says `false`, pipeline uses `true`)
2. **Important:** Missing URL preprocessing (scrape has it, crawl doesn't)
3. **Nice-to-have:** Better documentation of `prompt` behavior

**Recommended action:** Fix the default mismatch and add URL preprocessing before considering the API production-ready. Everything else is polish.

**Estimated effort:**
- Critical fixes: 30 minutes (2 line changes + tests)
- Documentation updates: 1 hour
- Total: ~2 hours to production-ready state
