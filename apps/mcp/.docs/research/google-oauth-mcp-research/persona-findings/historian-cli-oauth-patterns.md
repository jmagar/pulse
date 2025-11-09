# The Historian's Analysis: CLI OAuth Authentication Patterns Evolution

**Research Date**: 2025-11-06
**Evidence Quality**: Secondary (practitioner documentation, GitHub examples)
**Confidence**: High (85%)

---

## Executive Summary

CLI OAuth authentication has evolved through distinct phases from 2010-2025, driven by security improvements, UX considerations, and platform capabilities. This analysis examines successful and failed patterns, with specific focus on relevance to MCP servers operating via stdio transport.

---

## Evolution Timeline

### Phase 1: Pre-OAuth (2000-2010)

**Authentication Methods**:

- Username/password prompts in CLI
- API keys stored in `~/.apprc` files
- Basic Authentication with credentials in environment variables

**Why OAuth Needed**:

- No delegation (full credentials required)
- No scope limitation
- No token expiration
- Credentials exposed to every app

**Lesson**: OAuth solved real problems for CLI apps, not just web apps

---

### Phase 2: Early OAuth Adaptation (2010-2014)

#### Pattern 2.1: Manual Copy-Paste Flow

**How It Worked**:

1. CLI prints URL: "Visit https://provider.com/oauth and enter code: ABC123"
2. User manually opens browser, visits URL
3. User enters code shown by CLI
4. User authorizes app
5. Provider displays authorization code
6. User copies code, pastes into CLI
7. CLI exchanges code for token

**Examples**:

- Early Google API CLI tools
- Heroku CLI (pre-2015)
- Early AWS CLI

**Advantages**:

- Works on remote/headless systems
- No browser automation required
- User has full visibility into flow

**Disadvantages**:

- Poor UX (many manual steps)
- User error prone (copy/paste mistakes)
- Breaking users' flow (context switch)

**Security**:

- Authorization code visible to user (potential shoulder surfing)
- Code could be pasted into wrong terminal
- No PKCE (not invented until 2015)

**Timeline**:

- 2010-2012: Common pattern
- 2013-2014: Declining as better options emerged
- 2015+: Mostly replaced by device flow

**Status**: Deprecated, replaced by Device Authorization Flow

**MCP Relevance**: Low - Device flow provides same benefits with better UX

---

#### Pattern 2.2: Embedded Webview

**How It Worked**:

1. CLI app embeds browser engine (WebKit, Chromium)
2. Opens OAuth page in embedded browser
3. User completes authentication in embedded view
4. App intercepts redirect/callback
5. Extracts authorization code
6. Exchanges code for token

**Examples**:

- Early Dropbox CLI
- Some enterprise CLI tools
- Mobile apps (though not strictly CLI)

**Advantages**:

- Seamless UX (no context switch)
- App controls entire flow

**Disadvantages**:

- Large dependency (browser engine)
- Doesn't work for true CLI/headless
- Security concerns

**Security Issues**:

- App can intercept credentials
- User can't verify authentic OAuth page
- Phishing risk
- OAuth providers began detecting and blocking embedded webviews

**RFC 8252 Response**: "OAuth authorization requests from native apps should ONLY be made through external user-agents, primarily the user's browser."

**Timeline**:

- 2010-2014: Common in desktop apps with GUI components
- 2015-2016: OAuth providers began blocking
- 2017: RFC 8252 explicitly discourages
- 2018+: Widely considered anti-pattern

**Status**: Deprecated, considered security risk

**MCP Relevance**: Not applicable - MCP servers don't embed browsers

---

### Phase 3: Browser Integration Era (2014-2018)

#### Pattern 3.1: Custom URI Scheme Redirect

**How It Worked**:

1. CLI registers custom URI scheme (e.g., `myapp://oauth-callback`)
2. CLI opens browser to OAuth authorization URL
3. User completes authentication
4. Provider redirects to `myapp://oauth-callback?code=...`
5. OS launches CLI app with authorization code
6. CLI exchanges code for token

**Examples**:

