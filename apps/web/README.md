# Pulse Web Interface

Next.js web interface for the Pulse monorepo, providing a UI for Firecrawl web scraping and search capabilities.

## Overview

This is a [Next.js](https://nextjs.org) v15+ application using the App Router, built with React 19+, TypeScript, and Tailwind CSS.

## Technology Stack

- **Framework**: Next.js 15+ (App Router)
- **UI Library**: React 19+ with hooks
- **Styling**: Tailwind CSS v4+
- **Type Safety**: TypeScript with strict mode
- **UI Components**: shadcn/ui (Radix UI + Tailwind)
- **Package Manager**: pnpm (workspace)

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 10+
- Docker (for infrastructure services)

### Development

From the repository root:

```bash
# Install all workspace dependencies
pnpm install

# Run web interface in development mode
pnpm dev:web

# Run web and MCP together
pnpm dev

# Run all services (web, MCP, webhook)
pnpm dev:all
```

The web interface will be available at [http://localhost:3000](http://localhost:3000).

### Building

```bash
# Build from repository root
pnpm build:web

# Or from this directory
pnpm build
```

### Testing

```bash
# Run tests from repository root
pnpm test:web

# Or from this directory
pnpm test
```

## Project Structure

```
apps/web/
├── app/              # Next.js App Router pages
├── components/       # React components
├── lib/              # Utility functions
├── public/           # Static assets
├── styles/           # Global styles
└── package.json      # Dependencies and scripts
```

## Configuration

The web interface uses environment variables from the root `.env` file:

- `NEXT_PUBLIC_API_URL` - Firecrawl API endpoint
- `NEXT_PUBLIC_MCP_URL` - MCP server endpoint
- `NEXT_PUBLIC_WEBHOOK_URL` - Webhook bridge endpoint

See [../../.env.example](../../.env.example) for all available variables.

## Development Workflow

### Mobile-First Design

Follow the mobile-first approach:

1. **Start Mobile**: Design for 320px viewport first
2. **Touch Targets**: Minimum 44px touch areas
3. **Responsive Utilities**: Tailwind breakpoints (`w-full md:w-auto`)
4. **Test Mobile**: Chrome DevTools mobile emulation
5. **Progressive Enhancement**: Add desktop features after mobile works

### Component Guidelines

- **Functional Components**: Use hooks only (no class components)
- **Named Exports**: Export components with named exports
- **Type Safety**: Define prop types with TypeScript interfaces
- **Accessibility**: Follow WCAG 2.1 AA guidelines
- **Composition**: Build complex components from smaller ones

## Integration

The web interface integrates with other monorepo services:

- **Firecrawl API**: For web scraping operations
- **MCP Server**: For Claude Desktop integration
- **Webhook Bridge**: For semantic search capabilities

See the [root README](../../README.md) for service URLs and integration details.

## Deployment

The web interface is deployed via Docker Compose:

```bash
# From repository root
docker compose up -d
```

For self-hosted deployment, see the main [deployment documentation](../../README.md#deployment).

## Learn More

- [Next.js Documentation](https://nextjs.org/docs) - Next.js features and API
- [React Documentation](https://react.dev) - React hooks and patterns
- [Tailwind CSS](https://tailwindcss.com/docs) - Utility-first CSS framework
- [shadcn/ui](https://ui.shadcn.com) - Re-usable component library

## Contributing

Follow the monorepo conventions:

- **TypeScript**: Strict mode enabled
- **ESLint**: Follow configured rules
- **Prettier**: Auto-format on save
- **Testing**: Write tests for new features
- **Mobile-First**: Design for mobile first

See [CLAUDE.md](../../CLAUDE.md) for complete coding standards.

## License

See the repository root for license information.
