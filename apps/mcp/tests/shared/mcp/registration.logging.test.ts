import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { registerTools, registerResources } from '../../../shared/mcp/registration.js';
import type { ClientFactory, StrategyConfigFactory } from '../../../shared/server.js';
import { ResourceStorageFactory } from '../../../shared/storage/index.js';

describe('MCP Registration Logging', () => {
  let server: Server;
  let clientFactory: ClientFactory;
  let strategyConfigFactory: StrategyConfigFactory;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  const originalEnv = process.env;

  beforeEach(() => {
    // Set up environment for Firecrawl tools
    process.env = {
      ...originalEnv,
      FIRECRAWL_API_KEY: 'test-api-key',
    };

    // Create server with capabilities
    server = new Server(
      { name: 'test-server', version: '1.0.0' },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    );

    // Mock factories
    clientFactory = vi.fn();
    strategyConfigFactory = vi.fn(() => ({
      loadConfig: vi.fn().mockResolvedValue([]),
      saveConfig: vi.fn().mockResolvedValue(undefined),
      upsertEntry: vi.fn().mockResolvedValue(undefined),
      getStrategyForUrl: vi.fn().mockResolvedValue(null),
    }));

    // Spy on console.log and console.error for structured logging
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Reset storage
    ResourceStorageFactory.reset();
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('Tool Call Logging', () => {
    it('should log when a tool is called', async () => {
      registerTools(server, clientFactory, strategyConfigFactory);

      // Simulate calling a tool through the CallTool handler
      const handlers = (server as any)._requestHandlers;
      const callToolHandler = handlers.get('tools/call');

      expect(callToolHandler).toBeDefined();

      // Call the scrape tool (we expect it to fail due to missing URL, but logging should happen)
      try {
        await callToolHandler({
          method: 'tools/call',
          params: {
            name: 'scrape',
            arguments: { url: 'https://example.com' },
          },
        });
      } catch {
        // Expected to fail, we're testing logging not functionality
      }

      // Verify logging occurred
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[INFO]')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('scrape')
      );
    });

    it('should log tool call success with duration', async () => {
      registerTools(server, clientFactory, strategyConfigFactory);

      const handlers = (server as any)._requestHandlers;
      const callToolHandler = handlers.get('tools/call');

      // Mock successful tool execution
      // This will likely fail, but we want to verify the logging format
      try {
        await callToolHandler({
          method: 'tools/call',
          params: {
            name: 'scrape',
            arguments: { url: 'https://example.com' },
          },
        });
      } catch {
        // Expected
      }

      // Should log with timing information
      const logCalls = consoleLogSpy.mock.calls.map((call: any) => call[0]);
      const hasTimingLog = logCalls.some((log: string) =>
        log.includes('duration') || log.includes('ms')
      );

      expect(hasTimingLog).toBe(true);
    });

    it('should log tool call errors', async () => {
      registerTools(server, clientFactory, strategyConfigFactory);

      const handlers = (server as any)._requestHandlers;
      const callToolHandler = handlers.get('tools/call');

      // Call with non-existent tool to trigger error
      try {
        await callToolHandler({
          method: 'tools/call',
          params: {
            name: 'nonexistent-tool',
            arguments: {},
          },
        });
      } catch {
        // Expected - this will throw "Unknown tool: nonexistent-tool"
      }

      // Should log error to console.error
      const errorCalls = consoleErrorSpy.mock.calls.map((call: any) => call[0]);
      const hasErrorLog = errorCalls.some(
        (log: string) =>
          log.includes('[ERROR]') || log.includes('error') || log.includes('Unknown tool')
      );

      expect(hasErrorLog).toBe(true);
    });

    it('should include tool name in log messages', async () => {
      registerTools(server, clientFactory, strategyConfigFactory);

      const handlers = (server as any)._requestHandlers;
      const callToolHandler = handlers.get('tools/call');

      try {
        await callToolHandler({
          method: 'tools/call',
          params: {
            name: 'search',
            arguments: { query: 'test' },
          },
        });
      } catch {
        // Expected
      }

      // Should include tool name 'search' in logs
      const logCalls = consoleLogSpy.mock.calls.map((call: any) => call[0]);
      const hasToolName = logCalls.some((log: string) => log.includes('search'));

      expect(hasToolName).toBe(true);
    });
  });

  describe('Resource Access Logging', () => {
    it('should log when resources are listed', async () => {
      registerResources(server);

      const handlers = (server as any)._requestHandlers;
      const listResourcesHandler = handlers.get('resources/list');

      expect(listResourcesHandler).toBeDefined();

      await listResourcesHandler({
        method: 'resources/list',
        params: {},
      });

      // Verify logging occurred
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[INFO]')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('resources/list')
      );
    });

    it('should log resource count when listing resources', async () => {
      registerResources(server);

      const handlers = (server as any)._requestHandlers;
      const listResourcesHandler = handlers.get('resources/list');

      await listResourcesHandler({
        method: 'resources/list',
        params: {},
      });

      // Should log resource count
      const logCalls = consoleLogSpy.mock.calls.map((call: any) => call[0]);
      const hasCountLog = logCalls.some((log: string) =>
        log.includes('count') || /\d+ resources?/.test(log)
      );

      expect(hasCountLog).toBe(true);
    });

    it('should log when a resource is read', async () => {
      // Set up storage with a test resource
      const storage = await ResourceStorageFactory.create();
      await storage.writeMulti({
        url: 'https://example.com',
        raw: 'Test content',
        cleaned: 'Test content',
        metadata: {},
      });

      // Get the first resource
      const resources = await storage.list();
      expect(resources.length).toBeGreaterThan(0);
      const testUri = resources[0].uri;

      registerResources(server);

      const handlers = (server as any)._requestHandlers;
      const readResourceHandler = handlers.get('resources/read');

      expect(readResourceHandler).toBeDefined();

      await readResourceHandler({
        method: 'resources/read',
        params: { uri: testUri },
      });

      // Verify logging occurred
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[INFO]')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(testUri));
    });

    it('should log resource read errors', async () => {
      registerResources(server);

      const handlers = (server as any)._requestHandlers;
      const readResourceHandler = handlers.get('resources/read');

      // Try to read non-existent resource
      try {
        await readResourceHandler({
          method: 'resources/read',
          params: { uri: 'nonexistent://resource' },
        });
      } catch {
        // Expected
      }

      // Should log error to console.error
      const errorCalls = consoleErrorSpy.mock.calls.map((call: any) => call[0]);
      const hasErrorLog = errorCalls.some(
        (log: string) =>
          log.includes('[ERROR]') || log.includes('error') || log.includes('not found')
      );

      expect(hasErrorLog).toBe(true);
    });
  });
});