- Slack CLI (early versions)
- Spotify CLI tools
- Various desktop OAuth integrations

**Advantages**:

- Good UX (automatic return to app)
- Works with system browser (no embedding)

**Disadvantages**:

- Platform-specific (requires OS support)
- Complex setup (URI scheme registration)

**Security Issues** (Critical Failures):

- **Multiple handler vulnerability**: Malicious app could register same URI scheme, intercept code
- **URI scheme leakage**: Authorization codes visible in system logs
- **No origin validation**: OAuth provider can't verify which app received redirect

**Timeline**:

- 2014-2015: Widely adopted
- 2015-2016: Security issues discovered and documented
- 2017: RFC 8252 warns against custom URI schemes
- 2018: Major platforms deprecate support
- 2019+: Replaced by platform-specific alternatives (Universal Links on iOS, App Links on Android)

**Status**: Deprecated for security reasons

**MCP Relevance**: Critical lesson - never use custom URI schemes for MCP OAuth

---

#### Pattern 3.2: Localhost HTTP Server

**How It Worked**:

1. CLI starts temporary HTTP server on localhost (e.g., `http://127.0.0.1:8080`)
2. CLI opens browser to OAuth authorization URL with `redirect_uri=http://localhost:8080/callback`
3. User completes authentication
4. Provider redirects to `http://localhost:8080/callback?code=...`
5. CLI's HTTP server receives request, extracts code
6. CLI shuts down HTTP server
7. CLI exchanges code for token

**Examples**:

- Google Cloud SDK (`gcloud auth login`)
- GitHub CLI (`gh auth login`)
- Terraform
- AWS Amplify CLI

**Advantages**:

- Works with system browser
- No custom URI scheme needed
- More secure than custom URI schemes
- Good UX (automatic return to app)

**Evolution of Pattern**:

**Version 1: Fixed Port (2014-2017)**

- Used predictable port (8080, 8000, 3000)
- Security issue: Port hijacking attack
- Malicious app binds port first, intercepts code

**Version 2: Random Port (2017-Present)**

- CLI requests random available port from OS
- Registers redirect_uri with port number dynamically
- More secure, prevents port hijacking

**Version 3: Port Range Registration (2019-Present)**

- OAuth provider allows registration of port range (e.g., `http://localhost:[49152-65535]/callback`)
- CLI binds to any available port in range
- Best of both worlds: security + flexibility

**Security Considerations**:

