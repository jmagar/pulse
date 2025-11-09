# Systems Analysis: OAuth Token Lifecycle in MCP Servers

## Executive Summary

OAuth token lifecycle management in MCP servers presents unique challenges due to the stateless nature of server restarts, the long-running nature of AI assistant sessions, and the disconnect between token expiration (1 hour) and user session duration (hours to days).

## Causal Chain Analysis

```
User authorizes OAuth scopes
  → Access token issued (1 hour TTL)
    → Refresh token issued (no expiration, can be revoked)
      → MCP server stores tokens (WHERE?)
        → Server restart occurs (WHEN?)
          → Token storage lost? (IF in-memory)
            → Re-authorization required (UX disruption)
              → User frustration, flow interruption
                → Reduced AI assistant utility
```

## System Components and Dependencies

### 1. Token Storage Layer

**Options and Second-Order Effects:**

- **In-Memory Storage**
  - Effect: Tokens lost on server restart
  - Cascading impact: User must re-authorize on every Claude Desktop restart
  - Stakeholder impact: Developers (simpler), Users (poor UX)

- **File-Based Storage**
  - Effect: Tokens persist across restarts
  - Security concern: File permissions, encryption at rest
  - Cascading impact: Multi-user systems expose tokens to filesystem access

- **OS Keychain/Credential Manager**
  - Effect: Secure, persistent storage
  - Platform dependency: macOS Keychain, Windows Credential Manager, Linux Secret Service
  - Cascading impact: Requires platform-specific code, complicates cross-platform MCP servers

- **Database Storage**
  - Effect: Centralized, persistent, multi-user capable
  - Infrastructure dependency: Adds database as system requirement
  - Cascading impact: Simple MCP server becomes multi-service deployment

### 2. Token Refresh Timing

**Critical Decision Points:**

```
Access token issued at T=0 (expires T=3600s)
  → Refresh strategy options:
    A) Proactive refresh at T=3300s (5min buffer)
       → Reduces failure probability
       → Increases API call volume
       → May refresh unnecessarily if server idle

    B) Reactive refresh on 401 response
       → Minimizes API calls
       → Introduces latency on first post-expiration request
       → Risk: Refresh token itself may be invalid

    C) Hybrid: Proactive + reactive fallback
       → Best reliability
       → Most complex implementation
       → Requires background timer thread
```

**Cascading Failure Scenario:**

```
Token expires during long-running AI task
  → API call fails with 401
    → Refresh attempt initiated
      → Refresh token invalid (user revoked, expired, rotated)
        → Re-authorization required
          → But user not present (async AI operation)
            → Operation fails silently or visibly?
              → Error surfaced to Claude?
                → Claude reports to user?
                  → User must manually retry after re-auth
```

## Lifecycle State Transitions

### Normal Flow

```
[UNAUTHORIZED]
  → user_initiates_auth
[AUTH_PENDING]
  → user_consents_in_browser
[AUTHORIZED]
  → token_stored
[ACTIVE]
  → (periodic_refresh_success)
[ACTIVE]
```

### Failure Modes

#### FM-1: Server Restart During Active Session

```
[ACTIVE] → server_restart → [DEPENDS_ON_STORAGE]

IF in-memory:
  → [UNAUTHORIZED]
  → user_must_reauth (UX disruption)

IF persistent:
  → [ACTIVE]
  → load_tokens_from_storage
  → validate_token_freshness
    IF expired AND refresh_valid:
      → refresh_token → [ACTIVE]
    IF refresh_invalid:
      → [UNAUTHORIZED] → user_must_reauth
```

#### FM-2: Refresh Token Invalidation

```
[ACTIVE]
  → google_revokes_refresh_token (security event, user revocation, rotation)
[ACTIVE] (server unaware)
  → access_token_expires
  → attempt_refresh
    → 400/401 error
[REFRESH_FAILED]
  → notify_user_reauth_required
[UNAUTHORIZED]
```

**Stakeholder Impacts:**

- **User**: Unexpected re-authorization mid-workflow
- **Developer**: Must handle refresh failure gracefully
- **Security team**: Intended behavior (user control), but creates UX friction

#### FM-3: Concurrent Token Refresh

```
Multiple MCP tools call Google API simultaneously
  → All detect expired token
    → Multiple refresh requests in parallel
      → Google may:
        a) Process all (wasteful but safe)
        b) Invalidate old refresh token after first use (SECURITY FEATURE)
          → Subsequent refreshes fail
            → Cascading auth failures across tools
```

