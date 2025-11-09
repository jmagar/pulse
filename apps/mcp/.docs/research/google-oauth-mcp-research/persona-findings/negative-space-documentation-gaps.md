# MCP Authentication Documentation Gaps

**Research Date**: 2025-11-06
**Persona**: The Negative Space Explorer
**Focus**: What's NOT documented in MCP authentication patterns

---

## Executive Summary

The Model Context Protocol (MCP) specification focuses heavily on the transport and tool-calling mechanics, but leaves authentication as an implementation detail. This creates significant gaps for developers implementing OAuth-based MCP servers, particularly around multi-user scenarios, token lifecycle management, and error recovery patterns.

---

## Gap #1: MCP Specification Has No Authentication Guidance

### Description of the Gap

The MCP specification defines how servers and clients communicate (stdio, SSE, HTTP) but provides **zero** guidance on:

- How authentication should be handled at the protocol level
- Whether auth is transport-layer or application-layer concern
- Standard patterns for credential exchange
- How to signal authentication requirements to clients

### Why It's Overlooked

MCP is designed to be transport-agnostic and flexible. The authors likely intentionally avoided prescribing authentication mechanisms to allow for diverse use cases (local stdio servers need no auth, remote HTTP servers do).

### Impact Assessment

**Severity**: HIGH

Every MCP server developer implementing authenticated resources must:

- Invent their own authentication flow
- Decide when/where to check credentials
- Handle auth errors without standard error codes
- Build client-side credential management from scratch

This leads to:

- Fragmented, incompatible authentication implementations
- Poor user experience (every server does it differently)
- Security vulnerabilities from developers getting it wrong
- No standard way for MCP clients to discover auth requirements

### Questions That Need Answering

1. Should MCP add an optional authentication capability negotiation?
2. Could MCP define standard error codes for auth failures (401, 403 equivalents)?
3. Should MCP servers be able to advertise their auth requirements in server info?
4. How should OAuth redirect URIs work with stdio transport servers?
5. Should MCP define a standard "credential provider" interface?

### Potential Workarounds

**Current State**: Each server implements custom authentication

**Possible Patterns**:

1. **Environment Variable Pattern**: Server expects `GOOGLE_OAUTH_TOKEN` in environment (like current Pulse Fetch approach)
2. **Interactive Flow Pattern**: Server prompts for credentials on first tool call, stores in system keychain
3. **Config File Pattern**: Server reads credentials from `~/.config/mcp-server/credentials.json`
4. **Proxy Pattern**: All MCP servers authenticate through a shared auth proxy service

**Recommendation**: MCP should define:

- Optional `authentication_required` field in server info response
- Standard auth error codes in tool call responses
- Suggested patterns for stdio vs HTTP transport auth

---

## Gap #2: OAuth Flow Integration with Stdio Transport

### Description of the Gap

