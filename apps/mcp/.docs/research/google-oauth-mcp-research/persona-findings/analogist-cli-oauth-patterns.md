# CLI OAuth Patterns - Cross-Domain Research

**Persona**: THE ANALOGIST
**Date**: 2025-11-07
**Research Domain**: Command-Line Interface OAuth Authentication

## Executive Summary

CLI tools face similar challenges to MCP servers: headless operation, no persistent browser access, and user authentication without GUI. This research examines proven OAuth patterns from GitHub CLI, gcloud, and AWS CLI.

## Key Patterns Discovered

### 1. Device Flow (RFC 8628) - The Dominant Pattern

**What It Is**: OAuth 2.0 Device Authorization Grant

- User initiates auth in CLI
- CLI displays a short code (e.g., "WDJB-MJHT")
- User visits verification URL on any device with a browser
- User enters code to authorize
- CLI polls for completion

**Who Uses It**:

- GitHub CLI (`gh auth login`)
- Google Cloud CLI (`gcloud auth login --no-launch-browser`)
- Azure CLI
- AWS CLI v2

**Why It Works**:

- **Headless-friendly**: No browser requirement on the CLI device
- **Cross-device**: User can authenticate on phone while CLI runs on server
- **Secure**: Authorization code never exposed to CLI directly
- **User-friendly**: Short codes (8 chars) easy to type

**Implementation Details**:

```
Step 1: CLI requests device code
  POST /devicecode
  → device_code, user_code, verification_uri, interval

Step 2: Display to user
  "Go to https://github.com/login/device"
  "Enter code: WDJB-MJHT"

Step 3: Poll for completion
  POST /access_token
  - Poll every 'interval' seconds
  - Handle authorization_pending
  - Receive access_token when approved
```

**Transferability to MCP**: ★★★★★

- MCP servers are headless like CLIs
- Users already have Claude Desktop (could embed browser)
- Polling fits async nature of MCP tools
- No platform-specific requirements

**Key Difference**: MCP runs as background service, CLI is foreground. Could display QR code in Claude Desktop UI.

---

### 2. Browser-Launch + Loopback

**What It Is**: Launch system browser, listen on localhost:port for callback

- CLI opens browser to authorization URL
- Authorization server redirects to http://127.0.0.1:{random-port}/callback
- CLI catches redirect, extracts authorization code

**Who Uses It**:

- GitHub CLI default mode
- gcloud default mode
- Most desktop CLIs

**Why It Works**:

- **UX**: Seamless for desktop users (browser auto-opens)
- **Secure**: Loopback interface isolated from network
- **Standard OAuth**: Uses authorization code flow with PKCE
- **Existing session**: Leverages browser cookies for SSO

**Implementation Details**:

```typescript
// Pseudocode
const port = getRandomAvailablePort(); // e.g., 51004
const server = http.createServer(handleCallback);
server.listen(port, '127.0.0.1');

const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?
  client_id=${CLIENT_ID}&
  redirect_uri=http://127.0.0.1:${port}/callback&
  response_type=code&
  scope=${SCOPES}&
  code_challenge=${challenge}&
  code_challenge_method=S256`;

openBrowser(authUrl);
// Wait for callback...
```

**Security Considerations**:

- Must use PKCE (Proof Key for Code Exchange)
- Random port prevents conflicts
- Bind only to 127.0.0.1 (not 0.0.0.0)
- Close server immediately after callback

**Transferability to MCP**: ★★★☆☆

- Requires ability to open browser programmatically
- Requires ability to listen on loopback interface
- Claude Desktop could facilitate this
- Not suitable for remote MCP servers

**Key Difference**: MCP may not have direct OS access to open browser. Needs host app (Claude Desktop) coordination.

---

### 3. Token-Based (Non-Interactive)

**What It Is**: Pre-generated tokens passed via environment variable or config file

- User creates token in web UI
- Passes to CLI via env var or file
- CLI uses token directly

**Who Uses It**:

- GitHub CLI (`GH_TOKEN` env var)
- gcloud (`GOOGLE_APPLICATION_CREDENTIALS`)
- AWS CLI (credentials file)
- Most CI/CD scenarios

**Why It Works**:

- **Automation-friendly**: Works in headless CI/CD
- **Simple**: No OAuth dance required
- **Revocable**: User controls token lifecycle
- **Widely understood**: Developers familiar with API tokens

**Implementation Patterns**:

```bash
# Environment variable
export GH_TOKEN=ghp_xxxxxxxxxxxx
gh api user

