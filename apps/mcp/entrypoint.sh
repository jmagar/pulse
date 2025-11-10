#!/bin/sh
# MCP Server entrypoint script
# Ensures proper permissions on mounted volumes before running as non-root user

if ! chown -R nodejs:nodejs /app/resources 2>/dev/null; then
  echo "Warning: Failed to change ownership of /app/resources" >&2
fi

exec su-exec nodejs "$@"
