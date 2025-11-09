/**
 * @fileoverview Tests for SCRAPE tool actions parameter
 *
 * Tests browser automation actions including wait, click, write, press,
 * scroll, screenshot, scrape, and executeJavascript actions.
 */

import { describe, it, expect } from 'vitest';
import { buildScrapeArgsSchema } from '../../shared/mcp/tools/scrape/schema.js';

describe('Scrape actions parameter', () => {
  const schema = buildScrapeArgsSchema();

  describe('wait action', () => {
    it('accepts wait action with milliseconds', () => {
      const result = schema.parse({
        url: 'https://example.com',
        actions: [{ type: 'wait', milliseconds: 2000 }],
      });
      expect(result.actions).toBeDefined();
      expect(result.actions).toHaveLength(1);
      expect(result.actions?.[0]).toEqual({ type: 'wait', milliseconds: 2000 });
    });

    it('rejects wait without milliseconds', () => {
      expect(() =>
        schema.parse({
          url: 'https://example.com',
          actions: [{ type: 'wait' }],
        })
      ).toThrow();
    });

    it('rejects wait with negative milliseconds', () => {
      expect(() =>
        schema.parse({
          url: 'https://example.com',
          actions: [{ type: 'wait', milliseconds: -1000 }],
        })
      ).toThrow();
    });

    it('rejects wait with zero milliseconds', () => {
      expect(() =>
        schema.parse({
          url: 'https://example.com',
          actions: [{ type: 'wait', milliseconds: 0 }],
        })
      ).toThrow();
    });
  });

  describe('click action', () => {
    it('accepts click action with selector', () => {
      const result = schema.parse({
        url: 'https://example.com',
        actions: [{ type: 'click', selector: '#load-more' }],
      });
      expect(result.actions).toBeDefined();
      expect(result.actions?.[0]).toEqual({ type: 'click', selector: '#load-more' });
    });

    it('accepts click with class selector', () => {
      const result = schema.parse({
        url: 'https://example.com',
        actions: [{ type: 'click', selector: '.cookie-accept' }],
      });
      expect(result.actions).toBeDefined();
      expect(result.actions?.[0]).toEqual({ type: 'click', selector: '.cookie-accept' });
    });

    it('rejects click without selector', () => {
      expect(() =>
        schema.parse({
          url: 'https://example.com',
          actions: [{ type: 'click' }],
        })
      ).toThrow();
    });
  });

  describe('write action', () => {
    it('accepts write action with selector and text', () => {
      const result = schema.parse({
        url: 'https://example.com',
        actions: [{ type: 'write', selector: '#input', text: 'test' }],
      });
      expect(result.actions).toBeDefined();
      expect(result.actions?.[0]).toEqual({ type: 'write', selector: '#input', text: 'test' });
    });

    it('accepts write with empty text', () => {
      const result = schema.parse({
        url: 'https://example.com',
        actions: [{ type: 'write', selector: '#input', text: '' }],
      });
      expect(result.actions).toBeDefined();
      expect(result.actions?.[0]).toEqual({ type: 'write', selector: '#input', text: '' });
    });

    it('rejects write without selector', () => {
      expect(() =>
        schema.parse({
          url: 'https://example.com',
          actions: [{ type: 'write', text: 'test' }],
        })
      ).toThrow();
    });

    it('rejects write without text', () => {
      expect(() =>
        schema.parse({
          url: 'https://example.com',
          actions: [{ type: 'write', selector: '#input' }],
        })
      ).toThrow();
    });
  });

  describe('press action', () => {
    it('accepts press action with Enter key', () => {
      const result = schema.parse({
        url: 'https://example.com',
        actions: [{ type: 'press', key: 'Enter' }],
      });
      expect(result.actions).toBeDefined();
      expect(result.actions?.[0]).toEqual({ type: 'press', key: 'Enter' });
    });

    it('accepts press with Escape key', () => {
      const result = schema.parse({
        url: 'https://example.com',
        actions: [{ type: 'press', key: 'Escape' }],
      });
      expect(result.actions).toBeDefined();
      expect(result.actions?.[0]).toEqual({ type: 'press', key: 'Escape' });
    });

    it('accepts press with Tab key', () => {
      const result = schema.parse({
        url: 'https://example.com',
        actions: [{ type: 'press', key: 'Tab' }],
      });
      expect(result.actions).toBeDefined();
      expect(result.actions?.[0]).toEqual({ type: 'press', key: 'Tab' });
    });

    it('rejects press without key', () => {
      expect(() =>
        schema.parse({
          url: 'https://example.com',
          actions: [{ type: 'press' }],
        })
      ).toThrow();
    });
  });

  describe('scroll action', () => {
    it('accepts scroll down', () => {
      const result = schema.parse({
        url: 'https://example.com',
        actions: [{ type: 'scroll', direction: 'down' }],
      });
      expect(result.actions).toBeDefined();
      expect(result.actions?.[0]).toEqual({ type: 'scroll', direction: 'down' });
    });

    it('accepts scroll up', () => {
      const result = schema.parse({
        url: 'https://example.com',
        actions: [{ type: 'scroll', direction: 'up' }],
      });
      expect(result.actions).toBeDefined();
      expect(result.actions?.[0]).toEqual({ type: 'scroll', direction: 'up' });
    });

    it('accepts scroll with amount', () => {
      const result = schema.parse({
        url: 'https://example.com',
        actions: [{ type: 'scroll', direction: 'down', amount: 500 }],
      });
      expect(result.actions).toBeDefined();
      expect(result.actions?.[0]).toEqual({ type: 'scroll', direction: 'down', amount: 500 });
    });

    it('rejects scroll without direction', () => {
      expect(() =>
        schema.parse({
          url: 'https://example.com',
          actions: [{ type: 'scroll' }],
        })
      ).toThrow();
    });

    it('rejects scroll with invalid direction', () => {
      expect(() =>
        schema.parse({
          url: 'https://example.com',
          actions: [{ type: 'scroll', direction: 'left' }],
        })
      ).toThrow();
    });

    it('rejects scroll with negative amount', () => {
      expect(() =>
        schema.parse({
          url: 'https://example.com',
          actions: [{ type: 'scroll', direction: 'down', amount: -100 }],
        })
      ).toThrow();
    });
  });

  describe('screenshot action', () => {
    it('accepts screenshot without name', () => {
      const result = schema.parse({
        url: 'https://example.com',
        actions: [{ type: 'screenshot' }],
      });
      expect(result.actions).toBeDefined();
      expect(result.actions?.[0]).toEqual({ type: 'screenshot' });
    });

    it('accepts screenshot with name', () => {
      const result = schema.parse({
        url: 'https://example.com',
        actions: [{ type: 'screenshot', name: 'after-login' }],
      });
      expect(result.actions).toBeDefined();
      expect(result.actions?.[0]).toEqual({ type: 'screenshot', name: 'after-login' });
    });
  });

  describe('scrape action', () => {
    it('accepts scrape without selector', () => {
      const result = schema.parse({
        url: 'https://example.com',
        actions: [{ type: 'scrape' }],
      });
      expect(result.actions).toBeDefined();
      expect(result.actions?.[0]).toEqual({ type: 'scrape' });
    });

    it('accepts scrape with selector', () => {
      const result = schema.parse({
        url: 'https://example.com',
        actions: [{ type: 'scrape', selector: '#content' }],
      });
      expect(result.actions).toBeDefined();
      expect(result.actions?.[0]).toEqual({ type: 'scrape', selector: '#content' });
    });
  });

  describe('executeJavascript action', () => {
    it('accepts executeJavascript with script', () => {
      const result = schema.parse({
        url: 'https://example.com',
        actions: [{ type: 'executeJavascript', script: 'console.log("test")' }],
      });
      expect(result.actions).toBeDefined();
      expect(result.actions?.[0]).toEqual({
        type: 'executeJavascript',
        script: 'console.log("test")',
      });
    });

    it('accepts executeJavascript with complex script', () => {
      const script = "document.querySelector('.modal').remove()";
      const result = schema.parse({
        url: 'https://example.com',
        actions: [{ type: 'executeJavascript', script }],
      });
      expect(result.actions).toBeDefined();
      expect(result.actions?.[0]).toEqual({ type: 'executeJavascript', script });
    });

    it('rejects executeJavascript without script', () => {
      expect(() =>
        schema.parse({
          url: 'https://example.com',
          actions: [{ type: 'executeJavascript' }],
        })
      ).toThrow();
    });
  });

  describe('multiple actions', () => {
    it('accepts multiple actions in sequence', () => {
      const result = schema.parse({
        url: 'https://example.com',
        actions: [
          { type: 'wait', milliseconds: 1000 },
          { type: 'click', selector: '#accept' },
          { type: 'write', selector: '#search', text: 'query' },
          { type: 'press', key: 'Enter' },
          { type: 'wait', milliseconds: 2000 },
        ],
      });
      expect(result.actions).toHaveLength(5);
    });

    it('accepts real-world login sequence', () => {
      const result = schema.parse({
        url: 'https://example.com',
        actions: [
          { type: 'wait', milliseconds: 1000 },
          { type: 'click', selector: '#cookie-accept' },
          { type: 'write', selector: '#email', text: 'user@example.com' },
          { type: 'press', key: 'Enter' },
          { type: 'wait', milliseconds: 2000 },
          { type: 'scrape', selector: '#dashboard' },
        ],
      });
      expect(result.actions).toHaveLength(6);
    });
  });

  describe('invalid actions', () => {
    it('rejects invalid action type', () => {
      expect(() =>
        schema.parse({
          url: 'https://example.com',
          actions: [{ type: 'invalid' }],
        })
      ).toThrow();
    });

    it('rejects action with wrong properties', () => {
      expect(() =>
        schema.parse({
          url: 'https://example.com',
          actions: [{ type: 'wait', selector: '#wrong' }],
        })
      ).toThrow();
    });
  });

  describe('optional parameter', () => {
    it('is optional - accepts scrape without actions', () => {
      const result = schema.parse({ url: 'https://example.com' });
      expect(result.actions).toBeUndefined();
    });

    it('accepts empty actions array', () => {
      const result = schema.parse({
        url: 'https://example.com',
        actions: [],
      });
      expect(result.actions).toEqual([]);
    });
  });
});
