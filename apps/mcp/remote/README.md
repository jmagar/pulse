# Pulse Fetch HTTP Server

HTTP streaming transport implementation of the Pulse Fetch MCP server using the Model Context Protocol's StreamableHTTPServerTransport.

## Overview

This package provides an HTTP-based MCP server that exposes the same tools and resources as the stdio version (`@pulsemcp/pulse-crawl`), using HTTP POST requests with JSON responses and optional Server-Sent Events (SSE) for server-initiated messages.

### Key Features

- **HTTP Streaming**: Uses MCP's StreamableHTTPServerTransport (protocol version 2025-03-26)
- **Session Management**: Stateful sessions with cryptographically secure session IDs
- **Resumability**: Optional event replay for reconnections (configurable)
- **DNS Rebinding Protection**: Security features for production deployments
- **Health Checks**: Built-in health endpoint for monitoring
- **CORS Support**: Configurable cross-origin resource sharing
- **Docker Ready**: Production-ready containerization

## Quick Start

### Development

```bash
# Install dependencies
cd remote
npm install

# Set up environment
cp .env.example .env
# Edit .env with your API keys

# Run in development mode
npm run dev
```

The server will start on `http://localhost:3060` by default.

### Production

```bash
# Build
npm run build

# Start
npm start
```

### Docker

```bash
# Build and run with Docker Compose
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

## Configuration

All configuration is done via environment variables. See `.env.example` for all available options.

### Essential Variables

```bash
# Server
PORT=3060
NODE_ENV=production

# Security (required for production)
ALLOWED_ORIGINS=https://your-app.com,https://another-app.com
ALLOWED_HOSTS=your-server.com

# Features
ENABLE_RESUMABILITY=true
ENABLE_OAUTH=false  # OAuth not yet implemented
OPTIMIZE_FOR=speed  # or 'cost'

# API Keys (same as stdio version)
FIRECRAWL_API_KEY=your_key_here
ANTHROPIC_API_KEY=your_key_here
OPENAI_API_KEY=your_key_here
```

## Architecture

The HTTP server shares the same core functionality (`shared/`) with the stdio version, but uses a different transport layer:

```
remote/
├── src/
│   ├── index.ts              # Entry point
│   ├── server.ts             # Express server setup
│   ├── transport.ts          # StreamableHTTP transport factory
│   ├── eventStore.ts         # Event storage for resumability
│   └── middleware/
│       ├── health.ts         # Health check endpoint
│       ├── cors.ts           # CORS configuration
│       └── auth.ts           # Authentication (placeholder)
├── build/                    # Compiled output
├── Dockerfile                # Docker image
└── docker-compose.yml        # Docker Compose config
```

## Endpoints

### `POST /mcp`

Main MCP endpoint for JSON-RPC requests.

**Headers:**

- `Content-Type: application/json`
- `Mcp-Session-Id: <session-id>` (for existing sessions)

**Request:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2025-03-26",
    "clientInfo": {
      "name": "my-client",
      "version": "1.0.0"
    }
  }
}
```

**Response:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "2025-03-26",
    "serverInfo": {
      "name": "pulse-crawl",
      "version": "0.3.0"
    },
    "capabilities": { ... }
  }
}
```

### `GET /mcp`

Establish SSE stream for receiving server-initiated messages (notifications, logging).

**Headers:**

- `Mcp-Session-Id: <session-id>`
- `Last-Event-ID: <event-id>` (for resumption)

**Response:**
Server-Sent Events stream with MCP notifications.

### `DELETE /mcp`

Terminate a session.

**Headers:**

- `Mcp-Session-Id: <session-id>`

### `GET /health`

Health check endpoint.

**Response:**

```json
{
  "status": "healthy",
  "timestamp": "2025-11-05T12:00:00.000Z",
  "version": "0.3.0",
  "transport": "http-streaming"
}
```

## Connecting Clients

### MCP Inspector

```bash
npx @modelcontextprotocol/inspector
# Connect to: http://localhost:3060/mcp
```

### Claude Code

```bash
claude mcp add --transport http pulse-crawl-remote http://localhost:3060/mcp
```

### Custom Client

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const client = new Client({
  name: 'my-client',
  version: '1.0.0',
});

const transport = new StreamableHTTPClientTransport(new URL('http://localhost:3060/mcp'));

await client.connect(transport);

// Use the client
const tools = await client.listTools();
console.log(tools);
```

