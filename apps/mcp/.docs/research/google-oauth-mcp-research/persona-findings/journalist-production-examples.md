# JOURNALIST FINDINGS: Production MCP OAuth Examples

**Research Date**: November 6, 2025
**Researcher**: THE JOURNALIST persona
**Focus**: Real-world production implementations with code examples

---

## Executive Summary

This document catalogs **production-ready MCP servers** with OAuth implementations, providing direct links, code patterns, and deployment strategies. Focus is on **actively maintained** (2024-2025) projects with **real users** or serving as **authoritative references**.

---

## Production Examples by Category

### 1. Reference Implementations (Gold Standard)

#### systemprompt-mcp-server

**Status**: Community Gold Standard | **Last Updated**: 2025

```
Repository: github.com/systempromptio/systemprompt-mcp-server
Description: Complete, production-ready MCP server with OAuth 2.1
Use Case: Reddit integration as real-world example
Stars: High community engagement
License: Open source
```

**Why It's the Gold Standard**:

- Complete OAuth 2.1 implementation with PKCE
- JWT token management with refresh
- Session management with secure storage
- Demonstrates all MCP features (tools, prompts, resources, sampling, notifications)
- Production-tested with real users
- Comprehensive documentation
- Community-recognized as reference

**Technology Stack**:

```typescript
- TypeScript
- @modelcontextprotocol/sdk
- OAuth 2.1 with PKCE
- JWT for token management
- Reddit API integration
```

**Key Features**:

- ✅ Complete OAuth flow (authorization code + PKCE)
- ✅ Token refresh with rotation
- ✅ Secure session storage
- ✅ Error handling and retry logic
- ✅ Rate limiting
- ✅ Structured data validation (Zod)
- ✅ Real-time notifications
- ✅ Sampling and elicitation
- ✅ Production deployment ready

**Code Patterns to Study**:

1. OAuth flow orchestration
2. Token storage and refresh
3. Session lifecycle management
4. Error recovery strategies
5. API rate limiting with OAuth
6. Multi-user token isolation

**Recommended Use**: Start here to understand complete OAuth architecture in MCP context.

---

#### MCP TypeScript SDK Official Examples

**Status**: Canonical Reference | **Updated**: Weekly (v1.21.0)

```
Repository: github.com/modelcontextprotocol/typescript-sdk
Primary Files:
  - src/examples/server/simpleStreamableHttp.ts
  - src/examples/client/simpleOAuthClient.ts
  - src/server/auth/router.ts
  - src/client/auth.ts
License: MIT
```

**Why It's Canonical**:

- Official Anthropic implementation
- Spec-compliant by definition
- Actively maintained with spec
- Used by all other implementations as reference
- Production-tested in Claude Desktop

**Server Example Pattern**:

```typescript
// From simpleStreamableHttp.ts
const useOAuth = process.argv.includes('--oauth');

if (useOAuth) {
  const mcpServerUrl = new URL(`http://localhost:${MCP_PORT}/mcp`);
  const authServerUrl = new URL(`http://localhost:${AUTH_PORT}`);

  // Setup auth server
  const oauthMetadata = setupAuthServer({
    authServerUrl,
    mcpServerUrl,
    strictResource: strictOAuth,
  });

  // Create token verifier
  const tokenVerifier = {
    verifyAccessToken: async (token: string) => {
      const endpoint = oauthMetadata.introspection_endpoint;
      // Token introspection logic
      return verifiedToken;
    },
  };

  // Add metadata routes
  app.use(
    mcpAuthMetadataRouter({
      oauthMetadata,
      resourceServerUrl: mcpServerUrl,
      scopesSupported: ['mcp:tools'],
      resourceName: 'MCP Demo Server',
    })
  );

  // Create auth middleware
  authMiddleware = requireBearerAuth({
    verifier: tokenVerifier,
    requiredScopes: [],
    resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(mcpServerUrl),
  });
}

