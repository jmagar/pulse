# Systems Analysis: OAuth Architecture Decisions and System-Wide Implications

## Executive Summary

OAuth implementation in MCP servers requires multiple critical architecture decisions. Each decision creates cascading effects throughout the system, affecting stakeholders differently and creating path dependencies that constrain future choices. This analysis examines key decision points, their second-order effects, and system-level implications.

## Decision Point 1: Token Storage Architecture

### Options Analysis

#### Option A: In-Memory Storage

**Implementation:**

```typescript
class InMemoryTokenStore {
  private tokens: Map<string, TokenData> = new Map();
}
```

**Advantages:**

- Simplest implementation (1 hour dev time)
- No file system dependencies
- No encryption complexity
- Fast access (O(1) lookup)

**Disadvantages:**

- Tokens lost on server restart
- No persistence across sessions
- Poor user experience (re-auth on every restart)

**Cascading Effects:**

```
In-memory storage chosen
  → User authorizes OAuth
    → Token stored in memory
      → Claude Desktop restarts (user closes app)
        → MCP server process terminates
          → Token lost
            → Next session requires re-authorization
              → User frustrated by repeated auth
                → User perception: "Tool is broken"
                  → Lower adoption rate
                    → Fewer users
                      → Less feedback
                        → Slower improvement cycle
```

**Stakeholder Impact Matrix:**

| Stakeholder    | Impact                | Severity | Long-term Effect |
| -------------- | --------------------- | -------- | ---------------- |
| Users          | Frequent re-auth      | HIGH     | Abandonment      |
| Developers     | Simple code           | LOW      | Technical debt   |
| Security       | Memory-only (good)    | POSITIVE | But temporary    |
| Claude Desktop | No integration needed | NONE     | N/A              |

**System-Level Implication:** This choice signals "prototype, not production" quality

**When Appropriate:** Early prototyping, demos, proof-of-concept

**When Inappropriate:** Production use, user-facing deployments

#### Option B: File-Based Storage

**Implementation:**

```typescript
class FileTokenStore {
  private tokenPath = path.join(os.homedir(), '.mcp', 'gmail-tokens.json');

  async save(tokens: TokenData) {
    await fs.writeFile(this.tokenPath, JSON.stringify(tokens));
  }

  async load(): Promise<TokenData | null> {
    try {
      const data = await fs.readFile(this.tokenPath, 'utf-8');
      return JSON.parse(data);
    } catch {
      return null;
    }
  }
}
```

**Advantages:**

- Moderate complexity (4-6 hours dev time)
- Persistent across restarts
- Cross-platform (works on macOS, Linux, Windows)
- Easy to debug (can inspect file manually)
- No external dependencies

**Disadvantages:**

- Security concerns (file permissions, encryption)
- Disk I/O latency
- Corruption risk (crash during write)
- No access control beyond file permissions

**Cascading Effects:**

```
File-based storage chosen
  → Tokens persist across restarts
    → Better UX (no re-auth)
      → Higher user satisfaction
        → More adoption

BUT ALSO:
  → File stored in home directory
    → Other processes can read (if permissions misconfigured)
      → Security vulnerability
        → Token compromise risk
          → IF compromised:
            → User's Google account accessed
              → Data breach
                → Legal liability
                  → Reputational damage
                    → Project shut down?
```

**Security Improvement: Encrypted File Storage**

```typescript
class EncryptedFileTokenStore {
  private key: Buffer;

  constructor() {
    // Derive encryption key from machine-specific data
    this.key = this.deriveKey();
  }

  private deriveKey(): Buffer {
    // Use machine ID + app identifier
    const machineId = os.hostname() + os.userInfo().username;
    return crypto.pbkdf2Sync(machineId, 'mcp-salt', 100000, 32, 'sha256');
  }

  async save(tokens: TokenData) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(tokens)), cipher.final()]);

    await fs.writeFile(
      this.tokenPath,
      JSON.stringify({
        iv: iv.toString('hex'),
        data: encrypted.toString('hex'),
      })
    );
  }
}
```

**Security Trade-off Analysis:**