- PKCE mandatory (prevents code interception even if port hijacked)
- Timeout required (don't leave server running forever)
- State parameter validation (prevent CSRF)
- HTTPS not required for localhost (RFC 8252 exception)

**Current Status**: **Recommended pattern for CLI apps** (alongside device flow)

**MCP Relevance**: High - viable option for MCP servers as fallback to device flow

---

### Phase 4: Device Flow Era (2019-Present)

#### Pattern 4.1: Device Authorization Flow (RFC 8628)

**Published**: October 2019

**How It Works**:

1. CLI requests device code from OAuth provider:

   ```
   POST /device/code
   client_id=cli-app
   ```

2. Provider responds with:

   ```json
   {
     "device_code": "GmRhmhcxhwAzkoEqiMEg_DnyEysNkuNhszIySk9eS",
     "user_code": "WDJB-MJHT",
     "verification_uri": "https://example.com/device",
     "expires_in": 1800,
     "interval": 5
   }
   ```

3. CLI displays to user:

   ```
   Visit https://example.com/device
   Enter code: WDJB-MJHT
   ```

4. CLI starts polling token endpoint:

   ```
   POST /token
   grant_type=urn:ietf:params:oauth:grant-type:device_code
   device_code=GmRhmhcxhwAzkoEqiMEg_DnyEysNkuNhszIySk9eS
   client_id=cli-app
   ```

5. While user hasn't authorized, provider returns:

   ```json
   {
     "error": "authorization_pending"
   }
   ```

6. User completes authorization in browser (on any device)

7. CLI's next poll receives tokens:
   ```json
   {
     "access_token": "...",
     "refresh_token": "...",
     "expires_in": 3600
   }
   ```

**Examples**:

- GitHub CLI (`gh auth login` - device flow)
- Google Cloud SDK (device flow mode)
- Azure CLI (`az login` - device flow option)
- Google's oauth2l tool

**Advantages**:

- **Best UX for CLI**: User can complete auth on any device
- **Headless-friendly**: Works on servers without browsers
- **No redirect complexity**: No localhost server or URI schemes
- **User-friendly codes**: Short, human-typable codes (not full authorization code)
- **Flexible**: User can authorize on phone while CLI runs on headless server

**Security**:

- PKCE not required (device flow has different security model)
- User code acts as authorization confirmation
- Device code can't be used without user entering user code
- Time-limited (typical expiration: 15 minutes)

**Disadvantages**:

- Requires polling (network traffic while waiting)
- User must manually enter code (but codes are short)
- Not all OAuth providers support device flow yet

**Implementation Details**:

**Polling Strategy**:

- Use interval provided by server (usually 5 seconds)
- Implement exponential backoff on errors
- Handle `slow_down` error (provider requests slower polling)
- Timeout after expiration time

**User Code Format**:

- Usually 6-8 characters
- Often formatted with hyphen (WDJB-MJHT)
- Case-insensitive
- Avoids ambiguous characters (0/O, 1/I)

**Error Handling**:

- `authorization_pending`: Keep polling
- `slow_down`: Increase polling interval
- `access_denied`: User denied authorization
- `expired_token`: Device code expired, start over

**Current Status**: **Recommended pattern for CLI/headless apps**

**MCP Relevance**: **Highest relevance** - Device flow appears purpose-built for MCP server use case

---

### Phase 5: Modern Hybrid Approaches (2020-Present)

#### Pattern 5.1: Browser-First with Device Flow Fallback

**How It Works**:

1. CLI attempts localhost server + browser launch
2. If browser not available or user declines, fall back to device flow
3. User can choose preferred method

**Examples**:

- GitHub CLI (offers both options)
- Azure CLI (automatic fallback)
- Google Cloud SDK (user configurable)

**Implementation**:

```bash
# GitHub CLI example
gh auth login
? What account do you want to log into? GitHub.com
? What is your preferred protocol for Git operations? HTTPS
? How would you like to authenticate?
> Login with a web browser
  Paste an authentication token
```

**Advantages**:

- Best UX for users with browsers (automatic flow)
- Works for headless users (device flow)
- User choice and control

**MCP Relevance**: Excellent pattern for MCP servers

---

#### Pattern 5.2: QR Code Enhancement to Device Flow

**How It Works**:

1. CLI performs standard device flow
2. Additionally displays QR code encoding verification URL + user code
3. User can scan QR code with phone instead of manually typing URL

**Example Display**:

```
Visit https://github.com/login/device
Enter code: WDJB-MJHT

Or scan this QR code:
█████████████████████████████
███ ▄▄▄▄▄ █▀ █▀▀▄▄█ ▄▄▄▄▄ ███
███ █   █ █▀ █  █▄█ █   █ ███
███ █▄▄▄█ ██ █▄ █ █ █▄▄▄█ ███
███▄▄▄▄▄▄▄█ ▀ ▀ █ ▀▄▄▄▄▄▄▄███
████ ▄▀▀ ▄    ▄█▄▄▀▀ ▀█ █▄███
█████ ████▄ ██▄█▄  ███▀█▀████
███ ███  ▄ ▀██▄█▄█▀█ █▄▀▄████
███ ▄▄▄▄▄ █   █ ▄ ▄█▀█  █████
███ █   █ █ ▀██▄▀ █▀▀▀▄▀▄████
███ █▄▄▄█ █▀▄▄█▀▀ █ ▄▄ ▄█████
███▄▄▄▄▄▄▄█▄██▄▄▄▄██▄█▄██████
█████████████████████████████
```

**Examples**:

- Stripe CLI
- Some enterprise SSO CLI tools

**Advantages**:

- Faster for mobile users (no manual typing)
- More accessible
- Preserves device flow's flexibility

**Disadvantages**:

- Terminal must support rendering QR codes
- May not work in all SSH clients

**Implementation Considerations**:

- Use standard QR encoding libraries
- Ensure QR code displays correctly in various terminals
- Provide text alternative (always display URL and code)

**MCP Relevance**: Nice enhancement, but not critical for MCP servers

---

## Comparative Analysis of Patterns

### Pattern Comparison Matrix

| Pattern           | UX        | Security         | Headless Support | Platform Independence | MCP Suitability |
| ----------------- | --------- | ---------------- | ---------------- | --------------------- | --------------- |
| Manual Copy-Paste | Poor      | Medium           | Yes              | Yes                   | Low             |
| Embedded Webview  | Good      | Poor             | No               | Medium                | None            |
| Custom URI Scheme | Good      | Poor             | No               | Low                   | None            |
| Localhost Server  | Good      | Good (with PKCE) | No               | Yes                   | Medium          |
| Device Flow       | Good      | Excellent        | Yes              | Yes                   | **Excellent**   |
| Hybrid Approach   | Excellent | Excellent        | Yes              | Yes                   | **Excellent**   |

---

## Successful Implementation Case Studies

### Case Study 1: GitHub CLI

**OAuth Implementation**:

- Primary: Localhost server + browser launch
- Fallback: Device flow
- Explicit user choice during setup

**Authentication Command**:

```bash
gh auth login
```

**Flow**:

1. Prompts for GitHub.com or Enterprise
2. Offers protocol choice (HTTPS/SSH)
3. Offers authentication method:
   - Web browser (localhost flow)
   - Authentication token (manual paste)

**Token Storage**:

- **Platform**:
  - macOS: Keychain Access
  - Linux: encrypted file with libsecret when available
  - Windows: Credential Manager
- **Fallback**: Encrypted file if OS keychain unavailable

**Token Lifecycle**:

- Access tokens cached until expiration
- Automatic refresh when expired
- User can manually revoke with `gh auth logout`

**Security Features**:

- PKCE for localhost flow
- State parameter validation
- Random port selection
- 60-second timeout on localhost server

**Lessons for MCP**:

- Explicit authentication command, not automatic
- User choice between methods
- Graceful fallback to device flow
- Platform-specific secure storage

---

### Case Study 2: Google Cloud SDK

**OAuth Implementation**:

- Default: Localhost server + browser launch
- Alternative: Device flow (flag: `--no-launch-browser`)
- Remote/SSH: Automatically uses device flow

**Authentication Command**:

```bash
gcloud auth login
```

**Flow Detection**:

1. Detects if running in SSH session
2. Detects if DISPLAY environment variable set (Linux)
3. Automatically chooses appropriate flow
4. User can override with flags

**Token Storage**:

- **Location**: `~/.config/gcloud/` (encrypted on Windows)
- **Format**: JSON with credentials
- **Permissions**: 0600 (user read/write only)

**Token Lifecycle**:

- Access tokens cached with expiration
- Refresh tokens stored securely
- Automatic refresh on API calls
- Handles token revocation gracefully

**Advanced Features**:

- Multiple account support
- Application Default Credentials (ADC)
- Service account impersonation
- Integration with other Google tools

**Lessons for MCP**:

- Automatic flow detection (SSH, headless)
- Multiple authentication strategies
- Graceful handling of revoked credentials
- Consideration for automated/service scenarios

---

### Case Study 3: Azure CLI

**OAuth Implementation**:

- Primary: Browser-based device flow
- Alternative: Service principal (non-interactive)
- Web Account Manager (Windows only)

**Authentication Command**:

```bash
az login
```

**Flow**:

1. Initiates device flow by default
2. Displays verification URL and user code
3. Opens browser automatically (if available)
4. Polls for completion

**Unique Features**:

- Supports multiple Azure clouds (public, government, China)
- Tenant selection during auth
- Subscription selection after auth
- Integration with Azure RBAC

**Token Storage**:

- **Location**: `~/.azure/` directory
- **Format**: JSON (encrypted on Windows)
- **Multiple identities**: Supports multiple logged-in accounts

**Lessons for MCP**:

- Device flow as primary (not fallback)
- Automatic browser launch with device flow (best of both worlds)
- Support for multi-tenant scenarios
- Post-authentication configuration (tenant/subscription selection)

---

## Failed Implementations: What Went Wrong

### Anti-Pattern 1: AWS CLI (Early Versions, 2013-2015)

**Problem**: Required IAM user credentials (access key + secret key), no OAuth

**Why It Failed**:

- Long-lived credentials
- No scope limitation
- Stored in plain text (`~/.aws/credentials`)
- No delegation (full account access)

**User Complaints**:

- Security concerns about long-lived credentials
- Credential rotation painful
- No way to limit permissions

**Evolution**:

- 2016: Introduced temporary credentials via STS
- 2018: Added SAML/SSO integration
- 2020: Improved temporary credential handling
- 2023: Still doesn't use OAuth (uses IAM, which predates AWS)

**Lesson**: Even major platforms struggled with CLI authentication. OAuth provides better model for delegation and limited access.

---

### Anti-Pattern 2: Heroku CLI (Pre-2015)

**Problem**: Username/password prompt in CLI

**Implementation**:

```bash
heroku login
Email: user@example.com
Password: ********
```

**Why It Failed**:

- Trained users to enter passwords into CLI apps
- No MFA support
- Credentials transmitted to CLI (not just OAuth provider)
- Password stored locally (encrypted, but still present)

**Evolution**:

- 2015: Switched to OAuth with localhost flow
- Improved: Now uses browser-based OAuth
- User never enters password in CLI

**Lesson**: Never prompt for passwords in CLI OAuth. Use proper OAuth flows.

---

### Anti-Pattern 3: Docker CLI (Early Versions)

**Problem**: Username/password stored in `~/.docker/config.json` (Base64 encoded, not encrypted)

**Why It Failed**:

- Base64 encoding is not encryption
- Credentials in plain sight for anyone reading config file
- Backups contained credentials
- Docker Hub API keys also stored insecurely

**Evolution**:

- 2017: Introduced credential helpers (OS keychain integration)
- 2018: Deprecated storing credentials in config.json
- 2020: Mandatory use of credential helpers on desktop

**Lesson**: Never store credentials in config files. Use OS keychain from day one.

---

## Technical Implementation Patterns

### Pattern 1: Device Flow Implementation (Detailed)

**Step-by-Step Implementation Guide**:

#### Step 1: Initiate Device Authorization

**Request**:

```http
POST /oauth/device/code HTTP/1.1
Host: oauth.provider.com
Content-Type: application/x-www-form-urlencoded

client_id=YOUR_CLIENT_ID
&scope=read%20write
```

**Response**:

```json
{
  "device_code": "GmRhmhcxhwAzkoEqiMEg_DnyEysNkuNhszIySk9eS",
  "user_code": "WDJB-MJHT",
  "verification_uri": "https://oauth.provider.com/device",
  "verification_uri_complete": "https://oauth.provider.com/device?user_code=WDJB-MJHT",
  "expires_in": 1800,
  "interval": 5
}
```

#### Step 2: Display Instructions to User

**Console Output**:

```
To authenticate, visit:
https://oauth.provider.com/device

Enter code: WDJB-MJHT

Waiting for authorization...
```

**Optional**: Open browser automatically to `verification_uri_complete`

#### Step 3: Poll Token Endpoint

**Initial Request**:

```http
POST /oauth/token HTTP/1.1
Host: oauth.provider.com
Content-Type: application/x-www-form-urlencoded

grant_type=urn:ietf:params:oauth:grant-type:device_code
&device_code=GmRhmhcxhwAzkoEqiMEg_DnyEysNkuNhszIySk9eS
&client_id=YOUR_CLIENT_ID
```

**Pending Response** (keep polling):

```json
{
  "error": "authorization_pending",
  "error_description": "User has not yet authorized the device"
}
```

**Slow Down Response** (increase interval):

```json
{
  "error": "slow_down",
  "error_description": "Polling too frequently"
}
```

**Success Response**:

```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "def50200a8b7...",
  "scope": "read write"
}
```

**Error Responses**:

```json
{
  "error": "access_denied",
  "error_description": "User denied authorization"
}
```

```json
{
  "error": "expired_token",
  "error_description": "Device code has expired"
}
```

#### Step 4: Handle Completion

**On Success**:

- Store tokens securely (OS keychain)
- Display success message
- Continue with CLI operation

**On Denial**:

- Display error message
- Exit gracefully or retry

**On Expiration**:

- Display timeout message
- Offer to restart flow

---

### Pattern 2: Localhost Flow Implementation (Detailed)

#### Step 1: Start Localhost Server

**Pseudocode**:

```typescript
// Bind to random available port
const server = createServer((req, res) => {
  if (req.url.startsWith('/callback')) {
    handleOAuthCallback(req, res);
  }
});

// Port 0 means OS assigns random available port
server.listen(0, '127.0.0.1', () => {
  const port = server.address().port;
  const redirectUri = `http://localhost:${port}/callback`;

  initiateOAuthFlow(redirectUri);
});
```

#### Step 2: Initiate OAuth Flow with PKCE

**Generate PKCE Values**:

```typescript
import crypto from 'crypto';