// Apply to endpoints
if (useOAuth && authMiddleware) {
  app.post('/mcp', authMiddleware, mcpPostHandler);
  app.get('/mcp', authMiddleware, mcpGetHandler);
}
```

**Client Example Pattern**:

```typescript
// From simpleOAuthClient.ts
// Demonstrates browser-based OAuth flow
// Token acquisition and usage
// Automatic connection with credentials
```

**Run It Yourself**:

```bash
# Server with OAuth
npx tsx src/examples/server/simpleStreamableHttp.ts --oauth

# Client
npx tsx src/examples/client/simpleOAuthClient.js
```

**Key SDK Components**:

- `mcpAuthMetadataRouter`: Exposes RFC 8414/9728 metadata
- `requireBearerAuth`: Express middleware for token verification
- `getOAuthProtectedResourceMetadataUrl`: Helper for metadata URLs
- Token verification abstractions

**Recommended Use**: Study for SDK-specific patterns and best practices.

---

### 2. Cloudflare Workers Implementations

#### Cloudflare workers-oauth-provider (Official Library)

**Status**: Production Library | **Updated**: 2025

```
Repository: github.com/cloudflare/workers-oauth-provider
Package: @cloudflare/workers-oauth-provider
Platform: Cloudflare Workers
Use Case: Simplify OAuth for edge deployments
```

**Why It Matters**:

- Official Cloudflare library
- Makes OAuth trivial on Workers
- < 100 lines of code for basic OAuth
- Handles all OAuth complexity
- Production-tested at scale

**Basic Pattern**:

```typescript
import { OAuthProvider } from '@cloudflare/workers-oauth-provider';

const provider = OAuthProvider({
  apiRoute: '/sse',
  apiHandler: yourMCPServerImplementation,
  defaultHandler: yourAuthImplementation,
  endpoints: {
    authorize: '/authorize',
    token: '/token',
    register: '/register',
  },
});

export default provider;
```

**Features**:

- ✅ OAuth 2.1 with PKCE
- ✅ Dynamic Client Registration (RFC 7591)
- ✅ Automatic token management
- ✅ Metadata exposure (RFC 8414)
- ✅ Zero configuration defaults
- ✅ Global edge deployment

**Documentation**: https://developers.cloudflare.com/agents/model-context-protocol/authorization/

**Recommended Use**: Fastest path to production OAuth on Cloudflare.

---

#### remote-mcp-server-with-auth (Cole Medin)

**Status**: Production Template | **Updated**: 2025

```
Repository: github.com/coleam00/remote-mcp-server-with-auth
Platform: Cloudflare Workers
OAuth Provider: GitHub
Database: PostgreSQL
Features: RBAC, global deployment
```

**Why It's a Great Template**:

- Production-ready starting point
- Complete project structure
- Database integration included
- RBAC patterns demonstrated
- Deployment scripts included
- Well-documented setup

**Technology Stack**:

```typescript
- Cloudflare Workers
- @cloudflare/workers-oauth-provider
- PostgreSQL (Cloudflare D1 or external)
- GitHub OAuth
- TypeScript
```

**Features**:

- ✅ GitHub OAuth integration
- ✅ User database with sessions
- ✅ Role-based access control
- ✅ Global edge deployment
- ✅ Development environment setup
- ✅ Production deployment guide

**Architecture**:

```
User → Claude Desktop → MCP Client
                          ↓
                    Cloudflare Workers
                          ↓
              ┌───────────┴───────────┐
              ↓                       ↓
        GitHub OAuth            PostgreSQL
        (Authentication)        (Sessions)
