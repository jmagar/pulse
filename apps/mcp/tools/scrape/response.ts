import { detectContentType } from "./helpers.js";
import type { ScrapeDiagnostics } from "../../types.js";
import { logError } from "../../utils/logging.js";
import type {
  BatchScrapeStartResult,
  CrawlStatusResult,
  BatchScrapeCancelResult,
  CrawlErrorsResult,
} from "@firecrawl/client";

export interface ResponseContent {
  type: string;
  text?: string;
  data?: string;
  uri?: string;
  name?: string;
  mimeType?: string;
  description?: string;
  resource?: {
    uri: string;
    name?: string;
    mimeType?: string;
    description?: string;
    text?: string;
  };
}

export interface ToolResponse {
  content: ResponseContent[];
  isError?: boolean;
}

const BATCH_STATUS_PAGINATION_THRESHOLD_MB = 10;

/**
 * Apply pagination to content
 */
export function applyPagination(
  content: string,
  startIndex: number,
  maxChars: number,
): { processedContent: string; wasTruncated: boolean } {
  let processedContent = content;
  let wasTruncated = false;

  if (startIndex > 0) {
    processedContent = processedContent.slice(startIndex);
  }

  if (processedContent.length > maxChars) {
    processedContent = processedContent.slice(0, maxChars);
    wasTruncated = true;
  }

  return { processedContent, wasTruncated };
}

/**
 * Build response for cached content
 */
export function buildCachedResponse(
  cachedContent: string,
  cachedUri: string,
  cachedName: string,
  cachedMimeType: string | undefined,
  cachedDescription: string | undefined,
  cachedSource: string,
  cachedTimestamp: string,
  resultHandling: string,
  startIndex: number,
  maxChars: number,
): ToolResponse {
  const { processedContent, wasTruncated } = applyPagination(
    cachedContent,
    startIndex,
    maxChars,
  );

  // Format output
  let resultText = processedContent;
  if (wasTruncated) {
    resultText += `\n\n[Content truncated at ${maxChars} characters. Use startIndex parameter to continue reading from character ${startIndex + maxChars}]`;
  }
  resultText += `\n\n---\nServed from cache (originally scraped using: ${cachedSource})\nCached at: ${cachedTimestamp}`;

  // Return based on resultHandling mode
  if (resultHandling === "returnOnly") {
    return {
      content: [
        {
          type: "text",
          text: resultText,
        },
      ],
    };
  } else if (resultHandling === "saveAndReturn") {
    return {
      content: [
        {
          type: "resource",
          resource: {
            uri: cachedUri,
            name: cachedName,
            mimeType: cachedMimeType,
            description: cachedDescription,
            text: processedContent,
          },
        },
      ],
    };
  } else {
    const error = new Error("Invalid state: saveOnly mode should bypass cache");
    logError("buildCachedResponse", error, { resultHandling, cachedUri });
    throw error;
  }
}

/**
 * Build error response with diagnostics
 */
export function buildErrorResponse(
  url: string,
  error: string | undefined,
  diagnostics: ScrapeDiagnostics | undefined,
): ToolResponse {
  let errorMessage = `Failed to scrape ${url}`;

  if (diagnostics) {
    errorMessage += `\n\nDiagnostics:\n`;
    errorMessage += `- Strategies attempted: ${diagnostics.strategiesAttempted.join(", ")}\n`;

    if (Object.keys(diagnostics.strategyErrors).length > 0) {
      errorMessage += `- Strategy errors:\n`;
      for (const [strategy, strategyError] of Object.entries(
        diagnostics.strategyErrors,
      )) {
        errorMessage += `  - ${strategy}: ${strategyError}\n`;
      }
    }

    if (diagnostics.timing && Object.keys(diagnostics.timing).length > 0) {
      errorMessage += `- Timing:\n`;
      for (const [strategy, ms] of Object.entries(diagnostics.timing)) {
        errorMessage += `  - ${strategy}: ${ms}ms\n`;
      }
    }
  } else {
    errorMessage += `: ${error || "All scraping strategies failed"}`;
  }

  return {
    content: [
      {
        type: "text",
        text: errorMessage,
      },
    ],
    isError: true,
  };
}

