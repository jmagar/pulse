# OAuth Error Scenarios and Edge Cases Rarely Documented

**Research Date**: 2025-11-06
**Persona**: The Negative Space Explorer
**Focus**: Edge cases, error paths, and scenarios missing from documentation

---

## Executive Summary

OAuth documentation typically covers the "happy path" - successful authentication, token refresh, and API calls. This leaves developers unprepared for the myriad edge cases, error conditions, and failure modes that occur in production. This document catalogs the underdocumented error scenarios and their impact on MCP server implementations.

---

## Gap #1: Concurrent Token Refresh Race Conditions

### Description of the Gap

When multiple operations detect an expired token simultaneously, they may all trigger token refresh in parallel, leading to:

- Multiple simultaneous refresh requests to OAuth provider
- Race conditions where only first refresh succeeds
- Wasted API quota on redundant refresh calls
- Potential rate limiting from too many refresh attempts
- Inconsistent token state across operations

**Not documented**:

- How to implement refresh locking/mutex
- Whether to queue operations during refresh
- How to share refreshed token across concurrent operations
- What happens to in-flight operations when refresh fails

### Why It's Overlooked

Most examples show single-threaded, sequential operations. The complexity of concurrent access emerges only in production under load.

### Impact Assessment

**Severity**: HIGH

**Real-world scenario**:

```
Time 0ms: Tool call A detects expired token → starts refresh
Time 5ms: Tool call B detects expired token → starts refresh
Time 10ms: Tool call C detects expired token → starts refresh
Time 100ms: Refresh A completes successfully
Time 105ms: Refresh B completes with rate_limit_exceeded error
Time 110ms: Refresh C completes with rate_limit_exceeded error
Result: 2 operations fail due to race condition
```

**Consequences**:

- Intermittent failures under load
- Higher error rates during peak usage
- Wasted OAuth quota
- Poor user experience (random failures)

### Questions That Need Answering

1. Should token refresh be locked with a mutex?
2. Should operations wait for in-progress refresh or fail fast?
3. How do you detect if a refresh is already in progress?
4. What's the timeout for waiting on another refresh?
5. How do you propagate refresh failures to waiting operations?

### Potential Workarounds

**Option A: Mutex/Lock Pattern**

```typescript
class TokenManager {
  private refreshPromise: Promise<Token> | null = null;

  async getValidToken(): Promise<Token> {
    const token = this.getCurrentToken();

    if (!this.isExpired(token)) {
      return token;
    }

    // If refresh already in progress, wait for it
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    // Start refresh and store promise
    this.refreshPromise = this.refreshToken().finally(() => {
      this.refreshPromise = null;
    });

    return this.refreshPromise;
  }
}
```

**Pros**: Single refresh for concurrent operations
**Cons**: All operations blocked until refresh completes

**Option B: Queue Pattern**

```typescript
class TokenManager {
  private operationQueue: Array<() => Promise<any>> = [];
  private isRefreshing = false;

  async executeWithToken<T>(operation: () => Promise<T>): Promise<T> {
    if (this.isRefreshing) {
      // Queue operation until refresh completes
      return new Promise((resolve, reject) => {
        this.operationQueue.push(async () => {
          try {
            resolve(await operation());
          } catch (error) {
            reject(error);
          }
        });
      });
    }

    const token = await this.getValidToken();
    return operation();
  }

  private async processQueue() {
    while (this.operationQueue.length > 0) {
      const operation = this.operationQueue.shift();
      await operation();
    }
  }
}
```

**Pros**: Fair queuing, predictable ordering
**Cons**: Complex, can cause cascading delays

**Option C: Fail Fast with Retry**

```typescript
async function callWithAuth(operation: () => Promise<any>) {
  try {
    return await operation();
  } catch (error) {
    if (error.code === 'token_expired') {
      // Only one caller will succeed in refreshing
      await refreshToken();
      // Retry operation with new token
      return await operation();
    }
    throw error;
  }
}
```

**Pros**: Simple, no locking needed
**Cons**: Multiple refresh attempts, potential rate limiting

**Recommendation**: Use **Option A (Mutex Pattern)** for token refresh to ensure only one refresh happens at a time, with all concurrent operations sharing the result.

