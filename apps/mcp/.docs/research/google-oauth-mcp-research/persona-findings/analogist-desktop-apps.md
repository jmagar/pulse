# Desktop App OAuth Patterns - Cross-Domain Research

**Persona**: THE ANALOGIST
**Date**: 2025-11-07
**Research Domain**: Desktop Application OAuth (Electron, VS Code Extensions, Native Apps)

## Executive Summary

Desktop applications face authentication challenges between traditional web apps and CLI tools. They have GUI capabilities but run as local applications without reliable redirect URIs. This research examines OAuth patterns from Electron apps, VS Code extensions, and platform-specific implementations (macOS, Windows, Linux).

## Key Patterns Discovered

### 1. Custom URI Scheme (Deep Linking)

**What It Is**: Register a custom URL scheme (e.g., `myapp://`) with the operating system

- App registers scheme during installation
- OAuth provider redirects to `myapp://oauth/callback?code=...`
- OS launches app and passes URL as parameter

**Who Uses It**:

- VS Code (`vscode://`)
- Slack Desktop
- Spotify
- Discord
- Most Electron apps

**Why It Works**:

- **Platform native**: Supported on all major OSes
- **Secure**: Only the registered app can receive the callback
- **Seamless UX**: Browser → App transition feels natural
- **No server required**: No need to run HTTP server

**Platform-Specific Implementation**:

**macOS** (Info.plist):

```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>com.example.myapp</string>
    </array>
    <key>CFBundleURLName</key>
    <string>My App OAuth</string>
  </dict>
</array>
```

**Windows** (Registry):

```
HKEY_CLASSES_ROOT\myapp
  (Default) = "URL:My App Protocol"
  URL Protocol = ""
HKEY_CLASSES_ROOT\myapp\shell\open\command
  (Default) = "C:\Path\To\MyApp.exe" "%1"
```

**Linux** (Desktop file):

```ini
[Desktop Entry]
Name=My App
Exec=/usr/bin/myapp %u
MimeType=x-scheme-handler/myapp;
```

**Security Requirement (RFC 7595)**:

- Must use reverse domain notation: `com.example.app://`
- NOT just `myapp://` (collision risk)
- Proves ownership of domain

**Transferability to MCP**: ★★★★☆

- MCP server could register custom scheme
- Claude Desktop could register `claude://` or `mcp://`
- Works for local MCP servers only (not remote)
- Requires OS-level integration

**Key Difference**: MCP runs as background service. Would need Claude Desktop to be the registered handler and forward to MCP.

---

### 2. Claimed HTTPS URLs (Universal Links / App Links)

**What It Is**: Claim ownership of HTTPS URLs you control

- App proves it owns `https://app.example.com`
- OS redirects those URLs to app instead of browser
- More secure than custom schemes (verified ownership)

**Who Uses It**:

- iOS Universal Links
- Android App Links
- macOS Universal Links
- Windows URI Activation

**Implementation Requirements**:

**iOS** (Associated Domains entitlement):

```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appID": "TEAMID.com.example.app",
        "paths": ["/oauth/*"]
      }
    ]
  }
}
```

Host at: `https://app.example.com/.well-known/apple-app-site-association`

**Android** (App Links):

```xml
<intent-filter android:autoVerify="true">
  <action android:name="android.intent.action.VIEW" />
  <data android:scheme="https"
        android:host="app.example.com"
        android:pathPrefix="/oauth/" />
</intent-filter>
```

Host at: `https://app.example.com/.well-known/assetlinks.json`

**Advantages Over Custom Schemes**:

- **Verified ownership**: OS validates domain control
- **No collisions**: Only one app can claim a domain
- **Fallback**: Opens in browser if app not installed
- **Trust**: Users see legitimate domain

**Transferability to MCP**: ★★★☆☆

- Requires web server control (`anthropic.com` or `claude.ai`)
- Best for official Claude/Anthropic-provided MCP servers
- Third-party MCP servers couldn't use this
- Platform-specific implementation

**Key Difference**: Requires domain ownership verification. Great for official integrations, not for third-party MCP servers.

---

### 3. Embedded Browser (In-App Web View)

**What It Is**: Embed a browser component within the app

- Opens OAuth flow in embedded browser
- Intercepts redirect to extract authorization code
- Never leaves the app

**Who Uses It**:

- Mobile apps (historically)
- Some desktop apps
- **DEPRECATED for OAuth by RFC 8252**

