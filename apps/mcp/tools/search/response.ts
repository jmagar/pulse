import type { SearchResult } from "@firecrawl/client";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

type MultiSourceSearchResult = {
  web?: Array<unknown>;
  images?: Array<unknown>;
  news?: Array<unknown>;
};

export function formatSearchResponse(
  result: SearchResult,
  query: string,
): CallToolResult {
  const content: CallToolResult["content"] = [];

  // Determine if results are in simple or multi-source format
  if (!Array.isArray(result.data)) {
    const data = result.data as MultiSourceSearchResult;
    const webCount = data.web?.length ?? 0;
    const imageCount = data.images?.length ?? 0;
    const newsCount = data.news?.length ?? 0;
    const total = webCount + imageCount + newsCount;

    content.push({
      type: "text",
      text: `Found ${total} results for "${query}" (${webCount} web, ${imageCount} images, ${newsCount} news)\nCredits used: ${result.creditsUsed}`,
    });

    // Format each source type
    if ((data.web?.length ?? 0) > 0) {
      content.push({
        type: "resource",
        resource: {
          uri: `pulse://search/web/${Date.now()}`,
          name: `Web Results: ${query}`,
          mimeType: "application/json",
          text: JSON.stringify(data.web, null, 2),
        },
      });
    }

    if ((data.images?.length ?? 0) > 0) {
      content.push({
        type: "resource",
        resource: {
          uri: `pulse://search/images/${Date.now()}`,
          name: `Image Results: ${query}`,
          mimeType: "application/json",
          text: JSON.stringify(data.images, null, 2),
        },
      });
    }

    if ((data.news?.length ?? 0) > 0) {
      content.push({
        type: "resource",
        resource: {
          uri: `pulse://search/news/${Date.now()}`,
          name: `News Results: ${query}`,
          mimeType: "application/json",
          text: JSON.stringify(data.news, null, 2),
        },
      });
    }
  } else {
    const results = result.data;
    content.push({
      type: "text",
      text: `Found ${results.length} results for "${query}"\nCredits used: ${result.creditsUsed}`,
    });

    content.push({
      type: "resource",
      resource: {
        uri: `pulse://search/results/${Date.now()}`,
        name: `Search Results: ${query}`,
        mimeType: "application/json",
        text: JSON.stringify(results, null, 2),
      },
    });
  }

  return { content, isError: false };
}
