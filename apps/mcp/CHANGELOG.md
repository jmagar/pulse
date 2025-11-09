## [0.3.1] - 2025-11-07

### Fixed

- **Critical:** Fixed empty JSON schema generation for search, map, and crawl tools
  - Root cause: zodToJsonSchema instanceof checks fail on schemas imported from compiled dist/
  - Solution: Implemented manual buildInputSchema() functions for each tool
  - Impact: MCP clients can now discover and use all 4 tools
  - Related: Dual-Package Hazard with Zod module instances across compilation boundaries

### Technical Details

- Replaced zodToJsonSchema() with manual JSON Schema construction
- Follows proven pattern from scrape tool
- Avoids cross-module instanceof validation failures
- No runtime behavior changes, only schema registration fix
