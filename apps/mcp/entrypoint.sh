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
  cp /mnt/ssh/known_hosts /root/.ssh/known_hosts
  chmod 700 /root/.ssh
  chmod 600 /root/.ssh/id_ed25519
  chmod 644 /root/.ssh/known_hosts
fi

# Create Docker context for GPU machine (ssh-based remote access)
if ! docker context inspect gpu-machine >/dev/null 2>&1; then
  echo "Creating Docker context for GPU machine..." >&2
  docker context create gpu-machine --docker "host=ssh://jmagar@100.74.16.82"
fi

exec su-exec nodejs "$@"