| Approach               | Protection Against | Vulnerable To          |
| ---------------------- | ------------------ | ---------------------- |
| Plaintext              | Nothing            | All attacks            |
| File permissions (600) | Casual access      | Root access, backups   |
| Encrypted file         | File copy attacks  | Key derivation attacks |
| OS keychain            | Most attacks       | OS vulnerabilities     |

**Stakeholder Impact Matrix:**

| Stakeholder | Impact                | Severity                           | Long-term Effect |
| ----------- | --------------------- | ---------------------------------- | ---------------- |
| Users       | Persistent auth       | POSITIVE                           | Better UX        |
| Developers  | Moderate complexity   | MEDIUM                             | Maintainable     |
| Security    | Needs encryption      | NEGATIVE → POSITIVE (if encrypted) | Acceptable risk  |
| Enterprises | File-based inadequate | NEGATIVE                           | Blocks adoption  |

**System-Level Implication:** This choice represents "pragmatic production quality"

**When Appropriate:** Most production MCP servers, individual users

**When Inappropriate:** Enterprise deployments, high-security contexts

#### Option C: OS Keychain Integration

**Implementation:**

```typescript
import keytar from 'keytar'; // or @napi-rs/keyring

class KeychainTokenStore {
  private service = 'mcp-gmail';
  private account = 'oauth-tokens';

  async save(tokens: TokenData) {
    await keytar.setPassword(this.service, this.account, JSON.stringify(tokens));
  }

  async load(): Promise<TokenData | null> {
    const data = await keytar.getPassword(this.service, this.account);
    return data ? JSON.parse(data) : null;
  }
}
```

**Platform-Specific Backends:**

- **macOS:** Keychain Access (system keychain service)
- **Windows:** Credential Manager (DPAPI encryption)
- **Linux:** Secret Service API (GNOME Keyring, KWallet)

**Advantages:**

- Maximum security (OS-level protection)
- Encrypted at rest automatically
- Access control via OS
- User can view/manage via OS tools
- Industry best practice

**Disadvantages:**

- High complexity (16-24 hours dev time + testing)
- Platform-specific code paths
- External dependency (keytar/keyring library)
- Native module compilation (can fail on some systems)
- Testing difficulty (requires OS integration)
- Linux fragmentation (multiple secret service implementations)

**Cascading Effects:**

```
POSITIVE PATH:
OS keychain chosen
  → Tokens stored securely
    → Security audit passes
      → Enterprise customers comfortable
        → Higher adoption in enterprise
          → More revenue opportunities (if monetized)
            → More resources for development
              → Better product

NEGATIVE PATH:
OS keychain chosen
  → keytar dependency added
    → Native module compilation required
      → Fails on some Linux distros
        → Installation errors
          → GitHub issues flood in
            → Developer time consumed
              → Feature velocity drops
                → Competitive disadvantage
```

**Linux Fragmentation Problem:**

```
MCP server targets Linux
  → Uses keytar for Secret Service API
    → Works on: Ubuntu (GNOME Keyring), Fedora (GNOME Keyring)
      → Fails on: Alpine (no keyring), Docker containers (no dbus)
        → Server mode deployments break
          → Need fallback to file-based storage
            → But: How to choose automatically?
              → Complexity increases
                → Code paths multiply
                  → Testing burden explodes
```

**Stakeholder Impact Matrix:**

| Stakeholder    | Impact             | Severity | Long-term Effect   |
| -------------- | ------------------ | -------- | ------------------ |
| Users          | Most secure option | POSITIVE | Peace of mind      |
| Developers     | High complexity    | NEGATIVE | Maintenance burden |
| Security       | Best practice      | POSITIVE | Recommended        |
| Enterprises    | Acceptable         | POSITIVE | Enables adoption   |
| Servers/Docker | May not work       | NEGATIVE | Limits deployment  |

**System-Level Implication:** This choice represents "enterprise-grade production quality"

**When Appropriate:** High-security contexts, enterprise deployments, user-facing apps

**When Inappropriate:** Server deployments, Docker containers, rapid prototyping

#### Option D: Database Storage

**Implementation:**

