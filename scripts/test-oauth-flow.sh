#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT/apps/mcp"

pnpm vitest run \
  tests/server/auth-routes.test.ts \
  tests/server/session-middleware.test.ts \
  tests/server/csrf-middleware.test.ts \
  tests/server/rate-limit.test.ts \
  tests/server/security-headers.test.ts \
  tests/server/metadata-route.test.ts \
  tests/config/health-checks.oauth.test.ts \
  tests/oauth/token-manager.test.ts \
  tests/oauth/google-client.test.ts \
  tests/oauth/audit-logger.test.ts \
  tests/storage/token-store.test.ts
