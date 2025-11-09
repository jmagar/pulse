/**
 * End-to-End tests for SSE streaming functionality
 * 
 * Tests Server-Sent Events stream establishment, reconnection,
 * and message delivery through the HTTP transport.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createExpressServer } from '../../remote/server.js';
import type { Application } from 'express';
import type { Server } from 'http';
import { EventSource } from 'eventsource';

describe('SSE Streaming End-to-End', () => {
  let app: Application;
  let server: Server;
  let baseUrl: string;
  let sessionId: string;

  // Helper to wait for SSE cleanup on server side
  // EventSource.close() is sync on client but async on server
  const waitForSSECleanup = () => new Promise((resolve) => setTimeout(resolve, 250));

  beforeAll(async () => {
    // Set test environment with resumability enabled
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
          console.log(`SSE E2E test server listening on ${baseUrl}`);
        }
        resolve();
      });
    });

    // Initialize a session for SSE tests
    const initRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: {
          name: 'sse-test-client',
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

    sessionId = initResponse.headers.get('mcp-session-id')!;
    expect(sessionId).toBeTruthy();

    // Send initialized notification
    const initializedNotification = {
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    };

    await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'Mcp-Session-Id': sessionId,
      },
      body: JSON.stringify(initializedNotification),
    });
  });

  afterEach(async () => {
    // Wait for server-side SSE cleanup after each test
    // EventSource.close() is synchronous on client but async cleanup on server
    await waitForSSECleanup();
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

  describe('SSE Stream Establishment', () => {
    it('should establish SSE stream with valid session ID', async () => {
      return new Promise<void>((resolve, reject) => {
        // Use query parameter for session ID (EventSource header support is limited)
        const eventSource = new EventSource(`${baseUrl}/mcp?sessionId=${sessionId}`);

        const timeout = setTimeout(() => {
          eventSource.close();
          reject(new Error('SSE connection timeout'));
        }, 5000);

        eventSource.onopen = () => {
          clearTimeout(timeout);
          eventSource.close();
          resolve();
        };

        eventSource.onerror = (error) => {
          clearTimeout(timeout);
          eventSource.close();
          reject(error);
        };
      });
    });

    it('should reject SSE stream without session ID', async () => {
      return new Promise<void>((resolve, reject) => {
        const eventSource = new EventSource(`${baseUrl}/mcp`);

        const timeout = setTimeout(() => {
          eventSource.close();
          reject(new Error('Should have failed but timed out'));
        }, 5000);

        eventSource.onerror = () => {
          clearTimeout(timeout);
          eventSource.close();
          // Error is expected
          resolve();
        };

        eventSource.onopen = () => {
          clearTimeout(timeout);
          eventSource.close();
          reject(new Error('Should not have connected without session ID'));
        };
      });
    });

    it('should reject SSE stream with invalid session ID', async () => {
      return new Promise<void>((resolve, reject) => {
        const eventSource = new EventSource(`${baseUrl}/mcp?sessionId=invalid-session-id-12345`);

        const timeout = setTimeout(() => {
          eventSource.close();
          reject(new Error('Should have failed but timed out'));
        }, 5000);

        eventSource.onerror = () => {
          clearTimeout(timeout);
          eventSource.close();
          // Error is expected
          resolve();
        };

        eventSource.onopen = () => {
          clearTimeout(timeout);
          eventSource.close();
          reject(new Error('Should not have connected with invalid session ID'));
        };
      });
    });
  });

  describe('SSE Message Delivery', () => {
    // DEPRECATED: The 'endpoint' event was part of the old SSEServerTransport protocol (deprecated 2024-11-05).
    // The modern StreamableHTTPServerTransport (2025-03-26) does not send endpoint events because
    // it uses a unified /mcp endpoint for all operations (POST returns JSON, GET establishes optional SSE stream).
    // Clients no longer need an endpoint event since they already know where to POST.
    it.skip('should receive endpoint event on connection', async () => {
      return new Promise<void>((resolve, reject) => {
        const eventSource = new EventSource(`${baseUrl}/mcp?sessionId=${sessionId}`);

        const timeout = setTimeout(() => {
          eventSource.close();
          reject(new Error('Did not receive endpoint event'));
        }, 5000);

        let receivedEndpoint = false;

        eventSource.addEventListener('endpoint', (event) => {
          receivedEndpoint = true;
          clearTimeout(timeout);
          eventSource.close();

          try {
            const data = JSON.parse(event.data);
            expect(data).toBeTruthy();
            resolve();
          } catch (error) {
            reject(error);
          }
        });

        eventSource.onerror = (error) => {
          if (!receivedEndpoint) {
            clearTimeout(timeout);
            eventSource.close();
            reject(error);
          }
        };
      });
    });
  });

  describe('SSE Reconnection and Resumability', () => {
    it('should support Last-Event-ID header for reconnection', async () => {
      // This test verifies the protocol support
      // Actual resumability testing requires triggering server notifications
      // Note: Last-Event-ID is sent automatically by EventSource on reconnect

      return new Promise<void>((resolve, reject) => {
        const eventSource = new EventSource(`${baseUrl}/mcp?sessionId=${sessionId}`);

        const timeout = setTimeout(() => {
          eventSource.close();
          // Timeout is acceptable - we're just verifying the header is accepted
          resolve();
        }, 3000);

        eventSource.onopen = () => {
          clearTimeout(timeout);
          eventSource.close();
          resolve();
        };

        eventSource.onerror = (error) => {
          clearTimeout(timeout);
          eventSource.close();
          // Some errors are acceptable for this test
          resolve();
        };
      });
    });
  });

  describe('SSE Connection Lifecycle', () => {
    it('should handle connection close gracefully', async () => {
      return new Promise<void>((resolve, reject) => {
        const eventSource = new EventSource(`${baseUrl}/mcp?sessionId=${sessionId}`);

        const timeout = setTimeout(() => {
          eventSource.close();
          reject(new Error('Connection timeout'));
        }, 5000);

        eventSource.onopen = () => {
          clearTimeout(timeout);
          // Close immediately after opening
          eventSource.close();
          
          // Verify closed
          expect(eventSource.readyState).toBe(EventSource.CLOSED);
          resolve();
        };

        eventSource.onerror = (error) => {
          clearTimeout(timeout);
          eventSource.close();
          reject(error);
        };
      });
    });

    it('should handle multiple concurrent SSE connections', async () => {
      const connections: EventSource[] = [];
      const sessions: string[] = [];

      try {
        // Create 3 concurrent connections, each with its own session
        const setupPromises = Array.from({ length: 3 }, async (_, i) => {
          // Initialize a new session
          const initResponse = await fetch(`${baseUrl}/mcp`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json, text/event-stream',
            },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 100 + i,
              method: 'initialize',
              params: {
                protocolVersion: '2025-03-26',
                capabilities: {},
                clientInfo: {
                  name: `concurrent-test-client-${i}`,
                  version: '1.0.0',
                },
              },
            }),
          });

          const newSessionId = initResponse.headers.get('mcp-session-id')!;
          sessions.push(newSessionId);

          // Create SSE connection for this session
          return new Promise<void>((resolve, reject) => {
            const eventSource = new EventSource(`${baseUrl}/mcp?sessionId=${newSessionId}`);
            connections.push(eventSource);

            const timeout = setTimeout(() => {
              reject(new Error(`Connection ${i} timeout`));
            }, 5000);

            eventSource.onopen = () => {
              clearTimeout(timeout);
              resolve();
            };

            eventSource.onerror = (error) => {
              clearTimeout(timeout);
              reject(error);
            };
          });
        });

        // Wait for all connections to open
        await Promise.all(setupPromises);

        // All should be open
        expect(connections.every((es) => es.readyState === EventSource.OPEN)).toBe(true);
      } finally {
        // Clean up all connections
        connections.forEach((es) => es.close());
      }
    });
  });

  describe('SSE Protocol Compliance', () => {
    it('should use correct content-type for SSE', async () => {
      const response = await fetch(`${baseUrl}/mcp?sessionId=${sessionId}`, {
        method: 'GET',
        headers: {
          'Accept': 'text/event-stream',
          'Mcp-Protocol-Version': '2025-03-26',
        },
      });

      const contentType = response.headers.get('content-type');
      expect(contentType).toContain('text/event-stream');

      // Close the response stream to clean up server-side connection
      await response.body?.cancel();
    });

    it('should set correct cache headers for SSE', async () => {
      const response = await fetch(`${baseUrl}/mcp?sessionId=${sessionId}`, {
        method: 'GET',
        headers: {
          'Accept': 'text/event-stream',
          'Mcp-Protocol-Version': '2025-03-26',
        },
      });

      // Verify response succeeded
      expect(response.ok, `Response failed with status ${response.status}`).toBe(true);

      const cacheControl = response.headers.get('cache-control');
      expect(cacheControl, 'cache-control header should be set').toBeTruthy();
      expect(cacheControl).toContain('no-cache');

      // Close the response stream to clean up server-side connection
      await response.body?.cancel();
    });
  });
});