```typescript
class DatabaseTokenStore {
  private db: Database; // SQLite, Postgres, etc.

  async save(userId: string, tokens: TokenData) {
    await this.db.query(
      'INSERT INTO oauth_tokens (user_id, access_token, refresh_token, expires_at) VALUES (?, ?, ?, ?)',
      [userId, tokens.access_token, tokens.refresh_token, tokens.expires_at]
    );
  }
}
```

**Advantages:**

- Multi-user support
- Centralized management
- ACID guarantees
- Backup/restore capabilities
- Query flexibility (e.g., "find expired tokens")

**Disadvantages:**

- Requires database infrastructure
- Connection management complexity
- Migration/schema management
- Overkill for single-user MCP servers

**Cascading Effects:**

```
Database storage chosen
  → Adds database dependency
    → MCP server no longer standalone
      → Installation complexity increases
        → Users must install + configure database
          → OR: Use embedded database (SQLite)
            → BUT: SQLite has no network access
              → Limits to single-machine deployments

  → Database schema management needed
    → Migrations required
      → Version compatibility issues
        → "Your schema is outdated, run migrations"
          → User confusion
            → Support burden
```

**When Appropriate:**

- Multi-user MCP servers
- Hosted/cloud MCP deployments
- When database already present for other reasons

**When Inappropriate:**

- Single-user desktop MCP servers
- Stdio-based MCP servers (no network)
- Simple use cases

**System-Level Implication:** This choice represents "multi-tenant / cloud-first architecture"

### Recommended Decision Framework

```
START: Choose token storage

IF prototype/demo:
  → In-memory storage
  → RISK: User confusion if mistaken for production

ELSE IF single-user desktop MCP:
  IF security-sensitive OR enterprise context:
    → OS keychain
    → FALLBACK: Encrypted file if keychain unavailable
  ELSE:
    → Encrypted file storage
    → DOCUMENT: Security posture in README

ELSE IF multi-user server deployment:
  → Database storage
  → ENSURE: Connection pooling, migrations

ALWAYS:
  → Abstract behind interface (allow future change)
  → Document choice and rationale
  → Provide migration path for upgrades
```

## Decision Point 2: OAuth Flow Architecture

### Options Analysis

#### Option A: Localhost HTTP Server

**Architecture:**

```
User clicks "Authorize" in Claude
  → MCP server starts local HTTP server on random port
    → Opens browser to Google OAuth with redirect URL: http://localhost:PORT/callback
      → User completes consent
        → Google redirects to localhost:PORT/callback?code=...
          → MCP server captures code, exchanges for tokens
            → HTTP server shuts down
              → Returns success to Claude
```

**Implementation:**

```typescript
async function runOAuthFlow(): Promise<TokenData> {
  const server = http.createServer();
  const port = await getRandomPort();

  return new Promise((resolve, reject) => {
    server.on('request', async (req, res) => {
      const url = new URL(req.url!, `http://localhost:${port}`);
      const code = url.searchParams.get('code');

      if (code) {
        const tokens = await exchangeCodeForTokens(code);
        res.end('Authorization successful! You can close this window.');
        server.close();
        resolve(tokens);
      }
    });

    server.listen(port, () => {
      const authUrl = generateAuthUrl(`http://localhost:${port}/callback`);
      openBrowser(authUrl);
    });
  });
}
```

**Advantages:**

- Standard OAuth flow (follows spec)
- Fully automated (captures code without user copying)
- Good UX (user only clicks "Allow")

**Disadvantages:**

- Requires opening HTTP port (firewall issues)
- Port collision risk (if port in use)
- Callback handling complexity
- Server lifecycle management (when to shut down?)

**Cascading Effects:**

```
NORMAL CASE:
Localhost server starts
  → Browser redirects to localhost
    → Code captured
      → Tokens obtained
        → Server shuts down
          → Clean, simple UX

FAILURE CASE 1: Firewall blocks localhost
  → Browser redirects to localhost:PORT
    → Connection refused
      → User sees browser error
        → OAuth flow stuck
          → User doesn't know what to do

FAILURE CASE 2: Port already in use
  → Server fails to start
    → MCP tool returns error
      → Retries with different port
        → BUT: Redirect URL in Google Console must match
          → Can't use dynamic ports (CONFLICT)
            → Must use fixed port
              → Back to port collision problem
