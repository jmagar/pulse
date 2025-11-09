import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { scrapeTool } from '../../shared/mcp/tools/scrape/index.js';
import {
  createMockScrapingClients,
  type MockNativeFetcher,
  type MockFirecrawlClient,
} from '../mocks/scraping-clients.functional-mock.js';
import type { IScrapingClients } from '../../shared/server.js';
import type { IStrategyConfigClient } from '../../shared/scraping/strategies/learned/index.js';
import { ResourceStorageFactory } from '../../shared/storage/index.js';

describe('Scrape Tool - Screenshot Support', () => {
  let mockServer: Server;
  let mockClients: IScrapingClients;
  let mockNative: MockNativeFetcher;
  let mockFirecrawl: MockFirecrawlClient;
  let mockStrategyConfigClient: IStrategyConfigClient;

  beforeEach(() => {
    // Reset storage factory to ensure test isolation
    ResourceStorageFactory.reset();

    // Create a minimal mock server
    mockServer = {} as Server;

    // Create mock clients
    const { clients, mocks } = createMockScrapingClients();
    mockClients = clients;
    mockNative = mocks.native;
    mockFirecrawl = mocks.firecrawl;
    mockFirecrawl.resetCrawlCalls();

    // Create mock strategy config client
    mockStrategyConfigClient = {
      loadConfig: vi.fn().mockResolvedValue([]),
      saveConfig: vi.fn().mockResolvedValue(undefined),
      upsertEntry: vi.fn().mockResolvedValue(undefined),
      getStrategyForUrl: vi.fn().mockResolvedValue(null),
    };
  });

  describe('when screenshot format is requested', () => {
    it('should return screenshot as base64 data URI in image content type', async () => {
      // Mock Firecrawl to return screenshot data
      const mockScreenshotBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

      mockFirecrawl.setMockResponse({
        success: true,
        data: {
          content: 'Page content',
          markdown: '# Page Title\n\nContent',
          html: '<h1>Page Title</h1><p>Content</p>',
          screenshot: mockScreenshotBase64,
          metadata: {
            title: 'Test Page',
            screenshotMetadata: {
              width: 1920,
              height: 1080,
              format: 'png',
              size: 12345,
            },
          },
        },
      });

      const tool = scrapeTool(
        mockServer,
        () => mockClients,
        () => mockStrategyConfigClient
      );

      const result = await tool.handler({
        url: 'https://example.com',
        formats: ['markdown', 'screenshot'],
        resultHandling: 'returnOnly',
      });

      expect(result.content).toHaveLength(2);

      // Check for text content
      const textContent = result.content.find(c => c.type === 'text');
      expect(textContent).toBeDefined();
      expect(textContent?.text).toContain('Page Title');

      // Check for image content
      const imageContent = result.content.find(c => c.type === 'image');
      expect(imageContent).toBeDefined();
      expect(imageContent).toMatchObject({
        type: 'image',
        data: mockScreenshotBase64,
        mimeType: 'image/png',
      });
    });

    it('should include screenshot metadata when available', async () => {
      const mockScreenshotBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

      mockFirecrawl.setMockResponse({
        success: true,
        data: {
          content: 'Page content',
          markdown: '# Page Title',
          html: '<h1>Page Title</h1>',
          screenshot: mockScreenshotBase64,
          metadata: {
            screenshotMetadata: {
              width: 1920,
              height: 1080,
              format: 'png',
              size: 54321,
            },
          },
        },
      });

      const tool = scrapeTool(
        mockServer,
        () => mockClients,
        () => mockStrategyConfigClient
      );

      const result = await tool.handler({
        url: 'https://example.com',
        formats: ['screenshot'],
        resultHandling: 'returnOnly',
      });

      const imageContent = result.content.find(c => c.type === 'image');
      expect(imageContent).toBeDefined();

      // MCP image content doesn't have a standard metadata field,
      // but we can verify the data is correctly formatted
      expect(imageContent?.data).toBe(mockScreenshotBase64);
      expect(imageContent?.mimeType).toBe('image/png');
    });

    it('should handle JPEG screenshots', async () => {
      const mockScreenshotBase64 = '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/AKp/2Q==';

      mockFirecrawl.setMockResponse({
        success: true,
        data: {
          content: 'Page content',
          markdown: 'Content',
          html: '<p>Content</p>',
          screenshot: mockScreenshotBase64,
          metadata: {
            screenshotMetadata: {
              format: 'jpeg',
            },
          },
        },
      });

      const tool = scrapeTool(
        mockServer,
        () => mockClients,
        () => mockStrategyConfigClient
      );

      const result = await tool.handler({
        url: 'https://example.com',
        formats: ['screenshot'],
        resultHandling: 'returnOnly',
      });

      const imageContent = result.content.find(c => c.type === 'image');
      expect(imageContent).toBeDefined();
      expect(imageContent?.mimeType).toBe('image/jpeg');
    });

    it('should handle screenshot with saveAndReturn mode', async () => {
      const mockScreenshotBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

      mockFirecrawl.setMockResponse({
        success: true,
        data: {
          content: 'Page content',
          markdown: '# Test',
          html: '<h1>Test</h1>',
          screenshot: mockScreenshotBase64,
          metadata: {},
        },
      });

      const tool = scrapeTool(
        mockServer,
        () => mockClients,
        () => mockStrategyConfigClient
      );

      const result = await tool.handler({
        url: 'https://example.com',
        formats: ['markdown', 'screenshot'],
        resultHandling: 'saveAndReturn',
      });

      // Should have both resource (for text content) and image
      expect(result.content.length).toBeGreaterThan(0);

      const imageContent = result.content.find(c => c.type === 'image');
      expect(imageContent).toBeDefined();
      expect(imageContent?.data).toBe(mockScreenshotBase64);
    });

    it('should handle screenshot URLs instead of base64 data', async () => {
      const mockScreenshotUrl = 'https://storage.firecrawl.dev/screenshots/abc123.png';

      mockFirecrawl.setMockResponse({
        success: true,
        data: {
          content: 'Page content',
          markdown: 'Content',
          html: '<p>Content</p>',
          screenshot: mockScreenshotUrl,
          metadata: {},
        },
      });

      const tool = scrapeTool(
        mockServer,
        () => mockClients,
        () => mockStrategyConfigClient
      );

      const result = await tool.handler({
        url: 'https://example.com',
        formats: ['screenshot'],
        resultHandling: 'returnOnly',
      });

      const imageContent = result.content.find(c => c.type === 'image');
      expect(imageContent).toBeDefined();
      // When it's a URL, it should be in the data field as a URL
      expect(imageContent?.data).toBe(mockScreenshotUrl);
    });

    it('should handle missing screenshot gracefully', async () => {
      mockFirecrawl.setMockResponse({
        success: true,
        data: {
          content: 'Page content',
          markdown: '# Test',
          html: '<h1>Test</h1>',
          // No screenshot field
          metadata: {},
        },
      });

      const tool = scrapeTool(
        mockServer,
        () => mockClients,
        () => mockStrategyConfigClient
      );

      const result = await tool.handler({
        url: 'https://example.com',
        formats: ['markdown', 'screenshot'],
        resultHandling: 'returnOnly',
      });

      // Should still have text content
      const textContent = result.content.find(c => c.type === 'text');
      expect(textContent).toBeDefined();

      // Should not have image content when screenshot is missing
      const imageContent = result.content.find(c => c.type === 'image');
      expect(imageContent).toBeUndefined();
    });

    it('should work with multiple formats including screenshot', async () => {
      const mockScreenshotBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

      mockFirecrawl.setMockResponse({
        success: true,
        data: {
          content: 'Page content',
          markdown: '# Title\n\nContent',
          html: '<h1>Title</h1><p>Content</p>',
          screenshot: mockScreenshotBase64,
          links: ['https://example.com/link1', 'https://example.com/link2'],
          metadata: {
            screenshotMetadata: {
              width: 1920,
              height: 1080,
              format: 'png',
            },
          },
        },
      });

      const tool = scrapeTool(
        mockServer,
        () => mockClients,
        () => mockStrategyConfigClient
      );

      const result = await tool.handler({
        url: 'https://example.com',
        formats: ['markdown', 'html', 'links', 'screenshot'],
        resultHandling: 'returnOnly',
      });

      // Should have text content
      const textContent = result.content.find(c => c.type === 'text');
      expect(textContent).toBeDefined();
      expect(textContent?.text).toContain('Title');

      // Should have image content
      const imageContent = result.content.find(c => c.type === 'image');
      expect(imageContent).toBeDefined();
      expect(imageContent?.data).toBe(mockScreenshotBase64);
    });

    it('should cache screenshot along with text content', async () => {
      const mockScreenshotBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

      mockFirecrawl.setMockResponse({
        success: true,
        data: {
          content: 'Page content',
          markdown: '# Test',
          html: '<h1>Test</h1>',
          screenshot: mockScreenshotBase64,
          metadata: {},
        },
      });

      const tool = scrapeTool(
        mockServer,
        () => mockClients,
        () => mockStrategyConfigClient
      );

      // First call - should scrape and cache
      const result1 = await tool.handler({
        url: 'https://example.com/screenshot-test',
        formats: ['markdown', 'screenshot'],
        resultHandling: 'saveAndReturn',
      });

      expect(result1.content.find(c => c.type === 'image')).toBeDefined();

      // Second call - should return from cache
      const result2 = await tool.handler({
        url: 'https://example.com/screenshot-test',
        formats: ['markdown', 'screenshot'],
        resultHandling: 'saveAndReturn',
      });

      // Both should have the screenshot
      expect(result2.content.find(c => c.type === 'image')).toBeDefined();
      expect(result2.content.find(c => c.type === 'image')?.data).toBe(mockScreenshotBase64);
    });
  });

  describe('screenshot format validation', () => {
    it('should accept screenshot in formats array', async () => {
      mockFirecrawl.setMockResponse({
        success: true,
        data: {
          content: 'Content',
          markdown: 'Content',
          html: '<p>Content</p>',
          screenshot: 'base64data',
          metadata: {},
        },
      });

      const tool = scrapeTool(
        mockServer,
        () => mockClients,
        () => mockStrategyConfigClient
      );

      // Should not throw
      await expect(
        tool.handler({
          url: 'https://example.com',
          formats: ['screenshot'],
          resultHandling: 'returnOnly',
        })
      ).resolves.toBeDefined();
    });

    it('should work with default formats that do not include screenshot', async () => {
      mockNative.setMockResponse({
        success: true,
        status: 200,
        data: 'Content',
      });

      const tool = scrapeTool(
        mockServer,
        () => mockClients,
        () => mockStrategyConfigClient
      );

      const result = await tool.handler({
        url: 'https://example.com',
        // No formats specified - should use default ['markdown', 'html']
        resultHandling: 'returnOnly',
      });

      // Should not have image content with default formats
      const imageContent = result.content.find(c => c.type === 'image');
      expect(imageContent).toBeUndefined();
    });
  });

  describe('screenshot error handling', () => {
    it('should handle Firecrawl error when screenshot is requested', async () => {
      mockFirecrawl.setMockResponse({
        success: false,
        error: 'Screenshot capture failed',
      });

      // Native should also fail to test full error path
      mockNative.setMockResponse({
        success: false,
        status: 500,
        data: '',
      });

      const tool = scrapeTool(
        mockServer,
        () => mockClients,
        () => mockStrategyConfigClient
      );

      const result = await tool.handler({
        url: 'https://example.com',
        formats: ['screenshot'],
        resultHandling: 'returnOnly',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Failed to scrape');
    });
  });
});
