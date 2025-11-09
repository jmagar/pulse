# Archaeological Finding: Google AuthSub and ClientLogin (2005-2015)

**Period:** 2005-2015
**Status:** Deprecated April 20, 2012; Shut down April 20, 2015
**Predecessor to:** OAuth 2.0
**Research Date:** 2025-11-06

## Historical Context

Before OAuth became the standard, Google developed its own proprietary authentication mechanisms for accessing Google Data APIs (Gmail, Calendar, Drive, etc.). These systems represent the "pre-history" of modern delegated authorization.

### Timeline of Google Authentication Evolution

```
2005 ─────── ClientLogin introduced (username/password in app)
2006 ─────── AuthSub introduced (browser-based delegation)
2007 ─────── OAuth 1.0 released (industry standard emerges)
2008 ─────── Google begins OAuth 1.0 adoption
2012 ─────── AuthSub & ClientLogin deprecated (April 20)
2012 ─────── OAuth 2.0 published (RFC 6749, October)
2015 ─────── AuthSub & ClientLogin shut down (April 20)
2023 ─────── OAuth 2.0 dominant, OpenID Connect widespread
```

## ClientLogin: The Dark Ages (2005-2012)

### What It Was

ClientLogin was Google's original authentication API where **applications collected usernames and passwords directly**, then exchanged them for auth tokens with Google servers.

### The Technical Pattern

```http
POST https://www.google.com/accounts/ClientLogin HTTP/1.1
Content-Type: application/x-www-form-urlencoded

accountType=HOSTED_OR_GOOGLE
&Email=user@example.com
&Passwd=user_password
&service=cl  # Calendar service identifier
&source=CompanyName-ApplicationName-Version
```

**Response on Success:**

```
SID=DQAAAGgA...7Zg8CTN
LSID=DQAAAGsA...lk8BBbG
Auth=DQAAAGgA...dk3fA5N  ← This token used for API calls
```

**API Request with Token:**

```http
GET https://www.google.com/calendar/feeds/default/private/full HTTP/1.1
Authorization: GoogleLogin auth=DQAAAGgA...dk3fA5N
```

### Why It Existed

**Problem Space (2005):**

- No industry standard for API authentication
- Web applications needed to access Google services
- Users wanted native desktop apps (Outlook sync, etc.)
- OAuth didn't exist yet

**What It Solved:**

- Single sign-on across Google services
- Token-based authentication (better than sending password every time)
- Service-specific scoping (tokens were per-service)

### Why It Was Terrible

#### 1. **Password Harvesting Paradise**

Applications had access to user's **actual Google password**:

```javascript
// Desktop app code (C# example from 2008)
string username = txtUsername.Text;
string password = txtPassword.Text;  // ⚠️ PLAINTEXT PASSWORD IN MEMORY

// Send to Google
var request = new ClientLoginRequest(username, password, "calendar");
var token = authService.GetToken(request);
```

**Security Nightmares:**

- Malicious apps could steal passwords
- Apps could access ALL Google services (not just Calendar)
- Password changes required updating every app
- No way for users to revoke access to specific app
- Phishing became trivial (fake login screens)

#### 2. **No Granular Permissions**

Once an app had your password, it could:

- Access any Google service
- Change your password
- Delete your account
- No way to limit scope

#### 3. **Two-Factor Authentication Impossible**

ClientLogin predated 2FA:

- 2FA requires interactive challenge-response
- No way to handle CAPTCHA or SMS codes
- When Google added 2FA (2011), ClientLogin users had to use "app-specific passwords" (security workaround)

#### 4. **Password Storage Requirements**

Apps often stored passwords locally:

```xml
<!-- Config file from typical 2008 desktop app -->
<configuration>
  <googleCredentials>
    <username>user@gmail.com</username>
    <password>base64encodedpassword</password>  <!-- ⚠️ -->
  </googleCredentials>
</configuration>
```

Even with encryption, this was fundamentally insecure.

### When It Was Actually Useful

**Legitimate Use Cases (2005-2008):**

1. **Corporate Internal Tools**
   - Google Apps for Business (now Workspace)
   - Internal migration scripts
   - Admin tools managing multiple accounts
   - **Why it worked:** Trusted environment, single organization

2. **Command-Line Tools**
   - System administrators automating tasks
   - Batch processing scripts
   - Server-side integrations
   - **Why it worked:** No browser available, trusted server environment

3. **Early Mobile Apps**
   - Pre-smartphone era (BlackBerry, Windows Mobile)
   - No reliable browser redirect mechanisms
   - Native UI for login was better UX
   - **Why it worked:** Limited alternatives, pre-OAuth mobile patterns

