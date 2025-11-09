# Getting Started with Pulse Fetch

Pulse Fetch is an MCP server that intelligently pulls web content into your AI assistant's context through four powerful tools: **scrape**, **search**, **map**, and **crawl**.

## Quick Overview

Pulse Fetch provides two ways to access web content:

- **scrape** - Extract content from a single URL (fastest, most common)
- **search** - Google search integration to find relevant pages
- **map** - Discover all pages available on a website
- **crawl** - Deep recursive crawling with smart link following

All tools support intelligent content extraction using LLMs to pull only the information you need.

---

## Installation

### Option 1: Local Mode (Stdio Transport)

For use with Claude Desktop or other MCP clients that support stdio transport.

**Requirements:**

- Node.js 18+ and npm
- Git

**Setup:**

```bash
# Clone the repository
git clone https://github.com/your-org/pulse.git
cd pulse

# Install dependencies
npm install

# Build the project
cd local && npm run build
```

**Configure Claude Desktop:**

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "pulse": {
      "command": "node",
      "args": ["/path/to/pulse/local/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop and you'll see the Pulse Fetch tools available.

### Option 2: Remote Mode (HTTP Transport)

For hosted/remote access via HTTP with optional SSE streaming.

**Using Docker Compose (Recommended):**

```bash
# Clone and navigate to project
git clone https://github.com/your-org/pulse.git
cd pulse

# Start the server
docker compose up -d

# Verify it's running
curl http://localhost:3060/health
```

**Manual Installation:**

```bash
# Build and start
cd remote
npm install
npm run build
npm start
```

The server runs on port 3060 by default (configurable via `PORT` environment variable).

---

## Your First Scrape

Let's start with the simplest and most common task - scraping content from a single URL.

### Basic Scrape

Get raw content from a page:

```json
{
  "url": "https://example.com",
  "formats": ["markdown"]
}
```

**Returns:** Page content as Markdown (~1-2 seconds)

### Cleaned Scrape (Recommended)

Get main content only, with navigation and ads removed:

```json
{
  "url": "https://example.com/article",
  "formats": ["markdown"],
  "cleanScrape": true
}
```

**Returns:** Clean Markdown with only article content (~1-2 seconds)

**Why use this?** Removes boilerplate (navigation, footers, ads, cookie banners) to save tokens and improve clarity.

### Extract Specific Information

Use natural language to extract only what you need:

```json
{
  "url": "https://example.com/pricing",
  "formats": ["markdown"],
  "extract": "List all pricing tiers with monthly cost and features"
}
```

**Returns:** Structured data matching your request (~3-5 seconds with LLM processing)

**Example output:**

```markdown
Pricing Tiers:

1. Free - $0/month - 100 requests, basic support
2. Pro - $29/month - 10,000 requests, priority support, API access
3. Enterprise - Custom pricing - Unlimited requests, SLA, dedicated support
```

---

## Understanding Result Handling

Pulse Fetch stores scraped content in three tiers (raw, cleaned, extracted) and lets you control what gets returned vs stored.

### Result Handling Modes

**saveAndReturn** (default) - Store and return content:

```json
{
  "url": "https://example.com",
  "resultHandling": "saveAndReturn"
}
```

✅ Best for: Most use cases - you get content now and it's cached for later

**saveOnly** - Store but don't return (saves tokens):

```json
{
  "url": "https://example.com",
  "resultHandling": "saveOnly"
}
```

✅ Best for: Bulk scraping where you'll access content later via MCP resources

**returnOnly** - Return without storing (ephemeral):

```json
{
  "url": "https://example.com",
  "resultHandling": "returnOnly"
}
```

✅ Best for: One-time scrapes you won't need again

---

## Understanding the Tools

### When to Use Each Tool

| Need                      | Tool       | Speed           | Example                         |
| ------------------------- | ---------- | --------------- | ------------------------------- |
| Content from known URL    | **scrape** | Fast (~1-2s)    | Get article from URL            |
| Find relevant pages       | **search** | Fast (~2-3s)    | "Best Python tutorials 2024"    |
| Discover site structure   | **map**    | Medium (~5-10s) | What docs does python.org have? |
| Gather multi-page content | **crawl**  | Slow (~30-90s)  | Get all blog posts from site    |

### Scrape Tool

**Purpose:** Get content from a single specific URL

**When to use:**

- You know the exact page you need
- You want content from one URL
- Fastest option (1-2 seconds)

**Example:**

```json
{
  "url": "https://docs.python.org/3/library/asyncio.html",
  "formats": ["markdown"],
  "cleanScrape": true,
  "extract": "Explain asyncio.create_task() with example code"
}
```

### Search Tool

**Purpose:** Google search integration to find relevant pages

**When to use:**

- You need to find URLs first
- You want current/recent information
- You're researching a topic

**Example:**

```json
{
  "query": "FastAPI async database best practices",
  "maxResults": 5
}
```

**Returns:** List of URLs with titles and snippets - then use `scrape` on interesting results.

### Map Tool

**Purpose:** Discover what pages exist on a website

**When to use:**

- You want to see site structure
- You need to find specific documentation
- You're exploring an unfamiliar site

**Example:**

```json
{
  "url": "https://fastapi.tiangolo.com",
  "search": "database"
}
```

**Returns:** List of all pages on the site, filtered by your search term.

### Crawl Tool

**Purpose:** Deep recursive crawling across multiple related pages

**When to use:**

- You need content from multiple pages
- Pages are linked together (blog posts, docs sections)
- You want comprehensive coverage of a topic

**Example:**

```json
{
  "url": "https://example.com/blog",
  "limit": 10,
  "extract": "Summarize main points from each blog post"
}
```

**Returns:** Content from up to 10 pages, following links automatically (~30-90 seconds).

---

## Common Patterns

### Pattern 1: Research a Topic

**Goal:** Find and read authoritative content on a topic

**Workflow:**

1. Use `search` to find relevant pages
2. Review results and select best URLs
3. Use `scrape` with `extract` on selected URLs

**Example:**

```json
// Step 1: Search
{
  "query": "PostgreSQL connection pooling production",
  "maxResults": 5
}

// Step 2: Scrape best result
{
  "url": "https://www.postgresql.org/docs/current/runtime-config-connection.html",
  "cleanScrape": true,
  "extract": "Best practices for connection pool sizing in production"
}
```

### Pattern 2: Explore Documentation

**Goal:** Understand what documentation is available on a site

**Workflow:**

1. Use `map` to discover all pages
2. Use `scrape` on relevant pages

**Example:**

```json
// Step 1: Map the site
{
  "url": "https://docs.anthropic.com",
  "search": "API"
}

// Step 2: Scrape specific docs
{
  "url": "https://docs.anthropic.com/en/api/messages",
  "cleanScrape": true
}
```

### Pattern 3: Gather Multi-Page Content

**Goal:** Get comprehensive information spread across multiple pages

**Workflow:**

1. Use `crawl` with appropriate depth/limit
2. Use `extract` to structure the gathered content

**Example:**

```json
{
  "url": "https://example.com/blog",
  "limit": 20,
  "extract": "Create a list of all blog post titles, dates, and main topics",
  "cleanScrape": true
}
```

---

## Configuration (Quick Reference)

**Essential environment variables:**

```env
# Firecrawl API (for enhanced scraping)
FIRECRAWL_API_KEY=your-api-key-here

# LLM for extraction (optional - only needed for extract parameter)
LLM_PROVIDER=anthropic
LLM_API_KEY=your-api-key-here
LLM_MODEL=claude-sonnet-4-20250514
```

**Storage options:**

```env
# Memory (default) - fast, lost on restart
MCP_RESOURCE_STORAGE=memory

# Filesystem - persistent, survives restarts
MCP_RESOURCE_STORAGE=filesystem
MCP_RESOURCE_FILESYSTEM_ROOT=/path/to/storage
```

For complete configuration reference, see [CONFIGURATION.md](CONFIGURATION.md).

---

## Next Steps

- **[Configuration Guide](CONFIGURATION.md)** - Complete environment variable reference
- **[Architecture Overview](ARCHITECTURE.md)** - How Pulse Fetch works under the hood
- **Tool Documentation:**
  - [Scrape Tool](docs/tools/SCRAPE.md) - Complete parameter reference
  - [Search Tool](docs/tools/SEARCH.md) - Google search options
  - [Map Tool](docs/tools/MAP.md) - Site discovery options
  - [Crawl Tool](docs/tools/CRAWL.md) - Deep crawling parameters

---

## Troubleshooting

### "No such file or directory" when starting local server

Make sure you've built the project:

```bash
cd local && npm run build
```

### Scraping fails with "401 Unauthorized"

Check your Firecrawl API key:

```bash
# Verify it's set
echo $FIRECRAWL_API_KEY
```

### Extraction returns empty results

Verify LLM configuration:

```env
LLM_PROVIDER=anthropic
LLM_API_KEY=your-actual-key-here
LLM_MODEL=claude-sonnet-4-20250514
```

### Need more help?

- Check [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for common issues
- Review tool-specific docs in `docs/tools/`
- Open an issue on GitHub
