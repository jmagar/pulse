# Contrarian Research: Simpler Alternatives to OAuth 2.0

**Persona**: The Contrarian
**Date**: 2025-11-06
**Focus**: Simpler authentication methods, when OAuth is overkill, pragmatic alternatives

## Executive Summary

OAuth 2.0 is complex, error-prone, and unnecessary for most applications. This document catalogs simpler authentication methods that are more appropriate for common use cases, including MCP servers accessing Google APIs.

## The Core Question: Do You Really Need OAuth?

### When OAuth Is Actually Required

OAuth 2.0 is necessary when:

1. **Third-party delegation**: Your application enables users to grant third-party apps access to their resources
2. **Platform building**: You're building a platform where external developers need user-authorized access
3. **Fine-grained scopes**: You need granular permission control for different operations

### When OAuth Is Overkill (Most Cases)

OAuth 2.0 is unnecessary when:

1. **First-party access**: Your application accesses your own APIs or user resources
2. **Machine-to-machine**: No user context involved
3. **Simple authentication**: You just need to verify identity
4. **Public APIs**: No user-specific data
5. **Single application**: No third-party access needed

**Expert Quote**: "You probably don't need OAuth2, nor OpenID Connect - in fact, you most likely don't need them." (Ory.sh)

## Alternative 1: API Keys

### What They Are

Simple string tokens that identify the calling application and authorize access.

### When to Use API Keys

- **Public APIs** without user-specific data
- **Machine-to-machine** communication
- **Simple authentication** requirements
- **Rate limiting** and usage tracking
- **Developer-focused APIs** (not end-user authentication)

### Implementation Complexity

**Time**: 1-2 days
**Code**: ~50-100 lines
**Maintenance**: Minimal

### Security Comparison to OAuth

| Feature                       | API Keys          | OAuth 2.0                    |
| ----------------------------- | ----------------- | ---------------------------- |
| **Implementation complexity** | Very low          | Very high                    |
| **Ways to misconfigure**      | Few               | Many                         |
| **Token theft impact**        | Single API access | Full account access          |
| **Rotation complexity**       | Simple            | Complex (refresh tokens)     |
| **Revocation**                | Instant           | Requires token introspection |
| **Storage requirements**      | Simple string     | Multiple tokens + expiry     |

### Google API Key Example

```typescript
// Simple Google API access with API key
const response = await fetch(
  `https://maps.googleapis.com/maps/api/geocode/json?address=${address}&key=${API_KEY}`
);
```

**No OAuth needed for**:

- Google Maps API (public data)
- Google Custom Search API
- Google Translation API (public endpoints)
- YouTube Data API (public videos)

### API Key Best Practices

1. **Environment variables**: Never hardcode keys
2. **HTTPS only**: Always encrypt in transit
3. **Rotation policy**: Regular key rotation schedule
4. **Rate limiting**: Implement on server side
5. **Scope to IP ranges**: When possible, restrict by origin
6. **Separate keys per environment**: Dev, staging, production

### When API Keys Are Superior to OAuth

**Use Case**: MCP server needs to access Google Custom Search API

**With OAuth 2.0**:

- Implement authorization code flow
- Handle redirect URIs (difficult for CLI tools)
- Manage token refresh
- Store refresh tokens securely
- Handle token expiration during tool calls
- Debug rate limiting issues
- **Time**: 2-4 weeks

**With API Key**:

- Get API key from Google Cloud Console
- Store in environment variable
- Pass in API requests
- **Time**: 1 hour

**Security**: API key restricts access to specific APIs only. OAuth token could grant broader access if misconfigured.

## Alternative 2: Service Accounts

### What They Are

Non-human identity credentials for machine-to-machine communication, often using public/private key pairs.

### When to Use Service Accounts

- **Server-to-server** communication
- **No user context** required
- **Automated processes** (cron jobs, batch processing)
- **Backend integrations**
- **Cloud service access**

### Google Service Accounts

**Perfect for**:

- BigQuery access
- Cloud Storage operations
- Google Sheets/Docs management (domain-wide)
- Firebase Admin SDK
- Google Analytics reporting

### Implementation Complexity

**Time**: 2-3 days
**Code**: ~100-200 lines
**Maintenance**: Low

### Service Account Example (Google APIs)

```typescript
import { google } from 'googleapis';

