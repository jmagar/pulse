# CLAUDE.md - Remote (HTTP Transport)

This file provides guidance to Claude Code when working on the HTTP transport implementation of Pulse Fetch MCP server.

## Overview

The `remote/` directory implements HTTP-based access to Pulse Fetch, enabling hosted/remote usage vs. the stdio-based `local/` implementation. Both share core functionality from `shared/`.

## Architecture

### Transport Layer

- **Protocol**: StreamableHTTP (hybrid HTTP + SSE) for MCP over HTTP
- **Transport**: Uses `@modelcontextprotocol/sdk/server/streamableHttp.js`
- **Primary Mode**: POST requests with JSON responses (`enableJsonResponse: true`)
- **Optional SSE**: GET requests can establish SSE streams for server-initiated messages
- **Middleware**: Express.js for HTTP routing and middleware
- **Event Store**: Persistent event storage for session management

### Key Components

```
remote/
├── server.ts          # Express app setup, middleware, health endpoints
├── index.ts           # StreamableHTTP transport initialization, MCP registration
├── transport.ts       # Custom StreamableHTTP transport with event store integration
├── eventStore.ts      # Event persistence for debugging/replay
└── middleware/        # Authentication, logging, CORS, etc.
```

## Development Patterns

### StreamableHTTP Transport Implementation

The remote server uses StreamableHTTP, a hybrid protocol combining HTTP and SSE:

```typescript
// Creating StreamableHTTP transport with event store integration
const transport = new StreamableHTTPServerTransport({
  // Return JSON responses for POST requests instead of streaming
  enableJsonResponse: true,

  // Event store integration for debugging
  onmessage: async (message) => {
    await eventStore.storeEvent(sessionId, 'request', message);
  },
});
```

**How StreamableHTTP Works:**

- **POST requests**: Client sends JSON-RPC requests, server returns JSON responses directly
- **GET requests** (optional): Establish SSE stream for server-initiated messages (notifications, progress)
- **Session ID**: Passed in `Mcp-Session-Id` header (POST/DELETE) or `sessionId` query param (GET)

**Key Considerations:**

- Primary communication is bidirectional via POST/response (no SSE needed for basic usage)
- Optional SSE streaming available for long-running operations and server push
- Keep SSE connections alive with periodic heartbeats (if using SSE)
- Handle connection drops and automatic reconnection (if using SSE)
- Store events for debugging and session replay

### Middleware Stack

Apply middleware in this order:

1. **Logging**: Request/response logging (morgan, custom)
2. **CORS**: Configure for trusted origins only
3. **Authentication**: Validate API keys/tokens before processing
4. **Body Parsing**: JSON and URL-encoded
5. **Rate Limiting**: Prevent abuse
6. **Error Handling**: Centralized error middleware (last)

### Session Management

```typescript
// Sessions are identified by client-provided session IDs
// Header name: 'Mcp-Session-Id' (POST/DELETE) or query param 'sessionId' (GET)
const sessionId = req.headers['mcp-session-id'] || req.query.sessionId || generateSessionId();

// Each session gets its own MCP server instance
const server = new Server(/* session-specific config */);
```

**Best Practices:**

- Generate secure random session IDs
- Set reasonable session timeouts (e.g., 30 minutes idle)
- Clean up server instances on session end
- Store session state for reconnection

### Authentication

```typescript
// Middleware pattern for API key validation
const authenticate = async (req, res, next) => {
  const apiKey = req.headers.authorization?.replace('Bearer ', '');
  if (!(await validateApiKey(apiKey))) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};
```

**Security Requirements:**

- Never log API keys or tokens
- Use environment variables for secrets
- Implement rate limiting per API key
- Support token rotation without downtime

## Testing Remote Server

### Integration Testing Pattern

