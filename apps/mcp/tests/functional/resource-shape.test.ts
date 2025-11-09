import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { scrapeTool } from '../../shared/mcp/tools/scrape/index.js';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { IScrapingClients, StrategyConfigFactory } from '../../shared/server.js';
import { ResourceStorageFactory } from '../../shared/storage/index.js';
import { createMockScrapingClients } from '../mocks/scraping-clients.functional-mock.js';

// Mock dependencies
vi.mock('../../shared/scraping-strategies.js', () => ({
  scrapeWithStrategy: vi.fn().mockResolvedValue({
    success: true,
    content: '<h1>Test Content</h1><p>This is test content.</p>',
    source: 'native',
  }),
}));

vi.mock('../../shared/storage/index.js', () => ({
  ResourceStorageFactory: {
    create: vi.fn().mockResolvedValue({
      findByUrlAndExtract: vi.fn().mockResolvedValue([]),
      writeMulti: vi.fn().mockResolvedValue({
        raw: 'scraped://test.com/page_2024-01-01T00:00:00Z',
        cleaned: 'scraped://test.com/page_2024-01-01T00:00:00Z/cleaned',
        extracted: null,
      }),
    }),
    reset: vi.fn(),
  },
}));

vi.mock('../../shared/extract/index.js', () => ({
  ExtractClientFactory: {
    isAvailable: vi.fn().mockReturnValue(false),
    createFromEnv: vi.fn().mockReturnValue(null),
  },
}));

vi.mock('../../shared/clean/index.js', () => ({
  createCleaner: vi.fn().mockReturnValue({
    clean: vi.fn().mockResolvedValue('# Test Content\n\nThis is test content.'),
  }),
}));

describe('Resource Shape Validation', () => {
  let mockServer: Server;
  let mockClientsFactory: () => IScrapingClients;
  let mockStrategyConfigFactory: StrategyConfigFactory;
  let mockClients: ReturnType<typeof createMockScrapingClients>;

  beforeEach(() => {
    vi.clearAllMocks();
    ResourceStorageFactory.reset();

    mockServer = {} as Server;

    // Use proper mock client factory from helper and keep reference to mocks
    mockClients = createMockScrapingClients();
    mockClientsFactory = () => mockClients.clients;

    // Provide complete strategy config mock with all required methods
    mockStrategyConfigFactory = () => ({
      loadConfig: vi.fn().mockResolvedValue([]),
      saveConfig: vi.fn().mockResolvedValue(undefined),
      upsertEntry: vi.fn().mockResolvedValue(undefined),
      getStrategyForUrl: vi.fn().mockResolvedValue(null),
    });
  });

  it('should return properly formatted embedded resource for saveAndReturn mode', async () => {
    // Configure mock to return expected content
    mockClients.mocks.native.setMockResponse({
      success: true,
      status: 200,
      data: '<h1>Test Content</h1><p>This is test content.</p>',
    });

    const tool = scrapeTool(mockServer, mockClientsFactory, mockStrategyConfigFactory);

    const result = await tool.handler({
      url: 'https://test.com/page',
      resultHandling: 'saveAndReturn',
    });

    // Validate against MCP SDK schema
    const validation = CallToolResultSchema.safeParse(result);

    if (!validation.success) {
      console.error('Validation error:', JSON.stringify(validation.error, null, 2));
    }

    expect(validation.success).toBe(true);

    // Check the specific structure
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('resource');

    // The resource should be wrapped in a resource property
    expect(result.content[0]).toHaveProperty('resource');
    expect(result.content[0].resource).toMatchObject({
      uri: expect.stringContaining('scraped://'),
      name: 'https://test.com/page',
      mimeType: 'text/markdown',
      description: expect.stringContaining('Scraped content from'),
      text: expect.stringContaining('Test Content'),
    });
  });

  it('should return properly formatted resource_link for saveOnly mode', async () => {
    const tool = scrapeTool(mockServer, mockClientsFactory, mockStrategyConfigFactory);

    const result = await tool.handler({
      url: 'https://test.com/page',
      resultHandling: 'saveOnly',
    });

    // Validate against MCP SDK schema
    const validation = CallToolResultSchema.safeParse(result);
    expect(validation.success).toBe(true);

    // Check the specific structure
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('resource_link');
    expect(result.content[0]).not.toHaveProperty('resource');
    expect(result.content[0]).toMatchObject({
      type: 'resource_link',
      uri: expect.stringContaining('scraped://'),
      name: 'https://test.com/page',
      mimeType: 'text/markdown',
      description: expect.stringContaining('Scraped content from'),
    });
  });

  it('should return properly formatted text for returnOnly mode', async () => {
    // Configure mock to return expected content
    mockClients.mocks.native.setMockResponse({
      success: true,
      status: 200,
      data: '<h1>Test Content</h1><p>This is test content.</p>',
    });

    const tool = scrapeTool(mockServer, mockClientsFactory, mockStrategyConfigFactory);

    const result = await tool.handler({
      url: 'https://test.com/page',
      resultHandling: 'returnOnly',
    });

    // Validate against MCP SDK schema
    const validation = CallToolResultSchema.safeParse(result);
    expect(validation.success).toBe(true);

    // Check the specific structure
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    expect(result.content[0]).toMatchObject({
      type: 'text',
      text: expect.stringContaining('Test Content'),
    });
    expect(result.content[0]).not.toHaveProperty('resource');
  });
});
