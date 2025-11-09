# The Analogist - Cross-Domain OAuth Synthesis

**Research Date**: 2025-11-07
**Objective**: Extract transferable OAuth patterns from adjacent problem spaces for MCP server implementation

## Executive Summary

After examining OAuth implementations across CLI tools, desktop applications, browser extensions, mobile apps, and service-to-service authentication, three clear patterns emerge for MCP servers:

1. **Device Flow (RFC 8628)** - The headless standard
2. **Host-Mediated Auth** - The VS Code extension pattern
3. **Pre-Generated Tokens** - The CI/CD pattern

## Cross-Domain Pattern Matrix

| Domain                 | Primary Pattern    | Key Constraint        | Transferability | Evidence Source             |
| ---------------------- | ------------------ | --------------------- | --------------- | --------------------------- |
| **CLI Tools**          | Device Flow        | Headless operation    | ★★★★★           | GitHub CLI, gcloud, AWS CLI |
| **Desktop Apps**       | Browser + Loopback | GUI but local         | ★★★★☆           | Electron, VS Code           |
| **VS Code Extensions** | Host-Mediated      | Sandboxed environment | ★★★★★           | VS Code Auth API            |
| **Chrome Extensions**  | Identity API       | Browser context       | ★★☆☆☆           | Chrome Identity API         |
| **Mobile Apps**        | Custom URL Schemes | Deep linking          | ★★★☆☆           | iOS, Android standards      |
| **Microservices**      | Service Accounts   | Server-to-server      | ★★★★☆           | OAuth Client Credentials    |
| **Git Credentials**    | Helper Protocol    | Pluggable storage     | ★★★★☆           | Git credential helpers      |

## Pattern #1: Device Flow (RFC 8628) - The Universal Solution

### Why This Pattern Wins

**From CLI Tools**:

- GitHub CLI: Primary authentication method
- gcloud: `--no-launch-browser` flag uses device flow
- Azure CLI: Default for headless environments
- Works in SSH sessions, containers, remote servers

**From Mobile Apps**:

- Smart TVs use device flow (no keyboard)
- IoT devices use device flow (limited UI)
- Gaming consoles use device flow

**From Desktop Apps**:

- Fallback when browser launch fails
- Used in enterprise locked-down environments

### The Pattern

```
User initiates auth → CLI generates code → User visits URL → User enters code → CLI polls → Token acquired
```

### Implementation Template (TypeScript)

```typescript
interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

async function deviceFlow(clientId: string, scopes: string[]): Promise<string> {
  // Step 1: Initiate device flow
  const deviceCodeResp = await fetch('https://oauth2.googleapis.com/device/code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      scope: scopes.join(' '),
    }),
  });

  const deviceCode: DeviceCodeResponse = await deviceCodeResp.json();

  // Step 2: Display to user (via MCP logging or Claude Desktop UI)
  console.log(`
    Authenticate this app:
    1. Visit: ${deviceCode.verification_uri}
    2. Enter code: ${deviceCode.user_code}
    Code expires in ${deviceCode.expires_in} seconds
  `);

  // Could also generate QR code for mobile scanning
  // const qrCode = generateQR(deviceCode.verification_uri + '?user_code=' + deviceCode.user_code);

  // Step 3: Poll for token
  const token = await pollForToken(
    clientId,
    deviceCode.device_code,
    deviceCode.interval,
    deviceCode.expires_in
  );

  return token;
}

async function pollForToken(
  clientId: string,
  deviceCode: string,
  interval: number,
  expiresIn: number
): Promise<string> {
  const deadline = Date.now() + expiresIn * 1000;

  while (Date.now() < deadline) {
    await sleep(interval * 1000);

    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        device_code: deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
    });

    const data = await tokenResp.json();

    // Success case
    if (data.access_token) {
      return data.access_token;
    }

    // Error cases
    if (data.error === 'authorization_pending') {
      continue; // Keep polling
    }

    if (data.error === 'slow_down') {
      interval += 5; // Back off as requested
      continue;
    }

    if (data.error === 'expired_token') {
      throw new Error('Authentication timeout - code expired');
    }

    if (data.error === 'access_denied') {
      throw new Error('User denied authorization');
    }

    // Unknown error
    throw new Error(`Authentication failed: ${data.error}`);
  }

  throw new Error('Authentication timeout');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

### MCP-Specific Enhancements

**Display in Claude Desktop UI**:

```typescript
// MCP tool notifies Claude Desktop of auth requirement
await server.sendResourceUpdated({
  uri: 'auth://pending',
  metadata: {
    type: 'oauth_device_flow',
    provider: 'google',
    user_code: 'WDJB-MJHT',
    verification_uri: 'https://www.google.com/device',
    expires_in: 900,
  },
});

