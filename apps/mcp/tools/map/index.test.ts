import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMapTool } from './index.js';
import type { FirecrawlConfig, ToolResponse } from '../../types.js';

describe('Map Tool', () => {
  let config: FirecrawlConfig;

  beforeEach(() => {
    config = {
      apiKey: 'fc-test-key',
      baseUrl: 'https://api.firecrawl.dev/v2',
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        links: Array.from({ length: 3000 }, (_, i) => ({
          url: `https://example.com/page-${i + 1}`,
          title: `Page ${i + 1}`,
        })),
      }),
    });
  });

  it('should create map tool with proper structure', () => {
    const tool = createMapTool(config);

    expect(tool.name).toBe('map');
    expect(tool.description).toContain('Discover URLs');
    expect(tool.inputSchema).toBeDefined();
    expect(tool.handler).toBeInstanceOf(Function);
  });

  it('should handle pagination parameters', async () => {
    const tool = createMapTool(config);
    const handler = tool.handler as (args: unknown) => Promise<ToolResponse>;
    const result = await handler({
      url: 'https://example.com',
      startIndex: 1000,
      maxResults: 500,
    });

    expect(result.isError).toBe(false);
    const text = (result.content[0] as any).text;
    expect(text).toContain('Showing: 1001-1500 of 3000');
  });

  it('should handle resultHandling parameter', async () => {
    const tool = createMapTool(config);
    const handler = tool.handler as (args: unknown) => Promise<ToolResponse>;
    const result = await handler({
      url: 'https://example.com',
      resultHandling: 'saveOnly',
    });

    expect(result.isError).toBe(false);
    expect(result.content[1].type).toBe('resource_link');
  });

  it('should use default pagination values', async () => {
    const tool = createMapTool(config);
    const handler = tool.handler as (args: unknown) => Promise<ToolResponse>;
    const result = await handler({
      url: 'https://example.com',
    });

    expect(result.isError).toBe(false);
    const text = (result.content[0] as any).text;
    expect(text).toContain('Showing: 1-200 of 3000');
  });

  it('should handle errors gracefully', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 402,
      text: async () => 'Payment required',
    });

    const tool = createMapTool(config);
    const handler = tool.handler as (args: unknown) => Promise<ToolResponse>;
    const result = await handler({
      url: 'https://example.com',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Map error');
  });
});
