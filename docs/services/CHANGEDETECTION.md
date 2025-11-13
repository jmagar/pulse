# changedetection.io Service Guide

_Last Updated: 01:52 AM EST | Nov 13 2025_

## Role in Pulse
changedetection.io continuously monitors Firecrawl-sourced URLs for DOM/content diffs, then triggers the webhook bridge so the latest version can be re-scraped, indexed, and exposed through hybrid search. It shares Playwright with Firecrawl to render JavaScript-heavy pages and, together with auto-watch creation, keeps every crawled source fresh without manual babysitting.

## Container & Ports
- **Compose service / container**: `pulse_change-detection`
- **Image**: `ghcr.io/dgtlmoon/changedetection.io:latest`
- **Host ➜ internal port**: `50109 ➜ 5000`
- **Network**: `pulse`
- **Volume**: `${APPDATA_BASE:-/mnt/cache/appdata}/pulse_change-detection:/datastore`
- **Depends on**: `pulse_playwright`
- **Health check**: Python urllib GET `http://localhost:5000/` (interval 60 s, timeout 10 s, retries 3, start period 30 s)

## Architecture & Data Flow
```
changedetection.io → webhook notification → Webhook Bridge → Redis queue → Worker → Firecrawl → Qdrant + BM25
```
1. changedetection.io polls each watch at a configured interval.
2. Upon a diff, it POSTs a signed JSON payload to `/api/webhook/changedetection` on the webhook bridge.
3. The bridge validates the HMAC signature, records the event in PostgreSQL, and enqueues a job in Redis (`indexing`).
4. `pulse_webhook-worker` dequeues the job, rescrapes the URL through Firecrawl (which uses Playwright), and re-indexes the Markdown output into Qdrant (vectors) + BM25 (keywords).
5. Updated content appears in hybrid search within ~10 s of the original change.

## Configuration & Environment Variables
| Variable | Purpose |
|----------|---------|
| `CHANGEDETECTION_WEBHOOK_SECRET` | 64-char hex secret used to sign outbound notifications. Must equal `WEBHOOK_CHANGEDETECTION_HMAC_SECRET`. |
| `WEBHOOK_CHANGEDETECTION_HMAC_SECRET` | Secret the webhook bridge uses to verify payload signatures. |
| `WEBHOOK_CHANGEDETECTION_API_URL` | Base URL the bridge calls when auto-creating watches (`http://pulse_change-detection:5000`). |
| `WEBHOOK_CHANGEDETECTION_API_KEY` | Optional API token if changedetection.io requires authentication. |
| `WEBHOOK_CHANGEDETECTION_ENABLE_AUTO_WATCH` | Toggle auto-watch enrollment for every Firecrawl scrape (default `true`). |
| `WEBHOOK_CHANGEDETECTION_CHECK_INTERVAL` | Polling cadence (seconds). Default 3600 (1 h). |
| `WEBHOOK_CHANGEDETECTION_ENABLE_AUTO_WATCH=false` | Disable new watch creation while preserving existing watches. |

Secrets must be generated with `openssl rand -hex 32` and stored only in `.env`. After edits, restart `pulse_change-detection` and `pulse_webhook` to reload configuration.

## Setup Workflow
1. Ensure supporting services are running: `pulse_playwright`, `firecrawl`, `pulse_webhook`, `pulse_webhook-worker`, Redis, and PostgreSQL.
2. Generate secrets:
   ```bash
   SECRET=$(openssl rand -hex 32)
   echo "CHANGEDETECTION_WEBHOOK_SECRET=$SECRET" >> .env
   echo "WEBHOOK_CHANGEDETECTION_HMAC_SECRET=$SECRET" >> .env
   ```
3. Restart the pair: `docker compose restart pulse_webhook pulse_change-detection`.
4. Verify availability:
   ```bash
   docker compose ps pulse_change-detection
   docker compose logs pulse_change-detection | tail -20
   curl -I http://localhost:50109/
   ```
5. (Optional) Configure manual watches from `http://localhost:50109`.
6. In each watch, add a notification with URL `json://pulse_webhook:52100/api/webhook/changedetection` and payload:
   ```json
   {
     "watch_id": "{{ watch_uuid }}",
     "watch_url": "{{ watch_url }}",
     "watch_title": "{{ watch_title }}",
     "detected_at": "{{ current_timestamp }}",
     "diff_url": "{{ diff_url }}",
     "snapshot": "{{ current_snapshot|truncate(500) }}"
   }
   ```

## Dependencies & Networking
- Shares the user-defined `pulse` network, allowing internal DNS names (`pulse_webhook`, `pulse_playwright`).
- Outbound webhooks must use internal URLs (never `localhost`).
- Webhook bridge consumes signed payloads and routes work through Redis + Firecrawl.

## Data & Storage
- Persistent volume `${APPDATA_BASE}/pulse_change-detection:/datastore` holds watch metadata, snapshots, and history.
- Change events live in PostgreSQL (`webhook.change_events`) for auditing and dashboarding.