// Load service account credentials
const auth = new google.auth.GoogleAuth({
  keyFile: 'service-account-key.json',
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});

const sheets = google.sheets({ version: 'v4', auth });

// No OAuth flow needed!
const response = await sheets.spreadsheets.values.get({
  spreadsheetId: 'SHEET_ID',
  range: 'Sheet1!A1:B10',
});
```

### Service Account vs OAuth Comparison

| Feature              | Service Accounts    | OAuth 2.0               |
| -------------------- | ------------------- | ----------------------- |
| **User context**     | No                  | Yes                     |
| **User consent**     | Not required        | Required                |
| **Setup complexity** | Medium              | High                    |
| **Token refresh**    | Automatic (JWT)     | Manual (refresh tokens) |
| **Delegation**       | Service-to-service  | User-to-application     |
| **Rate limiting**    | Per service account | Per user                |

### MCP Server Service Account Use Case

**Scenario**: MCP server needs to read Google Sheets for data analysis

**Why Service Accounts Win**:

1. **No user in the loop**: MCP tool runs on behalf of developer, not end user
2. **Deterministic**: No token expiration surprises
3. **No redirect URI**: No need for local web server or device flow
4. **Simple storage**: Single JSON keyfile
5. **Works in stdio**: No HTTP requirements

**Setup**:

1. Create service account in Google Cloud Console
2. Download JSON key file
3. Share Google Sheet with service account email
4. Use googleapis library with keyFile path

**Time**: 30 minutes

## Alternative 3: Basic Authentication over HTTPS

### What It Is

HTTP Basic Authentication with username/password encoded in Authorization header, always over HTTPS.

### When to Use Basic Auth

- **Internal APIs** not exposed to public internet
- **Simple services** with minimal security requirements
- **Development/staging** environments
- **Admin endpoints** with additional IP restrictions

### Implementation Complexity

**Time**: 1 day
**Code**: ~30-50 lines
**Maintenance**: Minimal

### Basic Auth Example

```typescript
// Server-side (Express.js)
app.use((req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).send('Authentication required');

  const [scheme, credentials] = auth.split(' ');
  if (scheme !== 'Basic') return res.status(401).send('Basic auth required');

  const [username, password] = Buffer.from(credentials, 'base64').toString().split(':');

  if (username === process.env.API_USER && password === process.env.API_PASSWORD) {
    next();
  } else {
    res.status(401).send('Invalid credentials');
  }
});

