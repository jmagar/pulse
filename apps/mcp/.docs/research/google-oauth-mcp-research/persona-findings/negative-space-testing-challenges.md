# OAuth Testing Challenges in TypeScript MCP Servers

**Research Date**: 2025-11-06
**Persona**: The Negative Space Explorer
**Focus**: What makes OAuth testing hard and what's not discussed

---

## Executive Summary

OAuth integration testing is notoriously difficult because it involves external services, stateful flows, time-dependent tokens, and browser interactions. MCP servers add additional complexity with their transport-specific behaviors. Current documentation treats testing as an afterthought, leaving developers without guidance on mocking strategies, test isolation, or CI/CD integration.

---

## Gap #1: No Standard Mocking Strategy for OAuth Flows

### Description of the Gap

OAuth testing documentation typically shows one of two extremes:

1. **Full integration tests** that hit real OAuth providers (slow, flaky, requires real credentials)
2. **Complete mocks** that bypass all OAuth logic (fast but test nothing meaningful)

**What's missing**:

- Partial mocking strategies that test flow logic without external calls
- Reusable mock OAuth server implementations
- Test fixtures for different OAuth responses (success, failures, edge cases)
- Patterns for mocking token refresh behavior
- Guidance on what to mock vs what to integration test

### Why It's Overlooked

Testing is often considered "implementation detail" in tutorials. Developers are expected to figure out testing strategies on their own.

### Impact Assessment

**Severity**: HIGH

**Consequences**:

- Developers skip OAuth testing entirely (too hard)
- Tests that exist are brittle and flaky
- CI pipelines fail due to network issues or rate limits
- No confidence that OAuth integration actually works
- Bug discoveries happen in production

**Metrics**:

- Typical OAuth test coverage: <30% (vs >80% for non-auth code)
- Flaky test rate: 2-5x higher for OAuth tests
- Time to run full OAuth test suite: 5-10 minutes (vs seconds for mocked tests)

### Questions That Need Answering

1. Should OAuth flows be unit tested, integration tested, or both?
2. What's the right abstraction layer for mocking OAuth?
3. How do you test token refresh without waiting for expiration?
4. Can you reliably test OAuth in CI without real credentials?
5. What OAuth edge cases need explicit test coverage?

### Potential Workarounds

**Option A: Mock at HTTP Layer**

```typescript
import nock from 'nock';

nock('https://oauth2.googleapis.com').post('/token').reply(200, {
  access_token: 'mock_access_token',
  refresh_token: 'mock_refresh_token',
  expires_in: 3600,
  token_type: 'Bearer',
});

// Test OAuth flow logic without hitting real endpoint
```

**Pros**: Tests actual HTTP handling, fast
**Cons**: Doesn't test real OAuth provider behavior

**Option B: Dependency Injection Pattern**

```typescript
interface OAuthProvider {
  getAuthUrl(): string;
  exchangeCode(code: string): Promise<Tokens>;
  refreshToken(refreshToken: string): Promise<Tokens>;
}

class GoogleOAuth implements OAuthProvider {
  /* real */
}
class MockOAuth implements OAuthProvider {
  /* fake */
}

// Test with MockOAuth, prod uses GoogleOAuth
```

**Pros**: Clean separation, easy to mock
**Cons**: Requires refactoring existing code

**Option C: Record/Replay Pattern**

```typescript
// Record real OAuth responses once
// Replay them in tests
import { Polly } from '@pollyjs/core';

const polly = new Polly('oauth-test');
// First run records, subsequent runs replay
```

**Pros**: Tests with real responses, fast after recording
**Cons**: Responses go stale, recorded tokens expire

**Option D: Local OAuth Mock Server**

```typescript
// Run mock OAuth server in tests
const mockOAuthServer = new MockOAuthServer();
await mockOAuthServer.start(9999);

// Configure OAuth client to use localhost
process.env.OAUTH_ISSUER = 'http://localhost:9999';
```

**Pros**: Tests full OAuth flow end-to-end
**Cons**: Complex setup, port management issues

**Recommendation**: Use **layered testing strategy**:

1. **Unit tests**: Mock at OAuth provider interface (Option B)
2. **Integration tests**: Mock at HTTP layer (Option A) for flow testing
3. **E2E tests**: Real OAuth or record/replay (Option C) for critical paths
4. **Manual tests**: Real OAuth with test Google account

---

## Gap #2: Testing Token Expiration and Refresh Logic

### Description of the Gap