```

**Port Management Strategies:**

**Strategy 1: Fixed Port**

- PRO: Predictable, can configure in Google Console once
- CON: Port collisions likely on shared machines

**Strategy 2: Dynamic Port Range**

- PRO: Reduces collisions
- CON: Must configure ALL ports in Google Console (up to 100 redirect URLs)

**Strategy 3: Port Forwarding Service**

- PRO: No local port needed
- CON: External dependency, privacy concerns

#### Option B: Manual Copy-Paste Flow

**Architecture:**

```
User clicks "Authorize" in Claude
  → MCP server generates auth URL
    → Claude displays: "Visit this URL and paste the code: [URL]"
      → User opens browser manually
        → User completes consent
          → Google shows authorization code
            → User copies code
              → User pastes into Claude
                → MCP server exchanges code for tokens
```

**Implementation:**

```typescript
async function runManualOAuthFlow(): Promise<TokenData> {
  const authUrl = generateAuthUrl('urn:ietf:wg:oauth:2.0:oob'); // Out-of-band

  console.log('Please visit this URL:');
  console.log(authUrl);
  console.log('After authorizing, paste the code here:');

  const code = await readUserInput(); // Wait for user to paste
  const tokens = await exchangeCodeForTokens(code);
  return tokens;
}
```

**Advantages:**

- No HTTP server needed
- No port collisions
- No firewall issues
- Simple implementation

**Disadvantages:**

- Poor UX (manual copy-paste)
- Error-prone (user may copy incorrectly)
- More steps for user
- Breaks automated workflows

**Cascading Effects:**

```
Manual flow chosen
  → User must copy-paste code
    → Adds friction to auth flow
      → Some users abandon (higher abandonment rate)
        → Lower adoption

  → User copies code incorrectly
    → Invalid code error
      → User confused: "I copied it exactly!"
        → Support request
          → Developer time wasted

  → User doesn't understand process
    → "Where do I paste the code?"
      → Claude has no input mechanism for this
        → Flow breaks down completely
          → REALIZATION: Manual flow incompatible with Claude Desktop
```

**Critical Insight:** Manual copy-paste flow **does not work** with Claude Desktop (no direct user input to MCP server)

**When Appropriate:** CLI tools where user can paste into terminal

**When Inappropriate:** Claude Desktop, GUI applications, automated systems

#### Option C: Device Flow (Google's Device Authorization)

**Architecture:**

```
User initiates authorization
  → MCP server requests device code from Google
    → Google returns: device_code, user_code, verification_url
      → MCP server displays: "Visit google.com/device and enter: ABCD-EFGH"
        → User visits URL, enters code
          → MCP server polls Google API
            → Google returns: "pending" (user hasn't completed yet)
              → MCP server polls again (every 5 seconds)
                → User completes authorization
                  → Next poll returns tokens
```

**Advantages:**

- No localhost server needed
- No redirect URL configuration
- Works on remote/headless systems
- Good for limited-input devices

**Disadvantages:**

- Requires polling (inefficient)
- User must type code manually
- Higher latency (polling interval)
- More complex for users
- Google may not support device flow for all scopes

**Cascading Effects:**

```
Device flow chosen
  → User must visit separate URL and type code
    → Adds friction
      → Higher abandonment than localhost flow

  → MCP server polls every 5 seconds
    → User takes 60 seconds to complete
      → 12 polling requests
        → Counts toward rate limit
          → At scale, significant API usage
            → May hit rate limits

  → User types code incorrectly
    → "Invalid code" error
      → User retries
        → MCP server doesn't know (still polling old code)
          → Flow stuck
            → Timeout eventually (5 minutes?)
              → User frustrated
```

**When Appropriate:**

- Headless servers
- Remote deployments
- Limited-input devices (TVs, IoT)

**When Inappropriate:**

- Desktop applications with browser access
- When UX is priority

### Recommended Decision: Hybrid Approach

```typescript
class OAuthFlowManager {
  async authorize(): Promise<TokenData> {
    // Try localhost flow first (best UX)
    try {
      return await this.localhostFlow();
    } catch (error) {
      if (error.code === 'EADDRINUSE' || error.code === 'EACCES') {
        // Fallback to device flow if port unavailable
        console.warn('Localhost flow failed, falling back to device flow');
        return await this.deviceFlow();
      }
      throw error;
    }
  }
}
```

**Rationale:** Optimize for common case (localhost works), gracefully degrade for edge cases

## Decision Point 3: Token Refresh Strategy

### Options Analysis

#### Option A: Reactive Refresh (On-Demand)

**Implementation:**

```typescript
async function callGoogleAPI(endpoint: string) {
  let response = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${currentToken}` },
  });

  if (response.status === 401) {
    // Token expired, refresh now
    await refreshToken();
    // Retry request
    response = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${currentToken}` },
    });
  }

  return response;
}
```

**Advantages:**

- Simple logic
- Only refreshes when needed
- No background timers

**Disadvantages:**

- Adds latency to first request after expiration (refresh + retry)
- User-visible delay
- Refresh errors surface during user operations

**User Experience Impact:**

```
User: "Claude, check my Gmail"
  → Token expired (unknown to system)
    → API call with expired token
      → 401 Unauthorized (250ms)
        → Refresh token (500ms)
          → Retry API call (300ms)
            → Total latency: 1050ms (1 second delay)

