import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FirecrawlClient } from '../client.js';
import { SELF_HOSTED_NO_AUTH } from '../constants.js';
import { buildHeaders, debugLog } from '../utils/headers.js';

describe('FirecrawlClient configuration validation', () => {
  it('throws when API key is missing', () => {
    expect(() => new FirecrawlClient({})).toThrowError('API key is required');
  });

  it('throws when API key is blank', () => {
    expect(() => new FirecrawlClient({ apiKey: '   ' })).toThrowError('API key is required');
  });

  it('normalizes the base URL to include the v2 path segment', () => {
    const client = new FirecrawlClient({ apiKey: 'test', baseUrl: 'https://example.com' });

    expect((client as unknown as { baseUrl: string }).baseUrl).toBe('https://example.com/v2');
  });

  it('defaults the base URL when none is provided', () => {
    const client = new FirecrawlClient({ apiKey: 'test' });

    expect((client as unknown as { baseUrl: string }).baseUrl).toBe('https://api.firecrawl.dev/v2');
  });
});

describe('transport helpers', () => {
  let originalDebug: string | undefined;

  beforeEach(() => {
    originalDebug = process.env.DEBUG;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalDebug === undefined) {
      delete process.env.DEBUG;
    } else {
      process.env.DEBUG = originalDebug;
    }
  });

  it('buildHeaders includes authorization by default and content type when requested', () => {
    const headers = buildHeaders('fc-123', true);

    expect(headers).toMatchObject({
      'Content-Type': 'application/json',
      Authorization: 'Bearer fc-123',
    });
  });

  it('buildHeaders omits authorization for self-hosted deployments', () => {
    const headers = buildHeaders(SELF_HOSTED_NO_AUTH, true);

    expect(headers).toEqual({ 'Content-Type': 'application/json' });
  });

  it('buildHeaders can omit content type when not requested', () => {
    const headers = buildHeaders('fc-123');

    expect(headers).toEqual({ Authorization: 'Bearer fc-123' });
  });

  it('debugLog writes to stderr when DEBUG includes firecrawl-client', () => {
    process.env.DEBUG = 'firecrawl-client';
    const writeSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    debugLog('message', { value: 123 });

    expect(writeSpy).toHaveBeenCalledTimes(1);
    expect(writeSpy.mock.calls[0][0]).toContain('[FIRECRAWL-CLIENT-DEBUG] message {"value":123}');
  });

  it('debugLog does nothing when DEBUG is not set', () => {
    const writeSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    debugLog('message');

    expect(writeSpy).not.toHaveBeenCalled();
  });
});
