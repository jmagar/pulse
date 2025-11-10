import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { displayStartupInfo, ServerConfig } from './display.js';

describe('Startup Display', () => {
  let consoleLogSpy: any;
  let consoleClearSpy: any;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleClearSpy = vi.spyOn(console, 'clear').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    consoleLogSpy.mockRestore();
    consoleClearSpy.mockRestore();
  });

  describe('displayStartupInfo()', () => {
    const mockConfig: ServerConfig = {
      port: Number(process.env.MCP_PORT || '50107'),
      serverUrl: `http://localhost:${process.env.MCP_PORT || '50107'}`,
      mcpEndpoint: `http://localhost:${process.env.MCP_PORT || '50107'}/mcp`,
      healthEndpoint: `http://localhost:${process.env.MCP_PORT || '50107'}/health`,
      allowedOrigins: ['*'],
      allowedHosts: [`localhost:${process.env.MCP_PORT || '50107'}`],
      oauthEnabled: false,
      resumabilityEnabled: true,
    };

    it('should display banner with server name', async () => {
      // RED: This will fail because displayStartupInfo() doesn't exist
      await displayStartupInfo(mockConfig);

      const output = consoleLogSpy.mock.calls.map((call: any) => call[0]).join('\n');

      expect(output).toContain('Pulse Fetch MCP Server');
    });

    it('should display server endpoints', async () => {
      await displayStartupInfo(mockConfig);

      const output = consoleLogSpy.mock.calls.map((call: any) => call[0]).join('\n');

      expect(output).toContain('Server Endpoints');
      expect(output).toContain(`http://localhost:${process.env.MCP_PORT || '50107'}/mcp`);
      expect(output).toContain(`http://localhost:${process.env.MCP_PORT || '50107'}/health`);
    });

    it('should display security configuration', async () => {
      await displayStartupInfo(mockConfig);

      const output = consoleLogSpy.mock.calls.map((call: any) => call[0]).join('\n');

      expect(output).toContain('Security Configuration');
      expect(output).toContain('CORS Origins');
      expect(output).toContain('OAuth');
      expect(output).toContain('Resumability');
    });

    it('should display service statuses', async () => {
      process.env.FIRECRAWL_API_KEY = 'self-hosted-no-auth';

      await displayStartupInfo(mockConfig);

      const output = consoleLogSpy.mock.calls.map((call: any) => call[0]).join('\n');

      expect(output).toContain('Service Status');
      expect(output).toContain('Firecrawl');
    });

    it('should display environment variables', async () => {
      await displayStartupInfo(mockConfig);

      const output = consoleLogSpy.mock.calls.map((call: any) => call[0]).join('\n');

      expect(output).toContain('Environment Configuration');
    });

    it('should display ready message at end', async () => {
      await displayStartupInfo(mockConfig);

      const output = consoleLogSpy.mock.calls.map((call: any) => call[0]).join('\n');

      expect(output).toContain('Server ready to accept connections');
    });

    it('should clear screen if TTY', async () => {
      // Mock TTY
      Object.defineProperty(process.stdout, 'isTTY', {
        value: true,
        configurable: true,
      });

      await displayStartupInfo(mockConfig);

      expect(consoleClearSpy).toHaveBeenCalled();
    });

    it('should not clear screen if not TTY', async () => {
      // Mock non-TTY
      Object.defineProperty(process.stdout, 'isTTY', {
        value: false,
        configurable: true,
      });

      await displayStartupInfo(mockConfig);

      expect(consoleClearSpy).not.toHaveBeenCalled();
    });

    it('should handle dynamic port configuration from environment', async () => {
      // Set MCP_PORT environment variable
      process.env.MCP_PORT = '50107';

      const dynamicConfig: ServerConfig = {
        port: Number(process.env.MCP_PORT || '50107'),
        serverUrl: `http://localhost:${process.env.MCP_PORT || '50107'}`,
        mcpEndpoint: `http://localhost:${process.env.MCP_PORT || '50107'}/mcp`,
        healthEndpoint: `http://localhost:${process.env.MCP_PORT || '50107'}/health`,
        allowedOrigins: ['*'],
        allowedHosts: [`localhost:${process.env.MCP_PORT || '50107'}`],
        oauthEnabled: false,
        resumabilityEnabled: true,
      };

      await displayStartupInfo(dynamicConfig);

      const output = consoleLogSpy.mock.calls.map((call: any) => call[0]).join('\n');

      // Verify the dynamic port is used in the output
      expect(output).toContain('http://localhost:50107/mcp');
      expect(output).toContain('http://localhost:50107/health');
    });
  });
});
