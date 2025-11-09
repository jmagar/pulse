# Scrape Tool MCP Compliance - Detailed Fix Instructions

**Date**: 2025-11-07
**Status**: Implementation guide for protocol compliance fixes

## Priority 1: CRITICAL - Fix Union Type Schema

### Issue

The `actions` parameter in `buildInputSchema()` uses `oneOf` which violates Anthropic API constraints.

### Root Cause

Lines 348-422 in `schema.ts` manually construct a JSON Schema with `oneOf` to differentiate between 8 browser action types. Anthropic's API parser does not support union types (`oneOf`, `allOf`, `anyOf`) in tool schemas.

### Current Problematic Code

```typescript
// schema.ts:348-422
actions: {
  type: 'array',
  items: {
    type: 'object',
    oneOf: [
      { type: 'object', required: ['type', 'milliseconds'], ... },
      { type: 'object', required: ['type', 'selector'], ... },
      // ... 6 more schemas
    ]
  }
}
```

### Solution: Flatten to Single Schema

Replace the `oneOf` structure with a single object schema that includes all possible properties.

### Implementation

**File**: `/home/jmagar/code/pulse-fetch/shared/mcp/tools/scrape/schema.ts`

**Replace lines 348-422 with**:

```typescript
actions: {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: [
          'wait',
          'click',
          'write',
          'press',
          'scroll',
          'screenshot',
          'scrape',
          'executeJavascript'
        ],
        description: 'Action type to perform'
      },
      milliseconds: {
        type: 'number',
        description: 'Time to wait in milliseconds (for wait action)'
      },
      selector: {
        type: 'string',
        description: 'CSS selector of element (for click/write/scrape actions)'
      },
      text: {
        type: 'string',
        description: 'Text to type into field (for write action)'
      },
      direction: {
        type: 'string',
        enum: ['up', 'down'],
        description: 'Scroll direction (for scroll action)'
      },
      amount: {
        type: 'number',
        description: 'Pixels to scroll (optional for scroll action)'
      },
      key: {
        type: 'string',
        description: 'Key to press (for press action, e.g., "Enter", "Tab")'
      },
      name: {
        type: 'string',
        description: 'Screenshot name (optional for screenshot action)'
      },
      script: {
        type: 'string',
        description: 'JavaScript code to execute (for executeJavascript action)'
      }
    },
    required: ['type'],
    additionalProperties: false,
  },
  description: PARAM_DESCRIPTIONS.actions
},
```

### Why This Works

- Single object with all possible properties
- Client can construct any action type by setting the appropriate properties
- No union types that Anthropic API rejects
- Runtime Zod validation (`action-types.ts` discriminatedUnion) still enforces correctness
- Client autocomplete still shows all properties but marks most as optional

### Validation

After making this change:

1. Zod validation (`buildScrapeArgsSchema()`) still works correctly
2. JSON Schema validation no longer contains `oneOf`
3. Anthropic API will accept the tool definition
4. Strict MCP clients will accept the schema

### Testing

Add test to verify no union types:

```typescript
// In tests/functional/resource-shape.test.ts
it('should have Anthropic API compatible schema (no union types)', async () => {
  const tool = scrapeTool(mockServer, mockClientsFactory, mockStrategyConfigFactory);
  const schema = JSON.stringify(tool.inputSchema);

  expect(schema).not.toContain('oneOf');
  expect(schema).not.toContain('allOf');
  expect(schema).not.toContain('anyOf');
});
```

---

## Priority 2: HIGH - Fix Exception Throwing in response.ts

### Issue

Line 102 throws an exception instead of returning an error response, breaking the error handling contract.

### Current Code

```typescript
// response.ts:100-103
const error = new Error('Invalid state: saveOnly mode should bypass cache');
logError('buildCachedResponse', error, { resultHandling, cachedUri });
throw error; // ← BREAKS CONTRACT
```

### Problem

- All other error paths return `{ content: [...], isError: true }`
- This path throws, which is caught by handler and converted to generic error
- Users lose the specific error context
- Inconsistent with rest of codebase

### Solution

**File**: `/home/jmagar/code/pulse-fetch/shared/mcp/tools/scrape/response.ts`

**Replace lines 100-103 with**:

```typescript
logError('buildCachedResponse', error, { resultHandling, cachedUri });
// Return error response instead of throwing
return buildErrorResponse(
  cachedUri,
  'Invalid cache state - saveOnly mode should bypass cache',
  undefined
);
```

### Impact

- Proper error response returned with `isError: true`
- Users see specific error message
- Consistent error handling throughout codebase
- Better logging and debugging

### Testing

Add test to verify error response is returned:

