# Configuration Reference

Complete guide to configuring Pulse Fetch for your environment.

## Quick Start

**Minimum configuration** (works with defaults):

```env
# No configuration needed! Pulse Fetch works out of the box.
```

**Recommended configuration** (enhanced features):

```env
# Enhanced scraping with Firecrawl
FIRECRAWL_API_KEY=your-firecrawl-api-key

# Enable extraction feature
LLM_PROVIDER=anthropic
LLM_API_KEY=your-anthropic-api-key
```

**Production configuration** (remote server):

```env
PORT=3060
NODE_ENV=production
ALLOWED_HOSTS=your-domain.com
FIRECRAWL_API_KEY=your-firecrawl-api-key
MCP_RESOURCE_STORAGE=filesystem
```

---

## Environment Variables Reference

### HTTP Server Configuration

**Remote implementation only** - These settings control the HTTP server for remote/hosted deployments.

| Variable              | Type    | Default       | Description                                                                         |
| --------------------- | ------- | ------------- | ----------------------------------------------------------------------------------- |
| `PORT`                | number  | `3060`        | HTTP server port                                                                    |
| `NODE_ENV`            | string  | `development` | Environment mode: `development`, `production`, `test`                               |
| `ALLOWED_ORIGINS`     | string  | `*`           | Comma-separated CORS origins (e.g., `https://app.com,http://localhost:3000`)        |
| `ALLOWED_HOSTS`       | string  | -             | Comma-separated allowed Host headers for DNS rebinding protection (production only) |
| `ENABLE_RESUMABILITY` | boolean | `false`       | Enable session resumability using event store                                       |
| `ENABLE_OAUTH`        | boolean | `false`       | Enable OAuth authentication (not yet implemented)                                   |

**Example production server configuration:**

```env
PORT=3060
NODE_ENV=production
ALLOWED_ORIGINS=https://app.example.com,https://admin.example.com
ALLOWED_HOSTS=api.example.com,api.example.com:3060
ENABLE_RESUMABILITY=true
```

### Security & Metrics

| Variable               | Type    | Default | Description                                     |
| ---------------------- | ------- | ------- | ----------------------------------------------- |
| `METRICS_AUTH_ENABLED` | boolean | `false` | Require authentication for `/metrics` endpoints |
| `METRICS_AUTH_KEY`     | string  | -       | Secret key for metrics access (if auth enabled) |

**Example metrics authentication:**

```env
METRICS_AUTH_ENABLED=true
METRICS_AUTH_KEY=your-secret-key-here
```

Access metrics:

```bash
curl -H "X-Metrics-Key: your-secret-key-here" http://localhost:3060/metrics
# or
curl "http://localhost:3060/metrics?key=your-secret-key-here"
```

### Logging & Debugging

| Variable      | Type    | Default | Description                                                |
| ------------- | ------- | ------- | ---------------------------------------------------------- |
| `DEBUG`       | boolean | `false` | Enable debug-level logging regardless of NODE_ENV          |
| `LOG_FORMAT`  | string  | `text`  | Log format: `text` (human-readable) or `json` (structured) |
| `NO_COLOR`    | any     | -       | Set to any value to disable ANSI colors in output          |
| `FORCE_COLOR` | string  | -       | Set to `1` to force enable colors, `0` to disable          |

**Example development logging:**

```env
DEBUG=true
LOG_FORMAT=text
FORCE_COLOR=1
```

**Example production logging:**

```env
NODE_ENV=production
LOG_FORMAT=json
NO_COLOR=1
```

### Scraping Services

| Variable               | Type   | Default                     | Description                                                                  |
| ---------------------- | ------ | --------------------------- | ---------------------------------------------------------------------------- |
| `FIRECRAWL_API_KEY`    | string | -                           | Firecrawl API key for enhanced scraping (get at firecrawl.dev)               |
| `FIRECRAWL_BASE_URL`   | string | `https://api.firecrawl.dev` | Firecrawl API base URL (for self-hosted instances)                           |
| `OPTIMIZE_FOR`         | string | `cost`                      | Strategy optimization: `cost` (native→firecrawl) or `speed` (firecrawl only) |
| `STRATEGY_CONFIG_PATH` | string | OS temp dir                 | Path to markdown file with URL-specific strategy overrides                   |

