import { describe, it, expect } from 'vitest';
import { buildCrawlRequestConfig, shouldStartCrawl } from '../../shared/config/crawl-config.js';

describe('Crawl config builder', () => {
  it('builds domain-specific excludes for docs.claude.com', () => {
    const config = buildCrawlRequestConfig('https://docs.claude.com/en/claude-code');
    expect(config).toBeTruthy();
    expect(config?.url).toBe('https://docs.claude.com');
    expect(config?.excludePaths).toContain('^/fr/');
    expect(config?.excludePaths).not.toContain('^/en/');
    expect(config?.maxDiscoveryDepth).toBeGreaterThanOrEqual(3);
  });

  it('falls back to universal excludes for unknown domains', () => {
    const config = buildCrawlRequestConfig('https://example.com/path');
    expect(config).toBeTruthy();
    expect(config?.url).toBe('https://example.com');
    expect(config?.excludePaths.length).toBeGreaterThan(0);
  });

  it('returns null for invalid URLs', () => {
    const config = buildCrawlRequestConfig('not-a-url');
    expect(config).toBeNull();
  });
});

describe('shouldStartCrawl', () => {
  it('allows http and https URLs', () => {
    expect(shouldStartCrawl('https://example.com')).toBe(true);
    expect(shouldStartCrawl('http://example.com')).toBe(true);
  });

  it('rejects non-http protocols', () => {
    expect(shouldStartCrawl('ftp://example.com')).toBe(false);
    expect(shouldStartCrawl('file:///tmp/test')).toBe(false);
  });
});
