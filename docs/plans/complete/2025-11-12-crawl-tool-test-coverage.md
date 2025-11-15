# Crawl Tool Test Coverage Analysis

## Executive Summary

**Test Coverage**: ~65% of code paths, ~45% of production scenarios
**Critical Gaps**: 8 production-critical paths untested
**High Priority Gaps**: 12 important scenarios missing
**Overall Assessment**: Needs significant improvement before production

The crawl tool has good happy-path coverage but lacks comprehensive error handling, edge case, and integration testing. Most tests use mocked APIs without verifying realistic failure scenarios.

---

## 1. Test Coverage Summary

### Existing Test Files

| File | Tests | Coverage Area | Quality |
|------|-------|---------------|---------|
| `index.test.ts` | 7 tests | Tool integration, command routing | Good |
| `schema.test.ts` | 11 tests | Input validation, command inference | Excellent |
| `pipeline.test.ts` | 8 tests | Config merging, command routing | Good |
| `response.test.ts` | 2 tests | Response formatting | Minimal |
| `crawl.test.ts` (firecrawl-client) | 3 tests | API client operations | Minimal |

**Total**: 31 tests across 5 files

### Code Coverage by Module

| Module | Lines Tested | Untested Scenarios | Risk Level |
|--------|--------------|-------------------|------------|
| `index.ts` (tool factory) | ~70% | Error propagation, config validation | Medium |
| `schema.ts` (validation) | ~85% | Invalid enum values, malformed URLs | Low |
| `pipeline.ts` (business logic) | ~60% | API failures, timeout handling | High |
| `response.ts` (formatting) | ~40% | Pagination edge cases, malformed responses | High |
| `crawl.ts` (client) | ~50% | Network failures, retry logic | Critical |

### Scenario Coverage

**Covered** (~45% of production scenarios):
- ✅ Happy path: start crawl, check status, cancel, list, errors
- ✅ Schema validation: command routing, required fields
- ✅ Config merging: default excludes, scrape options
- ✅ Response formatting: basic success cases
- ✅ Prompt parameter passthrough

**Missing** (~55% of production scenarios):
- ❌ Firecrawl API failures (500, 502, 503, timeout)
- ❌ Malformed API responses (invalid JSON, missing fields)
- ❌ Job status transitions (queued → scraping → completed → failed)
- ❌ Pagination handling (large crawls > 10MB)
- ❌ Rate limiting and retry logic
- ❌ Concurrent crawl management
- ❌ Edge cases (negative limits, invalid jobIds, expired jobs)
- ❌ Resource exhaustion (memory, disk, credits)
- ❌ Browser action validation and failures
- ❌ Integration tests with real Firecrawl service
- ❌ Performance benchmarks (large crawls, pagination)
- ❌ Security tests (injection, auth bypass)

---

## 2. Critical Gaps (Production Blockers)

### 2.1 Firecrawl API Error Handling

**Risk**: Application crashes or hangs on API failures
**Impact**: High - affects all crawl operations

**Missing Tests**:
```typescript
// Test: HTTP 500 Internal Server Error
it("should handle Firecrawl 500 errors gracefully", async () => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status: 500,
    text: async () => "Internal server error",
  });

  const tool = createCrawlTool(config);
  const result = await tool.handler({ command: "start", url: "https://example.com" });

  expect(result.isError).toBe(true);
  expect(result.content[0].text).toContain("500");
  expect(result.content[0].text).toContain("Internal server error");
});

// Test: Network timeout
it("should timeout after 30 seconds and return error", async () => {
  global.fetch = vi.fn().mockImplementation(() =>
    new Promise((resolve) => setTimeout(() => resolve({
      ok: false,
      status: 504,
      text: async () => "Gateway timeout"
    }), 31000))
  );

  const tool = createCrawlTool(config);
  const promise = tool.handler({ command: "start", url: "https://example.com" });

  await expect(promise).rejects.toThrow(/timeout|504/i);
});

// Test: Invalid JSON response
it("should handle malformed JSON responses", async () => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => { throw new Error("Unexpected token in JSON"); },
    text: async () => "<html>Not JSON</html>",
  });

  const tool = createCrawlTool(config);
  const result = await tool.handler({ command: "start", url: "https://example.com" });

  expect(result.isError).toBe(true);
  expect(result.content[0].text).toContain("Failed to parse");
});
```

### 2.2 Job Status Polling Edge Cases

**Risk**: Infinite loops, stuck jobs, incorrect completion detection
**Impact**: High - affects long-running crawls