```

**Setup Process**:

1. Clone repository
2. Configure GitHub OAuth app
3. Set environment variables
4. Deploy to Cloudflare Workers
5. Configure Claude Desktop

**Customization Path**:

- Replace GitHub OAuth with Google OAuth
- Add Google API integrations
- Customize RBAC rules
- Add additional tools

**Recommended Use**: Best starting template for remote MCP servers with OAuth.

---

#### Strava MCP Server (kw510)

**Status**: Production Example | **Updated**: 2025

```
Repository: github.com/kw510/strava-mcp
Platform: Cloudflare Workers
OAuth Provider: Strava
Use Case: Fitness data integration
```

**Why It's Interesting**:

- Real-world OAuth integration (Strava API)
- Shows third-party OAuth patterns
- Cloudflare Workers deployment
- User authentication flow
- API token management

**Features**:

- ✅ Strava OAuth login
- ✅ Secure authentication
- ✅ Activity data access
- ✅ MCP tool integration
- ✅ Edge deployment

**Pattern**: User logs in via Strava → MCP server gets access → Tools work with user's Strava data

**Recommended Use**: Study for third-party OAuth provider integration.

---

### 3. Full-Stack Web Implementations

#### mcp-nextjs (run-llama)

**Status**: Production Example | **Updated**: 2025

```
Repository: github.com/run-llama/mcp-nextjs
Platform: Next.js 15
Database: PostgreSQL + Prisma
OAuth: Custom implementation
Transports: SSE and HTTP
```

**Why It's Valuable**:

- Modern full-stack architecture
- Database-backed sessions
- Supports both transports (SSE + HTTP)
- Next.js patterns for MCP
- Production deployment ready

**Technology Stack**:

```typescript
- Next.js 15 (App Router)
- PostgreSQL
- Prisma ORM
- @modelcontextprotocol/sdk
- TypeScript
```

**Architecture**:

```
Next.js App
├── OAuth Routes
│   ├── /api/auth/callback
│   ├── /api/auth/token
│   └── /api/auth/register
├── MCP Routes
│   ├── /api/mcp (POST)
│   └── /api/sse (GET)
└── Database
    └── Prisma (sessions, tokens)
```

**Features**:

- ✅ OAuth client registration
- ✅ Token exchange
- ✅ Session management (PostgreSQL)
- ✅ SSE for streaming
- ✅ HTTP POST for requests
- ✅ Prisma for database
- ✅ Next.js API routes

**Session Management Pattern**:

```typescript
// Prisma schema for sessions
model Session {
  id           String   @id @default(uuid())
  userId       String
  accessToken  String
  refreshToken String
  expiresAt    DateTime
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}
```

**Recommended Use**: Best example for Next.js-based MCP servers with database.

---

#### mcp-oauth-sample (raxITai)

**Status**: Production Template | **Updated**: 2025

```
Repository: github.com/raxITai/mcp-oauth-sample
Platform: Next.js 15 + Vercel
Features: Analytics, threat detection, refresh tokens
OAuth: OAuth 2.1 compliant
```

**Why It's Advanced**:

- Production monitoring included
- Real-time analytics dashboard
- Security threat detection
- OAuth refresh token rotation
- Comprehensive logging

**Technology Stack**:

```typescript
- Next.js 15
- OAuth 2.1 with PKCE
- Real-time analytics
- Threat detection system
- Deployment: Vercel
```

**Advanced Features**:

- ✅ OAuth refresh tokens
- ✅ Token rotation
- ✅ Analytics dashboard
- ✅ Threat detection
- ✅ Comprehensive audit logs
- ✅ Rate limiting
- ✅ IP-based security

**Monitoring Dashboard**:

- Active sessions
- Token usage metrics
- Failed authentication attempts
- API request rates
- Geographic distribution

**Recommended Use**: Production template with enterprise monitoring features.

---

### 4. Gateway Solutions

#### mcp-oauth-gateway (atrawog)

**Status**: Production Utility | **Updated**: 2025

```
Repository: github.com/atrawog/mcp-oauth-gateway
Purpose: Add OAuth to ANY MCP server without code changes
OAuth Provider: GitHub (identity)
Pattern: Gateway/Proxy
```

**Why It's Revolutionary**:

- No code changes to existing MCP servers
- Sits between client and server
- Adds OAuth to any MCP server
- Perfect for legacy servers
- Simple deployment

**Architecture**:

```
MCP Client (Claude) → OAuth Gateway → Existing MCP Server
                           ↓
                      GitHub OAuth
                    (Authentication)
