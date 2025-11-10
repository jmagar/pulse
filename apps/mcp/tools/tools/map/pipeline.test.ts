import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mapPipeline } from './pipeline.js';
import type { FirecrawlMapClient } from '@firecrawl/client';
import type { MapOptions } from './schema.js';

describe('Map Pipeline', () => {
  let mockClient: FirecrawlMapClient;

  beforeEach(() => {
    mockClient = {
      map: vi.fn().mockResolvedValue({
        success: true,
        links: [
          { url: 'https://example.com/page1', title: 'Page 1' },
          { url: 'https://example.com/page2', title: 'Page 2' },
        ],
      }),
    } as any;
  });

  describe('API Parameter Passing', () => {
    it('should pass all API-specific options to client', async () => {
      const options: MapOptions = {
        url: 'https://example.com',
        search: 'docs',
        limit: 5000,
        sitemap: 'include',
        includeSubdomains: true,
        ignoreQueryParameters: true,
        timeout: 60000,
        location: { country: 'US', languages: ['en-US'] },
        startIndex: 0,
        maxResults: 1000,
        resultHandling: 'saveAndReturn',
      };

      await mapPipeline(mockClient, options);

      expect(mockClient.map).toHaveBeenCalledWith({
        url: 'https://example.com',
        search: 'docs',
        limit: 5000,
        sitemap: 'include',
        includeSubdomains: true,
        ignoreQueryParameters: true,
        timeout: 60000,
        location: { country: 'US', languages: ['en-US'] },
      });
    });

    it('should not pass pagination parameters to client', async () => {
      const options: MapOptions = {
        url: 'https://example.com',
        startIndex: 1000,
        maxResults: 500,
        resultHandling: 'saveOnly',
        limit: 5000,
        sitemap: 'include',
        includeSubdomains: true,
        ignoreQueryParameters: true,
        location: { country: 'US', languages: ['en-US'] },
      };

      await mapPipeline(mockClient, options);

      const callArgs = (mockClient.map as any).mock.calls[0][0];
      expect(callArgs.startIndex).toBeUndefined();
      expect(callArgs.maxResults).toBeUndefined();
      expect(callArgs.resultHandling).toBeUndefined();
    });

    it('should not pass tool-level parameters even when defaults are used', async () => {
      const options: MapOptions = {
        url: 'https://example.com',
        // These will have default values from schema
        startIndex: 0,
        maxResults: 200,
        resultHandling: 'saveAndReturn',
        limit: 5000,
        sitemap: 'include',
        includeSubdomains: true,
        ignoreQueryParameters: true,
        location: { country: 'US', languages: ['en-US'] },
      };

      await mapPipeline(mockClient, options);

      const callArgs = (mockClient.map as any).mock.calls[0][0];
      expect(callArgs).not.toHaveProperty('startIndex');
      expect(callArgs).not.toHaveProperty('maxResults');
      expect(callArgs).not.toHaveProperty('resultHandling');
    });
  });

  describe('Minimal Options', () => {
    it('should handle minimal options with only required URL', async () => {
      const options: MapOptions = {
        url: 'https://example.com',
        limit: 5000,
        sitemap: 'include',
        includeSubdomains: true,
        ignoreQueryParameters: true,
        location: { country: 'US', languages: ['en-US'] },
        startIndex: 0,
        maxResults: 200,
        resultHandling: 'saveAndReturn',
      };

      await mapPipeline(mockClient, options);

      expect(mockClient.map).toHaveBeenCalledWith({
        url: 'https://example.com',
        limit: 5000,
        sitemap: 'include',
        includeSubdomains: true,
        ignoreQueryParameters: true,
        location: { country: 'US', languages: ['en-US'] },
      });
    });
  });

  describe('Optional Parameters', () => {
    it('should pass optional search parameter when provided', async () => {
      const options: MapOptions = {
        url: 'https://example.com',
        search: 'api',
        limit: 5000,
        sitemap: 'include',
        includeSubdomains: true,
        ignoreQueryParameters: true,
        location: { country: 'US', languages: ['en-US'] },
        startIndex: 0,
        maxResults: 200,
        resultHandling: 'saveAndReturn',
      };

      await mapPipeline(mockClient, options);

      expect(mockClient.map).toHaveBeenCalledWith(
        expect.objectContaining({
          search: 'api',
        })
      );
    });

    it('should pass optional timeout parameter when provided', async () => {
      const options: MapOptions = {
        url: 'https://example.com',
        timeout: 90000,
        limit: 5000,
        sitemap: 'include',
        includeSubdomains: true,
        ignoreQueryParameters: true,
        location: { country: 'US', languages: ['en-US'] },
        startIndex: 0,
        maxResults: 200,
        resultHandling: 'saveAndReturn',
      };

      await mapPipeline(mockClient, options);

      expect(mockClient.map).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 90000,
        })
      );
    });

    it('should pass location with languages when provided', async () => {
      const options: MapOptions = {
        url: 'https://example.com',
        location: { country: 'JP', languages: ['ja-JP', 'en-US'] },
        limit: 5000,
        sitemap: 'include',
        includeSubdomains: true,
        ignoreQueryParameters: true,
        startIndex: 0,
        maxResults: 200,
        resultHandling: 'saveAndReturn',
      };

      await mapPipeline(mockClient, options);

      expect(mockClient.map).toHaveBeenCalledWith(
        expect.objectContaining({
          location: { country: 'JP', languages: ['ja-JP', 'en-US'] },
        })
      );
    });
  });

  describe('Result Handling', () => {
    it('should return the client result unchanged', async () => {
      const mockResult = {
        success: true,
        links: [
          { url: 'https://example.com/page1', title: 'Page 1', description: 'Desc 1' },
          { url: 'https://example.com/page2', title: 'Page 2' },
        ],
      };

      mockClient.map = vi.fn().mockResolvedValue(mockResult);

      const options: MapOptions = {
        url: 'https://example.com',
        limit: 5000,
        sitemap: 'include',
        includeSubdomains: true,
        ignoreQueryParameters: true,
        location: { country: 'US', languages: ['en-US'] },
        startIndex: 0,
        maxResults: 200,
        resultHandling: 'saveAndReturn',
      };

      const result = await mapPipeline(mockClient, options);

      expect(result).toEqual(mockResult);
    });

    it('should propagate client errors', async () => {
      mockClient.map = vi.fn().mockRejectedValue(new Error('API Error'));

      const options: MapOptions = {
        url: 'https://example.com',
        limit: 5000,
        sitemap: 'include',
        includeSubdomains: true,
        ignoreQueryParameters: true,
        location: { country: 'US', languages: ['en-US'] },
        startIndex: 0,
        maxResults: 200,
        resultHandling: 'saveAndReturn',
      };

      await expect(mapPipeline(mockClient, options)).rejects.toThrow('API Error');
    });
  });

  describe('Parameter Filtering Edge Cases', () => {
    it('should only pass explicitly defined client parameters', async () => {
      const options: MapOptions = {
        url: 'https://example.com',
        limit: 5000,
        sitemap: 'include',
        includeSubdomains: true,
        ignoreQueryParameters: true,
        location: { country: 'US', languages: ['en-US'] },
        startIndex: 999,
        maxResults: 123,
        resultHandling: 'saveOnly',
      };

      await mapPipeline(mockClient, options);

      const callArgs = (mockClient.map as any).mock.calls[0][0];
      const allowedKeys = [
        'url',
        'search',
        'limit',
        'sitemap',
        'includeSubdomains',
        'ignoreQueryParameters',
        'timeout',
        'location',
      ];

      // Verify only allowed keys are present
      Object.keys(callArgs).forEach((key) => {
        expect(allowedKeys).toContain(key);
      });
    });

    it('should filter parameters with various resultHandling values', async () => {
      const resultHandlingModes = ['saveOnly', 'saveAndReturn', 'returnOnly'] as const;

      for (const mode of resultHandlingModes) {
        const options: MapOptions = {
          url: 'https://example.com',
          resultHandling: mode,
          startIndex: 100,
          maxResults: 50,
          limit: 5000,
          sitemap: 'include',
          includeSubdomains: true,
          ignoreQueryParameters: true,
          location: { country: 'US', languages: ['en-US'] },
        };

        await mapPipeline(mockClient, options);

        const callIndex = (mockClient.map as any).mock.calls.length - 1;
        const callArgs = (mockClient.map as any).mock.calls[callIndex][0];
        expect(callArgs.resultHandling).toBeUndefined();
        expect(callArgs.startIndex).toBeUndefined();
        expect(callArgs.maxResults).toBeUndefined();
      }
    });
  });
});
