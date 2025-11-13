import { describe, it, expect } from 'vitest';
import { preprocessUrl } from './url-utils.js';

describe('URL Preprocessing', () => {
  it('should add https:// to bare domains', () => {
    expect(preprocessUrl('example.com')).toBe('https://example.com');
  });

  it('should preserve existing protocol', () => {
    expect(preprocessUrl('http://example.com')).toBe('http://example.com');
    expect(preprocessUrl('https://example.com')).toBe('https://example.com');
  });

  it('should handle URLs with paths', () => {
    expect(preprocessUrl('example.com/blog')).toBe('https://example.com/blog');
  });

  it('should reject invalid URLs after preprocessing', () => {
    expect(() => preprocessUrl('not a url')).toThrow('Invalid URL');
  });
});