```

**How It Works**:

1. Client connects to gateway (not directly to MCP server)
2. Gateway handles OAuth flow with GitHub
3. Gateway validates tokens
4. Gateway proxies requests to actual MCP server
5. MCP server sees authenticated requests

**Features**:

- ✅ OAuth 2.1 with PKCE
- ✅ Dynamic Client Registration (RFC 7591/7592)
- ✅ GitHub as identity provider
- ✅ Zero MCP server code changes
- ✅ Token validation and refresh
- ✅ Simple configuration

**Use Cases**:

- Adding OAuth to existing MCP servers
- Centralizing authentication for multiple servers
- Testing OAuth without modifying code
- Quick prototyping

**Configuration**:

```yaml
gateway:
  upstream: http://localhost:3000 # Your MCP server
  oauth:
    provider: github
    client_id: your_client_id
    client_secret: your_client_secret
```

**Recommended Use**: Best for adding OAuth to existing servers without code changes.

---

#### mcp-gateway-registry (agentic-community)

**Status**: Enterprise Solution | **Updated**: 2025

```
Repository: github.com/agentic-community/mcp-gateway-registry
Purpose: Enterprise-ready MCP Gateway & Registry
OAuth Providers: Keycloak, AWS Cognito
Features: Tool discovery, audit logs, governance
```

**Why It's Enterprise-Grade**:

- Centralized tool registry
- Multi-MCP server support
- OAuth with enterprise providers
- Comprehensive audit logging
- Governance and compliance
- Dynamic tool discovery

**Architecture**:

```
AI Agents / Coding Assistants
          ↓
    Gateway + Registry
          ↓
  ┌───────┴────────┐
  ↓                ↓
Keycloak/Cognito  Tool Registry
(Authentication)   (Discovery)
          ↓
Multiple MCP Servers
```

**Features**:

- ✅ Enterprise OAuth (Keycloak, Cognito)
- ✅ Dynamic tool discovery
- ✅ Centralized registry
- ✅ Audit logging
- ✅ Governance policies
- ✅ Multi-server support
- ✅ RBAC enforcement

**Use Cases**:

- Large organizations with many MCP servers
- Compliance requirements (audit logs)
- Centralized tool management
- Enterprise identity integration

**Integration Options**:

- AWS Cognito for AWS environments
- Keycloak for self-hosted
- Custom OAuth providers

**Recommended Use**: Enterprise deployments requiring centralized governance.

---

### 5. Google OAuth Specific Examples

#### nspady/google-calendar-mcp

**Status**: Production Ready | **Updated**: 2025

```
Repository: github.com/nspady/google-calendar-mcp
Package: @cocal/google-calendar-mcp
API: Google Calendar API
OAuth: Google OAuth 2.0
```

**Why It's the Best Google Calendar Example**:

- Clean, simple implementation
- Well-documented setup
- Multi-calendar support
- Complete OAuth flow
- Production-tested

**Technology Stack**:

```typescript
- TypeScript
- google-auth-library
- googleapis
- @modelcontextprotocol/sdk
- Node.js 16+
```

**Setup Process**:

```bash
# 1. Get OAuth credentials from Google Cloud Console
# 2. Save as gcp-oauth.keys.json

# 3. Authenticate
export GOOGLE_OAUTH_CREDENTIALS="/path/to/gcp-oauth.keys.json"
npx @cocal/google-calendar-mcp auth

# 4. Run server
npx @cocal/google-calendar-mcp
```

**OAuth Flow**:

1. Check for existing tokens on startup
2. If missing, start local auth server (port 3000-3004)
3. Open browser to Google OAuth consent
4. User grants permissions
5. Exchange code for tokens
6. Store tokens securely
7. Auto-refresh when expired

**Token Storage**:

```typescript
// Typically stored in:
~/.mcp/google-calendar/tokens.json

