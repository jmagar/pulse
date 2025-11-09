import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to start server and collect output
async function startServerAndWaitForReady(
  port: number,
  envOverrides: Record<string, string> = {}
): Promise<{ process: ChildProcess; output: string }> {
  const serverOutput: string[] = [];

  const serverProcess = spawn('node', ['./dist/remote/index.js'], {
    cwd: path.resolve(__dirname),
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'test',
      SKIP_HEALTH_CHECKS: 'true',
      ...envOverrides,
    },
  });

  // Collect output
  serverProcess.stdout?.on('data', (data) => {
    serverOutput.push(data.toString());
  });

  serverProcess.stderr?.on('data', (data) => {
    serverOutput.push(data.toString());
  });

  // Wait for server to start
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Server startup timeout'));
    }, 10000);

    const checkOutput = setInterval(() => {
      const combined = serverOutput.join('');
      if (combined.includes('Server ready to accept connections')) {
        clearInterval(checkOutput);
        clearTimeout(timeout);
        resolve();
      }
    }, 100);
  });

  return {
    process: serverProcess,
    output: serverOutput.join(''),
  };
}

describe('Server Startup Integration', () => {
  let serverProcess: ChildProcess | null = null;
  let serverOutput = '';

  beforeEach(() => {
    serverOutput = '';
  });

  afterEach(async () => {
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
      // Wait a bit for process to terminate
      await new Promise((resolve) => setTimeout(resolve, 500));
      serverProcess = null;
    }
  });

  it('should display enhanced logging on startup', async () => {
    const result = await startServerAndWaitForReady(3065, {
      FIRECRAWL_API_KEY: 'self-hosted-no-auth',
      FIRECRAWL_BASE_URL: 'https://firecrawl.local',
      LLM_PROVIDER: 'anthropic',
      LLM_API_KEY: 'sk-ant-test',
      ALLOWED_ORIGINS: '*',
      ENABLE_OAUTH: 'false',
      ENABLE_RESUMABILITY: 'true',
    });

    serverProcess = result.process;
    serverOutput = result.output;

    // Check for banner
    expect(serverOutput).toContain('Pulse Fetch MCP Server');

    // Check for all sections
    expect(serverOutput).toContain('Server Endpoints');
    expect(serverOutput).toContain('Security Configuration');
    expect(serverOutput).toContain('Service Status');
    expect(serverOutput).toContain('Environment Configuration');
    expect(serverOutput).toContain('MCP Registration Status');

    // Check for ready message
    expect(serverOutput).toContain('Server ready to accept connections');

    // Check for specific endpoint info
    expect(serverOutput).toContain('http://localhost:3065/mcp');
    expect(serverOutput).toContain('http://localhost:3065/health');

    // Check for security config details
    expect(serverOutput).toContain('CORS Origins');
    expect(serverOutput).toContain('OAuth');
    expect(serverOutput).toContain('Resumability');

    // Check that sensitive values are masked
    if (serverOutput.includes('API Key')) {
      expect(serverOutput).toMatch(/\*+/); // Should contain asterisks for masking
    }
  }, 15000); // 15 second timeout for the entire test

  it('should display service statuses correctly', async () => {
    const result = await startServerAndWaitForReady(3066, {
      FIRECRAWL_API_KEY: 'self-hosted-no-auth',
      FIRECRAWL_BASE_URL: 'https://firecrawl.local',
    });

    serverProcess = result.process;
    serverOutput = result.output;

    // Check for Firecrawl service status
    expect(serverOutput).toContain('Firecrawl');
    expect(serverOutput).toContain('Ready');
  }, 15000);
});