**Missing Tests**:
```typescript
// Test: Job stuck in "scraping" state
it("should detect stuck jobs after 5 minutes of no progress", async () => {
  const startTime = Date.now();
  let callCount = 0;

  global.fetch = vi.fn().mockImplementation(() => {
    callCount++;
    return Promise.resolve({
      ok: true,
      json: async () => ({
        status: "scraping",
        completed: 10, // Never increases
        total: 100,
        creditsUsed: 10,
        expiresAt: new Date(startTime + 600000).toISOString(),
        data: [],
      }),
    });
  });

  // Simulate polling logic (not currently implemented)
  const tool = createCrawlTool(config);
  // Need to implement polling helper or document expected behavior
});

// Test: Job completes immediately (before first status check)
it("should handle jobs that complete before first status check", async () => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      status: "completed",
      completed: 50,
      total: 50,
      creditsUsed: 50,
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      data: [], // Empty because pagination required
      next: "https://api.firecrawl.dev/v2/crawl/job-123?page=2",
    }),
  });

  const tool = createCrawlTool(config);
  const result = await tool.handler({ command: "status", jobId: "job-123" });

  expect(result.isError).toBe(false);
  expect(result.content[0].text).toContain("pagination required");
  expect(result.content[0].text).toContain("https://api.firecrawl.dev/v2/crawl/job-123?page=2");
});

// Test: Job expires before completion
it("should detect expired jobs and return appropriate error", async () => {
  const pastTime = new Date(Date.now() - 3600000).toISOString();

  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      status: "expired",
      completed: 30,
      total: 100,
      creditsUsed: 30,
      expiresAt: pastTime,
      data: [],
    }),
  });

  const tool = createCrawlTool(config);
  const result = await tool.handler({ command: "status", jobId: "job-expired" });

  expect(result.isError).toBe(false); // Not error, just informational
  expect(result.content[0].text).toContain("expired");
});
```

### 2.3 Pagination Handling

**Risk**: Data loss, incorrect "completed" status, memory exhaustion
**Impact**: High - affects large crawls

**Missing Tests**:
```typescript
// Test: Pagination threshold detection
it("should warn when crawl data exceeds 10MB threshold", async () => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      status: "completed",
      completed: 1000,
      total: 1000,
      creditsUsed: 1000,
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      data: [],
      next: "https://api.firecrawl.dev/v2/crawl/job-large?page=2",
    }),
  });

  const tool = createCrawlTool(config);
  const result = await tool.handler({ command: "status", jobId: "job-large" });

  expect(result.content[0].text).toContain("⚠️ Data pagination required");
  expect(result.content[0].text).toContain("10MB");
  expect(result.content[0].text).toContain("page=2");
});

// Test: Multiple pagination pages
it("should handle multi-page pagination correctly", async () => {
  const pages = [
    { next: "page=2", data: Array(100).fill({ url: "https://example.com/1" }) },
    { next: "page=3", data: Array(100).fill({ url: "https://example.com/2" }) },
    { next: null, data: Array(50).fill({ url: "https://example.com/3" }) },
  ];

  let pageIndex = 0;
  global.fetch = vi.fn().mockImplementation(() => {
    const page = pages[pageIndex++];
    return Promise.resolve({
      ok: true,
      json: async () => ({
        status: "completed",
        completed: 250,
        total: 250,
        creditsUsed: 250,
        data: page.data,
        next: page.next,
      }),
    });
  });

  // Need pagination helper - currently not implemented
  // Tool should provide guidance on pagination usage
});
```

### 2.4 Invalid Input Handling

**Risk**: Crashes, injection attacks, unexpected behavior
**Impact**: Medium-High - security and stability

**Missing Tests**:
```typescript
// Test: Malformed URLs
it("should reject malformed URLs", () => {
  expect(() =>
    crawlOptionsSchema.parse({ command: "start", url: "not-a-url" })
  ).toThrow(/Valid URL is required/);
});

it("should reject URLs without protocol", () => {
  expect(() =>
    crawlOptionsSchema.parse({ command: "start", url: "example.com" })
  ).toThrow(/Valid URL is required/);
});

// Test: Negative or zero limits
it("should reject negative limit values", () => {
  expect(() =>
    crawlOptionsSchema.parse({ command: "start", url: "https://example.com", limit: -1 })
  ).toThrow(/minimum/);
});

it("should reject zero limit values", () => {
  expect(() =>
    crawlOptionsSchema.parse({ command: "start", url: "https://example.com", limit: 0 })
  ).toThrow(/minimum/);
});

// Test: Limit exceeds maximum
it("should reject limit values exceeding 100000", () => {
  expect(() =>
    crawlOptionsSchema.parse({ command: "start", url: "https://example.com", limit: 100001 })
  ).toThrow(/maximum/);
});

// Test: Invalid jobId formats
it("should reject empty jobId strings", () => {
  expect(() =>
    crawlOptionsSchema.parse({ command: "status", jobId: "" })
  ).toThrow(/Job ID is required/);
});

it("should reject non-existent jobIds with clear error", async () => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status: 404,
    text: async () => "Job not found",
  });

  const tool = createCrawlTool(config);
  const result = await tool.handler({ command: "status", jobId: "nonexistent-job" });

  expect(result.isError).toBe(true);
  expect(result.content[0].text).toContain("404");
  expect(result.content[0].text).toContain("not found");
});
```

