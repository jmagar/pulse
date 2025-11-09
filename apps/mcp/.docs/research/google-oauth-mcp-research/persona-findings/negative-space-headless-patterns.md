# OAuth Without Browser Access: Headless and Server Patterns

**Research Date**: 2025-11-06
**Persona**: The Negative Space Explorer
**Focus**: OAuth authentication in environments without browser access

---

## Executive Summary

OAuth was designed for interactive browser-based flows, but many real-world scenarios require authentication without browser access: CI/CD pipelines, headless servers, SSH sessions, containerized environments, and automated scripts. This document explores the underdocumented patterns, challenges, and solutions for "headless OAuth" in MCP server contexts.

---

## Gap #1: Device Authorization Flow Implementation Guidance

### Description of the Gap

OAuth Device Authorization Flow (RFC 8628) is the standard solution for devices without browsers, but documentation for implementing it is sparse:

- How to display user codes effectively
- Polling strategy and timing
- User experience patterns
- Error handling during polling
- Integration with MCP stdio transport
- Testing device flow implementations

**Not documented**:

- Optimal polling intervals
- Timeout handling
- User code display best practices
- Recovery from failed polling
- UX for users unfamiliar with device flow

### Why It's Overlooked

Device flow is less common than redirect-based flows. Most OAuth tutorials focus on web applications, not CLI/headless scenarios.

### Impact Assessment

**Severity**: HIGH (for stdio MCP servers)

**Consequences**:

- Developers default to less secure manual token input
- Poor user experience with device flow
- Incorrect polling implementations (too aggressive → rate limits, too slow → timeouts)
- No standard UX patterns for MCP servers

**Device Flow Stages**:

```
1. Request device code
2. Display user code and verification URL
3. Poll for authorization
4. Exchange device code for tokens
```

Each stage has undocumented pitfalls.

### Questions That Need Answering

1. What's the optimal polling interval? (Google recommends 5 seconds, but what about rate limits?)
2. How long to poll before timing out? (5 minutes? 10 minutes?)
3. Should polling use exponential backoff?
4. How to communicate progress to users?
5. What happens if user enters code incorrectly?
6. Should user code be shown as QR code for mobile?

### Potential Workarounds

**Option A: Standard Device Flow Implementation**

```typescript
import { OAuth2Client } from 'google-auth-library';

async function deviceFlow() {
  const oauth2Client = new OAuth2Client(
    CLIENT_ID,
    CLIENT_SECRET,
    'urn:ietf:wg:oauth:2.0:oob' // Out-of-band
  );

  // 1. Request device code
  const codes = await oauth2Client.generateDeviceCode({
    scopes: ['drive.readonly'],
  });

  // 2. Display to user
  console.log('\n=== Google Authorization Required ===');
  console.log(`Visit: ${codes.verification_url}`);
  console.log(`Enter code: ${codes.user_code}`);
  console.log(`\nWaiting for authorization...`);

  // 3. Poll for authorization
  const tokens = await oauth2Client.getToken({
    code: codes.device_code,
    polling_interval: codes.interval || 5, // Seconds
  });

  return tokens;
}
```

**Option B: Enhanced UX with QR Code**

```typescript
import QRCode from 'qrcode';

async function deviceFlowWithQR() {
  const codes = await oauth2Client.generateDeviceCode({
    scopes: ['drive.readonly'],
  });

  // Generate QR code for mobile scanning
  const qr = await QRCode.toString(codes.verification_url, {
    type: 'terminal',
  });

  console.log('\n=== Google Authorization Required ===');
  console.log('Scan QR code with your phone:');
  console.log(qr);
  console.log(`\nOr visit: ${codes.verification_url}`);
  console.log(`Enter code: ${codes.user_code}`);
  console.log(`\nWaiting for authorization...`);

  const tokens = await pollForToken(codes);
  return tokens;
}
```

**Option C: Interactive Polling with Progress**

