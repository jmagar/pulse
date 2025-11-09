# Pulse Fetch

[![npm version](https://badge.fury.io/js/pulse-crawl-shared.svg)](https://www.npmjs.com/package/pulse-crawl-shared)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Intelligent web content extraction for AI assistants** - An MCP server that scrapes, searches, maps, and crawls the web with smart fallback strategies and LLM-powered extraction.

Haven't heard about MCP yet? The easiest way to keep up-to-date is to read our [weekly newsletter at PulseMCP](https://www.pulsemcp.com/).

## Features

- 🔍 **Four Powerful Tools:**
  - `scrape` - Extract content from any URL with cleaning and extraction
  - `search` - Google search integration for finding relevant pages
  - `map` - Discover site structure and available pages
  - `crawl` - Deep recursive crawling with intelligent link following

- 🧠 **Smart Content Processing:**
  - HTML → Markdown conversion with main content extraction
  - LLM-powered natural language extraction (Anthropic, OpenAI, compatible providers)
  - Multi-tier caching (raw, cleaned, extracted) for efficient reuse

- 🛡️ **Robust Scraping:**
  - Multi-strategy fallback (native fetch → browser → Firecrawl)
  - Configurable optimization modes (cost vs speed)
  - Custom per-URL strategy configuration

- 📦 **Flexible Deployment:**
  - **Local Mode** - Stdio transport for Claude Desktop integration
  - **Remote Mode** - HTTP server for hosted deployments and web integrations

## Quick Start

### Installation

**Option 1: Local Mode (Claude Desktop)**

```bash
git clone https://github.com/your-org/pulse-fetch.git
cd pulse-fetch
npm install
cd local && npm run build
```

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "pulse": {
      "command": "node",
      "args": ["/path/to/pulse-fetch/local/dist/index.js"]
    }
  }
}
```

**Option 2: Remote Mode (Docker)**

```bash
docker compose up -d
```

Server runs on `http://localhost:3060`

