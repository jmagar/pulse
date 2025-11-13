# docs/ Directory

**Purpose:** Public-facing project documentation for users, contributors, and external stakeholders.

## Structure

**Current directories/files:**
```
docs/
├── mcp/                      # MCP tool documentation (scrape, crawl, map, search, query)
├── plans/                    # Implementation plans and roadmaps
├── services/                 # Service guides (CHANGEDETECTION, FIRECRAWL, PORTS, INDEX, etc.)
├── ARCHITECTURE_DIAGRAM.md   # ASCII system topology diagrams
├── OAUTH.md                  # Google OAuth 2.1 configuration
├── deployment-log.md         # Deployment history
└── CLAUDE.md                 # This file
```

**Planned directories** (not yet created):
```
docs/
├── architecture/      # System design, component diagrams, ADRs
├── api/               # API specifications, endpoint documentation
├── guides/            # User guides, tutorials, how-tos
└── contributing/      # Contribution guidelines, development setup
```

## Guidelines

### What Goes Here
- **Architecture Documentation:** System design, component interactions, data flow
- **API Documentation:** Endpoint specifications, request/response schemas
- **User Guides:** Setup instructions, usage examples, best practices
- **Tutorials:** Step-by-step walkthroughs for common tasks
- **Contributing Guides:** Development setup, coding standards, PR process
- **Decision Records:** Architecture Decision Records (ADRs)

### What Doesn't Go Here
- Session logs or working notes (use `.docs/` instead)
- Temporary files or scratch work (use `.docs/` instead)
- Internal planning documents (use `.docs/` instead)
- Investigation reports (use `.docs/` until ready for public)

### Characteristics
- **Audience:** External users, open-source contributors, API consumers
- **Format:** Polished Markdown with consistent structure
- **Lifecycle:** Stable, maintained, versioned with releases
- **Git:** Tracked and emphasized in README
- **Tone:** Professional, clear, beginner-friendly

## Documentation Standards

### Structure
- Clear headings hierarchy (H1 → H2 → H3)
- Table of contents for documents > 100 lines
- Code examples with syntax highlighting
- Diagrams where helpful (ASCII art, Mermaid, images)

### Content
- Assume no prior knowledge of the codebase
- Explain the "why" not just the "what"
- Include working code examples
- Link to related documentation
- Keep up-to-date with code changes

### Examples
All guides should include:
- **Prerequisites:** What you need before starting
- **Step-by-step instructions:** Numbered, executable steps
- **Expected output:** What success looks like
- **Troubleshooting:** Common issues and solutions

## Maintenance

- Review quarterly for accuracy
- Update when features change
- Archive obsolete docs (move to `.docs/archive/`)
- Link from README for discoverability

## Current Documentation Files

### Integration Guides
- **[CHANGEDETECTION.md](services/CHANGEDETECTION.md)** (~700 lines) - Complete changedetection.io setup, webhook config, auto-rescraping
- **[OAUTH.md](OAUTH.md)** (198 lines) - Google OAuth 2.1 setup for MCP server with production hardening

### Service Documentation
- **[services-ports.md](services-ports.md)** (200+ lines) - All service ports, container names, internal/external URLs, environment variables
- **[external-services.md](external-services.md)** - GPU machine services (TEI, Qdrant, Ollama)
- **[ARCHITECTURE_DIAGRAM.md](ARCHITECTURE_DIAGRAM.md)** (406 lines) - ASCII topology diagrams, health checks, data flow

### MCP Tools
- **[mcp/INDEX.md](mcp/INDEX.md)** - Tool overview table
- **[mcp/SCRAPE.md](mcp/SCRAPE.md)** - Single/batch scraping documentation
- **[mcp/CRAWL.md](mcp/CRAWL.md)** - Site-wide crawling
- **[mcp/MAP.md](mcp/MAP.md)** - URL enumeration
- **[mcp/SEARCH.md](mcp/SEARCH.md)** - Federated search
- **[mcp/QUERY.md](mcp/QUERY.md)** - Hybrid documentation search
- **[mcp/RESOURCES.md](mcp/RESOURCES.md)** - Persistent resource caching

### Implementation Plans
- **[plans/](plans/)** - Active roadmaps and feature plans (2025-11-10 through 2025-11-12)

## Relationship to .docs/

- `docs/` = **External** (public, stable, polished)
- `.docs/` = **Internal** (process, exploration, temporary)

Think of `docs/` as the showroom and `.docs/` as the workshop.
