# Troubleshooting Guide

Common issues and solutions for Pulse Fetch MCP server.

## Quick Diagnostics

Before diving into specific issues, run these quick checks:

```bash
# Check health endpoint (remote mode only)
curl http://localhost:3060/health

# Verify environment variables are loaded
env | grep -E "(FIRECRAWL|LLM|MCP|PORT)"

# Check server logs for errors
docker compose logs -f pulse  # Remote mode
# or check Claude Desktop logs for local mode
```

---

## Installation Issues

### Issue: "Cannot find module '@modelcontextprotocol/sdk'"

**Symptoms:**

```
Error: Cannot find module '@modelcontextprotocol/sdk/server/index.js'
```

**Cause:** Dependencies not installed or package-lock.json out of sync

**Solutions:**

```bash
# From project root
npm install

# If that doesn't work, clean install
rm -rf node_modules package-lock.json
rm -rf shared/node_modules shared/package-lock.json
rm -rf local/node_modules local/package-lock.json
rm -rf remote/node_modules remote/package-lock.json
npm install

# Rebuild
npm run build
```

### Issue: "Permission denied" when running local mode

**Symptoms:**

```
EACCES: permission denied, open '/path/to/pulse/local/dist/index.js'
```

**Cause:** Executable permissions not set or file doesn't exist

**Solutions:**

```bash
# Ensure build has run
cd local
npm run build

# Check file exists
ls -la dist/index.js

# Make executable (if needed)
chmod +x dist/index.js
```

### Issue: Build fails with TypeScript errors

**Symptoms:**

```
error TS2307: Cannot find module 'shared/types' or its corresponding type declarations
```

**Cause:** Shared package not built before local/remote

**Solutions:**

```bash
# Build in correct order
cd shared && npm run build
cd ../local && npm run build
cd ../remote && npm run build

# Or from root (does this automatically)
npm run build
```

---

## API Authentication Failures

### Issue: "Invalid API key - authentication failed"

**Symptoms:**

- Server exits with code 1 at startup
- Error message: `"Invalid API key - authentication failed"`
- Health check fails for Firecrawl

**Cause:** Invalid or missing `FIRECRAWL_API_KEY`

**Solutions:**

1. **Verify API key is set:**

   ```bash
   echo $FIRECRAWL_API_KEY
   # Should print your key, not empty
   ```

2. **Test Firecrawl API directly:**

   ```bash
   curl -X POST https://api.firecrawl.dev/v1/scrape \
     -H "Authorization: Bearer $FIRECRAWL_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"url": "https://example.com"}'
   ```

3. **Check for typos:**
   - No spaces before/after the key in `.env`
   - No quotes around the key (unless part of the key itself)
   - Key format: `fc-...` (Firecrawl) or your custom format