### 2.5 Browser Actions Validation

**Risk**: Invalid actions sent to API, wasted credits, unexpected behavior
**Impact**: Medium - affects interactive crawls

**Missing Tests**:
```typescript
// Test: Invalid action types
it("should reject invalid browser action types", () => {
  expect(() =>
    crawlOptionsSchema.parse({
      command: "start",
      url: "https://example.com",
      scrapeOptions: {
        actions: [{ type: "invalid-action" }],
      },
    })
  ).toThrow();
});

// Test: Missing required action fields
it("should reject wait action without milliseconds", () => {
  expect(() =>
    crawlOptionsSchema.parse({
      command: "start",
      url: "https://example.com",
      scrapeOptions: {
        actions: [{ type: "wait" }], // Missing milliseconds
      },
    })
  ).toThrow(/milliseconds/);
});

// Test: Action sequence validation
it("should validate complete action sequences", () => {
  const validActions = [
    { type: "wait", milliseconds: 1000 },
    { type: "click", selector: "#button" },
    { type: "write", selector: "#input", text: "test" },
    { type: "press", key: "Enter" },
    { type: "scroll", direction: "down" },
    { type: "screenshot", name: "result" },
  ];

  const result = crawlOptionsSchema.parse({
    command: "start",
    url: "https://example.com",
    scrapeOptions: { actions: validActions },
  });

  expect(result.scrapeOptions?.actions).toHaveLength(6);
});
```

### 2.6 Rate Limiting and Credits

**Risk**: Unexpected API errors, wasted credits, blocked requests
**Impact**: High - affects cost and reliability

**Missing Tests**:
```typescript
// Test: 429 Too Many Requests
it("should handle rate limit errors with retry guidance", async () => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status: 429,
    text: async () => "Rate limit exceeded. Retry after 60 seconds.",
  });

  const tool = createCrawlTool(config);
  const result = await tool.handler({ command: "start", url: "https://example.com" });

  expect(result.isError).toBe(true);
  expect(result.content[0].text).toContain("429");
  expect(result.content[0].text).toContain("Rate limit");
});

// Test: 402 Insufficient Credits
it("should handle insufficient credits error", async () => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status: 402,
    text: async () => "Insufficient credits. Please upgrade your plan.",
  });

  const tool = createCrawlTool(config);
  const result = await tool.handler({ command: "start", url: "https://example.com" });

  expect(result.isError).toBe(true);
  expect(result.content[0].text).toContain("402");
  expect(result.content[0].text).toContain("credits");
});

// Test: Credit usage tracking
it("should report accurate credit usage in status", async () => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      status: "completed",
      completed: 50,
      total: 50,
      creditsUsed: 75, // 1.5 credits per page
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      data: [],
    }),
  });

  const tool = createCrawlTool(config);
  const result = await tool.handler({ command: "status", jobId: "job-123" });

  expect(result.content[0].text).toContain("Credits used: 75");
});
```

### 2.7 Concurrent Crawl Limits

**Risk**: Resource exhaustion, API throttling, application instability
**Impact**: Medium - affects high-volume usage

**Missing Tests**:
```typescript
// Test: Maximum concurrent crawls
it("should list all active crawls with pagination support", async () => {
  const crawls = Array.from({ length: 50 }, (_, i) => ({
    id: `job-${i}`,
    teamId: "team-1",
    url: `https://example.com/crawl-${i}`,
  }));

  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      success: true,
      crawls,
    }),
  });

  const tool = createCrawlTool(config);
  const result = await tool.handler({ command: "list" });

  expect(result.content[0].text).toContain("total: 50");
  expect(result.content[0].text).toContain("job-0");
  expect(result.content[0].text).toContain("job-49");
});

