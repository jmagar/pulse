import { describe, it, expect } from 'vitest';
import { preprocessUrl, validateUrl } from './url-validation.js';

describe('URL Validation', () => {
  describe('preprocessUrl', () => {
    it('should add https:// to URLs without protocol', () => {
      expect(preprocessUrl('example.com')).toBe('https://example.com');
    });

    it('should preserve existing https:// protocol', () => {
      expect(preprocessUrl('https://example.com')).toBe('https://example.com');
    });

    it('should reject file:// protocol (SSRF)', () => {
      expect(() => preprocessUrl('file:///etc/passwd')).toThrow('Invalid protocol');
    });

    it('should reject javascript: protocol (XSS)', () => {
      expect(() => preprocessUrl('javascript:alert(1)')).toThrow('Invalid protocol');
    });

    it('should reject data: protocol', () => {
      expect(() => preprocessUrl('data:text/html,<script>alert(1)</script>')).toThrow('Invalid protocol');
    });

    it('should reject localhost (SSRF)', () => {
      expect(() => preprocessUrl('http://localhost:8080')).toThrow('Private IP addresses not allowed');
    });

    it('should reject 127.0.0.1 (SSRF)', () => {
      expect(() => preprocessUrl('http://127.0.0.1')).toThrow('Private IP addresses not allowed');
    });

    it('should reject private IP 192.168.x.x (SSRF)', () => {
      expect(() => preprocessUrl('http://192.168.1.1')).toThrow('Private IP addresses not allowed');
    });

    it('should reject invalid URLs', () => {
      expect(() => preprocessUrl('not a url')).toThrow('Invalid URL');
    });
  });
});
