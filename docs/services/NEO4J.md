# Neo4j Graph Database Service Guide

_Last Updated: 01:30 AM EST | Nov 13 2025_

## Role in Pulse
Neo4j stores extracted entities and relationships that power upcoming knowledge-graph features (graph-based reranking, relationship queries, impact analysis). It complements vector (Qdrant) and keyword (BM25) indexes so the webhook worker can persist structured triples alongside unstructured embeddings.

## Container & Ports
- **Compose service / container**: `pulse_neo4j`
- **Image**: `neo4j:2025.10.1-community-bullseye`
- **Host ➜ internal ports**: `50210 ➜ 7474 (HTTP UI)`, `50211 ➜ 7687 (Bolt)`
- **Health check**: `wget -q --spider http://localhost:7474` (10 s interval, 5 retries, 30 s start period)
- **Network**: `pulse` bridge for reachability from webhook worker and MCP services.

## Configuration & Environment Variables
| Variable | Purpose |
|----------|---------|
| `GRAPH_DB_USERNAME` / `GRAPH_DB_PASSWORD` | Admin credentials injected into `NEO4J_AUTH` (format `user/pass`). Defaults `neo4j` / `firecrawl_graph_2025`; rotate for production. |
| `GRAPH_DB_HTTP_PORT` / `GRAPH_DB_BOLT_PORT` | Host ports (defaults `50210`, `50211`). Update both compose and `.env` together. |
| `NEO4J_AUTH` | Convenience variable consumed by the official image. |
| `WEBHOOK_NEO4J_URL` | Bolt URI (`bolt://pulse_neo4j:7687`) used by the webhook service. |
| `WEBHOOK_NEO4J_USERNAME` / `WEBHOOK_NEO4J_PASSWORD` | Credentials the webhook worker uses when writing to the graph. |

Store secrets only in `.env`. After changing credentials, run `docker compose restart pulse_neo4j pulse_webhook pulse_webhook-worker` so clients reconnect with updated values.

## Data & Storage
| Volume | Mount | Contents |
|--------|-------|----------|
| `${APPDATA_BASE}/pulse_neo4j/data` | `/data` | Graph store (nodes, relationships, indexes). |
| `${APPDATA_BASE}/pulse_neo4j/logs` | `/logs` | Transaction/query logs used for troubleshooting. |
| `${APPDATA_BASE}/pulse_neo4j/plugins` | `/plugins` | Custom procedures (e.g., APOC, GDS) when enabled. |

Back up the `data` directory before major upgrades. The community edition uses page cache sized automatically; adjust via `NEO4J_dbms_memory_pagecache_size` env var if needed.

## Deployment & Lifecycle
1. Confirm disk space for `${APPDATA_BASE}/pulse_neo4j`. Graph data can grow quickly with entity extraction.
2. Start or update: `docker compose up -d pulse_neo4j`.
3. Wait for health check to pass (`docker compose ps pulse_neo4j`).
4. Set an admin password via the browser (first launch) at `http://localhost:50210` if not provided through env vars.
5. Record deployment details in `.docs/deployment-log.md`.

## Operations & Monitoring
- **Browser UI**: `http://localhost:50210` exposes Neo4j Browser for interactive Cypher queries.
- **Bolt clients**: Connect via `bolt://localhost:50211` (local dev) or `bolt://pulse_neo4j:7687` (inside Docker network).
- **Logs**: `docker compose logs -f pulse_neo4j` or inspect files under `${APPDATA_BASE}/pulse_neo4j/logs`.
- **Security**: The HTTP UI binds to the host. Do not expose ports publicly without auth/CDN. Consider enabling basic auth or restricting firewall rules.

## Failure Modes & Troubleshooting
| Symptom | Likely Cause | Resolution |
|---------|--------------|------------|
| Health check fails (container restarting) | Port collision or filesystem permission issues on `${APPDATA_BASE}/pulse_neo4j` | Ensure directories exist and are writable, confirm ports 50210/50211 free, restart container. |
| `Neo4jError: AuthenticationFailure` in webhook worker | Credentials mismatch between `.env` and stored DB password | Reset password via `neo4j-admin dbms set-initial-password` or update env vars + restart workers. |
| OOM / slow queries | Default memory config insufficient for dataset | Tune heap/page cache env vars and restart. Consider pruning unused entities. |
| Bolt connection refused | Container down or firewall blocking host port | Verify `docker compose ps`, check host firewall, ensure `pulse` network accessible. |

## Verification Checklist
- `curl -I http://localhost:50210` returns `200 OK`.
- `cypher-shell -u $GRAPH_DB_USERNAME -p $GRAPH_DB_PASSWORD -a bolt://localhost:50211 "RETURN 1"` succeeds.
- Webhook worker can upsert a test entity/relationship without error (check worker logs or run integration tests).

## Related Documentation
- `docs/plans/2025-11-11-knowledge-graph-implementation.md`
- `docs/plans/2025-11-11-knowledge-graph-integration.md`
- `docs/services/PULSE_WEBHOOK.md`
- `docs/services/OLLAMA.md` (graph extraction LLM)