---

## Gap #2: Partial Scope Authorization

### Description of the Gap

When requesting multiple OAuth scopes, users can grant partial access by:

- Approving some scopes but denying others
- Modifying requested scopes in the consent screen (on some providers)
- Having organizational policies that restrict certain scopes

**Not documented**:

- How to detect which scopes were actually granted
- How to handle tools that require denied scopes
- Whether to retry with reduced scope set
- How to communicate partial authorization to users
- Whether to fail entirely or degrade functionality

### Why It's Overlooked

Most examples request a single scope or assume all scopes are granted. Partial authorization is a real-world complexity that tutorials ignore.

### Impact Assessment

**Severity**: MEDIUM-HIGH

**Example scenario**:

```
Requested scopes:
- drive.readonly (to read files)
- drive.metadata.readonly (to list files)
- gmail.readonly (to read emails)

User grants:
- drive.readonly ✓
- drive.metadata.readonly ✓
- gmail.readonly ✗

Result: Gmail tools fail, Drive tools work
```

**Consequences**:

- Tools fail with cryptic "insufficient_scope" errors
- Users don't understand why some features work and others don't
- Re-authorization prompts user for all scopes again
- No graceful degradation

### Questions That Need Answering

1. How do you detect which scopes were actually granted?
2. Should you fail if any requested scope is denied?
3. Can you re-request only the denied scopes?
4. How do you disable tools that require denied scopes?
5. Should scope validation happen at auth time or tool call time?

### Potential Workarounds

**Option A: Validate Scopes After Auth**

```typescript
async function completeOAuthFlow(code: string) {
  const tokens = await exchangeCodeForTokens(code);

  // Google includes granted scopes in token response
  const grantedScopes = tokens.scope.split(' ');
  const requestedScopes = ['drive.readonly', 'gmail.readonly'];

  const deniedScopes = requestedScopes.filter((scope) => !grantedScopes.includes(scope));

  if (deniedScopes.length > 0) {
    console.warn(`Warning: Following scopes were denied: ${deniedScopes.join(', ')}`);
    console.warn('Some features may not work.');
  }

  return { tokens, grantedScopes };
}
```

**Option B: Conditional Tool Registration**

```typescript
function registerTools(server: Server, grantedScopes: string[]) {
  // Only register tools for granted scopes
  if (grantedScopes.includes('drive.readonly')) {
    server.registerTool(driveReadTool);
  }

  if (grantedScopes.includes('gmail.readonly')) {
    server.registerTool(gmailReadTool);
  }
}
```

**Option C: Runtime Scope Checking**

```typescript
async function callDriveTool(args: any) {
  const token = await getToken();

  if (!hasScope(token, 'drive.readonly')) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: 'This tool requires drive.readonly scope. Please re-authorize with required permissions.',
        },
      ],
    };
  }

  // Proceed with operation
}
```

**Recommendation**:

- Validate granted scopes after authorization (Option A)
- Conditionally register tools based on scopes (Option B)
- Provide clear error messages for missing scopes (Option C)

---

## Gap #3: OAuth State Parameter Security

### Description of the Gap

The OAuth `state` parameter prevents CSRF attacks by ensuring the auth response matches the auth request. However:

- Many implementations don't validate state properly
- State validation is often skipped in tutorials
- No guidance on state generation (random vs signed)
- State expiration is rarely implemented
- Multiple concurrent auth flows can conflict

**Not documented**:

- How long to keep state values
- Whether to sign state values
- How to handle expired/invalid state
- State storage in stateless servers
- State collision in concurrent auth flows

### Why It's Overlooked

OAuth tutorials often show `state: 'random_string'` without explaining security implications. State validation adds complexity that's skipped in minimal examples.

### Impact Assessment

**Severity**: MEDIUM (Security vulnerability)

**Attack scenario without proper state validation**:

```
1. Attacker initiates OAuth flow, gets callback URL
2. Attacker tricks victim into clicking callback URL
3. Victim's browser sends attacker's auth code to victim's server
4. Victim's account now authenticated with attacker's OAuth token
5. Attacker can access victim's data through the OAuth connection
```