# Credentials file
cat ~/.aws/credentials
[default]
aws_access_key_id = AKIAIOSFODNN7EXAMPLE
aws_secret_access_key = wJalrXUtnFEMI/K7MDENG

# Service account key (gcloud)
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json
gcloud auth application-default login
```

**Security Best Practices**:

- Never commit tokens to git
- Use short-lived tokens when possible
- Rotate regularly
- Scope minimally
- Store in secure credential managers (not plain text)

**Transferability to MCP**: ★★★★★

- Perfect for server-to-server MCP scenarios
- Works for remote MCP servers
- Simple to implement
- User already provides credentials to Claude

**Key Difference**: MCP could use this as fallback. Google could provide "MCP tokens" with specific scopes.

---

### 4. Web-Based Flow with Copy/Paste (Deprecated but Informative)

**What It Is**: User manually copies authorization code from browser

- CLI displays URL
- User opens in browser
- User copies code from success page
- User pastes into CLI

**Historical Use**:

- Google OAuth "out-of-band" (OOB) flow
- Now deprecated due to security concerns

**Why It Was Deprecated**:

- Phishing risk (users trained to copy/paste secrets)
- Poor UX
- Device flow is superior alternative

**Lesson for MCP**: Don't use manual copy/paste flows. Device flow is the modern replacement.

---

## Comparative Analysis

| Pattern            | Headless-Friendly | Secure | UX Quality | Automation | MCP Fit |
| ------------------ | ----------------- | ------ | ---------- | ---------- | ------- |
| Device Flow        | ★★★★★             | ★★★★★  | ★★★★☆      | ★★☆☆☆      | ★★★★★   |
| Browser + Loopback | ★★★☆☆             | ★★★★★  | ★★★★★      | ★☆☆☆☆      | ★★★☆☆   |
| Token-Based        | ★★★★★             | ★★★★☆  | ★★★☆☆      | ★★★★★      | ★★★★★   |
| Copy/Paste (OOB)   | ★★★★☆             | ★★☆☆☆  | ★☆☆☆☆      | ★☆☆☆☆      | ☆☆☆☆☆   |

---

## Pattern Selection Decision Tree

```
Is this for automation/CI/CD?
├─ YES → Use Token-Based
└─ NO → Can you open a browser on the same device?
    ├─ YES → Use Browser + Loopback
    └─ NO → Use Device Flow
```

---

## Security Lessons for MCP

### From GitHub CLI:

1. **PKCE is mandatory** for all public clients
2. **State parameter** prevents CSRF attacks
3. **Token storage** should use OS credential managers (not plain files)
4. **Scope minimization** - request only needed permissions

### From gcloud:

1. **Multiple auth methods** for different scenarios
2. **Service accounts** for server-to-server
3. **Token refresh** handled automatically
4. **Application Default Credentials** pattern for libraries

### From AWS CLI:

1. **Credential file** format is widely adopted
2. **Profile-based** configuration for multiple accounts
3. **Temporary credentials** via STS AssumeRole
4. **MFA support** for sensitive operations

---

## Code Examples for MCP Context

### Device Flow Implementation (TypeScript)

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';

async function initiateDeviceFlow(clientId: string, scopes: string[]) {
  // Step 1: Request device code
  const response = await fetch('https://oauth2.googleapis.com/device/code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      scope: scopes.join(' '),
    }),
  });

  const data = await response.json();

  // Step 2: Display to user (via MCP notification or logs)
  console.log(`Visit: ${data.verification_uri}`);
  console.log(`Enter code: ${data.user_code}`);
  console.log(`Expires in: ${data.expires_in} seconds`);

  // Step 3: Poll for completion
  const token = await pollForToken(clientId, data.device_code, data.interval);
  return token;
}

async function pollForToken(
  clientId: string,
  deviceCode: string,
  interval: number
): Promise<string> {
  while (true) {
    await new Promise((resolve) => setTimeout(resolve, interval * 1000));

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        device_code: deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
    });

    const data = await response.json();

    if (data.access_token) {
      return data.access_token;
    }

    if (data.error === 'authorization_pending') {
      continue; // Keep polling
    }

    if (data.error === 'slow_down') {
      interval += 5; // Increase polling interval
      continue;
    }

    throw new Error(`Auth failed: ${data.error}`);
  }
}
```