User perception: "Why is it slow?"
```

**Cascading Effects:**

```
Reactive refresh chosen
  → All token expirations cause user-visible latency
    → Happens every hour
      → Predictable slowness at T+3600s
        → Users notice pattern
          → "It always slows down after an hour"
            → Perception of poor quality
```

#### Option B: Proactive Refresh (Time-Based)

**Implementation:**

```typescript
class TokenManager {
  private refreshTimer: NodeJS.Timeout | null = null;

  async initialize() {
    await this.loadTokens();
    this.scheduleRefresh();
  }

  private scheduleRefresh() {
    const expiresAt = this.tokens.expires_at * 1000; // Convert to ms
    const now = Date.now();
    const timeUntilExpiry = expiresAt - now;
    const refreshAt = timeUntilExpiry - 5 * 60 * 1000; // 5min before expiry

    if (refreshAt > 0) {
      this.refreshTimer = setTimeout(async () => {
        await this.refreshToken();
        this.scheduleRefresh(); // Schedule next refresh
      }, refreshAt);
    }
  }

  async refreshToken() {
    const newTokens = await oauth2Client.refreshAccessToken();
    this.tokens = newTokens;
    await this.storage.save(newTokens);
  }
}
```

**Advantages:**

- No user-visible latency (refresh happens before expiration)
- Predictable refresh timing
- Smooth user experience

**Disadvantages:**

- Requires background timer
- May refresh unnecessarily if server idle
- More complex implementation

**User Experience Impact:**

```
User: "Claude, check my Gmail" (happens to be at T+3650s, just after refresh)
  → Token fresh (just refreshed 50s ago)
    → API call succeeds immediately
      → Fast response
        → Good UX

User doesn't even know refresh happened
```

**Edge Case: Server Restart**

```
Server restarts at T=3000s
  → Loads token with expiry at T=3600s
    → Schedules refresh at T=3300s
      → Only 300s until refresh
        → Timer fires
          → Token refreshed
            → New expiry at T=7200s
```

**Cascading Effects:**

```
Proactive refresh chosen
  → Tokens always fresh
    → No user-visible latency
      → Better perceived performance
        → Higher user satisfaction
          → More usage
            → More API calls
              → Higher costs (if API has usage fees)
```

#### Option C: Hybrid (Proactive + Reactive Fallback)

**Implementation:**

```typescript
class HybridTokenManager {
  private refreshTimer: NodeJS.Timeout | null = null;

  // Proactive: Schedule refresh before expiration
  private scheduleRefresh() {
    const refreshAt = this.tokens.expires_at - 5 * 60;
    this.refreshTimer = setTimeout(() => this.refreshToken(), refreshAt);
  }