**Why It's Problematic**:

- **Security risk**: Host app can steal credentials
- **Poor UX**: No saved passwords, 2FA state
- **Phishing training**: Teaches users bad habits
- **Session isolation**: Can't use existing logins

**RFC 8252 Quote**:

> "Native apps MUST NOT use embedded user-agents to perform authorization requests"

**Alternative**: System browser or in-app browser tabs (SFSafariViewController, Chrome Custom Tabs)

**Transferability to MCP**: ★☆☆☆☆

- Explicitly NOT RECOMMENDED
- Security concerns apply equally to MCP
- Don't use embedded browsers for OAuth

---

### 4. System Browser with Loopback

**What It Is**: Open system browser, listen on localhost for redirect

- Same as CLI pattern (see CLI research document)
- Works well for desktop apps with network access

**Who Uses It**:

- Many Electron apps
- Desktop OAuth implementations
- Cross-platform apps

**Implementation (Electron example)**:

```javascript
const { shell } = require('electron');
const http = require('http');

async function authenticate() {
  const port = 51234; // Or random
  const server = http.createServer(handleCallback);
  server.listen(port, '127.0.0.1');

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?...&redirect_uri=http://127.0.0.1:${port}/callback`;

  // Open in system browser
  shell.openExternal(authUrl);

  return new Promise((resolve, reject) => {
    function handleCallback(req, res) {
      // Extract code from req.url
      // Close server
      // Resolve with code
    }
  });
}
```

**Transferability to MCP**: ★★★★☆

- Works well if MCP has network access
- Requires ability to open browser
- Claude Desktop could facilitate
- Same as CLI loopback pattern

---

## VS Code Extension Pattern (Particularly Relevant)

VS Code extensions face similar constraints to MCP:

- Run in sandboxed environment
- No direct browser access
- Need to authenticate with external services

**VS Code's Solution: Authentication Provider API**

```typescript
import * as vscode from 'vscode';

// Built-in authentication providers
const session = await vscode.authentication.getSession(
  'microsoft', // or 'github'
  ['user.read'],
  { createIfNone: true }
);

// session.accessToken is now available
```

**How It Works**:

1. Extension requests auth via VS Code API
2. VS Code handles the OAuth flow (system browser + loopback)
3. VS Code returns token to extension
4. Extension never sees OAuth complexity

**VS Code Custom Auth Provider** (for other services):

```typescript
class GoogleAuthProvider implements vscode.AuthenticationProvider {
  async getSessions(scopes: string[]): Promise<vscode.AuthenticationSession[]> {
    // Return cached sessions
  }

  async createSession(scopes: string[]): Promise<vscode.AuthenticationSession> {
    // Implement OAuth flow
    // Can use system browser + loopback
    return {
      id: 'unique-id',
      accessToken: 'token',
      account: { id: 'user-id', label: 'User Name' },
      scopes: scopes,
    };
  }

  async removeSession(sessionId: string): Promise<void> {
    // Logout
  }
}

vscode.authentication.registerAuthenticationProvider('google', 'Google', new GoogleAuthProvider());
```

**Transferability to MCP**: ★★★★★

- **Perfect analog**: VS Code extensions ≈ MCP tools
- **Host-mediated auth**: VS Code ≈ Claude Desktop
- **Provider abstraction**: Exactly what MCP needs
- **Proven pattern**: Used by millions

**Key Insight**: Claude Desktop should provide authentication API similar to VS Code's. MCP tools request auth, Claude Desktop handles the flow.

---

## Chrome Extension OAuth (Manifest V3)

Chrome extensions have unique OAuth requirements:

- Run in browser context
- Have web origin restrictions
- Limited network access

**Chrome Identity API**:

```javascript
chrome.identity.launchWebAuthFlow(
  {
    url: 'https://accounts.google.com/o/oauth2/v2/auth?...',
    interactive: true,
  },
  function (redirectUrl) {
    // Extract token from redirectUrl
  }
);
```

**How It Works**:

1. Opens OAuth page in special Chrome window
2. Intercepts redirect to extension
3. Returns redirect URL to extension
4. Extension extracts token

**Redirect URI Format**:

```
https://<extension-id>.chromiumapp.org/oauth2callback
```

**Transferability to MCP**: ★★☆☆☆

- Chrome-specific implementation
- Requires browser context
- Not applicable to MCP servers
- Interesting for browser-based MCP clients

---

## Platform-Specific Patterns

### macOS Implementation

**Best Practice: SFAuthenticationSession (iOS 12+)**

```swift
import AuthenticationServices