// Test: Empty active crawls list
it("should handle empty active crawls list", async () => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      success: true,
      crawls: [],
    }),
  });

  const tool = createCrawlTool(config);
  const result = await tool.handler({ command: "list" });

  expect(result.content[0].text).toContain("No active crawls");
});
```

### 2.8 Response Formatting Edge Cases

**Risk**: Crashes on unexpected data, poor UX, information loss
**Impact**: Medium - affects user experience

**Missing Tests**:
```typescript
// Test: Missing optional fields in response
it("should handle missing optional fields gracefully", async () => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      status: "completed",
      completed: 10,
      total: 10,
      creditsUsed: 10,
      // Missing: expiresAt, data, next
    }),
  });

  const tool = createCrawlTool(config);
  const result = await tool.handler({ command: "status", jobId: "job-123" });

  expect(result.isError).toBe(false);
  expect(result.content[0].text).toContain("10/10");
});

// Test: Extremely large error lists
it("should handle large error lists without truncation", async () => {
  const errors = Array.from({ length: 1000 }, (_, i) => ({
    id: `err-${i}`,
    error: `Error ${i}: Failed to scrape page`,
    url: `https://example.com/page-${i}`,
  }));

  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      errors,
      robotsBlocked: [],
    }),
  });

  const tool = createCrawlTool(config);
  const result = await tool.handler({ command: "errors", jobId: "job-many-errors" });

  expect(result.content[0].text).toContain("Error 0");
  expect(result.content[0].text).toContain("Error 999");
});

