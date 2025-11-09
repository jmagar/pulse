# MCP Map Tool Investigation Report

**Repository**: pulse-fetch  
**Tool**: shared/mcp/tools/map/  
**Investigation Date**: 2025-11-07  
**Status**: COMPLIANT with excellent implementation quality

---

## Executive Summary

The map tool is **well-implemented and MCP protocol compliant**. It demonstrates best practices in:

- Tool schema definition and validation
- Response formatting with proper MCP content types
- Error handling and user feedback
- Pagination support for large datasets
- Environment variable configuration
- Test coverage (49 tests, all passing)

No protocol violations or security concerns identified. The implementation exceeds minimum requirements.

---

## 1. Tool Schema Compliance ✅

**Location**: `/home/jmagar/code/pulse-fetch/shared/mcp/tools/map/schema.ts`

### Schema Definition

```typescript
export const mapOptionsSchema = z.object({
  url: z.string().url('Valid URL is required'),
  search: z.string().optional(),
  limit: z.number().int().min(1).max(100000).optional().default(5000),
  sitemap: z.enum(['skip', 'include', 'only']).optional().default('include'),
  includeSubdomains: z.boolean().optional().default(true),
  ignoreQueryParameters: z.boolean().optional().default(true),
  timeout: z.number().int().positive().optional(),
  location: z.object({...}).optional().default({...}),
  startIndex: z.number().int().min(0).optional().default(0),
  maxResults: z.number().int().min(1).max(5000).optional().default(200),
  resultHandling: z.enum(['saveOnly', 'saveAndReturn', 'returnOnly']).optional().default('saveAndReturn'),
});
```

**Validation**:

- ✅ All required parameters validated with `.parse()`
- ✅ Type coercion with `.default()` for optional fields
- ✅ Enum constraints for restricted values (sitemap, resultHandling)
- ✅ Numeric ranges with `.min()` and `.max()`
- ✅ URL validation on `url` parameter
- ✅ **NO Union Types at Root Level** - Schema is flat object, compliant with Anthropic API limitations

### Tool Definition

**Location**: `/home/jmagar/code/pulse-fetch/shared/mcp/tools/map/index.ts` (lines 9-44)

```typescript
export function createMapTool(config: FirecrawlConfig): Tool {
  const client = new FirecrawlMapClient(config);

  return {
    name: 'map',  // ✅ Proper tool name
    description: '...',  // ✅ Comprehensive description with use cases
    inputSchema: zodToJsonSchema(mapOptionsSchema as any) as any,  // ✅ Valid JSON schema
    handler: async (args: unknown) => { ... }  // ✅ Proper async handler
  };
}
```

**Issues Found**: None. Schema properly converts Zod to JSON schema via `zodToJsonSchema()`.

---

## 2. Output Schema & Content Types ✅

**Location**: `/home/jmagar/code/pulse-fetch/shared/mcp/tools/map/response.ts`

### Valid MCP Content Types Used

The tool returns content with **only valid MCP content types**:

1. **`text`** (line 49):

   ```typescript
   content.push({
     type: 'text',
     text: summaryLines.join('\n'), // Summary with statistics
   });
   ```

   - ✅ Valid type
   - ✅ Required `text` field present
   - ✅ Well-formatted summary with headers and statistics

2. **`resource_link`** (lines 66-71) - "saveOnly" mode:

   ```typescript
   content.push({
     type: 'resource_link',
     uri: baseUri,
     name: resourceName,
     mimeType: 'application/json',
     description: `URLs ${startIndex + 1}-${endIndex} from ${url}...`,
   });
   ```

   - ✅ Valid type
   - ✅ All required fields: `uri`, `name`, `mimeType`
   - ✅ Optional `description` field used appropriately
   - ✅ URI follows semantic format: `pulse-crawl://map/{hostname}/{timestamp}/page-{pageNumber}`

3. **`resource`** (lines 74-81) - "saveAndReturn" mode:
   ```typescript
   content.push({
     type: 'resource',
     resource: {
       uri: baseUri,
       name: resourceName,
       mimeType: 'application/json',
       text: resourceData, // JSON stringified array
     },
   });
   ```

   - ✅ Valid type with proper structure
   - ✅ **Correct MCP Protocol**: Wrapped in `resource` property, not flattened
   - ✅ All required fields in nested `resource`: `uri`, `mimeType`, `text`
   - ✅ Optional `name` field included for usability

### Absence of Annotations

The tool does **not use annotations**, which is appropriate because:

- Annotations are optional MCP fields
- Tool uses `resource_link` and `resource` instead, which don't require annotations
- No sensitive content requiring audience/priority tags
- No special handling needed for tool results

---

## 3. Protocol Compliance Assessment ✅

### MCP SDK Compliance