```typescript
// Use supertest for HTTP endpoint testing
import request from 'supertest';
import { app } from './server';

describe('Remote Server', () => {
  it('handles POST requests with JSON responses', async () => {
    const response = await request(app)
      .post('/mcp')
      .set('Mcp-Session-Id', 'test-session')
      .send({ jsonrpc: '2.0', method: 'tools/list', id: 1 });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.body).toHaveProperty('result');
  });

  it('establishes SSE connection for streaming (optional)', async () => {
    const response = await request(app)
      .get('/mcp?sessionId=test-session')
      .set('Accept', 'text/event-stream');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/event-stream');
  });
});
```

### Manual Testing Tools

- **curl**: Test POST requests with `curl -X POST http://localhost:PORT/mcp -H "Mcp-Session-Id: test" -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'`
- **curl (SSE)**: Test optional SSE streaming with `curl -N http://localhost:PORT/mcp?sessionId=test` (if needed)
- **Postman**: Create collections for all endpoints (POST to /mcp for tool calls)
- **Browser DevTools**: Monitor SSE in Network tab (EventStream) if using GET streaming
- **MCP Inspector**: Use official inspector for protocol validation

## Deployment Considerations

### Docker Configuration

```dockerfile
# Multi-stage build for remote server
FROM node:20-alpine AS build
WORKDIR /app
COPY . .
RUN npm ci && npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY package*.json ./
RUN npm ci --production
EXPOSE 52001
CMD ["node", "dist/index.js"]
```

### Environment Variables

```bash
# Remote-specific configuration
PORT=52001
HOST=0.0.0.0
NODE_ENV=production

# Shared service credentials (from root .env)
FIRECRAWL_API_KEY=...
ANTHROPIC_API_KEY=...

# Remote-specific features
ENABLE_EVENT_STORE=true
SESSION_TIMEOUT_MS=1800000
MAX_CONNECTIONS=100
```

### Health Checks

Implement comprehensive health endpoints:

```typescript
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

app.get('/health/ready', async (req, res) => {
  // Check dependencies (Redis, DB, external APIs)
  const checks = await Promise.all([checkRedis(), checkDatabase(), checkStorage()]);

  res.json({
    status: checks.every((c) => c.ok) ? 'ready' : 'degraded',
    checks,
  });
});
```

## Key Differences from Local

| Aspect             | Local (stdio)        | Remote (HTTP)                   |
| ------------------ | -------------------- | ------------------------------- |
| **Transport**      | StdioServerTransport | StreamableHTTPServerTransport   |
| **Communication**  | stdin/stdout pipes   | HTTP POST (JSON) + optional SSE |
| **Authentication** | OS-level user        | API keys/tokens                 |
| **Concurrency**    | Single user          | Multiple sessions               |
| **State**          | Ephemeral            | Persistent (eventStore)         |
| **Deployment**     | Desktop app bundle   | Docker container                |

## Common Pitfalls

- **SSE Connection Limits** (if using SSE streaming): Browsers limit SSE connections per domain (usually 6)
- **Proxy Issues** (if using SSE streaming): Some proxies/CDNs buffer SSE, breaking real-time updates
- **CORS Configuration**:
  - POST requests: Standard CORS preflight for JSON requests
  - GET SSE requests: Proper CORS with `text/event-stream` support
- **Memory Leaks**: Clean up server instances and transports when sessions end
- **Session Management**: Ensure session IDs are consistent between POST and GET requests
- **Error Handling**: JSON-RPC errors in POST responses; SSE stream errors require special handling

## Development Workflow

```bash
# Install dependencies (from project root)
npm run install-all

# Start remote server in development mode
cd remote
npm run dev

# Run tests
npm test

# Build for production
npm run build

# Deploy with Docker Compose
docker compose up -d remote
```

## Resources

- [MCP HTTP with SSE Transport Docs](https://modelcontextprotocol.io/docs/concepts/transports#http-with-sse)
- [Server-Sent Events Spec](https://html.spec.whatwg.org/multipage/server-sent-events.html) (for optional SSE streaming)
- [Express.js Best Practices](https://expressjs.com/en/advanced/best-practice-performance.html)
- [JSON-RPC 2.0 Specification](https://www.jsonrpc.org/specification)