**Mitigation Strategy:**

```
Implement refresh lock/mutex:
  IF refresh_in_progress:
    WAIT for refresh_completion
    USE new_token
  ELSE:
    ACQUIRE lock
    PERFORM refresh
    RELEASE lock
```

## Time-Based Vulnerabilities

### Access Token Lifetime (1 hour)

**Problem:** User sessions often exceed 1 hour

**System-Level Effects:**

- Silent failures if refresh not implemented
- User confusion: "It worked an hour ago"
- Support burden: Hard to diagnose time-based issues

### Refresh Token Lifetime (variable)

**Google Behavior:**

- Desktop apps: Refresh tokens don't expire unless revoked
- Testing/unverified apps: 7-day expiration for refresh tokens
- Production apps: Long-lived refresh tokens

**System Implications:**

```
IF app_status == "testing":
  refresh_token_expires_in = 7_days
  → Users must re-auth weekly
    → Acceptable for dev/testing
    → UNACCEPTABLE for production MCP servers

  SOLUTION:
    → Publish app in Google Cloud Console
    → Complete OAuth verification process
    → Move to production status
```

## Stakeholder Impact Matrix

| Stakeholder    | Token Lifecycle Concern      | Impact Level | Mitigation Complexity        |
| -------------- | ---------------------------- | ------------ | ---------------------------- |
| End User       | Frequent re-authorization    | HIGH         | Medium (persistent storage)  |
| MCP Developer  | Refresh implementation       | MEDIUM       | High (edge cases)            |
| Security Team  | Token storage security       | HIGH         | Medium (OS keychain)         |
| Google         | API abuse via broken refresh | LOW          | N/A (rate limits)            |
| Claude Desktop | Integration complexity       | MEDIUM       | Low (delegate to MCP server) |

## Feedback Loops

### Positive Feedback Loop (Degradation)

```
Token refresh fails
  → User re-authorizes manually
    → Developer logs show "auth works"
      → Refresh bug not prioritized
        → More users hit refresh failure
          → More manual re-auth
            → Masks underlying bug
```

**Breaking the loop:** Instrumentation + alerting on refresh failures

### Negative Feedback Loop (Stabilization)

```
Token refresh succeeds proactively
  → No user disruption
    → High user satisfaction
      → More API usage
        → More token refreshes
          → Higher success rate (code path exercised)
            → System stability
```

## System-Wide Implications

### 1. MCP Server Restart Strategies

**Current Reality:** Claude Desktop may restart MCP servers:

- On demand (when tool first needed)
- On error/crash recovery
- On Claude Desktop restart
- On configuration change

**Implication:** Persistent token storage is MANDATORY for production, not optional

### 2. Multi-Instance Deployments

**Scenario:** Same user, multiple devices (laptop + desktop)

```
User authorizes on Device A
  → Refresh token stored locally on Device A
    → User switches to Device B
      → No refresh token present
        → Must re-authorize on Device B
          → Creates two separate refresh tokens
            → Google allows this (multiple concurrent tokens)
              → But: Each device independent
                → Revoking one doesn't affect others
```

**Implication:** Per-device authorization is expected behavior, not a bug

### 3. Token Rotation Security Feature

**Google Security Behavior:** May rotate refresh tokens periodically

```
Refresh token RT1 used successfully
  → Google issues new access token AT2
    → Google MAY issue new refresh token RT2
      → Old RT1 invalidated
        → MCP server MUST update stored refresh token
          → IF not updated:
            → Next refresh uses RT1 (invalid)
              → Refresh fails
                → User must re-authorize
```

**Critical Implementation Detail:**

```typescript
const tokenResponse = await oauth2Client.refreshAccessToken();
const newTokens = tokenResponse.credentials;

// MUST check and update refresh token if rotated
if (newTokens.refresh_token) {
  await storage.updateRefreshToken(newTokens.refresh_token);
}
```

## Monitoring and Observability Requirements

### Key Metrics

1. **Token Refresh Success Rate**
   - Target: >99.9%
   - Alert: <95% over 5-minute window
   - Indicates: Network issues, Google API problems, or implementation bugs

2. **Time to Token Expiration**
   - Monitor: When tokens are about to expire
   - Alert: If refresh not attempted by T-5min
   - Indicates: Refresh timer failure

3. **Re-authorization Frequency**
   - Expected: Very rare (only on explicit revocation)
   - Alert: >1 per user per week
   - Indicates: Token storage or refresh logic failure