## Deployment & Lifecycle
1. Start/upgrade: `docker compose up -d pulse_change-detection`.
2. Confirm health and UI availability (`curl -I http://localhost:50109`).
3. Verify auto-created watches appear in the UI (tagged `firecrawl-auto`).
4. Record deployment info (timestamp, notes, port) in `.docs/deployment-log.md`.

## Operations & Monitoring
- `docker compose logs -f pulse_change-detection` for fetch/notification traces.
- UI provides recent checks, diff previews, and status codes.
- Webhook logs: `docker compose logs pulse_webhook | grep changedetection`.
- Change history (PostgreSQL):
  ```sql
  SELECT watch_url, detected_at, rescrape_status
  FROM webhook.change_events
  ORDER BY detected_at DESC
  LIMIT 10;
  ```
- Queue depth: `redis-cli -h localhost -p 50104 LLEN rq:queue:indexing`.

## Automatic Watch Creation
Auto-watch keeps monitoring coverage in sync with Firecrawl activity.

**Configuration**
```bash
WEBHOOK_CHANGEDETECTION_ENABLE_AUTO_WATCH=true
WEBHOOK_CHANGEDETECTION_CHECK_INTERVAL=3600
WEBHOOK_CHANGEDETECTION_API_URL=http://pulse_change-detection:5000
WEBHOOK_CHANGEDETECTION_API_KEY=
```

**Verification**
1. UI shows `firecrawl-auto` tags.
2. `curl http://localhost:50109/api/v2/watch | jq '.[] | select(.tag == "firecrawl-auto")'`.
3. Logs contain `Auto-created changedetection.io watch`.

Set `WEBHOOK_CHANGEDETECTION_ENABLE_AUTO_WATCH=false` to pause new enrollments (existing watches remain).

## Usage Patterns
1. changedetection polls → webhook fires → worker rescrapes → hybrid index updates.
2. Review diff snapshots inside changedetection for editorial context.
3. Validate search freshness using `/api/search` on `pulse_webhook` (`mode: "hybrid"`).
4. Track job outcomes via PostgreSQL (`rescrape_status`, `metadata->>'error'`).

## Troubleshooting
| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| No webhook activity | Notification URL incorrect or network path blocked | Use `json://pulse_webhook:52100/...`, not `http://localhost`. Check `docker compose logs pulse_change-detection` for HTTP errors. |
| "Invalid signature" | Secrets mismatch | Regenerate `CHANGEDETECTION_WEBHOOK_SECRET` + `WEBHOOK_CHANGEDETECTION_HMAC_SECRET`, restart services. |
| Jobs stuck in `queued` | Worker disabled or Redis down | Ensure `WEBHOOK_ENABLE_WORKER="false"` so the standalone worker runs, inspect Redis queue length, restart `pulse_webhook` + worker. |
| Rescrape failures | Firecrawl unavailable or target rate-limited | `docker compose exec pulse_webhook curl http://firecrawl:3002/health`, retry once Firecrawl is healthy; check job metadata for detailed errors. |
| Updated content missing from search | Qdrant/TEI unreachable | Verify GPU services, inspect `docker compose logs pulse_webhook | grep index_document`. |
| UI blank snapshots | Playwright unreachable | `docker compose exec pulse_change-detection curl -I pulse_playwright:3000`. |

## Advanced Configuration
- **Playwright mode**: Enable per-watch to render JS-heavy pages; configure wait times and selectors.
- **Filtering selectors**: Target `.article-content` or remove `.timestamp`, `.ads` to reduce noise.
- **Intervals**: Tailor by priority (5–15 min breaking, 1–6 h normal, daily low). Respect `robots.txt`.
- **Custom metadata**: Extend the notification payload with additional fields; available via `metadata` JSON column.
- **Performance tuning**: Increase `CHANGEDETECTION_FETCH_WORKERS`, adjust `CHANGEDETECTION_MINIMUM_SECONDS_RECHECK_TIME`, enlarge BM25 path (`WEBHOOK_BM25_INDEX_PATH`), or bump job timeouts (default 10 m) inside webhook worker when sites are slow.

## Failure Modes & Troubleshooting
| Symptom | Likely Cause | Resolution |
|---------|--------------|------------|
| Health check failing / container restarting | Playwright unavailable or startup exceeded 60 s | Verify `pulse_playwright`, then restart both containers. |
| Webhook bridge rejects notifications | HMAC secrets don’t match | Regenerate secrets, restart. |
| Auto-created watches missing | Auto-watch disabled or API URL wrong | Check env vars, ensure API URL is `http://pulse_change-detection:5000`, restart webhook. |
| Snapshots show blank pages | Playwright not reachable | Curl Playwright from inside the container as above. |

## Related Documentation
- `docs/services/PORTS.md`
- `docs/services/PULSE_WEBHOOK.md`
- `docs/services/PULSE_WORKER.md`
- `docs/plans/2025-11-10-changedetection-io-integration.md`
- `.docs/reports/changedetection/*` (feasibility, architecture, compose research)
