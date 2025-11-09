# Documentation Directory (Public)

User-facing documentation for Pulse Fetch MCP server.

## Purpose

This directory contains **public documentation** for users and developers integrating with Pulse Fetch.

**Contrast with `.docs/`**: That directory contains internal development docs, session logs, and investigation notes.

## Current Documentation

### [SCRAPE_OPTIONS.md](SCRAPE_OPTIONS.md)

Detailed reference for scrape tool parameters and configuration options.

**Contents**:

- Excluding language variants in crawls
- Common language path patterns
- Example Firecrawl configurations
- RegEx patterns for path filtering

**Use Cases**:

- Multilingual site crawling
- Focusing on specific content paths
- Configuring Firecrawl API calls

### [STRATEGY_SELECTION.md](STRATEGY_SELECTION.md)

Guide to the intelligent strategy selection system.

**Contents**:

- How strategy selection works
- Optimization modes (cost vs. speed)
- Configuration file format
- Auto-learning behavior
- URL pattern matching rules

**Use Cases**:

- Understanding fallback behavior
- Customizing scraping strategies
- Optimizing for cost or speed
- Debugging strategy selection

## Documentation Standards

When adding new documentation here:

1. **Target Audience**: External users and integrators
2. **Format**: Markdown with GitHub-flavored formatting
3. **Structure**: Table of contents for docs > 100 lines
4. **Examples**: Include practical, working examples
5. **Cross-references**: Link to related docs
6. **Length**: Keep focused, split into separate files if > 500 lines

## Documentation vs. Code Comments

**Use this directory for**:

- Conceptual explanations
- Usage guides and tutorials
- Configuration references
- Integration examples
- API documentation

**Use inline code comments for**:

- Implementation details
- Complex algorithm explanations
- Non-obvious code behavior
- Workarounds and TODOs

## Related Documentation

- [../README.md](../README.md) - Main project README
- [../local/README.md](../local/README.md) - Local setup guide
- [../shared/README.md](../shared/README.md) - Shared module overview
- [../CLAUDE.md](../CLAUDE.md) - Project-level context for Claude

## Future Documentation Ideas

Potential topics for future docs:

- **API_REFERENCE.md** - Complete tool and resource API
- **INTEGRATION_GUIDE.md** - Integrating with other MCP clients
- **CONFIGURATION.md** - Complete environment variable reference
- **TROUBLESHOOTING.md** - Common issues and solutions
- **ARCHITECTURE.md** - System architecture overview
- **PERFORMANCE.md** - Performance tuning and optimization
- **SECURITY.md** - Security considerations and best practices

## Documentation Review

When updating docs:

- [ ] Check examples still work
- [ ] Verify links are not broken
- [ ] Update related docs if necessary
- [ ] Add entry to main README if significant
- [ ] Consider adding to project changelog
