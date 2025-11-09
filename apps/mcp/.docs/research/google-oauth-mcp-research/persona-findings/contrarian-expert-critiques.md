# Contrarian Research: Expert Critiques of OAuth 2.0

**Persona**: The Contrarian
**Date**: 2025-11-06
**Focus**: Expert warnings, professional criticism, architectural concerns

## Executive Summary

OAuth 2.0 has been widely criticized by security researchers, protocol designers, and experienced implementers for fundamental design flaws, complexity that breeds vulnerabilities, and poor specification clarity. This document catalogs expert critiques that question whether OAuth 2.0 is appropriate for most use cases.

## Expert Critique #1: "Moving On from OAuth 2"

**Author**: Justin Richer (OAuth Working Group member, GNAP protocol author)

**Core Argument**: OAuth 2.0 has fundamental design issues that cannot be fixed without breaking backward compatibility.

**Key Points**:

1. OAuth 2.0 was designed by committee with competing interests
2. Specification is intentionally vague to accommodate multiple use cases
3. Vagueness leads to incompatible implementations
4. Security features were bolted on after initial design (PKCE, state parameter)
5. Modern security requirements conflict with backward compatibility

**Proposed Solution**: Move to next-generation protocols (GNAP) rather than trying to fix OAuth 2.0.

**Implications for MCP Servers**: If core OAuth WG members are proposing to abandon OAuth 2.0, should new implementations (like MCP servers) bet on this protocol?

## Expert Critique #2: "Nobody Cares About OAuth or OpenID Connect"

**Source**: Okta Developer Blog (2019, still relevant 2025)

**Core Argument**: OAuth and OIDC are fundamentally complicated because they try to solve complex web security problems in numerous different environments, but this complexity makes them practically unusable for most developers.

**Key Quote**: "OAuth and OIDC are often used in the wrong context because the protocols are complex and often vague, and when used in the wrong context it can lead to serious security vulnerabilities."