  // Reactive: Fallback if proactive refresh missed
  async getValidToken(): Promise<string> {
    if (this.isTokenExpired()) {
      console.warn('Token expired, proactive refresh missed. Refreshing now.');
      await this.refreshToken();
    }
    return this.tokens.access_token;
  }
}
```

**Advantages:**

- Best of both worlds
- Gracefully handles edge cases (server restart mid-lifetime)
- No user-visible latency in normal case
- Still works if timer fails

**Disadvantages:**

- Most complex implementation
- Two code paths to test

**Recommended Approach:** Hybrid provides best reliability and UX

### Refresh Mutex Pattern

**Critical Addition:** Prevent concurrent refreshes

```typescript
class TokenManager {
  private refreshMutex: Promise<void> | null = null;

  async refreshToken(): Promise<void> {
    // If refresh already in progress, wait for it
    if (this.refreshMutex) {
      await this.refreshMutex;
      return;
    }

    // Start new refresh, store promise
    this.refreshMutex = this.performRefresh();

    try {
      await this.refreshMutex;
    } finally {
      this.refreshMutex = null;
    }
  }

  private async performRefresh(): Promise<void> {
    const response = await oauth2Client.refreshAccessToken();
    this.tokens = response.credentials;

    // CRITICAL: Update refresh token if rotated
    if (this.tokens.refresh_token) {
      await this.storage.save(this.tokens);
    }
  }
}
```

## Decision Point 4: Scope Request Strategy

### Options Analysis

#### Option A: Request All Scopes Upfront

**Implementation:**

```typescript
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/drive.readonly',
];

const authUrl = oauth2Client.generateAuthUrl({
  scope: SCOPES,
});
```

**Advantages:**

- Single authorization flow
- All features available immediately
- Simpler implementation

**Disadvantages:**

- Scary consent screen (many permissions)
- Higher abandonment rate
- Violates principle of least privilege
- May request permissions never used

**User Perception:**

```
User sees consent screen:
  ✓ Read all your emails
  ✓ Compose and send emails
  ✓ Delete emails permanently
  ✓ Access your Calendar
  ✓ View your Google Drive files

User thinks: "Why does it need all this? I just want to read email subjects!"
User action: Denies authorization (abandons)
```

**Cascading Effects:**

```
Broad scopes requested
  → User abandonment rate: 40-60%
    → Lower adoption
      → Less feedback
        → Slower product improvement

  → Users who DO authorize may not trust fully
    → Use tool sparingly
      → Lower engagement
        → Tool doesn't become habit
          → Eventually uninstalled
```

#### Option B: Minimal Scopes + Incremental Authorization

**Implementation:**

```typescript
// Initially request only what's needed
const INITIAL_SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

// Later, when user tries to send email
async function sendEmail(content: string) {
  const currentScopes = await getCurrentScopes();

  if (!currentScopes.includes('gmail.compose')) {
    // Request additional scope
    await requestAdditionalScope('gmail.compose');
  }

  // Now send email
  await gmailClient.sendMessage(content);
}
```

**Advantages:**

- Minimal initial permissions (lower abandonment)
- Just-in-time authorization (clear context)
- Principle of least privilege
- Better trust building

**Disadvantages:**

- Multiple authorization flows
- More complex implementation
- User may decline additional scope (feature unusable)

**User Experience:**

```
Initial authorization:
  User sees: "Read your emails"
  User thinks: "That's reasonable"
  User authorizes (90% conversion)

Later, user tries to send email:
  System: "This feature requires permission to send emails. Authorize?"
  User sees: "Compose and send emails"
  User thinks: "That makes sense for sending email"
  User authorizes (80% conversion)

Net: 90% initial × 80% incremental = 72% total adoption for send feature
  vs
Upfront approach: 40-60% total adoption
```

**Cascading Effects:**

```
Minimal scopes + incremental chosen
  → Higher initial adoption (90% vs 50%)
    → More users try tool
      → More feedback
        → Faster improvement

  → Clear context for each permission
    → Users understand why each scope needed
      → Higher trust
        → More features used
          → Higher engagement

  → BUT: More authorization flows
    → More code complexity
      → More bugs potential
        → Need thorough testing
```

**Recommended Approach:** Minimal scopes + incremental authorization

**Implementation Pattern:**

```typescript
interface ToolDefinition {
  name: string;
  requiredScopes: string[];
  handler: (args: unknown) => Promise<unknown>;
}