**Consequences**:

- CSRF vulnerability
- Account takeover potential
- OAuth authorization code theft
- Compliance violations (OWASP, OAuth 2.0 spec)

### Questions That Need Answering

1. How should state values be generated (random, signed, timestamped)?
2. How long should state values be valid?
3. Where should state be stored (memory, file, database)?
4. How to clean up expired state values?
5. Should state include additional metadata (user ID, timestamp)?

### Potential Workarounds

**Option A: Signed State with Expiration**

```typescript
import crypto from 'crypto';

function generateState(): string {
  const timestamp = Date.now();
  const random = crypto.randomBytes(16).toString('hex');
  const payload = `${timestamp}:${random}`;
  const signature = crypto.createHmac('sha256', SECRET_KEY).update(payload).digest('hex');
  return `${payload}:${signature}`;
}

function validateState(state: string): boolean {
  const [timestamp, random, signature] = state.split(':');

  // Check expiration (5 minutes)
  if (Date.now() - parseInt(timestamp) > 300000) {
    return false;
  }

  // Verify signature
  const expected = crypto
    .createHmac('sha256', SECRET_KEY)
    .update(`${timestamp}:${random}`)
    .digest('hex');

  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
```

**Option B: Database-Backed State**

```typescript
const pendingStates = new Map<string, { expires: number }>();

function generateState(): string {
  const state = crypto.randomBytes(32).toString('hex');
  pendingStates.set(state, {
    expires: Date.now() + 300000, // 5 minutes
  });
  return state;
}

function validateState(state: string): boolean {
  const entry = pendingStates.get(state);
  if (!entry) return false;

  if (Date.now() > entry.expires) {
    pendingStates.delete(state);
    return false;
  }

  pendingStates.delete(state); // One-time use
  return true;
}

// Cleanup expired states
setInterval(() => {
  const now = Date.now();
  for (const [state, entry] of pendingStates) {
    if (now > entry.expires) {
      pendingStates.delete(state);
    }
  }
}, 60000); // Every minute
```

**Option C: JWT-Based State**

```typescript
import jwt from 'jsonwebtoken';

function generateState(): string {
  return jwt.sign({ iat: Date.now() }, SECRET_KEY, { expiresIn: '5m' });
}

function validateState(state: string): boolean {
  try {
    jwt.verify(state, SECRET_KEY);
    return true;
  } catch (error) {
    return false;
  }
}
```

**Recommendation**: Use **Option A (Signed State)** for simplicity, or **Option C (JWT)** if already using JWT library. Always validate state and implement expiration.

---

## Gap #4: Token Storage During Refresh Window

### Description of the Gap

When refreshing an OAuth token, there's a critical window where:

- Old token is expired
- New token is being fetched
- Operations are waiting for new token

**Edge cases not documented**:

- Should old token be kept until new token arrives?
- What happens if refresh fails midway?
- How to rollback to old token if refresh fails?
- Should operations use old token or wait?
- What if old token gets revoked during refresh?

### Why It's Overlooked

Token refresh is typically shown as atomic operation. The intermediate states and failure modes are ignored.

### Impact Assessment

**Severity**: MEDIUM

**Failure scenario**:

```
1. Token expires
2. Refresh starts
3. Old token deleted
4. Network fails during refresh
5. No valid token available
6. All operations fail until manual intervention
```

**Consequences**:

- Lost token state on refresh failure
- Cascading failures
- Difficult recovery
- Data loss if tokens not persisted

### Questions That Need Answering

1. Should old token be kept until new token is confirmed valid?
2. How to atomically swap tokens?
3. What's the rollback strategy for failed refresh?
4. Should refresh be transactional?
5. How to prevent token loss on crashes during refresh?

### Potential Workarounds

**Option A: Keep-Old-Until-New Pattern**

```typescript
class TokenManager {
  private currentToken: Token | null = null;
  private previousToken: Token | null = null;

  async refreshToken(): Promise<Token> {
    try {
      // Keep old token as fallback
      this.previousToken = this.currentToken;

      // Fetch new token
      const newToken = await fetchNewToken(this.currentToken.refreshToken);

      // Only update after successful fetch
      this.currentToken = newToken;
      await this.persistToken(newToken);

      // Clear old token
      this.previousToken = null;

      return newToken;
    } catch (error) {
      // Rollback to old token on failure
      if (this.previousToken) {
        this.currentToken = this.previousToken;
        this.previousToken = null;
      }
      throw error;
    }
  }
}
```