// Client-side
const response = await fetch('https://api.example.com/data', {
  headers: {
    Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
  },
});
```

### Basic Auth vs OAuth

| Feature                 | Basic Auth | OAuth 2.0           |
| ----------------------- | ---------- | ------------------- |
| **Complexity**          | Very low   | Very high           |
| **HTTPS required**      | Yes        | Yes                 |
| **Token expiration**    | No         | Yes (access tokens) |
| **Credential rotation** | Simple     | Complex             |
| **Third-party access**  | No         | Yes                 |
| **Scopes**              | No         | Yes                 |

### When Basic Auth Is Sufficient

**Use Case**: MCP server accesses internal company API

**Requirements**:

- API is internal (not public internet)
- HTTPS available
- Simple username/password sufficient
- No third-party access needed

**Why Basic Auth Wins**:

1. **No OAuth infrastructure** needed
2. **Works in any transport** (HTTP, stdio with forwarding)
3. **No token management** complexity
4. **Credential rotation** is just changing password
5. **No race conditions** in concurrent requests

## Alternative 4: Mutual TLS (mTLS)

### What It Is

Both client and server authenticate using X.509 certificates, providing mutual authentication.

### When to Use mTLS

- **High-security environments**
- **Service mesh** communication
- **Zero-trust architectures**
- **Financial services** applications
- **Government/military** systems

### Implementation Complexity

**Time**: 3-5 days (including certificate infrastructure)
**Code**: ~200-300 lines
**Maintenance**: Medium (certificate rotation)

### mTLS vs OAuth

| Feature                   | mTLS          | OAuth 2.0      |
| ------------------------- | ------------- | -------------- |
| **Security level**        | Very high     | Medium-high    |
| **Authentication**        | Bidirectional | Unidirectional |
| **Certificates required** | Yes           | No             |
| **Token management**      | No tokens     | Complex tokens |
| **Performance**           | Excellent     | Good           |
| **Browser support**       | Limited       | Good           |

### When mTLS Is Superior

**Scenario**: MCP server communicating with high-security internal APIs

**mTLS Advantages**:

1. **No tokens to steal**: Authentication via certificates
2. **No expiration complexity**: Certificates have long validity periods
3. **OS-level security**: Certificates managed by OS keychain
4. **Perfect for service-to-service**: Designed for this use case
5. **Zero-trust ready**: Each connection authenticated

**OAuth Disadvantages in Same Scenario**:

1. Tokens can be intercepted and replayed
2. Token refresh adds complexity
3. OAuth designed for web, not service mesh
4. No mutual authentication (server doesn't verify client via OAuth)

## Alternative 5: Session-Based Authentication

### What It Is

Traditional web session with cookies, server-side session storage, and CSRF protection.

### When to Use Sessions

- **Web applications** you control fully
- **Monolithic architectures**
- **Server-rendered pages**
- **Traditional web apps** (not SPAs)

### Implementation Complexity

**Time**: 3-5 days
**Code**: ~300-500 lines
**Maintenance**: Low-medium

### Session Auth vs OAuth

| Feature                | Session Auth           | OAuth 2.0              |
| ---------------------- | ---------------------- | ---------------------- |
| **Stateful**           | Yes (server-side)      | No (token-based)       |
| **Scalability**        | Requires session store | Excellent              |
| **Third-party access** | No                     | Yes                    |
| **Complexity**         | Medium                 | High                   |
| **CSRF protection**    | Required               | Required (state param) |

### When Sessions Are Simpler

**Use Case**: Web application accessing Google APIs on behalf of logged-in users

**Option 1: OAuth 2.0**

1. Implement OAuth authorization code flow
2. Handle redirect URIs
3. Store tokens securely (encrypted)
4. Implement token refresh
5. Handle concurrent refresh requests
6. Manage token expiration

**Option 2: Session + API Key**

1. Use session authentication for user login
2. Use API key for Google API access
3. Server makes Google API calls on behalf of user
4. User never sees Google tokens

**Winner**: Option 2 is simpler if you don't need users to grant third-party apps access to their Google data.

## Alternative 6: JWT Without OAuth

### What It Is

JSON Web Tokens for authentication without full OAuth machinery.

### When to Use Standalone JWT

- **Microservices** authentication
- **API gateways**
- **Distributed systems**
- **Single-page applications**

### Implementation Complexity

**Time**: 2-3 days
**Code**: ~200-300 lines
**Maintenance**: Medium (key rotation)

### JWT Without OAuth vs OAuth with JWT

| Feature                  | JWT Only     | OAuth 2.0 (with JWT) |
| ------------------------ | ------------ | -------------------- |
| **Token format**         | JWT          | JWT (access tokens)  |
| **Authorization server** | Not required | Required             |
| **Grant types**          | N/A          | Multiple flows       |
| **Refresh tokens**       | Optional     | Standard             |
| **Complexity**           | Medium       | High                 |
| **Scopes**               | Custom       | Standard             |

### JWT-Only Example

```typescript
import jwt from 'jsonwebtoken';

// Issue token (after verifying username/password)
const token = jwt.sign({ userId: user.id, email: user.email }, process.env.JWT_SECRET, {
  expiresIn: '1h',
});