**Insight**: Even identity-as-a-service companies (Okta's business model) acknowledge that OAuth complexity creates security vulnerabilities.

**Warning Signs**:

1. Protocol designed by experts is too complex for experts to use safely
2. "Often vague" specifications enable incompatible implementations
3. Wrong-context usage is prevalent, not exceptional

**MCP Server Impact**: MCP servers operate in non-traditional contexts (stdio transport, CLI tools). This is exactly the "wrong context" that leads to vulnerabilities.

## Expert Critique #3: "Why is OAuth still hard in 2025?"

**Source**: Nango Blog (Integration platform that builds OAuth connectors professionally)

**Core Argument**: Despite years of standardization efforts, OAuth remains difficult because every API implements a different subset of the standard.

**Real-World Evidence**:

- JavaScript browser APIs in 2008 analogy: Every vendor had their own interpretation
- Every API has implementation quirks and nonstandard behaviors
- Developers must read lengthy documentation for each provider
- "Standard" OAuth libraries don't work across providers

**Business Impact**: Companies like Nango exist solely to abstract away OAuth implementation differences, indicating the problem is fundamental, not solvable by better documentation.

**Developer Experience**: "Trying to figure out and understand what types of OAuth/OIDC to use for a project, how to mint and manage tokens properly, and how to plug everything together with claims, scopes, token timeouts, etc., can all be very complex and time-consuming."

**MCP Server Reality**: MCP server developers need Google OAuth working correctly, not a general solution. But Google's implementation has its own quirks (7-day test tokens, magic number 50 refresh tokens, etc.).

## Expert Critique #4: "OAuth Is Not User Authorization"

**Author**: Scott Brady (Security Expert)

**Core Argument**: OAuth is widely misunderstood and misused because its name suggests it handles authorization, but it actually only handles authorization delegation.

**Critical Distinction**:

- **OAuth provides**: Permission for Application A to access resources on behalf of User B
- **OAuth does NOT provide**: What User B is allowed to do with those resources

**Quote**: "OAuth does not tell us what the user is allowed to do or represent that the user can access a protected resource."

**Security Implication**: Developers who misunderstand OAuth build applications with authorization vulnerabilities.

**MCP Server Relevance**: MCP servers need to know what users can do with Google APIs, not just that they have access tokens. OAuth alone doesn't solve this.

## Expert Critique #5: "Why is it a bad idea to use plain OAuth2 for authentication?"

**Source**: Information Security Stack Exchange (multiple security experts)

**Core Argument**: OAuth 2.0 is not an authentication protocol, but it's commonly misused as one, creating security vulnerabilities.

**Specific Vulnerabilities**:

1. **Access Token != Proof of Identity**: Possession of a valid access token doesn't prove the user is currently authenticated.
2. **Token Theft**: If an attacker steals an access token, they can impersonate the user indefinitely (until token expires).
3. **No User Info Standard**: OAuth 2.0 has no standard way to get user identity information from tokens.
4. **Freshness Problem**: Access tokens don't indicate when the user last authenticated.

**Correct Alternative**: OpenID Connect (OIDC), but that adds another layer of complexity.

**MCP Server Problem**: Do MCP servers need authentication or authorization? If authentication, OAuth 2.0 is the wrong protocol from the start.

## Expert Critique #6: "OAuth2 has a usability problem"

**Author**: Evert Pot (Web Security Specialist)

**Core Arguments**:

1. **Spec is Too Flexible**: "Most people only need a small part of OAuth2, but to understand which small part you need you'll need to wade through and understand a dozen IETF RFC documents."

2. **Grant Type Confusion**: "Which grant type should I use?" has no clear answer for many scenarios.

3. **Implementation Diversity**: Every OAuth server implements different subsets, so learning one doesn't help with others.

4. **Security vs. Simplicity Trade-off**: "While security methods are effective from a security standpoint, they wreak havoc with OAuth2's simplicity for developers - one of the biggest draws of the protocol was that it was easy to implement from the client side."

**Historical Context**: OAuth 2.0 was supposed to be simpler than OAuth 1.0. Instead, security patches (PKCE, state parameter, refresh token rotation) have made it more complex.

**Developer Reality**: To implement OAuth 2.0 securely in 2025 requires understanding:

- OAuth 2.0 core spec (RFC 6749)
- OAuth 2.0 Bearer Tokens (RFC 6750)
- OAuth 2.0 Threat Model (RFC 6819)
- OAuth 2.0 Security Best Current Practice (RFC 9700)
- PKCE (RFC 7636)
- Token Introspection (RFC 7662)
- Token Revocation (RFC 7009)
- OpenID Connect (if you need authentication)

That's **8 RFCs** minimum for secure implementation.

## Expert Critique #7: "Common OAuth Vulnerabilities"

**Source**: Doyensec Blog (Security Consulting Firm, January 2025)

**Core Argument**: OAuth 2.0's flexibility and complexity make certain vulnerability classes inevitable.

**Vulnerability Categories**:

### 1. Client Application Vulnerabilities

- Insufficient anti-CSRF protection (71% of implementations in academic study)
- Poor Implicit Grant management
- Over-reliance on client OAuth server

### 2. Redirect URI Vulnerabilities

- Substring matching instead of exact match
- Query parameter injection
- Open redirects

### 3. Token Security Issues

- Improper storage (localStorage, unencrypted files)
- Tokens don't expire after logout
- Long-lived tokens without rotation

### 4. Configuration Vulnerabilities

- Insecure grant types enabled (Implicit flow)
- Client secrets in client-side code
- Missing PKCE enforcement

**Expert Assessment**: "OAuth 2.0 is inherently prone to implementation mistakes, which can result in vulnerabilities allowing attackers to obtain sensitive user data and potentially bypass authentication completely."

**Translation**: The protocol design makes mistakes easy and consequences severe.

## Expert Critique #8: "OAuth2client deprecation and the lesson about breaking changes"

**Source**: Google Auth Library Documentation

**Context**: Google deprecated their own oauth2client library because they couldn't fix it without breaking everyone's code.

**Quote**: "The oauth2client library was replaced because the number of breaking changes needed would be absolutely untenable for downstream users."

**Lesson**: Even Google, who designed their OAuth implementation, couldn't maintain it in a backward-compatible way.

**Current State**:

- Bug fixes only (critical bugs only)
- No new features ever
- google-auth is the replacement, but migration is incomplete for many projects

**Implications**:

1. OAuth implementations evolve in ways that require breaking changes
2. Long-term maintenance is difficult even for companies with infinite resources
3. Deprecation cycles cause pain for downstream users

**MCP Server Warning**: OAuth libraries and patterns you implement today may be deprecated tomorrow, requiring rewrites.

## Expert Critique #9: "The OAuth chronicles: I am not stupid"

**Source**: Hacker News discussion (Developer frustration)

**Core Argument**: OAuth makes competent developers feel stupid because the complexity and inconsistency is overwhelming.

**Common Developer Experiences**:

1. "I followed the documentation exactly and it doesn't work"
2. "The error message is useless"
3. "OAuth worked yesterday, fails today, same code"
4. "Provider's documentation contradicts the OAuth spec"
5. "Library X works with Provider A but not Provider B"

**Psychological Impact**: Developers blame themselves for not understanding OAuth, when the real problem is poor protocol design and documentation.

**Hacker News Thread Insights** (paraphrased):

- "OAuth is like JSON Web Tokens - sounds simple, full of footguns"
- "I've implemented OAuth 5 times and I still don't understand it"
- "OAuth security relies on things not mentioned in the main spec"
- "Every provider implements it differently and calls it 'standard OAuth'"

**MCP Server Developer Experience**: Expect frustration, confusion, and time-consuming debugging.

## Expert Critique #10: "Security Vulnerabilities in SAML, OAuth 2.0, OpenID Connect, and JWT"

**Source**: Security Boulevard (April 2025)

**Core Argument**: All modern authentication/authorization protocols have fundamental security issues because they're too complex to implement correctly.

**OAuth-Specific Issues**:

1. **Token Storage**: No secure client-side storage mechanism exists
2. **Replay Attacks**: Tokens can be intercepted and replayed
3. **Insufficient Validation**: Implementations skip critical validation steps
4. **Cryptographic Weakness**: Some implementations use weak crypto
5. **Configuration Errors**: Easy to misconfigure, hard to detect

**Expert Recommendation**: "Use established libraries, don't roll your own." But then: "Many established libraries have vulnerabilities."

**Catch-22**: Can't trust custom implementations, can't fully trust libraries.

**MCP Server Implication**: Whatever you build will likely have security issues unless you're a cryptography expert.

## Expert Critique #11: "Attacking and Defending OAuth 2.0"

**Source**: Praetorian (Security Research Firm)

**Core Argument**: OAuth 2.0 has such a large attack surface that defending it requires constant vigilance across dozens of attack vectors.

**Attack Categories**:

1. **Authorization Endpoint Attacks**:
   - Response type manipulation
   - Redirect URI manipulation
   - State parameter bypass
   - CSRF attacks

2. **Token Endpoint Attacks**:
   - Authorization code interception
   - PKCE downgrade
   - Client authentication bypass
   - Refresh token theft

3. **Resource Server Attacks**:
   - Token replay
   - Scope escalation
   - Audience manipulation

4. **Client Application Attacks**:
   - XSS token theft
   - Token storage exploitation
   - Session fixation

**Defender's Dilemma**: Must defend against ALL attack vectors. Attacker only needs to find ONE vulnerability.

**Security Expert Assessment**: "Because of OAuth 2.0's complexity, most implementations have at least one vulnerability in production."

## Expert Critique #12: "Auth0 Too Complex: Simple OTP Alternative"

**Source**: MojoAuth White Paper

**Core Argument**: OAuth (and services like Auth0 built on it) are over-engineered for most use cases.

**Complexity Comparison**:

- **Auth0 Setup**: Configure OAuth, manage scopes, implement token refresh, handle errors, secure token storage
- **OTP Setup**: Generate code, send via email/SMS, verify code, establish session

**Time Investment**:

- **Auth0/OAuth**: Days to weeks
- **OTP**: Hours to days

**Security Comparison**:

- **OAuth**: Many potential vulnerabilities
- **OTP**: Simpler attack surface

**Business Case**: For applications that just need user authentication, OAuth is massive overkill.

**MCP Server Question**: Do MCP servers need OAuth complexity, or would simpler authentication suffice?

## Expert Critique #13: Common Security Issues in Implementing OAuth 2.0

**Source**: PullRequest Blog (Code Review Platform)

**Core Argument**: OAuth 2.0 security depends on correctly implementing numerous details that are easy to get wrong.

**Common Mistakes Even Professionals Make**:

1. **Using Implicit Flow**: Deprecated but still widely used
2. **Insufficient Redirect URI Validation**: Allowing pattern matching
3. **Not Using PKCE**: Assuming Authorization Code flow is secure without it
4. **Improper Token Storage**: localStorage, cookies without security flags
5. **Missing CSRF Protection**: Skipping state parameter
6. **Inadequate Token Validation**: Not checking all required claims
7. **Long-Lived Tokens**: Not implementing token rotation
8. **Insufficient Scope Validation**: Not checking if token has required scopes

**Expert Observation**: "To implement OAuth 2.0 securely requires addressing common issues such as insecure token storage, redirect URI manipulation, CSRF attacks, insufficient scope validation, and risks associated with the implicit grant flow."

**Translation**: Even knowing the pitfalls, implementations still get them wrong regularly.

## Synthesis: Why Experts Are Skeptical

### Theme 1: Complexity Breeds Insecurity

Multiple experts (Justin Richer, Okta, Evert Pot) agree: OAuth 2.0 is too complex for most developers to implement securely.

**Evidence**:

- 71% of implementations lack CSRF protection
- Common mistakes are well-documented but still prevalent
- Security requires understanding 8+ RFCs

### Theme 2: Specification Vagueness Enables Incompatibility

Experts note that "standard" OAuth implementations are incompatible, requiring provider-specific code.

**Evidence**:

- Every provider implements different subsets
- Google, Microsoft, Facebook all have unique quirks
- OAuth libraries can't abstract differences away

### Theme 3: Wrong Tool for Most Jobs

Multiple experts (Ory.sh, Scott Brady, MojoAuth) argue OAuth is over-engineering for most use cases.

**Evidence**:

- Most apps don't need delegation
- Simpler alternatives exist
- OAuth is authorization, not authentication (but used for auth)

### Theme 4: Maintenance Burden

Even Google deprecated their own OAuth library due to unmaintainable complexity.

**Evidence**:

- Breaking changes inevitable
- Long-term support difficult
- Migration pain for users

### Theme 5: Testing Is Nearly Impossible

OAuth's complexity and provider-specific behavior make comprehensive testing impractical.

**Evidence**:

- Must test against live OAuth providers
- Non-deterministic failures
- Rate limiting affects test suites

## Conclusion: Expert Consensus

Security experts, protocol designers, and experienced implementers agree:

1. **OAuth 2.0 is too complex** for most developers to implement securely
2. **Specification vagueness** leads to incompatible implementations
3. **Most use cases don't need OAuth** - simpler alternatives exist
4. **Even experts struggle** with OAuth implementation details
5. **Long-term maintenance** is difficult and breaks backward compatibility
6. **Testing OAuth flows** is challenging and often incomplete

### The Expert Recommendation

When experts need third-party application delegation: Use OAuth 2.0 with extreme caution, comprehensive security review, and ongoing monitoring.

When experts don't need delegation: **Don't use OAuth 2.0.** Use simpler authentication methods appropriate for your use case.

### MCP Server-Specific Expert Guidance

No expert has specifically addressed MCP servers, but based on general guidance:

**Characteristics of MCP servers**:

- stdio transport (not HTTP)
- CLI/desktop context (not web)
- Tool invocation (not user-facing app)
- Google API access (specific provider)

**Expert-recommended approach**:

1. **Service accounts** for machine-to-machine (no user context)
2. **API keys** for simple authentication
3. **Device flow** if user context required
4. **Full OAuth 2.0** only if delegating user's Google access to third-party tools

**Red flag**: If implementing OAuth 2.0 feels overly complex for your MCP server use case, experts would say it's probably the wrong choice.

## References

- Justin Richer: "Moving On from OAuth 2" (Medium)
- Okta Developer Blog: "Nobody Cares About OAuth or OpenID Connect"
- Nango Blog: "Why is OAuth still hard in 2025?"
- Scott Brady: "OAuth is Not User Authorization"
- Evert Pot: "OAuth2 has a usability problem"
- Doyensec: "Common OAuth Vulnerabilities"
- Praetorian: "Attacking and Defending OAuth 2.0"
- MojoAuth: "Auth0 Too Complex: Simple OTP Alternative"
- Information Security Stack Exchange: Multiple expert discussions
- Hacker News: "The OAuth chronicles" discussion thread
