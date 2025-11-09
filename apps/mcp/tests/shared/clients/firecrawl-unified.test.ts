/**
 * @fileoverview Tests for unified Firecrawl client
 *
 * Tests the consolidated Firecrawl client implementation that combines
 * all operations (scrape, search, map, crawl) in a single structure.
 *
 * Following TDD - these tests are written BEFORE implementation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FirecrawlConfig } from '../../../shared/types.js';
import type {
  FirecrawlScrapingOptions,
  FirecrawlScrapingResult,
  SearchOptions,
  SearchResult,
  MapOptions,
  MapResult,
  CrawlOptions,
  StartCrawlResult,
} from '@firecrawl/client';

describe('Unified Firecrawl Client', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Client Creation and Configuration', () => {
    it('should create client with API key and default base URL', async () => {
      const { FirecrawlClient } = await import('@firecrawl/client');

      const config: FirecrawlConfig = {
        apiKey: 'test-api-key',
      };

      const client = new FirecrawlClient(config);
      expect(client).toBeDefined();
    });

    it('should create client with custom base URL', async () => {
      const { FirecrawlClient } = await import('@firecrawl/client');

      const config: FirecrawlConfig = {
        apiKey: 'test-api-key',
        baseUrl: 'https://custom-api.firecrawl.dev',
      };

      const client = new FirecrawlClient(config);
      expect(client).toBeDefined();
    });

    it('should throw error if API key is empty', async () => {
      const { FirecrawlClient } = await import('@firecrawl/client');

      const config: FirecrawlConfig = {
        apiKey: '',
      };

      expect(() => new FirecrawlClient(config)).toThrow('API key is required');
    });

    it('should throw error if API key is missing', async () => {
      const { FirecrawlClient } = await import('@firecrawl/client');

      const config: FirecrawlConfig = {
        apiKey: undefined as any,
      };

      expect(() => new FirecrawlClient(config)).toThrow('API key is required');
    });
  });

  describe('Scrape Operation', () => {
    it('should scrape URL with default options', async () => {
      const { FirecrawlClient } = await import('@firecrawl/client');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            content: 'Test content',
            markdown: '# Test',
            html: '<h1>Test</h1>',
            metadata: { title: 'Test Page' },
          },
        }),
      });

      const client = new FirecrawlClient({ apiKey: 'test-key' });
      const result = await client.scrape('https://example.com');

      expect(result.success).toBe(true);
      expect(result.data?.content).toBe('Test content');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1/scrape'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-key',
          }),
        })
      );
    });

    it('should scrape with custom options', async () => {
      const { FirecrawlClient } = await import('@firecrawl/client');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            content: 'Test content',
            markdown: '# Test',
            html: '<h1>Test</h1>',
            metadata: {},
          },
        }),
      });

      const client = new FirecrawlClient({ apiKey: 'test-key' });
      const result = await client.scrape('https://example.com', {
        formats: ['markdown', 'html'],
        onlyMainContent: true,
        waitFor: 1000,
      });

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('onlyMainContent'),
        })
      );
    });

    it('should handle scrape errors', async () => {
      const { FirecrawlClient } = await import('@firecrawl/client');

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({ error: 'Invalid API key' }),
      });

      const client = new FirecrawlClient({ apiKey: 'invalid-key' });
      const result = await client.scrape('https://example.com');

      expect(result.success).toBe(false);
      expect(result.error).toContain('401');
    });
  });

  describe('Search Operation', () => {
    it('should search with query', async () => {
      const { FirecrawlClient } = await import('@firecrawl/client');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: [
            { url: 'https://example.com/1', title: 'Result 1' },
            { url: 'https://example.com/2', title: 'Result 2' },
          ],
          creditsUsed: 1,
        }),
      });

      const client = new FirecrawlClient({ apiKey: 'test-key' });
      const result = await client.search({ query: 'test query' });

      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v2/search'),
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('should search with advanced options', async () => {
      const { FirecrawlClient } = await import('@firecrawl/client');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: [],
          creditsUsed: 1,
        }),
      });

      const client = new FirecrawlClient({ apiKey: 'test-key' });
      const result = await client.search({
        query: 'test',
        limit: 10,
        sources: ['web', 'news'],
        country: 'US',
        lang: 'en',
      });

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('limit'),
        })
      );
    });

    it('should handle search errors', async () => {
      const { FirecrawlClient } = await import('@firecrawl/client');

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: async () => 'Invalid query',
      });

      const client = new FirecrawlClient({ apiKey: 'test-key' });

      await expect(client.search({ query: '' })).rejects.toThrow();
    });
  });

  describe('Map Operation', () => {
    it('should map website URLs', async () => {
      const { FirecrawlClient } = await import('@firecrawl/client');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          links: [
            { url: 'https://example.com/page1' },
            { url: 'https://example.com/page2' },
          ],
        }),
      });

      const client = new FirecrawlClient({ apiKey: 'test-key' });
      const result = await client.map({ url: 'https://example.com' });

      expect(result.success).toBe(true);
      expect(result.links).toHaveLength(2);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v2/map'),
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('should map with advanced options', async () => {
      const { FirecrawlClient } = await import('@firecrawl/client');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          links: [],
        }),
      });

      const client = new FirecrawlClient({ apiKey: 'test-key' });
      const result = await client.map({
        url: 'https://example.com',
        limit: 100,
        includeSubdomains: true,
        sitemap: 'include',
      });

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('includeSubdomains'),
        })
      );
    });

    it('should handle map errors with categorization', async () => {
      const { FirecrawlClient } = await import('@firecrawl/client');

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        text: async () => 'Rate limit exceeded',
      });

      const client = new FirecrawlClient({ apiKey: 'test-key' });

      await expect(client.map({ url: 'https://example.com' })).rejects.toThrow(/429/);
    });
  });

  describe('Crawl Operation', () => {
    it('should start crawl job', async () => {
      const { FirecrawlClient } = await import('@firecrawl/client');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          id: 'crawl-123',
          url: 'https://example.com',
        }),
      });

      const client = new FirecrawlClient({ apiKey: 'test-key' });
      const result = await client.startCrawl({ url: 'https://example.com' });

      expect(result.success).toBe(true);
      expect(result.id).toBe('crawl-123');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v2/crawl'),
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('should get crawl status', async () => {
      const { FirecrawlClient } = await import('@firecrawl/client');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'scraping',
          total: 10,
          completed: 5,
          creditsUsed: 5,
          expiresAt: '2025-11-08T00:00:00Z',
          data: [],
        }),
      });

      const client = new FirecrawlClient({ apiKey: 'test-key' });
      const result = await client.getCrawlStatus('crawl-123');

      expect(result.status).toBe('scraping');
      expect(result.completed).toBe(5);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v2/crawl/crawl-123'),
        expect.objectContaining({
          method: 'GET',
        })
      );
    });

    it('should cancel crawl job', async () => {
      const { FirecrawlClient } = await import('@firecrawl/client');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'cancelled',
        }),
      });

      const client = new FirecrawlClient({ apiKey: 'test-key' });
      const result = await client.cancelCrawl('crawl-123');

      expect(result.status).toBe('cancelled');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v2/crawl/crawl-123'),
        expect.objectContaining({
          method: 'DELETE',
        })
      );
    });

    it('should start crawl with advanced options', async () => {
      const { FirecrawlClient } = await import('@firecrawl/client');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          id: 'crawl-456',
          url: 'https://example.com',
        }),
      });

      const client = new FirecrawlClient({ apiKey: 'test-key' });
      const result = await client.startCrawl({
        url: 'https://example.com',
        maxDiscoveryDepth: 3,
        limit: 100,
        includePaths: ['/blog/*'],
        excludePaths: ['/admin/*'],
      });

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('maxDiscoveryDepth'),
        })
      );
    });
  });

  describe('Error Handling and Categorization', () => {
    it('should categorize authentication errors', async () => {
      const { categorizeFirecrawlError } = await import(
        '@firecrawl/client'
      );

      const error = categorizeFirecrawlError(401, '{"error": "Invalid API key"}');

      expect(error.code).toBe(401);
      expect(error.category).toBe('auth');
      expect(error.retryable).toBe(false);
      expect(error.userMessage).toContain('Authentication failed');
    });

    it('should categorize rate limit errors', async () => {
      const { categorizeFirecrawlError } = await import(
        '@firecrawl/client'
      );

      const error = categorizeFirecrawlError(429, 'Rate limit exceeded');

      expect(error.code).toBe(429);
      expect(error.category).toBe('rate_limit');
      expect(error.retryable).toBe(true);
      expect(error.retryAfterMs).toBe(60000);
    });

    it('should categorize payment errors', async () => {
      const { categorizeFirecrawlError } = await import(
        '@firecrawl/client'
      );

      const error = categorizeFirecrawlError(402, 'Credits exhausted');

      expect(error.code).toBe(402);
      expect(error.category).toBe('payment');
      expect(error.retryable).toBe(false);
    });

    it('should categorize server errors', async () => {
      const { categorizeFirecrawlError } = await import(
        '@firecrawl/client'
      );

      const error = categorizeFirecrawlError(503, 'Service unavailable');

      expect(error.code).toBe(503);
      expect(error.category).toBe('server');
      expect(error.retryable).toBe(true);
      expect(error.retryAfterMs).toBe(5000);
    });
  });

  describe('Type Exports', () => {
    it('should export all operation option types', async () => {
      const module = await import('@firecrawl/client');

      // Type imports at top of file verify these types are exported and compile-time valid
      // This test verifies the runtime exports (client class and functions)
      expect(module.FirecrawlClient).toBeDefined();
    });

    it('should export all result types', async () => {
      const module = await import('@firecrawl/client');

      // Type imports at top of file verify these types are exported and compile-time valid
      // This test verifies the runtime exports (client class and functions)
      expect(module.FirecrawlClient).toBeDefined();
    });

    it('should export error types and functions', async () => {
      const module = await import('@firecrawl/client');

      // Verify error categorization function is exported
      expect(module.categorizeFirecrawlError).toBeDefined();
      expect(typeof module.categorizeFirecrawlError).toBe('function');
    });
  });
});
