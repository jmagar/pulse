# Systems Analysis: OAuth Failure Modes and Cascading Effects

## Executive Summary

OAuth integration in MCP servers is a complex distributed system with multiple failure points. This analysis catalogs failure modes, cascading effects, feedback loops, and system-level impacts. Understanding these failure modes is critical for building resilient MCP servers that maintain user trust.

## Failure Mode Taxonomy

### Category 1: Authentication Failures

#### FM-1.1: Initial Authorization Failure

**Trigger:** User attempts OAuth but consent screen doesn't complete

**Root Causes:**

- Browser doesn't open (headless environment, permissions issue)
- Redirect URL misconfigured
- State parameter mismatch (CSRF protection)
- User closes consent screen prematurely
- Google OAuth service outage

**Cascading Effects:**

```
Authorization fails
  → MCP tool returns error to Claude
    → Claude reports to user: "Unable to authorize Gmail access"
      → User attempts again (retry loop)
        → Still fails (root cause unchanged)
          → User files GitHub issue
            → Developer investigates
              → Finds redirect URL misconfigured
                → Fixes config, deploys update
                  → User must update MCP server
                    → Update notification? (probably not)
                      → User doesn't know fix exists
                        → Continues to experience failure
                          → Abandons MCP server
```

**Stakeholder Impacts:**

- **User:** Frustrated, no API access
- **Developer:** Support burden, reputation damage
- **Google:** None (their service worked correctly)
- **Anthropic:** Ecosystem quality perception damaged

**Detection Difficulty:** Medium (error logs show failure, but root cause requires investigation)

**Mitigation Strategies:**

1. Validate redirect URL configuration at server startup
2. Provide detailed error messages (not just "auth failed")
3. Add troubleshooting guide to documentation
4. Log full OAuth error response for debugging

#### FM-1.2: Token Refresh Failure

**Trigger:** Access token expires, refresh attempt fails

**Root Causes:**

- Refresh token revoked by user
- Refresh token expired (testing/unverified app)
- Refresh token rotated and not updated
- Network failure during refresh
- Google OAuth API rate limit hit
- Concurrent refresh requests (race condition)

**Cascading Effects:**

**Scenario A: Silent Failure**

```
Token refresh fails
  → MCP tool returns generic error
    → Claude shows: "Unable to access Gmail"
      → User thinks: "Gmail is down" or "MCP server is broken"
        → Doesn't realize re-authorization needed
          → Continues to get errors
            → Frustration builds
              → Files bug report with limited info
                → Developer struggles to diagnose
                  → Time wasted on both sides
```

**Scenario B: Visible Failure with Poor UX**

```
Token refresh fails
  → MCP tool returns: "Error: invalid_grant"
    → Claude shows raw error to user
      → User confused by technical jargon
        → Doesn't know what action to take
          → Searches "invalid_grant OAuth"
            → Finds generic StackOverflow answers
              → Not MCP-specific
                → User still stuck
```

**Scenario C: Optimal Failure Handling**

```
Token refresh fails
  → MCP tool detects refresh failure
    → Returns: "Gmail authorization expired. Please re-authorize: [URL]"
      → Claude shows clear message with action
        → User clicks URL
          → Re-authorization flow begins
            → Completes successfully
              → Normal operation resumed
```

**Failure Rate Analysis:**

```
Estimated Refresh Failure Rate: 0.1-1% per refresh attempt

Contributing Factors:
- Network reliability: 99.9% → 0.1% failure rate
- Refresh token validity: 99% (assuming rare revocations) → 1% failure rate
- Google API availability: 99.95% → 0.05% failure rate
- Implementation bugs: 95-99% (depends on code quality) → 1-5% failure rate

Compound Failure Rate: 1.15-6.15% per refresh attempt

Over 1000 users with 10 refreshes/day:
  10,000 refreshes/day × 1.15% = 115-615 failures/day

If not handled gracefully:
  → 115-615 support requests/day
  → Unsustainable for small developer teams
```

**Mitigation Strategies:**

1. Implement retry logic with exponential backoff
2. Differentiate between transient (network) and permanent (revoked) failures
3. Provide clear, actionable error messages
4. Log detailed diagnostics for post-mortem analysis
5. Add mutex to prevent concurrent refresh attempts

#### FM-1.3: Token Storage Corruption

**Trigger:** Token data becomes corrupted or inaccessible

**Root Causes:**

- File system full (file-based storage)
- Permissions changed (file became unreadable)
- Partial write during crash (token file incomplete)
- Encryption key lost (if using encrypted storage)
- OS keychain database corruption (rare but possible)
- Serialization bug (e.g., undefined becomes "undefined" string)

