# THE HISTORIAN: Research Findings Index

**Research Completed**: 2025-11-06
**Persona**: The Historian
**Mandate**: Investigate historical evolution of OAuth in similar contexts, failed attempts, and forgotten alternatives

---

## Document Overview

This research collection contains comprehensive historical analysis of OAuth 2.0 evolution (2012-2025), with specific focus on CLI/stdio authentication patterns applicable to MCP server implementations.

**Total Research Output**: ~70,000 words across 5 documents
**Evidence Quality**: Primary (RFCs, CVEs) + Secondary (vendor docs) + Tertiary (practitioner discussions)
**Overall Confidence**: High (85%)

---

## Research Documents

### 1. Research Summary (START HERE)

**File**: `historian-research-summary.md`
**Length**: ~8,000 words
**Purpose**: Executive summary, cross-document synthesis, key findings, recommendations

**Read this first** for high-level findings and actionable recommendations.

---

### 2. OAuth Evolution Timeline (2012-2025)

**File**: `historian-oauth-evolution.md`
**Length**: ~15,000 words

**Key Insights**:

- OAuth 2.1 mandates PKCE for all authorization code flows
- Implicit flow removed due to URL fragment leakage
- Device flow (RFC 8628, 2019) designed for limited-input devices

**Evidence Quality**: Primary (RFCs, IETF documents) - 95% confidence

---

### 3. Failed OAuth Patterns

**File**: `historian-failed-patterns.md`
**Length**: ~18,000 words
**10 major failed patterns documented with why they failed and lessons learned**

**Evidence Quality**: Secondary (practitioner blogs, Stack Overflow) - 75% confidence

---

### 4. Security Vulnerability History

**File**: `historian-security-history.md`
**Length**: ~20,000 words
**400+ CVEs analyzed across 13 years**

**Evidence Quality**: Primary (CVE database) + Secondary (security research) - 90% confidence

---

### 5. CLI OAuth Patterns Evolution

**File**: `historian-cli-oauth-patterns.md`
**Length**: ~17,000 words
**Complete evolution from 2000-2025 with implementation examples**

**Evidence Quality**: Secondary (practitioner documentation, GitHub examples) - 85% confidence

---

## Quick Reference

**Q: What OAuth flow for MCP servers?**
**A**: Device Authorization Flow (RFC 8628) primary, localhost + browser fallback.

**Q: Where to store tokens?**
**A**: OS keychain (macOS Keychain Access, Linux libsecret, Windows Credential Manager).

**Q: Use PKCE?**
**A**: Yes, mandatory for OAuth 2.1 compliance.

**Q: Refresh token rotation?**
**A**: Mandatory for security.

---

## Critical Recommendations

### Must Do (Critical)

1. ✅ Device Authorization Flow (RFC 8628)
2. ✅ OS keychain storage (never plain text)
3. ✅ Refresh token rotation
4. ✅ PKCE with S256 method
5. ✅ State parameter validation
6. ✅ Explicit authentication command

---

## Timeline of Key Events

| Year | Event                  | Significance                                 |
| ---- | ---------------------- | -------------------------------------------- |
| 2012 | OAuth 2.0 (RFC 6749)   | Bearer token protocol                        |
| 2015 | PKCE (RFC 7636)        | Code interception protection                 |
| 2019 | Device Flow (RFC 8628) | Limited-input devices                        |
| 2025 | OAuth 2.1              | Mandatory security, deprecated flows removed |

---

## Suggested Reading Order

### Quick Implementation

1. `historian-research-summary.md`
2. `historian-cli-oauth-patterns.md`

### Comprehensive Understanding

1. Summary → Evolution → Failed Patterns → Security → CLI Patterns

### Security Focus

1. Security History → Failed Patterns → Summary

---

**End of Index**
