# Migration Guide: npm → pnpm & Port Remapping

## Overview

This guide helps you migrate from the old npm workspace configuration to the new pnpm workspace with remapped ports (50100-50200 range).

**Migration Date:** November 2024
**Breaking Changes:** Package manager, port numbers, environment variables
**Estimated Time:** 15-30 minutes

---

## Breaking Changes

### 1. Package Manager: npm → pnpm

**What Changed:**
- Migrated from npm workspaces to pnpm workspaces
- Removed all `package-lock.json` files
- Added `pnpm-workspace.yaml` and `pnpm-lock.yaml`
- All scripts now use `pnpm` instead of `npm`

**Action Required:**

```bash
# Install pnpm globally (choose one method)
npm install -g pnpm@9.15.0

# OR use corepack (recommended for version management)
corepack enable
corepack prepare pnpm@9.15.0 --activate

# Verify installation
pnpm --version  # Should show 9.15.0

# Clean old npm artifacts
rm -rf node_modules apps/*/node_modules packages/*/node_modules
find . -name "package-lock.json" -delete

# Install dependencies with pnpm
pnpm install
```

**Script Changes:**

| Old Command | New Command |
|------------|-------------|
| `npm run build` | `pnpm build` |
| `npm install` | `pnpm install` |
| `npm run dev` | `pnpm dev` |
| `npm ci` | `pnpm install --frozen-lockfile` |
| `npm run test` | `pnpm test` |

---

### 2. Port Remapping

All external-facing ports have been remapped to the 50100-50200 range to avoid conflicts with other services.

**Port Mapping Table:**

| Service | Old Port | New Port | Internal Port |
|---------|----------|----------|---------------|
| Playwright | 4302 | 50100 | 3000 |
| Firecrawl API | 4300 | 50102 | 3002 |
| Firecrawl Worker | 4301 | 50103 | - |
| Redis | 4303 | 50104 | 6379 |
| PostgreSQL | 4304 | 50105 | 5432 |
| Extract Worker | 4305 | 50106 | - |
| MCP Server | 3060 | 50107 | 3060 |
| Webhook Bridge | 52100 | 50108 | 52100 |
| Changedetection.io | - | 50109 | 5000 |

**Action Required:**

1. **Update .env file:**

```bash
cp .env.example .env
# Edit .env with your actual values
```

2. **Update bookmarks and scripts:**

Replace any references to old ports:
- ❌ `http://localhost:4300` → ✅ `http://localhost:50102`
- ❌ `http://localhost:3060` → ✅ `http://localhost:50107`

3. **Update API client configurations:**

If you have external clients connecting to these services, update their base URLs.

---

### 3. MCP Configuration Consolidated

**What Changed:**
- All MCP environment variables moved from `apps/mcp/.env.example` to root `.env.example`
- Single source of truth for all environment variables
- Namespaced variables with `MCP_*` prefix

**Action Required:**

If you had custom MCP configuration in `apps/mcp/.env`, migrate to root `.env`:

```bash
# Required MCP variables
MCP_PORT=50107
MCP_FIRECRAWL_API_KEY=self-hosted-no-auth
FIRECRAWL_API_URL=http://localhost:50102

# Optional MCP variables
MCP_LOG_LEVEL=info
MCP_METRICS_KEY=your-metrics-secret
```

**Removed Variables:**
- `MCP_USE_DOCKER_TRANSPORT` - No longer supported, HTTP-only mode
- All OAuth/metrics configs moved to root `.env`

---

### 4. Docker Compose Changes

**What Changed:**
- All services use shared `.env` file via `env_file` directive
- Health checks added for all services
- Service names follow `firecrawl_*` convention

**Action Required:**

```bash
# Stop old services
docker compose down

# Remove old containers and volumes (optional, for clean slate)
docker compose down -v

# Pull/rebuild with new configuration
docker compose build --no-cache
docker compose up -d

# Verify services are healthy
docker compose ps
```

Expected output should show all services as "healthy" after startup period.

---

### 5. Webhook Security Configuration

**What Changed:**
- New secure webhook secrets required
- HMAC verification for changedetection webhooks
- CORS configuration for service-to-service communication

**Action Required:**

Generate secure secrets for production:

```bash
# Generate all secrets at once (copy/paste safe)
echo "CHANGEDETECTION_WEBHOOK_SECRET=$(openssl rand -hex 32)" >> .env
echo "WEBHOOK_CHANGEDETECTION_HMAC_SECRET=$(openssl rand -hex 32)" >> .env
echo "WEBHOOK_API_SECRET=$(openssl rand -hex 32)" >> .env
echo "WEBHOOK_SECRET=$(openssl rand -hex 32)" >> .env
```

**CRITICAL:** `CHANGEDETECTION_WEBHOOK_SECRET` and `WEBHOOK_CHANGEDETECTION_HMAC_SECRET` must match for webhook integration to work.

---

## Testing Your Migration

