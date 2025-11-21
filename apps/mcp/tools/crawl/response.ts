import type {
  StartCrawlResult,
  CrawlStatusResult,
  CancelResult,
  CrawlErrorsResult,
  ActiveCrawlsResult,
} from "@firecrawl/client";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

// Firecrawl API pagination threshold for crawl results
const PAGINATION_THRESHOLD_MB = 10;

export function formatCrawlResponse(
  result:
    | StartCrawlResult
    | CrawlStatusResult
    | CancelResult
    | CrawlErrorsResult
    | ActiveCrawlsResult,
): CallToolResult {
  if ("errors" in result && "robotsBlocked" in result) {
    const errorsText =
      result.errors
        .map((error) => `• ${error.error}${error.url ? ` (${error.url})` : ""}`)
        .join("\n") || "No error entries reported.";
    const robotsText = result.robotsBlocked.length
      ? result.robotsBlocked.map((url) => `- ${url}`).join("\n")
      : "None";

    return {
      content: [
        {
          type: "text",
          text:
            "Crawl Errors:\n" +
            `${errorsText}\n\nRobots-blocked URLs:\n${robotsText}`,
        },
      ],
      isError: false,
    };
  }

  if ("crawls" in result) {
    const rows = result.crawls.length
      ? result.crawls
          .map((crawl) => `• ${crawl.id} — ${crawl.url ?? "(no url)"}`)
          .join("\n")
      : "No active crawls.";

    return {
      content: [
        {
          type: "text",
          text: `Active Crawls (total: ${result.crawls.length})\n${rows}`,
        },
      ],
      isError: false,
    };
  }

  // Check which type of result we have
  if ("error" in result && result.error) {
    // StartCrawlResult with error
    return {
      content: [
        {
          type: "text",
          text: `Crawl failed to start: ${result.error}`,
        },
      ],
      isError: true,
    };
  }

  if ("id" in result && "url" in result) {
    // StartCrawlResult - success
    return {
      content: [
        {
          type: "text",
          text: `Crawl job started successfully!\n\nJob ID: ${result.id}\nStatus URL: ${result.url}\n\nUse crawl tool with jobId "${result.id}" to check progress.`,
        },
      ],
      isError: false,
    };
  } else if ("status" in result && "completed" in result) {
    // CrawlStatusResult
    const statusResult = result as CrawlStatusResult;
    const content: CallToolResult["content"] = [];

    // Determine if crawl is truly complete (job done AND no more data to paginate)
    const isTrulyComplete =
      statusResult.status === "completed" && !statusResult.next;
    const statusLabel = isTrulyComplete
      ? "Completed"
      : statusResult.status === "completed" && statusResult.next
        ? "Completed (pagination required)"
        : statusResult.status.charAt(0).toUpperCase() +
          statusResult.status.slice(1);

    // Only return status metadata - data is handled by webhook server
    let statusText = `Crawl Status: ${statusLabel}\nProgress: ${statusResult.completed}/${statusResult.total} pages\nCredits used: ${statusResult.creditsUsed}\nExpires at: ${statusResult.expiresAt}`;

    if (statusResult.next) {
      statusText += `\n\n⚠️ Data pagination required!\nNext batch URL: ${statusResult.next}\n\nThe crawl job has completed, but the results are larger than ${PAGINATION_THRESHOLD_MB}MB.\nUse the pagination URL to retrieve the next batch of data.`;
    }

    content.push({
      type: "text",
      text: statusText,
    });

    return { content, isError: false };
  } else {
    // CancelResult
    return {
      content: [
        {
          type: "text",
          text: `Crawl job cancelled successfully. Status: ${(result as CancelResult).status}`,
        },
      ],
      isError: false,
    };
  }
}