/**
 * Detect image MIME type from base64 or URL
 */
function detectImageMimeType(
  screenshot: string,
  screenshotFormat?: string,
): string {
  // If format is explicitly provided from metadata
  if (screenshotFormat) {
    return `image/${screenshotFormat}`;
  }

  // Check if it's a URL
  if (screenshot.startsWith("http://") || screenshot.startsWith("https://")) {
    // Try to detect from URL extension
    if (screenshot.endsWith(".jpg") || screenshot.endsWith(".jpeg")) {
      return "image/jpeg";
    }
    if (screenshot.endsWith(".png")) {
      return "image/png";
    }
    if (screenshot.endsWith(".webp")) {
      return "image/webp";
    }
    if (screenshot.endsWith(".gif")) {
      return "image/gif";
    }
    // Default for URLs
    return "image/png";
  }

  // For base64, try to detect from data
  // PNG signature: starts with 'iVBOR'
  if (screenshot.startsWith("iVBOR")) {
    return "image/png";
  }
  // JPEG signature: starts with '/9j/'
  if (screenshot.startsWith("/9j/")) {
    return "image/jpeg";
  }
  // WebP signature: starts with 'UklGR'
  if (screenshot.startsWith("UklGR")) {
    return "image/webp";
  }
  // GIF signature: starts with 'R0lGOD'
  if (screenshot.startsWith("R0lGOD")) {
    return "image/gif";
  }

  // Default to PNG
  return "image/png";
}

/**
 * Build response for successfully scraped content
 */
export function buildSuccessResponse(
  url: string,
  displayContent: string,
  rawContent: string,
  cleanedContent: string | undefined,
  extractedContent: string | undefined,
  extract: string | undefined,
  source: string,
  resultHandling: string,
  startIndex: number,
  maxChars: number,
  savedUris: { raw?: string; cleaned?: string; extracted?: string } | null,
  screenshot?: string,
  screenshotFormat?: string,
): ToolResponse {
  const response: ToolResponse = {
    content: [],
  };

  // Apply pagination only for return options
  let processedContent = displayContent;
  let wasTruncated = false;

  if (resultHandling !== "saveOnly") {
    const paginationResult = applyPagination(
      displayContent,
      startIndex,
      maxChars,
    );
    processedContent = paginationResult.processedContent;
    wasTruncated = paginationResult.wasTruncated;
  }

  // Format output for return options
  let resultText = "";
  if (resultHandling !== "saveOnly") {
    resultText = processedContent;
    if (wasTruncated) {
      resultText += `\n\n[Content truncated at ${maxChars} characters. Use startIndex parameter to continue reading from character ${startIndex + maxChars}]`;
    }
    resultText += `\n\n---\nScraped using: ${source}`;
  }

  // Add text content for returnOnly option
  if (resultHandling === "returnOnly") {
    response.content.push({
      type: "text",
      text: resultText,
    });
  }

  // Add screenshot as image content if available
  if (screenshot) {
    const mimeType = detectImageMimeType(screenshot, screenshotFormat);

    response.content.push({
      type: "image",
      data: screenshot,
      mimeType,
    });
  }

  // Save as a resource for save options
  const shouldSaveResource =
    resultHandling === "saveOnly" || resultHandling === "saveAndReturn";
  if (shouldSaveResource && savedUris) {
    // Use the most processed version
    const primaryUri = extractedContent
      ? savedUris.extracted
      : cleanedContent
        ? savedUris.cleaned
        : savedUris.raw;

    const resourceDescription = extract
      ? `Extracted information from ${url} using query: "${extract}"`
      : `Scraped content from ${url}`;

    // Determine MIME type based on what content we're actually storing/returning
    const contentMimeType =
      extractedContent || cleanedContent
        ? "text/markdown"
        : detectContentType(rawContent);

    if (resultHandling === "saveOnly") {
      response.content.push({
        type: "resource_link",
        uri: primaryUri!,
        name: url,
        mimeType: contentMimeType,
        description: resourceDescription,
      });
    } else if (resultHandling === "saveAndReturn") {
      response.content.push({
        type: "resource",
        resource: {
          uri: primaryUri!,
          name: url,
          mimeType: contentMimeType,
          description: resourceDescription,
          text: displayContent,
        },
      });
    }
  } else if (shouldSaveResource && !savedUris) {
    // Fallback: if saving failed, return content as text for saveAndReturn
    if (resultHandling === "saveAndReturn") {
      response.content.push({
        type: "text",
        text:
          resultText +
          "\n\n[Note: Resource storage failed, returning content as text]",
      });
    } else {
      // For saveOnly, we must return an error if we couldn't save
      response.content.push({
        type: "text",
        text: `Failed to save resource for ${url}. Storage may be unavailable.`,
      });
      response.isError = true;
    }
  }

  return response;
}