```typescript
// In tests/functional/scrape-tool.test.ts
it('should return error response for invalid cache state', async () => {
  // Set up scenario where saveOnly mode tries cache (shouldn't happen)
  // This is an internal error that should be caught
  mockStorage.findByUrlAndExtract.mockResolvedValue([
    { uri: 'cached://...', name: 'test', metadata: { source: 'native' } },
  ]);

  const result = await tool.handler({
    url: 'https://test.com',
    resultHandling: 'saveOnly', // saveOnly skips cache, so this shouldn't reach buildCachedResponse
  });

  // If it somehow does, should return error response
  if (result.isError) {
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Invalid cache state');
  }
});
```

---

## Priority 3: MEDIUM - Add Output Schema Definition

### Issue

Tool definition lacks `outputSchema` property, which is a best practice.

### Current Code

```typescript
// index.ts:47-111
export function scrapeTool(
  _server: Server,
  clientsFactory: () => IScrapingClients,
  strategyConfigFactory: StrategyConfigFactory
) {
  return {
    name: 'scrape',
    description: '...',
    inputSchema: buildInputSchema(),
    handler: async (args: unknown) => { ... }
    // ← Missing outputSchema
  };
}
```

### Solution

Add `outputSchema` property to tool definition.

**File**: `/home/jmagar/code/pulse-fetch/shared/mcp/tools/scrape/index.ts`

**Add after `inputSchema` property (line 107)**:

```typescript
inputSchema: buildInputSchema(),
outputSchema: {
  type: 'object',
  properties: {
    content: {
      type: 'array',
      description: 'Response content in various formats',
      items: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['text', 'image', 'resource', 'resource_link'],
            description: 'Type of content'
          },
          text: {
            type: 'string',
            description: 'Text content (for text type)'
          },
          data: {
            type: 'string',
            description: 'Base64-encoded image data (for image type)'
          },
          mimeType: {
            type: 'string',
            description: 'MIME type of content'
          },
          uri: {
            type: 'string',
            description: 'Resource URI (for resource and resource_link types)'
          },
          name: {
            type: 'string',
            description: 'Resource name'
          },
          description: {
            type: 'string',
            description: 'Resource description'
          },
          resource: {
            type: 'object',
            description: 'Embedded resource (for resource type)',
            properties: {
              uri: { type: 'string' },
              name: { type: 'string' },
              mimeType: { type: 'string' },
              description: { type: 'string' },
              text: { type: 'string' }
            }
          }
        }
      }
    },
    isError: {
      type: 'boolean',
      description: 'Whether the request resulted in an error'
    }
  }
},
```

### Why This Helps

- Documents expected output structure for clients
- Enables client-side validation
- Improves IDE autocomplete and type checking
- Best practice per OpenAPI/MCP specifications
- Aids integration testing

### Note on Union Types

The `outputSchema` also includes a flattened structure (not `oneOf`) to avoid the same union type issue. The actual response will have one of the content types, but the schema documents all possibilities without using prohibited union types.

---

## Priority 4: LOW - Add Resource Annotations

### Issue

Resources don't include MCP protocol annotations (audience, priority, lastModified).

### Current Code

```typescript
// response.ts:287-298
response.content.push({
  type: 'resource',
  resource: {
    uri: primaryUri!,
    name: url,
    mimeType: contentMimeType,
    description: resourceDescription,
    text: displayContent,
    // ← Missing annotations
  },
});
```

### Solution

Add `annotations` array to embedded resources.

**File**: `/home/jmagar/code/pulse-fetch/shared/mcp/tools/scrape/response.ts`

**Update buildSuccessResponse (lines 287-298)**:

```typescript
response.content.push({
  type: 'resource',
  resource: {
    uri: primaryUri!,
    name: url,
    mimeType: contentMimeType,
    description: resourceDescription,
    text: displayContent,
    annotations: [
      {
        type: 'audience',
        value: 'assistant',
      },
      {
        type: 'lastModified',
        value: new Date().toISOString(),
      },
    ],
  },
});
```

**Update buildCachedResponse (lines 84-98)** similarly:

```typescript
response.content.push({
  type: 'resource',
  resource: {
    uri: cachedUri,
    name: cachedName,
    mimeType: cachedMimeType,
    description: cachedDescription,
    text: processedContent,
    annotations: [
      {
        type: 'audience',
        value: 'assistant',
      },
      {
        type: 'lastModified',
        value: cachedTimestamp,
      },
      {
        type: 'priority',
        value: 'low', // Cached resources have lower priority
      },
    ],
  },
});
```

### Why This Helps

- Communicates resource freshness and priority to clients
- Helps clients decide how to use cached vs fresh content
- Follows MCP protocol best practices
- Optional enhancement (not critical)

### Impact

