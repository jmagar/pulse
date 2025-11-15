# Docker Logs from Remote Contexts

## Overview

The MCP Docker logs resource provider supports fetching logs from containers on remote Docker hosts using Docker contexts.

## Setup

### 1. Create Docker Context

First, create a Docker context pointing to your remote host:

```bash
# SSH-based context (preferred for security)
docker context create gpu-server --docker "host=ssh://user@gpu-host"

# TCP with TLS (for Docker daemon with TLS enabled)
docker context create gpu-server \
  --docker "host=tcp://gpu-host:2376" \
  --docker "tls-verify=true" \
  --docker "ca=~/.docker/certs/ca.pem" \
  --docker "cert=~/.docker/certs/cert.pem" \
  --docker "key=~/.docker/certs/key.pem"

# TCP without TLS (local network only, not recommended)
docker context create local-gpu --docker "host=tcp://192.168.1.100:2375"
```

### 2. Verify Context

Test the context from your MCP container:

```bash
docker exec pulse_mcp docker context ls
docker exec pulse_mcp docker --context gpu-server ps
```

### 3. Configure External Services

Add services to your `.env` file:

```bash
# Single service
MCP_DOCKER_EXTERNAL_SERVICES='[{"name":"gpu_tei","description":"Text Embeddings Inference on GPU","context":"gpu-server"}]'

# Multiple services
MCP_DOCKER_EXTERNAL_SERVICES='[
  {"name":"gpu_tei","description":"TEI on GPU host","context":"gpu-server"},
  {"name":"gpu_qdrant","description":"Qdrant on GPU host","context":"gpu-server"},
  {"name":"remote_postgres","description":"PostgreSQL on remote","context":"remote-db"}
]'
```

## JSON Schema

Each external service requires:

```typescript
{
  name: string;        // Container name (e.g., "gpu_tei")
  description: string; // Human-readable description
  context: string;     // Docker context name
}
```

## Example: GPU Services

If you have TEI and Qdrant running on a GPU server:

```bash
# On GPU server (gpu-host), containers running:
# - gpu_tei (text-embeddings-inference:latest)
# - gpu_qdrant (qdrant/qdrant:latest)

# On MCP host, create context:
docker context create gpu-server --docker "host=ssh://admin@gpu-host"

# Configure in .env:
MCP_DOCKER_EXTERNAL_SERVICES='[
  {"name":"gpu_tei","description":"TEI embeddings service","context":"gpu-server"},
  {"name":"gpu_qdrant","description":"Qdrant vector database","context":"gpu-server"}
]'

# Restart MCP:
docker compose up -d pulse_mcp
```

Now Claude can access logs via:
- `docker://compose/pulse/gpu_tei/logs`
- `docker://compose/pulse/gpu_qdrant/logs`

## Architecture

```
┌─────────────────┐
│   pulse_mcp     │
│  (MCP Server)   │
│                 │
│  Docker Socket  │◄──────┐
│  /var/run/...   │       │
└─────────────────┘       │
                          │
        ┌─────────────────┴─────────────────┐
        │                                   │
   Local Docker                        Remote Docker
   (localhost)                         (via context)
        │                                   │
  ┌─────┴─────┐                      ┌─────┴─────┐
  │ firecrawl │                      │  gpu_tei  │
  │ pulse_mcp │                      │gpu_qdrant │
  │   etc.    │                      │    etc.   │
  └───────────┘                      └───────────┘
```

## Security Considerations

### SSH-Based Contexts (Recommended)

✅ **Secure:** Encrypted communication via SSH
✅ **Authentication:** Uses SSH keys
✅ **No exposed ports:** No Docker daemon on TCP

```bash
docker context create gpu-server --docker "host=ssh://user@gpu-host"
```

### TLS-Based TCP Contexts

⚠️ **Requires:** TLS certificates on remote daemon
✅ **Encrypted:** TLS encryption
⚠️ **Port exposure:** Docker daemon on TCP port

Requires Docker daemon started with:
```bash
dockerd --tlsverify \
  --tlscacert=/path/ca.pem \
  --tlscert=/path/cert.pem \
  --tlskey=/path/key.pem \
  -H tcp://0.0.0.0:2376
```

### Unencrypted TCP (NOT RECOMMENDED)

❌ **Insecure:** No encryption
❌ **Vulnerable:** Anyone can control Docker
⚠️ **Local networks only**

Only acceptable for isolated lab networks.

## Troubleshooting

### Context Not Found

```bash
# List available contexts
docker exec pulse_mcp docker context ls

# Create missing context
docker context create gpu-server --docker "host=ssh://user@gpu-host"

# Copy context to container (if needed)
docker cp ~/.docker/contexts pulse_mcp:/home/nodejs/.docker/
```

### Permission Denied

```bash
# Verify SSH key authentication
ssh user@gpu-host docker ps

# Check context configuration
docker context inspect gpu-server
```

### Container Not Found

```bash
# List containers on remote host
docker --context gpu-server ps -a

# Check container name matches exactly
docker --context gpu-server ps --format "{{.Names}}"
```

## Performance

**Latency:** Logs are fetched on-demand from remote hosts. Expect:
- SSH contexts: 50-200ms overhead per request
- TLS contexts: 20-100ms overhead per request
- Local: <10ms

**Caching:** No caching - always real-time logs.

**Bandwidth:** Minimal - only last 500 lines fetched (~50KB typical).

## Limitations

1. **Read-only:** Can only read logs, cannot start/stop containers
2. **No streaming:** Fetches fixed number of lines (500)
3. **Context availability:** Remote host must be accessible when logs requested
4. **No authentication:** Uses Docker context authentication only

## Example Use Cases

### Multi-Host GPU Cluster

```bash
# GPU server 1: Embeddings
docker context create gpu1 --docker "host=ssh://admin@gpu1.local"

# GPU server 2: LLM inference
docker context create gpu2 --docker "host=ssh://admin@gpu2.local"

MCP_DOCKER_EXTERNAL_SERVICES='[
  {"name":"tei_server","description":"TEI on GPU1","context":"gpu1"},
  {"name":"ollama","description":"Ollama on GPU2","context":"gpu2"}
]'
```

### Edge Deployment

```bash
# Edge device: Raspberry Pi running sensors
docker context create edge-pi --docker "host=ssh://pi@edge-device.local"

MCP_DOCKER_EXTERNAL_SERVICES='[
  {"name":"sensor_collector","description":"IoT sensor collector","context":"edge-pi"}
]'
```

### Development + Production

```bash
# Production server
docker context create prod --docker "host=ssh://deploy@prod-server"

# Local dev stack already in compose
# Add prod monitoring to MCP

MCP_DOCKER_EXTERNAL_SERVICES='[
  {"name":"prod_api","description":"Production API logs","context":"prod"},
  {"name":"prod_worker","description":"Production worker logs","context":"prod"}
]'
```

## Summary

Remote Docker context support enables monitoring logs from:
- Multi-host deployments
- GPU servers
- Edge devices
- Production environments

Without modifying compose files or adding infrastructure.
