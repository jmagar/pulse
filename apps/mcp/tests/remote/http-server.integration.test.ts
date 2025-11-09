import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createExpressServer } from '../../remote/server.js';
import type { Application } from 'express';
import type { Server } from 'http';

describe('HTTP Server Integration', () => {
  let app: Application;
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    // Set test environment
    process.env.NODE_ENV = 'test';
    process.env.SKIP_HEALTH_CHECKS = 'true';
    process.env.ENABLE_RESUMABILITY = 'false';
    process.env.ALLOWED_ORIGINS = '*';

    // Create server
    app = await createExpressServer();

    // Start listening on a random port
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address();
        if (address && typeof address === 'object') {
          const port = address.port;
          baseUrl = `http://localhost:${port}`;
          console.log(`Test server listening on ${baseUrl}`);
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    // Close server
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
  });

  describe('Health Endpoint', () => {
    it('should respond to GET /health with 200', async () => {
      const response = await fetch(`${baseUrl}/health`);

      expect(response.status).toBe(200);
    });

    it('should return JSON health status', async () => {
      const response = await fetch(`${baseUrl}/health`);
      const data = await response.json();

      expect(data).toHaveProperty('status', 'healthy');
      expect(data).toHaveProperty('timestamp');
      expect(data).toHaveProperty('version');
      expect(data).toHaveProperty('transport', 'http-streaming');
    });

    it('should include timestamp in ISO format', async () => {
      const response = await fetch(`${baseUrl}/health`);
      const data = await response.json();

      expect(data.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe('MCP Endpoint', () => {
    it('should respond to POST /mcp', async () => {
      const initRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: {
            name: 'test-client',
            version: '1.0.0',
          },
        },
      };

      const response = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
        },
        body: JSON.stringify(initRequest),
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('mcp-session-id')).toBeTruthy();
    });

    it('should reject non-initialization requests without session ID', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
      };

      const response = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
        },
        body: JSON.stringify(request),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toHaveProperty('error');
      expect(data.error.message).toContain('No valid session ID');
    });

    it('should set Mcp-Session-Id header on initialization', async () => {
      const initRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: {
            name: 'test-client',
            version: '1.0.0',
          },
        },
      };

      const response = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
        },
        body: JSON.stringify(initRequest),
      });

      const sessionId = response.headers.get('mcp-session-id');
      expect(sessionId).toBeTruthy();
      expect(typeof sessionId).toBe('string');
      expect(sessionId!.length).toBeGreaterThan(0);
    });

    it('should accept requests with valid session ID', async () => {
      // First, initialize
      const initRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: {
            name: 'test-client',
            version: '1.0.0',
          },
        },
      };

      const initResponse = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
        },
        body: JSON.stringify(initRequest),
      });

      const sessionId = initResponse.headers.get('mcp-session-id');
      expect(sessionId).toBeTruthy();

      // Then, send initialized notification
      const initializedRequest = {
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      };

      const response = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
          'Mcp-Session-Id': sessionId!,
        },
        body: JSON.stringify(initializedRequest),
      });

      // Notifications return 202 Accepted (no response expected)
      expect(response.status).toBe(202);
    });
  });

  describe('CORS Headers', () => {
    it('should include CORS headers in response', async () => {
      const response = await fetch(`${baseUrl}/health`, {
        method: 'GET',
        headers: {
          Origin: 'http://localhost:3060',
        },
      });

      expect(response.headers.get('access-control-allow-origin')).toBeTruthy();
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid JSON gracefully', async () => {
      const response = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
        },
        body: 'invalid json{',
      });

      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    it('should return 404 for non-existent routes', async () => {
      const response = await fetch(`${baseUrl}/non-existent`);

      expect(response.status).toBe(404);
    });
  });
});