### Migration Path (2012-2015)

Google's deprecation notice:

```
"ClientLogin has been deprecated since April 20, 2012.
All ClientLogin requests will fail starting April 20, 2015.
Migrate to OAuth 2.0 immediately."
```

**Migration Options Provided:**

1. **OAuth 2.0 (recommended)** - User authorizes in browser
2. **Service Accounts** - Server-to-server, no user interaction
3. **App-Specific Passwords** - Temporary workaround for legacy apps

**Migration Pain Points:**

- **No automatic migration** - Complete rewrite required
- **UI changes needed** - Browser pop-up vs native login form
- **Token storage different** - Refresh tokens vs long-lived passwords
- **User re-consent required** - Everyone had to re-authorize

## AuthSub: The Enlightenment (2006-2012)

### What It Was

AuthSub was Google's **proprietary** browser-based delegated authorization protocol—basically "OAuth before OAuth."

### The Technical Pattern

**Step 1: Redirect to Google for Authorization**

```
https://www.google.com/accounts/AuthSubRequest
  ?next=http://www.example.com/callback
  &scope=http://www.google.com/calendar/feeds/
  &secure=0
  &session=1
```

**Step 2: User Approves, Redirected Back**

```
http://www.example.com/callback?token=CKF50YzIHxCTKMAg
```

**Step 3: Exchange Single-Use Token for Session Token**

```http
GET https://www.google.com/accounts/AuthSubSessionToken HTTP/1.1
Authorization: AuthSub token="CKF50YzIHxCTKMAg"
```

**Response:**

```
Token=GD32CMCL25aZ-v____8B
```

**Step 4: Use Session Token for API Calls**

```http
GET https://www.google.com/calendar/feeds/default/private/full HTTP/1.1
Authorization: AuthSub token="GD32CMCL25aZ-v____8B"
```

### Why It Was Better Than ClientLogin

✅ **Password never shared with application**
✅ **User grants permission in Google's UI** (harder to phish)
✅ **Scope-limited access** (only requested services)
✅ **Revocable tokens** (user could revoke via Google Account settings)
✅ **Worked with 2FA** (Google handled authentication)

### Why It Still Wasn't Great

#### 1. **Google-Only Protocol**

AuthSub only worked with Google services:

- No industry standard
- Couldn't be used with Facebook, Twitter, etc.
- Apps needed different auth systems for each provider
- No shared libraries or best practices

#### 2. **Callback URL Limitations**

```javascript
// Problem: Native desktop apps couldn't receive HTTP callbacks
const authUrl = `https://www.google.com/accounts/AuthSubRequest
  ?next=http://localhost:8080/callback  // ⚠️ Requires local HTTP server
  &scope=http://www.google.com/calendar/feeds/
  &session=1`;
```

**Workarounds:**

- Run local HTTP server (complex for users)
- Use "installed application" flow (manual token copying)
- Neither was great UX

#### 3. **No Refresh Token Concept**

AuthSub tokens eventually expired:

- No standard way to get new token without user interaction
- Apps had to handle re-authorization flow
- OAuth 2.0's refresh tokens solved this

#### 4. **Manual Token Management**

```python
# Python code from 2008 (gdata library)
auth_token = gdata.auth.AuthSubToken(scope='http://www.google.com/calendar/feeds/')
auth_token.set_token_string('GD32CMCL25aZ-v____8B')

# App had to store and manage this token
# No standard format, no expiration metadata
```

### Signature-Based Security (AuthSub Secure Mode)

AuthSub offered optional request signing:

```http
GET https://www.google.com/calendar/feeds/default/private/full HTTP/1.1
Authorization: AuthSub token="GD32CMCL25aZ-v____8B"
  sigalg="rsa-sha1"
  data="calendar/feeds/default/private/full 1192375400"
  sig="Base64EncodedSignature..."
```

**How It Worked:**

1. Register app with Google, provide RSA public key
2. Sign each request with RSA private key
3. Google verifies signature with public key

**Why It Was Interesting:**

- Similar to OAuth 1.0's signature approach
- Proof of possession (token + key required)
- Better security than bearer tokens

**Why It Failed:**

- Complex setup (RSA key management)
- Most apps didn't bother (insecure mode easier)
- OAuth 2.0 chose simplicity over this approach

## Technological Constraints (2005-2012)

### 1. Browser Limitations

**2005-2008 Reality:**