**Cascading Effects:**

```
Token file corrupted during server crash
  → Next server start attempts to read tokens
    → JSON.parse() throws error
      → Server fails to initialize
        → MCP server crashes on startup
          → Claude Desktop shows: "MCP server unavailable"
            → User has no access to any tools
              → Not just OAuth-based tools, ALL tools
                → Complete MCP server outage
```

**Criticality:** HIGH - Single corrupted token file can break entire MCP server

**Real-World Scenario:**

```
User's disk fills up during token write
  → write() call fails mid-operation
    → Token file left in partial state
      → { "access_token": "ya29.a0AfB_..." } (missing closing brace)
        → Next startup: JSON.parse() fails
          → Server crashes
            → Error message unclear
              → User doesn't connect disk full to MCP crash
                → Reports "MCP server randomly stopped working"
                  → Developer investigates logs
                    → Finds JSON parse error
                      → Advises user to delete token file
                        → User must re-authorize
                          → But root cause (disk full) not addressed
                            → Will happen again
```

**Mitigation Strategies:**

1. **Atomic writes:** Write to temp file, then rename (atomic operation)
2. **Validation:** Validate token structure before persisting
3. **Fallback:** If token read fails, continue startup without tokens (not crash)
4. **Backup:** Keep previous version of token file (`.bak` suffix)
5. **Graceful degradation:** Catch storage errors, return "re-auth needed" not crash

**Code Pattern:**

```typescript
async function saveTokens(tokens: TokenData): Promise<void> {
  const tempPath = `${tokenPath}.tmp`;
  try {
    // Write to temp file first
    await fs.writeFile(tempPath, JSON.stringify(tokens, null, 2));
    // Validate by reading back
    const validation = JSON.parse(await fs.readFile(tempPath, 'utf-8'));
    if (!validation.access_token) throw new Error('Invalid token structure');
    // Atomic rename (overwrites old file)
    await fs.rename(tempPath, tokenPath);
  } catch (error) {
    // Clean up temp file on failure
    await fs.unlink(tempPath).catch(() => {});
    throw error;
  }
}

async function loadTokens(): Promise<TokenData | null> {
  try {
    const data = await fs.readFile(tokenPath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    // Don't crash server on token read failure
    console.error('Failed to load tokens:', error);
    return null; // User will need to re-authorize
  }
}
```

### Category 2: Configuration Failures

#### FM-2.1: Missing Environment Variables

**Trigger:** Required OAuth credentials not set

**Root Causes:**

- `.env` file not created
- Environment variables not exported in shell
- Typo in variable name (`CLIENT_ID` vs `GOOGLE_CLIENT_ID`)
- Variables not passed to Docker container
- Variables cleared during system restart

**Cascading Effects:**

```
GOOGLE_CLIENT_ID not set
  → OAuth client initialization fails
    → MCP server startup continues (no validation)
      → User attempts OAuth
        → Generic error: "OAuth not configured"
          → User checks .env file
            → Finds CLIENT_ID set (but server expects GOOGLE_CLIENT_ID)
              → User confused: "But I set it!"
                → Files GitHub issue
                  → Developer realizes naming inconsistency
                    → Updates docs to clarify
                      → But existing users still confused
```

**Prevention:** Fail fast at startup with clear error

```typescript
// Startup validation
const requiredVars = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'REDIRECT_URI'];
const missing = requiredVars.filter((v) => !process.env[v]);
if (missing.length > 0) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  console.error('Please set these in .env file or export in shell');
  process.exit(1); // Fail fast, don't start server in broken state
}
```

#### FM-2.2: Redirect URL Mismatch

**Trigger:** Redirect URL in code doesn't match Google Cloud Console configuration

**Root Causes:**

- Developer used `localhost:3000` in testing
- Forgot to update to production URL
- Google Console has `http://` but code uses `https://`
- Port number mismatch
- Path mismatch (`/callback` vs `/oauth/callback`)

**Cascading Effects:**

```
Redirect URL mismatch
  → User completes consent screen
    → Google redirects to URL in Console: http://localhost:3000/callback
      → But MCP server listening at: http://localhost:8080/oauth/callback
        → HTTP 404 Not Found
          → User sees blank error page
            → Authorization code generated but never captured
              → OAuth flow stuck in pending state
                → User's browser tab just sits there
                  → User closes tab, tries again
                    → Same result
                      → Reports: "OAuth doesn't work"
```

