import type {
  StartCrawlResult,
  CrawlStatusResult,
  CancelResult,
} from '@firecrawl/client';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export function formatCrawlResponse(
  result: StartCrawlResult | CrawlStatusResult | CancelResult
): CallToolResult {
  // Check which type of result we have
  if ('id' in result && 'url' in result) {
    // StartCrawlResult
    return {
      content: [
        {
          type: 'text',
          text: `Crawl job started successfully!\n\nJob ID: ${result.id}\nStatus URL: ${result.url}\n\nUse crawl tool with jobId "${result.id}" to check progress.`,
        },
      ],
      isError: false,
    };
  } else if ('status' in result && 'completed' in result) {
    // CrawlStatusResult
    const statusResult = result as CrawlStatusResult;
    const content: CallToolResult['content'] = [];

    // Only return status metadata - data is handled by webhook server
    let statusText = `Crawl Status: ${statusResult.status}\nProgress: ${statusResult.completed}/${statusResult.total} pages\nCredits used: ${statusResult.creditsUsed}\nExpires at: ${statusResult.expiresAt}`;

    if (statusResult.next) {
      statusText += `\n\nPagination URL: ${statusResult.next}`;
    }

    content.push({
      type: 'text',
      text: statusText,
    });

    return { content, isError: false };
  } else {
    // CancelResult
    return {
      content: [
        {
          type: 'text',
          text: `Crawl job cancelled successfully. Status: ${(result as CancelResult).status}`,
        },
      ],
      isError: false,
    };
  }
}
