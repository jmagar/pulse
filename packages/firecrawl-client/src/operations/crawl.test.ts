import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  startCrawl,
  getCrawlStatus,
  cancelCrawl,
  getCrawlErrors,
  getActiveCrawls,
} from './crawl.js';

const API_KEY = 'test-key';
const BASE_URL = 'https://firecrawl.test/v2';

const buildResponse = (body: unknown, init: { ok?: boolean; status?: number } = {}) => ({
  ok: init.ok ?? true,
  status: init.status ?? 200,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

declare global {
  // eslint-disable-next-line no-var
  var fetch: typeof fetch;
}

describe('crawl operations', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts a crawl with provided options', async () => {
    const payload = { success: true, id: 'job-1', url: 'https://firecrawl.test/crawl/job-1' };
    fetchMock.mockResolvedValue(buildResponse(payload));

    const result = await startCrawl(API_KEY, BASE_URL, { url: 'https://example.com', limit: 5 });

    expect(fetchMock).toHaveBeenCalledWith(`${BASE_URL}/crawl`, expect.objectContaining({
      method: 'POST',
    }));
    expect(result).toEqual(payload);
  });

  it('retrieves crawl errors and normalizes response shape', async () => {
    const payload = { success: true, data: { errors: [{ id: '1', error: 'boom' }], robotsBlocked: ['https://blocked'] } };
    fetchMock.mockResolvedValue(buildResponse(payload));

    const result = await getCrawlErrors(API_KEY, BASE_URL, 'job-err');

    expect(fetchMock).toHaveBeenCalledWith(`${BASE_URL}/crawl/job-err/errors`, expect.any(Object));
    expect(result.errors).toHaveLength(1);
    expect(result.robotsBlocked).toEqual(['https://blocked']);
  });

  it('lists active crawls', async () => {
    const payload = {
      success: true,
      crawls: [
        {
          id: 'job-1',
          teamId: 'team-1',
          url: 'https://example.com',
          options: { limit: 5 },
        },
      ],
    };
    fetchMock.mockResolvedValue(buildResponse(payload));

    const result = await getActiveCrawls(API_KEY, BASE_URL);

    expect(fetchMock).toHaveBeenCalledWith(`${BASE_URL}/crawl/active`, expect.any(Object));
    expect(result.crawls[0]).toMatchObject({ id: 'job-1', teamId: 'team-1' });
  });

  describe('timeout protection', () => {
    it('should timeout startCrawl after 30 seconds', async () => {
      // Mock fetch to respect abort signal
      fetchMock.mockImplementation((_url, options) => {
        return new Promise((_resolve, reject) => {
          const signal = (options as RequestInit)?.signal;
          if (signal) {
            signal.addEventListener('abort', () => {
              const error = new Error('The operation was aborted');
              error.name = 'AbortError';
              reject(error);
            });
          }
          // Never resolve - wait for abort
        });
      });

      await expect(
        startCrawl(API_KEY, BASE_URL, { url: 'https://example.com' })
      ).rejects.toThrow(/timeout/i);
    });

    it('should clear timeout on successful response', async () => {
      const payload = { success: true, id: 'test-123', url: 'https://firecrawl.test/crawl/test-123' };
      fetchMock.mockResolvedValue(buildResponse(payload));

      const result = await startCrawl(API_KEY, BASE_URL, { url: 'https://example.com' });

      expect(result).toBeDefined();
      expect(result.id).toBe('test-123');
    });

    it('should apply timeout to getCrawlStatus', async () => {
      fetchMock.mockImplementation((_url, options) => {
        return new Promise((_resolve, reject) => {
          const signal = (options as RequestInit)?.signal;
          if (signal) {
            signal.addEventListener('abort', () => {
              const error = new Error('The operation was aborted');
              error.name = 'AbortError';
              reject(error);
            });
          }
        });
      });

      await expect(
        getCrawlStatus(API_KEY, BASE_URL, 'job-123')
      ).rejects.toThrow(/timeout/i);
    });

    it('should apply timeout to cancelCrawl', async () => {
      fetchMock.mockImplementation((_url, options) => {
        return new Promise((_resolve, reject) => {
          const signal = (options as RequestInit)?.signal;
          if (signal) {
            signal.addEventListener('abort', () => {
              const error = new Error('The operation was aborted');
              error.name = 'AbortError';
              reject(error);
            });
          }
        });
      });

      await expect(
        cancelCrawl(API_KEY, BASE_URL, 'job-123')
      ).rejects.toThrow(/timeout/i);
    });

    it('should apply timeout to getCrawlErrors', async () => {
      fetchMock.mockImplementation((_url, options) => {
        return new Promise((_resolve, reject) => {
          const signal = (options as RequestInit)?.signal;
          if (signal) {
            signal.addEventListener('abort', () => {
              const error = new Error('The operation was aborted');
              error.name = 'AbortError';
              reject(error);
            });
          }
        });
      });

      await expect(
        getCrawlErrors(API_KEY, BASE_URL, 'job-123')
      ).rejects.toThrow(/timeout/i);
    });

    it('should apply timeout to getActiveCrawls', async () => {
      fetchMock.mockImplementation((_url, options) => {
        return new Promise((_resolve, reject) => {
          const signal = (options as RequestInit)?.signal;
          if (signal) {
            signal.addEventListener('abort', () => {
              const error = new Error('The operation was aborted');
              error.name = 'AbortError';
              reject(error);
            });
          }
        });
      });

      await expect(
        getActiveCrawls(API_KEY, BASE_URL)
      ).rejects.toThrow(/timeout/i);
    });
  });
});
