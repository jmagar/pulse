# Playwright Service Guide

_Last Updated: 01:30 AM EST | Nov 13 2025_

## Role in Pulse
The shared Playwright container (`pulse_playwright`) provides remote browser automation for Firecrawl and changedetection.io. Keeping it as a standalone service avoids bundling Chromium into every consumer, ensures deterministic versions, and centralizes resource limits.

## Container & Ports
- **Image**: `ghcr.io/firecrawl/playwright-service:latest`
- **Host ➜ internal port**: `50100 ➜ 3000`
- **Environment**: `PORT=3000`
- **Network**: `pulse` bridge (accessible as `http://pulse_playwright:3000`).
- **Health check**: Not configured in compose; consumers detect failure via connection errors.

## Configuration
No additional env vars are required. The service automatically launches Chromium instances and exposes a lightweight HTTP interface for Firecrawl’s Playwright driver. Keep host kernel shared memory size sufficient (default `/dev/shm`).

## Dependencies & Consumers
- **Firecrawl**: Uses the Playwright endpoint for JavaScript rendering during scraping/crawling.
- **changedetection.io**: Shares the same endpoint for DOM diff snapshots.
- **Webhook worker**: Indirect dependency via Firecrawl re-scrapes.

## Deployment Workflow
1. Start or restart with `docker compose up -d pulse_playwright`.
2. Verify logs for Chromium launch confirmation: `docker compose logs -f pulse_playwright`.
3. Confirm Firecrawl can reach it: `docker compose exec firecrawl curl -I pulse_playwright:3000`.
4. Document port usage in `.docs/deployment-log.md` if changed.

## Operations & Monitoring
- Monitor container logs for `browser disconnected` or `launch timeout` messages.
- Keep host machine’s `/tmp` and `/dev/shm` free; low space can crash Chromium.
- If CPU usage spikes, consider limiting concurrency in Firecrawl to reduce Playwright sessions.

## Failure Modes & Troubleshooting
| Symptom | Cause | Fix |
|---------|-------|-----|
| Firecrawl errors `ECONNREFUSED pulse_playwright:3000` | Service down or port blocked | Restart container, ensure port 50100 free. |
| `browserContext.close` timeouts | Too many concurrent sessions | Reduce Firecrawl concurrency or scale Playwright horizontally (multiple instances behind round-robin). |
| Chromium crashes on startup | Missing shared memory | Pass `--shm-size` to Docker or clean `/dev/shm`. |

## Verification Checklist
- `docker compose ps pulse_playwright` shows `Up`.
- `curl -I http://localhost:50100/health` (if exposed) or from inside dependent containers `curl -I pulse_playwright:3000` returns `200`.
- Firecrawl scrape of a JS-heavy page returns rendered content.

## Related Documentation
- `docs/services/FIRECRAWL.md`
- `docs/services/CHANGEDETECTION.md`
- `docs/services/PORTS.md`