// Claude Desktop could display:
// - Modal dialog with code and link
// - QR code for mobile scanning
// - "Open browser" button
// - Countdown timer
```

### Why Device Flow for MCP

✅ **Headless-friendly**: Works without browser on MCP server
✅ **Cross-device**: User can auth on phone while MCP runs on server
✅ **Secure**: No credentials in MCP server
✅ **Standard**: RFC 8628, widely supported
✅ **Proven**: Used by billions (Google, Microsoft, GitHub)
✅ **Simple**: No server requirements, no ports, no DNS

---

## Pattern #2: Host-Mediated Auth - The VS Code Pattern

### The Discovery

VS Code extensions face **identical constraints** to MCP tools:

- Run in sandboxed environment
- No direct OS access
- Need external service auth
- Multiple extensions, one host

### VS Code's Solution

```typescript
// Extension code (like MCP tool)
import * as vscode from 'vscode';

const session = await vscode.authentication.getSession(
  'google', // Provider ID
  ['https://www.googleapis.com/auth/drive.readonly'], // Scopes
  { createIfNone: true } // Create if doesn't exist
);

// session.accessToken is now available
// VS Code handled all OAuth complexity
```

### How It Works

1. Extension requests auth via VS Code API
2. VS Code checks for existing session
3. If none exists, VS Code initiates OAuth:
   - Opens system browser
   - Listens on loopback
   - Handles PKCE, state, code exchange
   - Stores token in secure storage
4. VS Code returns session to extension
5. Multiple extensions share same session

### Translation to MCP

**Claude Desktop should provide similar API**:

```typescript
// MCP Tool Implementation
import { Server } from '@modelcontextprotocol/sdk/server/index.js';

const server = new Server({
  name: 'google-drive-mcp',
  version: '1.0.0',
});

// Request authentication from Claude Desktop
const token = await server.requestAuthentication({
  provider: 'google',
  scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  reason: 'Access your Google Drive files',
});

// Use token
const files = await fetch('https://www.googleapis.com/drive/v3/files', {
  headers: { Authorization: `Bearer ${token}` },
});
```

**Claude Desktop Implementation**:

```typescript
class ClaudeDesktop {
  private authSessions = new Map<string, AuthSession>();

  async handleAuthRequest(
    mcpServerName: string,
    provider: string,
    scopes: string[],
    reason: string
  ): Promise<string> {
    // Check for existing session
    const key = `${provider}:${scopes.sort().join(',')}`;
    if (this.authSessions.has(key)) {
      return this.authSessions.get(key)!.accessToken;
    }

    // Prompt user
    const approved = await this.showAuthPrompt({
      mcpServer: mcpServerName,
      provider: provider,
      scopes: scopes,
      reason: reason,
    });

    if (!approved) {
      throw new Error('User denied authorization');
    }

    // Perform OAuth flow (browser + loopback)
    const token = await this.performOAuthFlow(provider, scopes);

    // Cache session
    this.authSessions.set(key, {
      provider,
      scopes,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: Date.now() + token.expires_in * 1000,
    });

    return token.access_token;
  }

  private async performOAuthFlow(provider: string, scopes: string[]): Promise<TokenResponse> {
    // Implementation: browser + loopback or device flow
    // This is where Claude Desktop does the heavy lifting
  }
}
```

### Why Host-Mediated Auth for MCP

✅ **Separation of concerns**: MCP tools don't implement OAuth
✅ **Token reuse**: Multiple tools share one auth session
✅ **Secure storage**: Claude Desktop uses platform keychain
✅ **Better UX**: User sees trusted UI (Claude), not tool UI
✅ **Consistent**: All MCP tools use same auth flow
✅ **Proven**: VS Code pattern used by millions

---

## Pattern #3: Pre-Generated Tokens - The Automation Pattern

### From CI/CD World

Every automation tool supports pre-generated tokens:

- GitHub Actions: `GITHUB_TOKEN` secret
- GitLab CI: `CI_JOB_TOKEN`
- Circle CI: Environment variables
- AWS: IAM credentials file
- gcloud: Service account keys

### The Pattern

1. User generates token in web UI (Google Cloud Console)
2. User saves token to file or env var
3. MCP server reads token at startup
4. No runtime OAuth flow needed

### Implementation

```typescript
// Environment variable approach
const token = process.env.GOOGLE_OAUTH_TOKEN;

if (token) {
  // Use pre-configured token
  client.setCredentials({ access_token: token });
} else {
  // Fall back to device flow
  await deviceFlow(clientId, scopes);
}

// Config file approach
const configPath = path.join(os.homedir(), '.mcp', 'google.json');
if (fs.existsSync(configPath)) {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  client.setCredentials(config.credentials);
}
```

### User Experience

**Setup (one-time)**:

```bash
# User generates token in Google Cloud Console
# User saves to environment
export GOOGLE_OAUTH_TOKEN="ya29.a0AfB_..."