**Option B: Copy-on-Write Pattern**

```typescript
async function refreshToken(): Promise<Token> {
  // Write new token to temp location
  const newToken = await fetchNewToken();
  await fs.writeFile('tokens.json.tmp', JSON.stringify(newToken));

  // Atomic rename
  await fs.rename('tokens.json.tmp', 'tokens.json');

  return newToken;
}
```

**Option C: Two-Phase Commit**

```typescript
async function refreshToken(): Promise<Token> {
  // Phase 1: Prepare
  const newToken = await fetchNewToken();
  await db.prepare('token_refresh', newToken);

  // Phase 2: Commit
  await db.commit('token_refresh');

  return newToken;
}
```

**Recommendation**: Use **Option A (Keep-Old-Until-New)** for simplicity and safety. Always keep old token until new token is confirmed valid and persisted.

---

## Gap #5: Network Timeouts During OAuth Flows

### Description of the Gap

OAuth involves multiple network requests that can timeout:

- Authorization endpoint (getting auth URL)
- Token exchange (code → tokens)
- Token refresh (refresh token → new access token)
- Userinfo endpoint (getting user profile)

**Not documented**:

- Appropriate timeout values for each endpoint
- Whether to retry on timeout
- How to distinguish timeout from other errors
- User communication during timeout
- Partial failure handling (timeout after partial response)

### Why It's Overlooked

OAuth examples assume reliable networks. Timeout handling is considered generic error handling rather than OAuth-specific concern.

### Impact Assessment

**Severity**: MEDIUM

**Timeout scenarios**:

```
Scenario A: User clicks authorize button → timeout → user confused (no feedback)
Scenario B: Token exchange timeout → user sees error → retries → duplicate auth attempts
Scenario C: Token refresh timeout → all operations fail → no recovery
```

**Consequences**:

- Poor user experience (hanging, unclear errors)
- Retry storms
- Duplicate authorization attempts
- Failed operations with valid credentials

### Questions That Need Answering

1. What timeout values are appropriate for OAuth endpoints?
2. Should timeouts be retried automatically?
3. How many retries before giving up?
4. How to communicate timeout to user?
5. Are timeouts transient or should they trigger fallback auth?

### Potential Workarounds

**Option A: Progressive Timeouts**

```typescript
async function exchangeCode(code: string, attempt = 1): Promise<Token> {
  const timeout = attempt * 5000; // 5s, 10s, 15s

  try {
    return await fetchWithTimeout('https://oauth2.googleapis.com/token', {
      timeout,
    });
  } catch (error) {
    if (error.name === 'TimeoutError' && attempt < 3) {
      console.error(`Timeout attempt ${attempt}, retrying...`);
      return exchangeCode(code, attempt + 1);
    }
    throw error;
  }
}
```

**Option B: User Notification**

```typescript
async function refreshToken(): Promise<Token> {
  const timeout = 10000; // 10 seconds

  try {
    return await fetchWithTimeout(refreshEndpoint, { timeout });
  } catch (error) {
    if (error.name === 'TimeoutError') {
      console.error('Token refresh timed out. Network may be slow or unavailable.');
      console.error('Operations will retry automatically.');
      throw new AuthError('REFRESH_TIMEOUT', 'Network timeout during token refresh');
    }
    throw error;
  }
}
```

**Option C: Fallback Strategy**

```typescript
async function getValidToken(): Promise<Token> {
  try {
    return await refreshToken({ timeout: 5000 });
  } catch (error) {
    if (error.code === 'TIMEOUT') {
      // Try longer timeout
      return await refreshToken({ timeout: 30000 });
    }
    throw error;
  }
}
```

**Recommendation**:

- Use **5-10 second timeouts** for OAuth endpoints
- **Retry 2-3 times** with exponential backoff
- **Communicate clearly** to users during timeouts
- **Log timeout events** for monitoring