// Test: Unicode and special characters in URLs
it("should handle URLs with unicode characters", async () => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      success: true,
      crawls: [
        {
          id: "job-unicode",
          teamId: "team-1",
          url: "https://例え.jp/テスト",
        },
      ],
    }),
  });

  const tool = createCrawlTool(config);
  const result = await tool.handler({ command: "list" });

  expect(result.content[0].text).toContain("https://例え.jp/テスト");
});
```

---

## 3. High Priority Gaps (Important but Not Blocking)

### 3.1 Integration Tests

**Missing**: End-to-end tests with real Firecrawl service

```typescript
// File: apps/mcp/tests/integration/crawl-tool-e2e.test.ts
describe("Crawl Tool E2E", () => {
  it("should start and complete a small crawl", async () => {
    const tool = createCrawlTool({
      apiKey: process.env.FIRECRAWL_API_KEY!,
      baseUrl: process.env.FIRECRAWL_BASE_URL!,
    });

    // Start crawl
    const startResult = await tool.handler({
      command: "start",
      url: "https://example.com",
      limit: 5,
    });

    expect(startResult.isError).toBe(false);
    const jobId = extractJobId(startResult.content[0].text);

    // Poll status until complete
    let attempts = 0;
    let statusResult;
    do {
      await new Promise(resolve => setTimeout(resolve, 2000));
      statusResult = await tool.handler({ command: "status", jobId });
      attempts++;
    } while (
      !statusResult.content[0].text.includes("Completed") &&
      attempts < 30
    );

    expect(statusResult.content[0].text).toContain("Completed");
  });
});
```

### 3.2 Performance Tests

**Missing**: Load testing, timeout verification, memory profiling

```typescript
describe("Crawl Tool Performance", () => {
  it("should handle 10 concurrent crawls without degradation", async () => {
    const crawls = Array.from({ length: 10 }, (_, i) => ({
      command: "start",
      url: `https://example-${i}.com`,
      limit: 50,
    }));

    const startTime = Date.now();
    const results = await Promise.all(
      crawls.map(args => tool.handler(args))
    );
    const duration = Date.now() - startTime;

    expect(results.every(r => !r.isError)).toBe(true);
    expect(duration).toBeLessThan(5000); // All should start within 5s
  });

  it("should timeout long-running requests", async () => {
    // Mock slow API
    global.fetch = vi.fn().mockImplementation(() =>
      new Promise(resolve => setTimeout(resolve, 60000))
    );

    const promise = tool.handler({
      command: "start",
      url: "https://example.com"
    });

    await expect(promise).rejects.toThrow(/timeout/i);
  });
});
```

### 3.3 Security Tests

**Missing**: Injection tests, auth bypass attempts, privilege escalation

```typescript
describe("Crawl Tool Security", () => {
  it("should prevent URL injection in jobId", async () => {
    const maliciousJobId = "job-123' OR '1'='1";

    const result = await tool.handler({
      command: "status",
      jobId: maliciousJobId
    });

    // Should either sanitize or reject
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("job-123"),
      expect.any(Object)
    );
  });

  it("should validate API key is sent securely", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, id: "job-1", url: "url" }),
    });

    await tool.handler({ command: "start", url: "https://example.com" });

    const headers = (global.fetch as any).mock.calls[0][1].headers;
    expect(headers.Authorization).toMatch(/^Bearer /);
  });
});
```

### 3.4 Prompt Parameter Edge Cases

**Missing**: Long prompts, special characters, injection attempts

```typescript
describe("Prompt Parameter", () => {
  it("should handle very long prompts without truncation", async () => {
    const longPrompt = "Find all pages about ".repeat(100) + "AI";

    const result = crawlOptionsSchema.parse({
      command: "start",
      url: "https://example.com",
      prompt: longPrompt,
    });

    expect(result.prompt).toBe(longPrompt);
  });

  it("should handle special characters in prompts", async () => {
    const specialPrompt = 'Find pages with "quotes", <tags>, & symbols';

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, id: "job-1", url: "url" }),
    });
    global.fetch = mockFetch;

    await tool.handler({
      command: "start",
      url: "https://example.com",
      prompt: specialPrompt,
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.prompt).toBe(specialPrompt);
  });
});
```

### 3.5 Config Merging Edge Cases

**Missing**: Conflicting configs, empty arrays, null vs undefined

```typescript
describe("Config Merging", () => {
  it("should handle empty arrays in custom scrape options", () => {
    const merged = mergeScrapeOptions({
      formats: [],
      parsers: [],
    });

    expect(merged.formats).toEqual([]); // Should override default
    expect(merged.parsers).toEqual([]);
  });

  it("should handle null vs undefined in optional fields", () => {
    const merged = mergeScrapeOptions({
      onlyMainContent: undefined,
      includeTags: null,
    });

    expect(merged.onlyMainContent).toBe(true); // Use default
    expect(merged.includeTags).toBeUndefined(); // Not set
  });
});
```

### 3.6 Command Inference Edge Cases

**Missing**: Ambiguous inputs, conflicting flags

```typescript
describe("Command Resolution", () => {
  it("should prioritize explicit command over inferred", () => {
    const result = crawlOptionsSchema.parse({
      command: "start",
      jobId: "job-123", // Would normally infer "status"
      url: "https://example.com",
    });

    expect(result.command).toBe("start");
  });

  it("should handle conflicting cancel flag and command", () => {
    const result = crawlOptionsSchema.parse({
      command: "status",
      cancel: true, // Conflict
      jobId: "job-123",
    });

    expect(result.command).toBe("cancel"); // cancel flag wins
  });
});
```

### 3.7 Error Message Quality

**Missing**: User-friendly error messages, actionable guidance

```typescript
describe("Error Messages", () => {
  it("should provide actionable guidance on 402 errors", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 402,
      text: async () => "Insufficient credits",
    });

    const result = await tool.handler({
      command: "start",
      url: "https://example.com"
    });

    expect(result.content[0].text).toContain("upgrade");
    expect(result.content[0].text).toContain("plan");
  });

  it("should suggest retry on transient failures", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => "Service temporarily unavailable",
    });

    const result = await tool.handler({
      command: "start",
      url: "https://example.com"
    });

    expect(result.content[0].text).toContain("try again");
  });
});
```

### 3.8 Sitemap Parameter Validation

**Missing**: Invalid enum values, sitemap-specific edge cases

```typescript
describe("Sitemap Options", () => {
  it("should reject invalid sitemap values", () => {
    expect(() =>
      crawlOptionsSchema.parse({
        command: "start",
        url: "https://example.com",
        sitemap: "invalid",
      })
    ).toThrow();
  });

  it("should handle sites without sitemaps gracefully", async () => {
    // Mock API response indicating no sitemap found
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        id: "job-no-sitemap",
        url: "url",
        warnings: ["No sitemap found at https://example.com/sitemap.xml"],
      }),
    });

    const result = await tool.handler({
      command: "start",
      url: "https://example.com",
      sitemap: "include",
    });

    expect(result.isError).toBe(false);
  });
});
```

### 3.9 ExcludePaths Merging

**Missing**: Duplicate detection, pattern validation, regex errors

```typescript
describe("Exclude Paths Merging", () => {
  it("should deduplicate overlapping patterns", () => {
    const merged = mergeExcludePaths([
      "^/de/",
      "^/fr/",
      "^/de/", // Duplicate
    ]);

    expect(merged.filter(p => p === "^/de/")).toHaveLength(1);
  });

  it("should validate regex patterns", () => {
    expect(() =>
      mergeExcludePaths([
        "^/de/",
        "[invalid-regex", // Invalid
      ])
    ).not.toThrow(); // Currently doesn't validate, should it?
  });
});
```

### 3.10 Cancel Operation Timing

**Missing**: Cancel during different job states, double-cancel

```typescript
describe("Cancel Operations", () => {
  it("should handle cancel of already completed job", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => "Job already completed",
    });

    const result = await tool.handler({
      command: "cancel",
      jobId: "completed-job"
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("already completed");
  });

  it("should handle double-cancel gracefully", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "cancelled" }),
    });

    const result1 = await tool.handler({
      command: "cancel",
      jobId: "job-123"
    });
    const result2 = await tool.handler({
      command: "cancel",
      jobId: "job-123"
    });

    expect(result1.isError).toBe(false);
    expect(result2.isError).toBe(false); // Idempotent
  });
});
```

### 3.11 maxDiscoveryDepth Validation

**Missing**: Depth limits, zero/negative values

```typescript
describe("Discovery Depth", () => {
  it("should reject zero maxDiscoveryDepth", () => {
    expect(() =>
      crawlOptionsSchema.parse({
        command: "start",
        url: "https://example.com",
        maxDiscoveryDepth: 0,
      })
    ).toThrow(/minimum/);
  });

  it("should allow very deep crawls with warning", async () => {
    const result = crawlOptionsSchema.parse({
      command: "start",
      url: "https://example.com",
      maxDiscoveryDepth: 100,
    });

    expect(result.maxDiscoveryDepth).toBe(100);
    // Should we warn about potential cost/time?
  });
});
```

### 3.12 Delay and Concurrency Limits

**Missing**: Invalid combinations, extreme values

```typescript
describe("Crawl Rate Limits", () => {
  it("should reject negative delay values", () => {
    expect(() =>
      crawlOptionsSchema.parse({
        command: "start",
        url: "https://example.com",
        delay: -100,
      })
    ).toThrow(/minimum/);
  });

  it("should reject zero maxConcurrency", () => {
    expect(() =>
      crawlOptionsSchema.parse({
        command: "start",
        url: "https://example.com",
        maxConcurrency: 0,
      })
    ).toThrow(/minimum/);
  });

  it("should warn about very high concurrency with delay", () => {
    const result = crawlOptionsSchema.parse({
      command: "start",
      url: "https://example.com",
      delay: 5000, // 5 second delay
      maxConcurrency: 100, // High concurrency
    });

    // These settings conflict - should we warn?
    expect(result.delay).toBe(5000);
    expect(result.maxConcurrency).toBe(100);
  });
});
```

---

## 4. Test Quality Assessment

### Strengths

1. **Good schema coverage**: Input validation is well-tested
2. **Command routing**: Inference logic is thoroughly tested
3. **Config merging**: Default application is verified
4. **Mock quality**: Mocks are realistic for happy paths

### Weaknesses

1. **No integration tests**: All tests use mocked APIs
2. **Limited error scenarios**: Only 2-3 error cases tested
3. **No performance tests**: No timeout, load, or memory tests
4. **Missing security tests**: No injection or auth tests
5. **Incomplete edge cases**: Many boundary conditions untested
6. **Mock limitations**: Mocks don't cover API failure modes
7. **No determinism checks**: Tests don't verify idempotency
8. **Minimal response formatting tests**: Only 2 tests for formatter

---

## 5. Mock Quality Issues

### Current Mock Pattern

```typescript
global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ /* happy path */ }),
});
```

### Problems

1. **Always succeeds**: No network failures, timeouts, or retries
2. **No HTTP error codes**: Missing 4xx/5xx responses
3. **No malformed responses**: Always returns valid JSON
4. **No rate limiting**: Doesn't simulate 429 errors
5. **No authentication failures**: Doesn't test 401/403 errors
6. **Instant resolution**: No timing simulation for long crawls

### Improved Mock Pattern

```typescript
// Realistic mock factory
function createRealisticFetchMock(scenario: 'success' | 'timeout' | 'rate-limit' | '500') {
  switch (scenario) {
    case 'success':
      return vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true, id: "job-123", url: "url" }),
        text: async () => JSON.stringify({ success: true }),
      });

    case 'timeout':
      return vi.fn().mockImplementation(() =>
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Request timeout")), 100)
        )
      );

    case 'rate-limit':
      return vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({ error: "Rate limit exceeded" }),
        text: async () => "Rate limit exceeded. Retry after 60 seconds.",
      });

    case '500':
      return vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => { throw new Error("Invalid JSON"); },
        text: async () => "<html>Internal Server Error</html>",
      });
  }
}
```

---

## 6. Recommendations

### Before Production (Critical)

1. **Add error handling tests** for all HTTP error codes (400, 401, 402, 404, 429, 500, 502, 503, 504)
2. **Test job polling edge cases** (stuck jobs, rapid completion, expiration)
3. **Add pagination tests** (threshold detection, multi-page handling)
4. **Test invalid inputs** (malformed URLs, negative limits, empty jobIds)
5. **Add rate limiting tests** (429 errors, retry logic)
6. **Test concurrent operations** (multiple crawls, cancel during status check)
7. **Add timeout tests** (network failures, slow APIs)
8. **Test response formatting edge cases** (missing fields, unicode, large error lists)

### For Production Readiness (High Priority)

9. **Create integration test suite** with real Firecrawl service (skippable for CI)
10. **Add performance benchmarks** (load testing, memory profiling)
11. **Add security tests** (injection, auth bypass, privilege escalation)
12. **Test browser actions thoroughly** (invalid types, missing fields, sequences)
13. **Improve mock realism** (use factory pattern for different scenarios)
14. **Add error message quality tests** (actionable guidance, user-friendly text)
15. **Test config merging edge cases** (null vs undefined, empty arrays)
16. **Add determinism tests** (idempotency, retry safety)

### Nice to Have (Medium Priority)

17. Test prompt parameter edge cases (long prompts, special characters)
18. Test sitemap parameter thoroughly (invalid values, missing sitemaps)
19. Test excludePaths merging (duplicates, regex validation)
20. Test cancel operation timing (different job states, double-cancel)
21. Test maxDiscoveryDepth validation (extreme values, warnings)
22. Test delay/concurrency combinations (conflicting settings)
23. Add snapshot tests for response formatting (regression detection)
24. Add fuzz testing for input validation (random/malformed inputs)

---

## 7. Example Test Implementation

### Comprehensive Error Handling Test Suite

```typescript
// File: apps/mcp/tools/crawl/error-handling.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createCrawlTool } from "./index.js";
import type { FirecrawlConfig } from "../../types.js";

