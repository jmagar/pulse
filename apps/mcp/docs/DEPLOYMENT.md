# Deployment Guide

Production deployment guide for Pulse Fetch MCP server using Docker Compose.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Environment Configuration](#environment-configuration)
- [Docker Deployment](#docker-deployment)
- [Systemd Service](#systemd-service)
- [Health Checks](#health-checks)
- [Security](#security)
- [Storage Configuration](#storage-configuration)
- [Monitoring](#monitoring)
- [Troubleshooting Deployment](#troubleshooting-deployment)

---

## Prerequisites

**Required:**

- Docker 20.10+ and Docker Compose 2.0+
- Domain name with DNS configured (for production)
- SSL certificate (if using HTTPS - recommended)

**Recommended:**

- Reverse proxy (Caddy, Nginx) for HTTPS termination
- Monitoring solution (Prometheus + Grafana)
- Log aggregation (Loki, Elasticsearch)

**API Keys (optional but recommended):**

- Firecrawl API key from [firecrawl.dev](https://firecrawl.dev)
- LLM provider API key (Anthropic, OpenAI, or compatible)

---

## Quick Start

**Minimum production deployment:**

```bash
# Clone repository
git clone https://github.com/your-org/pulse.git
cd pulse

# Create .env file
cp .env.example .env

# Edit .env with your configuration
nano .env

# Required variables:
# PORT=3060
# NODE_ENV=production
# ALLOWED_HOSTS=api.yourdomain.com

# Start server
docker compose up -d

# Verify health
curl http://localhost:3060/health
```

---

## Environment Configuration

### Required for Production

```bash
# Server Configuration
PORT=3060
NODE_ENV=production
ALLOWED_HOSTS=api.yourdomain.com,api.yourdomain.com:3060

# Security (highly recommended)
METRICS_AUTH_ENABLED=true
METRICS_AUTH_KEY=your-secure-random-key-here

# CORS (whitelist specific origins)
ALLOWED_ORIGINS=https://app.yourdomain.com,https://admin.yourdomain.com
```

### Recommended Configuration

```bash
# Firecrawl Integration
FIRECRAWL_API_KEY=fc-your-api-key-here
OPTIMIZE_FOR=cost

# LLM Provider (for extraction feature)
LLM_PROVIDER=anthropic
LLM_API_KEY=sk-ant-your-key-here
LLM_MODEL=claude-sonnet-4-20250514

# Resource Storage
MCP_RESOURCE_STORAGE=filesystem
MCP_RESOURCE_FILESYSTEM_ROOT=/app/resources
MCP_RESOURCE_TTL=0
MCP_RESOURCE_MAX_SIZE=1000

# Session Management
ENABLE_RESUMABILITY=true

# Logging
LOG_FORMAT=json
NO_COLOR=1
```

### Complete .env Example

```bash
# =============================================================================
# PRODUCTION CONFIGURATION
# =============================================================================

# HTTP Server
PORT=3060
NODE_ENV=production
ALLOWED_HOSTS=api.example.com,api.example.com:3060
ALLOWED_ORIGINS=https://app.example.com,https://admin.example.com
ENABLE_RESUMABILITY=true

# Security
METRICS_AUTH_ENABLED=true
METRICS_AUTH_KEY=your-random-secret-key-32-chars

# Logging
LOG_FORMAT=json
NO_COLOR=1

# Scraping Services
FIRECRAWL_API_KEY=fc-xxxxxxxxxxxxxxxxxxxxxx
OPTIMIZE_FOR=cost

# LLM Provider
LLM_PROVIDER=anthropic
LLM_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxxxxx
LLM_MODEL=claude-sonnet-4-20250514

# Resource Storage
MCP_RESOURCE_STORAGE=filesystem
MCP_RESOURCE_FILESYSTEM_ROOT=/app/resources
MCP_RESOURCE_TTL=0
MCP_RESOURCE_MAX_SIZE=1000
MCP_RESOURCE_MAX_ITEMS=10000

# Map Tool Defaults
MAP_DEFAULT_COUNTRY=US
MAP_DEFAULT_LANGUAGES=en-US
MAP_MAX_RESULTS_PER_PAGE=200
```

---

## Docker Deployment

### Docker Compose Configuration

The included `docker-compose.yml` is production-ready:

```yaml
services:
  pulse:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: pulse
    ports:
      - '${PORT:-3060}:3060'
    environment:
      - NODE_ENV=${NODE_ENV:-production}
      - PORT=3060
      - ALLOWED_HOSTS=${ALLOWED_HOSTS}
      - ALLOWED_ORIGINS=${ALLOWED_ORIGINS}
      - FIRECRAWL_API_KEY=${FIRECRAWL_API_KEY}
      - LLM_PROVIDER=${LLM_PROVIDER}
      - LLM_API_KEY=${LLM_API_KEY}
      - MCP_RESOURCE_STORAGE=${MCP_RESOURCE_STORAGE:-memory}
      - MCP_RESOURCE_FILESYSTEM_ROOT=/app/resources
      - METRICS_AUTH_ENABLED=${METRICS_AUTH_ENABLED:-false}
      - METRICS_AUTH_KEY=${METRICS_AUTH_KEY}
    volumes:
      - ./resources:/app/resources
    restart: unless-stopped
    networks:
      - pulse-network
    healthcheck:
      test: ['CMD', 'wget', '--spider', 'http://localhost:3060/health']
      interval: 30s
      timeout: 3s
      start_period: 5s
      retries: 3

networks:
  pulse-network:
    driver: bridge
```

### Deployment Commands

```bash
# Build and start
docker compose up -d --build

# View logs
docker compose logs -f

# View logs (last 100 lines)
docker compose logs --tail=100

# Restart service
docker compose restart

# Stop service
docker compose down

# Stop and remove volumes
docker compose down -v

# Update and redeploy
git pull
docker compose up -d --build
```

### Resource Limits (Optional)

Add to `docker-compose.yml` under service definition:

```yaml
deploy:
  resources:
    limits:
      cpus: '2.0'
      memory: 2G
    reservations:
      cpus: '0.5'
      memory: 512M
```

---

## Systemd Service

For non-Docker deployments, run as systemd service:

### Installation

```bash
# Install dependencies
cd /opt/pulse
npm install

# Build application
npm run build

# Create systemd service file
sudo nano /etc/systemd/system/pulse.service
```

### Service Configuration

```ini
[Unit]
Description=Pulse Fetch MCP Server
After=network.target
Documentation=https://github.com/your-org/pulse

[Service]
Type=simple
User=pulse
Group=pulse
WorkingDirectory=/opt/pulse
ExecStart=/usr/bin/node /opt/pulse/remote/dist/index.js
Restart=always
RestartSec=10

# Environment variables
Environment=PORT=3060
Environment=NODE_ENV=production
Environment=ALLOWED_HOSTS=api.example.com
Environment=FIRECRAWL_API_KEY=your-key-here
Environment=LLM_PROVIDER=anthropic
Environment=LLM_API_KEY=your-key-here
Environment=MCP_RESOURCE_STORAGE=filesystem
Environment=MCP_RESOURCE_FILESYSTEM_ROOT=/var/cache/pulse
Environment=METRICS_AUTH_ENABLED=true
Environment=METRICS_AUTH_KEY=your-secret-key
Environment=LOG_FORMAT=json

# Security hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/cache/pulse /var/log/pulse

# Logging
StandardOutput=append:/var/log/pulse/access.log
StandardError=append:/var/log/pulse/error.log
SyslogIdentifier=pulse

[Install]
WantedBy=multi-user.target
```

### Service Management

```bash
# Create user and directories
sudo useradd -r -s /bin/false pulse
sudo mkdir -p /var/cache/pulse /var/log/pulse
sudo chown -R pulse:pulse /var/cache/pulse /var/log/pulse
sudo chown -R pulse:pulse /opt/pulse

# Enable and start service
sudo systemctl daemon-reload
sudo systemctl enable pulse
sudo systemctl start pulse

# Check status
sudo systemctl status pulse

# View logs
sudo journalctl -u pulse -f

# Restart service
sudo systemctl restart pulse
```

---

## Health Checks

### Built-in Health Endpoint

```bash
# Basic health check
curl http://localhost:3060/health

# Expected response:
{
  "status": "healthy",
  "timestamp": "2025-01-08T12:34:56.789Z",
  "version": "0.0.1",
  "transport": "http-streaming"
}
```

### Docker Health Check

Docker Compose includes automatic health monitoring:

```bash
# Check container health status
docker compose ps

# Should show: Up X minutes (healthy)
```

**Health check behavior:**

- **Interval**: Every 30 seconds
- **Timeout**: 3 seconds
- **Retries**: 3 consecutive failures before unhealthy
- **Start period**: 5 seconds (grace period during startup)

**Unhealthy container actions:**

- Docker marks container as unhealthy
- With `restart: unless-stopped`, Docker will restart unhealthy containers
- External monitoring (Kubernetes, Nomad) can replace unhealthy instances

### External Health Monitoring

**Example: Uptime Kuma**

```bash
docker run -d \
  --name uptime-kuma \
  -p 3001:3001 \
  -v uptime-kuma:/app/data \
  louislam/uptime-kuma:1
```

Configure HTTP monitor:

- **URL**: `http://pulse:3060/health`
- **Method**: GET
- **Interval**: 60 seconds
- **Expected**: Status 200, response contains `"status":"healthy"`

**Example: Prometheus Blackbox Exporter**

```yaml
modules:
  http_2xx:
    prober: http
    http:
      preferred_ip_protocol: 'ip4'
      valid_http_versions: ['HTTP/1.1', 'HTTP/2.0']
      valid_status_codes: [200]
```

---

## Security

### DNS Rebinding Protection

**What it is:**
Validates the `Host` header to prevent DNS rebinding attacks.

**When enabled:**

- Automatically enabled when `NODE_ENV=production`
- Blocks requests with unexpected `Host` headers

**Configuration:**

```bash
# Whitelist allowed hosts
ALLOWED_HOSTS=api.example.com,api.example.com:3060,localhost:3060

# Multiple hosts (comma-separated)
ALLOWED_HOSTS=api.example.com,api-staging.example.com,localhost:3060
```

**Important notes:**

- Include port if clients send `Host: domain.com:3060`
- Wildcards not supported (exact matches only)
- Test with `curl -H "Host: malicious.com" http://localhost:3060/health` (should return 403)

### CORS Configuration

**Default (insecure):**

```bash
ALLOWED_ORIGINS=*  # Allows all origins
```

**Production (recommended):**

```bash
# Whitelist specific origins
ALLOWED_ORIGINS=https://app.example.com,https://admin.example.com

# Single origin
ALLOWED_ORIGINS=https://app.example.com
```

**Credentials:**

- When using specific origins, `credentials: include` is supported
- With wildcard `*`, credentials are disabled (CORS spec requirement)

### Metrics Authentication

**Enable protection:**

```bash
METRICS_AUTH_ENABLED=true
METRICS_AUTH_KEY=your-secure-random-key-here
```

**Generate secure key:**

```bash
# 32-byte random key (Base64)
openssl rand -base64 32

# Or use uuidgen
uuidgen
```

**Access metrics:**

```bash
# Header-based auth
curl -H "X-Metrics-Key: your-secret-key" http://localhost:3060/metrics

# Query parameter auth
curl "http://localhost:3060/metrics?key=your-secret-key"

# JSON format
curl -H "X-Metrics-Key: your-secret-key" http://localhost:3060/metrics/json
```

### Container Security

The Dockerfile includes security best practices:

```dockerfile
# Non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
USER nodejs

# Production dependencies only
RUN npm ci --omit=dev

# Health check built-in
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3060/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"
```

### API Key Management

**Best practices:**

1. **Never commit `.env` files** (already in `.gitignore`)
2. **Use different keys for dev/staging/prod**
3. **Rotate keys regularly** (quarterly recommended)
4. **Use secrets management** (Docker secrets, Vault, etc.)

**Docker Secrets (advanced):**

```yaml
# docker-compose.yml
secrets:
  firecrawl_key:
    file: ./secrets/firecrawl_api_key.txt
  llm_key:
    file: ./secrets/llm_api_key.txt

services:
  pulse:
    secrets:
      - firecrawl_key
      - llm_key
    environment:
      - FIRECRAWL_API_KEY_FILE=/run/secrets/firecrawl_key
      - LLM_API_KEY_FILE=/run/secrets/llm_key
```

---

## Storage Configuration

### Memory Storage (Default)

**Pros:**

- Fastest performance
- No disk I/O
- Simple setup

**Cons:**

- Lost on restart
- Memory-limited

**When to use:**

- Stateless deployments
- Development/testing
- Highly dynamic content (frequent changes)

**Configuration:**

```bash
MCP_RESOURCE_STORAGE=memory
MCP_RESOURCE_MAX_SIZE=100
MCP_RESOURCE_MAX_ITEMS=1000
```

### Filesystem Storage (Production Recommended)

**Pros:**

- Persistent across restarts
- Survives crashes
- Debuggable (inspect cached files)

**Cons:**

- Slower than memory
- Requires disk space
- Volume management needed

**When to use:**

- Production deployments
- Long-running servers
- Large caches (>100MB)

**Configuration:**

```bash
# Environment variables
MCP_RESOURCE_STORAGE=filesystem
MCP_RESOURCE_FILESYSTEM_ROOT=/app/resources
MCP_RESOURCE_TTL=0
MCP_RESOURCE_MAX_SIZE=1000
```

**Volume setup:**

```bash
# Create directory on host
mkdir -p ./resources

# Set permissions
chmod 755 ./resources

# For Docker user 1001:1001
chown -R 1001:1001 ./resources
```

**Docker Compose volume:**

```yaml
volumes:
  - ./resources:/app/resources
```

### Storage Migration

**Memory → Filesystem:**

```bash
# 1. Stop server
docker compose down

# 2. Update .env
MCP_RESOURCE_STORAGE=filesystem
MCP_RESOURCE_FILESYSTEM_ROOT=/app/resources

# 3. Create volume directory
mkdir -p ./resources
chmod 755 ./resources

# 4. Start server
docker compose up -d
```

**Filesystem → Memory:**

```bash
# 1. Stop server
docker compose down

# 2. Update .env
MCP_RESOURCE_STORAGE=memory

# 3. Remove volume (optional, preserves cache for rollback)
# rm -rf ./resources

# 4. Start server
docker compose up -d
```

---

## Monitoring

### Metrics Endpoint

**Available metrics:**

```bash
# Console format (human-readable)
curl -H "X-Metrics-Key: $KEY" http://localhost:3060/metrics

# JSON format (machine-readable)
curl -H "X-Metrics-Key: $KEY" http://localhost:3060/metrics/json
```

**Metrics tracked:**

- Total requests
- Successful requests
- Failed requests
- Average response time
- Cache hits/misses
- Storage usage
- Uptime

### Log Aggregation

**JSON logs for aggregation:**

```bash
LOG_FORMAT=json
NO_COLOR=1
```

**Example log entry:**

```json
{
  "level": "info",
  "timestamp": "2025-01-08T12:34:56.789Z",
  "message": "Scrape successful",
  "url": "https://example.com",
  "strategy": "native",
  "duration": 1234
}
```

**Loki integration:**

```yaml
# docker-compose.yml
loki:
  image: grafana/loki:latest
  ports:
    - '3100:3100'
  volumes:
    - ./loki-config.yaml:/etc/loki/local-config.yaml

promtail:
  image: grafana/promtail:latest
  volumes:
    - /var/lib/docker/containers:/var/lib/docker/containers:ro
    - ./promtail-config.yaml:/etc/promtail/config.yaml
  command: -config.file=/etc/promtail/config.yaml
```

### Prometheus Integration

**Future enhancement** (not currently implemented):

```yaml
# Planned metrics endpoint format
GET /metrics/prometheus

# Example output:
# TYPE pulse_requests_total counter
pulse_requests_total{method="scrape",status="success"} 1234
pulse_requests_total{method="scrape",status="failure"} 56
# TYPE pulse_cache_hits_total counter
pulse_cache_hits_total 890
```

---

## Troubleshooting Deployment

### Container Won't Start

**Check logs:**

```bash
docker compose logs pulse
```

**Common causes:**

- Health check failing (invalid API keys)
- Port already in use
- Missing required environment variables
- Volume permission issues

**Solutions:**

```bash
# Test without health check
SKIP_HEALTH_CHECKS=true docker compose up

# Check port availability
lsof -i :3060

# Fix volume permissions
sudo chown -R 1001:1001 ./resources
```

### High Memory Usage

**Check container stats:**

```bash
docker stats pulse
```

**Reduce memory usage:**

```bash
# Limit cache size
MCP_RESOURCE_MAX_SIZE=50
MCP_RESOURCE_MAX_ITEMS=500

# Add container memory limit
# In docker-compose.yml:
deploy:
  resources:
    limits:
      memory: 1G
```

### Slow Performance

**Enable cost optimization:**

```bash
OPTIMIZE_FOR=cost  # Native fetch first
```

**Increase cache limits:**

```bash
MCP_RESOURCE_TTL=0
MCP_RESOURCE_MAX_SIZE=1000
```

**Use memory storage:**

```bash
MCP_RESOURCE_STORAGE=memory
```

---

## Production Checklist

Before deploying to production, verify:

- [ ] Environment variables configured (PORT, NODE_ENV, ALLOWED_HOSTS)
- [ ] API keys tested and valid (Firecrawl, LLM provider)
- [ ] CORS configured with specific origins
- [ ] Metrics authentication enabled
- [ ] DNS rebinding protection enabled (NODE_ENV=production)
- [ ] Filesystem storage configured with proper volumes
- [ ] Health checks passing
- [ ] Logs aggregation configured
- [ ] Monitoring/alerting set up
- [ ] Backup strategy for cached data (if needed)
- [ ] SSL/TLS termination configured (reverse proxy)
- [ ] Firewall rules configured
- [ ] Container resource limits set
- [ ] Documentation updated with deployment details

---

## Next Steps

- **[Configuration Reference](CONFIGURATION.md)** - Complete environment variable documentation
- **[Troubleshooting](TROUBLESHOOTING.md)** - Common deployment issues
- **[Performance Guide](PERFORMANCE.md)** - Optimization strategies
- **[Architecture](ARCHITECTURE.md)** - System design and components