**Strategy Optimization Modes:**

**Cost Mode** (default) - Minimize API costs:

```env
OPTIMIZE_FOR=cost
```

- Tries native fetch first (free, fast)
- Falls back to Firecrawl on failure (paid, robust)
- Best for: Most users, mixed content, budget-conscious deployments

**Speed Mode** - Maximize reliability:

```env
OPTIMIZE_FOR=speed
```

- Uses Firecrawl directly (skips native fetch)
- Best for: Self-hosted Firecrawl, sites with heavy bot protection

**Custom Strategy Configuration:**

Create a markdown file with URL-specific overrides:

```markdown
# Scraping Strategy Configuration

## Pattern: news sites

- Matches: `news.ycombinator.com`, `reddit.com/r/*`
- Strategy: firecrawl
- Reason: Heavy JavaScript, requires browser rendering

## Pattern: documentation sites

- Matches: `docs.python.org/*`, `*.readthedocs.io/*`
- Strategy: native
- Reason: Static HTML, no anti-bot measures
```

Then set:

```env
STRATEGY_CONFIG_PATH=/path/to/scraping-strategies.md
```

### Map Tool Configuration

| Variable                   | Type   | Default | Description                                                 |
| -------------------------- | ------ | ------- | ----------------------------------------------------------- |
| `MAP_DEFAULT_COUNTRY`      | string | `US`    | ISO 3166-1 alpha-2 country code (determines proxy location) |
| `MAP_DEFAULT_LANGUAGES`    | string | `en-US` | Comma-separated Accept-Language values                      |
| `MAP_MAX_RESULTS_PER_PAGE` | number | `200`   | Maximum URLs returned per response (controls token usage)   |

**Example international configuration:**

```env
MAP_DEFAULT_COUNTRY=JP
MAP_DEFAULT_LANGUAGES=ja-JP,en-US
MAP_MAX_RESULTS_PER_PAGE=100
```

**Token Usage Guide:**

| Max Results | Approx Tokens | Use Case                                           |
| ----------- | ------------- | -------------------------------------------------- |
| 100         | ~6.5k         | Ultra-efficient, budget-conscious                  |
| 200         | ~13k          | Default, balanced                                  |
| 500         | ~32k          | Large sites, higher token limit models             |
| 1000        | ~65k          | Comprehensive mapping (may exceed some LLM limits) |

### Resource Storage

Pulse Fetch caches scraped content in three tiers: **raw** (original HTML), **cleaned** (Markdown), and **extracted** (LLM-processed).

| Variable                       | Type   | Default     | Description                                                     |
| ------------------------------ | ------ | ----------- | --------------------------------------------------------------- |
| `MCP_RESOURCE_STORAGE`         | string | `memory`    | Storage backend: `memory` or `filesystem`                       |
| `MCP_RESOURCE_FILESYSTEM_ROOT` | string | OS temp dir | Directory for filesystem storage (only if `filesystem` backend) |
| `MCP_RESOURCE_TTL`             | number | `86400`     | Resource time-to-live in seconds (0 = infinite)                 |
| `MCP_RESOURCE_MAX_SIZE`        | number | `100`       | Maximum total cache size in MB                                  |
| `MCP_RESOURCE_MAX_ITEMS`       | number | `1000`      | Maximum number of cached resources                              |

**Storage Backend Comparison:**

| Backend        | Pros                   | Cons               | Best For                                     |
| -------------- | ---------------------- | ------------------ | -------------------------------------------- |
| **memory**     | Fast, no setup         | Lost on restart    | Development, testing, stateless deployments  |
| **filesystem** | Persistent, debuggable | Slower than memory | Local development, single-server deployments |

**Memory Storage** (default):

```env
MCP_RESOURCE_STORAGE=memory
MCP_RESOURCE_MAX_SIZE=100
MCP_RESOURCE_MAX_ITEMS=1000
```

**Filesystem Storage:**

```env
MCP_RESOURCE_STORAGE=filesystem
MCP_RESOURCE_FILESYSTEM_ROOT=/var/cache/pulse
MCP_RESOURCE_TTL=0
MCP_RESOURCE_MAX_SIZE=500
```

### LLM Provider (Extract Feature)

The `extract` parameter on scrape/crawl tools uses LLMs to intelligently extract structured data from web content.

| Variable           | Type   | Default          | Description                                                 |
| ------------------ | ------ | ---------------- | ----------------------------------------------------------- |
| `LLM_PROVIDER`     | string | -                | LLM provider: `anthropic`, `openai`, or `openai-compatible` |
| `LLM_API_KEY`      | string | -                | API key for your LLM provider                               |
| `LLM_MODEL`        | string | Provider default | Model name (see defaults below)                             |
| `LLM_API_BASE_URL` | string | Provider default | API base URL (for `openai-compatible` only)                 |

**Provider Defaults:**

| Provider            | Default Model              | API URL                     |
| ------------------- | -------------------------- | --------------------------- |
| `anthropic`         | `claude-sonnet-4-20250514` | `https://api.anthropic.com` |
| `openai`            | `gpt-4.1-mini`             | `https://api.openai.com/v1` |
| `openai-compatible` | Must specify               | Must specify                |

**Anthropic Configuration:**

```env
LLM_PROVIDER=anthropic
LLM_API_KEY=sk-ant-xxxxx
# Optional: override default model
LLM_MODEL=claude-sonnet-4-20250514
```

**OpenAI Configuration:**

```env
LLM_PROVIDER=openai
LLM_API_KEY=sk-xxxxx
# Optional: override default model
LLM_MODEL=gpt-4.1-mini
```

**OpenAI-Compatible Providers:**

For Together.ai:

```env
LLM_PROVIDER=openai-compatible
LLM_API_KEY=your-together-api-key
LLM_API_BASE_URL=https://api.together.xyz/v1
LLM_MODEL=meta-llama/Llama-3-70b-chat-hf
```

For Groq:

```env
LLM_PROVIDER=openai-compatible
LLM_API_KEY=your-groq-api-key
LLM_API_BASE_URL=https://api.groq.com/openai/v1
LLM_MODEL=llama-3.1-70b-versatile
```

**Example extraction request:**

```json
{
  "url": "https://example.com/pricing",
  "extract": "Extract all pricing tiers with features and costs"
}
```

### Health Checks

| Variable             | Type    | Default | Description                               |
| -------------------- | ------- | ------- | ----------------------------------------- |
| `SKIP_HEALTH_CHECKS` | boolean | `false` | Skip API authentication checks at startup |

**When to skip health checks:**

```env
# Development with no API keys configured
SKIP_HEALTH_CHECKS=true

# Self-hosted Firecrawl without authentication
SKIP_HEALTH_CHECKS=true
```

**Production deployments** should NOT skip health checks - they verify your API keys are valid at startup.

---

## Configuration Examples

### Local Development (Minimal)

```env
# Works out of the box with no configuration!
# Optional: enable debug logging
DEBUG=true
```

### Local Development (Full Features)

```env
# Debugging
DEBUG=true
LOG_FORMAT=text

# Firecrawl for enhanced scraping
FIRECRAWL_API_KEY=your-key-here

# LLM for extraction
LLM_PROVIDER=anthropic
LLM_API_KEY=your-anthropic-key

# Filesystem storage for persistence
MCP_RESOURCE_STORAGE=filesystem
MCP_RESOURCE_FILESYSTEM_ROOT=./.cache/pulse
```

### Production (HTTP Server)

```env
# Server configuration
PORT=3060
NODE_ENV=production
ALLOWED_ORIGINS=https://app.example.com
ALLOWED_HOSTS=api.example.com,api.example.com:3060

# Metrics security
METRICS_AUTH_ENABLED=true
METRICS_AUTH_KEY=your-secret-metrics-key

# Structured logging
LOG_FORMAT=json
NO_COLOR=1

# Scraping services
FIRECRAWL_API_KEY=your-firecrawl-api-key
OPTIMIZE_FOR=cost

# LLM for extraction
LLM_PROVIDER=anthropic
LLM_API_KEY=your-anthropic-key
LLM_MODEL=claude-sonnet-4-20250514

# Persistent storage
MCP_RESOURCE_STORAGE=filesystem
MCP_RESOURCE_FILESYSTEM_ROOT=/var/cache/pulse
MCP_RESOURCE_TTL=0
MCP_RESOURCE_MAX_SIZE=1000

# Enable session resumability
ENABLE_RESUMABILITY=true
```

### Self-Hosted Firecrawl

```env
# Point to your self-hosted instance
FIRECRAWL_BASE_URL=https://firecrawl.your-domain.com
FIRECRAWL_API_KEY=self-hosted-no-auth

# Optimize for speed (skip native fetch)
OPTIMIZE_FOR=speed

# Skip health checks (self-hosted may not require auth)
SKIP_HEALTH_CHECKS=true
```

---

## Environment-Specific Configurations

### Docker Compose

Create a `.env` file in your project root:

```env
PORT=3060
NODE_ENV=production
FIRECRAWL_API_KEY=your-key
LLM_PROVIDER=anthropic
LLM_API_KEY=your-key
```

Docker Compose automatically loads `.env` variables.

### Claude Desktop (Local Mode)

Set environment variables in your shell profile (`~/.bashrc`, `~/.zshrc`):

```bash
export FIRECRAWL_API_KEY=your-key
export LLM_PROVIDER=anthropic
export LLM_API_KEY=your-key
```

Or configure per-session in `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "pulse": {
      "command": "node",
      "args": ["/path/to/pulse/local/dist/index.js"],
      "env": {
        "FIRECRAWL_API_KEY": "your-key",
        "LLM_PROVIDER": "anthropic",
        "LLM_API_KEY": "your-key"
      }
    }
  }
}
```

### Systemd Service

Create `/etc/systemd/system/pulse.service`:

```ini
[Unit]
Description=Pulse Fetch MCP Server
After=network.target

[Service]
Type=simple
User=pulse
WorkingDirectory=/opt/pulse
ExecStart=/usr/bin/node /opt/pulse/remote/dist/index.js
Restart=always

# Environment variables
Environment=PORT=3060
Environment=NODE_ENV=production
Environment=FIRECRAWL_API_KEY=your-key
Environment=LLM_PROVIDER=anthropic
Environment=LLM_API_KEY=your-key

[Install]
WantedBy=multi-user.target
```

---

## Troubleshooting Configuration

### Verify environment variables are loaded

```bash
# Check if variable is set
echo $FIRECRAWL_API_KEY

# List all Pulse-related variables
env | grep -E "(FIRECRAWL|LLM|MCP)"
```

### Test Firecrawl connection

```bash
curl -X POST https://api.firecrawl.dev/v1/scrape \
  -H "Authorization: Bearer $FIRECRAWL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'
```

### Test LLM connection (Anthropic)

```bash
curl -X POST https://api.anthropic.com/v1/messages \
  -H "x-api-key: $LLM_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet-4-20250514",
    "max_tokens": 100,
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

### Check server health

```bash
# Local health check
curl http://localhost:3060/health

# Should return: {"status":"healthy","timestamp":"..."}
```

---

## Security Best Practices

1. **Never commit `.env` files** - Use `.env.example` as a template
2. **Use environment-specific keys** - Different keys for dev/staging/prod
3. **Enable metrics auth in production** - Protect `/metrics` endpoints
4. **Set ALLOWED_HOSTS** - Prevent DNS rebinding attacks
5. **Rotate API keys regularly** - Update Firecrawl and LLM keys periodically
6. **Use read-only filesystem storage** - If possible, restrict write permissions
7. **Monitor metrics** - Track usage and detect anomalies

---

## Next Steps

- **[Getting Started](GETTING_STARTED.md)** - First scrape tutorial
- **[Architecture Overview](ARCHITECTURE.md)** - How configuration affects system behavior
- **[Tool Documentation](tools/)** - Tool-specific parameters
- **[Troubleshooting Guide](TROUBLESHOOTING.md)** - Common configuration issues