class ScopeManager {
  async ensureScopes(required: string[]): Promise<void> {
    const current = await this.getCurrentScopes();
    const missing = required.filter((s) => !current.includes(s));

    if (missing.length > 0) {
      await this.requestAdditionalScopes(missing);
    }
  }
}

// Use before each tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = findTool(request.params.name);
  await scopeManager.ensureScopes(tool.requiredScopes);
  return await tool.handler(request.params.arguments);
});
```

## Decision Point 5: Multi-User Architecture

### Options Analysis

#### Option A: Single-User (Personal MCP Server)

**Architecture:**

- One MCP server instance per user
- Tokens stored in user's home directory
- No user management needed

**Appropriate For:**

- Claude Desktop integration
- Personal assistants
- Local development

**Limitations:**

- Cannot share MCP server across team
- No centralized management
- Each user maintains own instance

#### Option B: Multi-User (Shared MCP Server)

**Architecture:**

- One MCP server instance serves multiple users
- User identification required
- Centralized token storage
- Access control and permissions

**Implementation Challenges:**

**Challenge 1: User Identification**

```
MCP tool called via Claude
  → Which user's tokens should be used?
    → Need user context from Claude
      → BUT: MCP protocol doesn't provide user identity
        → PROBLEM: How to identify user?

Options:
  A) User ID in tool arguments (user must include manually)
  B) Authentication layer before MCP (HTTP auth)
  C) Separate MCP server instance per user (back to single-user)
```

**Challenge 2: Token Isolation**

```
User A and User B both authorized
  → Tokens stored in database: user_id → tokens
    → Tool execution must load correct user's tokens
      → IF bug in isolation logic:
        → User A's request uses User B's tokens
          → Privacy breach
            → User A sees User B's emails
              → CRITICAL SECURITY FAILURE
```

**Challenge 3: Rate Limit Sharing**

```
Multi-user MCP server with single OAuth project
  → All users share same project quotas
    → User A makes 1000 API calls (heavy usage)
      → Quota exhausted
        → User B's requests fail
          → User B affected by User A's usage
            → Noisy neighbor problem
```

**Cascading Effects:**

```
Multi-user architecture chosen
  → Adds complexity (user management, isolation)
    → More bugs potential
      → Security vulnerabilities risk

  → Requires database (user → tokens mapping)
    → Infrastructure dependency
      → Deployment complexity

  → Shared quotas
    → Noisy neighbor issues
      → Need usage monitoring and limits
        → More complexity

  → BUT: Enables team use cases
    → Organization-wide deployment
      → Centralized management
        → Better for enterprises
          → Higher value (if monetized)
```

**Recommended Approach:** Start single-user, add multi-user only if demand exists

## Decision Point 6: Error Handling and User Communication

### Options Analysis

#### Option A: Technical Error Messages

**Example:**

```typescript
catch (error) {
  return {
    content: [{ type: 'text', text: `Error: ${error.message}` }],
    isError: true,
  };
}
```

**User sees:** "Error: invalid_grant"

**Problems:**

- User doesn't understand technical jargon
- No actionable guidance
- Creates support burden

#### Option B: User-Friendly Error Messages

**Example:**

```typescript
catch (error) {
  const userMessage = this.translateError(error);
  return {
    content: [{ type: 'text', text: userMessage }],
    isError: true,
  };
}

private translateError(error: OAuthError): string {
  const map: Record<string, string> = {
    invalid_grant: 'Your Gmail authorization has expired. Please re-authorize: [URL]',
    access_denied: 'You denied permission to access Gmail. This feature requires Gmail access to work.',
    invalid_client: 'OAuth configuration error. Please check GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.',
    insufficient_scope: 'This feature requires additional permissions. Please re-authorize with expanded permissions: [URL]',
  };

  return map[error.code] || `Authentication error occurred. Please try re-authorizing: [URL]`;
}
```

**User sees:** "Your Gmail authorization has expired. Please re-authorize: [URL]"

**Benefits:**

- Clear, actionable guidance
- Reduces support burden
- Better user experience

**Recommended Approach:** Always translate technical errors to user-friendly messages

## System-Level Architecture Recommendations

### Reference Architecture: Production-Grade OAuth MCP Server

```
┌─────────────────────────────────────────────────────────────┐
│ MCP Server                                                  │
│                                                             │
│  ┌──────────────────┐      ┌──────────────────┐          │
│  │   Tool Layer     │      │   OAuth Manager  │          │
│  │                  │─────>│                  │          │
│  │ - Gmail tools    │      │ - Token refresh  │          │
│  │ - Calendar tools │      │ - Scope checks   │          │
│  └──────────────────┘      └─────────┬────────┘          │
│                                       │                    │
│                                       v                    │
│                            ┌──────────────────┐           │
│                            │  Token Storage   │           │
│                            │  (OS Keychain)   │           │
│                            └──────────────────┘           │
│                                                            │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  Cross-Cutting Concerns                            │ │
│  │  - Logging (redact tokens)                          │ │
│  │  - Metrics (refresh success rate)                   │ │
│  │  - Error translation                                │ │
│  └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Key Architectural Principles