/**
 * Build response for batch start command
 */
export function buildBatchStartResponse(
  result: BatchScrapeStartResult,
  requestedCount: number,
): ToolResponse {
  const invalidCount = result.invalidURLs?.length ?? 0;
  const text = `Batch scrape job started.
Job ID: ${result.id}
URLs accepted: ${requestedCount - invalidCount}
Invalid URLs skipped: ${invalidCount}
Status URL: ${result.url ?? "N/A"}`;

  return {
    content: [
      {
        type: "text",
        text,
      },
    ],
  };
}

/**
 * Build response for batch status command
 */
export function buildBatchStatusResponse(
  status: CrawlStatusResult,
): ToolResponse {
  if (status.data && status.data.length > 0) {
    status.data = [];
  }

  const statusLabel =
    status.status.charAt(0).toUpperCase() + status.status.slice(1);

  let text = `Batch Scrape Status: ${statusLabel}
Progress: ${status.completed}/${status.total} pages
Credits used: ${status.creditsUsed}
Expires at: ${status.expiresAt}`;

  if (status.next) {
    text += `\n\n⚠️ Result payload exceeds ${BATCH_STATUS_PAGINATION_THRESHOLD_MB}MB.
Use the pagination URL to fetch the next batch:
${status.next}`;
  }

  return {
    content: [
      {
        type: "text",
        text,
      },
    ],
  };
}

/**
 * Build response for batch cancel command
 */
export function buildBatchCancelResponse(
  result: BatchScrapeCancelResult,
): ToolResponse {
  const message = result.message ?? "Batch job cancelled.";
  return {
    content: [
      {
        type: "text",
        text: `Batch scrape cancelled.\n${message}`,
      },
    ],
  };
}

/**
 * Build response for batch errors command
 */
export function buildBatchErrorsResponse(
  result: CrawlErrorsResult,
): ToolResponse {
  if (result.errors.length > 5) {
    result.errors = result.errors.slice(0, 5);
  }

  const errorsText = result.errors.length
    ? result.errors
        .map((err) => `• ${err.error}${err.url ? ` (${err.url})` : ""}`)
        .join("\n")
    : "No batch errors recorded.";

  const robotsText = result.robotsBlocked.length
    ? result.robotsBlocked.map((url) => `- ${url}`).join("\n")
    : "None";

  return {
    content: [
      {
        type: "text",
        text: `Batch Scrape Errors:\n${errorsText}\n\nRobots-blocked URLs:\n${robotsText}`,
      },
    ],
  };
}

/**
 * Build response for batch command errors
 */
export function buildBatchCommandError(message: string): ToolResponse {
  return {
    content: [
      {
        type: "text",
        text: message,
      },
    ],
    isError: true,
  };
}

/**
 * Build MCP response from webhook scrape response
 *
 * Converts webhook service response to MCP CallToolResult format.
 * Handles all command types: start (single/batch), status, cancel, errors.
 *
 * @param webhookResponse - Response from webhook /api/v2/scrape endpoint
 * @param maxChars - Maximum characters for pagination
 * @param startIndex - Starting index for pagination
 * @returns MCP tool response
 */
