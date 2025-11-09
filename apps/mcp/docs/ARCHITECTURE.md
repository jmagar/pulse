# Architecture Overview

This document explains how Pulse Fetch is designed and how the components work together.

## Table of Contents

- [System Design](#system-design)
- [Monorepo Structure](#monorepo-structure)
- [Transport Implementations](#transport-implementations)
- [Tool Pipeline Architecture](#tool-pipeline-architecture)
- [Multi-Tier Caching System](#multi-tier-caching-system)
- [Strategy Selection System](#strategy-selection-system)
- [Data Flow Diagrams](#data-flow-diagrams)

---

## System Design

Pulse Fetch uses a **three-layer architecture** that separates business logic from transport concerns:

```
┌─────────────────────────────────────────────────────────────┐
│                       MCP Clients                            │
│         (Claude Desktop, HTTP clients, etc.)                 │
└─────────────────┬───────────────────────────┬────────────────┘
                  │                           │
        ┌─────────▼────────┐       ┌─────────▼────────┐
        │  local/ (stdio)  │       │ remote/ (HTTP)   │
        │  Transport Layer │       │  Transport Layer │
        └─────────┬────────┘       └─────────┬────────┘
                  │                           │
                  └──────────┬────────────────┘
                             │
                    ┌────────▼────────┐
                    │    shared/      │
                    │  Business Logic │
                    │  - Tools        │
                    │  - Clients      │
                    │  - Storage      │
                    └─────────────────┘
```

**Key Principles:**

1. **Single Source of Truth** - All business logic lives in `shared/`
2. **Transport Agnostic** - Same features via stdio or HTTP
3. **Dependency Injection** - Clients and storage are pluggable
4. **Type Safety** - TypeScript + Zod throughout
5. **Test Independence** - Each layer can be tested in isolation

---

## Monorepo Structure

Pulse Fetch uses a workspace-based monorepo with three packages:

```
pulse/
├── shared/                  # Core business logic
│   ├── clients/             # External service integrations
│   │   ├── firecrawl/       # Firecrawl API client
│   │   └── anthropic/       # LLM client (not implemented yet)
│   │
│   ├── mcp/
│   │   ├── tools/           # MCP tool implementations
│   │   │   ├── scrape/      # Single URL scraping
│   │   │   ├── search/      # Google search
│   │   │   ├── map/         # Site structure discovery
│   │   │   └── crawl/       # Recursive crawling
│   │   │
│   │   └── resources/       # MCP resource management
│   │
│   ├── storage/             # Storage backend implementations
│   │   ├── memory.ts        # In-memory storage (default)
│   │   ├── filesystem.ts    # Persistent file storage
│   │   └── factory.ts       # Storage backend factory
│   │
│   ├── processing/          # Content processing
│   │   ├── cleaning/        # HTML → Markdown conversion
│   │   └── extraction/      # LLM-based extraction
│   │
│   └── config/              # Configuration & validation
│       └── validation-schemas.ts
│
├── local/                   # Stdio transport (Claude Desktop)
│   └── index.ts             # Minimal wrapper
│
└── remote/                  # HTTP transport (Hosted server)
    ├── index.ts             # Express.js server
    ├── middleware/          # HTTP middleware (CORS, auth)
    └── monitoring/          # Metrics and health checks
```

### Why This Structure?

**Shared Module:**

- Published as `pulse-shared` on npm
- Consumed by both local and remote packages
- All feature development happens here
- Fully testable in isolation

**Local Module:**

- ~50 lines of code (minimal wrapper)
- Uses `StdioServerTransport` from MCP SDK
- Perfect for Claude Desktop integration

**Remote Module:**

- Express.js HTTP server
- `StreamableHTTPServerTransport` for MCP-over-HTTP
- Additional HTTP-specific features (metrics, health checks)

---

## Transport Implementations

Pulse Fetch supports two MCP transport protocols:

### Stdio Transport (Local)

**Used by:** Claude Desktop, cline, and other MCP clients with stdio support

**How it works:**

1. Client spawns Node.js process via `node /path/to/local/dist/index.js`
2. Communication happens via stdin/stdout using JSON-RPC
3. Process lifecycle managed by the MCP client

**Implementation:** [`local/index.ts`](local/index.ts)

```typescript
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMCPServer } from './shared/index.js';

const server = createMCPServer();

const transport = new StdioServerTransport();
await server.connect(transport);
```

**Advantages:**

- Simple setup (no server to run)
- Direct process communication (fast)
- Automatic lifecycle management

**Disadvantages:**

- One instance per client
- No remote access
- No shared caching between clients

### StreamableHTTP Transport (Remote)

**Used by:** Remote MCP clients, web applications, API integrations

**How it works:**

1. Express.js server listens on configurable port (default: 3060)
2. Clients POST JSON-RPC requests to `/mcp` endpoint
3. Server responds with JSON or SSE stream

**Implementation:** [`remote/server.ts`](remote/server.ts)

```typescript
import express from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMCPServer } from './shared/index.js';

const app = express();
const server = createMCPServer();

const transport = new StreamableHTTPServerTransport({
  endpoint: '/mcp',
  app,
});
await server.connect(transport);

app.listen(process.env.PORT || 3060);
```

**Advantages:**

- Hosted deployment (accessible remotely)
- Shared caching across all clients
- Metrics and monitoring built-in
- Horizontal scaling possible

**Disadvantages:**

- Requires server setup
- Network latency
- More complex deployment

---

## Tool Pipeline Architecture

Every tool follows a five-stage pipeline:

```
Request → Validation → Execution → Processing → Caching → Response
```

### 1. Validation (Zod Schemas)

Each tool defines its input schema using Zod:

**Example:** [`shared/mcp/tools/scrape/schema.ts`](shared/mcp/tools/scrape/schema.ts)

```typescript
import { z } from 'zod';

export const ScrapeArgsSchema = z.object({
  url: z.string().url(),
  formats: z.array(z.string()).optional(),
  cleanScrape: z.boolean().optional(),
  extract: z.string().optional(),
  resultHandling: z.enum(['saveAndReturn', 'saveOnly', 'returnOnly']).optional(),
  // ... more parameters
});

export type ScrapeArgs = z.infer<typeof ScrapeArgsSchema>;
```

**Benefits:**

- Automatic type inference
- Runtime validation with helpful error messages
- Self-documenting parameter schemas

### 2. Execution (Handler Logic)

Tool handlers implement the core business logic:

**Example:** [`shared/mcp/tools/scrape/handler.ts`](shared/mcp/tools/scrape/handler.ts)

```typescript
export async function handleScrapeRequest(args: ScrapeArgs) {
  // 1. Check cache first
  const cached = await findCachedResource(args.url, args.extract);
  if (cached && !args.forceRescrape) {
    return buildSuccessResponse(cached);
  }

  // 2. Execute scraping strategy
  const content = await executeScrapeStrategy(args.url);

  // 3. Process content (clean, extract)
  const processed = await processContent(content, args);

  // 4. Cache results
  await cacheResource(args.url, processed);

  // 5. Return response
  return buildSuccessResponse(processed);
}
```

### 3. Processing (Content Pipeline)

Content flows through a processing pipeline:

```
Raw HTML → Cleaning → Extraction → Storage
```

**Cleaning:** [`shared/processing/cleaning/`](shared/processing/cleaning/)

- Converts HTML to semantic Markdown
- Removes navigation, ads, cookie banners
- Preserves article structure and semantics
- Uses `dom-to-semantic-markdown` library

**Extraction:** [`shared/processing/extraction/`](shared/processing/extraction/)

- LLM-powered natural language extraction
- Supports Anthropic, OpenAI, OpenAI-compatible providers
- Conditional feature (only if `extract` parameter provided)

### 4. Caching (Multi-Tier Storage)

See [Multi-Tier Caching System](#multi-tier-caching-system) below.

### 5. Response (MCP Format)

Tools return MCP-compliant responses:

```typescript
{
  content: [
    {
      type: 'text',
      text: 'Scraped content here...',
    },
    {
      type: 'resource',
      resource: {
        uri: 'memory://cleaned/example_com_20250107120000',
        name: 'Example Page (Cleaned)',
        mimeType: 'text/markdown',
        text: '...',
      },
    },
  ];
}
```

---

## Multi-Tier Caching System

Pulse Fetch caches scraped content in **three tiers** to enable efficient reuse:

```
┌─────────────────────────────────────────────────────────────┐
│                     Scraping Request                         │
└───────────────────────┬─────────────────────────────────────┘
                        │
                ┌───────▼────────┐
                │   Raw Tier     │  ← Original HTML from fetch/browser/Firecrawl
                │ memory://raw/* │
                └───────┬────────┘
                        │
                ┌───────▼────────┐
                │ Cleaned Tier   │  ← HTML → Markdown, main content only
                │memory://cleaned/*│
                └───────┬────────┘
                        │
                ┌───────▼────────┐
                │ Extracted Tier │  ← LLM-processed structured data
                │memory://extracted/*│
                └────────────────┘
```

### Raw Tier

**Purpose:** Store original content exactly as fetched

**URI Pattern:**

- Memory: `memory://raw/<sanitized-url>_<timestamp>`
- Filesystem: `file://<root>/raw/<filename>`

**Content:** Full HTML response with metadata (headers, status code)

**When used:**

- As fallback if cleaning fails
- For debugging scraping issues
- For re-processing without re-scraping

### Cleaned Tier

**Purpose:** Store human-readable Markdown

**URI Pattern:**

- Memory: `memory://cleaned/<sanitized-url>_<timestamp>`
- Filesystem: `file://<root>/cleaned/<filename>`

**Content:** Semantic Markdown with:

- Main article/content only
- Navigation/ads/footers removed
- Code blocks preserved
- Links maintained

**When used:**

- Default response format for most scrapes
- Reading content in AI context
- Token-efficient representation

### Extracted Tier

**Purpose:** Store LLM-processed structured data

**URI Pattern:**

- Memory: `memory://extracted/<sanitized-url>_<timestamp>`
- Filesystem: `file://<root>/extracted/<filename>`

**Content:** Structured data matching the extraction prompt

**When used:**

- When `extract` parameter is provided
- To avoid re-running expensive LLM processing
- For structured data reuse

### Cache Key Generation

Cache keys include:

1. **URL** (normalized) - Canonical form of the URL
2. **Extract prompt** (if provided) - Different prompts = different cache entries
3. **Timestamp** (for uniqueness) - Prevents collisions on rapid requests

**Example:**

```typescript
// Same URL, different extracts = different cache keys
const key1 = generateCacheKey(url, 'Extract pricing');
const key2 = generateCacheKey(url, 'Extract features');
// key1 !== key2
```

### Storage Backends

**Memory Storage** (default):

- Fast in-memory map
- Lost on restart
- No persistence required

**Filesystem Storage:**

- Organized subdirectories: `raw/`, `cleaned/`, `extracted/`
- Persistent across restarts
- Great for debugging (can inspect files directly)

**Qdrant Storage** (future):

- Vector database for semantic search
- Scalable for large deployments
- Enables similarity-based retrieval

---

## Strategy Selection System

Pulse Fetch uses a **multi-strategy fallback cascade** for robust scraping:

```
┌──────────────┐
│ Scrape URL   │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ Native Fetch │ ← Try first (fastest, free)
└──────┬───────┘
       │
    Success? ────Yes───┐
       │               │
      No               │
       │               │
       ▼               │
┌──────────────┐       │
│  Firecrawl   │       │
│     API      │       │
└──────┬───────┘       │
       │               │
    Success? ────Yes───┤
       │               │
      No               │
       │               │
       ▼               ▼
    Error         Process Content
                 ┌──────────────┐
                 │ Clean & Extract│
                 └──────────────┘
```

### Strategy Decision Logic

**Native Fetch** (always attempted first if `OPTIMIZE_FOR=cost`):

- Simple HTTP GET request with `fetch()`
- No JavaScript execution
- Fastest (~500ms)
- Cheapest (free)
- **Fails on:** SPAs, bot detection, JavaScript-required content

**Firecrawl** (if `FIRECRAWL_API_KEY` set):

- Enhanced extraction engine with browser rendering
- Anti-bot bypass built-in
- JavaScript execution support
- Handles most edge cases (SPAs, dynamic content, bot protection)
- Slower (~3-10s)
- Costs API credits
- **Rarely fails** - most robust option

### Configuration

**Cost Optimization** (default):

```env
OPTIMIZE_FOR=cost
```

Tries native → Firecrawl (fallback only when native fails)

**Speed Optimization:**

```env
OPTIMIZE_FOR=speed
```

Skips native, goes straight to Firecrawl (best for sites with heavy bot protection)

**Force Specific Strategy:**

```env
FORCE_STRATEGY=firecrawl
```

Only uses Firecrawl (no fallback)

### URL Pattern Matching

Create custom strategy rules per URL pattern:

**File:** `scraping-strategies.md`

```markdown
## Pattern: Documentation Sites

- Matches: `*.readthedocs.io/*`, `docs.python.org/*`
- Strategy: native
- Reason: Static HTML, no bot protection needed

## Pattern: News Sites

- Matches: `*.reddit.com/*`, `news.ycombinator.com/*`
- Strategy: firecrawl
- Reason: JavaScript rendering required
```

**Configure:**

```env
STRATEGY_CONFIG_PATH=/path/to/scraping-strategies.md
```

---

## Data Flow Diagrams

### Complete Scrape Request Flow

```
MCP Client
    │
    │ POST { tool: "scrape", url: "...", extract: "..." }
    │
    ▼
┌─────────────────┐
│ Transport Layer │ (stdio or HTTP)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Tool Registry   │ Find handler for "scrape"
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Schema Validation│ Zod.parse(args)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Check Cache    │ findByUrlAndExtract(url, extract)
└────────┬────────┘
         │
    Cache Hit? ────Yes──┐
         │              │
        No              │
         │              │
         ▼              │
┌─────────────────┐     │
│ Execute Strategy│     │
│    Cascade      │     │
└────────┬────────┘     │
         │              │
         ▼              │
┌─────────────────┐     │
│ Process Content │     │
│ (Clean, Extract)│     │
└────────┬────────┘     │
         │              │
         ▼              │
┌─────────────────┐     │
│ Write Multi-Tier│     │
│     Cache       │     │
└────────┬────────┘     │
         │              │
         └──────────────┘
         │
         ▼
┌─────────────────┐
│ Build Response  │ MCP format with text + resources
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Return to Client│
└─────────────────┘
```

### Health Check Flow (Remote Server)

```
Server Startup
    │
    ▼
┌─────────────────┐
│ Load Config     │ Validate env vars
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Check API Keys  │ If SKIP_HEALTH_CHECKS=false
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
Firecrawl  Anthropic
API Check  API Check
    │         │
    └────┬────┘
         │
    All Pass? ────No──▶ Log warnings, continue anyway
         │
        Yes
         │
         ▼
┌─────────────────┐
│ Register Tools  │ scrape, search, map, crawl
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Start HTTP      │ Express app.listen(PORT)
│   Server        │
└────────┬────────┘
         │
         ▼
    Server Ready
  (listening on :3060)
```

---

## Key Architectural Decisions

### Why Monorepo?

**Problem:** Code duplication between local and remote implementations

**Solution:** Single shared package with business logic

**Benefits:**

- DRY (Don't Repeat Yourself)
- Single test suite
- Feature parity guaranteed
- Easy to add new transports

### Why Multi-Tier Caching?

**Problem:** Re-scraping is expensive; re-processing is wasteful

**Solution:** Cache at every transformation stage

**Benefits:**

- Can re-clean without re-scraping
- Can change extraction prompts without re-fetching
- Debugging is easier (inspect raw HTML)
- Token efficiency (serve from cleaned tier)

### Why Strategy Cascade?

**Problem:** No single scraping method works for all sites

**Solution:** Try cheap/fast methods first, fall back to robust/expensive

**Benefits:**

- Cost optimization (only use Firecrawl when needed)
- Reliability (fallback ensures success)
- Flexibility (can force specific strategy per URL)

### Why Dependency Injection?

**Problem:** Hard to test code with hardcoded external dependencies

**Solution:** Pass clients and storage as parameters

**Benefits:**

- Testable (can inject mocks)
- Flexible (swap implementations easily)
- Maintainable (clear dependencies)

---

## Performance Characteristics

| Operation           | Latency | Notes                                     |
| ------------------- | ------- | ----------------------------------------- |
| **Cache Hit**       | ~10ms   | Memory lookup                             |
| **Native Fetch**    | ~500ms  | Simple HTTP GET                           |
| **Firecrawl**       | ~3-10s  | API call + browser rendering + processing |
| **LLM Extraction**  | ~2-5s   | Depends on content length                 |
| **Clean (HTML→MD)** | ~100ms  | Local processing                          |

**Total Scrape Time:**

- **Best case** (cached): ~10ms
- **Common case** (native + clean): ~600ms
- **Complex case** (firecrawl + clean + extract): ~8-15s

---

## Scaling Considerations

### Horizontal Scaling (Remote Server)

**Current:** Single-server deployment

**Future:** Multiple servers with shared storage

```
Load Balancer
      │
  ┌───┴───┐
  │       │
Server1 Server2  ← Stateless HTTP servers
  │       │
  └───┬───┘
      │
   Qdrant  ← Shared cache (all servers)
```

### Rate Limiting

**Current:** Not implemented

**Future:** Per-client rate limits via API keys

### Cost Optimization

**Firecrawl Credits:**

- Native fetch: 0 credits
- Firecrawl basic: 1 credit per request
- Firecrawl stealth: 5 credits per request

**Strategy:** Use `OPTIMIZE_FOR=cost` to minimize Firecrawl usage

---

## Next Steps

- **[Getting Started](GETTING_STARTED.md)** - Installation and first scrape
- **[Configuration](CONFIGURATION.md)** - Environment variables reference
- **[Tool Documentation](tools/)** - Detailed tool parameters
- **[Development Guide](DEVELOPMENT.md)** - Contributing guide
