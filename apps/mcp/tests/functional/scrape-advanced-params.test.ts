import { describe, it, expect } from 'vitest';
import { buildScrapeArgsSchema } from '../../shared/mcp/tools/scrape/schema.js';

describe('Advanced scrape parameters', () => {
  const schema = buildScrapeArgsSchema();

  describe('headers parameter', () => {
    it('accepts custom headers object', () => {
      const result = schema.parse({
        url: 'https://example.com',
        headers: { 'User-Agent': 'MyBot/1.0', Cookie: 'session=abc' },
      });
      expect(result.headers).toEqual({ 'User-Agent': 'MyBot/1.0', Cookie: 'session=abc' });
    });

    it('is optional', () => {
      const result = schema.parse({ url: 'https://example.com' });
      expect(result.headers).toBeUndefined();
    });
  });

  describe('waitFor parameter', () => {
    it('accepts wait time in milliseconds', () => {
      const result = schema.parse({
        url: 'https://example.com',
        waitFor: 3000,
      });
      expect(result.waitFor).toBe(3000);
    });

    it('rejects negative values', () => {
      expect(() =>
        schema.parse({
          url: 'https://example.com',
          waitFor: -1000,
        })
      ).toThrow();
    });

    it('rejects zero', () => {
      expect(() =>
        schema.parse({
          url: 'https://example.com',
          waitFor: 0,
        })
      ).toThrow();
    });

    it('is optional', () => {
      const result = schema.parse({ url: 'https://example.com' });
      expect(result.waitFor).toBeUndefined();
    });
  });

  describe('includeTags parameter', () => {
    it('accepts array of tag selectors', () => {
      const result = schema.parse({
        url: 'https://example.com',
        includeTags: ['p', 'h1', '.article'],
      });
      expect(result.includeTags).toEqual(['p', 'h1', '.article']);
    });

    it('accepts class selectors', () => {
      const result = schema.parse({
        url: 'https://example.com',
        includeTags: ['.article-body', '#main-content'],
      });
      expect(result.includeTags).toEqual(['.article-body', '#main-content']);
    });

    it('is optional', () => {
      const result = schema.parse({ url: 'https://example.com' });
      expect(result.includeTags).toBeUndefined();
    });
  });

  describe('excludeTags parameter', () => {
    it('accepts array of tag selectors', () => {
      const result = schema.parse({
        url: 'https://example.com',
        excludeTags: ['#ad', 'nav', '.sidebar'],
      });
      expect(result.excludeTags).toEqual(['#ad', 'nav', '.sidebar']);
    });

    it('accepts multiple class selectors', () => {
      const result = schema.parse({
        url: 'https://example.com',
        excludeTags: ['.advertisement', 'aside'],
      });
      expect(result.excludeTags).toEqual(['.advertisement', 'aside']);
    });

    it('is optional', () => {
      const result = schema.parse({ url: 'https://example.com' });
      expect(result.excludeTags).toBeUndefined();
    });
  });

  describe('formats parameter', () => {
    it('defaults to markdown and html', () => {
      const result = schema.parse({ url: 'https://example.com' });
      expect(result.formats).toEqual(['markdown', 'html']);
    });

    it('accepts single format', () => {
      const result = schema.parse({
        url: 'https://example.com',
        formats: ['markdown'],
      });
      expect(result.formats).toEqual(['markdown']);
    });

    it('accepts multiple formats', () => {
      const result = schema.parse({
        url: 'https://example.com',
        formats: ['markdown', 'links', 'images'],
      });
      expect(result.formats).toEqual(['markdown', 'links', 'images']);
    });

    it('accepts all valid formats', () => {
      const result = schema.parse({
        url: 'https://example.com',
        formats: [
          'markdown',
          'html',
          'rawHtml',
          'links',
          'images',
          'screenshot',
          'summary',
          'branding',
        ],
      });
      expect(result.formats).toHaveLength(8);
    });

    it('rejects invalid formats', () => {
      expect(() =>
        schema.parse({
          url: 'https://example.com',
          formats: ['invalid'],
        })
      ).toThrow();
    });

    it('accepts rawHtml format', () => {
      const result = schema.parse({
        url: 'https://example.com',
        formats: ['rawHtml'],
      });
      expect(result.formats).toEqual(['rawHtml']);
    });

    it('accepts screenshot format', () => {
      const result = schema.parse({
        url: 'https://example.com',
        formats: ['screenshot'],
      });
      expect(result.formats).toEqual(['screenshot']);
    });

    it('accepts summary format', () => {
      const result = schema.parse({
        url: 'https://example.com',
        formats: ['summary'],
      });
      expect(result.formats).toEqual(['summary']);
    });

    it('accepts branding format', () => {
      const result = schema.parse({
        url: 'https://example.com',
        formats: ['branding'],
      });
      expect(result.formats).toEqual(['branding']);
    });
  });

  describe('onlyMainContent parameter', () => {
    it('defaults to true', () => {
      const result = schema.parse({ url: 'https://example.com' });
      expect(result.onlyMainContent).toBe(true);
    });

    it('can be disabled', () => {
      const result = schema.parse({
        url: 'https://example.com',
        onlyMainContent: false,
      });
      expect(result.onlyMainContent).toBe(false);
    });

    it('accepts true explicitly', () => {
      const result = schema.parse({
        url: 'https://example.com',
        onlyMainContent: true,
      });
      expect(result.onlyMainContent).toBe(true);
    });
  });

  describe('parameter combinations', () => {
    it('accepts all advanced parameters together', () => {
      const result = schema.parse({
        url: 'https://example.com',
        headers: { 'User-Agent': 'Bot' },
        waitFor: 2000,
        includeTags: ['article'],
        excludeTags: ['.ad'],
        formats: ['markdown', 'links'],
        onlyMainContent: false,
      });
      expect(result.headers).toEqual({ 'User-Agent': 'Bot' });
      expect(result.waitFor).toBe(2000);
      expect(result.includeTags).toEqual(['article']);
      expect(result.excludeTags).toEqual(['.ad']);
      expect(result.formats).toEqual(['markdown', 'links']);
      expect(result.onlyMainContent).toBe(false);
    });

    it('works with existing parameters', () => {
      const result = schema.parse({
        url: 'https://example.com',
        timeout: 30000,
        maxAge: 0,
        proxy: 'stealth',
        blockAds: false,
        headers: { Cookie: 'test' },
        waitFor: 5000,
        formats: ['rawHtml'],
      });
      expect(result.timeout).toBe(30000);
      expect(result.maxAge).toBe(0);
      expect(result.proxy).toBe('stealth');
      expect(result.blockAds).toBe(false);
      expect(result.headers).toEqual({ Cookie: 'test' });
      expect(result.waitFor).toBe(5000);
      expect(result.formats).toEqual(['rawHtml']);
    });
  });
});
