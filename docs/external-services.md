# External Services (GPU-Required)

This document describes the external GPU-dependent services (TEI, Qdrant, and Ollama) deployed using Docker contexts.

## Services

### Text Embeddings Inference (TEI)

**Purpose:** Generate text embeddings for semantic search
**Model:** Qwen/Qwen3-Embedding-0.6B (1024 dimensions)
**Port:** 52000 (HTTP)
**GPU Required:** Yes (NVIDIA with CUDA support)

### Qdrant Vector Database

**Purpose:** Store and search document embeddings
**Collection:** `pulse_docs` (1024-dimension vectors, cosine distance)
**Ports:**
- 52001 (HTTP API)
- 52002 (gRPC)
**GPU Required:** No, but runs on same machine as TEI for network proximity

### Ollama

**Purpose:** Execute local LLMs for knowledge graph extraction and reranking
**Recommended Model:** `qwen3:8b-instruct`
**Port:** 52003 (HTTP API → container port 11434)
**GPU Required:** Yes (shares NVIDIA allocation)
**Volume:** `/home/jmagar/appdata/ollama` (persists pulled models)

## Setup with Docker Context

### One-Time Setup

1. **Create Docker context pointing to GPU machine:**

```bash
# Using SSH (recommended)
docker context create gpu-machine --docker "host=ssh://user@gpu-machine-hostname"

# Or using TCP (if Docker API is exposed)
docker context create gpu-machine --docker "host=tcp://gpu-machine-ip:2375"

# Verify context
docker context ls
```

2. **Test connection:**

```bash
docker --context gpu-machine ps
```

### Deploy External Services

Use the provided pnpm scripts to deploy to the GPU context:

```bash
# Deploy external services to GPU machine
pnpm services:external:up

# Check status
pnpm services:external:ps

# View logs
pnpm services:external:logs

# Stop services
pnpm services:external:down

# Restart services
pnpm services:external:restart
```

### Manual Deployment

If you prefer manual control:

```bash
# Deploy to GPU context
docker --context gpu-machine compose -f docker-compose.external.yaml up -d

# Check status
docker --context gpu-machine compose -f docker-compose.external.yaml ps

# View logs
docker --context gpu-machine compose -f docker-compose.external.yaml logs -f

# Stop services
docker --context gpu-machine compose -f docker-compose.external.yaml down
```

## Environment Variables

The external services read from the same `.env` file. Docker context automatically syncs the environment.

Update your `.env` with the GPU machine's accessible IP/hostname:

```bash
# External Service URLs (use GPU machine's network-accessible address)
WEBHOOK_TEI_URL=http://gpu-machine-ip:52000
WEBHOOK_QDRANT_URL=http://gpu-machine-ip:52001
WEBHOOK_OLLAMA_URL=http://gpu-machine-ip:52003

# Or if using Tailscale (recommended)
WEBHOOK_TEI_URL=http://tailscale-hostname:52000
WEBHOOK_QDRANT_URL=http://tailscale-hostname:52001
WEBHOOK_OLLAMA_URL=http://tailscale-hostname:52003
```

## Network Configuration

- External services must be accessible from the main Pulse stack
- Ensure firewall allows incoming connections on ports 52000-52003
- **Recommended:** Use Tailscale for secure mesh networking between machines
- **Alternative:** Use VPN or configure firewall rules

## Health Checks

### TEI
```bash
curl http://gpu-machine-ip:52000/health
# Expected: {"status":"ok"}
```

### Qdrant
```bash
curl http://gpu-machine-ip:52001/collections
# Expected: {"result":{"collections":[]}}
```

### Ollama
```bash
curl http://gpu-machine-ip:52003/api/tags
# Expected: JSON list of pulled models
```

## Troubleshooting

### Context connection fails

```bash
# Verify SSH access
ssh user@gpu-machine-hostname

# Check Docker is running on remote
ssh user@gpu-machine-hostname "docker ps"

# Recreate context
docker context rm gpu-machine
docker context create gpu-machine --docker "host=ssh://user@gpu-machine-hostname"
```

### Services won't start

