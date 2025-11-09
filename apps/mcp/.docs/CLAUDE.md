# Internal Documentation Directory

Internal development documentation, investigation notes, and session logs.

## Purpose

This directory contains **internal documentation** NOT intended for end users.

**Contrast with `docs/`**: That directory contains public user-facing documentation.

## Directory Structure

### Session Logs (Planned)

Future location for development session logs:

```
.docs/sessions/YYYY-MM-DD-HH-MM-description.md
```

**Not yet implemented**, but planned for:

- Development session notes
- Decision logs
- Architecture discussions
- Problem-solving sessions

### Investigation Notes

Currently contains OAuth/authentication investigation:

- [INDEX.md](INDEX.md) - Master index of investigation files
- [QUICK_REFERENCE.md](QUICK_REFERENCE.md) - Quick lookup guide
- [oauth-authentication-exploration.md](oauth-authentication-exploration.md) - Complete analysis
- [OAUTH_FINDINGS_SUMMARY.txt](OAUTH_FINDINGS_SUMMARY.txt) - Executive summary
- [AUTH_ARCHITECTURE_DIAGRAM.txt](AUTH_ARCHITECTURE_DIAGRAM.txt) - Visual diagrams

### Temporary Files ([tmp/](tmp/))

Working files and temporary investigation notes:

- [brightdata-removal-investigation.md](tmp/brightdata-removal-investigation.md) - BrightData removal notes

## OAuth Investigation Files

**Key Finding**: OAuth is NOT implemented in remote server

### Quick Reference

**Start here**: [QUICK_REFERENCE.md](QUICK_REFERENCE.md)

- 5-10 minute read
- File locations with line numbers
- Environment variables
- Implementation options
- Next steps

### Complete Analysis

**For deep dive**: [oauth-authentication-exploration.md](oauth-authentication-exploration.md)

- 20-30 minute read
- Full architecture analysis
- Code examples
- Security assessment
- Implementation details

### Executive Summary

**For reports**: [OAUTH_FINDINGS_SUMMARY.txt](OAUTH_FINDINGS_SUMMARY.txt)

- 10-15 minute read
- Structured findings
- Production checklist
- Recommendations

### Architecture Diagrams

**For visual reference**: [AUTH_ARCHITECTURE_DIAGRAM.txt](AUTH_ARCHITECTURE_DIAGRAM.txt)

- 15-20 minute read
- ASCII diagrams
- Flow comparisons
- System architecture

## File Naming Conventions

### Session Logs

```
YYYY-MM-DD-HH-MM-description.md
2025-11-06-14-30-oauth-investigation.md
```

### Investigation Notes

```
topic-description.md
oauth-authentication-exploration.md
brightdata-removal-investigation.md
```

### Temporary Files

```
tmp/descriptive-name.md
```

## What Goes Here

**Include**:

- Development session notes
- Architecture investigations
- Decision rationales
- Problem-solving logs
- Temporary working files
- Internal research notes

**Don't Include**:

- User-facing documentation (→ `docs/`)
- Code comments (→ inline in code)
- Test documentation (→ `tests/README.md`)
- Public API docs (→ `docs/`)

## .gitignore Status

This directory is tracked in git to preserve:

- Investigation findings
- Architectural decisions
- Session logs for context

Temporary files in `tmp/` may be gitignored on a case-by-case basis.

## Related Directories

- [../docs/](../docs/) - Public user documentation
- [../tests/](../tests/) - Test suite with test docs
- [../CLAUDE.md](../CLAUDE.md) - Project context for Claude

## Current Status

**Active Investigations**:

- OAuth/authentication for remote server (complete, needs implementation)
- BrightData removal (in progress)

**Planned**:

- Session log structure
- Deployment logs
- Service port registry