---

## Gap #6: OAuth Consent Screen Rejection Handling

### Description of the Gap

Users can reject OAuth consent in multiple ways:

- Clicking "Cancel" or "Deny" button
- Closing consent screen browser tab
- Clicking back button
- Consent screen timeout (no action for extended period)

**Not documented**:

- How each rejection type is signaled (error codes, redirect params)
- Whether to retry after rejection
- How to detect accidental vs intentional rejection
- User communication after rejection
- Cleanup after rejection (state, session)

### Why It's Overlooked

OAuth examples assume users always approve consent. Rejection handling is an afterthought.

### Impact Assessment

**Severity**: LOW-MEDIUM

**User scenarios**:

```
Scenario A: User clicks "Deny" → unclear error → retries → annoyed
Scenario B: User accidentally closes tab → no feedback → confused about state
Scenario C: Consent times out → app hangs waiting for callback → bad UX
```

**Consequences**:

- Confusing error messages
- No guidance on how to proceed
- State inconsistency
- Memory leaks from orphaned auth sessions

### Questions That Need Answering

1. How to detect consent denial vs accidental closure?
2. Should app retry consent automatically?
3. How long to wait for consent before timing out?
4. How to clean up state after rejection?
5. Should rejection be logged for analytics?

### Potential Workarounds

**Option A: Error Code Detection**

```typescript
// OAuth callback receives error=access_denied
function handleOAuthCallback(params: URLSearchParams) {
  const error = params.get('error');

  if (error === 'access_denied') {
    console.error('Authorization was denied.');
    console.error('The application requires access to Google services to function.');
    console.error('Please run the authorization again and approve the requested permissions.');
    return;
  }

  // Continue with normal flow
}
```

**Option B: Timeout Detection**

```typescript
function initiateOAuth() {
  const authTimeout = setTimeout(() => {
    console.error('Authorization timed out after 5 minutes.');
    console.error('Please complete the authorization process in your browser.');
    cleanupAuthState();
  }, 300000); // 5 minutes

  // Cancel timeout on callback
  onCallback(() => clearTimeout(authTimeout));
}
```

**Option C: User Guidance**

```typescript
function handleAuthError(error: string) {
  const messages = {
    access_denied:
      'You denied access. To use this application, please authorize again and approve all requested permissions.',
    timeout: 'Authorization timed out. Please try again and complete the process within 5 minutes.',
    invalid_request: 'Authorization failed due to a technical error. Please try again.',
  };

  console.error(messages[error] || 'Authorization failed.');
}
```

**Recommendation**:

- Detect and handle `access_denied` error explicitly
- Implement 5-minute timeout for consent
- Provide clear user guidance on rejection
- Clean up state after timeout/rejection

---

## Gap #7: Refresh Token Rotation Security

### Description of the Gap

Google OAuth implements refresh token rotation where each refresh issues a new refresh token and invalidates the old one. This creates challenges:

- Old refresh token must be discarded immediately
- New refresh token must be persisted before use
- Failure to persist new token causes auth loss
- Concurrent refreshes can invalidate each other's tokens
- Server crashes during rotation lose both tokens

**Not documented**:

- How to atomically swap refresh tokens
- Recovery when new token fails to persist
- Handling concurrent refresh with rotation
- Testing refresh token rotation
- Detecting when rotation is enabled

### Why It's Overlooked

Many OAuth providers don't implement rotation. Documentation that covers it treats it as a simple swap without addressing failure modes.

### Impact Assessment

**Severity**: HIGH

**Critical failure scenario**:

```
1. Refresh token A
2. Receive new access token + refresh token B
3. Store access token successfully
4. Server crashes before storing refresh token B
5. Refresh token A now invalid (rotated)
6. Refresh token B lost (never persisted)
7. User must re-authenticate (no valid refresh token)
```

**Consequences**:

- Complete auth loss on persistence failure
- Frequent re-authentication required
- Data loss
- User frustration

### Questions That Need Answering

1. How to ensure atomic refresh token rotation?
2. Should refresh token be persisted before old token is invalidated?
3. What's the recovery strategy if persistence fails?
4. How to detect if provider implements rotation?
5. Should refresh tokens be backed up before rotation?

