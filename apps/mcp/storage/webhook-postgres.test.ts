import { describe, it, expect, beforeEach } from "vitest";
import { WebhookPostgresStorage } from './webhook-postgres.js';

describe('WebhookPostgresStorage', () => {
  let storage: WebhookPostgresStorage;

  beforeEach(() => {
    storage = new WebhookPostgresStorage({
      webhookBaseUrl: 'http://pulse_webhook:52100',
      apiSecret: 'test-secret-key',
      defaultTtl: 3600000, // 1 hour in ms
    });
  });

  it('should initialize with webhook client config', () => {
    expect(storage).toBeDefined();
    expect(storage['webhookBaseUrl']).toBe('http://pulse_webhook:52100');
    expect(storage['apiSecret']).toBe('test-secret-key');
    expect(storage['defaultTtl']).toBe(3600000);
  });

  describe('findByUrl', () => {
    it('should call webhook API and transform response to ResourceData[]', async () => {
      // Mock fetch to return webhook API response
      const mockResponse = [
        {
          id: 1,
          url: 'https://example.com',
          markdown: 'Test content',
          html: '<p>Test content</p>',
          links: [],
          screenshot: null,
          metadata: {},
          content_source: 'firecrawl_scrape',
          scraped_at: '2025-01-15T12:00:00+00:00',
          created_at: '2025-01-15T12:00:00+00:00',
          crawl_session_id: 'job-123',
        },
      ];

      global.fetch = async (url: string, options?: RequestInit) => {
        expect(url).toBe('http://pulse_webhook:52100/api/content/by-url?url=https%3A%2F%2Fexample.com&limit=10');
        expect(options?.headers).toMatchObject({
          'Authorization': 'Bearer test-secret-key',
        });
        return {
          ok: true,
          json: async () => mockResponse,
        } as Response;
      };

      const result = await storage.findByUrl('https://example.com');

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        uri: expect.stringContaining('webhook://'),
        name: expect.any(String),
        description: expect.any(String),
        mimeType: 'text/markdown',
        metadata: {
          url: 'https://example.com',
          timestamp: '2025-01-15T12:00:00+00:00',
          resourceType: 'cleaned',
        },
      });
    });

    it('should return empty array when no content found', async () => {
      global.fetch = async () => {
        return {
          ok: false,
          status: 404,
        } as Response;
      };

      const result = await storage.findByUrl('https://notfound.com');
      expect(result).toEqual([]);
    });
  });

  describe('read', () => {
    it('should fetch content by ID from webhook API', async () => {
      const mockContent = {
        id: 42,
        url: 'https://example.com/page',
        markdown: '# Test Content\n\nThis is test markdown.',
        html: '<h1>Test Content</h1>',
        links: [],
        screenshot: null,
        metadata: {},
        content_source: 'firecrawl_scrape',
        scraped_at: '2025-01-15T12:00:00+00:00',
        created_at: '2025-01-15T12:00:00+00:00',
        crawl_session_id: 'job-123',
      };

      global.fetch = async (url: string, options?: RequestInit) => {
        expect(url).toBe('http://pulse_webhook:52100/api/content/42');
        expect(options?.headers).toMatchObject({
          'Authorization': 'Bearer test-secret-key',
        });
        return {
          ok: true,
          json: async () => mockContent,
        } as Response;
      };

      const result = await storage.read('webhook://42');

      expect(result).toMatchObject({
        uri: 'webhook://42',
        mimeType: 'text/markdown',
        text: '# Test Content\n\nThis is test markdown.',
      });
    });

    it('should throw error when content not found', async () => {
      global.fetch = async () => {
        return {
          ok: false,
          status: 404,
        } as Response;
      };

      await expect(storage.read('webhook://999')).rejects.toThrow('Resource not found');
    });

    it('should throw error for invalid URI format', async () => {
      await expect(storage.read('invalid://uri')).rejects.toThrow('Invalid URI');
    });
  });

  describe('findByUrlAndExtract', () => {
    it('should call findByUrl and return results regardless of extractPrompt', async () => {
      const mockResponse = [
        {
          id: 1,
          url: 'https://example.com',
          markdown: '# Cleaned Content',
          html: '<h1>Cleaned Content</h1>',
          links: [],
          screenshot: null,
          metadata: {},
          content_source: 'firecrawl_scrape',
          scraped_at: '2025-01-15T12:00:00+00:00',
          created_at: '2025-01-15T12:00:00+00:00',
          crawl_session_id: null,
        },
      ];

      global.fetch = async (url: string) => {
        expect(url).toBe('http://pulse_webhook:52100/api/content/by-url?url=https%3A%2F%2Fexample.com&limit=10');
        return {
          ok: true,
          json: async () => mockResponse,
        } as Response;
      };

      // Webhook doesn't support extraction filtering - extractPrompt is ignored
      const result = await storage.findByUrlAndExtract('https://example.com', 'Extract pricing info');

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        uri: 'webhook://1',
        metadata: {
          url: 'https://example.com',
          resourceType: 'cleaned',
        },
      });
    });

    it('should return empty array when URL not found', async () => {
      global.fetch = async () => {
        return {
          ok: false,
          status: 404,
        } as Response;
      };

      const result = await storage.findByUrlAndExtract('https://notfound.com', 'Any prompt');
      expect(result).toEqual([]);
    });
  });

  describe('writeMulti', () => {
    it('should throw error indicating webhook storage is read-only', async () => {
      const data = {
        url: 'https://example.com',
        raw: '<html>Raw HTML</html>',
        cleaned: '# Cleaned Markdown',
        extracted: 'Extracted data',
        metadata: { title: 'Test Page' },
      };

      await expect(storage.writeMulti(data)).rejects.toThrow(
        'writeMulti not supported - webhook storage is read-only'
      );
    });

    it('should document that writes happen via Firecrawl → webhook pipeline', async () => {
      const data = {
        url: 'https://example.com',
        raw: 'content',
      };

      await expect(storage.writeMulti(data)).rejects.toThrow(
        /webhook storage is read-only/
      );
    });
  });

  describe('list', () => {
    it('should throw error indicating list is not supported', async () => {
      await expect(storage.list()).rejects.toThrow(
        'list not supported by webhook storage'
      );
    });
  });

  describe('exists', () => {
    it('should return true when content exists', async () => {
      global.fetch = async (url: string) => {
        expect(url).toBe('http://pulse_webhook:52100/api/content/42');
        return {
          ok: true,
          json: async () => ({
            id: 42,
            url: 'https://example.com',
            markdown: 'Content exists',
            scraped_at: '2025-01-15T12:00:00+00:00',
          }),
        } as Response;
      };

      const result = await storage.exists('webhook://42');
      expect(result).toBe(true);
    });

    it('should return false when content does not exist', async () => {
      global.fetch = async () => {
        return {
          ok: false,
          status: 404,
        } as Response;
      };

      const result = await storage.exists('webhook://999');
      expect(result).toBe(false);
    });

    it('should throw error for invalid URI format', async () => {
      await expect(storage.exists('invalid://uri')).rejects.toThrow('Invalid URI');
    });
  });

  describe('delete', () => {
    it('should throw error indicating delete is not supported', async () => {
      await expect(storage.delete('webhook://123')).rejects.toThrow(
        'delete not supported by webhook storage'
      );
    });
  });

  describe('getStats', () => {
    it('should throw error indicating stats are not supported', async () => {
      await expect(storage.getStats()).rejects.toThrow(
        'stats not supported by webhook storage'
      );
    });
  });

  describe('getStatsSync', () => {
    it('should throw error indicating stats are not supported', () => {
      expect(() => storage.getStatsSync()).toThrow(
        'stats not supported by webhook storage'
      );
    });
  });
});
