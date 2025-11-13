import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  startBatchScrape,
  getBatchScrapeStatus,
  cancelBatchScrape,
  getBatchScrapeErrors,
} from './batch-scrape.js';

declare global {
  // eslint-disable-next-line no-var
  var fetch: typeof fetch;
}

describe('batch scrape operations', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('posts URLs to startBatchScrape', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, id: 'batch-1', url: 'http://example.com', invalidURLs: [] }),
    });

    await startBatchScrape('key', 'https://api.test/v2', {
      urls: ['https://a.com', 'https://b.com'],
      ignoreInvalidURLs: true,
      formats: ['markdown'],
    });

    expect(fetchMock).toHaveBeenCalledWith('https://api.test/v2/batch/scrape', expect.objectContaining({ method: 'POST' }));
    const [, init] = fetchMock.mock.calls[0];
    const payload = JSON.parse(init.body as string);
    expect(payload.urls).toEqual(['https://a.com', 'https://b.com']);
    expect(payload.ignoreInvalidURLs).toBe(true);
    expect(payload.formats).toEqual(['markdown']);
  });

  it('fetches batch status', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'completed', total: 2, completed: 2, creditsUsed: 2, expiresAt: '2025', data: [] }),
    });

    const result = await getBatchScrapeStatus('key', 'https://api.test/v2', 'job-1');
    expect(result.status).toBe('completed');
  });

  it('cancels batch job', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, message: 'cancelled' }),
    });

    const result = await cancelBatchScrape('key', 'https://api.test/v2', 'job-1');
    expect(result.success).toBe(true);
  });

  it('retrieves batch errors', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ errors: [{ error: 'boom' }], robotsBlocked: ['https://blocked'] }),
    });

    const result = await getBatchScrapeErrors('key', 'https://api.test/v2', 'job-1');
    expect(result.errors).toHaveLength(1);
    expect(result.robotsBlocked).toEqual(['https://blocked']);
  });
});