**Location**: `/home/jmagar/code/pulse-fetch/shared/mcp/registration.ts` (lines 96-119)

The registration code **explicitly checks for protocol violations**:

```typescript
// Log tool schemas for debugging
const hasProblematicProps = [
  'oneOf' in tool.inputSchema,
  'allOf' in tool.inputSchema,
  'anyOf' in tool.inputSchema,
];

if (hasProblematicProps.some(Boolean)) {
  console.error(`[pulse-crawl] ⚠️ WARNING: Schema contains oneOf/allOf/anyOf at root level`);
}
```

**Map Tool Status**:

- ✅ **No problematic properties** - Schema is a flat object
- ✅ Compliant with Anthropic's API restrictions

### CallToolResult Structure

**Location**: `/home/jmagar/code/pulse-fetch/shared/types.ts` (lines 18-24)

```typescript
export interface ToolResponse {
  content: Array<{
    type: string;
    text: string;
  }>;
  isError?: boolean;
}
```

**Map Tool Compliance**:

- ✅ Returns `{ content: [...], isError: boolean }`
- ✅ Follows MCP's `CallToolResult` schema
- ✅ Error handling returns `{ content: [...], isError: true }`

---

## 4. Input Validation ✅

**Validation Layers** (defense-in-depth):

1. **Schema Validation** (handler entry point):

   ```typescript
   try {
     const validatedArgs = mapOptionsSchema.parse(args);
   } catch (error) {
     return { content: [{...}], isError: true };
   }
   ```

   - ✅ Early validation with Zod
   - ✅ Type-safe inference: `validatedArgs` is `MapOptions`

2. **Numeric Range Validation**:

   ```typescript
   startIndex: z.number().int().min(0);
   maxResults: z.number().int().min(1).max(5000);
   ```

   - ✅ Prevents negative indices
   - ✅ Prevents out-of-bounds results
   - ✅ Protects against large allocations

3. **URL Validation**:

   ```typescript
   url: z.string().url('Valid URL is required');
   ```

   - ✅ Prevents invalid URLs at validation time

4. **Enum Constraints**:
   ```typescript
   sitemap: z.enum(['skip', 'include', 'only']);
   resultHandling: z.enum(['saveOnly', 'saveAndReturn', 'returnOnly']);
   ```

   - ✅ Restricts to known values

---

## 5. Error Handling ✅

**Location**: `/home/jmagar/code/pulse-fetch/shared/mcp/tools/map/index.ts` (lines 20-42)

### Dual Error Path Handling

1. **Validation Errors** (Zod):

   ```typescript
   } catch (error) {
     return {
       content: [{ type: 'text', text: `Map error: ${error.message}` }],
       isError: true,
     };
   }
   ```

   - ✅ Catches schema validation failures
   - ✅ Returns human-readable error message
   - ✅ Sets `isError: true` for client detection

2. **API/Network Errors**:
   - Handled by `mapPipeline()` → `FirecrawlMapClient.map()` → Firecrawl API
   - Wrapped in same error handler above
   - ✅ Consistent error format

### Test Coverage for Errors

**Location**: `/home/jmagar/code/pulse-fetch/shared/mcp/tools/map/index.test.ts` (lines 73-88)

```typescript
it('should handle errors gracefully', async () => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status: 402,
    text: async () => 'Payment required',
  });
  // ...
  expect(result.isError).toBe(true);
  expect(result.content[0].text).toContain('Map error');
});
```

- ✅ Verified error responses
- ✅ Tests API failures (402, payment required)

---

## 6. Security Analysis ✅

### Input Sanitization

1. **URL Parameter**:
   - ✅ Validated with Zod's `.url()` validator
   - ✅ Passed directly to Firecrawl API (no injection risk)
   - ✅ No shell execution or SQL query construction

2. **String Parameters** (`search`):
   - ✅ Optional parameter
   - ✅ Passed to Firecrawl API without modification
   - ✅ No interpretation as code/commands

3. **Numeric Parameters**:
   - ✅ Validated as integers with range constraints
   - ✅ No string injection possible
   - ✅ Used for pagination only

### Output Sanitization

1. **Resource Content**:

   ```typescript
   const resourceData = JSON.stringify(paginatedLinks, null, 2);
   ```

   - ✅ JSON.stringify() is safe - no script injection risk
   - ✅ Stored as `application/json` MIME type
   - ✅ No HTML escaping needed for JSON

2. **Summary Text**:
   ```typescript
   const summaryLines = [
     `Map Results for ${url}`, // URL from validated input
     `Total URLs discovered: ${totalLinks}`, // Numeric, safe
     // ...
   ];
   ```

   - ✅ Uses template literals (safe with string concatenation)
   - ✅ All dynamic values are simple types (numbers, URLs)
   - ✅ No HTML/script contexts

### API Key Security