- Pop-up blockers aggressive (hard to open auth window)
- Cross-domain communication limited (no postMessage API until 2009)
- Mobile browsers primitive (iPhone Safari launched 2007)
- No Web Cryptography API (couldn't sign in browser)

**Impact on Design:**

- AuthSub used redirects (no pop-ups needed)
- Single-page apps not common (redirect flow acceptable)
- Mobile native apps preferred ClientLogin (browser unreliable)

### 2. HTTPS Adoption

**2005 Context:**

- SSL certificates expensive ($100-500/year)
- Self-signed certificates common (browser warnings)
- Many sites HTTP-only
- Google's API endpoints were HTTPS, but callbacks often HTTP

**Security Implications:**

```
http://www.example.com/callback?token=CKF50YzIHxCTKMAg
                                      ^
                                      Token visible in HTTP!
```

AuthSub tokens transmitted over HTTP could be intercepted.

### 3. Mobile Platform Immaturity

**Timeline:**

- 2007: iPhone released (no App Store, no 3rd party apps)
- 2008: Android 1.0, iPhone SDK launched
- 2009: Mobile web apps emerging
- 2010: Native apps dominant, but auth patterns unclear

**AuthSub Mobile Challenges:**

- Custom URL schemes not standardized
- Switching from app → browser → app unreliable
- Users confused by browser pop-ups
- ClientLogin still easier for mobile (despite security issues)

## What We Lost in the Migration

### 1. Service-Specific Tokens

AuthSub/ClientLogin had granular service identifiers:

```
service=cl   # Calendar
service=cp   # Contacts
service=writely  # Google Docs (old name!)
service=wise  # Google Spreadsheets
```

**Modern OAuth 2.0:**

```
scope=https://www.googleapis.com/auth/calendar
      https://www.googleapis.com/auth/contacts
      https://www.googleapis.com/auth/drive
```

**What Changed:**

- OAuth 2.0 scopes more verbose but clearer
- Can request multiple scopes in single auth
- More flexibility, but sometimes over-scoped

### 2. Simple Token Format

ClientLogin/AuthSub tokens:

```
Auth=DQAAAGgA...dk3fA5N  # Opaque string, ~80 chars
```

OAuth 2.0 tokens (JWT):

```json
eyJhbGciOiJSUzI1NiIsImtpZCI6IjY4MDQ0ZjNiYzY4N...  # ~1000+ chars
{
  "iss": "https://accounts.google.com",
  "azp": "123456789-abc.apps.googleusercontent.com",
  "aud": "123456789-abc.apps.googleusercontent.com",
  "sub": "10769150350006150715113082367",
  "email": "user@example.com",
  "email_verified": true,
  "iat": 1708531200,
  "exp": 1708534800
}
```

**Trade-off:**

- OAuth 2.0 tokens larger but self-contained
- No server lookup needed to validate
- Includes metadata (expiration, audience, etc.)
- **Verdict:** OAuth 2.0 approach is better

### 3. Installed Application Flow

AuthSub had "installed app" mode:

```
https://www.google.com/accounts/AuthSubRequest
  ?next=urn:ietf:wg:oauth:2.0:oob  # "Out of band"
  &scope=http://www.google.com/calendar/feeds/
```

User would see authorization code in browser:

```
Your authorization code: 4/P7q7W91a-oMsCeLvIaQm6bTrgtp7
Enter this code in your application
```

**Modern OAuth 2.0:**

```
https://accounts.google.com/o/oauth2/v2/auth
  ?redirect_uri=urn:ietf:wg:oauth:2.0:oob
  &response_type=code
  &client_id=...
```

**Still supported!** OAuth 2.0 kept the `oob` pattern for CLI tools.

## Patterns Worth Revisiting

### 1. Service-Specific Token Architecture

**Modern Problem:** Apps often request overly broad scopes:

```javascript
// What app requests:
scope: 'https://www.googleapis.com/auth/drive'; // Full Drive access

// What app actually needs:
scope: 'https://www.googleapis.com/auth/drive.file'; // Only files created by app
```

**AuthSub Approach:** Force developers to explicitly name each service.

**Modern Revival Opportunity:**

```typescript
interface ScopedTokenRequest {
  services: [
    { service: 'calendar'; operations: ['read'] },
    { service: 'contacts'; operations: ['read', 'write'] },
  ];
}
```

**Resurrection Assessment:** ⭐⭐⭐ - Granular scopes are still a challenge

### 2. Signature-Based Token Usage

**AuthSub Secure Mode** required signing requests with RSA key.

**Modern Equivalent:** OAuth 2.0 DPoP (Demonstrating Proof-of-Possession)

```typescript
// DPoP JWT header
{
  "typ": "dpop+jwt",
  "alg": "ES256",
  "jwk": { /* public key */ }
}

// DPoP JWT payload
{
  "jti": "random-nonce",
  "htm": "POST",
  "htu": "https://api.example.com/resource",
  "iat": 1708531200
}
```

**Resurrection Assessment:** ⭐⭐⭐⭐⭐ - Already being revived as DPoP!

### 3. Explicit Token Exchange

Both AuthSub and ClientLogin had explicit token fetch step:

```
Single-use token → Exchange → Session token
```

OAuth 2.0 kept this:

```
Authorization code → Exchange → Access token + Refresh token
```

**Resurrection Assessment:** ⭐⭐⭐⭐⭐ - This pattern won and stayed

## Lessons for Modern MCP TypeScript Implementation

### ✅ DO Learn From These Mistakes:

1. **Never Accept User Passwords**

   ```typescript
   // ❌ NEVER DO THIS (ClientLogin mistake)
   interface AuthRequest {
     username: string;
     password: string; // 🚫 NO!
   }

   // ✅ ALWAYS redirect to auth provider
   function initiateAuth() {
     const authUrl = buildOAuthUrl();
     redirectToProvider(authUrl);
   }
   ```

2. **Use Industry Standards**

   ```typescript
   // ❌ Don't invent proprietary protocol (AuthSub mistake)
   class CustomAuthProtocol { ... }

   // ✅ Use OAuth 2.0 / OpenID Connect
   import { OAuth2Client } from 'google-auth-library';
   ```

3. **Plan for Token Refresh**

   ```typescript
   // ❌ AuthSub had no refresh mechanism
   interface TokenResponse {
     accessToken: string;
     expiresIn: number;
     // Missing: refreshToken
   }

   // ✅ OAuth 2.0 includes refresh tokens
   interface OAuth2TokenResponse {
     access_token: string;
     refresh_token: string; // Can get new access token
     expires_in: number;
     token_type: 'Bearer';
   }
   ```

4. **Handle Native Apps Properly**
   ```typescript
   // ✅ Use OAuth 2.0 for Native Apps (RFC 8252)
   const config = {
     redirect_uri: 'com.example.app:/oauth2redirect', // Custom scheme
     // OR
     redirect_uri: 'https://example.com/oauth/callback', // Universal Link
     // OR
     redirect_uri: 'http://127.0.0.1:3000/callback', // Loopback (desktop)
   };
   ```

### 🔍 DO Consider These Ideas:

1. **Granular Scope Requests**

   ```typescript
   // Modern approach inspired by AuthSub service identifiers
   interface ScopeRequest {
     resource: 'gmail' | 'calendar' | 'drive';
     permissions: ('read' | 'write' | 'delete')[];
     context?: 'files-created-by-app-only'; // Contextual scoping
   }
   ```

2. **Request Signing for Sensitive Ops**
   ```typescript
   // AuthSub secure mode concept, modern crypto
   async function signedRequest(url: string, token: string, privateKey: CryptoKey) {
     const signature = await crypto.subtle.sign(
       { name: 'ECDSA', hash: 'SHA-256' },
       privateKey,
       new TextEncoder().encode(`${url}${timestamp}`)
     );
     return {
       headers: {
         Authorization: `Bearer ${token}`,
         'X-Signature': base64url(signature),
         'X-Timestamp': timestamp,
       },
     };
   }
   ```

## Conclusion: The Pre-OAuth Dark Ages

ClientLogin and AuthSub represent the **evolutionary dead ends** that taught the industry what NOT to do:

**ClientLogin's Legacy:**

- ❌ Never collect user passwords in third-party apps
- ❌ Bearer tokens alone are insufficient for high security
- ✅ Tokens should be scoped to specific services

**AuthSub's Legacy:**

- ✅ Browser-based delegation is the right pattern
- ✅ Signature-based security has merit (see: DPoP)
- ❌ Proprietary protocols fragment the ecosystem

**For Your TypeScript MCP Server:**

- Use OAuth 2.0 / OpenID Connect (industry standard)
- Never implement proprietary auth protocol
- Consider DPoP for token binding in high-security scenarios
- Learn from their mistakes; don't repeat them

The archaeological verdict: **ClientLogin/AuthSub were necessary evolutionary steps toward OAuth 2.0. Study them to understand WHY modern OAuth works the way it does.**
