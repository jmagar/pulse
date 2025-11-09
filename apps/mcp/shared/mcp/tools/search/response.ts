import type { SearchResult } from '@firecrawl/client';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export function formatSearchResponse(result: SearchResult, query: string): CallToolResult {
  const content: CallToolResult['content'] = [];

  // Determine if results are in simple or multi-source format
  const isMultiSource = !Array.isArray(result.data);

  if (isMultiSource) {
    const data = result.data as any;
    const webCount = data.web?.length || 0;
    const imageCount = data.images?.length || 0;
    const newsCount = data.news?.length || 0;
    const total = webCount + imageCount + newsCount;

    content.push({
      type: 'text',
      text: `Found ${total} results for "${query}" (${webCount} web, ${imageCount} images, ${newsCount} news)\nCredits used: ${result.creditsUsed}`,
    });

    // Format each source type
    if (data.web?.length > 0) {
      content.push({
        type: 'resource',
        resource: {
          uri: `pulse://search/web/${Date.now()}`,
          name: `Web Results: ${query}`,
          mimeType: 'application/json',
          text: JSON.stringify(data.web, null, 2),
        },
      });
    }

    if (data.images?.length > 0) {
      content.push({
        type: 'resource',
        resource: {
          uri: `pulse://search/images/${Date.now()}`,
          name: `Image Results: ${query}`,
          mimeType: 'application/json',
          text: JSON.stringify(data.images, null, 2),
        },
      });
    }

    if (data.news?.length > 0) {
      content.push({
        type: 'resource',
        resource: {
          uri: `pulse://search/news/${Date.now()}`,
          name: `News Results: ${query}`,
          mimeType: 'application/json',
          text: JSON.stringify(data.news, null, 2),
        },
      });
    }
  } else {
    const results = result.data as any[];
    content.push({
      type: 'text',
      text: `Found ${results.length} results for "${query}"\nCredits used: ${result.creditsUsed}`,
    });

    content.push({
      type: 'resource',
      resource: {
        uri: `pulse://search/results/${Date.now()}`,
        name: `Search Results: ${query}`,
        mimeType: 'application/json',
        text: JSON.stringify(results, null, 2),
      },
    });
  }

  return { content, isError: false };
}