let session = ASWebAuthenticationSession(
  url: authURL,
  callbackURLScheme: "com.example.app"
) { callbackURL, error in
  guard let url = callbackURL else { return }
  // Extract authorization code from URL
}

session.presentationContextProvider = self
session.start()
```

**Features**:

- Opens Safari in-app browser tab
- Shares cookies with Safari (SSO)
- Secure authentication context
- Recommended by Apple

### Windows Implementation

**Best Practice: Web Authentication Broker (UWP)**

```csharp
var authResult = await WebAuthenticationBroker.AuthenticateAsync(
  WebAuthenticationOptions.None,
  new Uri(authorizationUrl),
  new Uri("ms-app://callback")
);

// Extract token from authResult.ResponseData
```

**Features**:

- System-level authentication UI
- Secure token handling
- Supports SSO
- Works with Windows Hello

### Linux Implementation

**Common Pattern**: Open browser + loopback (no platform-specific API)

```bash
# Open browser
xdg-open "https://accounts.google.com/..."

# Listen on loopback
nc -l 127.0.0.1 3000
```

---

## Security Considerations

### PKCE (Proof Key for Code Exchange) - MANDATORY

All desktop/native apps MUST use PKCE (RFC 7636):

```
Step 1: Generate code verifier (random string)
  const verifier = base64url(crypto.randomBytes(32));

Step 2: Generate code challenge
  const challenge = base64url(sha256(verifier));

Step 3: Include in auth request
  ?code_challenge=<challenge>
  &code_challenge_method=S256

Step 4: Include verifier when exchanging code
  POST /token
  code=<authorization_code>
  code_verifier=<verifier>
```

**Why**: Prevents authorization code interception attacks

### State Parameter - MANDATORY

```javascript
const state = base64url(crypto.randomBytes(16));
// Store state locally
sessionStorage.setItem('oauth_state', state);

// Include in auth request
const authUrl = `...&state=${state}`;

// Verify on callback
if (receivedState !== sessionStorage.getItem('oauth_state')) {
  throw new Error('CSRF detected');
}
```

**Why**: Prevents cross-site request forgery (CSRF)

### Token Storage

**Best Practices**:

- **macOS**: Keychain Services
- **Windows**: Credential Manager (Windows.Security.Credentials)
- **Linux**: Secret Service API (libsecret, GNOME Keyring)
- **Electron**: safeStorage API (wraps platform APIs)

**Example (Electron)**:

```javascript
const { safeStorage } = require('electron');

// Store token
const encrypted = safeStorage.encryptString(accessToken);
fs.writeFileSync('token.enc', encrypted);

// Retrieve token
const encrypted = fs.readFileSync('token.enc');
const accessToken = safeStorage.decryptString(encrypted);
```

**DO NOT**: Store tokens in plain text files, localStorage, or hardcode

---

## Comparative Analysis

| Pattern                   | Security | UX    | Cross-Platform | MCP Fit | Complexity |
| ------------------------- | -------- | ----- | -------------- | ------- | ---------- |
| Custom URI Scheme         | ★★★★☆    | ★★★★☆ | ★★★★★          | ★★★★☆   | ★★☆☆☆      |
| Claimed HTTPS             | ★★★★★    | ★★★★★ | ★★★★☆          | ★★★☆☆   | ★★★★☆      |
| System Browser + Loopback | ★★★★★    | ★★★★★ | ★★★★★          | ★★★★★   | ★★★☆☆      |
| Embedded Browser          | ★☆☆☆☆    | ★★☆☆☆ | ★★★★☆          | ☆☆☆☆☆   | ★★★★☆      |
| VS Code-style API         | ★★★★★    | ★★★★★ | ★★★★★          | ★★★★★   | ★★☆☆☆      |

---

## Recommended Architecture for MCP

### Option 1: Claude Desktop as Auth Mediator (Recommended)

```
┌─────────────┐
│ MCP Tool    │
│ (requests   │
│  auth)      │
└──────┬──────┘
       │
       │ requestAuth(provider, scopes)
       │
       ▼
