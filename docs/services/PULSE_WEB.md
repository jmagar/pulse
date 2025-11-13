# Pulse Web Service Guide

_Last Updated: 02:17 AM EST | Nov 13 2025_

## Role in Pulse
`pulse_web` will deliver the NotebookLM-style UI for orchestrating Firecrawl scrapes, reviewing chat results, and triggering Studio workflows. Today the app is a scaffolded Next.js 16 + Tailwind v4 + shadcn/ui project (see `apps/web/README.md`), but its deployment port is already reserved (50110 ➜ 3000) so infrastructure can point browsers at a consistent endpoint once the UI ships.

## Implementation Snapshot
- **Framework:** Next.js 16 (App Router) with React 19 and TypeScript (strict)
- **Styling/Components:** Tailwind CSS v4, shadcn/ui, Radix primitives, lucide-react icons
- **State/tests:** Vitest + React Testing Library, future Zustand/Context store for notebook state
- **Current status:** Default Next.js landing page plus shared `Button` component/tests; ready for NotebookLM layout build-out

## Container & Ports (Planned)
- **Compose service / container:** `pulse_web` (to be added to `docker-compose.yaml`)
- **Host ➜ internal port:** `50110 ➜ 3000` (reserved in [`PORTS.md`](./PORTS.md))
- **Network:** `pulse` bridge alongside MCP/Webhook/Firecrawl when container authored
- **Depends on:** Firecrawl API (scraping), MCP server (chat orchestration), Webhook API (search)

## Configuration & Environment Variables
Add these to `.env` / `.env.example` (namespaced with `NEXT_PUBLIC_` for browser exposure):

```env
NEXT_PUBLIC_API_URL=http://localhost:50102        # Firecrawl API proxy for Add Source flows
NEXT_PUBLIC_MCP_URL=http://localhost:50107        # MCP server for chat + tools
NEXT_PUBLIC_WEBHOOK_URL=http://localhost:50108    # Webhook hybrid search endpoints
NEXT_PUBLIC_GRAPH_URL=http://localhost:50210      # Optional Neo4j viewer for Mind Map
```

Use runtime-safe secrets (e.g., `NEXTAUTH_SECRET`) later if auth is added, but nothing sensitive should appear in these `NEXT_PUBLIC_*` values—they are bundled into the client.

## Development Workflow
1. Install workspace deps: `pnpm install`
2. Run dev server: `pnpm dev:web` (defaults to http://localhost:3000)
3. Run tests: `pnpm test:web`
4. Format/lint: `pnpm --filter web lint` / `pnpm --filter web format`

Follow the NotebookLM plan (`apps/web/README.md`) for layout implementation order (sources rail → chat → studio).

## Deployment Considerations
- Add a `pulse_web` service to `docker-compose.yaml` when the UI is ready; map `50110:3000` and mount a read-only volume for static assets.
- Use `next build && next start` for production; consider enabling ISR or RSC caching for heavy panels.
- Document lifecycle entries in `.docs/deployment-log.md` once the service is deployable.

## Operations & Monitoring
- For now, local logs come from `pnpm dev:web` console output (Next.js dev server).
- Once containerized, capture stdout/stderr via `docker compose logs -f pulse_web`.
- Instrument with browser analytics or server logging when real notebooks launch (avoid external SaaS per repo guidelines).

## Failure Modes & Troubleshooting
| Symptom | Likely Cause | Resolution |
|---------|--------------|------------|
| Dev server won’t start on 3000 | Port conflict with other Next apps | Override with `PORT=3100 pnpm dev:web` or stop the conflicting process. |
| Build errors about Tailwind config | Tailwind v4 expects `tailwind.config.ts` or `postcss.config` updates | Re-run `pnpm dlx tailwindcss init -p` or align with latest docs. |
| Tests fail with missing JSDOM APIs | Vitest not running in jsdom mode | Ensure `vitest.config.ts` exports `environment: "jsdom"` (already configured). |

## Related Documentation
- `apps/web/README.md`
- `docs/services/PORTS.md` (port charter)
- `docs/services/PULSE_MCP.md`, `docs/services/PULSE_WEBHOOK.md`, `docs/services/FIRECRAWL.md` (backend dependencies)
