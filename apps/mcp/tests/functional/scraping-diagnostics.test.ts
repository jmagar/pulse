import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { scrapeUniversal } from '../../shared/scraping/strategies/selector.js';
import type { IScrapingClients } from '../../shared/server.js';

describe('Scraping Error Diagnostics', () => {
  let mockClients: IScrapingClients;

  beforeEach(() => {
    mockClients = {
      native: {
        scrape: vi.fn(),
      },
      firecrawl: {
        scrape: vi.fn(),
      },
    };
  });

  describe('diagnostics object structure', () => {
    it('should include diagnostics when all strategies fail', async () => {
      vi.mocked(mockClients.native.scrape).mockResolvedValue({
        success: false,
        status: 403,
        error: 'Forbidden',
      });
      vi.mocked(mockClients.firecrawl!.scrape).mockResolvedValue({
        success: false,
        error: 'Rate limited',
      });

      const result = await scrapeUniversal(mockClients, {
        url: 'https://example.com',
      });

      expect(result.success).toBe(false);
      expect(result.diagnostics).toBeDefined();
      expect(result.diagnostics?.strategiesAttempted).toEqual(['native', 'firecrawl']);
      expect(result.diagnostics?.strategyErrors).toEqual({
        native: 'Forbidden',
        firecrawl: 'Rate limited',
      });
      expect(result.diagnostics?.timing).toBeDefined();
      expect(Object.keys(result.diagnostics?.timing || {})).toEqual(['native', 'firecrawl']);
    });

    it('should include timing information for each attempted strategy', async () => {
      // Mock delays to test timing
      vi.mocked(mockClients.native.scrape).mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { success: false };
      });
      vi.mocked(mockClients.firecrawl!.scrape).mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return { success: false };
      });

      const result = await scrapeUniversal(mockClients, {
        url: 'https://example.com',
      });

      expect(result.diagnostics?.timing?.native).toBeGreaterThanOrEqual(8);
      expect(result.diagnostics?.timing?.firecrawl).toBeGreaterThanOrEqual(18);
    });
  });

  describe('error message formatting', () => {
    it('should generate detailed error message with all failed strategies', async () => {
      vi.mocked(mockClients.native.scrape).mockResolvedValue({
        success: false,
        status: 403,
      });
      vi.mocked(mockClients.firecrawl!.scrape).mockResolvedValue({
        success: false,
        error: 'Authentication failed',
      });

      const result = await scrapeUniversal(mockClients, {
        url: 'https://example.com',
      });

      // Check for auth error first since it should stop early
      if (result.isAuthError) {
        expect(result.error).toContain('authentication error');
      } else {
        expect(result.error).toContain('All strategies failed');
        expect(result.error).toContain('Attempted: native, firecrawl');
        expect(result.error).toContain('native: HTTP 403');
        expect(result.error).toContain('firecrawl: Authentication failed');
      }
    });

    it('should handle missing error messages gracefully', async () => {
      vi.mocked(mockClients.native.scrape).mockResolvedValue({ success: false });
      vi.mocked(mockClients.firecrawl!.scrape).mockResolvedValue({ success: false });

      const result = await scrapeUniversal(mockClients, {
        url: 'https://example.com',
      });

      expect(result.diagnostics?.strategyErrors.native).toBe('HTTP unknown');
      // Firecrawl should have errors since it was attempted
      expect(result.diagnostics?.strategiesAttempted).toContain('firecrawl');
      expect(result.diagnostics?.strategyErrors.firecrawl).toBeDefined();
    });
  });

  describe('exception handling', () => {
    it('should capture exceptions as errors in diagnostics', async () => {
      vi.mocked(mockClients.native.scrape).mockRejectedValue(new Error('Network error'));
      vi.mocked(mockClients.firecrawl!.scrape).mockRejectedValue(new Error('API error'));

      const result = await scrapeUniversal(mockClients, {
        url: 'https://example.com',
      });

      expect(result.diagnostics?.strategyErrors.native).toBe('Network error');
      expect(result.diagnostics?.strategyErrors.firecrawl).toBe('API error');
    });

    it('should handle non-Error exceptions', async () => {
      vi.mocked(mockClients.native.scrape).mockRejectedValue('String error');
      vi.mocked(mockClients.firecrawl!.scrape).mockRejectedValue(null);

      const result = await scrapeUniversal(mockClients, {
        url: 'https://example.com',
      });

      expect(result.diagnostics?.strategyErrors.native).toBe('Unknown error');
      expect(result.diagnostics?.strategyErrors.firecrawl).toBe('Unknown error');
    });
  });

  describe('missing clients', () => {
    it('should report missing firecrawl client in diagnostics', async () => {
      const clientsWithoutFirecrawl = {
        ...mockClients,
        firecrawl: undefined,
      };
      vi.mocked(mockClients.native.scrape).mockResolvedValue({ success: false });

      const result = await scrapeUniversal(clientsWithoutFirecrawl, {
        url: 'https://example.com',
      });

      expect(result.diagnostics?.strategyErrors.firecrawl).toBe('Firecrawl client not configured');
      expect(result.diagnostics?.strategiesAttempted).not.toContain('firecrawl');
    });
  });

  describe('successful scraping', () => {
    it('should include diagnostics even on success', async () => {
      vi.mocked(mockClients.native.scrape).mockResolvedValue({
        success: true,
        status: 200,
        data: 'Content',
      });

      const result = await scrapeUniversal(mockClients, {
        url: 'https://example.com',
      });

      expect(result.success).toBe(true);
      expect(result.diagnostics).toBeDefined();
      expect(result.diagnostics?.strategiesAttempted).toEqual(['native']);
      expect(result.diagnostics?.strategyErrors).toEqual({});
      expect(result.diagnostics?.timing?.native).toBeDefined();
    });

    it('should include failed strategies in diagnostics when fallback succeeds', async () => {
      vi.mocked(mockClients.native.scrape).mockResolvedValue({
        success: false,
        status: 403,
      });
      vi.mocked(mockClients.firecrawl!.scrape).mockResolvedValue({
        success: true,
        data: {
          content: 'Content',
          markdown: 'Content',
          html: '<p>Content</p>',
          metadata: {},
        },
      });

      const result = await scrapeUniversal(mockClients, {
        url: 'https://example.com',
      });

      expect(result.success).toBe(true);
      expect(result.source).toBe('firecrawl');
      expect(result.diagnostics?.strategiesAttempted).toEqual(['native', 'firecrawl']);
      expect(result.diagnostics?.strategyErrors.native).toBe('HTTP 403');
      expect(result.diagnostics?.strategyErrors.firecrawl).toBeUndefined();
    });
  });

  describe('authentication errors', () => {
    it('should stop immediately on firecrawl authentication error', async () => {
      vi.mocked(mockClients.native.scrape).mockResolvedValue({ success: false });
      vi.mocked(mockClients.firecrawl!.scrape).mockResolvedValue({
        success: false,
        error: 'Unauthorized: Invalid API key',
      });

      const result = await scrapeUniversal(mockClients, {
        url: 'https://example.com',
      });

      expect(result.isAuthError).toBe(true);
      expect(result.error).toContain('Firecrawl authentication error');
      expect(result.diagnostics?.strategiesAttempted).toEqual(['native', 'firecrawl']);
    });

  });

  describe('speed optimization mode', () => {
    const originalEnv = process.env.OPTIMIZE_FOR;

    beforeEach(() => {
      process.env.OPTIMIZE_FOR = 'speed';
    });

    afterEach(() => {
      process.env.OPTIMIZE_FOR = originalEnv;
    });

    it('should skip native strategy and include in diagnostics', async () => {
      vi.mocked(mockClients.firecrawl!.scrape).mockResolvedValue({ success: false });

      const result = await scrapeUniversal(mockClients, {
        url: 'https://example.com',
      });

      expect(result.diagnostics?.strategiesAttempted).toEqual(['firecrawl']);
      expect(mockClients.native.scrape).not.toHaveBeenCalled();
      // Native should not have an error since it wasn't attempted
      expect(result.diagnostics?.strategyErrors.native).toBeUndefined();
    });

    it('should still report missing clients in speed mode', async () => {
      const clientsWithoutFirecrawl = {
        ...mockClients,
        firecrawl: undefined,
      };

      const result = await scrapeUniversal(clientsWithoutFirecrawl, {
        url: 'https://example.com',
      });

      expect(result.diagnostics?.strategyErrors.firecrawl).toBe('Firecrawl client not configured');
      expect(result.diagnostics?.strategiesAttempted).toEqual([]);
    });
  });
});
