# Pulse Web (NotebookLM UI Clone)

_Last updated: 01:45 AM EST | Nov 13 2025_

## Purpose & Current Status
- **Goal:** Build a polished shadcn/ui experience that mirrors Google NotebookLM’s layout (sources rail ➜ chat workspace ➜ studio). The delivered mockup (see `/docs/mockups/notebooklm.png`) is the visual target for v1.
- **Stack:** Next.js **16**, React **19**, TypeScript (strict), Tailwind CSS **v4**, shadcn/ui + Radix primitives, Vitest + RTL for testing.
- **Today:** The project still contains the default Next.js starter page plus a single shared component (`Button`) and its utilities/tests. No NotebookLM-specific UI, API clients, or data models exist yet. Treat the repo as a clean scaffold with linting, testing, and shadcn generator wiring already enabled.

## Implementation Checklist
| Area | Status | Notes |
|------|--------|-------|
| Global layout (sources/chat/studio columns) | ☐ Not started | Replace `app/page.tsx` placeholder with responsive 3-panel layout from mock. |
| Data layer (sources, notebook state) | ☐ Not started | Needs client state (Zustand/Context) + future integration with Firecrawl & webhook APIs. |
| Chat orchestration | ☐ Not started | Plan to stream responses from MCP+webhook stack. |
| Studio widgets (Audio Overview, Mind Map, Reports) | ☐ Not started | Represent as modular cards that consume notebook state. |
| Auth/session | ☐ Not started | Decide between MCP auth handoff vs. bespoke login later. |
| Storybook/visual tests | ☐ Not started | Consider Ladle/Storybook once components exist. |

Track progress by moving rows to ✅ as features land. Update this README with architectural decisions as they happen.

## Project Structure
```
apps/web/
├── app/                # Next App Router (layout.tsx + page.tsx scaffold)
├── components/         # shadcn/ui generated primitives (currently button)
├── lib/                # Shared utilities (cn helper)
├── __tests__/          # Vitest + RTL suites for page/layout/components
├── public/             # Static assets (Next default logos for now)
├── tailwind/postcss configs
└── vitest.config.ts    # JSDOM, setup file, coverage via v8
```

## Scripts
Run from repo root (`pnpm` workspace aware) or inside `apps/web`.

| Command | Description |
|---------|-------------|
| `pnpm dev:web` | Starts Next dev server on port **3000** (default Next). |
| `pnpm build:web` | Runs `next build` with lint/type checks. |
| `pnpm start:web` (future) | After adding to root scripts, will run `next start`. |
| `pnpm test:web` | Vitest JSDOM tests (`apps/web/__tests__`). |
| `pnpm lint:web` | Planned script alias for `eslint .` (add when code expands). |
| `pnpm format:web` | Optional script for Prettier (`pnpm --filter web format`). |

## Environment Variables
The app currently reads no runtime env vars. Define the following in `.env` (and document in `.env.example`) once we connect to backend services:

```
NEXT_PUBLIC_API_URL=http://localhost:50102           # Firecrawl API proxy
NEXT_PUBLIC_MCP_URL=http://localhost:50107           # MCP server
NEXT_PUBLIC_WEBHOOK_URL=http://localhost:50108       # Webhook search bridge
NEXT_PUBLIC_GRAPH_URL=http://localhost:50210         # Neo4j Browser (future viz)
```

These should always be namespaced with `NEXT_PUBLIC_` so Next can expose them to the browser bundle. Keep secrets server-side—never embed private keys in the client.

## UI/UX Guidelines
1. **NotebookLM parity:** Column layout, chip buttons (“What are the main themes?”), stacked sources, studio actions, and share/export affordances should mimic the mock.
2. **Theming:** Default to dark mode with subtle gradients; support light mode as stretch goal using CSS custom properties + Tailwind color tokens.
3. **State management:** Start with co-located React state per panel. As features mature, introduce a single notebook store (Zustand or Context + reducer) to coordinate sources, chat history, and studio outputs.
4. **Accessibility:** Preserve keyboard flows (tab order across panels, focus outlines, aria labels for studio actions). Mirror NotebookLM’s quick actions as accessible buttons, not divs.
5. **Performance:** Use Next server actions for data fetches where possible, lazy-load heavy widgets, and avoid blocking hydration.

## Testing Expectations
- Keep `apps/web/__tests__` in sync with UI changes (RTL + Vitest).
- Add visual regression testing (Chromatic/Storybook or Playwright) once base layout ships.
- Run `pnpm test:web --coverage` locally before pushing major UI work; CI target coverage ≥85% once components exist.

## Roadmap
1. **Replace starter page** with skeleton of the mock (sources/chat/studio columns, placeholder cards, CTA buttons).
2. **Set up state store** for notebooks + sources.
3. **Integrate backend**: hooking Add Source to Firecrawl + webhook search, chat to MCP.
4. **Enhance studio**: audio/video overview placeholders hooking into future worker outputs.
5. **Polish interactions**: Resizable columns, drag-and-drop sources, share modal, theming toggle.

Keep this README as the authoritative dev guide for the web surface. Update checkpoints, scripts, and architecture decisions as the project evolves.