## Resumability

When `ENABLE_RESUMABILITY=true`, the server stores events in memory and allows clients to reconnect and resume from their last received event using the `Last-Event-ID` header.

**Note:** In-memory event storage is suitable for development but not for production. For production, implement a persistent event store (Redis, PostgreSQL, etc.) by extending the `EventStore` interface in `eventStore.ts`.

## Security

### OAuth Authentication

OAuth authentication is **not yet implemented** but can be enabled via the `ENABLE_OAUTH` environment variable:

```bash
# Default: OAuth disabled (recommended until implementation is complete)
ENABLE_OAUTH=false

# When enabled: /register and /authorize endpoints return 501 (Not Implemented)
ENABLE_OAUTH=true
```

**Current behavior:**

- `ENABLE_OAUTH=false` (default): OAuth endpoints (`/register`, `/authorize`) return 404 with a clear error message
- `ENABLE_OAUTH=true`: OAuth endpoints return 501 (Not Implemented) to indicate the feature is planned

**Client configuration:**
If you're seeing "Cannot POST /register" errors, your MCP client is configured to use OAuth. Since OAuth is not yet implemented, configure your client to connect without OAuth.

### Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Configure `ALLOWED_ORIGINS` to specific domains (not `*`)
- [ ] Configure `ALLOWED_HOSTS` to your server's domain
- [ ] Use HTTPS (terminate SSL at reverse proxy/load balancer)
- [ ] Implement authentication middleware in `middleware/auth.ts`
- [ ] Use environment-specific API keys
- [ ] Enable rate limiting at reverse proxy level
- [ ] Monitor logs and health endpoint
- [ ] Implement persistent event store for resumability

### DNS Rebinding Protection

When `enableDnsRebindingProtection` is enabled (automatic in production), the server validates:

- Host header matches allowed hosts
- Origin header matches allowed origins

## Differences from Stdio Version

| Feature            | Stdio (`@pulsemcp/pulse-crawl`) | HTTP (`@pulsemcp/pulse-crawl-remote`) |
| ------------------ | ------------------------------- | ------------------------------------- |
| Transport          | stdin/stdout                    | HTTP (JSON) + optional SSE            |
| Session Management | N/A                             | Session IDs required                  |
| Resumability       | N/A                             | Optional (configurable)               |
| Multiple Clients   | No                              | Yes (multi-session)                   |
| Network Access     | Local only                      | Network accessible                    |
| Deployment         | Desktop/CLI                     | Server/Cloud                          |
| Security           | Process isolation               | CORS, auth, DNS protection            |

## Troubleshooting

### Port Already in Use

```bash
# Change the port
PORT=3001 npm start
```

### CORS Errors

Ensure your client's origin is in `ALLOWED_ORIGINS`:

```bash
ALLOWED_ORIGINS=http://localhost:3060,https://myapp.com
```

### Session Not Found

Sessions are stored in memory. If the server restarts, all sessions are lost. Enable resumability to help clients reconnect:

```bash
ENABLE_RESUMABILITY=true
```

### Health Check Failing

Check the health endpoint directly:

```bash
curl http://localhost:3060/health
```

If it returns a 200 status with JSON, the server is healthy.

## Development

### Building

```bash
npm run build
```

### Running Tests

```bash
# Run integration tests
cd ..
npm run test:integration

# Run manual tests
npm run test:manual
```

### Linting

```bash
npm run lint
npm run lint:fix
```

## License

MIT

## Related

- [Stdio Version](../local/README.md)
- [Shared Core](../shared/README.md)
- [MCP Specification](https://modelcontextprotocol.io)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