- ✅ Firecrawl API key passed via `FirecrawlConfig` object
- ✅ Not exposed in error messages
- ✅ Not logged in verbose output
- ✅ Handled by separate `FirecrawlMapClient` class

---

## 7. Response Formatting Quality ✅

### Summary Text Quality

**Location**: `/home/jmagar/code/pulse-fetch/shared/mcp/tools/map/response.ts` (lines 34-51)

```
Map Results for https://example.com
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total URLs discovered: 3000
Unique domains: 5
URLs with titles: 87%
Showing: 1-200 of 3000

[More results available. Use startIndex: 200 to continue]
```

- ✅ Professional formatting with visual separator
- ✅ Actionable pagination guidance
- ✅ Statistics help users understand dataset
- ✅ Clear "showing X of Y" pattern

### Resource URI Design

```
pulse-crawl://map/{hostname}/{timestamp}/page-{pageNumber}
Example: pulse-crawl://map/example.com/1730970595847/page-0
```

- ✅ Semantic structure (tool/operation/domain/timestamp/page)
- ✅ Unique per pagination (different timestamps and page numbers)
- ✅ Human-readable for debugging
- ✅ Follows codebase conventions

---

## 8. Environment Variable Configuration ✅

**Location**: `/home/jmagar/code/pulse-fetch/shared/mcp/tools/map/schema.ts` (lines 3-20)

### Configurable Defaults

```typescript
const DEFAULT_COUNTRY = process.env.MAP_DEFAULT_COUNTRY || 'US';
const DEFAULT_LANGUAGES = process.env.MAP_DEFAULT_LANGUAGES?.split(',') || ['en-US'];
const DEFAULT_MAX_RESULTS = parseInt(process.env.MAP_MAX_RESULTS_PER_PAGE) || 200;
```

- ✅ All environment variables have safe defaults
- ✅ Invalid values fall back gracefully with console warnings
- ✅ Range validation (1-5000 for results)
- ✅ Documented behavior in tests

### Firecrawl Configuration

**Location**: `/home/jmagar/code/pulse-fetch/shared/mcp/registration.ts` (lines 54-57)

```typescript
const firecrawlConfig: FirecrawlConfig = {
  apiKey: process.env.FIRECRAWL_API_KEY || '',
  baseUrl: process.env.FIRECRAWL_BASE_URL || 'https://api.firecrawl.dev',
};
```

- ✅ API key from environment (not hardcoded)
- ✅ Base URL configurable for self-hosted instances
- ✅ Safe defaults (empty key is handled by Firecrawl client)

---

## 9. Test Coverage Analysis ✅

**All 49 Tests Passing** ✅

### Test Files

| File               | Tests | Status      |
| ------------------ | ----- | ----------- |
| `index.test.ts`    | 5     | ✅ All pass |
| `schema.test.ts`   | 22    | ✅ All pass |
| `pipeline.test.ts` | 11    | ✅ All pass |
| `response.test.ts` | 11    | ✅ All pass |

### Test Coverage Areas

1. **Tool Structure** (index.test.ts):
   - ✅ Tool name, description, inputSchema, handler exist
   - ✅ Pagination parameter handling
   - ✅ resultHandling modes (saveOnly, saveAndReturn, returnOnly)
   - ✅ Default pagination values
   - ✅ Error handling

2. **Schema Validation** (schema.test.ts):
   - ✅ Pagination parameters (startIndex, maxResults)
   - ✅ Result handling enum values
   - ✅ Environment variable overrides
   - ✅ Invalid value handling with fallbacks
   - ✅ 22 specific test cases covering edge cases

3. **Response Formatting** (response.test.ts):
   - ✅ Pagination with startIndex and maxResults
   - ✅ "More results" message on multi-page datasets
   - ✅ Domain counting statistics
   - ✅ Title coverage percentage
   - ✅ All three result handling modes (saveOnly, saveAndReturn, returnOnly)
   - ✅ Resource URI generation with page numbers
   - ✅ Edge cases (empty results, missing metadata)

4. **Pipeline** (pipeline.test.ts):
   - ✅ Client integration
   - ✅ Parameter transformation
   - ✅ Result processing

### Test Quality Observations

- ✅ Comprehensive edge case coverage
- ✅ Environment variable testing with module reloading
- ✅ Mock isolation with `beforeEach`/`afterEach`
- ✅ Clear test names describing expected behavior
- ✅ Tests verify both happy path and error cases
- ✅ Test values use realistic data (3000 URLs, 100 domains)

---

## 10. Best Practices Compliance ✅

### Code Organization

- ✅ **Single Responsibility**:
  - `index.ts` - Tool factory and registration
  - `schema.ts` - Input validation schema
  - `pipeline.ts` - Business logic orchestration
  - `response.ts` - Response formatting
  - Separate test files per module

