import type { ExtractResult } from "./pipeline.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

/**
 * Format extract result for MCP response
 */
export function formatExtractResponse(
  result: ExtractResult,
  urls: string[],
): CallToolResult {
  // Check for error field first
  if (result.error) {
    return {
      content: [
        {
          type: "text",
          text: `Extract failed: ${result.error}`,
        },
      ],
      isError: true,
    };
  }

  // Then check for success and data
  if (!result.success || !result.data) {
    return {
      content: [
        {
          type: "text",
          text: `Extract failed: No data extracted`,
        },
      ],
      isError: true,
    };
  }

  // Format extracted data as JSON
  const formattedData = JSON.stringify(result.data, null, 2);

  return {
    content: [
      {
        type: "text",
        text: `# Extracted Data from ${urls.length} URL(s)\n\n\`\`\`json\n${formattedData}\n\`\`\`\n\n**Extracted:** ${result.data.length} items`,
      },
    ],
  };
}