// Contains:
{
  "access_token": "...",
  "refresh_token": "...",
  "expiry_date": 1234567890
}
```

**MCP Tools Provided**:

- `list_calendars`: Get user's calendars
- `list_events`: Query calendar events
- `create_event`: Add new event
- `update_event`: Modify event
- `delete_event`: Remove event
- `search_events`: Find events by criteria

**Error Handling**:

```typescript
// Automatic token refresh on 401/403
try {
  const response = await calendar.events.list(...);
} catch (error) {
  if (error.code === 401 || error.code === 403) {
    await refreshTokens();
    // Retry request
  }
}
```

**Recommended Use**: Best starting point for Google Calendar integration.

---

#### j3k0/mcp-google-workspace

**Status**: Production Ready | **Updated**: 2025

```
Repository: github.com/j3k0/mcp-google-workspace
Services: Gmail + Google Calendar
OAuth: Google OAuth 2.0
Architecture: Modular TypeScript
```

**Why It's Architecturally Superior**:

- Modular design (separate services)
- Clean separation of concerns
- Reusable authentication module
- Multiple Google services
- Production patterns

**Project Structure**:

```
src/
├── gauth.ts          # Google authentication service
├── calendar.ts       # Calendar tools implementation
├── gmail.ts          # Gmail tools implementation
├── index.ts          # Main MCP server
└── types/            # TypeScript types
```

**Authentication Module Pattern** (`gauth.ts`):

```typescript
export class GoogleAuthService {
  private oauth2Client: OAuth2Client;
  private tokenPath: string;

  constructor(credentialsPath: string) {
    // Load credentials
    // Initialize OAuth2Client
  }

  async authenticate(): Promise<void> {
    // Check for existing tokens
    // If missing, start auth flow
    // Store tokens securely
  }

  async refreshIfNeeded(): Promise<void> {
    // Check token expiry
    // Refresh if needed
  }

  getClient(): OAuth2Client {
    return this.oauth2Client;
  }
}
```

**Service Pattern** (`calendar.ts`):

```typescript
import { GoogleAuthService } from './gauth';

export class CalendarService {
  private auth: GoogleAuthService;
  private calendar: calendar_v3.Calendar;

  constructor(auth: GoogleAuthService) {
    this.auth = auth;
    this.calendar = google.calendar({
      version: 'v3',
      auth: auth.getClient(),
    });
  }

  async listEvents(calendarId: string, options: ListOptions) {
    await this.auth.refreshIfNeeded();
    return this.calendar.events.list({ calendarId, ...options });
  }

  // Other calendar methods...
}
```

**Main Server Pattern** (`index.ts`):

```typescript
import { GoogleAuthService } from './gauth';
import { CalendarService } from './calendar';
import { GmailService } from './gmail';

const auth = new GoogleAuthService('/path/to/credentials.json');
await auth.authenticate();

const calendarService = new CalendarService(auth);
const gmailService = new GmailService(auth);

// Register MCP tools
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'list_events':
      return calendarService.listEvents(args.calendarId, args);
    case 'send_email':
      return gmailService.sendEmail(args);
    // Other tools...
  }
});
```

**Features**:

- ✅ Shared authentication across services
- ✅ Automatic token refresh
- ✅ Modular service architecture
- ✅ TypeScript throughout
- ✅ Error handling per service
- ✅ Easy to extend with new services

**Recommended Use**: Best architectural pattern for multiple Google services.

---

#### galacoder/mcp-google-calendar

**Status**: Production Ready | **Updated**: 2025

```
Repository: github.com/galacoder/mcp-google-calendar
Platform: Node.js 16+, TypeScript 5.3+
OAuth: Google OAuth 2.0
Build: src/ → build/ pattern
```

**Why It's a Good Standard Implementation**:

- Clean build process
- Standard project structure
- Well-typed throughout
- Good documentation
- Easy to understand

**Project Structure**:

```
mcp-google-calendar/
├── src/              # TypeScript source
│   ├── index.ts
│   ├── auth.ts
│   ├── tools.ts
│   └── types.ts
├── build/            # Compiled JavaScript
├── gcp-oauth.keys.json  # OAuth credentials
├── package.json
├── tsconfig.json
└── README.md
```

**Build Process**:

```bash
# Development
npm run dev    # Watch mode with tsx

