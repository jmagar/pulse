import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MapOptions, MapResult } from '../types.js';
import { map } from './map.js';

describe('map operation logging', () => {
  const originalDebug = process.env.DEBUG;
  const originalFetch = globalThis.fetch;
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env.DEBUG = '';
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ urls: [] } satisfies MapResult),
    }));
    globalThis.fetch = fetchMock as typeof fetch;
  });

  afterEach(() => {
    if (originalDebug === undefined) {
      delete process.env.DEBUG;
    } else {
      process.env.DEBUG = originalDebug;
    }
    consoleSpy.mockRestore();
    if (originalFetch) {
      globalThis.fetch = originalFetch;
    } else {
      delete (globalThis as { fetch?: typeof fetch }).fetch;
    }
    vi.restoreAllMocks();
  });

  it('does not log to console when DEBUG is not set', async () => {
    const options: MapOptions = {
      url: 'https://example.com',
    };

    await map('fc-test', 'https://api.firecrawl.dev', options);

    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it('logs through debugLog when DEBUG includes firecrawl-client', async () => {
    process.env.DEBUG = 'firecrawl-client';
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const options: MapOptions = {
      url: 'https://example.com',
    };

    await map('fc-test', 'https://api.firecrawl.dev', options);

    expect(consoleSpy).not.toHaveBeenCalled();
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('[FIRECRAWL-CLIENT-DEBUG]'));

    stderrSpy.mockRestore();
  });
});