# Or saves to config file
mkdir -p ~/.mcp
echo '{"access_token": "ya29.a0AfB_..."}' > ~/.mcp/google.json
```

**Usage (every time)**:

```bash
# MCP server automatically uses token
# No interactive auth needed
```

### When to Use

✅ **CI/CD**: Automated testing, deployments
✅ **Servers**: Long-running MCP servers
✅ **Advanced users**: Power users who understand tokens
✅ **Rate limiting**: Need consistent identity
✅ **Offline**: No browser available

❌ **General users**: Too technical
❌ **Security sensitive**: Tokens are long-lived
❌ **Shared machines**: Token leakage risk

---

## Pattern Combinations & Decision Tree

```
┌─────────────────────────────────────────┐
│ MCP Server Needs Google API Access      │
└────────────────┬────────────────────────┘
                 │
                 ▼
         Is this for CI/CD or automation?
         │                              │
         YES                            NO
         │                              │
         ▼                              ▼
    Use Pre-Generated Token     Is Claude Desktop available?
    (env var or config file)    │                          │
                                YES                        NO
                                │                          │
                                ▼                          ▼
                        Use Host-Mediated Auth      Use Device Flow
                        (Claude Desktop API)        (RFC 8628)
                                │                          │
                                ▼                          ▼
                        Claude Desktop chooses:    Display code,
                        - Browser + Loopback       poll for token
                        - Device Flow (fallback)
```

---

## Security Lessons from All Domains

### 1. PKCE is Mandatory (RFC 7636)

**From**: Native apps, CLIs, desktop apps
**Lesson**: All authorization code flows MUST use PKCE

```typescript
// Generate code verifier (43-128 chars, URL-safe)
const verifier = base64url(crypto.randomBytes(32));

// Generate code challenge (SHA256 of verifier)
const challenge = base64url(sha256(verifier));

// Include in auth request
const authUrl = `...&code_challenge=${challenge}&code_challenge_method=S256`;

// Include verifier when exchanging code
const tokenResp = await fetch('/token', {
  body: new URLSearchParams({
    code: authorizationCode,
    code_verifier: verifier, // ← Proves possession
    grant_type: 'authorization_code',
  }),
});
```

### 2. State Parameter is Mandatory

**From**: Web apps, mobile apps, desktop apps
**Lesson**: Prevent CSRF with state parameter

```typescript
// Generate random state
const state = base64url(crypto.randomBytes(16));

// Store state (session, memory, secure storage)
sessionState.set(state);

// Include in auth request
const authUrl = `...&state=${state}`;

// Verify on callback
if (receivedState !== sessionState.get()) {
  throw new Error('CSRF detected - state mismatch');
}
```

### 3. Secure Token Storage

**From**: All platforms

| Platform | Secure Storage       | API                          | MCP Usage             |
| -------- | -------------------- | ---------------------------- | --------------------- |
| macOS    | Keychain             | Security framework           | Claude Desktop stores |
| Windows  | Credential Manager   | Windows.Security.Credentials | Claude Desktop stores |
| Linux    | Secret Service       | libsecret, GNOME Keyring     | Claude Desktop stores |
| Node.js  | Electron safeStorage | Wraps platform APIs          | Claude Desktop uses   |

**Lesson**: Never store tokens in plain text. Always use platform-secure storage.

### 4. Token Refresh

**From**: All OAuth implementations
**Lesson**: Refresh tokens before expiry

```typescript
interface TokenStore {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

async function getValidToken(store: TokenStore): Promise<string> {
  // Check if token expires in next 5 minutes
  if (store.expires_at < Date.now() + 5 * 60 * 1000) {
    // Refresh token
    const newToken = await refreshToken(store.refresh_token);
    store.access_token = newToken.access_token;
    store.expires_at = Date.now() + newToken.expires_in * 1000;
    saveToken(store);
  }

  return store.access_token;
}

async function refreshToken(refreshToken: string): Promise<TokenResponse> {
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
      grant_type: 'refresh_token',
    }),
  });

  return resp.json();
}
```

### 5. Scope Minimization

**From**: All OAuth providers
**Lesson**: Request only needed scopes

```typescript
// ❌ Bad: Request all possible scopes
const scopes = [
  'https://www.googleapis.com/auth/drive', // Full access
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/calendar',
];