# Production
npm run build  # Compile TypeScript
npm start      # Run compiled code
```

**OAuth Setup**:

1. Create Google Cloud project
2. Enable Calendar API
3. Create OAuth 2.0 credentials
4. Download JSON file
5. Rename to `gcp-oauth.keys.json`
6. Place in project root

**Features**:

- ✅ TypeScript 5.3+ features
- ✅ Clean separation (auth, tools, types)
- ✅ Development and production builds
- ✅ Standard Google OAuth flow
- ✅ Calendar event management

**Recommended Use**: Good starting point for standard TypeScript MCP projects.

---

### 6. Specialized OAuth Implementations

#### NapthaAI/http-oauth-mcp-server

**Status**: Reference Implementation | **Updated**: 2025

```
Repository: github.com/NapthaAI/http-oauth-mcp-server
Transport: Streamable HTTP & SSE
OAuth Provider: Auth0
Security: Token exposure prevention
```

**Why It's a Security Reference**:

- Spec-compliant OAuth
- Auth0 integration
- Token security focus
- Multiple transports
- Production patterns

**Security Features**:

- ✅ No token exposure in logs
- ✅ Secure token storage
- ✅ Token validation on every request
- ✅ Automatic token rotation
- ✅ Rate limiting per token

**Architecture**:

```
MCP Client → HTTP POST / SSE GET
                ↓
         Token Verification
                ↓
           Auth0 Introspection
                ↓
         MCP Server Logic
```

**Auth0 Integration**:

```typescript
const auth0Config = {
  domain: process.env.AUTH0_DOMAIN,
  clientId: process.env.AUTH0_CLIENT_ID,
  clientSecret: process.env.AUTH0_CLIENT_SECRET,
  audience: process.env.AUTH0_AUDIENCE,
};

// Token introspection
async function verifyToken(token: string) {
  const response = await fetch(`https://${auth0Config.domain}/oauth/token/introspection`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token,
      client_id: auth0Config.clientId,
      client_secret: auth0Config.clientSecret,
    }),
  });
  return response.json();
}
```

**Recommended Use**: Security best practices and Auth0 patterns.

---

#### QuantGeekDev/mcp-oauth2.1-server

**Status**: Spec Reference | **Updated**: 2025

```
Repository: github.com/QuantGeekDev/mcp-oauth2.1-server
Purpose: Reference implementation of MCP OAuth spec
Spec Version: 2025-03-26
OAuth: OAuth 2.1 with PKCE
```

**Why It's a Spec Reference**:

- Directly implements MCP spec
- No shortcuts or simplifications
- Educational code comments
- Spec compliance focus
- Good for understanding requirements

**Spec Compliance Checklist**:

```
✅ OAuth 2.1 with PKCE mandatory
✅ Authorization Server Metadata (RFC 8414)
✅ Protected Resource Metadata (RFC 9728)
✅ Dynamic Client Registration (RFC 7591)
✅ Resource Indicators (RFC 8707)
✅ Token introspection
✅ Metadata discovery endpoints
```

**Code Comments Example**:

```typescript
// Per MCP spec 2025-03-26, MCP servers MUST act as OAuth Resource Servers
// and delegate authentication to a separate Authorization Server.
// This implementation follows RFC 9728 for Protected Resource Metadata.

