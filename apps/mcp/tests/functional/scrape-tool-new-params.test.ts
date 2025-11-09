import { describe, it, expect } from 'vitest';
import { buildScrapeArgsSchema } from '../../shared/mcp/tools/scrape/schema.js';

describe('New scrape parameters', () => {
  describe('maxAge parameter', () => {
    it('defaults to 2 days (172800000ms)', () => {
      const schema = buildScrapeArgsSchema();
      const result = schema.parse({ url: 'https://example.com' });
      expect(result.maxAge).toBe(172800000);
    });

    it('accepts custom cache age', () => {
      const schema = buildScrapeArgsSchema();
      const result = schema.parse({
        url: 'https://example.com',
        maxAge: 3600000, // 1 hour
      });
      expect(result.maxAge).toBe(3600000);
    });

    it('accepts 0 for always fresh', () => {
      const schema = buildScrapeArgsSchema();
      const result = schema.parse({
        url: 'https://example.com',
        maxAge: 0,
      });
      expect(result.maxAge).toBe(0);
    });
  });

  describe('proxy parameter', () => {
    it('defaults to auto', () => {
      const schema = buildScrapeArgsSchema();
      const result = schema.parse({ url: 'https://example.com' });
      expect(result.proxy).toBe('auto');
    });

    it('accepts basic proxy', () => {
      const schema = buildScrapeArgsSchema();
      const result = schema.parse({
        url: 'https://example.com',
        proxy: 'basic',
      });
      expect(result.proxy).toBe('basic');
    });

    it('accepts stealth proxy', () => {
      const schema = buildScrapeArgsSchema();
      const result = schema.parse({
        url: 'https://example.com',
        proxy: 'stealth',
      });
      expect(result.proxy).toBe('stealth');
    });

    it('rejects invalid proxy types', () => {
      const schema = buildScrapeArgsSchema();
      expect(() =>
        schema.parse({
          url: 'https://example.com',
          proxy: 'invalid',
        })
      ).toThrow();
    });
  });

  describe('blockAds parameter', () => {
    it('defaults to true', () => {
      const schema = buildScrapeArgsSchema();
      const result = schema.parse({ url: 'https://example.com' });
      expect(result.blockAds).toBe(true);
    });

    it('accepts false to disable ad blocking', () => {
      const schema = buildScrapeArgsSchema();
      const result = schema.parse({
        url: 'https://example.com',
        blockAds: false,
      });
      expect(result.blockAds).toBe(false);
    });
  });
});