MCP servers using stdio transport (Claude Desktop's primary mode) face a fundamental challenge: **OAuth requires a browser redirect, but stdio servers have no web server to receive callbacks**.

The documentation doesn't address:

- How to run a temporary OAuth callback server alongside stdio
- Port management when multiple MCP servers need OAuth
- User experience patterns for browser-based auth in terminal contexts
- Security implications of localhost callback servers

### Why It's Overlooked

Most MCP examples are simple read-only tools that don't need authentication. The complexity of OAuth in stdio transport is a "real world" problem that documentation glosses over.

### Impact Assessment

**Severity**: HIGH

Developers hit this wall immediately when trying to build Google Drive, Gmail, or Calendar MCP servers. Solutions include:

- Out-of-band authentication (manual token paste)
- Device authorization flow (shows code on screen)
- Running a persistent callback server (defeats stdio simplicity)
- Pre-authenticated token files (security risk)

None of these are documented as recommended patterns.

### Questions That Need Answering

1. Can stdio MCP servers spawn ephemeral HTTP servers for OAuth callbacks?
2. How should port allocation work to avoid conflicts between MCP servers?
3. Should MCP clients (like Claude Desktop) provide OAuth proxy services?
4. Is device authorization flow the "right" answer for stdio transport?
5. How do users understand what's happening when their terminal app opens a browser?

### Potential Workarounds

**Option A: Device Authorization Flow**

```typescript
// Server displays code to user
console.error('Visit: https://accounts.google.com/device');
console.error('Enter code: ABCD-EFGH');
// Server polls for authorization
```

**Pros**: No callback server needed
**Cons**: Clunky UX, not supported by all OAuth providers

**Option B: Ephemeral Callback Server**

```typescript
const server = http.createServer(handleOAuthCallback);
server.listen(0); // Random port
const port = server.address().port;
// Use http://localhost:{port}/callback as redirect URI
```

**Pros**: Standard OAuth flow
**Cons**: Port conflicts, firewall issues, security concerns

**Option C: Manual Token Injection**

```typescript
// Server prompts: "Paste your access token:"
const token = await readFromStdin();
```

**Pros**: Simple, no server needed
**Cons**: Terrible UX, exposes tokens, no refresh flow

**Recommendation**: MCP should document **device authorization flow** as the preferred pattern for stdio transport OAuth, with examples.

---

## Gap #3: Token Storage Security Patterns

### Description of the Gap

Documentation rarely addresses **where and how to securely store OAuth tokens** in MCP servers:

- Filesystem storage (plaintext JSON files) is insecure
- System keychains (macOS Keychain, Windows Credential Manager) are OS-specific
- Environment variables expose tokens in process listings
- In-memory storage loses tokens on server restart

No standard pattern exists for:

- Encrypting tokens at rest
- Rotating encryption keys
- Handling keychain access failures
- Cross-platform credential storage

### Why It's Overlooked

It's a "plumbing" concern that developers solve differently based on their OS and security requirements. Most examples use simple JSON files because they're easy to demonstrate.

### Impact Assessmentpulse-crawl

pulse-crawl
**Severity**: MEDIUM-HIGH

**Security Risks**:

- Tokens stored in plaintext can be stolen from filesystem
- Tokens in environment variables visible via `ps` or process inspection
- Shared servers (multi-user systems) can leak tokens between users

**Operational Risks**:

- Hard-coded storage pathpulse-crawlon-standard systems
- Keychain integration breaks in containerized environments
- Token loss on server restart requires re-authentication

### Questions That Need Answering

1. Should MCP servers use OS keychains or encrypted files?
2. How do containerized MCP servers (Docker) handle keychain access?
3. What's the encryption key management strategy for token storage?
4. How do headless servers (SSH sessions) access GUI keychains?
5. Should tokens be stored per-server or in a shared credential vault?

### Potential Workarounds

**Option A: OS Keychain via `keytar`**

```typescript
import keytar from 'keytar';

await keytar.setPassword('mcp-pulse-fetch', 'google-oauth', token);
const token = await keytar.getPassword('mcp-pulse-fetch', 'google-oauth');
```

**Pros**: Secure, OS-integrated, user-scoped
**Cons**: Requires native compilation, breaks in Docker, headless issues

**Option B: Encrypted File Storage**

```typescript
import { encrypt, decrypt } from 'crypto';

const key = deriveKeyFromMachineId(); // Machine-specific key
const encrypted = encrypt(token, key);
fs.writeFileSync('~/.mcp-pulse-fetch/tokens.enc', encrypted);
```

**Pros**: Works everywhere, no native deps
**Cons**: Key management complexity, machine-bound tokens

**Option C: Environment Variables (Current Pulse Fetch Approach)**

```typescript
const token = process.env.GOOGLE_OAUTH_TOKEN;
```

**Pros**: Simple, container-friendly, no storage needed
**Cons**: Visible in process list, lost on restart, manual refresh

**Recommendation**: Document all three approaches with tradeoffs:

- Keychain for desktop/local development
- Encrypted files for servers without keychain
- Environment variables for containers/short-lived servers

---

## Gap #4: Multi-User MCP Server Patterns

### Description of the Gap

Most MCP documentation assumes **single-user servers** where one set of credentials serves all requests. Real-world scenarios require:

- Multiple users with separate OAuth tokens
- Per-user rate limiting and quota management
- User-scoped resource access (user A can't see user B's files)
- Token isolation (server compromise doesn't leak all tokens)

**Not documented**:

- How to identify which user is making an MCP request
- Session management in stateless protocols
- Token-to-user mapping strategies
- Multi-tenancy error handling

### Why It's Overlooked

MCP servers are often conceived as personal tools (Claude Desktop integration) rather than shared services. The stdio transport model reinforces single-user thinking.

### Impact Assessment

**Severity**: MEDIUM (but CRITICAL for production/team deployments)

**Single-user assumptions break down when**:

- Teams want a shared MCP server for Google Workspace access
- Organizations need centralized credential management
- Compliance requires audit logs per user
- Rate limits need to be distributed across users

**Consequences of missing patterns**:

- Developers build custom session management (error-prone)
- Shared tokens violate OAuth terms of service
- No standard way to map MCP requests to OAuth tokens
- Security vulnerabilities from mixing user contexts

### Questions That Need Answering

1. How does an MCP client identify itself to a multi-user server?
2. Should MCP add a `user_id` or `session_id` to request metadata?
3. How do HTTP-based MCP servers handle authentication headers?
4. Can stdio transport support multi-user scenarios at all?
5. Should each user run their own MCP server instance?

### Potential Workarounds

**Option A: Session Headers (HTTP Transport)**

```typescript
// Client sends Authorization header
headers: {
  Authorization: `Bearer ${user_token}`;
}

// Server maps token to user
const user = await getUserFromToken(req.headers.authorization);
```

**Pros**: Standard HTTP auth pattern
**Cons**: Only works for HTTP transport, not stdio

**Option B: Per-User Server Instances**

```typescript
// User A runs: mcp-server --user=alice --port=5001
// User B runs: mcp-server --user=bob --port=5002
```

**Pros**: Complete isolation, simple
**Cons**: Resource overhead, port management nightmare

**Option C: Token-in-Environment with User Context**

```typescript
// Each user sets their own token
USER_ID=alice GOOGLE_OAUTH_TOKEN=abc123 mcp-server
USER_ID=bob GOOGLE_OAUTH_TOKEN=xyz789 mcp-server
```

**Pros**: Works with stdio, simple
**Cons**: Still requires separate processes

**Recommendation**: MCP should clarify that **stdio transport is single-user by design** and document HTTP transport patterns for multi-user scenarios with authentication headers.

---

## Gap #5: Token Refresh Flow Error Handling

### Description of the Gap

OAuth refresh tokens can fail for many reasons, but documentation rarely covers the **error recovery paths**:

- Refresh token expired (user must re-authenticate)
- Refresh token revoked (user revoked access)
- Network failure during refresh (retry logic needed)
- Rate limiting on refresh endpoint (backoff required)
- Scope changes requiring new consent (re-authorization)

**Not documented**:

- How to detect which specific error occurred
- User notification patterns for re-authentication needs
- Graceful degradation strategies
- Refresh failure impact on in-flight requests

### Why It's Overlookedpulse-crawl

Happy-path documentation shows successful refresh flows. Edge cases are left to developers to discover through trial and error.

### Impact Assessment

**Severity**: MEDIUM-HIGH

**User Experience Impact**:

- Cryptic errors like "Authentication failed" without actionable steps
- Tools suddenly stop working with no explanation
- Users don't know they need to re-authenticate

**Operational Impact**:

- Servers crash or hang on refresh failures
- Retry storms when multiple operations fail simultaneously
- No telemetry on why authentication is failing

### Questions That Need Answering

1. What OAuth error codes map to "user must re-authenticate"?
2. How should MCP servers signal re-authentication needs to users?
3. Should refresh failures queue requests or fail immediately?
4. What's the appropriate retry logic for network failures?
5. How do you distinguish between temporary and permanent refresh failures?

### Potential Workarounds

**Option A: Error Code Mapping**

```typescript
try {
  await refreshToken();
} catch (error) {
  if (error.code === 'invalid_grant') {
    // Refresh token invalid - user must re-auth
    return { error: 'Please re-authenticate: run mcp-server --reauth' };
  } else if (error.code === 'rate_limit_exceeded') {
    // Retry with backoff
    await sleep(60000);
    return retry();
  }
}
```

**Option B: Graceful Degradation**

```typescript
// Serve cached data when refresh fails
if (!(await refreshToken())) {
  return {
    content: getCachedData(),
    warning: 'Using cached data - authentication refresh failed',
  };
}
```

**Option C: User Notification via stderr**

```typescript
// For stdio servers, write to stderr
console.error('[AUTH ERROR] Your Google OAuth token has expired.');
console.error('Run: mcp-pulse-fetch --reauth');
```

**Recommendation**: Document standard error handling patterns:

- Map OAuth error codes to user-facing messages
- Implement exponential backoff for transient failures
- Provide clear re-authentication instructions
- Use stderr for user notifications in stdio transport

---

## Research Priorities

Based on gap severity and impact:

1. **HIGH PRIORITY**: Document OAuth integration patterns for stdio transport (device flow vs callback server)
2. **HIGH PRIORITY**: Create cross-platform token storage examples (keychain + encrypted files + env vars)
3. **MEDIUM PRIORITY**: Define multi-user server patterns and clarify stdio limitations
4. **MEDIUM PRIORITY**: Document refresh token error handling and recovery flows
5. **LOW PRIORITY**: Propose MCP spec additions for auth capability negotiation

---

## Recommendations for Pulse Fetch Implementation

Given these gaps, the Pulse Fetch Google OAuth integration should:

1. **Token Storage**: Support all three patterns (keychain, encrypted file, env var) with clear documentation on tradeoffs
2. **OAuth Flow**: Implement device authorization flow as primary pattern for stdio transport
3. **Error Handling**: Map all OAuth error codes to actionable user messages
4. **Multi-User**: Document as explicitly single-user, recommend per-user instances for team scenarios
5. **Refresh Logic**: Implement robust retry with backoff and clear re-auth instructions on permanent failures

---

## Additional Research Needed

- Survey existing MCP servers with OAuth to document de facto patterns
- Test device authorization flow UX with real users
- Benchmark token refresh performance under load
- Evaluate security of different token storage mechanisms
- Investigate MCP client (Claude Desktop) capabilities for auth proxying