1. **Separation of Concerns**
   - OAuth logic isolated from tool logic
   - Storage abstraction (allow swap implementations)
   - Error handling centralized

2. **Defense in Depth**
   - Proactive refresh (prevent expiration)
   - Reactive fallback (handle edge cases)
   - Refresh mutex (prevent race conditions)
   - Token rotation handling

3. **Graceful Degradation**
   - If keychain unavailable → fall back to encrypted file
   - If localhost unavailable → fall back to device flow
   - If refresh fails → clear error message + re-auth URL

4. **Observability**
   - Log all OAuth events (redact tokens)
   - Track refresh success/failure rates
   - Monitor re-authorization frequency
   - Alert on anomalies

5. **Security by Default**
   - OS keychain preferred
   - Minimal scopes requested
   - Tokens never logged
   - State parameter validation (CSRF protection)

## Path Dependency Analysis

### Decision Sequence Matters

**Scenario 1: Secure-First Path**

```
Decision 1: Choose OS keychain storage
  → Invest in platform-specific code
    → Establish security-conscious culture
      → Decision 2: Choose proactive refresh + mutex
        → Invest in robustness
          → Decision 3: Comprehensive error handling
            → High-quality, trusted product

Result: Premium positioning, enterprise adoption
```

**Scenario 2: Speed-First Path**

```
Decision 1: Choose in-memory storage (fast prototype)
  → Launch quickly
    → Get users
      → Discover persistence needed
        → Decision 2: Add file storage
          → Security concerns emerge
            → Decision 3: Add encryption
              → Decision 4: Realize should have used keychain
                → Refactor required
                  → Breaking change for users
                    → Trust eroded
                      → Technical debt accumulated

Result: Forever chasing quality, hard to reposition
```

**Insight:** Early architectural decisions create path dependencies that are expensive to change later

### Recommended Decision Sequence

1. **First: Define target user** (individual vs enterprise)
2. **Second: Choose storage** (keychain for production, file for prototype)
3. **Third: Implement refresh strategy** (hybrid proactive+reactive)
4. **Fourth: Add observability** (logging, metrics)
5. **Fifth: User experience polish** (error messages, scope minimization)

## Conclusion

OAuth architecture decisions in MCP servers are **high-leverage, high-stakes** choices with far-reaching implications. Each decision creates cascading effects that impact:

- User experience and adoption
- Developer velocity and maintenance burden
- Security posture and risk exposure
- Enterprise viability
- System reliability and trust

**Key Insights:**

1. **No perfect solution:** Every option has trade-offs; choose based on context
2. **Start secure:** Security is hard to retrofit; start with good practices
3. **Path dependencies matter:** Early decisions constrain future options
4. **User experience is critical:** Technical correctness means nothing if users abandon
5. **Observability is mandatory:** Can't improve what you can't measure
6. **Abstractions enable evolution:** Interface-based design allows changing implementations later

**Recommended Default Configuration:**

- **Storage:** OS keychain with encrypted file fallback
- **Flow:** Localhost HTTP with device flow fallback
- **Refresh:** Hybrid proactive + reactive with mutex
- **Scopes:** Minimal + incremental authorization
- **Multi-user:** Single-user initially, evaluate multi-user if demand
- **Error handling:** Always user-friendly with actionable guidance

This configuration balances security, user experience, and implementation complexity for most MCP server use cases.
