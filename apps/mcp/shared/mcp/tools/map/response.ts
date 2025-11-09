import type { MapResult } from '@firecrawl/client';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export function formatMapResponse(
  result: MapResult,
  url: string,
  startIndex: number,
  maxResults: number,
  resultHandling: 'saveOnly' | 'saveAndReturn' | 'returnOnly'
): CallToolResult {
  const content: CallToolResult['content'] = [];
  const totalLinks = result.links.length;

  // Apply pagination
  const paginatedLinks = result.links.slice(startIndex, startIndex + maxResults);
  const hasMore = startIndex + maxResults < totalLinks;
  const endIndex = Math.min(startIndex + maxResults, totalLinks);

  // Calculate statistics
  const domains = new Set(
    result.links.map((link) => {
      try {
        return new URL(link.url).hostname;
      } catch {
        return 'invalid-url';
      }
    })
  );

  const linksWithTitles = result.links.filter((l) => l.title).length;
  const titleCoverage = totalLinks > 0 ? Math.round((linksWithTitles / totalLinks) * 100) : 0;

  // Build summary text
  const summaryLines = [
    `Map Results for ${url}`,
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    `Total URLs discovered: ${totalLinks}`,
    `Unique domains: ${domains.size}`,
    `URLs with titles: ${titleCoverage}%`,
    `Showing: ${startIndex + 1}-${endIndex} of ${totalLinks}`,
  ];

  if (hasMore) {
    summaryLines.push('');
    summaryLines.push(`[More results available. Use startIndex: ${endIndex} to continue]`);
  }

  content.push({
    type: 'text',
    text: summaryLines.join('\n'),
  });

  // Prepare resource data
  const resourceData = JSON.stringify(paginatedLinks, null, 2);
  const hostname = new URL(url).hostname;
  const pageNumber = Math.floor(startIndex / maxResults);
  const baseUri = `pulse://map/${hostname}/${Date.now()}/page-${pageNumber}`;
  const resourceName = `URL Map: ${url} (${paginatedLinks.length} URLs)`;

  // Handle different result modes
  if (resultHandling === 'saveOnly') {
    const estimatedChars = resourceData.length;
    const estimatedTokens = Math.ceil(estimatedChars / 4);

    content.push({
      type: 'resource_link',
      uri: baseUri,
      name: resourceName,
      mimeType: 'application/json',
      description: `URLs ${startIndex + 1}-${endIndex} from ${url}. Estimated ${estimatedTokens} tokens.`,
    });
  } else if (resultHandling === 'saveAndReturn') {
    content.push({
      type: 'resource',
      resource: {
        uri: baseUri,
        name: resourceName,
        mimeType: 'application/json',
        text: resourceData,
      },
    });
  } else {
    // returnOnly
    content.push({
      type: 'text',
      text: resourceData,
    });
  }

  return { content, isError: false };
}