// ✅ Good: Request minimal scopes
const scopes = [
  'https://www.googleapis.com/auth/drive.readonly', // Read-only
];
```

---

## Failure Mode Analysis

### Cross-Domain Failure Patterns

| Failure           | Observed In    | Root Cause                 | Mitigation                         |
| ----------------- | -------------- | -------------------------- | ---------------------------------- |
| Token expiry      | All            | Time-based expiration      | Auto-refresh before expiry         |
| Network failure   | CLI, Desktop   | Connectivity loss          | Retry with exponential backoff     |
| User cancellation | All            | User closes browser        | Clear error, offer retry           |
| Code expiry       | Device Flow    | 15-minute timeout          | Clear countdown, allow restart     |
| Port conflict     | Loopback       | Another app using port     | Random ephemeral ports             |
| Scheme collision  | Custom schemes | Multiple apps claim scheme | Use domain-based schemes           |
| Firewall block    | Loopback       | Corporate firewall         | Fallback to device flow            |
| Rate limiting     | Device Flow    | Excessive polling          | Respect interval, handle slow_down |

### MCP-Specific Failure Scenarios

**Scenario 1: MCP server starts before user is ready**

```
Problem: Device flow initiated automatically, code expires
Solution: Lazy initialization - only start auth when tool used
```

**Scenario 2: Token refresh fails during tool execution**

```
Problem: Tool mid-execution, token expires, refresh fails
Solution: Queue operations, re-auth, replay queue
```

**Scenario 3: Multiple MCP tools need same API**

```
Problem: Each tool does separate OAuth, user consents multiple times
Solution: Host-mediated auth with session sharing
```

---

## Recommended Implementation for MCP

### Phase 1: Device Flow (MVP)

```typescript
// Simple, works everywhere, no dependencies
export async function authenticateGoogle(
  clientId: string,
  scopes: string[]
): Promise<GoogleOAuthToken> {
  return await deviceFlow(clientId, scopes);
}
```

**Why First**: Simplest to implement, works in all scenarios, no Claude Desktop changes needed.

### Phase 2: Host-Mediated (Optimal)

```typescript
// MCP SDK addition
export interface Server {
  // Existing methods...

  // New authentication method
  requestAuthentication(params: {
    provider: 'google' | 'microsoft' | string;
    scopes: string[];
    reason: string;
  }): Promise<OAuthToken>;
}
```

**Why Second**: Best UX, but requires Claude Desktop integration.

### Phase 3: Token-Based (Power Users)

```typescript
// Support env vars and config files
export async function authenticateGoogle(
  clientId: string,
  scopes: string[]
): Promise<GoogleOAuthToken> {
  // Check for pre-configured token
  if (process.env.GOOGLE_OAUTH_TOKEN) {
    return { access_token: process.env.GOOGLE_OAUTH_TOKEN };
  }

  // Fall back to device flow
  return await deviceFlow(clientId, scopes);
}
```

**Why Third**: Power user feature, not needed for general users.

---

## Conclusion: The Perfect MCP OAuth Strategy

Based on cross-domain analysis of CLI tools, desktop apps, VS Code extensions, and mobile patterns:

### Immediate (MVP)

**Implement Device Flow (RFC 8628)**

- Works everywhere
- No dependencies
- Standard protocol
- Proven at scale

### Near-Term (Optimal UX)

**Add Host-Mediated Auth via Claude Desktop**

- VS Code extension pattern
- Best user experience
- Token sharing
- Secure storage

### Long-Term (Power Users)

**Support Pre-Generated Tokens**

- CI/CD scenarios
- Power users
- Automation

### The Unified Flow

```typescript
async function authenticate(provider: string, scopes: string[]): Promise<string> {
  // 1. Check for pre-configured token (CI/CD)
  const envToken = process.env[`${provider.toUpperCase()}_TOKEN`];
  if (envToken) return envToken;

  // 2. Try host-mediated auth (Claude Desktop)
  if (isClaudeDesktopAvailable()) {
    return await claudeDesktop.requestAuth(provider, scopes);
  }

  // 3. Fall back to device flow (universal)
  return await deviceFlow(provider, scopes);
}
```

This three-tier approach provides:

- ✅ Universal compatibility (device flow)
- ✅ Optimal UX when available (host-mediated)
- ✅ Power user support (pre-generated tokens)
- ✅ Graceful degradation
- ✅ Future-proof architecture

---

## References

### RFC Standards

- RFC 6749: OAuth 2.0 Authorization Framework
- RFC 7636: PKCE (Proof Key for Code Exchange)
- RFC 8252: OAuth 2.0 for Native Apps
- RFC 8628: OAuth 2.0 Device Authorization Grant

### Real-World Implementations

- GitHub CLI: https://github.com/cli/cli
- VS Code Auth API: https://code.visualstudio.com/api/references/authentication
- Google OAuth: https://developers.google.com/identity/protocols/oauth2
- Microsoft Device Flow: https://learn.microsoft.com/en-us/azure/active-directory/develop/v2-oauth2-device-code

### Security Best Practices

- OWASP OAuth 2.0 Security: https://cheatsheetseries.owasp.org/cheatsheets/OAuth2_Cheat_Sheet.html
- OAuth 2.0 Threat Model: RFC 6819
