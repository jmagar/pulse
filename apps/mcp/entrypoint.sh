#!/bin/sh
# MCP Server entrypoint script
# Ensures proper permissions on mounted volumes before running as non-root user

if ! chown -R nodejs:nodejs /app/resources 2>/dev/null; then
  echo "Warning: Failed to change ownership of /app/resources" >&2
fi

# Setup SSH for remote Docker contexts (copy from read-only mounts)
if [ -f "/mnt/ssh/id_ed25519" ] && [ ! -f "/root/.ssh/id_ed25519" ]; then
  echo "Setting up SSH keys for remote Docker access..." >&2
  mkdir -p /root/.ssh
  cp /mnt/ssh/id_ed25519 /root/.ssh/id_ed25519
  
  # Only copy known_hosts if it exists
  if [ -f "/mnt/ssh/known_hosts" ]; then
    cp /mnt/ssh/known_hosts /root/.ssh/known_hosts
    chmod 644 /root/.ssh/known_hosts
  fi
  
  chmod 700 /root/.ssh
  chmod 600 /root/.ssh/id_ed25519
fi

# Create Docker context for remote host (ssh-based remote access)
MCP_DOCKER_REMOTE_HOST="${MCP_DOCKER_REMOTE_HOST:-}"
if [ -n "$MCP_DOCKER_REMOTE_HOST" ]; then
  if ! docker context inspect gpu-machine >/dev/null 2>&1; then
    echo "Creating Docker context for remote host..." >&2
    docker context create gpu-machine --docker "host=ssh://${MCP_DOCKER_REMOTE_HOST}"
  fi
fi

exec su-exec nodejs "$@"