### Loopback Listener (TypeScript)

```typescript
import http from 'node:http';
import { URLSearchParams } from 'node:url';

async function listenForCallback(): Promise<string> {
  return new Promise((resolve, reject) => {
    // Random ephemeral port
    const server = http.createServer((req, res) => {
      const url = new URL(req.url!, `http://127.0.0.1`);
      const code = url.searchParams.get('code');

      if (code) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<h1>Authentication successful! You can close this window.</h1>');
        server.close();
        resolve(code);
      } else {
        res.writeHead(400);
        res.end('Missing authorization code');
        server.close();
        reject(new Error('No code in callback'));
      }
    });

    // Bind only to loopback
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as any).port;
      console.log(`Listening on http://127.0.0.1:${port}`);
    });

    // Timeout after 5 minutes
    setTimeout(
      () => {
        server.close();
        reject(new Error('Timeout waiting for callback'));
      },
      5 * 60 * 1000
    );
  });
}
```

---

## Recommendations for MCP + Google OAuth

### Primary Recommendation: Device Flow

**Why**: Best fit for MCP's headless nature, works across all deployment scenarios, secure, proven at scale.

**Implementation Path**:

1. MCP tool initiates device flow
2. Returns user_code + verification_uri to Claude Desktop
3. Claude Desktop displays in UI (with QR code option)
4. MCP tool polls in background
5. Once authorized, store tokens securely
6. Handle refresh tokens automatically

### Secondary Recommendation: Token-Based

**Why**: Simple, works for automation, good for advanced users.

**Implementation Path**:

1. User generates OAuth token in Google Cloud Console
2. User provides token to MCP server (via env var or config)
3. MCP server validates and uses token
4. No runtime OAuth flow needed

### Tertiary Recommendation: Browser + Loopback (with Claude Desktop help)

**Why**: Best UX when available, leverages existing browser sessions.

**Implementation Path**:

1. MCP requests auth from Claude Desktop
2. Claude Desktop opens browser and listens on loopback
3. Claude Desktop returns authorization code to MCP
4. MCP exchanges code for tokens

---

## Failure Modes & Mitigations

### Device Flow Failures

| Failure         | Cause                           | Mitigation                               |
| --------------- | ------------------------------- | ---------------------------------------- |
| Code expires    | User doesn't complete in 15 min | Clear error message, offer restart       |
| User cancels    | User denies permission          | Graceful degradation, explain why needed |
| Rate limiting   | Too many polls                  | Respect `interval`, handle `slow_down`   |
| Network failure | Polling interrupted             | Retry with exponential backoff           |

### Loopback Failures

| Failure         | Cause                     | Mitigation                 |
| --------------- | ------------------------- | -------------------------- |
| Port conflict   | Another app using port    | Use random ephemeral port  |
| Firewall blocks | User firewall rules       | Fall back to device flow   |
| Browser closed  | User closes browser early | Timeout with clear message |
| No browser      | Headless environment      | Detect and use device flow |

---

## Adjacent Patterns Worth Noting

### Git Credential Helpers

- **Pattern**: Pluggable credential storage
- **Relevance**: MCP could use similar plugin architecture for OAuth providers
- **Example**: `git config credential.helper osxkeychain`

### SSH Key Management

- **Pattern**: Public/private key pairs, agent-based delegation
- **Relevance**: Alternative to OAuth for some scenarios
- **Limitation**: Not applicable to Google APIs (require OAuth)

### VPN Authentication

- **Pattern**: Certificate-based auth, MFA integration
- **Relevance**: MFA considerations for sensitive scopes
- **Example**: Google could require 2FA for certain MCP scopes

---

## Conclusion

CLI OAuth patterns are highly transferable to MCP servers. The device flow emerges as the clear winner for the MCP use case, with token-based auth as a strong secondary option. The key insight is that CLIs solved the headless authentication problem years ago, and we can directly apply their solutions.

**Primary Takeaway**: Don't reinvent the wheel. Device flow (RFC 8628) is the industry-standard solution for headless OAuth and maps perfectly to MCP's architecture.

---

## References

1. GitHub CLI OAuth: https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps
2. RFC 8628 (Device Flow): https://oauth.net/2/device-flow/
3. Google OAuth for Desktop: https://developers.google.com/identity/protocols/oauth2/native-app
4. AWS CLI Configuration: https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html
5. Git Credentials: https://git-scm.com/docs/gitcredentials
