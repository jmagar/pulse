#!/usr/bin/env node

import { config } from 'dotenv';
import express, { Application } from 'express';
import cors from 'cors';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { createMCPServer } from './shared/index.js';
import type { IScrapingClients, INativeFetcher, IFirecrawlClient } from './shared/index.js';
import { createTransport } from './transport.js';
import { healthCheck, getCorsOptions } from './middleware/index.js';

// Load environment variables (quiet mode to suppress v17 logging)
config({ quiet: true });

// Mock client implementations for integration testing
class MockNativeFetcher implements INativeFetcher {
  async scrape(_url: string): Promise<{
    success: boolean;
    status?: number;
    data?: string;
    error?: string;
  }> {
    const mockData = process.env.MOCK_NATIVE_DATA;
    const mockSuccess = process.env.MOCK_NATIVE_SUCCESS === 'true';
    const mockStatus = parseInt(process.env.MOCK_NATIVE_STATUS || '200');

    if (mockSuccess && mockData) {
      return {
        success: true,
        status: mockStatus,
        data: mockData,
      };
    }

    return {
      success: false,
      status: mockStatus,
      error: 'Mock native fetch failed',
    };
  }
}

class MockFirecrawlClient implements IFirecrawlClient {
  async scrape(_url: string): Promise<{
    success: boolean;
    data?: {
      content: string;
      markdown: string;
      html: string;
      metadata: Record<string, unknown>;
    };
    error?: string;
  }> {
    const mockData = process.env.MOCK_FIRECRAWL_DATA;
    const mockSuccess = process.env.MOCK_FIRECRAWL_SUCCESS === 'true';

    if (mockSuccess && mockData) {
      return {
        success: true,
        data: {
          content: mockData,
          markdown: mockData,
          html: `<html><body>${mockData}</body></html>`,
          metadata: { source: 'firecrawl-mock' },
        },
      };
    }

    return {
      success: false,
      error: 'Mock Firecrawl failed',
    };
  }
}

/**
 * Creates Express server with mocked scraping clients for integration testing
 */
async function createMockExpressServer(): Promise<Application> {
  const app = express();

  // Middleware
  app.use(express.json());
  app.use(cors(getCorsOptions()));

  // Health check endpoint
  app.get('/health', healthCheck);

  // Transport storage: maps session IDs to their transports
  const transports: Record<string, StreamableHTTPServerTransport> = {};

  // MCP endpoint with mocked clients
  app.all('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    if (sessionId) {
      console.error(`[MCP Mock] ${req.method} request for session: ${sessionId}`);
    } else {
      console.error(`[MCP Mock] ${req.method} request (no session)`);
    }

    try {
      let transport: StreamableHTTPServerTransport;

      if (sessionId && transports[sessionId]) {
        // Reuse existing transport for this session
        transport = transports[sessionId];
      } else if (!sessionId && isInitializeRequest(req.body)) {
        // New initialization request - create transport and server with mocks
        transport = createTransport({
          enableResumability: process.env.ENABLE_RESUMABILITY === 'true',
          onSessionInitialized: (sid) => {
            console.error(`[MCP Mock] Session initialized: ${sid}`);
            transports[sid] = transport;
          },
          onSessionClosed: (sid) => {
            console.error(`[MCP Mock] Session closed: ${sid}`);
            delete transports[sid];
          },
        });

        // Set up onclose handler
        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid && transports[sid]) {
            console.error(`[MCP Mock] Transport closed for session ${sid}`);
            delete transports[sid];
          }
        };

        // Create MCP server with mock clients
        const { server, registerHandlers } = createMCPServer();

        const mockClientFactory = (): IScrapingClients => ({
          native: new MockNativeFetcher(),
          firecrawl:
            process.env.ENABLE_FIRECRAWL_MOCK === 'true' ? new MockFirecrawlClient() : undefined,
        });

        await registerHandlers(server, mockClientFactory);
        await server.connect(transport);

        console.error('[MCP Mock] New server instance connected with mocked clients');
      } else {
        // Invalid request
        res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Bad Request: No valid session ID provided or not an initialization request',
          },
          id: null,
        });
        return;
      }

      // Handle the request with the transport
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error('[MCP Mock] Error handling request:', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error',
          },
          id: null,
        });
      }
    }
  });

  return app;
}

/**
 * Main entry point for integration testing with mocked dependencies
 */
async function main(): Promise<void> {
  console.error('Starting HTTP integration test server with mocked clients...');

  const app = await createMockExpressServer();
  const port = parseInt(process.env.PORT || '3060', 10);

  const server = app.listen(port, () => {
    console.error(`\n${'='.repeat(60)}`);
    console.error('Pulse Fetch HTTP Integration Test Server (Mocked)');
    console.error(`${'='.repeat(60)}`);
    console.error(`Server:       http://localhost:${port}`);
    console.error(`MCP endpoint: http://localhost:${port}/mcp`);
    console.error(`Health check: http://localhost:${port}/health`);
    console.error(`${'='.repeat(60)}\n`);
  });

  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`Error: Port ${port} is already in use`);
      console.error('Please set a different PORT in your environment variables');
    } else {
      console.error('Server error:', error);
    }
    process.exit(1);
  });
}

main().catch((error) => {
  console.error('Integration test server error:', error);
  process.exit(1);
});
