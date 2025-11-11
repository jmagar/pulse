# Deployment Log

This file tracks all deployments and significant infrastructure changes to the Pulse monorepo.

Format: `YYYY-MM-DD HH:MM:SS | Service | Action | Port | Notes`

---

## 2025-11-10

### 15:30:00 | Documentation | Cleanup | N/A
- Moved all session logs to .docs/sessions/
- Added .docs/tmp/ to .gitignore
- Removed stale npm lockfiles from pnpm workspace
- Created AGENTS.md symlinks for Open Standards compatibility

### 15:00:00 | Configuration | Environment Variables | N/A
- Consolidated environment variables to root .env
- Removed local .env files from apps/mcp and apps/webhook
- Updated .env.example with single source of truth documentation
- Added environment variable management section to CLAUDE.md

### 10:30:00 | All Services | Port Standardization | 50100-50110
- Migrated all services to sequential high-numbered ports
- Playwright: 50100
- Firecrawl: 50102
- Redis: 50104
- PostgreSQL: 50105
- MCP: 50107
- Webhook: 50108

### 10:45:00 | External Services | Documentation | 50200-50202
- Created docker-compose.external.yaml for TEI and Qdrant
- Documented GPU requirements and external hosting
- TEI: 50200, Qdrant: 50201-50202

---

## 2025-11-09

### 20:54:00 | All Services | Cleanup | Various
- Removed apps/api directory (using official Firecrawl image)
- Consolidated Docker compose configuration
- Removed standalone compose files

### 19:30:00 | Integration Testing | Complete | N/A
- All services verified working together
- Database schema migrations tested
- Health checks passing

---

## 2025-11-08

### 23:28:00 | Security | Audit | N/A
- Completed security audit for monorepo dependencies
- pnpm audit: 0 vulnerabilities
- pip-audit: 0 vulnerabilities

### 16:00:00 | MCP Server | Environment Migration | 3060
- Migrated to namespaced MCP_* environment variables
- Backward compatibility with legacy variable names maintained

---

## Instructions

When deploying changes:

1. Add entry with timestamp in EST (HH:MM:SS | MM/DD/YYYY)
2. Include service name, action type, port (if applicable)
3. Brief notes about what changed
4. Commit this file with the deployment

Action types:
- Deploy: New deployment
- Update: Configuration change
- Restart: Service restart
- Migrate: Database migration
- Rollback: Revert to previous version
- Scale: Resource adjustment
- Cleanup: Remove unused resources
- Documentation: Documentation updates
- Security: Security-related changes