4. **Auth Flow Completion Rate**
   - Expected: >80% (some users abandon)
   - Alert: <60%
   - Indicates: Consent screen issues, scope concerns, or UX problems

### Logging Strategy

```typescript
// Structured logging for token lifecycle
logger.info('token_refresh_initiated', {
  user_id: hash(userId),
  expires_at: tokenExpiresAt,
  time_until_expiry: expiresAt - Date.now(),
  proactive: true,
});

logger.info('token_refresh_success', {
  user_id: hash(userId),
  new_expires_at: newExpiresAt,
  refresh_token_rotated: !!newRefreshToken,
  duration_ms: Date.now() - startTime,
});

logger.error('token_refresh_failure', {
  user_id: hash(userId),
  error_code: error.code,
  error_message: error.message,
  retry_attempt: attemptNumber,
  refresh_token_age_days: tokenAge,
});
```

## Risk Assessment

### High-Risk Scenarios

1. **Token Storage Compromise**
   - Probability: Medium (if file-based without encryption)
   - Impact: High (full account access)
   - Mitigation: OS keychain, encrypted storage, least-privilege scopes

2. **Refresh Token Expiration in Testing Mode**
   - Probability: High (guaranteed if app not published)
   - Impact: Medium (weekly re-auth required)
   - Mitigation: Publish app, complete verification

3. **Concurrent Refresh Race Condition**
   - Probability: Low (requires multiple simultaneous expired requests)
   - Impact: High (cascading auth failures)
   - Mitigation: Mutex/lock around refresh logic

### Medium-Risk Scenarios

1. **Server Restart During Auth Flow**
   - Probability: Low (short auth window)
   - Impact: Medium (user must restart auth)
   - Mitigation: State persistence, callback URL validation

2. **Network Failure During Refresh**
   - Probability: Medium (network issues happen)
   - Impact: Low (retry logic handles)
   - Mitigation: Exponential backoff, retry limits

## Recommendations

### Architecture Decisions

1. **Token Storage: OS Keychain (Tier 1) + File Fallback (Tier 2)**
   - Use platform-specific keychain where available
   - Fall back to encrypted file storage
   - Document security posture in README

2. **Refresh Strategy: Hybrid Proactive + Reactive**
   - Proactive refresh at T-5min
   - Reactive fallback on 401 response
   - Mutex to prevent concurrent refreshes

3. **Token Rotation Handling: Always Update**
   - Check for new refresh token in every refresh response
   - Update storage immediately
   - Log rotation events for monitoring

4. **Error Handling: User-Visible + Actionable**
   - Surface refresh failures to Claude (via tool error response)
   - Include re-authorization URL in error message
   - Log detailed diagnostic info for debugging

### Testing Strategy

1. **Unit Tests**
   - Token expiration detection
   - Refresh logic (mocked OAuth client)
   - Storage layer (all implementations)

2. **Integration Tests**
   - Full auth flow with test Google account
   - Token refresh with real API calls
   - Storage persistence across server restarts

3. **Chaos Tests**
   - Simulate network failures during refresh
   - Concurrent refresh attempts
   - Server restart mid-auth flow
   - Invalid/expired refresh tokens

4. **Time-Travel Tests**
   - Mock system clock to simulate expiration
   - Test proactive refresh timing
   - Verify refresh token rotation handling

## Future Considerations

### MCP Protocol Evolution

**Potential MCP SDK Features:**

- Standardized OAuth helper utilities
- Built-in token storage abstractions
- Server lifecycle hooks for token refresh

**Impact:** Would reduce per-server implementation burden, increase consistency

### Google API Changes

**Monitoring Required:**

- Refresh token lifetime policy changes
- New security requirements (e.g., PKCE for desktop apps)
- Scope deprecations or additions

**Impact:** May require MCP server updates to maintain compatibility

## Conclusion

OAuth token lifecycle in MCP servers is a **high-complexity, high-impact** system component. The interaction between short-lived access tokens (1 hour), long-lived user sessions (hours to days), and unpredictable server restarts creates a challenging environment for maintaining continuous authorization.

**Critical Success Factors:**

1. Persistent, secure token storage
2. Robust refresh logic with race condition handling
3. Comprehensive error handling and user feedback
4. Monitoring and observability
5. Published OAuth app (not testing mode)

**Key Insight:** Token lifecycle management is not a one-time implementation task but an ongoing operational concern requiring monitoring, testing, and evolution as the MCP ecosystem matures.
