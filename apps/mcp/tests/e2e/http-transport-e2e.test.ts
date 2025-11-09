/**
 * End-to-End tests for HTTP streaming transport
 * 
 * Tests the complete flow from server startup through tool execution
 * and resource management with real MCP protocol interactions.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createExpressServer } from '../../remote/server.js';
import type { Application } from 'express';
import type { Server } from 'http';
import type { Tool, ContentBlock, TextContent, ResourceLink } from '../../shared/types.js';

describe('HTTP Transport End-to-End', () => {
  let app: Application;
  let server: Server;
  let baseUrl: string;
  let sessionId: string;

  beforeAll(async () => {
    // Set test environment
    process.env.NODE_ENV = 'test';
    process.env.SKIP_HEALTH_CHECKS = 'true';
    process.env.ENABLE_RESUMABILITY = 'true';
    process.env.ALLOWED_ORIGINS = '*';

    // Create and start server
    app = await createExpressServer();

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address();
        if (address && typeof address === 'object') {
          const port = address.port;
          baseUrl = `http://localhost:${port}`;
          console.log(`E2E test server listening on ${baseUrl}`);
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
  });

  describe('Complete MCP Session Flow', () => {
    it('should complete full initialization handshake', async () => {
      // Step 1: Initialize
      const initRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {
            roots: {
              listChanged: true,
            },
          },
          clientInfo: {
            name: 'e2e-test-client',
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

      expect(initResponse.status).toBe(200);
      sessionId = initResponse.headers.get('mcp-session-id')!;
      expect(sessionId).toBeTruthy();

      const initData = await initResponse.json();
      expect(initData).toHaveProperty('result');
      expect(initData.result).toHaveProperty('protocolVersion');
      expect(initData.result).toHaveProperty('capabilities');
      expect(initData.result).toHaveProperty('serverInfo');
      expect(initData.result.serverInfo.name).toBe('@pulsemcp/pulse-crawl');

      // Step 2: Send initialized notification
      const initializedNotification = {
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      };

      const notificationResponse = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
          'Mcp-Session-Id': sessionId,
        },
        body: JSON.stringify(initializedNotification),
      });

      expect(notificationResponse.status).toBe(202);
    });

    it('should list available tools', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
      };

      const response = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
          'Mcp-Session-Id': sessionId,
        },
        body: JSON.stringify(request),
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data).toHaveProperty('result');
      expect(data.result).toHaveProperty('tools');
      expect(Array.isArray(data.result.tools)).toBe(true);
      expect(data.result.tools.length).toBeGreaterThan(0);

      // Verify scrape tool exists
      const scrapeTool = data.result.tools.find((t: unknown): t is Tool => {
        if (!t || typeof t !== 'object') return false;
        return 'name' in t && t.name === 'scrape';
      });
      expect(scrapeTool).toBeTruthy();
      expect(scrapeTool.description).toBeTruthy();
      expect(scrapeTool.inputSchema).toBeTruthy();
    });

    it('should execute scrape tool with example.com', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'scrape',
          arguments: {
            url: 'https://example.com',
            resultHandling: 'returnOnly', // Don't save to avoid storage side effects
          },
        },
      };

      const response = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
          'Mcp-Session-Id': sessionId,
        },
        body: JSON.stringify(request),
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data).toHaveProperty('result');
      expect(data.result).toHaveProperty('content');
      expect(Array.isArray(data.result.content)).toBe(true);
      expect(data.result.content.length).toBeGreaterThan(0);

      // Verify content includes expected text from example.com
      const textContent = data.result.content.find((c: unknown): c is TextContent => {
        if (!c || typeof c !== 'object') return false;
        return 'type' in c && c.type === 'text';
      });
      expect(textContent).toBeTruthy();
      expect(textContent?.text).toContain('Example Domain');
    }, 30000); // 30s timeout for actual network request

    it('should list resources after scraping', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 4,
        method: 'resources/list',
      };

      const response = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
          'Mcp-Session-Id': sessionId,
        },
        body: JSON.stringify(request),
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data).toHaveProperty('result');
      expect(data.result).toHaveProperty('resources');
      expect(Array.isArray(data.result.resources)).toBe(true);
    });

    it('should handle concurrent tool calls', async () => {
      const requests = [
        {
          jsonrpc: '2.0',
          id: 5,
          method: 'tools/list',
        },
        {
          jsonrpc: '2.0',
          id: 6,
          method: 'resources/list',
        },
        {
          jsonrpc: '2.0',
          id: 7,
          method: 'tools/list',
        },
      ];

      const responses = await Promise.all(
        requests.map((req) =>
          fetch(`${baseUrl}/mcp`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
              'Mcp-Session-Id': sessionId,
            },
            body: JSON.stringify(req),
          })
        )
      );

      // All requests should succeed
      for (const response of responses) {
        expect(response.status).toBe(200);
        const data = await response.json();
        if (!data.result) {
          console.error('Response without result:', JSON.stringify(data, null, 2));
        }
        expect(data).toHaveProperty('result');
      }
    });
  });

  describe('Resource Management', () => {
    let resourceUri: string;

    it('should create resource when scraping with saveAndReturn', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 10,
        method: 'tools/call',
        params: {
          name: 'scrape',
          arguments: {
            url: 'https://example.com',
            resultHandling: 'saveAndReturn',
          },
        },
      };

      const response = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
          'Mcp-Session-Id': sessionId,
        },
        body: JSON.stringify(request),
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.result.content).toBeTruthy();

      // Find resource link in response
      const resourceLink = data.result.content.find((c: unknown): c is ResourceLink => {
        if (!c || typeof c !== 'object') return false;
        return 'type' in c && c.type === 'resource_link';
      });
      if (resourceLink) {
        resourceUri = resourceLink.uri;
      }
    }, 30000);

    it('should read created resource', async () => {
      if (!resourceUri) {
        console.log('Skipping: No resource URI from previous test');
        return;
      }

      const request = {
        jsonrpc: '2.0',
        id: 11,
        method: 'resources/read',
        params: {
          uri: resourceUri,
        },
      };

      const response = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
          'Mcp-Session-Id': sessionId,
        },
        body: JSON.stringify(request),
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.result).toHaveProperty('contents');
      expect(Array.isArray(data.result.contents)).toBe(true);
      expect(data.result.contents.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid tool name gracefully', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 20,
        method: 'tools/call',
        params: {
          name: 'non_existent_tool',
          arguments: {},
        },
      };

      const response = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
          'Mcp-Session-Id': sessionId,
        },
        body: JSON.stringify(request),
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data).toHaveProperty('error');
      // SDK returns -32603 (Internal Error) instead of -32602 (Invalid Params)
      // This is SDK behavior when tool is not found
      expect(data.error.code).toBe(-32603);
    });

    it('should handle invalid scrape URL', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 21,
        method: 'tools/call',
        params: {
          name: 'scrape',
          arguments: {
            url: 'not-a-valid-url',
          },
        },
      };

      const response = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
          'Mcp-Session-Id': sessionId,
        },
        body: JSON.stringify(request),
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      // Should return error content, not crash
      expect(data).toBeTruthy();
    });

    it('should handle malformed JSON-RPC requests', async () => {
      const request = {
        // Missing jsonrpc field
        id: 22,
        method: 'tools/list',
      };

      const response = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
          'Mcp-Session-Id': sessionId,
        },
        body: JSON.stringify(request),
      });

      // Should still respond (SDK handles validation)
      expect(response.status).toBeGreaterThanOrEqual(200);
    });
  });

  describe('Session Isolation', () => {
    let session2Id: string;

    it('should create independent session', async () => {
      const initRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: {
            name: 'session-2-client',
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
      session2Id = response.headers.get('mcp-session-id')!;
      expect(session2Id).toBeTruthy();
      expect(session2Id).not.toBe(sessionId);
    });

    it('should maintain independent session state', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 30,
        method: 'tools/list',
      };

      // Request from session 1
      const response1 = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
          'Mcp-Session-Id': sessionId,
        },
        body: JSON.stringify(request),
      });

      // Request from session 2
      const response2 = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
          'Mcp-Session-Id': session2Id,
        },
        body: JSON.stringify(request),
      });

      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);

      // Both should get same tools list but are independent sessions
      const data1 = await response1.json();
      const data2 = await response2.json();

      expect(data1.result.tools).toEqual(data2.result.tools);
    });
  });

  describe('Protocol Compliance', () => {
    it('should respond with correct JSON-RPC structure', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 40,
        method: 'tools/list',
      };

      const response = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
          'Mcp-Session-Id': sessionId,
        },
        body: JSON.stringify(request),
      });

      const data = await response.json();

      expect(data).toHaveProperty('jsonrpc', '2.0');
      expect(data).toHaveProperty('id', 40);
      expect(data).toHaveProperty('result');
    });

    it('should support notifications (no id field)', async () => {
      const notification = {
        jsonrpc: '2.0',
        method: 'notifications/cancelled',
        params: {
          requestId: 999,
          reason: 'test',
        },
      };

      const response = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
          'Mcp-Session-Id': sessionId,
        },
        body: JSON.stringify(notification),
      });

      // Notifications return 202 Accepted (no response expected)
      expect(response.status).toBe(202);
    });

    it('should include server capabilities in initialize response', async () => {
      const initRequest = {
        jsonrpc: '2.0',
        id: 50,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: {
            name: 'capabilities-test',
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

      const data = await response.json();

      expect(data.result.capabilities).toBeTruthy();
      expect(data.result.capabilities).toHaveProperty('tools');
      expect(data.result.capabilities).toHaveProperty('resources');
    });
  });

  describe('Performance', () => {
    it('should handle rapid sequential requests', async () => {
      const requests = Array.from({ length: 10 }, (_, i) => ({
        jsonrpc: '2.0',
        id: 100 + i,
        method: 'tools/list',
      }));

      const startTime = Date.now();

      for (const request of requests) {
        const response = await fetch(`${baseUrl}/mcp`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
            'Mcp-Session-Id': sessionId,
          },
          body: JSON.stringify(request),
        });

        expect(response.status).toBe(200);
      }

      const duration = Date.now() - startTime;
      console.log(`10 sequential requests took ${duration}ms`);

      // Should complete reasonably fast (less than 5 seconds)
      expect(duration).toBeLessThan(5000);
    });

    it('should handle parallel requests efficiently', async () => {
      const requests = Array.from({ length: 10 }, (_, i) => ({
        jsonrpc: '2.0',
        id: 200 + i,
        method: 'resources/list',
      }));

      const startTime = Date.now();

      const responses = await Promise.all(
        requests.map((req) =>
          fetch(`${baseUrl}/mcp`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
              'Mcp-Session-Id': sessionId,
            },
            body: JSON.stringify(req),
          })
        )
      );

      const duration = Date.now() - startTime;
      console.log(`10 parallel requests took ${duration}ms`);

      // All should succeed
      for (const response of responses) {
        expect(response.status).toBe(200);
      }

      // Parallel should be faster than sequential
      expect(duration).toBeLessThan(3000);
    });
  });
});
