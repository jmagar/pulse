import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { existsSync } from 'fs';

interface MockConfig {
  nativeSuccess?: boolean;
  nativeData?: string;
  nativeStatus?: number;
  enableFirecrawl?: boolean;
  firecrawlSuccess?: boolean;
  firecrawlData?: string;
}

interface TestMode {
  name: string;
  serverPath: string;
  setup?: () => Promise<void>;
}

/**
 * Helper function to create a Client with mocked scraping clients.
 */
async function createTestMCPClientWithMocks(
  serverPath: string,
  config: MockConfig
): Promise<Client> {
  const env: Record<string, string> = {};

  // Native fetcher mocks
  if (config.nativeSuccess !== undefined) {
    env.MOCK_NATIVE_SUCCESS = config.nativeSuccess.toString();
  }
  if (config.nativeData) {
    env.MOCK_NATIVE_DATA = config.nativeData;
  }
  if (config.nativeStatus) {
    env.MOCK_NATIVE_STATUS = config.nativeStatus.toString();
  }

  // Firecrawl mocks
  if (config.enableFirecrawl) {
    env.ENABLE_FIRECRAWL_MOCK = 'true';
    if (config.firecrawlSuccess !== undefined) {
      env.MOCK_FIRECRAWL_SUCCESS = config.firecrawlSuccess.toString();
    }
    if (config.firecrawlData) {
      env.MOCK_FIRECRAWL_DATA = config.firecrawlData;
    }
  }

  // Filter out undefined values from process.env
  const processEnv: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      processEnv[key] = value;
    }
  }

  const transport = new StdioClientTransport({
    command: 'node',
    args: [serverPath],
    env: { ...processEnv, ...env },
  });

  const client = new Client(
    {
      name: 'test-client',
      version: '1.0.0',
    },
    {
      capabilities: {},
    }
  );

  await client.connect(transport);
  return client;
}

/**
 * Run integration tests in a specific mode (source or built)
 */
export function runIntegrationTests(mode: TestMode) {
  describe(`Pulse Fetch MCP Server Integration Tests [${mode.name}]`, () => {
    let client: Client | null = null;

    beforeAll(async () => {
      if (mode.setup) {
        await mode.setup();
      }

      // Verify the server file exists
      if (!existsSync(mode.serverPath)) {
        throw new Error(
          `Server file not found at ${mode.serverPath}. Make sure to build the project first.`
        );
      }
    }, 30000); // 30 second timeout for setup

    afterEach(async () => {
      if (client) {
        await client.close();
        client = null;
      }
    });

    describe('Tools', () => {
      it('should execute scrape tool with native success', async () => {
        client = await createTestMCPClientWithMocks(mode.serverPath, {
          nativeSuccess: true,
          nativeData: 'Native scrape success!',
        });

        const result = await client.callTool({
          name: 'scrape',
          arguments: {
            url: 'https://example.com',
            resultHandling: 'returnOnly',
          },
        });

        expect(result).toMatchObject({
          content: [
            {
              type: 'text',
              text: expect.stringContaining('Native scrape success!'),
            },
          ],
        });

        // Type guard for content array
        if (!Array.isArray(result.content)) {
          throw new Error('Expected result.content to be an array');
        }
        const firstContent = result.content[0];
        if (!firstContent || typeof firstContent !== 'object' || !('text' in firstContent)) {
          throw new Error('Expected first content item to have text property');
        }
        expect(firstContent.text).toContain('Scraped using: native');
      });

      it('should fallback to Firecrawl when native fails', async () => {
        client = await createTestMCPClientWithMocks(mode.serverPath, {
          nativeSuccess: false,
          enableFirecrawl: true,
          firecrawlSuccess: true,
          firecrawlData: 'Firecrawl fallback success!',
        });

        const result = await client.callTool({
          name: 'scrape',
          arguments: {
            url: 'https://example.com',
            resultHandling: 'returnOnly',
          },
        });

        expect(result).toMatchObject({
          content: [
            {
              type: 'text',
              text: expect.stringContaining('Firecrawl fallback success!'),
            },
          ],
        });

        // Type guard for content array
        if (!Array.isArray(result.content)) {
          throw new Error('Expected result.content to be an array');
        }
        const firstContent = result.content[0];
        if (!firstContent || typeof firstContent !== 'object' || !('text' in firstContent)) {
          throw new Error('Expected first content item to have text property');
        }
        expect(firstContent.text).toContain('Scraped using: firecrawl');
      });

      it('should handle complete failure gracefully', async () => {
        client = await createTestMCPClientWithMocks(mode.serverPath, {
          nativeSuccess: false,
          enableFirecrawl: true,
          firecrawlSuccess: false,
        });

        const result = await client.callTool({
          name: 'scrape',
          arguments: {
            url: 'https://example.com',
            resultHandling: 'returnOnly',
          },
        });

        expect(result).toMatchObject({
          content: [
            {
              type: 'text',
              text: expect.stringContaining('Failed to scrape'),
            },
          ],
          isError: true,
        });
      });

      it('should validate required url parameter', async () => {
        client = await createTestMCPClientWithMocks(mode.serverPath, {});

        const result = await client.callTool({
          name: 'scrape',
          arguments: {
            // Missing url parameter
            resultHandling: 'returnOnly',
          },
        });

        // Tool should return error response, not throw
        expect(result).toMatchObject({
          content: [
            {
              type: 'text',
              text: expect.stringContaining('Required'),
            },
          ],
          isError: true,
        });
      });

      it('should handle maxChars parameter', async () => {
        const longContent = 'A'.repeat(1000);

        client = await createTestMCPClientWithMocks(mode.serverPath, {
          nativeSuccess: true,
          nativeData: longContent,
        });

        const result = await client.callTool({
          name: 'scrape',
          arguments: {
            url: 'https://example.com',
            maxChars: 100,
            resultHandling: 'returnOnly',
          },
        });

        // Type guard for content array
        if (!Array.isArray(result.content)) {
          throw new Error('Expected result.content to be an array');
        }
        const firstContent = result.content[0];
        if (!firstContent || typeof firstContent !== 'object' || !('text' in firstContent)) {
          throw new Error('Expected first content item to have text property');
        }
        expect(firstContent.text).toContain('[Content truncated at 100 characters');
      });
    });
  });
}