// Verify token
app.use((req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    res.status(401).send('Invalid token');
  }
});
```

### When JWT-Only Is Sufficient

**Scenario**: MCP server needs to authenticate requests to your API

**JWT Advantages**:

1. **No OAuth server** required
2. **Stateless**: No database lookups for every request
3. **Standard format**: Libraries available for all languages
4. **Flexible claims**: Include whatever data you need
5. **Simple issuance**: Sign with secret key, done

**No Need For**:

- Authorization server
- Multiple grant types
- Refresh token rotation
- Scope negotiation
- Redirect URI validation

## Alternative 7: Device Authorization Flow (OAuth, but simpler)

### What It Is

OAuth 2.0 Device Authorization Grant (RFC 8628) for input-constrained devices.

### When to Use Device Flow

- **CLI tools** requiring user authorization
- **Smart TVs** and streaming devices
- **IoT devices** without web browsers
- **Command-line MCP servers**

### Implementation Complexity

**Time**: 3-4 days (simpler than full OAuth)
**Code**: ~150-200 lines
**Maintenance**: Low

### Device Flow vs Authorization Code Flow

| Feature                       | Device Flow         | Auth Code Flow       |
| ----------------------------- | ------------------- | -------------------- |
| **Redirect URI**              | Not needed          | Required             |
| **Web browser**               | Separate device OK  | Same device required |
| **User experience**           | Enter code manually | Click through        |
| **CLI-friendly**              | Yes                 | No                   |
| **Implementation complexity** | Medium              | High                 |

### Device Flow for MCP Servers

**Perfect for**:

- MCP servers running as CLI tools
- stdio transport (no HTTP server needed)
- User needs to authorize Google access
- Desktop/terminal environment

**User Experience**:

1. MCP server: "Visit https://google.com/device and enter code: ABCD-EFGH"
2. User opens browser, enters code
3. User authorizes access
4. MCP server polls for completion
5. Receives tokens

**Advantages over Authorization Code Flow**:

1. **No local web server** needed
2. **No redirect URI** management
3. **Works in SSH sessions**
4. **Works in Docker containers**
5. **Works in stdio transport**

### Device Flow Implementation Example

```typescript
// 1. Request device code
const deviceCodeResponse = await fetch('https://oauth2.googleapis.com/device/code', {
  method: 'POST',
  body: new URLSearchParams({
    client_id: CLIENT_ID,
    scope: 'https://www.googleapis.com/auth/drive.readonly',
  }),
});

const { device_code, user_code, verification_url, interval } = await deviceCodeResponse.json();

// 2. Show user instructions
console.log(`Visit ${verification_url} and enter code: ${user_code}`);

