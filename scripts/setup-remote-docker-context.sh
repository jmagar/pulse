#!/bin/bash
# Setup SSH keys and Docker context for accessing remote GPU services
#
# Run this script after deploying the pulse stack to enable remote Docker log access

set -e

echo "Setting up SSH keys for remote Docker context access..."

# Copy SSH keys into pulse_mcp container
docker exec pulse_mcp sh -c '
  mkdir -p /root/.ssh
  chmod 700 /root/.ssh
'

# Copy private key
docker cp /config/.ssh/id_ed25519 pulse_mcp:/root/.ssh/id_ed25519
docker exec pulse_mcp chmod 600 /root/.ssh/id_ed25519

# Copy known_hosts
docker cp /config/.ssh/known_hosts pulse_mcp:/root/.ssh/known_hosts
docker exec pulse_mcp chmod 644 /root/.ssh/known_hosts

echo "✓ SSH keys copied"

# Create Docker context for GPU machine
echo "Creating Docker context for GPU machine..."
docker exec pulse_mcp docker context create gpu-machine --docker "host=ssh://jmagar@100.74.16.82" 2>/dev/null || \
  echo "Context already exists"

echo "✓ Docker context created"

# Test remote connection
echo "Testing remote Docker access..."
if docker exec pulse_mcp docker --context gpu-machine ps --format '{{.Names}}' >/dev/null 2>&1; then
  echo "✓ Remote Docker access working!"
  echo ""
  echo "Remote services available:"
  docker exec pulse_mcp docker --context gpu-machine ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
else
  echo "✗ Remote Docker access failed"
  echo "Check SSH connectivity and Docker installation on remote host"
  exit 1
fi