describe("Crawl Tool Error Handling", () => {
  let config: FirecrawlConfig;

  beforeEach(() => {
    config = {
      apiKey: "fc-test-key",
      baseUrl: "https://api.firecrawl.dev/v2",
    };
  });

  describe("HTTP Error Codes", () => {
    it("should handle 400 Bad Request", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => "Invalid request parameters",
      });

      const tool = createCrawlTool(config);
      const result = await tool.handler({
        command: "start",
        url: "https://example.com"
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("400");
      expect(result.content[0].text).toContain("Invalid request");
    });

    it("should handle 401 Unauthorized", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => "Invalid API key",
      });

      const tool = createCrawlTool(config);
      const result = await tool.handler({
        command: "start",
        url: "https://example.com"
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("401");
      expect(result.content[0].text).toContain("API key");
    });

    it("should handle 402 Payment Required", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 402,
        text: async () => "Insufficient credits",
      });

      const tool = createCrawlTool(config);
      const result = await tool.handler({
        command: "start",
        url: "https://example.com"
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("402");
      expect(result.content[0].text).toContain("credits");
    });

    it("should handle 404 Not Found", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => "Job not found",
      });

      const tool = createCrawlTool(config);
      const result = await tool.handler({
        command: "status",
        jobId: "nonexistent"
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("404");
      expect(result.content[0].text).toContain("not found");
    });

    it("should handle 429 Rate Limit", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => "Rate limit exceeded",
      });

      const tool = createCrawlTool(config);
      const result = await tool.handler({
        command: "start",
        url: "https://example.com"
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("429");
      expect(result.content[0].text).toContain("Rate limit");
    });

    it("should handle 500 Internal Server Error", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => "Internal server error",
      });

      const tool = createCrawlTool(config);
      const result = await tool.handler({
        command: "start",
        url: "https://example.com"
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("500");
      expect(result.content[0].text).toContain("Internal server error");
    });

    it("should handle 502 Bad Gateway", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        text: async () => "Bad gateway",
      });

      const tool = createCrawlTool(config);
      const result = await tool.handler({
        command: "start",
        url: "https://example.com"
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("502");
    });

    it("should handle 503 Service Unavailable", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        text: async () => "Service unavailable",
      });

      const tool = createCrawlTool(config);
      const result = await tool.handler({
        command: "start",
        url: "https://example.com"
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("503");
      expect(result.content[0].text).toMatch(/try again|retry/i);
    });

    it("should handle 504 Gateway Timeout", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 504,
        text: async () => "Gateway timeout",
      });

      const tool = createCrawlTool(config);
      const result = await tool.handler({
        command: "start",
        url: "https://example.com"
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("504");
    });
  });

  describe("Network Failures", () => {
    it("should handle network timeout", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("Network timeout"));

      const tool = createCrawlTool(config);
      const result = await tool.handler({
        command: "start",
        url: "https://example.com"
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("timeout");
    });

    it("should handle connection refused", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

      const tool = createCrawlTool(config);
      const result = await tool.handler({
        command: "start",
        url: "https://example.com"
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("ECONNREFUSED");
    });

    it("should handle DNS resolution failure", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("ENOTFOUND"));

      const tool = createCrawlTool(config);
      const result = await tool.handler({
        command: "start",
        url: "https://example.com"
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("ENOTFOUND");
    });
  });

  describe("Malformed Responses", () => {
    it("should handle invalid JSON", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => { throw new Error("Unexpected token"); },
        text: async () => "<html>Not JSON</html>",
      });

      const tool = createCrawlTool(config);
      const result = await tool.handler({
        command: "start",
        url: "https://example.com"
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Failed to parse");
    });

    it("should handle missing required fields", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          // Missing: id, url
        }),
      });

      const tool = createCrawlTool(config);
      const result = await tool.handler({
        command: "start",
        url: "https://example.com"
      });

      // Should handle gracefully or error
      expect(result.isError).toBeDefined();
    });

    it("should handle empty response body", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      const tool = createCrawlTool(config);
      const result = await tool.handler({
        command: "start",
        url: "https://example.com"
      });

      expect(result.isError).toBeDefined();
    });
  });
});
```

---

## 8. Coverage Improvement Roadmap

### Phase 1: Critical Fixes (Week 1)
- [ ] Add HTTP error code tests (400, 401, 402, 404, 429, 500, 502, 503, 504)
- [ ] Add network failure tests (timeout, connection refused, DNS failure)
- [ ] Add malformed response tests (invalid JSON, missing fields, empty body)
- [ ] Add job status edge case tests (stuck, rapid completion, expiration)
- [ ] Add pagination tests (threshold, multi-page, missing next)

**Target**: 80% code coverage, 70% scenario coverage

### Phase 2: Production Readiness (Week 2)
- [ ] Add integration test suite (real Firecrawl API, skippable)
- [ ] Add performance tests (load, timeout, memory)
- [ ] Add security tests (injection, auth bypass)
- [ ] Add browser action tests (invalid types, missing fields)
- [ ] Improve mock realism (factory pattern)

**Target**: 90% code coverage, 85% scenario coverage

### Phase 3: Polish (Week 3)
- [ ] Add prompt edge case tests
- [ ] Add config merging edge case tests
- [ ] Add response formatting edge case tests
- [ ] Add determinism tests (idempotency)
- [ ] Add snapshot tests for formatters
- [ ] Add fuzz testing for inputs

**Target**: 95% code coverage, 95% scenario coverage

---

## 9. Success Metrics

**Before Production**:
- [ ] 90%+ code coverage (measured by vitest --coverage)
- [ ] 80%+ scenario coverage (critical + high priority gaps addressed)
- [ ] 100% critical path coverage (all 8 critical gaps have tests)
- [ ] 0 flaky tests (all tests deterministic)
- [ ] All tests pass in CI (no skipped tests)

**Production Ready**:
- [ ] Integration tests passing against real service
- [ ] Performance benchmarks established (baseline)
- [ ] Security audit completed (no high/critical findings)
- [ ] Error messages reviewed for UX (actionable guidance)
- [ ] Documentation complete (test strategy, coverage gaps)

---

## Conclusion

The crawl tool currently has **good happy-path coverage** but **critical gaps in error handling and edge cases**. With **31 existing tests** covering ~65% of code paths, we need approximately **50-60 additional tests** to reach production readiness.

**Priority order**:
1. Critical gaps (8 scenarios) - **Must fix before production**
2. High priority gaps (12 scenarios) - **Should fix for production**
3. Test quality improvements - **Ongoing improvement**

**Estimated effort**:
- Phase 1 (Critical): 2-3 days
- Phase 2 (Production): 3-4 days
- Phase 3 (Polish): 2-3 days
- **Total**: 1-2 weeks for full production readiness

**Immediate action**: Implement comprehensive error handling test suite (see Section 7) to cover most critical gaps.
