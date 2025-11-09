# End-to-End Tests

This directory contains comprehensive end-to-end tests for the pulse MCP server, covering both stdio and HTTP transports.

## Test Files

### HTTP Transport E2E Tests

- **`http-transport-e2e.test.ts`**: Complete MCP protocol flow over HTTP
  - Session initialization and handshake
  - Tool listing and execution
  - Resource management
  - Error handling
  - Session isolation
  - Protocol compliance
  - Performance benchmarks

- **`sse-streaming-e2e.test.ts`**: Server-Sent Events streaming
  - SSE stream establishment
  - Message delivery
  - Reconnection and resumability
  - Connection lifecycle
  - Protocol compliance

## Running E2E Tests

### Prerequisites

Make sure all dependencies are installed:

```bash
npm install
```

### Run All E2E Tests

```bash
npm run test:e2e
```

### Run Specific Test File

```bash
# HTTP transport tests
npx vitest tests/e2e/http-transport-e2e.test.ts

# SSE streaming tests
npx vitest tests/e2e/sse-streaming-e2e.test.ts
```

### Run with Coverage

```bash
npx vitest tests/e2e --coverage
```

## Test Environment

E2E tests automatically:

- Start a test HTTP server on a random port
- Set `NODE_ENV=test`
- Skip health checks (`SKIP_HEALTH_CHECKS=true`)
- Configure appropriate test environment variables
- Clean up server and resources after tests

## Test Scenarios

### Complete MCP Session Flow

1. Initialize connection with protocol handshake
2. List available tools, resources, and prompts
3. Execute tools with various parameters
4. Read and manage resources
5. Handle concurrent requests
6. Validate protocol compliance

### SSE Streaming

1. Establish SSE connection with valid session
2. Receive server-initiated messages
3. Test reconnection with Last-Event-ID
4. Handle connection lifecycle events
5. Verify protocol headers and compliance

### Error Handling

1. Invalid session IDs
2. Malformed requests
3. Invalid tool names
4. Invalid parameters
5. Network errors

### Performance

1. Sequential request handling
2. Parallel request processing
3. Connection pooling
4. Resource cleanup

## Expected Behavior

### Successful Tests

- All tests should pass without errors
- Server should start and stop cleanly
- No memory leaks or resource leaks
- Response times should be reasonable

### Test Timing

- Most tests complete in < 1 second
- Tool execution tests allow up to 30 seconds (network requests)
- SSE tests allow up to 5 seconds for connection establishment
- Performance tests benchmark but don't fail on timing

## Debugging Tests

### Enable Verbose Logging

```bash
DEBUG=* npx vitest tests/e2e
```

### Run Single Test

```bash
npx vitest tests/e2e/http-transport-e2e.test.ts -t "should complete full initialization"
```

### Keep Server Running

Modify the test to add a delay before cleanup:

```typescript
afterAll(async () => {
  await new Promise((resolve) => setTimeout(resolve, 60000)); // Wait 1 minute
  // ... cleanup
});
```

## CI/CD Integration

These tests are designed to run in CI environments:

```yaml
# .github/workflows/test.yml
- name: Run E2E Tests
  run: npm run test:e2e
  env:
    NODE_ENV: test
    SKIP_HEALTH_CHECKS: true
```

## Common Issues

### Port Already in Use

E2E tests use random ports, but if you see port conflicts:

- Stop any running pulse servers
- Check for orphaned processes: `ps aux | grep node`

### Test Timeouts

If tests timeout:

- Check network connectivity
- Increase timeout values in vitest.config.ts
- Verify server starts correctly

### Session ID Issues

If session management fails:

- Check that ENABLE_RESUMABILITY is set correctly
- Verify session IDs are being generated
- Check server logs for errors

## Writing New E2E Tests

Follow this pattern:

```typescript
describe('New Feature E2E', () => {
  // Use shared server setup
  let sessionId: string;

  beforeAll(async () => {
    // Initialize session
  });

  it('should do something end-to-end', async () => {
    // 1. Make request
    // 2. Verify response
    // 3. Check side effects
    // 4. Validate state
  });
});
```

## Test Coverage Goals

- **Protocol Coverage**: All MCP methods tested
- **Tool Coverage**: All tools executed at least once
- **Error Coverage**: All error paths tested
- **Integration Coverage**: Real network requests, not mocked
- **Performance Coverage**: Basic benchmarks for regressions