// 3. Poll for token
while (true) {
  await sleep(interval * 1000);

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      device_code: device_code,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    }),
  });

  if (tokenResponse.ok) {
    const tokens = await tokenResponse.json();
    // Save tokens and proceed
    break;
  }

  // Continue polling
}
```

**Complexity Comparison**:

- Device Flow: ~150 lines
- Authorization Code Flow with Local Server: ~300+ lines

## Alternative 8: Personal Access Tokens (PAT)

### What They Are

Long-lived tokens generated by users in their account settings, used like API keys.

### When to Use PATs

- **Developer tools**
- **CI/CD pipelines**
- **Personal scripts**
- **Testing/development**

### Implementation Complexity

**Time**: 1-2 days
**Code**: ~50-100 lines
**Maintenance**: Very low

### PAT Examples

- **GitHub**: Personal Access Tokens for API access
- **GitLab**: Personal Access Tokens
- **Bitbucket**: App Passwords
- **Google Cloud**: User-created API keys

### PAT vs OAuth

| Feature                | PAT                      | OAuth 2.0                 |
| ---------------------- | ------------------------ | ------------------------- |
| **User setup**         | Copy token from settings | Complete OAuth flow       |
| **Implementation**     | API key-like             | Complex flows             |
| **Expiration**         | Long-lived or manual     | Short-lived access tokens |
| **Revocation**         | User-controlled          | Application-controlled    |
| **Third-party access** | No                       | Yes                       |

### MCP Server PAT Use Case

**Scenario**: Developer wants MCP server to access their Google Drive

**With OAuth**:

1. Implement OAuth flow
2. Handle redirect (device flow or local server)
3. Store tokens securely
4. Implement refresh logic
5. Handle expiration during tool calls

**With PAT** (if Google supported it for Drive):

1. User generates token in Google Account settings
2. User adds token to MCP server config
3. MCP server uses token like API key
4. No refresh needed (long-lived)

**Note**: Google doesn't widely support PAT approach for user-context APIs, but this illustrates why simpler approaches are preferred by developers.

## Alternative 9: No Authentication (Public APIs)

### When to Use No Auth

- **Truly public APIs**
- **Anonymous access** is acceptable
- **Rate limiting by IP** is sufficient

### Examples

- Public weather APIs
- Public blockchain data
- Public government data APIs
- Some Google APIs (Maps, with API key for tracking only)

### MCP Server Public API Access

**Perfect for**:

- Accessing public data
- Read-only operations
- Non-user-specific content

**Advantages**:

- **Zero complexity**: Just fetch the URL
- **No credentials** to manage
- **No expiration** issues
- **No security vulnerabilities** from auth

## Decision Matrix: Which Alternative to Use?

### For MCP Servers Specifically

| MCP Server Need                         | Best Alternative           | Why                               |
| --------------------------------------- | -------------------------- | --------------------------------- |
| Access public Google APIs               | **API Keys**               | Simple, no user context needed    |
| Access user's Google data (first-party) | **Device Flow**            | CLI-friendly, stdio compatible    |
| Server-to-server Google API access      | **Service Accounts**       | No user in loop, automatic tokens |
| Access internal company API             | **Basic Auth** or **mTLS** | Simple, secure, no OAuth overhead |
| Issue tokens to identify MCP server     | **JWT (no OAuth)**         | Stateless, simple issuance        |
| Public data access                      | **No Auth**                | Zero complexity                   |

### General Decision Tree

```
Do you need third-party apps to access user resources?
├─ YES → Use OAuth 2.0 (it's actually required)
└─ NO → Continue...
    │
    Is there user context?
    ├─ NO → Use Service Accounts or API Keys
    └─ YES → Continue...
        │
        Is this a CLI tool?
        ├─ YES → Use Device Flow (simplified OAuth)
        └─ NO → Continue...
            │
            Is this a web app you control fully?
            ├─ YES → Use Session Auth + API Keys
            └─ NO → Use JWT without OAuth
```

## Security Comparison

### Vulnerability Counts by Auth Method

Based on common CVE databases and security research:

| Auth Method          | Common Vulnerabilities    | Severity                 |
| -------------------- | ------------------------- | ------------------------ |
| **OAuth 2.0**        | 20+ vulnerability classes | High (due to complexity) |
| **API Keys**         | 3-4 vulnerability classes | Low-Medium               |
| **Service Accounts** | 2-3 vulnerability classes | Low                      |
| **Basic Auth**       | 2-3 vulnerability classes | Medium (if HTTPS)        |
| **mTLS**             | 1-2 vulnerability classes | Very Low                 |
| **JWT**              | 5-6 vulnerability classes | Medium                   |
| **PAT**              | 2-3 vulnerability classes | Low                      |

### Time-to-Exploit

Average time for attacker to exploit misconfigured auth:

| Auth Method          | Avg Time to Exploit | Exploitability                 |
| -------------------- | ------------------- | ------------------------------ |
| **OAuth 2.0**        | Minutes-Hours       | High (many attack vectors)     |
| **API Keys**         | Minutes             | Medium (if exposed)            |
| **Service Accounts** | Hours-Days          | Low (requires key file)        |
| **Basic Auth**       | Minutes             | Medium (if credentials leaked) |
| **mTLS**             | Days-Weeks          | Very Low (requires cert theft) |
| **JWT**              | Hours               | Medium (if secret exposed)     |

## Cost Comparison

### Development Time

| Auth Method          | Initial Implementation | Maintenance/Year         |
| -------------------- | ---------------------- | ------------------------ |
| **OAuth 2.0**        | 2-4 weeks              | 1-2 weeks                |
| **API Keys**         | 1-2 days               | 1-2 days                 |
| **Service Accounts** | 2-3 days               | 2-3 days                 |
| **Basic Auth**       | 1 day                  | 1 day                    |
| **mTLS**             | 3-5 days               | 3-4 days (cert rotation) |
| **JWT**              | 2-3 days               | 2-3 days                 |
| **Device Flow**      | 3-4 days               | 1-2 days                 |

### Infrastructure Costs

| Auth Method          | Infrastructure Requirements                             | Monthly Cost (rough) |
| -------------------- | ------------------------------------------------------- | -------------------- |
| **OAuth 2.0**        | Authorization server, token storage, session management | $50-500+             |
| **API Keys**         | Simple database or config                               | $5-20                |
| **Service Accounts** | Credential storage                                      | $5-10                |
| **Basic Auth**       | Credential storage                                      | $5-10                |
| **mTLS**             | Certificate authority, cert storage                     | $20-100              |
| **JWT**              | Secret storage                                          | $5-10                |

## Real-World Case Studies

### Case Study 1: GitHub CLI (Device Flow Winner)

**Problem**: GitHub CLI needs user authorization but runs in terminal.

**Rejected**: Authorization Code Flow (no browser redirect handling in CLI)

**Chosen**: Device Flow

**Result**:

- User-friendly: "Visit URL and enter code"
- Works in SSH sessions
- Works in Docker containers
- Simple implementation (~200 lines)

**Lesson**: OAuth Device Flow is the right choice for CLI tools needing user auth.

### Case Study 2: Google Cloud SDK (Service Account Winner)

**Problem**: Server-side scripts need Google Cloud API access.

**Rejected**: OAuth (no user in loop, unnecessary complexity)

**Chosen**: Service Accounts with JSON key files

**Result**:

- Zero user interaction
- Automatic token refresh
- Works in automated environments
- Simple setup

**Lesson**: Service accounts are perfect for server-side automation.

### Case Study 3: Stripe API (API Key Winner)

**Problem**: Developers need to integrate payment processing.

**Rejected**: OAuth (third-party delegation not needed)

**Chosen**: API keys (publishable and secret keys)

**Result**:

- 5-minute setup time
- Copy/paste key into environment variable
- Excellent developer experience
- Industry standard for payment APIs

**Lesson**: API keys are sufficient and preferred for developer-facing APIs.

## Conclusion: When NOT to Use OAuth

### Clear "No OAuth" Scenarios

1. **No third-party delegation needed**: 95% of applications
2. **Machine-to-machine communication**: Service accounts better
3. **CLI tools accessing own backend**: API keys sufficient
4. **Internal company APIs**: Basic auth or mTLS simpler
5. **Development complexity is a constraint**: Simpler methods faster
6. **Security expertise is limited**: Fewer footguns in simpler methods

### MCP Server Recommendation

**For most MCP servers accessing Google APIs**:

1. **Public Google APIs**: Use API keys
2. **User's Google data (CLI context)**: Use Device Flow
3. **Automated scripts**: Use Service Accounts
4. **Your own backend API**: Use API keys or JWT

**Avoid OAuth 2.0 Authorization Code Flow** unless you have specific need for web-based authorization flow with redirect URIs.

### The Pragmatic Truth

OAuth 2.0 solves real problems for Google, GitHub, and Facebook. They need to enable third-party application ecosystems with fine-grained permissions.

**For everyone else**: Simpler alternatives are faster to implement, easier to secure, and sufficient for requirements.

**Expert consensus**: "You probably don't need OAuth2" applies to most developers reading this document.

## References

- Ory.sh: "Why you probably do not need OAuth2 / OpenID Connect"
- RFC 8628: OAuth 2.0 Device Authorization Grant
- Google Cloud: Service Account Documentation
- Stripe API: API Key Best Practices
- GitHub CLI: Device Flow Implementation
- MojoAuth: "Auth0 Too Complex: Simple OTP Alternative"
- Stack Overflow: "OAuth 2.0 Benefits and use cases — why?"