export function setupResourceMetadata() {
  // Expose metadata at /.well-known/oauth-protected-resource
  // as required by MCP specification section 2.3
  return {
    resource: mcpServerUrl,
    authorization_servers: [authServerUrl],
    scopes_supported: ['mcp:tools', 'mcp:resources'],
    bearer_methods_supported: ['header'],
    resource_documentation: 'https://example.com/docs',
  };
}
```

**Recommended Use**: Understanding exact spec requirements and compliance.

---

## Quick Reference: Choose Your Path

### I want to build with Google OAuth...

#### Option 1: Google Calendar (Simplest)

**Start Here**: `nspady/google-calendar-mcp`

- Clone and customize for your needs
- Well-documented, clean code
- Production-ready patterns

#### Option 2: Multiple Google Services

**Start Here**: `j3k0/mcp-google-workspace`

- Modular architecture
- Gmail + Calendar patterns
- Easy to extend

#### Option 3: From Scratch

**Study**: MCP TypeScript SDK examples + `galacoder/mcp-google-calendar`

- Official SDK patterns
- Standard project structure
- Build your own

---

### I want to deploy to Cloudflare Workers...

#### Option 1: Template (Fastest)

**Start Here**: `coleam00/remote-mcp-server-with-auth`

- Fork and replace GitHub OAuth with Google
- Production deployment included
- Database patterns included

#### Option 2: Library (Most Control)

**Start Here**: `@cloudflare/workers-oauth-provider`

- Official Cloudflare library
- Build exactly what you need
- < 100 lines for basic OAuth

---

### I want the most complete reference...

**Start Here**: `systemprompt-mcp-server`

- Community gold standard
- All features demonstrated
- Production-tested
- Use as architectural reference

---

### I want to add OAuth to existing server...

**Start Here**: `mcp-oauth-gateway`

- No code changes needed
- Gateway/proxy pattern
- Quick integration

---

### I need enterprise features...

**Start Here**: `mcp-gateway-registry`

- Keycloak/Cognito integration
- Audit logging
- Centralized governance
- Multi-server support

---

## Code Patterns Summary

### Pattern 1: Separate Auth Service (Modular)

**Best Example**: `j3k0/mcp-google-workspace`

```typescript
// auth-service.ts
export class AuthService {
  async authenticate(): Promise<void> {}
  async refreshIfNeeded(): Promise<void> {}
  getClient(): OAuth2Client {}
}

// calendar-service.ts
export class CalendarService {
  constructor(private auth: AuthService) {}
  async listEvents() {
    await this.auth.refreshIfNeeded();
    // Use auth.getClient()
  }
}
```

**Pros**: Clean separation, reusable, testable
**Cons**: More files, slightly more complex

---

### Pattern 2: SDK Middleware (Framework-Based)

**Best Example**: MCP TypeScript SDK

```typescript
// Setup auth middleware
const authMiddleware = requireBearerAuth({
  verifier: tokenVerifier,
  requiredScopes: ['mcp:tools'],
});

// Apply to routes
app.post('/mcp', authMiddleware, mcpHandler);
```

**Pros**: Framework-integrated, minimal code
**Cons**: Coupled to framework

---

### Pattern 3: Library-Wrapped (Cloudflare)

**Best Example**: `@cloudflare/workers-oauth-provider`

```typescript
import { OAuthProvider } from '@cloudflare/workers-oauth-provider';

export default OAuthProvider({
  apiRoute: '/sse',
  apiHandler: myMCPServer,
  defaultHandler: myAuthFlow,
});
```

**Pros**: Minimal code, production-ready
**Cons**: Platform-specific

---

### Pattern 4: Gateway/Proxy (No Code Changes)

**Best Example**: `mcp-oauth-gateway`

```yaml
# config.yaml
upstream: http://localhost:3000
oauth:
  provider: github
  client_id: xxx
  client_secret: yyy
```

**Pros**: Zero MCP server changes
**Cons**: Additional infrastructure

---

## Testing Patterns

### Unit Testing OAuth Flows

**Example from**: `systemprompt-mcp-server`

```typescript
import { describe, it, expect, vi } from 'vitest';