┌─────────────────────┐
│ Claude Desktop      │
│                     │
│ 1. Opens browser    │
│ 2. Listens loopback │
│ 3. Handles OAuth    │
│ 4. Stores token     │
└──────┬──────────────┘
       │
       │ returns token
       │
       ▼
┌─────────────┐
│ MCP Tool    │
│ (uses token)│
└─────────────┘
```

**Advantages**:

- MCP tool doesn't handle OAuth complexity
- Claude Desktop reuses tokens across tools
- Secure token storage in platform keychain
- Works for all MCP tools

### Option 2: Direct Integration (Advanced)

MCP server implements OAuth directly:

- Registers custom URI scheme
- Opens system browser
- Listens on loopback
- Handles token refresh

**Use When**:

- Standalone MCP server (not via Claude Desktop)
- Custom OAuth provider
- Advanced control needed

---

## Code Examples

### Custom URI Scheme Handler (Electron)

```javascript
const { app } = require('electron');

// Register protocol
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('myapp', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('myapp');
}

// Handle protocol URL
app.on('open-url', (event, url) => {
  event.preventDefault();
  // Parse URL: myapp://oauth/callback?code=...
  const code = new URL(url).searchParams.get('code');
  // Exchange code for token
});
```

### System Browser + Loopback (TypeScript)

```typescript
import { spawn } from 'child_process';
import http from 'http';

async function authenticate(): Promise<string> {
  const port = 0; // Random port
  const server = http.createServer();

  const tokenPromise = new Promise<string>((resolve, reject) => {
    server.on('request', (req, res) => {
      const url = new URL(req.url!, `http://localhost:${port}`);
      const code = url.searchParams.get('code');

      if (code) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<h1>Success! Close this window.</h1>');
        server.close();
        resolve(code);
      }
    });
  });

  server.listen(port, '127.0.0.1', () => {
    const actualPort = (server.address() as any).port;
    const authUrl = buildAuthUrl(actualPort);

    // Open browser (platform-specific)
    if (process.platform === 'darwin') {
      spawn('open', [authUrl]);
    } else if (process.platform === 'win32') {
      spawn('start', [authUrl], { shell: true });
    } else {
      spawn('xdg-open', [authUrl]);
    }
  });

  return tokenPromise;
}
```

---

## Lessons for MCP

### 1. Host-Mediated Auth is Best

**Like VS Code extensions**, MCP tools should request auth from Claude Desktop rather than implementing OAuth themselves.

### 2. PKCE is Non-Negotiable

All authorization code flows MUST use PKCE. No exceptions.

### 3. Platform Integration Matters

Use platform-specific secure storage (Keychain, Credential Manager, Secret Service).

### 4. System Browser > Embedded Browser

Always prefer system browser or in-app browser tabs over embedded web views.

### 5. Custom Schemes Need Domain Ownership

Use reverse domain notation: `com.anthropic.claude://` not `claude://`

---

## Failure Modes & Mitigations

| Failure Mode          | Cause                      | Mitigation                                  |
| --------------------- | -------------------------- | ------------------------------------------- |
| Scheme not registered | App not installed properly | Fallback to device flow                     |
| Browser doesn't open  | No default browser         | Show clickable link + manual flow           |
| Loopback blocked      | Firewall/antivirus         | Try multiple ports, fallback to device flow |
| Token expired         | Long-lived token expiry    | Automatic refresh with refresh token        |
| User cancels          | User closes browser        | Clear error message, offer retry            |
| Port conflict         | Another app using port     | Use random ephemeral port                   |

---

## Conclusion

Desktop app OAuth patterns reveal a clear hierarchy:

1. **Best**: System browser + loopback (with PKCE)
2. **Good**: Custom URI schemes (with domain ownership)
3. **Better**: Claimed HTTPS URLs (platform-specific)
4. **Avoid**: Embedded browsers

For MCP, the VS Code extension pattern provides the best analog: **host-mediated authentication** where Claude Desktop handles OAuth complexity and provides clean auth API to MCP tools.

---

## References

1. RFC 8252 - OAuth 2.0 for Native Apps: https://www.rfc-editor.org/rfc/rfc8252
2. VS Code Authentication API: https://code.visualstudio.com/api/references/authentication
3. Chrome Extension OAuth: https://developer.chrome.com/docs/extensions/how-to/integrate/oauth
4. Apple Authentication Services: https://developer.apple.com/documentation/authenticationservices
5. Electron safeStorage: https://www.electronjs.org/docs/latest/api/safe-storage