```bash
# Check GPU availability on remote
docker --context gpu-machine run --rm --gpus all nvidia/cuda:12.0-base nvidia-smi

# Check logs
pnpm services:external:logs
```

### Network connectivity issues

```bash
# Test from main Pulse machine
curl http://gpu-machine-ip:52000/health
curl http://gpu-machine-ip:52001/collections
curl http://gpu-machine-ip:52003/api/tags

# Check firewall on GPU machine
sudo ufw status
sudo ufw allow 52000:52003/tcp

# Check if services are listening
docker --context gpu-machine exec pulse_tei curl localhost:80/health
docker --context gpu-machine exec pulse_qdrant curl localhost:6333/collections
docker --context gpu-machine exec pulse_ollama curl localhost:11434/api/tags
```

## Local Development (Without GPU)

For development without a GPU machine:

1. **CPU-only TEI:** Remove GPU requirements from `docker-compose.external.yaml`
   ```yaml
   # Comment out or remove the deploy section
   # deploy:
   #   resources:
   #     reservations:
   #       devices:
   #         - driver: nvidia
   #           count: 1
   #           capabilities: [gpu]
   ```

2. **Mock services:** Use stub responses for development (see webhook README)

3. **Shared dev instance:** Point to a team-shared GPU machine

See main [README](../README.md) for development configuration.

## Port Allocation

External services use the 52000-52099 range:

| Service | Port | Protocol | Purpose |
|---------|------|----------|---------|
| TEI | 52000 | HTTP | Text embeddings API |
| Qdrant | 52001 | HTTP | Vector database HTTP API |
| Qdrant | 52002 | gRPC | Vector database gRPC API |
| Ollama | 52003 | HTTP | LLM inference API |

## Security Considerations

- **SSH Key Authentication:** Use key-based SSH for Docker contexts (not passwords)
- **Firewall Rules:** Only allow connections from known IPs (Pulse stack machines)
- **TLS/HTTPS:** Consider using nginx reverse proxy with TLS for production
- **Tailscale:** Strongly recommended for secure mesh networking without firewall complexity
- **Environment Variables:** Never commit `.env` with production URLs/credentials

## Architecture Diagram

```
┌─────────────────────────────────────────────────────┐
│ Main Pulse Stack (Local Machine)                   │
│ ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
│ │  Firecrawl  │  │  MCP Server │  │   Webhook   │ │
│ │     API     │  │             │  │   Bridge    │ │
│ └─────────────┘  └─────────────┘  └──────┬──────┘ │
│                                           │         │
└───────────────────────────────────────────┼─────────┘
                                            │
                           Network (Tailscale/VPN/Public)
                                            │
┌───────────────────────────────────────────┼─────────┐
│ GPU Machine (Remote)                      │         │
│                                           ▼         │
│                            ┌──────────────────────┐ │
│                            │   Webhook Bridge     │ │
│                            │   (needs TEI/Qdrant) │ │
│                            └──────┬──────┬────────┘ │
│                                   │      │           │
│                    ┌──────────────┘      └────────┐ │
│                    ▼                              ▼ │
│         ┌─────────────────┐          ┌──────────────┐
│         │       TEI       │          │    Qdrant    │
│         │  (GPU-enabled)  │          │ (Vector DB)  │
│         └─────────────────┘          └──────────────┘
└─────────────────────────────────────────────────────┘
```

## Benefits of Docker Context Approach

1. **Centralized Management:** Deploy from main repo without manual file copying
2. **Unified Workflow:** Same pnpm scripts manage all infrastructure
3. **Environment Sync:** Single `.env` file for all services
4. **Version Control:** External services config tracked in git
5. **Team Collaboration:** Everyone uses same deployment process
6. **Easy Rollback:** Git history tracks all deployment changes

## Alternative: Manual Deployment

If Docker contexts don't work for your setup, you can manually copy files to the GPU machine:

```bash
# On GPU machine
git clone <repo-url>
cd pulse
cp .env.example .env
# Edit .env with local values
docker compose -f docker-compose.external.yaml up -d
```

However, this loses the benefits of centralized management and requires manual syncing.