### Potential Workarounds

**Option A: Persist-First Pattern**

```typescript
async function refreshToken(): Promise<Token> {
  const oldRefreshToken = await getStoredRefreshToken();

  // Fetch new tokens
  const response = await fetchNewTokens(oldRefreshToken);

  // CRITICAL: Persist new refresh token BEFORE using it
  await persistTokens({
    accessToken: response.access_token,
    refreshToken: response.refresh_token, // Must persist this!
    expiresAt: Date.now() + response.expires_in * 1000,
  });

  // Old refresh token is now invalid, but we've saved new one
  return response;
}
```

**Option B: Two-Phase Persistence**

```typescript
async function refreshToken(): Promise<Token> {
  // Phase 1: Backup current token
  await backupToken('current', 'backup');

  try {
    // Phase 2: Fetch and persist new token
    const newTokens = await fetchNewTokens();
    await persistTokens(newTokens);

    // Phase 3: Delete backup
    await deleteBackup();

    return newTokens;
  } catch (error) {
    // Rollback: Restore from backup
    await restoreToken('backup', 'current');
    throw error;
  }
}
```

**Option C: Write-Ahead Log**

```typescript
async function refreshToken(): Promise<Token> {
  // Log intent to refresh
  await writeLog({ action: 'refresh_start', token: currentToken });

  try {
    const newTokens = await fetchNewTokens();

    // Log new token before committing
    await writeLog({ action: 'refresh_complete', token: newTokens });

    // Commit new token
    await persistTokens(newTokens);

    // Clear log
    await clearLog();

    return newTokens;
  } catch (error) {
    // Recover from log on restart
    await recoverFromLog();
    throw error;
  }
}
```

**Recommendation**: Use **Option A (Persist-First)** at minimum. For mission-critical applications, implement **Option B (Two-Phase)** or **Option C (Write-Ahead Log)** for crash recovery.

---

## Gap #8: OAuth Behind Corporate Proxies

### Description of the Gap

Many developers work behind corporate proxies that:

- Require authentication for outbound HTTPS
- Intercept SSL/TLS connections (MITM)
- Block certain domains (including OAuth providers)
- Inject headers or modify responses
- Cause certificate validation failures

**Not documented**:

- How to configure OAuth for proxy environments
- How to handle proxy authentication
- How to bypass SSL verification (for MITM proxies)
- How to detect and diagnose proxy issues
- Fallback strategies when OAuth is blocked

### Why It's Overlooked

Most documentation assumes direct internet access. Corporate proxy configurations are considered environment-specific.

### Impact Assessment

**Severity**: MEDIUM (affects corporate users)

**Common proxy errors**:

```
- ECONNREFUSED (proxy blocking OAuth domain)
- UNABLE_TO_VERIFY_LEAF_SIGNATURE (MITM cert issues)
- ETIMEDOUT (proxy authentication required)
- ENOTFOUND (DNS issues via proxy)
```

**Consequences**:

- OAuth completely non-functional in corporate environments
- Developers can't test OAuth features
- Need complex workarounds or VPNs
- Security team concerns about bypassing proxy

### Questions That Need Answering

1. How to detect if running behind a proxy?
2. How to configure OAuth libraries for proxy use?
3. Should SSL verification be disabled for corporate MITM?
4. How to handle proxy authentication credentials?
5. What's the fallback when OAuth is blocked?

### Potential Workarounds

**Option A: Proxy Configuration**

```typescript
import https from 'https';
import { HttpsProxyAgent } from 'https-proxy-agent';

const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;

const agent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined;

// Configure OAuth client with proxy
const oauth2Client = new OAuth2Client({
  httpAgent: agent,
  httpsAgent: agent,
});
```

**Option B: Certificate Handling**

```typescript
import https from 'https';

// For corporate MITM proxies (use with caution!)
const agent = new https.Agent({
  rejectUnauthorized: process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0',
  ca: process.env.NODE_EXTRA_CA_CERTS
    ? fs.readFileSync(process.env.NODE_EXTRA_CA_CERTS)
    : undefined,
});
```

**Option C: Proxy Detection**