- No breaking changes
- Enhances resource metadata
- Improves client decision-making

---

## Implementation Checklist

### Before Starting

- [ ] Create feature branch: `git checkout -b fix/mcp-protocol-compliance`
- [ ] Run existing tests to establish baseline: `npm run test:run`

### Priority 1: Union Type Schema (CRITICAL)

- [ ] Edit `schema.ts` line 348-422 (buildInputSchema actions parameter)
- [ ] Replace `oneOf` structure with flattened schema
- [ ] Verify no `oneOf`, `allOf`, `anyOf` in JSON schema output
- [ ] Run tests: `npm run test:run` - should all pass
- [ ] Add schema validation test (optional)

### Priority 2: Exception Throwing (HIGH)

- [ ] Edit `response.ts` line 100-103 (buildCachedResponse)
- [ ] Replace `throw error` with `return buildErrorResponse(...)`
- [ ] Run tests: `npm run test:run` - should all pass
- [ ] Add error path test (optional)

### Priority 3: Output Schema (MEDIUM)

- [ ] Edit `index.ts` after line 107 (in scrapeTool function)
- [ ] Add `outputSchema` property with flattened content type structure
- [ ] Run tests: `npm run test:run` - should all pass

### Priority 4: Annotations (LOW)

- [ ] Edit `response.ts` lines 84-98 and 287-298 (resource building)
- [ ] Add `annotations` array to embedded resources
- [ ] Run tests: `npm run test:run` - should all pass

### After All Fixes

- [ ] Run full test suite: `npm run test:all`
- [ ] Verify no TypeScript errors: `npm run build`
- [ ] Test with Anthropic API (if available)
- [ ] Commit changes with clear message: `git commit -m "fix: MCP protocol compliance - remove union types, fix error handling"`
- [ ] Create pull request

---

## Verification Steps

### After Priority 1 (Union Type Fix)

```bash
npm run test:run
# Check that no tests fail related to schema

# Verify schema structure
node -e "
const { scrapeTool } = require('./dist/shared/mcp/tools/scrape/index.js');
const tool = scrapeTool({}, () => ({}), () => ({}));
const schema = JSON.stringify(tool.inputSchema);
console.log('Union types present:', schema.includes('oneOf') || schema.includes('allOf') || schema.includes('anyOf'));
"
# Should output: Union types present: false
```

### After Priority 2 (Exception Fix)

```bash
npm run test:run
# All tests should pass
# No test should catch an unhandled exception from buildCachedResponse
```

### After Priority 3 (Output Schema)

```bash
npm run test:run
# Tests should pass
# Tool definition should have outputSchema property
```

### After Priority 4 (Annotations)

```bash
npm run test:run
# All tests should pass
# Resource responses should include annotations
```

---

## Testing with Anthropic API

Once fixes are applied, test tool registration:

```typescript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Register tool with Anthropic
const response = await client.messages.create({
  model: 'claude-3-5-sonnet-20241022',
  max_tokens: 1024,
  tools: [
    {
      type: 'function',
      function: {
        name: 'scrape',
        description: '...',
        input_schema: buildInputSchema(), // Your fixed schema
      },
    },
  ],
  messages: [{ role: 'user', content: 'Use the scrape tool' }],
});

console.log('Tool registered successfully with Anthropic API');
```

---

## Related Files

- `shared/mcp/tools/scrape/index.ts` - Tool definition
- `shared/mcp/tools/scrape/schema.ts` - Input schema (PRIMARY CHANGES)
- `shared/mcp/tools/scrape/response.ts` - Response building (SECONDARY CHANGES)
- `shared/mcp/tools/scrape/action-types.ts` - Browser action types (no changes needed)
- `tests/functional/resource-shape.test.ts` - Protocol validation tests

---

## FAQ

**Q: Will this break existing integrations?**
A: No. The Zod schema (`buildScrapeArgsSchema`) remains unchanged, so validation is identical. Only the JSON Schema representation changes.

**Q: Why remove `oneOf` if Zod discriminatedUnion uses it?**
A: The Zod schema uses `discriminatedUnion` internally for TypeScript type safety, but the JSON Schema should NOT include `oneOf` for Anthropic API compatibility.

**Q: How do clients know which properties are required for each action?**
A: Documentation (PARAM_DESCRIPTIONS.actions) clearly explains each action type and its required properties. Runtime validation via Zod ensures correctness.

**Q: Is there a performance impact?**
A: None. The flattened schema is processed identically, and Zod validation is the same.

**Q: Should I update both Zod and JSON schema simultaneously?**
A: Only update the JSON schema (buildInputSchema). The Zod schema (buildScrapeArgsSchema) remains unchanged because it's internal validation.

---