OAuth access tokens expire (typically 1 hour for Google). Testing token expiration requires either:

- Waiting an hour for tokens to expire (impractical)
- Manipulating system time (breaks other tests)
- Manually expiring tokens via API (not always available)
- Mocking time/expiration (doesn't test real behavior)

**What's not documented**:

- How to test token refresh without waiting
- How to test behavior when refresh token expires
- How to test concurrent requests during token refresh
- How to test rate limiting on refresh endpoint
- How to verify tokens are actually being refreshed (not re-authenticated)

### Why It's Overlooked

Token expiration is a time-dependent behavior that's hard to trigger deterministically. Most examples show initial authentication but skip refresh testing.

### Impact Assessment

**Severity**: HIGH

**Real-world issues not caught by tests**:

- Race conditions where multiple requests trigger simultaneous refresh
- Refresh failures causing cascading errors across all operations
- Expired refresh tokens silently failing instead of prompting re-auth
- Token refresh logic never actually executing in production

**Case Study**: Many OAuth libraries have bugs that only manifest during token refresh, not initial auth. Without testing, these bugs ship to production.

### Questions That Need Answering

1. How do you simulate expired tokens without waiting?
2. How do you test refresh logic in isolation from initial auth?
3. Should token expiration use wall-clock time or monotonic time?
4. How do you test refresh failures (network, revoked, expired)?
5. How do you verify refresh is happening in production?

### Potential Workarounds

**Option A: Mock Token with Short Expiration**

```typescript
// Create token that expires in 1 second
const mockToken = {
  access_token: 'short_lived',
  expires_in: 1, // 1 second instead of 3600
  refresh_token: 'refresh',
};

// Wait 2 seconds and verify refresh occurred
await sleep(2000);
const result = await makeAuthenticatedRequest();
expect(refreshWasCalled).toBe(true);
```

**Pros**: Tests real expiration behavior
**Cons**: Adds 2+ seconds to test runtime, timing issues

**Option B: Dependency Inject Clock**

```typescript
class TokenManager {
  constructor(private clock: Clock = new SystemClock()) {}

  isExpired(token: Token): boolean {
    return this.clock.now() > token.expiresAt;
  }
}

// In tests, use FakeClock
const fakeClock = new FakeClock();
const manager = new TokenManager(fakeClock);
fakeClock.advanceBy(3600000); // Advance 1 hour
expect(manager.isExpired(token)).toBe(true);
```

**Pros**: Deterministic, fast, no actual waiting
**Cons**: Requires refactoring, tests fake behavior

**Option C: Force Expiration via Token Manipulation**

```typescript
// Set token expiration to past time
const expiredToken = {
  ...token,
  expires_in: -1, // Already expired
  expiresAt: Date.now() - 1000, // 1 second ago
};

// Verify refresh is triggered
await makeAuthenticatedRequest(expiredToken);
expect(refreshWasCalled).toBe(true);
```

**Pros**: Fast, simple
**Cons**: Bypasses actual expiration logic

**Option D: Use Google's Test Token Endpoint**

```typescript
// Some OAuth providers offer test tokens
// that expire immediately
const testToken = await getTestToken({
  expires_in: 1,
  scope: 'test',
});
```

**Pros**: Tests real OAuth behavior
**Cons**: Not all providers offer this, still has timing issues

**Recommendation**:

- **Unit tests**: Use injected clock (Option B) for deterministic testing
- **Integration tests**: Use short-lived tokens (Option A) to test actual refresh
- **Add logging**: Emit events on token refresh for production monitoring

---

## Gap #3: Testing OAuth in CI/CD Pipelines

### Description of the Gap

Running OAuth tests in CI is challenging because:

- Real OAuth requires user interaction (browser, consent screen)
- Test credentials are secrets that need secure storage
- Rate limits from OAuth providers can cause CI failures
- Network issues cause flaky tests
- Multiple CI jobs running in parallel can conflict

**What's not documented**:

- How to securely provide OAuth credentials to CI
- Whether to use service accounts or user accounts for testing
- How to handle OAuth in pull requests from external contributors
- Strategies for avoiding rate limits in CI
- How to test OAuth without browser access

### Why It's Overlooked

CI configuration is project-specific and considered "devops" rather than code. Tutorials show local development but skip CI integration.

### Impact Assessment

**Severity**: MEDIUM-HIGH

**CI Issues**:

- OAuth tests skipped in CI (conditional on env var)
- CI uses different auth than production (service account vs OAuth)
- PRs from external contributors can't run OAuth tests
- Flaky OAuth tests force developers to re-run CI repeatedly
- No confidence that OAuth works in deployed environment

### Questions That Need Answering

1. Should CI use real OAuth or mocked OAuth?
2. How do you securely store refresh tokens in CI?
3. Can service accounts be used instead of OAuth for testing?
4. How do you test OAuth in Docker containers in CI?
5. Should OAuth tests run on every commit or only on main branch?

### Potential Workarounds

**Option A: Long-lived Refresh Token in Secrets**

```yaml
# GitHub Actions
- name: OAuth Integration Tests
  env:
    GOOGLE_REFRESH_TOKEN: ${{ secrets.GOOGLE_REFRESH_TOKEN }}
  run: npm run test:oauth
```

**Pros**: Tests real OAuth, deterministic
**Cons**: Tokens expire eventually, security risk if leaked

**Option B: Service Account for CI**

```typescript
// Use service account in CI, OAuth in prod
const auth = process.env.CI ? new ServiceAccountAuth() : new OAuthAuth();
```

**Pros**: No user interaction, long-lived credentials
**Cons**: Tests different auth mechanism than production

**Option C: Mock OAuth in CI**

```yaml
- name: Unit Tests (Mocked OAuth)
  run: npm run test:unit

- name: Integration Tests (Real OAuth)
  if: github.ref == 'refs/heads/main'
  run: npm run test:integration
```

**Pros**: Fast, no secrets needed for unit tests
**Cons**: Real OAuth only tested on main branch

**Option D: On-Demand OAuth Test Environment**

```yaml
# Manual workflow trigger with OAuth setup
on: workflow_dispatch
steps:
  - name: Setup OAuth Test Environment
    run: docker-compose up oauth-mock
  - name: Run Integration Tests
    run: npm run test:integration
```

**Pros**: Full control, realistic environment
**Cons**: Manual trigger, complex setup

**Recommendation**:

- **PR CI**: Run unit tests with mocked OAuth
- **Main branch CI**: Run integration tests with real OAuth (refresh token in secrets)
- **Nightly**: Full E2E tests with real OAuth flows
- **Security**: Use short-lived refresh tokens, rotate regularly

---

## Gap #4: Testing OAuth Error Paths

### Description of the Gap

OAuth has many error paths that are rarely tested:

- Invalid authorization code
- Expired authorization code (used after 10 minutes)
- Invalid refresh token
- Revoked refresh token
- Wrong redirect URI
- Mismatched CSRF state parameter
- Invalid scope
- User denied consent
- Network failures during token exchange
- Rate limiting

**What's not documented**:

- How to trigger each specific OAuth error
- How to mock OAuth error responses
- What user-facing behavior should occur for each error
- Whether errors should be retried or fail immediately
- How to log OAuth errors for debugging

### Why It's Overlooked

Happy-path documentation focuses on successful flows. Error handling is assumed to be straightforward (just catch exceptions).

### Impact Assessment

**Severity**: MEDIUM

**Real-world consequences of untested error paths**:

- User clicks "Deny" on consent screen → app crashes
- Token refresh fails → infinite retry loop
- Network timeout → request hangs forever
- Rate limit → cascade failure across all users

**Common bugs found in production**:

- No retry logic for transient failures
- Permanent failures (revoked token) retry forever
- Error messages expose implementation details
- Logs don't capture enough context for debugging

### Questions That Need Answering

1. Which OAuth errors should trigger automatic retry?
2. Which errors require user intervention (re-authentication)?
3. How should errors be logged without exposing tokens?
4. What's the appropriate retry strategy for rate limits?
5. Should errors be returned to MCP client or handled internally?

### Potential Workarounds

**Option A: Explicit Error Test Cases**

```typescript
describe('OAuth Error Handling', () => {
  it('should handle invalid authorization code', async () => {
    nock('https://oauth2.googleapis.com').post('/token').reply(400, { error: 'invalid_grant' });

    await expect(exchangeCode('invalid')).rejects.toThrow('Invalid code');
  });

  it('should retry on network timeout', async () => {
    nock('https://oauth2.googleapis.com')
      .post('/token')
      .delayConnection(10000) // 10 second delay
      .reply(200, validToken);

    const result = await exchangeCode('valid', { timeout: 5000 });
    expect(result).toBe(null); // Should timeout and return null
  });
});
```

**Option B: Error Injection via Test Environment**

```typescript
// Allow tests to inject errors
if (process.env.TEST_OAUTH_ERROR === 'invalid_grant') {
  throw new OAuthError('invalid_grant');
}
```

**Option C: Chaos Testing**

```typescript
// Randomly inject OAuth errors in test environment
const chaosOAuth = new ChaosOAuthClient({
  errorRate: 0.1, // 10% of requests fail
  errors: ['invalid_grant', 'rate_limit', 'network_timeout'],
});
```

**Recommendation**:

- Write explicit test cases for common errors (Option A)
- Test retry logic with mocked failures
- Test timeout handling with delayed responses
- Add error logging tests to verify no token leakage
- Document expected behavior for each error type

---

## Gap #5: Testing MCP-Specific OAuth Integration

### Description of the Gap

MCP servers have unique OAuth testing challenges:

- **Stdio transport**: No HTTP server for callbacks
- **Tool calls**: OAuth must work within tool execution context
- **Async operations**: Token refresh during tool execution
- **Error propagation**: OAuth errors must be MCP-compatible responses
- **Client integration**: Testing with actual MCP clients (Claude Desktop)

**What's not documented**:

- How to test stdio OAuth flows (device authorization, callback server)
- How to test token refresh during long-running tool operations
- How to verify MCP error responses for auth failures
- How to integration test with MCP clients
- How to test OAuth in different MCP transports (stdio, HTTP, SSE)

### Why It's Overlooked

MCP is new and OAuth integration patterns are still emerging. Most MCP examples don't use authentication.

### Impact Assessment

**Severity**: HIGH (for authenticated MCP servers)

**MCP-specific issues**:

- OAuth callback server conflicts with MCP stdio transport
- Token refresh hangs entire MCP server
- Auth errors crash MCP client instead of returning error responses
- No way to test with actual Claude Desktop without manual testing

### Questions That Need Answering

1. How do you unit test device authorization flow?
2. How do you test ephemeral callback server for stdio OAuth?
3. Should token refresh block tool execution or happen in background?
4. How do you test OAuth with MCP client integration?
5. What's the right error response format for auth failures?

### Potential Workarounds

**Option A: Mock MCP Transport Layer**

```typescript
// Test MCP server without actual stdio transport
const mockTransport = new MockMCPTransport();
const server = new Server({ name: 'test' }, { capabilities: {} });
server.connect(mockTransport);

// Send mock tool calls with OAuth
const response = await mockTransport.callTool('scrape', { url: 'test' });
expect(response.isError).toBe(false);
```

**Option B: Test OAuth Flow Separately from MCP**

```typescript
// Test OAuth logic in isolation
describe('OAuth Flow', () => {
  it('should complete device authorization', async () => {
    const auth = new DeviceAuthFlow();
    const result = await auth.authorize();
    expect(result.accessToken).toBeDefined();
  });
});

// Test MCP integration with mocked OAuth
describe('MCP Integration', () => {
  it('should call tool with OAuth', async () => {
    const server = createServerWithMockOAuth();
    // Test MCP tool calls
  });
});
```

**Option C: Integration Tests with TestMCPClient**

```typescript
import { TestMCPClient } from '@modelcontextprotocol/sdk/test';

const client = new TestMCPClient();
await client.connect(new StdioClientTransport(/* ... */));

// Test tool calls through actual MCP protocol
const result = await client.callTool('scrape', { url: 'test' });
expect(result.content[0].type).toBe('text');
```

**Recommendation**:

- **Unit tests**: Test OAuth logic separately from MCP (Option B)
- **Integration tests**: Use TestMCPClient to test MCP protocol (Option C)
- **Manual tests**: Test with Claude Desktop for E2E validation
- **Mock transport**: Use for testing error responses (Option A)

---

## Testing Best Practices for OAuth + MCP

Based on identified gaps, recommended testing strategy:

### 1. Layered Testing Pyramid

```
        E2E Tests (Manual, Claude Desktop)
               /\
              /  \
       Integration Tests (TestMCPClient + Mock HTTP)
            /      \
           /        \
    Unit Tests (Mocked OAuth, Injected Dependencies)
```

### 2. Test Coverage Targets

| Category         | Coverage Target     | Test Type                              |
| ---------------- | ------------------- | -------------------------------------- |
| OAuth flow logic | 90%+                | Unit tests (mocked)                    |
| Token refresh    | 85%+                | Integration tests (short-lived tokens) |
| Error handling   | 80%+                | Unit tests (injected errors)           |
| MCP integration  | 70%+                | Integration tests (TestMCPClient)      |
| E2E flows        | Critical paths only | Manual tests                           |

### 3. Required Test Cases

**Authentication**:

- [ ] Successful OAuth flow
- [ ] User denies consent
- [ ] Invalid authorization code
- [ ] Expired authorization code
- [ ] Network failure during token exchange

**Token Management**:

- [ ] Token refresh before expiration
- [ ] Concurrent requests during refresh
- [ ] Refresh token expired
- [ ] Refresh token revoked
- [ ] Network failure during refresh

**MCP Integration**:

- [ ] Tool call with valid token
- [ ] Tool call with expired token (auto-refresh)
- [ ] Tool call with invalid token (error response)
- [ ] Multiple concurrent tool calls
- [ ] Long-running tool with token refresh

**Error Handling**:

- [ ] Rate limiting
- [ ] Network timeouts
- [ ] Invalid credentials
- [ ] Scope insufficient for operation
- [ ] User revoked access

### 4. CI/CD Testing Strategy

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm run test:unit # Mocked OAuth

  integration-tests:
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v3
      - run: npm run test:integration # Real OAuth
        env:
          GOOGLE_REFRESH_TOKEN: ${{ secrets.GOOGLE_REFRESH_TOKEN }}

  e2e-tests:
    runs-on: ubuntu-latest
    if: github.event_name == 'workflow_dispatch'
    steps:
      - uses: actions/checkout@v3
      - run: npm run test:e2e # Full flow with browser
```

### 5. Test Data Management

**Create test fixtures**:

```typescript
// tests/fixtures/oauth-responses.ts
export const validTokenResponse = {
  access_token: 'ya29.test_token',
  refresh_token: 'refresh_test',
  expires_in: 3600,
  token_type: 'Bearer',
  scope: 'https://www.googleapis.com/auth/drive.readonly',
};

export const expiredTokenResponse = {
  error: 'invalid_grant',
  error_description: 'Token has been expired or revoked.',
};

export const rateLimitResponse = {
  error: 'rate_limit_exceeded',
  error_description: 'Too many requests.',
};
```

---

## Tools and Libraries for OAuth Testing

### Recommended Testing Stack

1. **HTTP Mocking**: `nock` or `msw` for intercepting OAuth HTTP requests
2. **Time Mocking**: `@sinonjs/fake-timers` for testing token expiration
3. **MCP Testing**: `@modelcontextprotocol/sdk/test` for TestMCPClient
4. **Assertions**: `vitest` or `jest` with `expect`
5. **Test Coverage**: `c8` or `nyc` for code coverage

### Example Test Setup

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import nock from 'nock';
import { FakeTimers } from '@sinonjs/fake-timers';
import { TestMCPClient } from '@modelcontextprotocol/sdk/test';

describe('OAuth MCP Integration', () => {
  let clock: FakeTimers;
  let client: TestMCPClient;

  beforeEach(() => {
    clock = FakeTimers.install();
    client = new TestMCPClient();
    nock.cleanAll();
  });

  afterEach(() => {
    clock.uninstall();
    nock.restore();
  });

  it('should refresh token when expired', async () => {
    // Mock expired token
    nock('https://oauth2.googleapis.com').post('/token').reply(200, validTokenResponse);

    // Fast-forward time to trigger expiration
    clock.tick(3600000); // 1 hour

    // Make tool call
    const result = await client.callTool('scrape', { url: 'test' });

    // Verify refresh occurred
    expect(nock.isDone()).toBe(true);
    expect(result.isError).toBe(false);
  });
});
```

---

## Research Priorities

1. **HIGH**: Document layered testing strategy for OAuth + MCP
2. **HIGH**: Create reusable OAuth mock fixtures
3. **MEDIUM**: Test CI/CD integration patterns
4. **MEDIUM**: Benchmark test performance (mocked vs real OAuth)
5. **LOW**: Investigate chaos testing for OAuth resilience

---

## Recommendations for Pulse Fetch

1. **Implement dependency injection** for OAuth provider (enables easy mocking)
2. **Use nock** for HTTP mocking in integration tests
3. **Use fake-timers** for testing token expiration
4. **Use TestMCPClient** for MCP protocol testing
5. **Create test fixtures** for common OAuth responses
6. **Add CI workflow** with layered testing strategy
7. **Document testing approach** in README
8. **Add error injection** for testing error paths
9. **Monitor OAuth metrics** in production (refresh rate, errors)
10. **Create manual test suite** for Claude Desktop integration
