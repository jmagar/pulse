import { describe, it, expect } from 'vitest';
import { formatSearchResponse } from './response.js';

describe('Search Response Formatting', () => {
  it('should format basic search results', () => {
    const searchResult = {
      success: true,
      data: [
        {
          url: 'https://example.com/page1',
          title: 'Page 1',
          description: 'Description 1',
        },
        {
          url: 'https://example.com/page2',
          title: 'Page 2',
          description: 'Description 2',
        },
      ],
      creditsUsed: 2,
    };

    const response = formatSearchResponse(searchResult, 'test query');

    expect(response.content).toHaveLength(2);
    expect(response.content[0].type).toBe('text');
    expect(response.content[0].text).toContain('Found 2 results');
    expect(response.content[1].type).toBe('resource');
  });

  it('should format multi-source results', () => {
    const searchResult = {
      success: true,
      data: {
        web: [{ url: 'https://example.com', title: 'Web Result' }],
        images: [{ imageUrl: 'https://example.com/img.jpg', title: 'Image' }],
        news: [{ url: 'https://news.com', title: 'News Item' }],
      },
      creditsUsed: 5,
    };

    const response = formatSearchResponse(searchResult, 'test');

    expect(response.content.length).toBeGreaterThan(1);
  });
});