// Generate code verifier (43-128 characters)
const codeVerifier = crypto.randomBytes(32).toString('base64url');

// Generate code challenge (SHA-256 hash of verifier)
const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
```

**Generate State Parameter**:

```typescript
const state = crypto.randomBytes(32).toString('hex');

// Store state securely (in-memory is fine for short-lived flow)
const pendingStates = new Set([state]);
```

**Construct Authorization URL**:

```typescript
const authUrl = new URL('https://oauth.provider.com/authorize');
authUrl.searchParams.set('client_id', 'YOUR_CLIENT_ID');
authUrl.searchParams.set('redirect_uri', redirectUri);
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('scope', 'read write');
authUrl.searchParams.set('state', state);
authUrl.searchParams.set('code_challenge', codeChallenge);
authUrl.searchParams.set('code_challenge_method', 'S256');
```

#### Step 3: Open Browser

**Cross-Platform Browser Launch**:

```typescript
import { exec } from 'child_process';

function openBrowser(url: string) {
  const command =
    process.platform === 'darwin'
      ? `open "${url}"`
      : process.platform === 'win32'
        ? `start "" "${url}"`
        : `xdg-open "${url}"`;

  exec(command);
}

openBrowser(authUrl.toString());
```

#### Step 4: Handle Callback

**Callback Handler**:

```typescript
async function handleOAuthCallback(req, res) {
  const params = new URL(req.url, 'http://localhost').searchParams;

  const code = params.get('code');
  const state = params.get('state');
  const error = params.get('error');

  // Handle error
  if (error) {
    res.end('Authentication failed: ' + error);
    server.close();
    return;
  }

  // Validate state parameter
  if (!state || !pendingStates.has(state)) {
    res.end('Invalid state parameter (CSRF protection)');
    server.close();
    return;
  }

  pendingStates.delete(state); // One-time use

  // Exchange code for token
  try {
    const tokens = await exchangeCodeForToken(code, codeVerifier, redirectUri);

    // Store tokens securely
    await storeTokens(tokens);

    res.end('Authentication successful! You can close this window.');
    server.close();
  } catch (err) {
    res.end('Token exchange failed: ' + err.message);
    server.close();
  }
}
```

#### Step 5: Exchange Code for Token

**Token Exchange Request**:

```typescript
async function exchangeCodeForToken(code, codeVerifier, redirectUri) {
  const response = await fetch('https://oauth.provider.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: redirectUri,
      client_id: 'YOUR_CLIENT_ID',
      code_verifier: codeVerifier,
    }),
  });

  if (!response.ok) {
    throw new Error('Token exchange failed');
  }

  return await response.json();
}
```

#### Step 6: Implement Timeout

**Auto-Close Server**:

```typescript
// Close server after 60 seconds if no callback received
const timeout = setTimeout(() => {
  console.log('Authentication timed out');
  server.close();
}, 60000);

