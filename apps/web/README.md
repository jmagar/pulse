# Pulse Web (NotebookLM UI Clone)

_Last updated: November 14, 2025_

## Status

✅ **Complete** - Mobile-first, component-driven NotebookLM interface built with TDD.

All core UI components implemented with comprehensive test coverage (47 passing tests).

## Features

- **Mobile-First Design**: Optimized for 320px+ viewports
- **Responsive Layout**: Vertical stack (mobile) → Three-panel resizable (desktop)
- **Dark Theme**: Material Design Light Blue accent (#03A9F4)
- **Modular Components**: Small, focused, testable components (max 100 lines)
- **TDD Approach**: All components built with Red-Green-Refactor cycle

## Architecture

### Component Structure

```
components/
├── design-tokens.tsx        # HSL color tokens
├── header.tsx              # App header with branding
├── source-panel.tsx        # Source management panel
├── source-card.tsx         # Individual source card
├── empty-sources.tsx       # Empty state for sources
├── chat-panel.tsx          # Chat interface panel
├── chat-message.tsx        # Message bubbles (assistant/user)
├── chat-composer.tsx       # Message input area
├── empty-chat.tsx          # Empty state for chat
├── studio-panel.tsx        # Studio features panel
└── studio-tile.tsx         # Studio feature card
```

### Responsive Strategy

- **Mobile (< 768px)**: Vertical stack, full-width panels
- **Desktop (≥ 768px)**: Three-panel resizable layout (Sources 28% | Chat 48% | Studio 24%)
- **Touch targets**: 44px minimum for mobile accessibility

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **UI Library**: shadcn/ui (Radix UI primitives)
- **Styling**: Tailwind CSS 4
- **Animations**: Framer Motion
- **Icons**: Lucide React
- **Notifications**: Sonner (toast notifications)
- **Resizable Panels**: react-resizable-panels
- **Chat Auto-scroll**: use-stick-to-bottom
- **Testing**: Vitest + React Testing Library

## Development

```bash
pnpm dev        # Start dev server (http://localhost:3000)
pnpm build      # Production build
pnpm test       # Run all tests (47 passing)
pnpm test:watch # Watch mode for development
```

## Design Tokens

Custom HSL values in `:root.dark`:
- **Background**: `220 18% 9%` (~#141820)
- **Primary**: `199 98% 49%` (#03A9F4 - Material Light Blue)
- **Card**: `220 18% 11%`
- **Border**: `220 14% 22%`
- **Muted**: `220 14% 15%`

## Testing

All components built with TDD (Red-Green-Refactor):

1. Write failing test
2. Run to verify failure
3. Write minimal implementation
4. Run to verify pass
5. Commit

**Test Coverage:**
- Unit tests for all 13 components
- Integration tests for complete application
- 47 tests passing (100% of planned coverage)

## Project Structure

```
apps/web/
├── app/                # Next App Router
│   ├── layout.tsx      # Root layout with dark theme
│   └── page.tsx        # Main page with responsive layout
├── components/         # UI components (all with TDD)
│   ├── ui/            # shadcn/ui primitives
│   └── *.tsx          # NotebookLM-specific components
├── lib/               # Shared utilities
├── __tests__/         # Vitest + RTL test suites
├── public/            # Static assets
└── vitest.config.ts   # Test configuration
```

## Environment Variables

Define in `.env` (namespaced with `NEXT_PUBLIC_`):

```env
NEXT_PUBLIC_API_URL=http://localhost:50102           # Firecrawl API
NEXT_PUBLIC_MCP_URL=http://localhost:50107           # MCP server
NEXT_PUBLIC_WEBHOOK_URL=http://localhost:50108       # Webhook search bridge
NEXT_PUBLIC_GRAPH_URL=http://localhost:50210         # Neo4j Browser
```

## Implementation Details

### Mobile Layout (< 768px)

Three vertically stacked sections with 600px fixed height:
1. Sources Panel - Manage and view data sources
2. Chat Panel - Interact with AI assistant
3. Studio Panel - Access AI-powered features

### Desktop Layout (≥ 768px)

Three-panel resizable layout using `react-resizable-panels`:
- **Sources** (left, 28%): Collapsible source list with add/manage controls
- **Chat** (center, 48%): Primary workspace for conversation
- **Studio** (right, 24%): Quick access to AI features

Panels can be resized by dragging handles between them.

## Components

### Header
Sticky header with Pulse branding, notebook title, and settings button.

### Source Panel
- Empty state with "Add source" CTA
- Source cards with type icons (PDF, Web, GitHub, YouTube, Audio)
- Progress bars for processing sources
- Error states with retry affordances
- Dropdown menu for source actions

### Chat Panel
- Empty state with suggested prompts
- Message bubbles (Assistant/User with different styling)
- Auto-expanding textarea composer
- Auto-scroll to latest message (via use-stick-to-bottom)
- Send button (disabled when empty)

### Studio Panel
- Feature tiles for AI capabilities:
  - **Audio Overview**: Generate podcast-style discussion
  - **Video Overview**: Create summary video
  - **Mind Map**: Visualize connections between topics

## Next Steps

- **Backend Integration**: Connect to Firecrawl MCP server for source management
- **State Management**: Implement Zustand store for notebook/source state
- **Chat Streaming**: Integrate with MCP for AI responses
- **Studio Features**: Implement audio/video generation workers
- **Authentication**: Add user sessions and notebooks

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start Next dev server on port 3000 |
| `pnpm build` | Production build with lint/type checks |
| `pnpm start` | Run production build |
| `pnpm test` | Run all tests |
| `pnpm test:watch` | Watch mode for TDD |
| `pnpm lint` | ESLint code quality checks |

## Accessibility

- Semantic HTML structure
- ARIA labels on interactive elements
- Keyboard navigation support
- 44px minimum touch targets
- Focus visible indicators
- Screen reader friendly

## Performance

- Server-side rendering with Next.js App Router
- Lazy loading for heavy components
- Optimized bundle size via tree-shaking
- Auto-scroll optimization with use-stick-to-bottom
- Efficient re-renders with React 19

---

**Built with Test-Driven Development** - Every component has comprehensive unit tests ensuring reliability and maintainability.