**Detection Difficulty:** HIGH - Error happens in browser, not in server logs

**Debugging Story:**

```
Developer receives report: "OAuth hangs on Google redirect"
  → Developer checks server logs: No errors
    → Developer checks Google OAuth logs: Shows successful authorization
      → But token never issued?
        → Developer realizes: Authorization code never received
          → Checks redirect URL config
            → Finds mismatch
              → Fixes in Google Console OR code
                → Must communicate to users which URL to configure
                  → Documentation updated
                    → But existing users already configured wrong URL
                      → Must re-configure in Google Console
                        → Another barrier to working setup
```

**Mitigation Strategies:**

1. **Validate redirect URL at startup** (warn if suspicious)
2. **Log expected redirect URL** in server output on startup
3. **Documentation:** Provide exact copy-paste values for Google Console
4. **Setup script:** Automate redirect URL generation

#### FM-2.3: OAuth Scope Misconfiguration

**Trigger:** Scopes in code don't match tool requirements

**Root Causes:**

- Developer requests minimal scope (e.g., `gmail.readonly`)
- Later adds feature requiring write scope (e.g., `gmail.compose`)
- Forgets to update scope list in OAuth configuration
- Testing with user who previously granted broader scope (works in dev)
- New users only get minimal scope (breaks in prod)

**Cascading Effects:**

```
MCP server requests only gmail.readonly scope
  → User authorizes
    → Token issued with readonly scope
      → User tries tool: "Delete this email"
        → MCP tool attempts Gmail delete API call
          → 403 Forbidden (insufficient scope)
            → Tool returns error: "Insufficient permissions"
              → User confused: "But I authorized Gmail access?"
                → User doesn't understand scope granularity
                  → Re-authorization doesn't help (same minimal scope)
                    → User abandons feature
```

**Hidden Danger: Cached Tokens**

```
Developer testing with token that has broad scope (from earlier testing)
  → New feature works in dev
    → Ships to production
      → New users get minimal scope only
        → Feature broken for new users
          → But developer can't reproduce (their token still has broad scope)
            → Bug report: "Works for some users, not others"
              → Confusing, time-consuming debugging
```

**Mitigation Strategies:**

1. **Dynamic scope requests:** Request scopes just-in-time based on tool used
2. **Incremental authorization:** Add scopes when needed, not all upfront
3. **Testing with fresh tokens:** Clear tokens before testing new features
4. **Scope validation:** Check token scopes match tool requirements at runtime

### Category 3: Timing and Race Conditions

#### FM-3.1: Concurrent Token Refresh

**Trigger:** Multiple API calls simultaneously detect expired token

**Root Causes:**

- Token expires during burst of API requests
- No mutex around refresh logic
- Async operations don't wait for ongoing refresh

**Cascading Effects:**

```
Time T=0: Token expires
Time T=1: Tool A calls Gmail API → 401 Unauthorized
Time T=1.1: Tool B calls Calendar API → 401 Unauthorized
Time T=1.2: Tool A initiates refresh (generates new access token + refresh token)
Time T=1.3: Tool B also initiates refresh (using old refresh token)
Time T=2: Tool A refresh succeeds
  → New tokens: AT2, RT2
  → Stores RT2
Time T=2.5: Tool B refresh fails (RT1 no longer valid if Google rotated it)
  → Error: invalid_grant
Time T=3: Tool B reports auth failure to user
  → But Tool A working fine?
    → Intermittent auth failures
      → Impossible to reproduce consistently
        → "Flaky" auth system
          → User trust erodes
```

**Frequency:** Rare but high-impact when it occurs

**Probability Calculation:**

```
Assume:
- Token lifetime: 3600 seconds
- Average API calls per hour: 10
- API call duration: 500ms

Probability of concurrent expiration detection:
  = P(two calls within 500ms window after expiration)
  = Very low for low-traffic server
  = Significant for high-traffic server

Burst scenario (user asks Claude to "summarize all my emails"):
  → 100 Gmail API calls in parallel
  → If token expired, all 100 detect simultaneously
  → 100 concurrent refresh attempts
  → Catastrophic failure
```

**Mitigation: Refresh Mutex**

```typescript
class TokenManager {
  private refreshPromise: Promise<Tokens> | null = null;

  async getValidToken(): Promise<string> {
    if (this.isTokenValid()) {
      return this.currentToken.access_token;
    }

    // If refresh already in progress, wait for it
    if (this.refreshPromise) {
      const tokens = await this.refreshPromise;
      return tokens.access_token;
    }

    // Start new refresh, store promise
    this.refreshPromise = this.performRefresh();
    try {
      const tokens = await this.refreshPromise;
      return tokens.access_token;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async performRefresh(): Promise<Tokens> {
    // Actual refresh logic here
  }
}
```