[→ Full installation guide](docs/GETTING_STARTED.md#installation)

### Your First Scrape

```json
{
  "url": "https://example.com/article",
  "cleanScrape": true,
  "extract": "Summarize the main points in bullet form"
}
```

[→ More examples in Getting Started](docs/GETTING_STARTED.md#your-first-scrape)

## Tools Overview

| Tool       | Purpose                      | Speed   | Documentation                     |
| ---------- | ---------------------------- | ------- | --------------------------------- |
| **scrape** | Extract content from one URL | ~1-2s   | [SCRAPE.md](docs/tools/SCRAPE.md) |
| **search** | Google search integration    | ~2-3s   | [SEARCH.md](docs/tools/SEARCH.md) |
| **map**    | Discover site structure      | ~5-10s  | [MAP.md](docs/tools/MAP.md)       |
| **crawl**  | Deep multi-page crawling     | ~30-90s | [CRAWL.md](docs/tools/CRAWL.md)   |

[→ When to use which tool](docs/GETTING_STARTED.md#understanding-the-tools)

## Documentation

### For New Users

- **[Getting Started](docs/GETTING_STARTED.md)** - Installation, first scrape, and common patterns
- **[Configuration](docs/CONFIGURATION.md)** - Complete environment variable reference
- **[Tool References](docs/tools/)** - Detailed documentation for each tool

### For Developers

- **[Architecture](docs/ARCHITECTURE.md)** - System design and how components work together
- **[Development Guide](docs/DEVELOPMENT.md)** - Setup, testing, and contribution workflow
- **[API Reference](docs/API_REFERENCE.md)** - Complete tool schemas and parameters

### For Operators

- **[Deployment Guide](docs/DEPLOYMENT.md)** - Production setup and Docker configuration
- **[Troubleshooting](docs/TROUBLESHOOTING.md)** - Common issues and solutions
- **[Performance Guide](docs/PERFORMANCE.md)** - Optimization and caching strategies

## Configuration

**Minimal (works out of the box):**

```env
# No configuration needed!
```

**Recommended (enhanced features):**

```env
FIRECRAWL_API_KEY=your-api-key
LLM_PROVIDER=anthropic
LLM_API_KEY=your-api-key
```

**Production (remote server):**

```env
PORT=3060
NODE_ENV=production
ALLOWED_HOSTS=your-domain.com
FIRECRAWL_API_KEY=your-api-key
MCP_RESOURCE_STORAGE=filesystem
METRICS_AUTH_ENABLED=true
```

[→ Complete configuration guide](docs/CONFIGURATION.md)

## Architecture

Pulse Fetch uses a three-layer architecture that separates business logic from transport concerns:

```
┌─────────────────┐     ┌─────────────────┐
│ local/ (stdio)  │     │ remote/ (HTTP)  │
│  Thin wrapper   │     │  Express server │
└────────┬────────┘     └────────┬────────┘
         │                       │
         └──────────┬────────────┘
                    │
           ┌────────▼────────┐
           │    shared/      │
           │ Business Logic  │
           │  - Tools        │
           │  - Clients      │
           │  - Storage      │
           └─────────────────┘
```

**Key Features:**

- **Monorepo Structure** - Shared business logic, multiple transport implementations
- **Multi-Tier Caching** - Raw HTML, cleaned Markdown, and extracted data
- **Strategy Cascade** - Native fetch → Firecrawl fallback
- **Pluggable Storage** - Memory, Filesystem, or Qdrant backends

[→ Full architecture documentation](docs/ARCHITECTURE.md)

## Development

### Prerequisites

- Node.js 18+ and npm
- Git
- (Optional) Docker for containerized deployment

### Local Development

```bash
# Clone and install
git clone https://github.com/your-org/pulse-fetch.git
cd pulse-fetch
npm install

# Build all packages
npm run build

# Run tests
npm test

# Start local server (stdio)
cd local && npm run dev

# Start remote server (HTTP)
cd remote && npm run dev
```

### Project Structure

```
pulse-fetch/
├── shared/          # Core business logic (published as pulse-crawl-shared)
│   ├── clients/     # Firecrawl, Anthropic integrations
│   ├── mcp/tools/   # Tool implementations
│   └── storage/     # Storage backends
│
├── local/           # Stdio transport for Claude Desktop
│   └── index.ts     # ~50 lines, minimal wrapper
│
├── remote/          # HTTP transport for hosted deployments
│   └── index.ts     # Express.js + StreamableHTTP
│
├── docs/            # Documentation
│   └── tools/       # Tool-specific references
│
└── tests/           # Test suites
    ├── functional/  # Tool and feature tests
    ├── integration/ # End-to-end tests
    └── manual/      # Manual verification tests
```

[→ Contributing guide](docs/DEVELOPMENT.md)

## Why Pulse Fetch?

**For AI Assistants:**

- Bring any web content into context with a single tool call
- Intelligent extraction reduces token usage
- Multi-tier caching avoids redundant scraping

**For Developers:**

- Works with Claude Desktop out of the box (stdio transport)
- HTTP server for web integrations and hosted deployments
- Extensible architecture for custom scrapers and storage backends

**For Production:**

- Smart fallback strategies ensure reliability
- Cost optimization modes minimize API usage
- Horizontal scaling ready with shared storage

## Roadmap

- [x] Core scraping with Firecrawl fallback
- [x] Multi-tier caching (memory, filesystem)
- [x] LLM-powered extraction
- [x] Google search integration
- [x] Site mapping and crawling
- [ ] Qdrant vector storage backend
- [ ] OAuth authentication for remote server
- [ ] Rate limiting and quotas
- [ ] Web-based admin dashboard
- [ ] Plugin system for custom scrapers

## License

MIT © Pulse Fetch Contributors

This project is built and maintained by [PulseMCP](https://www.pulsemcp.com/).

## Support

- **Documentation:** [docs/](docs/)
- **Issues:** [GitHub Issues](https://github.com/your-org/pulse-fetch/issues)
- **Discussions:** [GitHub Discussions](https://github.com/your-org/pulse-fetch/discussions)

---

**Built with:**

- [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) - AI assistant integration
- [Firecrawl](https://firecrawl.dev/) - Enhanced web scraping
- [Anthropic Claude](https://anthropic.com/) - LLM-powered extraction
- TypeScript + Zod - Type safety and validation
