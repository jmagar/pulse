import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FirecrawlMapClient } from '@firecrawl/client';

describe('MAP tool error handling', () => {
  let client: FirecrawlMapClient;

  beforeEach(() => {
    client = new FirecrawlMapClient({
      apiKey: 'test-key',
      baseUrl: 'https://api.firecrawl.dev',
    });
  });

  describe('Authentication errors (401/403)', () => {
    it('provides helpful message for 401 authentication failure', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'Invalid API key',
      });

      await expect(
        client.map({ url: 'https://example.com' })
      ).rejects.toThrow('FIRECRAWL_API_KEY');

      await expect(
        client.map({ url: 'https://example.com' })
      ).rejects.toThrow('Retryable: false');
    });

    it('provides helpful message for 403 forbidden', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        text: async () => 'Forbidden',
      });

      await expect(
        client.map({ url: 'https://example.com' })
      ).rejects.toThrow('FIRECRAWL_API_KEY');
    });
  });

  describe('Payment errors (402)', () => {
    it('provides helpful message with billing link', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 402,
        text: async () => 'Credits exhausted',
      });

      await expect(
        client.map({ url: 'https://example.com' })
      ).rejects.toThrow('billing');

      await expect(
        client.map({ url: 'https://example.com' })
      ).rejects.toThrow('Retryable: false');
    });
  });

  describe('Rate limiting (429)', () => {
    it('indicates error is retryable with wait time', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => 'Rate limit exceeded',
      });

      await expect(
        client.map({ url: 'https://example.com' })
      ).rejects.toThrow('Retryable: true');

      await expect(
        client.map({ url: 'https://example.com' })
      ).rejects.toThrow('retry after 60000ms');
    });
  });

  describe('Validation errors (400/404)', () => {
    it('includes error details in message for 400', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => '{"error": "Invalid URL format"}',
      });

      await expect(
        client.map({ url: 'https://example.com' })
      ).rejects.toThrow('Invalid URL format');

      await expect(
        client.map({ url: 'https://example.com' })
      ).rejects.toThrow('Retryable: false');
    });

    it('provides helpful message for 404', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => 'Not found',
      });

      await expect(
        client.map({ url: 'https://example.com' })
      ).rejects.toThrow('Invalid request parameters');
    });
  });

  describe('Server errors (5xx)', () => {
    it('indicates 500 errors are retryable', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Internal server error',
      });

      await expect(
        client.map({ url: 'https://example.com' })
      ).rejects.toThrow('Retryable: true');

      await expect(
        client.map({ url: 'https://example.com' })
      ).rejects.toThrow('retry after 5000ms');
    });

    it('handles all 5xx status codes as retryable', async () => {
      for (const status of [500, 502, 503, 504]) {
        global.fetch = vi.fn().mockResolvedValue({
          ok: false,
          status,
          text: async () => 'Server error',
        });

        await expect(
          client.map({ url: 'https://example.com' })
        ).rejects.toThrow('Retryable: true');
      }
    });
  });

  describe('Network errors', () => {
    it('categorizes connection refused as network error', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(
        client.map({ url: 'https://example.com' })
      ).rejects.toThrow('ECONNREFUSED');
    });

    it('categorizes timeout as network error', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('ETIMEDOUT'));

      await expect(
        client.map({ url: 'https://example.com' })
      ).rejects.toThrow('ETIMEDOUT');
    });
  });

  describe('Error message format', () => {
    it('includes all required error details', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => '{"error": "Too many requests"}',
      });

      try {
        await client.map({ url: 'https://example.com' });
        expect.fail('Should have thrown');
      } catch (error) {
        const message = (error as Error).message;
        expect(message).toContain('Firecrawl Map API Error (429)');
        expect(message).toContain('Rate limit exceeded');
        expect(message).toContain('Details: Too many requests');
        expect(message).toContain('Retryable: true');
        expect(message).toContain('retry after 60000ms');
      }
    });

    it('parses JSON error messages', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => '{"error": "Invalid parameter"}',
      });

      await expect(
        client.map({ url: 'https://example.com' })
      ).rejects.toThrow('Invalid parameter');
    });

    it('handles plain text error messages', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Server unavailable',
      });

      await expect(
        client.map({ url: 'https://example.com' })
      ).rejects.toThrow('Server unavailable');
    });
  });
});