describe('OAuth Flow', () => {
  it('should exchange code for tokens', async () => {
    const mockOAuth = vi.fn().mockResolvedValue({
      access_token: 'test_token',
      refresh_token: 'test_refresh',
      expires_in: 3600,
    });

    const result = await exchangeCodeForTokens('test_code', mockOAuth);

    expect(result.access_token).toBe('test_token');
    expect(mockOAuth).toHaveBeenCalledWith({
      code: 'test_code',
      grant_type: 'authorization_code',
    });
  });

  it('should refresh expired tokens', async () => {
    const expiredToken = { expires_at: Date.now() - 1000 };
    const refreshed = await maybeRefreshToken(expiredToken);
    expect(refreshed.access_token).not.toBe(expiredToken.access_token);
  });
});
```

---

### Integration Testing with Real OAuth

**Pattern**: Use OAuth Playground tokens

```typescript
// test-setup.ts
const TEST_TOKEN = process.env.GOOGLE_TEST_TOKEN;

// Obtain from: https://developers.google.com/oauthplayground

// integration.test.ts
describe('Google Calendar Integration', () => {
  it('should list calendars with real token', async () => {
    const service = new CalendarService(TEST_TOKEN);
    const calendars = await service.listCalendars();
    expect(calendars.length).toBeGreaterThan(0);
  });
});
```

---

### Manual Testing Scripts

**Pattern**: CLI auth tester

```bash
# test-oauth.sh
#!/bin/bash
echo "Testing OAuth flow..."

# Start auth flow
node dist/auth.js start

# Wait for user to complete OAuth
echo "Complete OAuth in browser, then press Enter"
read

# Test token
node dist/auth.js test-token

# Test refresh
node dist/auth.js refresh-token

echo "OAuth test complete"
```

---

## Deployment Patterns

### Cloudflare Workers

```bash
# wrangler.toml
name = "my-mcp-server"
main = "src/index.ts"
compatibility_date = "2025-01-01"

[vars]
OAUTH_CLIENT_ID = "your_client_id"

[secrets]
# Set via: wrangler secret put OAUTH_CLIENT_SECRET
# OAUTH_CLIENT_SECRET

# Deploy
wrangler deploy
```

---

### Next.js (Vercel)

```bash
# Deploy to Vercel
vercel

# Set environment variables
vercel env add GOOGLE_CLIENT_ID
vercel env add GOOGLE_CLIENT_SECRET

# Redeploy
vercel --prod
```

---

### Docker + Docker Compose

```yaml
# docker-compose.yml
version: '3.8'
services:
  mcp-server:
    build: .
    ports:
      - '3000:3000'
    environment:
      - GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
      - GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}
    volumes:
      - ./tokens:/app/tokens
```

---

## Key Takeaways

### Start With These Three

1. **systemprompt-mcp-server** - Overall architecture
2. **nspady/google-calendar-mcp** - Google OAuth specifics
3. **MCP TypeScript SDK examples** - Official patterns

### Use These Libraries

- `google-auth-library` - Google OAuth (official)
- `@modelcontextprotocol/sdk` - MCP functionality (required)
- `@cloudflare/workers-oauth-provider` - If using Cloudflare

### Deploy To

- **Cloudflare Workers** - Simplest, global, free tier generous
- **Next.js/Vercel** - Full-stack, database-backed, good DX
- **Self-hosted** - Docker Compose, full control

---

## All Repository Links

### Gold Standard References

- https://github.com/systempromptio/systemprompt-mcp-server
- https://github.com/modelcontextprotocol/typescript-sdk

### Cloudflare Examples

- https://github.com/cloudflare/workers-oauth-provider
- https://github.com/coleam00/remote-mcp-server-with-auth
- https://github.com/kw510/strava-mcp

### Full-Stack Web

- https://github.com/run-llama/mcp-nextjs
- https://github.com/raxITai/mcp-oauth-sample

### Gateway Solutions

- https://github.com/atrawog/mcp-oauth-gateway
- https://github.com/agentic-community/mcp-gateway-registry

### Google OAuth Specific

- https://github.com/nspady/google-calendar-mcp
- https://github.com/j3k0/mcp-google-workspace
- https://github.com/galacoder/mcp-google-calendar

### Specialized

- https://github.com/NapthaAI/http-oauth-mcp-server
- https://github.com/QuantGeekDev/mcp-oauth2.1-server

---

**End of Production Examples Report**

_Last Updated: November 6, 2025_