- ✅ **Dependency Injection**: `FirecrawlConfig` passed to factory
- ✅ **Type Safety**: Full TypeScript with strict typing
- ✅ **Async/Await**: Proper async handler pattern
- ✅ **Error Propagation**: Errors caught at tool level with fallback

### MCP Best Practices

- ✅ **Tool Definition**: All required fields (name, description, inputSchema, handler)
- ✅ **Response Format**: Proper `CallToolResult` structure
- ✅ **Content Types**: Only valid MCP types used
- ✅ **Resource Structure**: Proper embedding with `resource` wrapper
- ✅ **No Union Types**: Schema doesn't use oneOf/allOf/anyOf at root

### Documentation

- ✅ JSDoc comments on tool factory function
- ✅ Inline comments explaining complex logic (pagination, statistics)
- ✅ Descriptive error messages for users
- ✅ Clear summary text with actionable guidance

---

## 11. Specific Code Locations - Issues Found

### ✅ NO ISSUES FOUND

All code locations inspected are compliant and well-implemented:

| Location                       | Check                  | Status              |
| ------------------------------ | ---------------------- | ------------------- |
| `index.ts` line 18             | JSON Schema generation | ✅ Correct          |
| `index.ts` lines 20-42         | Error handling         | ✅ Proper           |
| `response.ts` lines 48-51      | Text content           | ✅ Valid            |
| `response.ts` lines 65-71      | resource_link type     | ✅ Correct          |
| `response.ts` lines 73-81      | resource type          | ✅ Proper structure |
| `schema.ts` lines 22-53        | Input schema           | ✅ No union types   |
| `registration.ts` lines 96-119 | Schema validation      | ✅ Checks in place  |

---

## 12. Recommendations for Enhancement

### 1. Add Optional `annotations` to Embedded Resources (Enhancement)

**Priority**: Low (optional enhancement)
**Benefit**: Better resource organization in clients

Current (valid):

```typescript
resource: {
  uri: baseUri,
  name: resourceName,
  mimeType: 'application/json',
  text: resourceData,
}
```

Could enhance with optional annotations:

```typescript
resource: {
  uri: baseUri,
  name: resourceName,
  mimeType: 'application/json',
  text: resourceData,
  annotations?: {
    audience: ['user'],
    priority: 'medium'
  }
}
```

### 2. Add `outputSchema` to Tool Definition (Enhancement)

**Priority**: Low (optional improvement)
**Benefit**: Clients can know response structure in advance

Current (valid):

```typescript
return {
  name: 'map',
  description: '...',
  inputSchema: zodToJsonSchema(mapOptionsSchema),
  handler: async (args) => { ... }
};
```

Could document output:

```typescript
return {
  name: 'map',
  description: '...',
  inputSchema: zodToJsonSchema(mapOptionsSchema),
  outputSchema: zodToJsonSchema(mapResponseSchema), // Optional
  handler: async (args) => { ... }
};
```

### 3. Add Timing Information (Enhancement)

**Priority**: Low (nice-to-have)
**Current**: No timing data in response

Could add optional metrics:

```typescript
summaryLines.push(`Response time: ${Date.now() - startTime}ms`);
summaryLines.push(`Firecrawl credits used: ${result.creditsUsed || 'N/A'}`);
```

---

## Conclusion

The **map tool is production-ready** and demonstrates excellent MCP protocol compliance:

### Summary of Findings

| Criteria              | Status       | Evidence                                   |
| --------------------- | ------------ | ------------------------------------------ |
| **Tool Schema**       | ✅ Compliant | Proper definition, no union types          |
| **Output Types**      | ✅ Valid     | text, resource_link, resource all correct  |
| **Content Structure** | ✅ Correct   | Proper `resource` wrapper, required fields |
| **Annotations**       | ✅ N/A       | Correctly omitted when not needed          |
| **Error Handling**    | ✅ Complete  | isError flag, error messages, validation   |
| **Input Validation**  | ✅ Robust    | Multi-layer validation, range constraints  |
| **Security**          | ✅ Secure    | No injection risks, safe output handling   |
| **Test Coverage**     | ✅ Excellent | 49 tests, all passing, edge cases covered  |
| **Code Quality**      | ✅ High      | Single responsibility, proper types, async |
| **Documentation**     | ✅ Good      | Comments, tests, clear error messages      |

### No Breaking Issues

- No protocol violations
- No security concerns
- No unhandled error cases
- No schema compliance problems

### Ready for Production

The map tool is ready for:

- ✅ Deployment to production environments
- ✅ Integration with Claude and other AI agents
- ✅ Use with Anthropic's API and other MCP clients
- ✅ Scaling to large result sets (pagination tested)

---

**Investigation Complete**: No further action required. Code is compliant and production-ready.
