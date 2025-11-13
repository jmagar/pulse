# PostgreSQL Service Guide

_Last Updated: 01:30 AM EST | Nov 13 2025_

## Role in Pulse
PostgreSQL is the single relational datastore for Firecrawl (crawl metadata, job queue state) and the webhook bridge (search metadata, webhook events, future analytics). The container ships a tuned NUQ build optimized for high I/O and large text payloads.

## Container & Ports
- **Compose service / container**: `pulse_postgres`
- **Build context**: `apps/nuq-postgres`
- **Host ➜ internal port**: `${POSTGRES_PORT:-50105} ➜ 5432`
- **Network**: `pulse`
- **Health**: not explicitly configured; use `pg_isready` manually.

## Configuration & Environment Variables
| Variable | Purpose |
|----------|---------|
| `POSTGRES_USER` | Database superuser (default `firecrawl`). |
| `POSTGRES_PASSWORD` | Superuser password (set in `.env`). |
| `POSTGRES_DB` | Default database (`pulse_postgres`). |
| `POSTGRES_PORT` | Host port (default `50105`). |
| `NUQ_DATABASE_URL` | Legacy connection string for Firecrawl internals. |
| `WEBHOOK_DATABASE_URL` | Async connection string consumed by the webhook bridge (uses `postgresql+asyncpg://`). |
| `DATABASE_URL` | Generic sync DSN used in scripts/tests if needed. |

**Important:** Only `.env.example` contains placeholders. Update `.env`, never commit real credentials. Regenerate passwords with `openssl rand -hex 32` if compromised.

## Data & Storage
- **Volume**: `${APPDATA_BASE:-/mnt/cache/appdata}/pulse_postgres:/var/lib/postgresql/data`
- This path holds WAL files, tables, indexes, and role definitions. Back it up before version upgrades.
- If disk fills, PostgreSQL enters read-only failsafe; monitor usage with `du -sh ${APPDATA_BASE}/pulse_postgres`.

## Deployment Workflow
1. Ensure the volume directory exists and is writable by Docker.
2. Start service: `docker compose up -d pulse_postgres`.
3. Initialize schema migrations (if any) via the relevant app (Firecrawl handles automatically; webhook uses Alembic commands documented in `apps/webhook`).
4. Verify readiness:
   ```bash
   docker compose exec pulse_postgres pg_isready -U $POSTGRES_USER
   ```
5. Record changes in `.docs/deployment-log.md`.

## Operations & Monitoring
- **Connections**: `docker compose exec pulse_postgres psql -U $POSTGRES_USER -d $POSTGRES_DB` for manual queries.
- **Backups**: Use `pg_dump` to snapshot critical schemas (`public`, `webhook`). Store dumps securely.
- **Performance**: Monitor `pg_stat_activity` for long-running queries. Firecrawl can open many concurrent connections; adjust `max_connections` in the custom image if needed.

## Failure Modes & Troubleshooting
| Symptom | Likely Cause | Resolution |
|---------|--------------|------------|
| `psql: FATAL: password authentication failed` | Credentials mismatch between `.env` and existing cluster | Update env vars or reset password inside container (`ALTER ROLE`). |
| `connection refused` from services | Container down or port blocked | `docker compose ps`, restart service, ensure port 50105 unused. |
| Disk full / `PANIC: could not write to file` | Volume reached capacity | Expand storage, prune old data, vacuum tables. |
| Slow queries, deadlocks | Missing indexes or high contention | Review query plans, add indexes, stagger worker jobs. |

## Verification Checklist
- `pg_isready -h localhost -p 50105 -U $POSTGRES_USER` succeeds.
- Firecrawl and webhook migrations run cleanly; tables exist (`public.jobs`, `webhook.search_documents`, etc.).
- Backups tested by restoring into a scratch container.

## Related Documentation
- `apps/webhook/README.md` (database section)
- `docs/ARCHITECTURE_DIAGRAM.md`
- `docs/services/REDIS.md`