```typescript
async function deviceFlowInteractive() {
  const codes = await oauth2Client.generateDeviceCode({
    scopes: ['drive.readonly'],
  });

  console.log('\n=== Google Authorization Required ===');
  console.log(`Visit: ${codes.verification_url}`);
  console.log(`Enter code: ${codes.user_code}`);

  const startTime = Date.now();
  const expiresIn = codes.expires_in * 1000; // Convert to ms
  const interval = codes.interval * 1000;

  while (Date.now() - startTime < expiresIn) {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const remaining = Math.floor((expiresIn - (Date.now() - startTime)) / 1000);

    process.stdout.write(`\rWaiting... ${elapsed}s elapsed, ${remaining}s remaining `);

    try {
      const tokens = await oauth2Client.getToken({
        code: codes.device_code,
      });

      console.log('\n✓ Authorization successful!');
      return tokens;
    } catch (error) {
      if (error.message.includes('authorization_pending')) {
        // Still waiting
        await sleep(interval);
        continue;
      }

      if (error.message.includes('slow_down')) {
        // Increase polling interval
        interval += 1000;
        await sleep(interval);
        continue;
      }

      throw error; // Other error
    }
  }

  throw new Error('Authorization timeout - code expired');
}
```

**Recommendation**: Use **Option C (Interactive Polling)** for best UX. Implement exponential backoff on `slow_down` errors. Default timeout of 5 minutes is reasonable.

---

## Gap #2: Headless SSH Session OAuth

### Description of the Gap

Developers SSH into servers where:

- No GUI browser available
- Display forwarding (X11) not configured
- Terminal-only environment
- Must authenticate for OAuth

**Not documented**:

- Best practices for SSH + OAuth
- How to use device flow in SSH context
- Clipboard integration (copy user code)
- Alternative flows for SSH
- Security considerations

### Why It's Overlooked

SSH scenarios considered edge cases. Documentation assumes GUI access.

### Impact Assessment

**Severity**: MEDIUM

**Common scenario**:

```
Developer SSHs into production server
Needs to run MCP server with Google OAuth
No browser on server
No X11 forwarding configured
Current options:
1. Manually copy-paste tokens (insecure, expires)
2. Exit SSH, auth locally, copy tokens to server (cumbersome)
3. Set up X11 forwarding (complex, often blocked)
```

**Consequences**:

- Poor developer experience
- Workarounds using less secure methods
- Difficulty deploying OAuth-enabled servers
- Reliance on pre-generated tokens

### Questions That Need Answering

1. Is device flow the only option for SSH OAuth?
2. Can OAuth be done on local machine and tokens copied securely?
3. Should SSH environments use service accounts instead?
4. How to handle token refresh in SSH sessions?
5. Is it safe to display OAuth URLs in SSH (terminal history)?

### Potential Workarounds

**Option A: Device Flow in SSH**

```bash
# On SSH server
$ mcp-google-drive --auth

=== Google Authorization Required ===
Visit: https://google.com/device
Enter code: ABCD-EFGH

Waiting for authorization...

# Developer opens URL on their local machine
# Enters code
# Server completes auth

✓ Authorization successful!
Tokens stored securely.
```

**Option B: Local Auth + Secure Copy**

```bash
# On local machine
$ mcp-google-drive --auth --export-token
Authorization successful!
Token exported to: /tmp/token.json

# Securely copy to server
$ scp /tmp/token.json server:/secure/path/
$ rm /tmp/token.json  # Clean up

# On server
$ mcp-google-drive --import-token /secure/path/token.json
Token imported successfully.
```

**Option C: SSH Port Forwarding + Callback Server**

```bash
# Forward local port to server
$ ssh -R 8080:localhost:8080 server

# On server, OAuth callback server listens on localhost:8080
# Redirect URI: http://localhost:8080/callback
# Browser on local machine completes OAuth
# Callback reaches server via SSH tunnel
```

**Option D: SSH Clipboard Integration**

```bash
# Server outputs OAuth URL and code
# If OSC 52 supported, copies to local clipboard
Visit: https://google.com/device
Code: ABCD-EFGH (copied to clipboard)

# Developer's local clipboard automatically has code
# Paste into browser
```