```typescript
function detectProxy(): string | null {
  return (
    process.env.HTTPS_PROXY ||
    process.env.HTTP_PROXY ||
    process.env.https_proxy ||
    process.env.http_proxy ||
    null
  );
}

if (detectProxy()) {
  console.log(`Detected proxy: ${detectProxy()}`);
  console.log('Configuring OAuth for proxy environment...');
}
```

**Recommendation**:

- Respect standard proxy environment variables (HTTPS_PROXY, HTTP_PROXY)
- Document proxy configuration clearly
- Provide option to trust corporate CA certificates
- Include proxy troubleshooting guide

---

## Gap #9: OAuth Scope Creep and Updates

### Description of the Gap

OAuth applications often need to request additional scopes over time:

- New features require new permissions
- Initial scope request was too narrow
- User previously denied a scope, now needs it
- Scopes change their definitions (provider updates)

**Not documented**:

- How to request additional scopes without re-auth
- How to detect when new scopes are needed
- Whether to request all scopes upfront or incrementally
- How to communicate scope changes to users
- Migration strategy when scopes change

### Why It's Overlooked

Documentation shows initial auth setup but not long-term scope management and updates.

### Impact Assessment

**Severity**: LOW-MEDIUM

**Scope update scenarios**:

```
Scenario A: v1.0 needs drive.readonly → v2.0 needs drive.metadata → requires re-auth
Scenario B: User denied gmail scope → new feature needs gmail → no way to request again
Scenario C: Google updates scope definitions → existing tokens become invalid
```

**Consequences**:

- Forced re-authentication for scope updates
- User confusion about why re-auth is needed
- Loss of refresh tokens during migration
- Feature launch delays due to auth complexity

### Questions That Need Answering

1. Can you request additional scopes without full re-auth?
2. How to detect insufficient scopes at runtime?
3. Should you request maximum scopes upfront or minimum?
4. How to communicate scope requirements to users?
5. What's the migration path for scope changes?

### Potential Workarounds

**Option A: Incremental Authorization**

```typescript
async function ensureScope(requiredScope: string): Promise<void> {
  const currentScopes = await getCurrentScopes();

  if (!currentScopes.includes(requiredScope)) {
    console.log(`Additional permission required: ${requiredScope}`);
    console.log('Please re-authorize to grant this permission.');

    // Trigger re-auth with additional scope
    await reauthorize([...currentScopes, requiredScope]);
  }
}

// Before using feature
await ensureScope('gmail.readonly');
await readGmail();
```

**Option B: Scope Validation at Startup**

```typescript
const REQUIRED_SCOPES = ['drive.readonly', 'drive.metadata.readonly', 'gmail.readonly'];

async function validateScopes(): Promise<void> {
  const granted = await getGrantedScopes();
  const missing = REQUIRED_SCOPES.filter((s) => !granted.includes(s));

  if (missing.length > 0) {
    console.error(`Missing required scopes: ${missing.join(', ')}`);
    console.error('Please re-authorize with all required permissions.');
    process.exit(1);
  }
}
```

**Option C: Feature Flagging**

```typescript
async function isFeatureAvailable(feature: string): Promise<boolean> {
  const requiredScopes = FEATURE_SCOPES[feature];
  const grantedScopes = await getGrantedScopes();

  return requiredScopes.every((scope) => grantedScopes.includes(scope));
}

// Conditionally show features
if (await isFeatureAvailable('gmail')) {
  registerGmailTools();
}
```

**Recommendation**:

- Validate scopes at startup and provide clear error messages
- Request maximum reasonable scopes upfront to avoid re-auth
- Use feature flagging to gracefully disable unavailable features
- Document scope requirements in user-facing documentation

---

## Gap #10: Token Leakage in Logs and Error Messages

### Description of the Gap

OAuth tokens can accidentally leak through:

- Debug logging
- Error stack traces
- HTTP request logs
- System error messages
- Crash dumps
- Analytics events
- Monitoring systems

**Not documented**:

- How to sanitize logs of token data
- What parts of tokens are safe to log
- How to debug OAuth without exposing tokens
- How to detect token leakage
- Incident response when tokens are leaked

### Why It's Overlooked