#### FM-3.2: Token Expiration During Long-Running Operation

**Trigger:** Operation takes >1 hour, token expires mid-operation

**Root Causes:**

- User requests large data export
- API rate limits slow down operation
- No token refresh during operation

**Cascading Effects:**

```
User: "Export all my Gmail messages to text file"
  → MCP tool starts processing
    → 1000 emails to fetch
      → Each API call takes 1 second
        → 1000 seconds = 16.6 minutes total
          → But: Gmail API rate limit: 250 requests/minute
            → Must spread over 4 minutes minimum
              → Still within 1-hour token lifetime, should be fine

But then:
  → User's network hiccups
    → Some requests retry
      → 20 minutes elapsed
        → 500 emails processed
          → Token still valid

  → User asks another question mid-export
    → Claude calls different MCP tool
      → That tool also uses same token
        → More API calls
          → 45 minutes elapsed
            → 800 emails processed
              → Token expires in 15 minutes

  → Network issue causes more retries
    → 60 minutes elapsed
      → Token expires
        → Next API call fails
          → 401 Unauthorized
            → Export fails at 850/1000 emails
              → Partial results lost?
                → User must restart entire export
                  → 14 minutes of work wasted
```

**Mitigation Strategies:**

1. **Proactive refresh during long operations**
2. **Checkpointing:** Save progress, resume on failure
3. **Token validity checks before each API call**
4. **Streaming results:** Return partial results as available

#### FM-3.3: Server Restart During OAuth Flow

**Trigger:** Server restarts while user completing consent screen

**Root Causes:**

- Developer manually restarts for debugging
- Auto-restart on file change (dev mode)
- Crash during OAuth flow
- Server update deployment

**Cascading Effects:**

```
User clicks "Authorize Gmail access"
  → Browser opens to Google consent screen
    → MCP server generates state parameter, stores in memory
      → User reads permissions, decides to proceed
        → User clicks "Allow"
          → Google redirects back to MCP server with auth code
            → But: Server restarted during user's decision time
              → State parameter lost (was in memory)
                → Cannot validate state (CSRF protection)
                  → Must reject auth code (security requirement)
                    → User sees: "Authorization failed: invalid state"
                      → User confused: "But I clicked Allow?"
                        → Must start over
                          → Second attempt works (if server stays up)
```

**Frequency:** High in development, rare in production

**User Impact:** Frustration, perception of unreliability

**Mitigation Strategies:**

1. **Persist state parameter** to disk/database (not just memory)
2. **Longer state timeout** (5-10 minutes instead of 1-2)
3. **Clear user feedback:** "Authorization in progress, please don't restart server"
4. **Idempotent auth flow:** Allow retries with same state parameter

### Category 4: Network and External Dependencies

#### FM-4.1: Network Timeout During OAuth Flow

**Trigger:** Network request times out

**Root Causes:**

- Google OAuth API slow to respond
- User's network connection unstable
- Firewall blocking OAuth traffic
- DNS resolution failure
- Proxy configuration issues

**Cascading Effects:**

```
User initiates authorization
  → MCP server makes request to Google: "https://accounts.google.com/o/oauth2/v2/auth"
    → DNS lookup times out (10 seconds)
      → OR: Connection times out (30 seconds)
        → OR: Read times out (60 seconds)
          → Request fails with timeout error
            → Generic error shown to user
              → User doesn't know if problem is:
                - Their network
                - Google's service
                - MCP server bug
              → Retries (may timeout again)
                → Gives up
```

**Diagnosis Difficulty:** HIGH - Timeouts look like hangs from user perspective

**Mitigation Strategies:**

1. **Aggressive timeouts with retries** (fail fast, retry)
2. **Clear timeout error messages:** "Could not reach Google OAuth service (timeout after 30s)"
3. **Connectivity check:** Ping Google OAuth endpoint at startup, warn if unreachable
4. **Fallback domains:** If `.com` times out, try regional domains

#### FM-4.2: Google OAuth API Outage

**Trigger:** Google's OAuth service experiences downtime

**Root Causes:**

- Google datacenter outage
- DDoS attack on Google infrastructure
- Planned maintenance
- Regional network issues

**Cascading Effects:**

