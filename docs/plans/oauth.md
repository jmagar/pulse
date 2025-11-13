# Google OAuth 2.1 Implementation Plan for Pulse MCP Server

**Date**: November 11, 2025  
**Target**: `apps/mcp/` - TypeScript MCP Server  
**Specification**: MCP 2025-03-26 + OAuth 2.1 + Google OAuth  

---

## Executive Summary

This document outlines the complete implementation plan for adding Google OAuth 2.1 authentication to the Pulse MCP (Model Context Protocol) server. The implementation follows the latest MCP specification (2025-03-26), OAuth 2.1 standards, and Google's OAuth best practices.

**Timeline**: 7 phases, estimated 3-5 days for full implementation  
**Security Level**: Production-ready with PKCE, token encryption, and audit logging  
**Compliance**: MCP 2025-03-26 spec, RFC 6749 (OAuth 2.1), RFC 8707 (Resource Indicators), RFC 8414 (Server Metadata)

---

## Table of Contents

1. [Research Summary](#research-summary)
2. [Current State Analysis](#current-state-analysis)
3. [Architecture Overview](#architecture-overview)
4. [Implementation Phases](#implementation-phases)
5. [Technical Specifications](#technical-specifications)
6. [Security Considerations](#security-considerations)
7. [Testing Strategy](#testing-strategy)
8. [Deployment Guide](#deployment-guide)
9. [Rollback Plan](#rollback-plan)

---

## Research Summary

### MCP OAuth 2.1 Requirements (2025-03-26 Specification)

The latest MCP specification introduces several critical OAuth requirements:

1. **Resource Server Classification**: MCP servers are classified as OAuth Resource Servers
2. **PKCE Mandatory**: Proof Key for Code Exchange (RFC 7636) required for all authorization code flows
3. **Resource Indicators**: RFC 8707 implementation to prevent token mis-redemption across servers
4. **Protected Resource Metadata**: Servers must expose `/.well-known/oauth-protected-resource` endpoint
5. **Authorization Server Metadata**: Support for RFC 8414 dynamic discovery
6. **Grant Types**: Authorization Code (with PKCE) for users, Client Credentials for server-to-server

### Sources Analyzed

- **Official Specifications**:
  - MCP Authorization: https://modelcontextprotocol.io/specification/2025-03-26/basic/authorization
  - OAuth 2.1: RFC 6749 (updated)
  - Resource Indicators: RFC 8707
  - Authorization Server Metadata: RFC 8414
  - PKCE: RFC 7636

- **Working Examples** (668 GitHub repositories analyzed):
  - Gmail MCP Server (TypeScript + Google OAuth) - Full production implementation
  - dust-tt/dust - MCP OAuth provider with session management
  - Cloudflare MCP with Descope Auth - Enterprise-grade implementation
  - mcp-auth/js SDK - Official auth library
  - asgardeo/mcp-auth-javascript - Complete OAuth middleware

- **Industry Resources**:
  - Auth0 MCP Security Update (June 2025)
  - Stytch OAuth for MCP Guide
  - Scalekit Implementation Guide
  - Microsoft .NET MCP SDK OAuth patterns

### Key Findings

1. **Standard Flow**: Authorization Code + PKCE is the industry standard for user authentication
2. **Token Management**: Short-lived access tokens (1 hour) with refresh tokens (30 days)
3. **Scope Design**: Map MCP tools/resources to OAuth scopes for fine-grained access control
4. **Session Storage**: Redis-backed sessions for scalability
5. **Security**: CSRF protection, rate limiting, token encryption at rest

---

## Current State Analysis

### Existing Codebase (`apps/mcp/`)

**Strengths**:
- ✅ Express-based HTTP server with middleware architecture
- ✅ MCP SDK integrated (`@modelcontextprotocol/sdk@1.19.1`)
- ✅ CORS middleware configured
- ✅ Environment configuration system
- ✅ Health check infrastructure
- ✅ Logging and metrics collection
- ✅ Docker containerization

**Gaps**:
- ❌ No OAuth implementation
- ❌ No token storage mechanism
- ❌ No protected resource metadata endpoint
- ❌ Auth middleware is placeholder (passthrough)
- ❌ No session management
- ❌ No Google OAuth integration

### Current File Structure

```
apps/mcp/
├── server/
│   ├── middleware/
│   │   ├── auth.ts          # ⚠️ Placeholder, needs implementation
│   │   ├── cors.ts          # ✅ Working
│   │   ├── metrics.ts       # ✅ Working
│   │   └── health.ts        # ✅ Working
│   ├── http.ts              # ✅ Express server setup
│   └── transport.ts         # ✅ MCP transport
├── config/
│   ├── environment.ts       # ✅ Env validation
│   └── health-checks.ts     # ✅ Health check runner
├── index.ts                 # ✅ Main entry point
└── package.json             # ⚠️ Needs OAuth dependencies
```

### Dependencies

**Current** (relevant to OAuth):
```json
{
  "@modelcontextprotocol/sdk": "^1.19.1",
  "express": "^4.21.2",
  "cors": "^2.8.5",
  "dotenv": "^17.2.3"
}
```

**To Add**:
```json
{
  "googleapis": "^134.0.0",
  "jsonwebtoken": "^9.0.2",
  "express-session": "^1.18.0",
  "connect-redis": "^7.1.0",
  "uuid": "^9.0.1"
}
```

---

## Architecture Overview

### OAuth Flow Diagram

```
┌─────────────────┐                                    ┌──────────────────┐
│                 │                                    │                  │
│  MCP Client     │                                    │  Google OAuth    │
│  (Claude, etc.) │                                    │  Authorization   │
│                 │                                    │  Server          │
└────────┬────────┘                                    └────────┬─────────┘
         │                                                      │
         │ 1. Request MCP endpoint (no token)                  │
         ├─────────────────────────────────────────┐           │
         │                                         ▼           │
         │                              ┌─────────────────────┐│
         │                              │                     ││
         │                              │  Pulse MCP Server   ││
         │                              │  (Resource Server)  ││
         │                              │                     ││
         │                              └──────────┬──────────┘│
         │ 2. 401 + auth URL                      │           │
         │◄───────────────────────────────────────┘           │
         │                                                     │
         │ 3. Redirect to /auth/google                        │
         ├────────────────────────────────────────┐           │
         │                                        ▼           │
         │                              ┌─────────────────────┐│
         │                              │ Generate PKCE       ││
         │                              │ code_verifier +     ││
         │                              │ code_challenge      ││
         │                              └──────────┬──────────┘│
         │                                         │           │
         │ 4. Redirect to Google with challenge   │           │
         │◄────────────────────────────────────────┘           │
         │                                                     │
         │ 5. Google OAuth authorization request              │
         ├─────────────────────────────────────────────────────►
         │                                                     │
         │ 6. User authenticates & consents                   │
         │                                                     │
         │ 7. Authorization code                              │
         │◄─────────────────────────────────────────────────────
         │                                                     │
         │ 8. Redirect to /auth/google/callback with code    │
         ├─────────────────────────────────────────┐          │
         │                                         ▼          │
         │                              ┌─────────────────────┐│
         │                              │ Verify PKCE         ││
         │                              │ code_verifier       ││
         │                              └──────────┬──────────┘│
         │                                         │           │
         │                             9. Exchange code for    │
         │                                tokens with verifier │
         │                              ───────────────────────►
         │                                         │           │
         │                             10. Access + refresh    │
         │                                tokens               │
         │                              ◄──────────────────────┤
         │                                         │           │
         │                              ┌──────────▼──────────┐│
         │                              │ Store tokens         ││
         │                              │ Create session       ││
         │                              │ Issue session cookie ││
         │                              └──────────┬──────────┘│
         │                                         │           │
         │ 11. Session cookie                     │           │
         │◄────────────────────────────────────────┘           │
         │                                                     │
         │ 12. Request MCP endpoint (with cookie)             │
         ├─────────────────────────────────────────┐          │
         │                                         ▼          │
         │                              ┌─────────────────────┐│
         │                              │ Validate token       ││
         │                              │ Check scopes         ││
         │                              │ Execute MCP tool     ││
         │                              └──────────┬──────────┘│
         │                                         │           │
         │ 13. MCP response                       │           │
         │◄────────────────────────────────────────┘           │
         │                                                     │
```

### Component Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                         Pulse MCP Server                           │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │                    HTTP/Express Layer                         │ │
│  └────────────────────────┬─────────────────────────────────────┘ │
│                           │                                        │
│  ┌────────────────────────▼─────────────────────────────────────┐ │
│  │                    Middleware Chain                           │ │
│  │                                                               │ │
│  │  1. CORS           ──────►  2. Session      ──────►          │ │
│  │                                                               │ │
│  │  3. Auth Validation ──────► 4. Metrics      ──────►          │ │
│  │                                                               │ │
│  │  5. Rate Limiting   ──────► 6. CSRF Protection               │ │
│  └────────────────────────┬─────────────────────────────────────┘ │
│                           │                                        │
│  ┌────────────────────────▼─────────────────────────────────────┐ │
│  │                    Route Handlers                             │ │
│  │                                                               │ │
│  │  • GET  /auth/google                   (OAuth initiation)    │ │
│  │  • GET  /auth/google/callback          (OAuth callback)      │ │
│  │  • POST /auth/logout                   (Session termination) │ │
│  │  • GET  /auth/status                   (Auth status check)   │ │
│  │  • GET  /.well-known/oauth-protected-resource (Metadata)     │ │
│  │  • POST /mcp                           (Protected MCP)        │ │
│  └────────────────────────┬─────────────────────────────────────┘ │
│                           │                                        │
│  ┌────────────────────────▼─────────────────────────────────────┐ │
│  │                    OAuth Services                             │ │
│  │                                                               │ │
│  │  ┌─────────────────┐   ┌─────────────────┐   ┌────────────┐ │ │
│  │  │ GoogleOAuth     │   │ TokenManager    │   │ PKCE       │ │ │
│  │  │ Client          │   │                 │   │ Helper     │ │ │
│  │  └─────────────────┘   └─────────────────┘   └────────────┘ │ │
│  │                                                               │ │
│  │  ┌─────────────────┐   ┌─────────────────┐   ┌────────────┐ │ │
│  │  │ SessionManager  │   │ ScopeValidator  │   │ Audit      │ │ │
│  │  │                 │   │                 │   │ Logger     │ │ │
│  │  └─────────────────┘   └─────────────────┘   └────────────┘ │ │
│  └────────────────────────┬─────────────────────────────────────┘ │
│                           │                                        │
│  ┌────────────────────────▼─────────────────────────────────────┐ │
│  │                    Storage Layer                              │ │
│  │                                                               │ │
│  │  ┌─────────────────┐   ┌─────────────────┐   ┌────────────┐ │ │
│  │  │ Redis           │   │ PostgreSQL      │   │ Filesystem │ │ │
│  │  │ (Sessions)      │   │ (Tokens)        │   │ (Dev Only) │ │ │
│  │  └─────────────────┘   └─────────────────┘   └────────────┘ │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

### File Structure (After Implementation)

```
apps/mcp/
├── server/
│   ├── middleware/
│   │   ├── auth.ts              # ✨ OAuth token validation
│   │   ├── session.ts           # ✨ Session management
│   │   ├── csrf.ts              # ✨ CSRF protection
│   │   ├── rateLimit.ts         # ✨ Rate limiting
│   │   ├── cors.ts              # ✅ Existing
│   │   └── ...
│   ├── oauth/
│   │   ├── google-client.ts     # ✨ Google OAuth2 client
│   │   ├── pkce.ts              # ✨ PKCE helper functions
│   │   ├── token-manager.ts     # ✨ Token storage & refresh
│   │   ├── scope-validator.ts   # ✨ Scope checking logic
│   │   └── types.ts             # ✨ OAuth type definitions
│   ├── storage/
│   │   ├── token-store.ts       # ✨ Token storage interface
│   │   ├── redis-store.ts       # ✨ Redis implementation
│   │   └── fs-store.ts          # ✨ Filesystem (dev)
│   ├── routes/
│   │   ├── auth.ts              # ✨ Auth endpoints
│   │   └── metadata.ts          # ✨ OAuth metadata
│   └── ...
├── config/
│   ├── oauth.ts                 # ✨ OAuth configuration
│   └── ...
└── tests/
    ├── oauth/
    │   ├── google-client.test.ts
    │   ├── pkce.test.ts
    │   └── token-manager.test.ts
    └── integration/
        └── oauth-flow.test.ts
```

---

## Implementation Phases

### Phase 1: Core OAuth Infrastructure

**Goal**: Set up the foundational OAuth components and dependencies

**Tasks**:
1. **Update Dependencies** (`package.json`)
   ```json
   {
     "googleapis": "^134.0.0",
     "jsonwebtoken": "^9.0.2",
     "express-session": "^1.18.0",
     "connect-redis": "^7.1.0",
     "uuid": "^9.0.1"
   }
   ```

2. **Create OAuth Configuration Module** (`server/config/oauth.ts`)
   - Environment variable validation
   - Google OAuth client configuration
   - Token expiry settings
   - Scope definitions

3. **Implement PKCE Helper** (`server/oauth/pkce.ts`)
   - Generate code_verifier (cryptographically secure random string)
   - Generate code_challenge (SHA-256 hash of verifier)
   - Store verifier temporarily (Redis or memory)
   - Verify code_verifier on callback

4. **Create Token Storage Interface** (`server/storage/token-store.ts`)
   - Define storage contract
   - Methods: `save()`, `get()`, `delete()`, `refresh()`
   - Support for both filesystem and database

5. **Implement Storage Backends**
   - **Filesystem Store** (`server/storage/fs-store.ts`) - Dev only
   - **Redis Store** (`server/storage/redis-store.ts`) - Production

**Deliverables**:
- ✅ Updated `package.json` with OAuth dependencies
- ✅ OAuth configuration module with env validation
- ✅ PKCE helper with tests
- ✅ Token storage interface and implementations
- ✅ Unit tests for PKCE and storage

**Validation**:
```bash
pnpm install
pnpm typecheck
pnpm test server/oauth/pkce.test.ts
pnpm test server/storage/token-store.test.ts
```

---

### Phase 2: Authentication Endpoints

**Goal**: Implement OAuth flow endpoints

**Tasks**:
1. **Google OAuth Client** (`server/oauth/google-client.ts`)
   - Initialize Google OAuth2 client with credentials
   - Generate authorization URL with PKCE challenge
   - Exchange authorization code for tokens
   - Refresh access tokens
   - Revoke tokens on logout

2. **Token Manager** (`server/oauth/token-manager.ts`)
   - Store tokens securely (encrypted at rest)
   - Retrieve tokens by user/session ID
   - Automatic refresh on expiry
   - Token revocation

3. **Auth Routes** (`server/routes/auth.ts`)
   - **`GET /auth/google`**
     - Generate PKCE code_verifier and code_challenge
     - Store code_verifier in session
     - Build Google OAuth URL with challenge
     - Redirect user to Google

   - **`GET /auth/google/callback`**
     - Retrieve code_verifier from session
     - Exchange authorization code for tokens (with verifier)
     - Validate token response
     - Store tokens securely
     - Create authenticated session
     - Redirect to success page or return token info

   - **`POST /auth/logout`**
     - Revoke access and refresh tokens
     - Destroy session
     - Clear cookies
     - Return 200 OK

   - **`GET /auth/status`**
     - Check if user is authenticated
     - Return token expiry info
     - Return granted scopes

4. **Session Middleware** (`server/middleware/session.ts`)
   - Configure express-session with Redis store
   - Set secure cookie options (httpOnly, secure, sameSite)
   - Session expiry aligned with token expiry

**Deliverables**:
- ✅ Google OAuth2 client wrapper
- ✅ Token manager with encryption
- ✅ Complete auth routes
- ✅ Session middleware
- ✅ Integration tests for OAuth flow

**Validation**:
```bash
# Start server with OAuth enabled
OAUTH_ENABLED=true pnpm dev

# Test OAuth flow
curl http://localhost:50107/auth/google
# Should redirect to Google OAuth consent screen

# After callback (manual test with browser)
curl -b cookies.txt http://localhost:50107/auth/status
# Should show authenticated status

pnpm test server/routes/auth.test.ts
```

---

### Phase 3: Protected Resource Metadata

**Goal**: Implement MCP-compliant metadata endpoints

**Tasks**:
1. **Metadata Route** (`server/routes/metadata.ts`)
   - **`GET /.well-known/oauth-protected-resource`**
     ```json
     {
       "resource": "https://pulse-mcp.local",
       "authorization_servers": [
         "https://accounts.google.com"
       ],
       "scopes_supported": [
         "openid",
         "email",
         "profile",
         "mcp:scrape",
         "mcp:crawl",
         "mcp:extract"
       ],
       "bearer_methods_supported": [
         "header",
         "body"
       ],
       "resource_signing_alg_values_supported": [
         "RS256"
       ]
     }
     ```

2. **Scope Definitions** (`server/oauth/scopes.ts`)
   - Define MCP tool → OAuth scope mappings
   - `mcp:scrape` - Access to scraping tools
   - `mcp:crawl` - Access to crawling tools
   - `mcp:extract` - Access to extraction tools
   - `mcp:admin` - Administrative access

3. **Authorization Server Metadata** (Optional)
   - If hosting own auth server, implement `/.well-known/oauth-authorization-server`
   - For Google OAuth, not needed (Google provides this)

**Deliverables**:
- ✅ Protected resource metadata endpoint
- ✅ Scope definitions and mappings
- ✅ Metadata validation tests

**Validation**:
```bash
curl http://localhost:50107/.well-known/oauth-protected-resource
# Should return valid JSON metadata

pnpm test server/routes/metadata.test.ts
```

---

### Phase 4: Token Validation Middleware

**Goal**: Secure MCP endpoints with token validation

**Tasks**:
1. **Update Auth Middleware** (`server/middleware/auth.ts`)
   - Extract Bearer token from Authorization header
   - Validate token format (JWT)
   - Verify token signature
   - Check token expiration
   - Verify token audience (Resource Indicator)
   - Extract user info and scopes
   - Attach user context to request

2. **Scope Validator** (`server/oauth/scope-validator.ts`)
   - Map MCP tool names to required scopes
   - Validate user has required scopes
   - Return 403 Forbidden if scopes insufficient

3. **Token Refresh Logic**
   - Intercept 401 responses
   - Attempt token refresh if refresh token available
   - Retry request with new access token
   - Return 401 if refresh fails

4. **Apply to MCP Endpoint**
   - Protect `POST /mcp` with auth middleware
   - Add scope validation for specific tools
   - Add rate limiting per user

**Deliverables**:
- ✅ Complete auth middleware implementation
- ✅ Scope validator
- ✅ Token refresh mechanism
- ✅ Protected MCP endpoint
- ✅ Middleware integration tests

**Validation**:
```bash
# Test without token
curl -X POST http://localhost:50107/mcp
# Should return 401 Unauthorized

# Test with invalid token
curl -X POST http://localhost:50107/mcp \
  -H "Authorization: Bearer invalid"
# Should return 401 Unauthorized

# Test with valid token (from /auth/status)
curl -X POST http://localhost:50107/mcp \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
# Should return MCP tools list

pnpm test server/middleware/auth.test.ts
```

---

### Phase 5: Environment Configuration

**Goal**: Add OAuth configuration to environment system

**Tasks**:
1. **Update Environment Schema** (`config/environment.ts`)
   - Add Google OAuth variables with validation
   - Add OAuth feature flag
   - Add token expiry settings
   - Validate required variables when OAuth enabled

2. **Update `.env.example`**
   ```env
   # ============================================================================
   # OAuth Configuration (Google)
   # ============================================================================
   
   # Enable OAuth authentication for MCP endpoints
   OAUTH_ENABLED=false
   
   # Google OAuth Credentials (from Google Cloud Console)
   # https://console.cloud.google.com/apis/credentials
   GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=GOCSPX-your-client-secret
   GOOGLE_REDIRECT_URI=http://localhost:50107/auth/google/callback
   
   # OAuth Scopes (comma-separated)
   # Standard: openid,email,profile
   # Custom MCP scopes can be added: mcp:scrape,mcp:crawl
   GOOGLE_OAUTH_SCOPES=openid,email,profile
   
   # Session Configuration
   # Generate with: openssl rand -hex 32
   OAUTH_SESSION_SECRET=your-32-byte-hex-secret-here
   
   # Token Expiry (seconds)
   OAUTH_TOKEN_EXPIRY=3600              # 1 hour
   OAUTH_REFRESH_TOKEN_EXPIRY=2592000   # 30 days
   
   # MCP Resource Server Identification
   MCP_RESOURCE_IDENTIFIER=https://pulse-mcp.local
   MCP_AUTHORIZATION_SERVER=https://accounts.google.com
   
   # Redis for session storage (required for OAuth)
   REDIS_URL=redis://pulse_redis:6379
   ```

3. **Update Health Checks** (`config/health-checks.ts`)
   - Add OAuth configuration validation
   - Check Google OAuth credentials (connectivity)
   - Verify Redis connection (if OAuth enabled)
   - Test token encryption/decryption

4. **Update Startup Display** (`server/startup/display.ts`)
   - Show OAuth enabled/disabled status
   - Display configured redirect URI
   - Show OAuth endpoints in startup banner

**Deliverables**:
- ✅ Environment schema with OAuth variables
- ✅ Updated `.env.example`
- ✅ OAuth health checks
- ✅ Enhanced startup banner

**Validation**:
```bash
# Test with invalid config
OAUTH_ENABLED=true pnpm dev
# Should fail health check and show error

# Test with valid config
OAUTH_ENABLED=true \
GOOGLE_CLIENT_ID=test.apps.googleusercontent.com \
GOOGLE_CLIENT_SECRET=test-secret \
GOOGLE_REDIRECT_URI=http://localhost:50107/auth/google/callback \
OAUTH_SESSION_SECRET=$(openssl rand -hex 32) \
pnpm dev
# Should start successfully with OAuth enabled

pnpm test config/health-checks.test.ts
```

---

### Phase 6: Documentation & Testing

**Goal**: Complete documentation and comprehensive testing

**Tasks**:
1. **User Documentation**
   - **OAuth Setup Guide** (`.docs/oauth-setup.md`)
     - Google Cloud Console setup instructions
     - Creating OAuth 2.0 credentials
     - Configuring consent screen
     - Setting up redirect URIs
     - Environment variable configuration
     - Testing the OAuth flow

   - **API Documentation** (`.docs/api/auth-endpoints.md`)
     - Endpoint descriptions
     - Request/response examples
     - Error codes and meanings
     - Rate limiting information

   - **Security Guide** (`.docs/security/oauth-security.md`)
     - Best practices
     - Token storage recommendations
     - PKCE flow explanation
     - Scope management
     - Common pitfalls

2. **Developer Documentation**
   - **Architecture Overview** (`.docs/architecture/oauth.md`)
     - Component diagrams
     - Sequence diagrams
     - Data flow diagrams
     - Integration points

   - **Testing Guide** (`.docs/development/oauth-testing.md`)
     - Local testing setup
     - Mock OAuth server
     - Integration test patterns
     - E2E testing with Playwright

3. **Unit Tests**
   - PKCE helper tests
   - Token manager tests
   - Scope validator tests
   - Storage backend tests
   - Middleware tests

4. **Integration Tests**
   - Complete OAuth flow
   - Token refresh flow
   - Logout flow
   - Error scenarios (invalid token, expired token, etc.)
   - Scope validation

5. **E2E Tests** (Optional, using Playwright)
   - Full browser-based OAuth flow
   - Google OAuth consent screen
   - Callback handling
   - Protected endpoint access

**Deliverables**:
- ✅ Complete user documentation
- ✅ Developer documentation
- ✅ API documentation
- ✅ Unit test coverage >80%
- ✅ Integration tests for all flows
- ✅ E2E tests (optional)

**Validation**:
```bash
# Run all tests
pnpm test

# Generate coverage report
pnpm test:coverage

# Run integration tests
pnpm test:integration

# Run E2E tests
pnpm test:e2e
```

---

### Phase 7: Security Hardening

**Goal**: Implement production-ready security features

**Tasks**:
1. **CSRF Protection** (`server/middleware/csrf.ts`)
   - Generate CSRF tokens
   - Validate tokens on state-changing requests
   - Integrate with OAuth flow (state parameter)

2. **Rate Limiting** (`server/middleware/rateLimit.ts`)
   - Limit auth endpoint requests (prevent brute force)
   - Separate limits for different endpoints:
     - `/auth/google`: 5 requests/minute per IP
     - `/auth/google/callback`: 10 requests/minute per IP
     - `/mcp`: 100 requests/minute per user
   - Redis-backed rate limiting for distributed systems

3. **Token Encryption**
   - Encrypt tokens at rest in database/filesystem
   - Use strong encryption (AES-256-GCM)
   - Key derivation from environment secret
   - Secure key storage (never in code)

4. **Audit Logging** (`server/oauth/audit-logger.ts`)
   - Log all auth events:
     - Successful/failed login attempts
     - Token refresh events
     - Scope changes
     - Logout events
     - Admin actions
   - Include timestamp, user ID, IP, user agent
   - Store in separate audit log (PostgreSQL)

5. **Token Revocation**
   - Endpoint to revoke tokens
   - Revoke on password change
   - Revoke on security incidents
   - Token blacklist (Redis)

6. **Security Headers**
   - Add security headers to all responses:
     - `Strict-Transport-Security`
     - `X-Content-Type-Options`
     - `X-Frame-Options`
     - `X-XSS-Protection`
     - `Content-Security-Policy`

**Deliverables**:
- ✅ CSRF protection middleware
- ✅ Rate limiting middleware
- ✅ Token encryption implementation
- ✅ Audit logging system
- ✅ Token revocation mechanism
- ✅ Security headers
- ✅ Security hardening tests

**Validation**:
```bash
# Test CSRF protection
curl -X POST http://localhost:50107/auth/logout
# Should return 403 Forbidden (missing CSRF token)

# Test rate limiting
for i in {1..10}; do
  curl http://localhost:50107/auth/google
done
# Should return 429 Too Many Requests after 5 attempts

# Test security headers
curl -I http://localhost:50107/health
# Should include security headers

pnpm test server/middleware/csrf.test.ts
pnpm test server/middleware/rateLimit.test.ts
pnpm test server/oauth/audit-logger.test.ts
```

---

## Technical Specifications

### Token Format

**Access Token** (JWT):
```json
{
  "iss": "https://accounts.google.com",
  "sub": "1234567890",
  "aud": "https://pulse-mcp.local",
  "exp": 1699999999,
  "iat": 1699996399,
  "email": "user@example.com",
  "email_verified": true,
  "scope": "openid email profile mcp:scrape"
}
```

**Refresh Token** (Opaque):
```
1//0gAbCdEfGhIjKlMnOpQrStUvWxYz...
```

### Storage Schema

**Token Store** (PostgreSQL):
```sql
CREATE TABLE oauth_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    token_type VARCHAR(50) DEFAULT 'Bearer',
    expires_at TIMESTAMP NOT NULL,
    scopes TEXT[],
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id)
);

CREATE INDEX idx_oauth_tokens_user_id ON oauth_tokens(user_id);
CREATE INDEX idx_oauth_tokens_expires_at ON oauth_tokens(expires_at);
```

**Audit Log** (PostgreSQL):
```sql
CREATE TABLE oauth_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255),
    event_type VARCHAR(100) NOT NULL,
    event_data JSONB,
    ip_address INET,
    user_agent TEXT,
    success BOOLEAN DEFAULT true,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_oauth_audit_user_id ON oauth_audit_log(user_id);
CREATE INDEX idx_oauth_audit_created_at ON oauth_audit_log(created_at);
CREATE INDEX idx_oauth_audit_event_type ON oauth_audit_log(event_type);
```

**Session Store** (Redis):
```
sess:${SESSION_ID} -> {
  user_id: string,
  email: string,
  scopes: string[],
  code_verifier: string (temporary, during OAuth flow),
  csrf_token: string,
  created_at: number,
  last_activity: number
}
```

**Rate Limit Store** (Redis):
```
rl:ip:${IP_ADDRESS}:${ENDPOINT} -> count (TTL: 60s)
rl:user:${USER_ID}:${ENDPOINT} -> count (TTL: 60s)
```

### API Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/auth/google` | GET | No | Initiate OAuth flow |
| `/auth/google/callback` | GET | No | OAuth callback handler |
| `/auth/logout` | POST | Yes | Logout and revoke tokens |
| `/auth/status` | GET | Yes | Check auth status |
| `/auth/refresh` | POST | Yes | Refresh access token |
| `/.well-known/oauth-protected-resource` | GET | No | Protected resource metadata |
| `/mcp` | POST | Yes | MCP endpoint (protected) |

### Error Responses

**401 Unauthorized**:
```json
{
  "error": "unauthorized",
  "error_description": "Access token is missing or invalid",
  "www_authenticate": "Bearer realm=\"pulse-mcp\", error=\"invalid_token\""
}
```

**403 Forbidden**:
```json
{
  "error": "insufficient_scope",
  "error_description": "The access token does not have the required scope: mcp:scrape",
  "required_scopes": ["mcp:scrape"]
}
```

**429 Too Many Requests**:
```json
{
  "error": "rate_limit_exceeded",
  "error_description": "Too many requests. Please try again later.",
  "retry_after": 60
}
```

---

## Security Considerations

### Threat Model

1. **Token Theft**
   - **Threat**: Attacker intercepts or steals access token
   - **Mitigation**: Short-lived tokens (1 hour), HTTPS only, httpOnly cookies, token encryption at rest

2. **CSRF Attacks**
   - **Threat**: Attacker tricks user into making unwanted requests
   - **Mitigation**: CSRF tokens, SameSite cookie attribute, state parameter in OAuth flow

3. **Token Replay**
   - **Threat**: Attacker reuses captured token
   - **Mitigation**: Short token lifetime, token binding (optional), audience validation

4. **Scope Escalation**
   - **Threat**: User gains access to unauthorized resources
   - **Mitigation**: Strict scope validation, least privilege principle, scope mapping

5. **Brute Force**
   - **Threat**: Attacker attempts to guess credentials or tokens
   - **Mitigation**: Rate limiting, account lockout, exponential backoff

6. **Session Hijacking**
   - **Threat**: Attacker steals session cookie
   - **Mitigation**: Secure cookies, httpOnly, SameSite, session rotation

### Security Checklist

- [ ] HTTPS enforced in production
- [ ] httpOnly and Secure flags on cookies
- [ ] SameSite cookie attribute set
- [ ] CSRF protection enabled
- [ ] Rate limiting configured
- [ ] Token encryption at rest
- [ ] Audit logging enabled
- [ ] Security headers configured
- [ ] Input validation on all endpoints
- [ ] SQL injection prevention (parameterized queries)
- [ ] XSS prevention (input sanitization)
- [ ] Secrets not in code or logs
- [ ] Token revocation mechanism
- [ ] Session timeout configured
- [ ] PKCE implemented correctly

---

## Testing Strategy

### Unit Tests

**Coverage Target**: 80%+

**Test Categories**:
1. PKCE Helper
   - Code verifier generation (format, length, entropy)
   - Code challenge generation (SHA-256 correctness)
   - Storage and retrieval

2. Token Manager
   - Token storage and retrieval
   - Token encryption/decryption
   - Token refresh logic
   - Token revocation

3. Scope Validator
   - Scope parsing
   - Scope matching
   - Tool-to-scope mapping

4. Middleware
   - Auth middleware (token validation)
   - CSRF middleware (token generation/validation)
   - Rate limiting (limit enforcement, Redis integration)

### Integration Tests

**Test Scenarios**:
1. Complete OAuth Flow
   - Start: User visits `/auth/google`
   - Middle: Redirect to Google (mocked), callback with code
   - End: Token exchange, session creation, authenticated state

2. Token Refresh Flow
   - Start: Access token expired
   - Middle: Automatic refresh with refresh token
   - End: New access token, updated expiry

3. Logout Flow
   - Start: Authenticated user
   - Middle: POST to `/auth/logout`
   - End: Tokens revoked, session destroyed

4. Protected Endpoint Access
   - Start: Authenticated user with token
   - Middle: POST to `/mcp` with valid token
   - End: MCP response

5. Insufficient Scope
   - Start: User with limited scopes
   - Middle: Request tool requiring higher scope
   - End: 403 Forbidden response

### E2E Tests (Optional)

**Using Playwright**:
1. Full Browser OAuth Flow
   - Open `/auth/google`
   - Google consent screen appears
   - User clicks "Allow"
   - Redirect to app, authenticated

2. Token Expiry and Refresh
   - Simulate time passing (mock)
   - Token expires mid-session
   - Automatic refresh triggers
   - User stays authenticated

---

## Deployment Guide

### Prerequisites

1. **Google Cloud Console**
   - Create project
   - Enable Google+ API
   - Create OAuth 2.0 credentials
   - Configure consent screen
   - Add authorized redirect URIs

2. **Infrastructure**
   - PostgreSQL database
   - Redis instance
   - SSL certificate (production)

### Deployment Steps

1. **Configure Environment**
   ```bash
   # Copy example
   cp .env.example .env
   
   # Generate session secret
   export OAUTH_SESSION_SECRET=$(openssl rand -hex 32)
   
   # Set Google credentials
   export GOOGLE_CLIENT_ID=your-id.apps.googleusercontent.com
   export GOOGLE_CLIENT_SECRET=your-secret
   export GOOGLE_REDIRECT_URI=https://your-domain.com/auth/google/callback
   
   # Enable OAuth
   export OAUTH_ENABLED=true
   ```

2. **Database Migration**
   ```bash
   # Run migrations
   pnpm migrate:up
   
   # Verify tables created
   psql $DATABASE_URL -c "\dt oauth_*"
   ```

3. **Build and Start**
   ```bash
   # Install dependencies
   pnpm install
   
   # Build
   pnpm build
   
   # Start server
   pnpm start
   ```

4. **Verify Deployment**
   ```bash
   # Check health
   curl https://your-domain.com/health
   
   # Check OAuth metadata
   curl https://your-domain.com/.well-known/oauth-protected-resource
   
   # Test OAuth flow (browser)
   open https://your-domain.com/auth/google
   ```

### Docker Deployment

```dockerfile
# Update Dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install
COPY . .
RUN pnpm build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 50107
CMD ["node", "dist/index.js"]
```

```yaml
# docker-compose.yaml
services:
  pulse_mcp:
    build: ./apps/mcp
    ports:
      - "50107:50107"
    environment:
      - OAUTH_ENABLED=true
      - GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
      - GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}
      - GOOGLE_REDIRECT_URI=${GOOGLE_REDIRECT_URI}
      - OAUTH_SESSION_SECRET=${OAUTH_SESSION_SECRET}
      - REDIS_URL=redis://pulse_redis:6379
      - DATABASE_URL=${DATABASE_URL}
    depends_on:
      - pulse_redis
      - pulse_postgres
```

---

## Rollback Plan

### Rollback Triggers

- OAuth health checks failing consistently
- High error rate in auth endpoints (>5%)
- Database connection issues
- Redis unavailability
- Token validation failures affecting >10% of requests

### Rollback Procedure

1. **Disable OAuth** (Immediate)
   ```bash
   # Set environment variable
   export OAUTH_ENABLED=false
   
   # Restart server
   docker-compose restart pulse_mcp
   ```

2. **Revert Code** (If needed)
   ```bash
   # Checkout previous version
   git checkout <previous-commit-hash>
   
   # Rebuild
   pnpm build
   
   # Restart
   pnpm start
   ```

3. **Database Rollback** (If needed)
   ```bash
   # Rollback migrations
   pnpm migrate:down
   
   # Verify
   psql $DATABASE_URL -c "\dt oauth_*"
   # Should show no oauth_* tables
   ```

4. **Cleanup** (Post-rollback)
   - Clear Redis session data
   - Notify users of auth issues
   - Investigate root cause
   - Fix issues in separate branch
   - Test thoroughly before re-deployment

### Monitoring Post-Rollback

- Monitor error logs for auth-related errors
- Check application metrics (response times, error rates)
- Verify MCP functionality without OAuth
- Gather feedback from users

---

## Timeline and Milestones

### Phase-by-Phase Timeline

| Phase | Duration | Deliverables | Dependencies |
|-------|----------|--------------|--------------|
| Phase 1: Core Infrastructure | 0.5 days | OAuth config, PKCE, storage | None |
| Phase 2: Auth Endpoints | 1 day | Auth routes, token manager | Phase 1 |
| Phase 3: Metadata | 0.5 days | Metadata endpoints | Phase 1 |
| Phase 4: Token Validation | 1 day | Auth middleware, scope validation | Phase 2, 3 |
| Phase 5: Environment Config | 0.5 days | Env vars, health checks | Phase 1-4 |
| Phase 6: Documentation & Testing | 1 day | Docs, tests | Phase 1-5 |
| Phase 7: Security Hardening | 0.5 days | CSRF, rate limiting, audit log | Phase 1-6 |

**Total Estimated Duration**: 5 days

### Milestones

- **M1** (End of Phase 2): OAuth flow working end-to-end
- **M2** (End of Phase 4): MCP endpoints protected with OAuth
- **M3** (End of Phase 6): Production-ready with tests and docs
- **M4** (End of Phase 7): Security-hardened and audit-ready

---

## Success Criteria

### Functional Requirements

- ✅ Users can authenticate via Google OAuth
- ✅ OAuth flow uses PKCE for security
- ✅ Access tokens are validated on MCP requests
- ✅ Scopes are enforced per tool/resource
- ✅ Tokens are refreshed automatically
- ✅ Users can logout and revoke tokens
- ✅ Protected resource metadata endpoint exposed
- ✅ Auth works with Docker deployment

### Non-Functional Requirements

- ✅ Unit test coverage >80%
- ✅ Integration tests for all flows
- ✅ Documentation complete and accurate
- ✅ Response time <200ms for token validation
- ✅ Rate limiting prevents abuse
- ✅ Audit logging captures all auth events
- ✅ CSRF protection on state-changing endpoints
- ✅ Tokens encrypted at rest
- ✅ Production deployment successful
- ✅ Rollback plan tested

---

## Appendix

### References

1. **MCP Specification**
   - Authorization: https://modelcontextprotocol.io/specification/2025-03-26/basic/authorization
   - Core Protocol: https://modelcontextprotocol.io/specification/2025-03-26

2. **OAuth 2.1 RFCs**
   - OAuth 2.1: RFC 6749 (updated)
   - PKCE: RFC 7636
   - Resource Indicators: RFC 8707
   - Authorization Server Metadata: RFC 8414

3. **Google OAuth Documentation**
   - Overview: https://developers.google.com/identity/protocols/oauth2
   - Server-side Flow: https://developers.google.com/identity/protocols/oauth2/web-server

4. **Security Guidelines**
   - OWASP OAuth Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/OAuth2_Cheat_Sheet.html
   - OAuth Security Best Practices: RFC 8252

### Glossary

- **PKCE**: Proof Key for Code Exchange - Security extension for OAuth preventing authorization code interception
- **Resource Indicator**: URI identifying the protected resource (RFC 8707)
- **Scope**: Permission string defining access level
- **Bearer Token**: Access token transmitted in Authorization header
- **Refresh Token**: Long-lived token used to obtain new access tokens
- **CSRF**: Cross-Site Request Forgery - Attack forcing users to execute unwanted actions
- **JWT**: JSON Web Token - Compact, URL-safe token format
- **Opaque Token**: Token with no intrinsic meaning, validated via lookup

### FAQ

**Q: Why PKCE if we're using a confidential client?**  
A: PKCE is now recommended for all OAuth flows, even confidential clients, as an additional security layer. The MCP 2025-03-26 spec mandates it.

**Q: Can we use other OAuth providers besides Google?**  
A: Yes, the architecture is provider-agnostic. Add new providers by implementing the OAuth client interface.

**Q: What happens if Redis goes down?**  
A: Sessions will fail, but you can fall back to in-memory session store (not recommended for production). Consider Redis clustering for HA.

**Q: How do we handle token expiry during long-running MCP operations?**  
A: Implement automatic token refresh in the client. The server will return 401 if the token expires mid-operation, triggering a refresh.

**Q: Can we use this with stdio transport?**  
A: No, OAuth is only for HTTP transport. Stdio transport should use environment-based authentication (API keys).

---

**End of Implementation Plan**