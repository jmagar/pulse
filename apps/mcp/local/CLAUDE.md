# Local Module - Stdio MCP Server

This module provides the stdio transport implementation of Pulse Fetch for Claude Desktop.

## Architecture

- **Purpose**: Thin wrapper around shared module for stdio (standard input/output) transport
- **Transport**: `StdioServerTransport` from MCP SDK
- **Target Client**: Claude Desktop application
- **Shared Dependency**: `"pulse-shared": "file:../shared"`

## Key Files

- [index.ts](index.ts) - Main entry point, registers shared tools/resources via stdio
- [index.integration-with-mock.ts](index.integration-with-mock.ts) - Integration test with mocked clients
- [setup-dev.js](setup-dev.js) - Creates symlink to shared for development
- [prepare-publish.js](prepare-publish.js) - Prepares npm package before publishing

## Development Workflow

```bash
# Development with auto-reload (builds shared first)
npm run dev

# Build for production (builds shared first)
npm run build

# Start production server
npm start
```

## Important Notes

- **No Business Logic**: All features implemented in `shared/`, this is just transport
- **Symlink in Dev**: `setup-dev.js` creates `shared/` symlink for local development
- **Published Package**: Runs as `npx @pulsemcp/pulse` in Claude Desktop

## Claude Desktop Configuration

Minimal config (macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "pulse": {
      "command": "npx",
      "args": ["-y", "@pulsemcp/pulse"],
      "env": {
        "FIRECRAWL_API_KEY": "your-key-here"
      }
    }
  }
}
```

## Environment Variables

All environment variables are passed from Claude Desktop config. See [../.env.example](../.env.example) for options.

## Prebuild Scripts

- **predev**: Builds shared before starting dev server
- **prebuild**: Builds shared before building local

## Publishing

See [../docs/PUBLISHING_SERVERS.md](../docs/PUBLISHING_SERVERS.md) for the complete publication process.

Quick version:

```bash
# From project root
npm version patch  # or minor/major
npm run build
cd local
npm publish
```

## Testing

Integration tests use `index.integration-with-mock.ts` to test the full server with mocked scraping clients.

```bash
# From project root
npm run test:integration
```

## Common Issues

- **"Cannot find module 'pulse-shared'"**: Run `npm install` from project root to sync workspace
- **Outdated shared code**: Run `npm run build` in `shared/` directory first
- **Symlink issues**: Run `node setup-dev.js` to recreate symlink
