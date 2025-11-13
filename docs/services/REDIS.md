# Redis Service Guide

_Last Updated: 01:30 AM EST | Nov 13 2025_

## Role in Pulse
Redis underpins rate limiting, caching, and background job queues. Firecrawl uses it for internal coordination, the webhook service stores request metrics and job payloads, and the worker consumes the `indexing` queue.

## Container & Ports
- **Compose service / container**: `pulse_redis`
- **Image**: `redis:alpine`
- **Host ➜ internal port**: `${REDIS_PORT:-50104} ➜ 6379`
- **Command**: `redis-server --bind 0.0.0.0 --appendonly yes --save 60 1`
- **Network**: `pulse`
- **Volume**: `${APPDATA_BASE:-/mnt/cache/appdata}/pulse_redis:/data` (AOF + snapshots)

## Configuration & Environment Variables
| Variable | Purpose |
|----------|---------|
| `REDIS_PORT` | Host port (default 50104). |
| `REDIS_URL` | Internal connection string (`redis://pulse_redis:6379`). |
| `REDIS_RATE_LIMIT_URL` | Optional separate endpoint; defaults to same instance. |
| `MCP_REDIS_URL` | Required when MCP OAuth sessions enabled. |
| `WEBHOOK_REDIS_URL` | Webhook API/worker queue endpoint. |

All services point to the same Redis container for simplicity. If isolation is needed later, provision separate instances and update env vars accordingly.

## Deployment Workflow
1. Ensure `${APPDATA_BASE}/pulse_redis` exists and is writable.
2. Start service: `docker compose up -d pulse_redis`.
3. Verify readiness: `redis-cli -h localhost -p 50104 ping` → `PONG`.
4. Monitor logs: `docker compose logs -f pulse_redis`.
5. Record deployment info in `.docs/deployment-log.md`.

## Operations & Monitoring
- **Persistence**: AOF enabled with `appendonly yes` and periodic snapshots (`save 60 1`).
- **Metrics**: `redis-cli info stats` for ops/sec, memory usage.
- **Queue inspection**: `redis-cli LLEN rq:queue:indexing`, `redis-cli LRANGE ...`.
- **Rate limit keys**: Prefixed `rate-limit:*` (managed by webhook service).

## Failure Modes & Troubleshooting
| Symptom | Likely Cause | Resolution |
|---------|--------------|------------|
| `ECONNREFUSED` from services | Redis down or port blocked | Restart container, ensure port 50104 free, check firewall. |
| Data loss after restart | Volume missing or unwritable | Confirm mount path, check Docker logs for permission errors. |
| High latency | Memory pressure or swap | Increase container memory, prune stale keys, enable `volatile-lru` policies if needed. |
| AOF corruption | Unclean shutdown | Run `redis-check-aof --fix /data/appendonly.aof`, restart. |

## Verification Checklist
- `redis-cli -h localhost -p 50104 ping` returns `PONG`.
- Webhook worker registers in Redis (`SMEMBERS rq:workers`).
- Rate limit counters increment when hitting `/api/search` rapidly.

## Related Documentation
- `docs/services/POSTGRES.md`
- `docs/services/PULSE_WEBHOOK.md`
- `docs/services/PULSE_WORKER.md`
- `docs/services/FIRECRAWL.md`