export function buildWebhookResponse(
  webhookResponse: {
    success: boolean;
    command: string;
    data?:
      | {
          // ScrapeData (single URL)
          url?: string;
          content?: string;
          contentType?: string;
          source?: string;
          cached?: boolean;
          cacheAge?: number;
          timestamp?: string;
          savedUris?: {
            raw?: string;
            cleaned?: string;
            extracted?: string;
          };
          metadata?: {
            rawLength?: number;
            cleanedLength?: number;
            extractedLength?: number;
            wasTruncated?: boolean;
          };
          screenshot?: string;
          screenshotFormat?: string;
          message?: string;
        }
      | {
          // BatchData (batch operations)
          jobId?: string;
          status?: string;
          total?: number;
          completed?: number;
          creditsUsed?: number;
          expiresAt?: string;
          urls?: number;
          message?: string;
        }
      | {
          // BatchErrorsData (errors command)
          jobId?: string;
          errors?: Array<{
            url: string;
            error: string;
            timestamp: string;
          }>;
          message?: string;
        };
    error?: {
      message: string;
      code?: string;
      url?: string;
      diagnostics?: Record<string, unknown>;
    };
  },
  maxChars: number,
  startIndex: number,
): ToolResponse {
  // Handle errors
  if (!webhookResponse.success || webhookResponse.error) {
    return {
      content: [
        {
          type: "text",
          text: webhookResponse.error?.message || "Unknown error",
        },
      ],
      isError: true,
    };
  }

  const data = webhookResponse.data;
  if (!data) {
    return {
      content: [
        {
          type: "text",
          text: "No data in response",
        },
      ],
      isError: true,
    };
  }

  // Handle batch operations (status, cancel, start batch)
  if ("jobId" in data && data.jobId) {
    // Batch errors command
    if ("errors" in data && data.errors) {
      const errors = data.errors.slice(0, 5); // Limit to 5 errors
      const errorsText = errors.length
        ? errors.map((err) => `• ${err.error} (${err.url})`).join("\n")
        : "No batch errors recorded.";

      return {
        content: [
          {
            type: "text",
            text: `Batch Scrape Errors:\n${errorsText}`,
          },
        ],
      };
    }

    // Batch status or cancel
    return {
      content: [
        {
          type: "text",
          text: data.message || "Batch operation completed",
        },
      ],
    };
  }

  // Handle single URL scrape
  if ("content" in data || "savedUris" in data) {
    let content = data.content || "";

    // Apply pagination
    const { processedContent, wasTruncated } = applyPagination(
      content,
      startIndex,
      maxChars,
    );

    let resultText = processedContent;

    // Add truncation notice
    if (wasTruncated) {
      resultText += `\n\n[Content truncated at ${maxChars} characters. Use startIndex parameter to continue reading from character ${startIndex + maxChars}]`;
    }

    // Add cache/source info
    if (data.cached) {
      const cacheAge = data.cacheAge
        ? ` (${Math.floor(data.cacheAge / 1000)}s old)`
        : "";
      resultText += `\n\n---\nServed from cache${cacheAge}`;
    } else {
      resultText += `\n\n---\nSource: ${data.source || "firecrawl"}`;
    }

    // Handle savedUris (saveOnly or saveAndReturn modes)
    if (data.savedUris && (data.savedUris.raw || data.savedUris.cleaned || data.savedUris.extracted)) {
      const uri =
        data.savedUris.extracted ||
        data.savedUris.cleaned ||
        data.savedUris.raw ||
        "";
      const mimeType = data.contentType || "text/markdown";

      // saveOnly mode - link only
      if (data.message?.includes("saved")) {
        return {
          content: [
            {
              type: "text",
              text: `Content saved to cache.\n\nResource URI: ${uri}`,
            },
          ],
        };
      }

      // saveAndReturn mode - embedded resource
      return {
        content: [
          {
            type: "resource",
            resource: {
              uri,
              name: data.url || "scraped content",
              mimeType,
              text: processedContent,
            },
          },
          {
            type: "text",
            text: resultText,
          },
        ],
      };
    }

    // returnOnly mode - plain text
    return {
      content: [
        {
          type: "text",
          text: resultText,
        },
      ],
    };
  }

  // Fallback for unknown response structure
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}