4. **Get a new API key:**
   - Visit [firecrawl.dev](https://firecrawl.dev)
   - Sign up or log in
   - Generate new API key
   - Update `.env` file

5. **Skip health checks (not recommended for production):**
   ```bash
   SKIP_HEALTH_CHECKS=true npm start
   ```

### Issue: "Payment required" error (HTTP 402)

**Symptoms:**

```
Firecrawl API error: 402 Payment Required
```

**Cause:** Firecrawl account credits exhausted or plan upgrade needed

**Solutions:**

1. **Check your Firecrawl billing:**
   - Visit [firecrawl.dev/billing](https://firecrawl.dev/billing)
   - Check credit balance
   - Upgrade plan or add credits

2. **Use cost optimization mode:**

   ```bash
   # Try native fetch first, Firecrawl as fallback
   OPTIMIZE_FOR=cost
   ```

3. **Use self-hosted Firecrawl:**
   ```bash
   FIRECRAWL_BASE_URL=http://localhost:3002
   FIRECRAWL_API_KEY=self-hosted-no-auth
   SKIP_HEALTH_CHECKS=true
   ```

### Issue: LLM provider authentication fails

**Symptoms:**

```
Anthropic extraction failed: API key invalid
```

**Cause:** Invalid or missing `LLM_API_KEY`

**Solutions:**

1. **Verify API key:**

   ```bash
   echo $LLM_API_KEY
   ```

2. **Test Anthropic API directly:**

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

3. **Check provider configuration:**
   ```bash
   # Ensure provider matches your API key
   LLM_PROVIDER=anthropic  # for Anthropic keys
   LLM_PROVIDER=openai     # for OpenAI keys
   ```

---

## Port Conflicts and Service Health

### Issue: "Port 3060 already in use"

**Symptoms:**

```
Error: listen EADDRINUSE: address already in use :::3060
```

**Cause:** Another process is using port 3060

**Solutions:**

1. **Find process using port:**

   ```bash
   lsof -i :3060
   # or
   ss -tuln | grep 3060
   ```

2. **Stop conflicting process:**

   ```bash
   # If it's a previous instance
   docker compose down
   # or kill process by PID
   kill <PID>
   ```

3. **Use different port:**

   ```bash
   # In .env
   PORT=3061

   # Or inline
   PORT=3061 npm start
   ```

### Issue: Health check endpoint returns 404

**Symptoms:**

```bash
curl http://localhost:3060/health
# Returns: 404 Not Found
```

**Cause:** Server not running or wrong port

**Solutions:**

1. **Check server is running:**

   ```bash
   docker compose ps        # Remote mode
   # or
   ps aux | grep pulse      # Local mode
   ```

2. **Verify port configuration:**

   ```bash
   # Check .env
   cat .env | grep PORT

   # Check Docker port mapping
   docker compose ps | grep pulse
   ```

3. **Check server logs:**
   ```bash
   docker compose logs pulse | tail -50
   ```

### Issue: Container keeps restarting

**Symptoms:**

```bash
docker compose ps
# Shows: Restarting (1)
```

**Cause:** Health check failing or startup error

**Solutions:**

1. **Check container logs:**

   ```bash
   docker compose logs pulse
   ```

2. **Common causes:**
   - Missing required environment variables
   - Invalid API keys (health check fails)
   - Port already in use inside container
   - Volume mount permission issues

3. **Test without health check:**
   ```bash
   # Temporarily remove healthcheck from docker-compose.yml
   docker compose up -d
   docker compose logs -f
   ```

---

## Cache and Storage Issues

### Issue: "Resource not found" for recently scraped content

**Symptoms:**

- Content was scraped successfully
- Later requests return "Resource not found"

**Cause:** TTL expired or cache evicted

**Solutions:**

1. **Check TTL configuration:**

   ```bash
   echo $MCP_RESOURCE_TTL
   # Default: 86400 (24 hours)
   ```

2. **Increase TTL:**

   ```bash
   # In .env
   MCP_RESOURCE_TTL=604800  # 1 week
   # or
   MCP_RESOURCE_TTL=0       # Infinite
   ```

3. **Check cache size limits:**
   ```bash
   # Increase cache size
   MCP_RESOURCE_MAX_SIZE=500    # 500 MB
   MCP_RESOURCE_MAX_ITEMS=5000  # 5000 items
   ```

### Issue: "Permission denied" when using filesystem storage

**Symptoms:**

```
EACCES: permission denied, mkdir '/app/resources/raw'
```

**Cause:** Docker container user doesn't have write permissions

**Solutions:**

1. **Fix volume permissions:**

   ```bash
   # On host machine
   mkdir -p ./resources
   chmod 777 ./resources  # Or more restrictive: 755

   # If using specific user in Docker
   chown -R 1001:1001 ./resources
   ```

2. **Use memory storage instead (for testing):**
   ```bash
   MCP_RESOURCE_STORAGE=memory
   ```

### Issue: Cache not persisting across restarts

**Symptoms:**

- Scraped content disappears after restart
- Always re-fetches same content

**Cause:** Using memory storage or missing volume mount

**Solutions:**

1. **Switch to filesystem storage:**

   ```bash
   # In .env
   MCP_RESOURCE_STORAGE=filesystem
   MCP_RESOURCE_FILESYSTEM_ROOT=/app/resources
   ```

2. **Verify volume mount in docker-compose.yml:**

   ```yaml
   volumes:
     - ./resources:/app/resources
   ```

3. **Check volume exists:**
   ```bash
   docker compose down
   docker volume ls | grep pulse
   docker compose up -d
   ```

---

## Network and Timeout Errors

### Issue: "Request timeout" when scraping

**Symptoms:**

```
Failed to scrape https://example.com: Request timeout
```

**Cause:** Website slow to respond or timeout too short

**Solutions:**

1. **Increase timeout:**

   ```json
   {
     "url": "https://slow-website.com",
     "timeout": 120000 // 2 minutes
   }
   ```

2. **Use Firecrawl instead of native:**

   ```bash
   OPTIMIZE_FOR=speed  # Skips native fetch, uses Firecrawl
   ```

3. **Check network connectivity:**
   ```bash
   # Test from Docker container
   docker exec pulse curl -I https://example.com
   ```

### Issue: "Network error connecting to Firecrawl API"

**Symptoms:**

```
Network error connecting to Firecrawl API. Please check your internet connection
```

**Cause:** Firewall blocking outbound connections or DNS issues

**Solutions:**

1. **Test connectivity:**

   ```bash
   curl -I https://api.firecrawl.dev
   ```

2. **Check Docker DNS:**

   ```yaml
   # In docker-compose.yml
   services:
     pulse:
       dns:
         - 8.8.8.8
         - 8.8.4.4
   ```

3. **Use custom Firecrawl URL:**
   ```bash
   FIRECRAWL_BASE_URL=http://your-proxy:3002
   ```

### Issue: "HTTP 403: Forbidden" errors

**Symptoms:**

```
Failed to scrape: HTTP 403: Forbidden
```

**Cause:** Website blocking bot traffic or requires authentication

**Solutions:**

1. **Use Firecrawl's stealth mode:**

   ```json
   {
     "url": "https://protected-site.com",
     "proxy": "stealth"
   }
   ```

2. **Add custom headers:**

   ```json
   {
     "url": "https://protected-site.com",
     "headers": {
       "User-Agent": "Mozilla/5.0...",
       "Referer": "https://google.com"
     }
   }
   ```

3. **Use learned strategy config:**

   ```bash
   # Create strategy-config.md
   STRATEGY_CONFIG_PATH=/path/to/strategy-config.md
   ```

   ```markdown
   # strategy-config.md

   ## Pattern: Protected sites

   - Matches: `protected-site.com/*`
   - Strategy: firecrawl
   - Reason: Requires anti-bot bypass
   ```

---

## Validation and Parameter Errors

### Issue: "Invalid arguments: url: Required"

**Symptoms:**

```
Invalid arguments: url: Required
```

**Cause:** Missing required `url` parameter

**Solution:**

```json
{
  "url": "https://example.com" // Required
}
```

### Issue: "Invalid arguments: timeout: Expected number, received string"

**Symptoms:**

```
Invalid arguments: timeout: Expected number, received string
```

**Cause:** Timeout passed as string instead of number

**Solution:**

```json
{
  "url": "https://example.com",
  "timeout": 60000 // Number, not "60000"
}
```

### Issue: "Screenshot format requires FIRECRAWL_API_KEY"

**Symptoms:**

```
Screenshot format requires FIRECRAWL_API_KEY environment variable
```

**Cause:** Requesting screenshot without Firecrawl configured

**Solutions:**

1. **Add Firecrawl API key:**

   ```bash
   FIRECRAWL_API_KEY=your-key-here
   ```

2. **Remove screenshot from formats:**
   ```json
   {
     "url": "https://example.com",
     "formats": ["markdown", "html"] // No "screenshot"
   }
   ```

---

## Extraction Issues

### Issue: Extraction returns "LLM provider not configured"

**Symptoms:**

- Extract parameter ignored
- No extraction occurs
- Warning in logs

**Cause:** Missing LLM provider configuration

**Solutions:**

1. **Configure LLM provider:**

   ```bash
   LLM_PROVIDER=anthropic
   LLM_API_KEY=your-anthropic-key
   ```

2. **Verify provider is available:**
   ```bash
   # Check startup logs
   docker compose logs pulse | grep "LLM"
   # Should show: "✓ LLM Provider: anthropic"
   ```

### Issue: Extraction fails with "Model not found"

**Symptoms:**

```
Anthropic extraction failed: Model 'invalid-model' not found
```

**Cause:** Invalid model name for provider

**Solutions:**

1. **Use correct model name:**

   ```bash
   # Anthropic
   LLM_MODEL=claude-sonnet-4-20250514

   # OpenAI
   LLM_MODEL=gpt-4.1-mini
   ```

2. **Remove model override (use defaults):**
   ```bash
   # Comment out or remove
   # LLM_MODEL=...
   ```

---

## DNS Rebinding Protection (Production)

### Issue: "Host header validation failed"

**Symptoms (remote mode, NODE_ENV=production):**

```
403 Forbidden
Host header validation failed
```

**Cause:** Request `Host` header not in `ALLOWED_HOSTS` whitelist

**Solutions:**

1. **Add host to whitelist:**

   ```bash
   ALLOWED_HOSTS=api.example.com,api.example.com:3060,localhost:3060
   ```

2. **Include port in host header:**

   ```bash
   # If accessing via port, include it
   curl -H "Host: api.example.com:3060" http://api.example.com:3060/health
   ```

3. **Disable for testing (NOT for production):**
   ```bash
   NODE_ENV=development  # Disables DNS rebinding protection
   ```

### Issue: CORS errors in browser

**Symptoms:**

```
Access to fetch at 'http://localhost:3060/mcp' from origin 'http://localhost:3000'
has been blocked by CORS policy
```

**Cause:** Origin not in `ALLOWED_ORIGINS` list

**Solutions:**

1. **Add origin to whitelist:**

   ```bash
   ALLOWED_ORIGINS=http://localhost:3000,https://app.example.com
   ```

2. **Use wildcard (development only):**
   ```bash
   ALLOWED_ORIGINS=*
   ```

---

## "It Worked Yesterday" Debugging Flowchart

```
┌─────────────────────────────────────────┐
│ Scraping failed unexpectedly?           │
└─────────────┬───────────────────────────┘
              │
              ▼
     ┌────────────────────┐
     │ Check API credits  │
     │ firecrawl.dev      │
     └────────┬───────────┘
              │
       ┌──────┴──────┐
       │             │
    Depleted      Plenty
       │             │
       ▼             ▼
  Add credits   ┌────────────────┐
                │ Check API keys │
                │ still valid?   │
                └────┬───────────┘
                     │
              ┌──────┴──────┐
              │             │
           Invalid       Valid
              │             │
              ▼             ▼
        Regenerate    ┌─────────────────┐
        API key       │ Check cache TTL │
                      │ expired?        │
                      └────┬────────────┘
                           │
                    ┌──────┴──────┐
                    │             │
                 Expired      Valid
                    │             │
                    ▼             ▼
              Increase TTL   ┌──────────────┐
              or rescrape    │ Check site   │
                             │ changed?     │
                             └────┬─────────┘
                                  │
                           ┌──────┴──────┐
                           │             │
                        Changed      Same
                           │             │
                           ▼             ▼
                    forceRescrape   Check logs
                    =true           for errors
```

---

## Getting More Help

### Enable Debug Logging

```bash
DEBUG=true npm start
```

This provides detailed logging of:

- Strategy selection decisions
- Cache lookups and hits/misses
- API requests and responses
- Error stack traces

### Check Metrics (Remote Mode)

```bash
# Get current metrics
curl http://localhost:3060/metrics

# With authentication
curl -H "X-Metrics-Key: your-secret-key" http://localhost:3060/metrics
```

### Report Issues

When reporting issues, include:

1. **Environment details:**

   ```bash
   node --version
   npm --version
   docker --version
   echo $NODE_ENV
   ```

2. **Relevant logs:**

   ```bash
   # Last 50 lines
   docker compose logs pulse | tail -50
   ```

3. **Configuration (redact API keys):**

   ```bash
   env | grep -E "(MCP|FIRECRAWL|LLM)" | sed 's/=.*/=***/'
   ```

4. **Minimal reproduction:**
   - Exact tool call that fails
   - Expected vs actual behavior
   - Error messages (full text)

### Community Resources

- **GitHub Issues**: [github.com/your-org/pulse/issues](https://github.com/your-org/pulse/issues)
- **Discussions**: [github.com/your-org/pulse/discussions](https://github.com/your-org/pulse/discussions)
- **Documentation**: [docs/](docs/)

---

## Next Steps

- **[Configuration Reference](CONFIGURATION.md)** - Verify all environment variables
- **[Getting Started](GETTING_STARTED.md)** - Review installation steps
- **[Deployment Guide](DEPLOYMENT.md)** - Production deployment checklist
- **[Performance Guide](PERFORMANCE.md)** - Optimization strategies