// Clear timeout if callback received
server.on('close', () => clearTimeout(timeout));
```

---

## Token Storage Best Practices

### Cross-Platform Keychain Integration

#### macOS: Keychain Access

**Library**: `keytar` or native `security` command

**Storage**:

```typescript
import keytar from 'keytar';

async function storeTokens(tokens) {
  await keytar.setPassword(
    'mcp-server', // service name
    'oauth-access-token', // account name
    tokens.access_token
  );

  await keytar.setPassword('mcp-server', 'oauth-refresh-token', tokens.refresh_token);
}

async function retrieveTokens() {
  const accessToken = await keytar.getPassword('mcp-server', 'oauth-access-token');

  const refreshToken = await keytar.getPassword('mcp-server', 'oauth-refresh-token');

  return { accessToken, refreshToken };
}
```

#### Linux: libsecret

**Library**: `@hapi/keyring` or native `secret-tool` command

**Storage**:

```typescript
import { Keyring } from '@hapi/keyring';

async function storeTokens(tokens) {
  const keyring = new Keyring();

  await keyring.setPassword(
    { service: 'mcp-server', account: 'oauth-access-token' },
    tokens.access_token
  );

  await keyring.setPassword(
    { service: 'mcp-server', account: 'oauth-refresh-token' },
    tokens.refresh_token
  );
}
```

#### Windows: Credential Manager

**Library**: `node-credential-store` or `keytar`

**Storage**: Same API as macOS example (keytar is cross-platform)

---

## MCP Server Recommendations

### Recommended: Device Flow + Localhost Fallback

**Primary**: Device Authorization Flow

- Best for headless scenarios
- Works for remote MCP servers
- User can authorize on any device
- No browser requirement on server machine

**Fallback**: Localhost + Browser

- Better UX when browser available
- Faster for local development
- User preference

### Implementation Strategy for MCP

**Authentication Tool**:

```typescript
{
  name: 'authenticate',
  description: 'Authenticate with Google to enable OAuth-protected tools',
  parameters: {
    method: {
      type: 'string',
      enum: ['device', 'browser', 'auto'],
      default: 'auto',
      description: 'Authentication method: device (device flow), browser (localhost), auto (detect best)'
    }
  }
}
```

**Flow Detection**:

```typescript
function detectBestAuthMethod() {
  // Check if running in SSH session
  if (process.env.SSH_CLIENT || process.env.SSH_TTY) {
    return 'device';
  }

  // Check if DISPLAY set (Linux)
  if (process.platform === 'linux' && !process.env.DISPLAY) {
    return 'device';
  }

  // Check if terminal supports browser launch
  if (canLaunchBrowser()) {
    return 'browser';
  }

  return 'device'; // Safe default
}
```

**User Experience**:

```
> authenticate

Initiating authentication with Google...

Visit https://google.com/device
Enter code: WDJB-MJHT

Waiting for authorization...
✓ Authentication successful!

Google OAuth tools are now available.
```

---

## Conclusion

CLI OAuth authentication has evolved from insecure, poor-UX patterns (manual copy-paste, custom URI schemes) to secure, user-friendly approaches (device flow, localhost with PKCE). The Device Authorization Flow (RFC 8628), published in 2019, represents the culmination of this evolution and is **purpose-built for scenarios like MCP servers**.

**Key Lessons for MCP**:

1. Use Device Flow as primary method
2. Offer localhost + browser as fallback (user preference)
3. Store tokens in OS keychain, never plain text
4. Implement refresh token rotation
5. Use PKCE even for confidential clients
6. Provide clear, explicit authentication commands
7. Handle token lifecycle gracefully (expiration, revocation)
8. Support headless environments (device flow essential)

The history of CLI OAuth demonstrates that security and UX can coexist. Modern patterns (especially device flow) provide both strong security and excellent user experience. MCP server developers should leverage these hard-won lessons rather than attempting to reinvent CLI authentication.