Security considerations are often separate from authentication documentation. Developers may not realize tokens are in logs until after leakage.

### Impact Assessment

**Severity**: HIGH (Security vulnerability)

**Leakage examples**:

```typescript
// BAD: Token in debug log
console.log('Making request:', { url, headers: { Authorization: `Bearer ${token}` } });

// BAD: Token in error message
throw new Error(`Request failed with token: ${token}`);

// BAD: Token in URL
const url = `https://api.example.com/data?access_token=${token}`;

// BAD: Full error with token
try {
  await fetch(url, { headers: { Authorization: token } });
} catch (error) {
  console.error('Request failed:', error); // May include headers
}
```

**Consequences**:

- Exposed tokens can be stolen from logs
- Compromised tokens allow unauthorized access
- Compliance violations (PCI, HIPAA, GDPR)
- Security audits failures
- Difficult to revoke leaked tokens

### Questions That Need Answering

1. Which parts of tokens are safe to log (if any)?
2. How to debug OAuth issues without logging tokens?
3. How to automatically sanitize logs?
4. How to detect if tokens have been logged?
5. What's the response plan for token leakage?

### Potential Workarounds

**Option A: Automatic Token Redaction**

```typescript
function sanitizeForLogging(obj: any): any {
  const sensitive = ['authorization', 'access_token', 'refresh_token', 'token', 'bearer'];

  if (typeof obj === 'string') {
    // Redact Bearer tokens
    return obj.replace(/Bearer\s+[\w-]+/gi, 'Bearer [REDACTED]');
  }

  if (typeof obj === 'object') {
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      if (sensitive.includes(key.toLowerCase())) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = sanitizeForLogging(value);
      }
    }
    return sanitized;
  }

  return obj;
}

// Use for logging
console.log('Request:', sanitizeForLogging(requestConfig));
```

**Option B: Token Prefix Logging**

```typescript
function safeTokenLog(token: string): string {
  // Only log first 8 chars for identification
  return token.substring(0, 8) + '...[' + (token.length - 8) + ' chars]';
}

console.log('Using token:', safeTokenLog(accessToken));
// Output: "Using token: ya29.a0A...[247 chars]"
```

**Option C: Structured Logging with Redaction**

```typescript
import pino from 'pino';

const logger = pino({
  redact: {
    paths: [
      'headers.authorization',
      'headers.Authorization',
      'access_token',
      'refresh_token',
      'token',
      '*.token',
      '*.access_token',
      '*.refresh_token',
    ],
    censor: '[REDACTED]',
  },
});

logger.info({ url, headers }, 'Making request');
// Automatically redacts sensitive fields
```

**Recommendation**:

- Use structured logging with automatic redaction (Option C)
- NEVER log full tokens, even in debug mode
- Log only token prefixes for debugging (Option B)
- Implement token sanitization in error handlers
- Review logs regularly for accidental leakage
- Add pre-commit hooks to detect tokens in code

---

## Research Priorities

Based on severity and frequency:

1. **CRITICAL**: Concurrent token refresh race conditions (affects production under load)
2. **HIGH**: Refresh token rotation security (data loss risk)
3. **HIGH**: Token leakage in logs (security vulnerability)
4. **MEDIUM**: Partial scope authorization (poor UX)
5. **MEDIUM**: Network timeouts (common operational issue)
6. **LOW**: OAuth consent rejection handling (edge case)

---

## Recommendations for Pulse Fetch

1. **Implement token refresh mutex** to prevent race conditions
2. **Use persist-first pattern** for refresh token rotation
3. **Add automatic log redaction** for tokens
4. **Validate granted scopes** after authorization
5. **Implement robust timeout** handling with retries
6. **Handle consent rejection** gracefully with clear messaging
7. **Support corporate proxies** via standard env vars
8. **Document error scenarios** with recovery steps
9. **Add monitoring** for OAuth errors in production
10. **Create incident playbook** for token leakage

---

## Additional Research Needed

- Benchmark concurrent refresh performance under load
- Test refresh token rotation failure scenarios
- Audit codebase for token leakage vectors
- Survey OAuth error rates in production MCP servers
- Create automated security scanning for token exposure