```
Google OAuth API goes down (rare but happens)
  → All MCP servers using Google OAuth affected
    → New authorizations fail completely
      → Token refreshes fail completely
        → Within 1 hour, all users lose access
          → Flood of GitHub issues across all MCP servers
            → "Gmail integration stopped working"
              → Developers investigate, find Google 503 errors
                → Can't fix (external dependency)
                  → Must wait for Google to resolve
                    → Meanwhile: User frustration
                      → "Why does AI assistant depend on Google being up?"
                        → Architectural critique emerges
```

**Historical Example:** Google OAuth outage on [hypothetical date]

- Duration: 2 hours
- Impact: All OAuth-dependent services affected
- MCP server developer response: None (can't fix external dependency)
- User perception: "MCP servers are unreliable"

**Mitigation Strategies:**

1. **Status page monitoring:** Check Google Cloud Status before retrying
2. **Graceful degradation:** Non-OAuth features continue working
3. **User communication:** "Google OAuth service unavailable, retrying..."
4. **Exponential backoff:** Don't hammer Google with retries during outage

#### FM-4.3: Rate Limit Exhaustion

**Trigger:** Too many OAuth requests exceed Google's rate limits

**Root Causes:**

- Many users authorizing simultaneously
- Token refresh loop (bug causing constant refreshes)
- DDoS attack on MCP server
- Misconfigured retry logic

**Google's Rate Limits (approximate):**

- OAuth requests: 10,000/day per project
- Token refreshes: Unlimited (but monitored for abuse)
- API calls (post-auth): Varies by service

**Cascading Effects:**

```
MCP server has bug in refresh logic
  → Refreshes token every 10 seconds instead of every hour
    → 360x increase in refresh rate
      → Multiple users affected
        → 100 users × 8640 refreshes/day = 864,000 refreshes/day
          → Exceeds Google's abuse threshold
            → Google throttles project
              → ALL users of this MCP server affected
                → Even users not triggering bug
                  → Collective punishment for one bug
                    → Mass user churn
                      → Developer reputation destroyed
```

**Detection:** Monitor rate limit headers in Google API responses

```typescript
const response = await oauth2Client.refreshAccessToken();

// Check rate limit headers (if provided)
const remaining = response.headers['x-ratelimit-remaining'];
const reset = response.headers['x-ratelimit-reset'];

if (remaining && parseInt(remaining) < 100) {
  console.warn('OAuth rate limit nearly exhausted:', remaining, 'remaining');
  // Alert developer, investigate cause
}
```

**Mitigation Strategies:**

1. **Rate limit monitoring** with alerts
2. **Circuit breaker:** Stop retries if rate limit hit
3. **Exponential backoff** with jitter
4. **Caching:** Avoid unnecessary token refreshes

### Category 5: Security Failures

#### FM-5.1: Token Leakage via Logs

**Trigger:** Access token or refresh token logged in plaintext

**Root Causes:**

- Debug logging enabled in production
- Error stack traces include token values
- Request/response logging includes headers
- Token value in URL (bad practice)

**Cascading Effects:**

```
Developer adds debug logging during troubleshooting
  → console.log('Token response:', JSON.stringify(tokens))
    → Logs written to file
      → Log rotation doesn't clean old logs
        → Logs backed up to cloud storage
          → Backup storage has public read access (misconfiguration)
            → Attacker finds log file
              → Extracts refresh tokens
                → Uses tokens to access user accounts
                  → Data breach
                    → Users notified
                      → Reputational damage
                        → Legal liability
                          → MCP server shut down
```

**Real-World Pattern:**

```typescript
// DANGEROUS: Logs entire token object
console.log('OAuth response:', response.data);

// SAFE: Logs only non-sensitive metadata
console.log('OAuth response:', {
  expires_in: response.data.expires_in,
  token_type: response.data.token_type,
  scope: response.data.scope,
  // Redact actual tokens
  access_token: response.data.access_token ? '[REDACTED]' : null,
  refresh_token: response.data.refresh_token ? '[REDACTED]' : null,
});
```

**Prevention Checklist:**

1. ✅ Never log token values
2. ✅ Redact tokens in error messages
3. ✅ Disable debug logging in production
4. ✅ Review all console.log/logger statements
5. ✅ Use structured logging with automatic redaction

#### FM-5.2: Token Storage in Plain Text

**Trigger:** Tokens stored without encryption

**Root Causes:**

- Developer prioritizes simplicity over security
- "It's just on user's machine" assumption
- Lack of security knowledge

**Cascading Effects:**

```
MCP server stores tokens in: ~/.mcp/tokens.json (unencrypted)
  → File permissions: 644 (world-readable)
    → Other users on system can read file
      → OR: Malware scans for common token paths
        → Finds ~/.mcp/tokens.json
          → Reads refresh token
            → Exfiltrates to command-and-control server
              → Attacker uses token to access victim's Gmail
                → Reads emails, sends phishing emails from victim's account
                  → Victim discovers unauthorized access
                    → Revokes all OAuth tokens
                      → MCP server breaks
                        → Victim blames MCP server: "It compromised my account"
                          → Bad press for entire MCP ecosystem
```

**Attack Surface:**

- Local privilege escalation
- Malware/spyware
- Backup systems with weak access control
- Insider threats (shared computers)

**Mitigation Strategies:**

1. **OS keychain** (best): System-level security
2. **Encrypted files** (good): Requires encryption key
3. **Restrictive permissions** (minimum): chmod 600
4. **Never plaintext** (unacceptable)

#### FM-5.3: CSRF Attack on OAuth Callback

**Trigger:** Attacker tricks user into completing attacker's OAuth flow

**Attack Scenario:**

```
1. Attacker initiates OAuth flow for their MCP server
   → Generates auth URL with attacker's state parameter

2. Attacker sends link to victim (phishing email)
   → Victim clicks, thinks they're authorizing their own MCP server

3. Victim completes Google consent screen
   → Victim's account linked to attacker's MCP server instance

4. Attacker's MCP server receives victim's auth code
   → Exchanges for victim's tokens
   → Attacker can now access victim's Google account
```

**Prevention: State Parameter**

```typescript
// Generate cryptographically random state
const state = crypto.randomBytes(32).toString('hex');

// Store state associated with user session
await stateStore.set(state, {
  userId: currentUser.id,
  timestamp: Date.now(),
  expiresAt: Date.now() + 300000, // 5 minutes
});

// Include in auth URL
const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: SCOPES,
  state: state,
});

// Later, validate callback:
const returnedState = req.query.state;
const storedData = await stateStore.get(returnedState);

if (!storedData) {
  throw new Error('Invalid state parameter (CSRF attack?)');
}

if (storedData.expiresAt < Date.now()) {
  throw new Error('State expired, please retry authorization');
}

if (storedData.userId !== currentUser.id) {
  throw new Error('State parameter mismatch (CSRF attack?)');
}
```

### Category 6: User Experience Failures

#### FM-6.1: Unclear Error Messages

**Trigger:** Technical error shown to non-technical user

**Examples:**

```
Bad: "Error: invalid_grant"
Good: "Gmail authorization expired. Please click here to re-authorize."

Bad: "ECONNREFUSED 127.0.0.1:8080"
Good: "Could not reach OAuth callback server. Ensure server is running."

Bad: "JWT token expired"
Good: "Your session expired. Please authorize access to Gmail again."

Bad: "Scope 'https://www.googleapis.com/auth/gmail.modify' not granted"
Good: "Gmail write permission required for this feature. Please re-authorize with additional permissions."
```

**Impact:** User confusion, support burden, abandonment

**Mitigation:** Error message mapping layer

```typescript
function userFriendlyError(error: OAuthError): string {
  const errorMap: Record<string, string> = {
    invalid_grant: 'Authorization expired. Please re-authorize.',
    invalid_client: 'OAuth configuration error. Please contact developer.',
    access_denied: 'You denied permission. This feature requires access to Gmail.',
    invalid_scope: 'Invalid permissions requested. Please contact developer.',
  };

  return errorMap[error.code] || `Authentication error: ${error.message}`;
}
```

#### FM-6.2: Overly Broad Scope Request

**Trigger:** MCP server requests more permissions than necessary

**Example:**

```
MCP server only needs to read email subjects
  → But requests: https://mail.google.com/ (full Gmail access)
    → User sees: "Read, compose, send, and delete all your email"
      → User thinks: "Why does it need to delete email?"
        → User abandons authorization
          → Adoption loss
```

**System-Level Impact:**

```
Multiple MCP servers request broad scopes
  → Users see many scary consent screens
    → Users develop "OAuth fatigue"
      → Start denying permissions by default
        → Even legitimate requests get denied
          → Reduces utility of entire MCP ecosystem
```

**Mitigation:**

1. **Request minimal scopes** actually needed
2. **Document why each scope needed** in consent screen description
3. **Just-in-time authorization:** Request additional scopes only when feature used

#### FM-6.3: No Indication of Authorization Status

**Trigger:** User doesn't know if they're authorized or not

**Poor UX Flow:**

```
User installs MCP server
  → User: "Claude, what's in my Gmail inbox?"
    → Claude: "I don't have access to Gmail"
      → User: "Oh, I need to authorize"
        → User: "How do I authorize?"
          → Claude: "Click this link: [URL]"
            → User authorizes
              → User: "Claude, what's in my Gmail inbox?"
                → Claude: "You have 15 unread messages..."
```

**Better UX Flow:**

```
User installs MCP server
  → Server startup message: "Gmail integration ready. Authorize here: [URL]"
    → User authorizes proactively
      → Server: "Successfully authorized Gmail access"
        → User: "Claude, what's in my Gmail inbox?"
          → Claude: "You have 15 unread messages..."
```

**Best UX Flow (Future MCP Feature):**

```
User installs MCP server
  → Claude proactively suggests: "I can now access Gmail. Would you like to authorize?"
    → User: "Yes"
      → Inline authorization flow
        → Claude: "Authorization complete. What would you like to know about your Gmail?"
```

## Failure Mode Interaction Matrix

| Failure Mode             | Triggers                                  | Is Triggered By                      | Compounding Effect                     |
| ------------------------ | ----------------------------------------- | ------------------------------------ | -------------------------------------- |
| Token Refresh Failure    | Token Storage Corruption, Network Timeout | Token Expiration                     | Cascades to all OAuth-dependent tools  |
| Token Storage Corruption | Server Crash, Disk Full                   | Partial Write                        | Breaks entire MCP server startup       |
| Concurrent Refresh       | Token Expiration + Burst Traffic          | No Mutex                             | Refresh token invalidation             |
| Rate Limit               | Retry Loop, High Traffic                  | Any OAuth failure + aggressive retry | Affects all users of same project      |
| Network Timeout          | DNS failure, Firewall                     | User environment                     | Looks like OAuth bug, hard to diagnose |
| Unclear Error Messages   | Any failure                               | Poor error handling                  | User confusion, support burden         |

## Cascading Failure Scenarios

### Scenario 1: The Perfect Storm

```
Initial Trigger: Token expires during high-traffic period

Step 1: Token Expiration
  → 50 simultaneous API calls detect expired token

Step 2: Concurrent Refresh (no mutex)
  → 50 parallel refresh attempts
    → Google rate limit hit

Step 3: Rate Limit Exhaustion
  → All 50 refreshes fail with 429 Too Many Requests
    → Retry logic kicks in

Step 4: Retry Amplification
  → 50 tools × 3 retries = 150 additional requests
    → Quota exhausted for entire project

Step 5: Complete OAuth Outage
  → All users of this MCP server lose access
    → For entire rate limit window (1 hour?)

Step 6: User Exodus
  → Users can't access Gmail via MCP for an hour
    → Mass GitHub issues
    → Developer reputation damaged

Step 7: Panic Fix
  → Developer adds mutex, deploys update
    → But users must manually update
    → Many don't know update exists
    → Continue to experience issues

Recovery Time: 24-48 hours until all users updated
```

**Probability:** Low per-server, but given hundreds of MCP servers, likely happening to some server right now

**Prevention:** Comprehensive testing of high-concurrency scenarios

### Scenario 2: The Silent Degradation

```
Initial Trigger: Refresh token rotation not handled

Step 1: First Token Refresh
  → Google rotates refresh token
    → New RT2 issued
    → But MCP server doesn't update storage (bug)
    → Still stores old RT1

Step 2: Token Expires Again (1 hour later)
  → Attempts refresh with old RT1
    → Fails: invalid_grant
    → User must re-authorize

Step 3: Pattern Repeats
  → Every hour, user must re-authorize
    → User frustrated but doesn't report (thinks it's normal?)

Step 4: Silent Failure Mode
  → No crash, no obvious bug
    → Just terrible UX
    → Users quietly churn

Step 5: Discovery (Weeks Later)
  → GitHub issue: "Why do I have to re-authorize constantly?"
    → Developer investigates
    → Finds refresh token rotation bug
    → Realizes it's been broken for weeks

Step 6: Damage Assessment
  → How many users churned silently?
    → No metrics, no telemetry
    → Unknown

Recovery: Fix deployed, but trust eroded
```

**Probability:** Medium to High (easy bug to make, hard to detect)

**Prevention:** Comprehensive logging and user feedback mechanisms

### Scenario 3: The Cross-Server Contagion

```
Initial Trigger: Security incident at one MCP server

Step 1: Token Leakage
  → Popular MCP server (10K users) leaks tokens via logs
    → Attacker scrapes log files from public S3 bucket

Step 2: Widespread Account Compromise
  → 10,000 user accounts accessed by attacker
    → Google detects suspicious API usage patterns

Step 3: Google's Response
  → Google invalidates all refresh tokens for that OAuth project
    → All users of that MCP server lose access immediately
    → Google emails project owner: "Security incident detected"

Step 4: Community Panic
  → News spreads on Twitter, Reddit: "X MCP server compromised"
    → Users of OTHER MCP servers worry: "Is mine safe?"

Step 5: Trust Erosion
  → Users start revoking OAuth access to all MCP servers
    → Even secure ones affected
    → "Better safe than sorry"

Step 6: Ecosystem Chilling Effect
  → New users hesitant to authorize any MCP server
    → Adoption slows across entire ecosystem
    → Developers demoralized

Step 7: Regulatory Response?
  → Google tightens OAuth verification requirements
    → Requires security audit for all MCP servers
    → Increases barrier to entry
    → Slows innovation

Recovery: Months to rebuild trust
```

**Probability:** Low but catastrophic impact

**Prevention:** Security best practices, code audits, responsible disclosure

## System Resilience Recommendations

### 1. Defense in Depth

**Layer 1: Prevention**

- Validate configuration at startup
- Use secure token storage (OS keychain)
- Implement refresh mutex
- Request minimal scopes

**Layer 2: Detection**

- Comprehensive logging (redacted)
- Monitoring and alerting
- Rate limit tracking
- Token refresh success metrics

**Layer 3: Recovery**

- Graceful degradation
- Clear error messages with recovery instructions
- Automatic retry with exponential backoff
- Manual re-authorization fallback

**Layer 4: Learning**

- Post-mortem for all outages
- Incident documentation
- Update tests to cover failure mode
- Share learnings with community

### 2. Chaos Engineering

**Test Failure Modes Proactively:**

1. **Kill server during OAuth flow**
   - Does it gracefully recover?
   - Does user need to retry?

2. **Simulate token corruption**
   - Does server crash or handle gracefully?
   - Is error message clear?

3. **Trigger concurrent refreshes**
   - Does mutex work?
   - Are refresh tokens properly updated?

4. **Cut network during refresh**
   - Does retry logic work?
   - Does it eventually succeed or fail gracefully?

5. **Exceed rate limits**
   - Does circuit breaker activate?
   - Are users notified?

6. **Revoke refresh token manually**
   - Is re-authorization requested?
   - Is error message clear?

### 3. Observability

**Key Metrics to Track:**

1. **Authorization Flow Metrics**
   - Initiation count
   - Completion count
   - Abandonment rate
   - Time to completion

2. **Token Lifecycle Metrics**
   - Refresh success rate
   - Refresh failure rate (by error type)
   - Time to token expiration
   - Re-authorization frequency

3. **Error Metrics**
   - Error rate by type
   - Mean time to recovery
   - User-reported issues

4. **Performance Metrics**
   - OAuth flow duration
   - Token refresh duration
   - API call latency (may indicate rate limiting)

**Alerting Thresholds:**

| Metric                    | Warning      | Critical    |
| ------------------------- | ------------ | ----------- |
| Refresh Success Rate      | <95%         | <90%        |
| Authorization Abandonment | >30%         | >50%        |
| Re-auth Frequency         | >1/user/week | >1/user/day |
| Token Storage Errors      | >0.1%        | >1%         |
| Network Timeouts          | >5%          | >10%        |

## Conclusion

OAuth integration in MCP servers presents **numerous failure modes** with **cascading effects** across the system. Understanding these failure modes, their interactions, and their impacts on stakeholders is critical for building resilient, trustworthy MCP servers.

**Key Insights:**

1. **Failures compound:** Single failure (e.g., missing mutex) can cascade into multiple downstream failures (rate limits, token invalidation, user exodus)

2. **Silent failures are worst:** Failures that don't crash the system but degrade UX (e.g., hourly re-authorization) cause silent user churn

3. **Cross-server effects:** Incident at one MCP server can damage trust in entire ecosystem

4. **Prevention > Detection > Recovery:** Invest in preventing failures, detecting them quickly, and recovering gracefully

5. **User communication is critical:** Clear error messages and proactive status updates dramatically improve UX during failures

6. **Testing is insufficient:** Standard unit/integration tests don't catch many OAuth failure modes (concurrency, timing, external dependencies)

7. **Observability is mandatory:** Without metrics and logging, failures are invisible until they become crises

**Bottom Line:** OAuth is a **high-complexity, high-risk** system component. Treat it with the care it deserves through comprehensive testing, monitoring, graceful degradation, and clear user communication.