Follow these steps to verify your migration was successful:

### 1. Verify pnpm Installation

```bash
pnpm --version
# Expected: 9.15.0
```

### 2. Install Dependencies

```bash
pnpm install
# Expected: No errors, all packages installed
```

### 3. Build All Packages

```bash
pnpm build
# Expected: TypeScript compilation succeeds for all packages
```

### 4. Run Tests

```bash
pnpm test
# Expected: All tests pass (or see existing known failures)
```

### 5. Start Services

```bash
pnpm services:up
# Expected: All Docker services start successfully
```

### 6. Verify Service Health

```bash
# MCP Server
curl http://localhost:50107/health
# Expected: {"status": "ok", ...}

# Firecrawl API
curl http://localhost:50102/health
# Expected: {"status": "ok"}

# Webhook Bridge
curl http://localhost:50108/health
# Expected: {"status": "healthy", ...}

# Changedetection.io
curl http://localhost:50109/
# Expected: HTML page returned
```

### 7. Start Development Servers

```bash
# MCP Server (in terminal 1)
pnpm dev:mcp

# Web App (in terminal 2)
pnpm dev:web

# Webhook Bridge (in terminal 3)
pnpm dev:webhook
```

---

## Troubleshooting

### Error: "No projects matched the filters"

**Symptom:** `pnpm build` or `pnpm dev` does nothing

**Cause:** Incorrect filter patterns in `package.json` (FIXED in this migration)

**Solution:** Ensure root `package.json` uses `'./apps/mcp'` not `'./apps/mcp/*'`

---

### Error: "Port already in use"

**Symptom:** `Error: listen EADDRINUSE: address already in use`

**Solution:**

```bash
# Find process using the port
lsof -ti:50107  # Replace with your port

# Kill the process
kill -9 $(lsof -ti:50107)

# OR change the port in .env
echo "MCP_PORT=50200" >> .env
```

---

### Docker Build Error: "COPY failed"

**Symptom:** `COPY apps/mcp/entrypoint.sh: no such file or directory`

**Cause:** Missing `entrypoint.sh` file

**Solution:** File should exist at `apps/mcp/entrypoint.sh` (included in this migration)

---

### Test Failures with Port 3060

**Symptom:** Tests fail connecting to MCP server

**Cause:** Tests not updated for new external port

**Solution:** Set `MCP_PORT=50107` in test environment:

```bash
MCP_PORT=50107 pnpm test
```

---

### Webhook Returns 403 Forbidden

**Symptom:** Changedetection webhooks rejected with 403 status

**Cause:** HMAC secrets don't match

**Solution:** Ensure these two variables have identical values in `.env`:

```bash
CHANGEDETECTION_WEBHOOK_SECRET=your-secret-here
WEBHOOK_CHANGEDETECTION_HMAC_SECRET=your-secret-here
```

---

## Rollback Procedure

If you encounter critical issues and need to rollback:

### 1. Checkout Previous Commit

```bash
git log --oneline -10
# Find commit before migration
git checkout <previous-commit>
```

### 2. Reinstall with npm

```bash
# Remove pnpm artifacts
rm -rf node_modules apps/*/node_modules packages/*/node_modules
rm pnpm-lock.yaml

# Install with npm
npm install
```

### 3. Restore Old Port Configuration

```bash
# Copy from backup or manually set old values
# Old ports: 4300 (API), 3060 (MCP), 52100 (Webhook)
```

### 4. Restart Services

```bash
docker compose down
docker compose up -d
```

---

## Getting Help

If you encounter issues not covered in this guide:

1. **Check existing issues:** [GitHub Issues](https://github.com/your-org/pulse/issues)
2. **Review README:** Updated setup instructions in [README.md](README.md)
3. **Open new issue:** Use "Migration:" prefix in title

---

## Migration Checklist

Use this checklist to track your migration progress:

- [ ] Install pnpm 9.15.0
- [ ] Clean old npm artifacts
- [ ] Run `pnpm install`
- [ ] Update `.env` with new port numbers
- [ ] Generate secure webhook secrets
- [ ] Run `pnpm build` successfully
- [ ] Run `pnpm test` successfully
- [ ] Start Docker services with `pnpm services:up`
- [ ] Verify all health endpoints
- [ ] Update bookmarks and scripts with new ports
- [ ] Update external API clients with new ports
- [ ] Test development workflow with `pnpm dev`
- [ ] Document any custom changes in your deployment

---

## Next Steps

After successful migration:

1. **Update CI/CD pipelines:** Change `npm` commands to `pnpm`
2. **Update documentation:** Any setup guides referencing old ports
3. **Notify team:** Share this migration guide with all developers
4. **Monitor services:** Check logs for any port-related issues

For detailed architecture and service information, see:
- [README.md](README.md) - Project overview
- [CLAUDE.md](CLAUDE.md) - Monorepo structure
- [.docs/services-ports.md](.docs/services-ports.md) - Complete port reference
