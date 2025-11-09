import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { searchPipeline } from './pipeline.js';
import type {
  FirecrawlSearchClient,
  SearchResult,
  SearchOptions as ClientSearchOptions,
} from '../../../clients/firecrawl/index.js';
import type { SearchOptions } from './schema.js';

vi.mock('../../../clients/firecrawl/index.js');

describe('Search Pipeline', () => {
  let mockClient: { search: Mock<(options: ClientSearchOptions) => Promise<SearchResult>> };

  beforeEach(() => {
    mockClient = {
      search: vi.fn() as Mock<(options: ClientSearchOptions) => Promise<SearchResult>>,
    };
  });

  it('should execute search and return results', async () => {
    mockClient.search.mockResolvedValue({
      success: true,
      data: [{ url: 'https://example.com', title: 'Test', description: 'Desc' }],
      creditsUsed: 2,
    });

    const options: SearchOptions = {
      query: 'test query',
      limit: 5,
      lang: 'en',
      ignoreInvalidURLs: false,
    };

    const result = await searchPipeline(mockClient as unknown as FirecrawlSearchClient, options);

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
    expect(mockClient.search).toHaveBeenCalledWith({
      query: 'test query',
      limit: 5,
      lang: 'en',
      ignoreInvalidURLs: false,
      sources: undefined,
      categories: undefined,
      country: undefined,
      location: undefined,
      timeout: undefined,
      scrapeOptions: undefined,
    });
  });

  it('should pass tbs parameter to Firecrawl client', async () => {
    mockClient.search.mockResolvedValue({
      success: true,
      data: [{ url: 'https://example.com', title: 'Test', description: 'Desc' }],
      creditsUsed: 2,
    });

    const options: SearchOptions = {
      query: 'test query',
      limit: 5,
      tbs: 'qdr:d',
      lang: 'en',
      ignoreInvalidURLs: false,
    };

    await searchPipeline(mockClient as unknown as FirecrawlSearchClient, options);

    expect(mockClient.search).toHaveBeenCalledWith({
      query: 'test query',
      limit: 5,
      lang: 'en',
      tbs: 'qdr:d',
      ignoreInvalidURLs: false,
      sources: undefined,
      categories: undefined,
      country: undefined,
      location: undefined,
      timeout: undefined,
      scrapeOptions: undefined,
    });
  });

  it('should handle search errors', async () => {
    mockClient.search.mockRejectedValue(new Error('API error'));

    const options: SearchOptions = {
      query: 'test',
      limit: 5,
      lang: 'en',
      ignoreInvalidURLs: false,
    };

    await expect(
      searchPipeline(mockClient as unknown as FirecrawlSearchClient, options)
    ).rejects.toThrow('API error');
  });
});