**Recommendation**: **Option A (Device Flow)** is simplest and most secure. Consider **Option D (Clipboard)** for improved UX if terminal supports OSC 52.

---

## Gap #3: Container OAuth Patterns

### Description of the Gap

Containerized MCP servers face unique OAuth challenges:

- No persistent storage by default (tokens lost on restart)
- No GUI browser available
- Ephemeral nature conflicts with long-lived tokens
- Multi-container environments (which container stores tokens?)
- Security concerns (tokens in container images?)

**Not documented**:

- Token storage strategies for containers
- OAuth in Docker Compose environments
- Kubernetes secret management for OAuth
- Container-to-container token sharing
- CI/CD with containerized OAuth

### Why It's Overlooked

Container-specific OAuth patterns not well-established. Documentation focuses on traditional deployments.

### Impact Assessment

**Severity**: HIGH (for containerized deployments)

**Container challenges**:

```
Challenge 1: Ephemeral containers lose tokens on restart
Challenge 2: No browser for interactive OAuth
Challenge 3: Token storage must be external (volume, secret)
Challenge 4: Container images must not contain tokens
Challenge 5: Development vs production auth differs
```

**Consequences**:

- Difficult to deploy MCP servers in containers
- Tokens lost frequently
- Manual re-authentication required
- Poor DevOps experience
- Security vulnerabilities

### Questions That Need Answering

1. Where should containerized services store OAuth tokens?
2. How to handle initial OAuth in containers?
3. Should containers use service accounts instead of OAuth?
4. How to share tokens across multiple containers?
5. How to handle token refresh in stateless containers?

### Potential Workarounds

**Option A: Environment Variable Tokens**

```dockerfile
# Dockerfile
FROM node:20-slim
WORKDIR /app
COPY . .
RUN npm install
CMD ["node", "server.js"]

# Docker Compose
services:
  mcp-server:
    build: .
    environment:
      GOOGLE_REFRESH_TOKEN: ${GOOGLE_REFRESH_TOKEN}  # From .env
    volumes:
      - ./tokens:/app/tokens  # Persistent token storage
```

**Option B: Mounted Secrets**

```yaml
# docker-compose.yml
services:
  mcp-server:
    build: .
    secrets:
      - google_oauth_token
    environment:
      GOOGLE_TOKEN_FILE: /run/secrets/google_oauth_token

secrets:
  google_oauth_token:
    file: ./secrets/google_oauth_token.json
```

**Option C: External Token Service**

```typescript
// Container fetches tokens from external service
const tokenService = new TokenService({
  endpoint: process.env.TOKEN_SERVICE_URL,
  apiKey: process.env.TOKEN_SERVICE_KEY,
});

const token = await tokenService.getToken('google');
```

**Option D: Init Container Pattern (Kubernetes)**

```yaml
# Init container runs device flow on first start
apiVersion: v1
kind: Pod
spec:
  initContainers:
    - name: oauth-init
      image: oauth-init:latest
      volumeMounts:
        - name: tokens
          mountPath: /tokens
  containers:
    - name: mcp-server
      image: mcp-server:latest
      volumeMounts:
        - name: tokens
          mountPath: /app/tokens
  volumes:
    - name: tokens
      persistentVolumeClaim:
        claimName: oauth-tokens
```

**Recommendation**:

- **Development**: Use environment variables (Option A)
- **Production**: Use mounted secrets (Option B) or external token service (Option C)
- **Kubernetes**: Use init container pattern (Option D) for initial auth

---

## Gap #4: CI/CD Pipeline OAuth

### Description of the Gap

Automated CI/CD pipelines need OAuth for testing but face challenges:

- No interactive user for OAuth flow
- Short-lived pipeline execution
- Security concerns storing tokens in CI
- Rate limiting from OAuth provider
- Token expiration during long builds

**Not documented**:

- Best practices for OAuth in CI
- Service account vs user OAuth for CI
- Token rotation strategies
- Secure token storage in CI systems
- Testing OAuth without real credentials

### Why It's Overlooked

CI/CD OAuth is considered advanced topic. Tutorials focus on local development.

### Impact Assessment

**Severity**: MEDIUM-HIGH

**CI/CD scenarios**:

```
Scenario A: Integration tests need real Google API access
Scenario B: Build process fetches resources from Google Drive
Scenario C: Deployment script updates Google Cloud resources
Scenario D: Automated testing of OAuth flows themselves
```

**Consequences**:

- Integration tests skipped in CI (can't auth)
- Manual intervention required during CI
- Insecure token storage in CI configs
- CI failures from token expiration
- Slow builds from repeated auth

### Questions That Need Answering

1. Should CI use OAuth or service accounts?
2. How to securely store refresh tokens in CI?
3. How to handle token expiration during long builds?
4. Should each CI job authenticate independently?
5. How to test OAuth flows in CI without real credentials?

### Potential Workarounds

**Option A: Long-Lived Refresh Token in Secrets**

```yaml
# GitHub Actions
name: Integration Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Run OAuth Integration Tests
        env:
          GOOGLE_REFRESH_TOKEN: ${{ secrets.GOOGLE_REFRESH_TOKEN }}
          GOOGLE_CLIENT_ID: ${{ secrets.GOOGLE_CLIENT_ID }}
          GOOGLE_CLIENT_SECRET: ${{ secrets.GOOGLE_CLIENT_SECRET }}
        run: npm run test:integration
```

**Pros**: Simple, works with OAuth
**Cons**: Token eventually expires, security risk if leaked

**Option B: Service Account (Non-OAuth)**

```yaml
# GitHub Actions with service account
- name: Run Tests with Service Account
  env:
    GOOGLE_APPLICATION_CREDENTIALS: ${{ secrets.GCP_SERVICE_ACCOUNT_KEY }}
  run: |
    echo '${{ secrets.GCP_SERVICE_ACCOUNT_KEY }}' > /tmp/sa-key.json
    export GOOGLE_APPLICATION_CREDENTIALS=/tmp/sa-key.json
    npm run test:integration
    rm /tmp/sa-key.json
```

**Pros**: Long-lived, designed for automation
**Cons**: Different auth mechanism than production OAuth

**Option C: Mock OAuth in CI**

```yaml
# Unit tests with mocked OAuth
- name: Run Unit Tests
  run: npm run test:unit # Uses mocked OAuth

# Integration tests only on main branch
- name: Run Integration Tests
  if: github.ref == 'refs/heads/main'
  env:
    GOOGLE_REFRESH_TOKEN: ${{ secrets.GOOGLE_REFRESH_TOKEN }}
  run: npm run test:integration
```

**Pros**: Fast unit tests, real integration tests on main
**Cons**: Limited integration testing on PRs

**Option D: Temporary Token Generation**

```yaml
# Generate short-lived token for CI job
- name: Generate OAuth Token
  id: oauth
  run: |
    # Use service account to generate short-lived OAuth token
    TOKEN=$(gcloud auth print-access-token)
    echo "::set-output name=token::$TOKEN"

- name: Run Tests
  env:
    GOOGLE_ACCESS_TOKEN: ${{ steps.oauth.outputs.token }}
  run: npm run test:integration
```

**Pros**: Short-lived tokens, secure
**Cons**: Requires GCP setup, complex

**Recommendation**:

- **Unit/functional tests**: Mock OAuth (Option C)
- **Integration tests**: Use refresh token in secrets (Option A)
- **Production CI**: Consider service accounts (Option B) if Google supports for your use case
- **Security-critical**: Generate temporary tokens (Option D)

---

## Gap #5: Automated Script OAuth

### Description of the Gap

Background scripts, cron jobs, and automated tasks need OAuth but run unattended:

- No user to complete interactive OAuth
- Run on schedule (may start when user away)
- Long-running (refresh tokens may expire)
- Multiple concurrent instances (token conflicts)

**Not documented**:

- Pre-authentication strategies
- Token management for scheduled tasks
- Error handling when auth fails unattended
- Notification patterns for auth issues
- Graceful degradation

### Why It's Overlooked

Automation scenarios assumed to use service accounts, not OAuth. OAuth designed for interactive users.

### Impact Assessment

**Severity**: MEDIUM

**Use cases**:

```
Use Case A: Nightly backup script fetches Google Drive files
Use Case B: Hourly sync updates local database from Gmail
Use Case C: Weekly report generator pulls Google Analytics
Use Case D: Real-time webhook processor needs OAuth for API calls
```

**Consequences**:

- Scripts fail when tokens expire (middle of night)
- No user available to re-authenticate
- Manual intervention required
- Missed backups, stale data, failed reports

### Questions That Need Answering

1. How to ensure tokens are valid before automated scripts run?
2. How to alert users when re-authentication needed?
3. Should automated scripts use OAuth or service accounts?
4. How to handle token refresh during script execution?
5. What's the fallback when OAuth unavailable?

### Potential Workarounds

**Option A: Pre-Flight Token Check**

```bash
#!/bin/bash
# Automated script with token validation

# Check if token is valid and not expiring soon
if ! mcp-oauth check-token --expires-in 3600; then
  echo "OAuth token invalid or expiring soon"
  # Send notification
  send-notification "OAuth re-authentication required for backup script"
  exit 1
fi

# Run script
mcp-google-drive backup /data
```

**Option B: Token Health Monitoring**

```typescript
// Separate monitoring process
async function monitorTokenHealth() {
  setInterval(
    async () => {
      const token = await getStoredToken();
      const expiresIn = token.expiresAt - Date.now();

      if (expiresIn < 7 * 24 * 60 * 60 * 1000) {
        // 7 days
        await sendAlert({
          title: 'OAuth Token Expiring Soon',
          message: `Token expires in ${Math.floor(expiresIn / 86400000)} days. Please re-authenticate.`,
          urgency: 'high',
        });
      }
    },
    60 * 60 * 1000
  ); // Check hourly
}
```

**Option C: Fallback to Cached Data**

```typescript
async function automatedBackup() {
  try {
    const files = await fetchGoogleDriveFiles();
    await backupFiles(files);
  } catch (error) {
    if (error.code === 'OAUTH_REQUIRED') {
      console.warn('OAuth failed, using cached data');
      const cachedFiles = await getCachedFiles();
      await backupFiles(cachedFiles);

      // Alert user
      await sendAlert('OAuth re-authentication needed for live backups');
    } else {
      throw error;
    }
  }
}
```

**Option D: Service Account Hybrid**

```typescript
// Use OAuth for user-specific data
// Use service account for shared data
async function fetchData() {
  try {
    return await fetchWithOAuth();
  } catch (error) {
    if (error.code === 'OAUTH_REQUIRED') {
      console.warn('OAuth unavailable, falling back to service account');
      return await fetchWithServiceAccount();
    }
    throw error;
  }
}
```

**Recommendation**:

- **Monitor token expiration** proactively (Option B)
- **Validate tokens before critical operations** (Option A)
- **Implement graceful fallback** for when OAuth unavailable (Option C)
- **Consider hybrid approach** with service accounts as fallback (Option D)

---

## Gap #6: Remote Desktop / VNC OAuth

### Description of the Gap

Users accessing remote desktops (VNC, RDP, cloud workstations) face OAuth challenges:

- Browser on remote machine
- Clipboard limitations
- Network latency
- Session disconnection during OAuth
- Firewall blocking OAuth redirect URIs

**Not documented**:

- Best practices for OAuth in remote desktop
- Clipboard integration strategies
- Handling session disconnects during OAuth
- Network troubleshooting

### Why It's Overlooked

Remote desktop scenarios considered edge cases. OAuth assumed to be local.

### Impact Assessment

**Severity**: LOW-MEDIUM

**Remote desktop issues**:

```
Issue 1: OAuth opens browser on remote machine (not local)
Issue 2: Copy-paste between machines may not work
Issue 3: Network latency makes OAuth slow
Issue 4: Session disconnect during OAuth loses state
Issue 5: Firewall may block OAuth redirect
```

**Consequences**:

- Confusing user experience
- Failed OAuth attempts
- Difficulty accessing cloud-based tools
- Workarounds using less secure methods

### Questions That Need Answering

1. Should OAuth be completed on remote or local machine?
2. How to handle clipboard between machines?
3. What happens if session disconnects during OAuth?
4. How to troubleshoot OAuth in remote desktop?
5. Are there security implications of OAuth over remote desktop?

### Potential Workarounds

**Option A: Device Flow (No Browser Required)**

```
Use device authorization flow:
1. MCP server on remote machine shows code
2. User copies code (via clipboard or manually)
3. User opens browser on LOCAL machine
4. User enters code
5. Remote machine completes auth
```

**Pros**: Works regardless of browser location
**Cons**: Requires code entry (friction)

**Option B: Local OAuth + Token Transfer**

```
1. Complete OAuth on local machine
2. Export token
3. Transfer to remote machine (SCP, clipboard, file share)
4. Import token on remote machine
```

**Pros**: Familiar OAuth flow
**Cons**: Manual token transfer

**Option C: SSH Tunnel + Callback**

```
1. SSH tunnel from local to remote with port forwarding
2. OAuth callback server on remote listens on tunneled port
3. Browser on local machine completes OAuth
4. Callback reaches remote via tunnel
```

**Pros**: Standard OAuth flow works
**Cons**: Requires SSH tunnel setup

**Recommendation**: Use **device authorization flow (Option A)** as default. It's most reliable across different remote desktop scenarios.

---

## Gap #7: Lambda / Serverless OAuth

### Description of the Gap

Serverless functions (AWS Lambda, Cloud Functions, etc.) need OAuth but face challenges:

- Stateless execution (no persistent token storage)
- Cold starts (auth latency)
- Short execution time (OAuth flow may timeout)
- No interactive user
- Function-to-function token sharing

**Not documented**:

- Token storage patterns for serverless
- Cold start optimization
- Pre-authenticated function deployment
- Token sharing across functions
- Error recovery in serverless context

### Why It's Overlooked

Serverless OAuth is complex. Most examples use API keys or service accounts.

### Impact Assessment

**Severity**: MEDIUM

**Serverless challenges**:

```
Challenge 1: Where to store tokens? (no local filesystem)
Challenge 2: How to authenticate initially? (no interactive user)
Challenge 3: How to handle cold starts? (fetch token on each invocation?)
Challenge 4: How to share tokens? (multiple functions need same credentials)
Challenge 5: How to refresh tokens? (stateless, can't track expiration)
```

**Consequences**:

- Difficult to use OAuth in serverless
- High latency from repeated auth
- Race conditions with token refresh
- Developer frustration

### Questions That Need Answering

1. Where should serverless functions store OAuth tokens?
2. Should tokens be loaded on cold start or lazily?
3. How to minimize OAuth-related latency?
4. How to handle token refresh in stateless functions?
5. Can multiple function instances share tokens safely?

### Potential Workarounds

**Option A: External Token Store**

```typescript
// AWS Lambda with DynamoDB token storage
import { DynamoDB } from 'aws-sdk';

const dynamodb = new DynamoDB.DocumentClient();

export async function handler(event) {
  // Fetch token from DynamoDB
  const result = await dynamodb
    .get({
      TableName: 'oauth-tokens',
      Key: { service: 'google' },
    })
    .promise();

  const token = result.Item.token;

  // Use token for API call
  const data = await fetchGoogleAPI(token);

  return { statusCode: 200, body: JSON.stringify(data) };
}
```

**Option B: Environment Variable Tokens**

```typescript
// Cloud Function with env var token
export async function handler(event) {
  // Token injected at deploy time
  const token = process.env.GOOGLE_REFRESH_TOKEN;

  // Refresh if needed
  const validToken = await ensureValidToken(token);

  const data = await fetchGoogleAPI(validToken);

  return { statusCode: 200, body: JSON.stringify(data) };
}
```

**Option C: Token Caching Layer**

```typescript
// Shared token cache across function invocations
import { Redis } from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

export async function handler(event) {
  // Check cache first
  let token = await redis.get('google:access_token');

  if (!token) {
    // Fetch and cache token
    token = await fetchAndCacheToken();
  }

  const data = await fetchGoogleAPI(token);

  return { statusCode: 200, body: JSON.stringify(data) };
}

async function fetchAndCacheToken() {
  const token = await refreshToken();

  // Cache with TTL
  await redis.setex('google:access_token', 3600, token.access_token);

  return token.access_token;
}
```

**Option D: Lambda Layer with Token Management**

```typescript
// Reusable Lambda layer for OAuth
import { OAuthManager } from '/opt/nodejs/oauth-manager';

const oauthManager = new OAuthManager({
  storage: 'dynamodb',
  tableName: 'oauth-tokens',
});

export async function handler(event) {
  const token = await oauthManager.getValidToken('google');
  const data = await fetchGoogleAPI(token);
  return { statusCode: 200, body: JSON.stringify(data) };
}
```

**Recommendation**:

- **Token storage**: Use external store (DynamoDB, Redis) not environment variables
- **Caching**: Implement caching layer (Option C) to minimize token fetches
- **Refresh**: Handle token refresh within function (with cache update)
- **Shared logic**: Use Lambda layers (Option D) for reusable OAuth management

---

## Recommendations for Pulse Fetch Headless OAuth

### Immediate Priorities

1. **Implement device authorization flow** as primary headless pattern
2. **Support environment variable tokens** as fallback for containers/CI
3. **Add OAuth health check** command for pre-flight validation
4. **Document headless scenarios** with concrete examples
5. **Test in SSH, container, and CI environments**

### Best Practices to Document

1. **Device flow is preferred** for stdio MCP servers (no callback server needed)
2. **Environment variables** work for containers but require manual refresh management
3. **Mounted secrets** are best for production containers
4. **Service accounts** may be better than OAuth for fully automated scenarios
5. **Token health monitoring** critical for unattended systems

### Architecture Decisions

```typescript
// Support multiple auth modes
const authMode = process.env.OAUTH_MODE || 'device'; // 'device', 'env', 'file'

switch (authMode) {
  case 'device':
    await deviceAuthFlow(); // Interactive, headless-friendly
    break;

  case 'env':
    token = process.env.GOOGLE_REFRESH_TOKEN; // Container/CI
    break;

  case 'file':
    token = await readTokenFile(process.env.TOKEN_FILE); // Mounted secrets
    break;
}
```

### Testing Strategy

- **Local dev**: Device flow (best UX)
- **CI unit tests**: Mocked OAuth
- **CI integration tests**: Refresh token in secrets
- **Container dev**: Environment variable
- **Container prod**: Mounted secret or external token service

---

## Research Priorities

1. **HIGH**: Implement and test device authorization flow
2. **HIGH**: Document headless patterns for each environment type
3. **MEDIUM**: Create container deployment examples
4. **MEDIUM**: Build CI/CD integration examples
5. **LOW**: Investigate serverless OAuth patterns

---

## Key Insights

The "negative space" around headless OAuth reveals:

1. **Device flow is underutilized**: It's the best solution for many headless scenarios but rarely documented well
2. **No one-size-fits-all**: Different environments need different approaches
3. **Token storage is the real challenge**: Not the OAuth flow itself
4. **Monitoring is critical**: Headless systems need proactive token health checks
5. **Documentation gap is huge**: Most OAuth docs assume GUI, ignoring headless reality

For Pulse Fetch, **device authorization flow** should be the primary OAuth mechanism, with clear fallback patterns for containers, CI, and automation scenarios.
