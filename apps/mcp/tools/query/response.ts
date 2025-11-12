import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

interface SearchResult {
  url: string;
  title: string | null;
  description: string | null;
  text: string;
  score: number;
  metadata: Record<string, unknown>;
}

interface SearchResponse {
  results: SearchResult[];
  total: number;
  query: string;
  mode: string;
}

/**
 * Format query response as MCP embedded resources
 */
export function formatQueryResponse(
  response: SearchResponse,
  query: string,
): CallToolResult {
  if (response.results.length === 0) {
    return {
      content: [
        {
          type: "text",
          text: `No results found for query: "${query}"`,
        },
      ],
    };
  }

  // Format each result as an embedded resource
  const content = response.results.map((result, index) => {
    // Generate URI based on URL, timestamp, and index for uniqueness
    const uri = `scraped://${new URL(result.url).hostname}/${Date.now()}-${index}`;

    // Build formatted text with metadata
    const lines = [
      `# ${result.title || "Untitled"}`,
      "",
      `**URL:** ${result.url}`,
      `**Score:** ${result.score.toFixed(2)}`,
      "",
    ];

    if (result.description) {
      lines.push(`**Description:** ${result.description}`, "");
    }

    // Add metadata fields
    const metadata = result.metadata;
    if (metadata.domain) {
      lines.push(`**Domain:** ${metadata.domain}`);
    }
    if (metadata.language) {
      lines.push(`**Language:** ${metadata.language}`);
    }
    if (metadata.country) {
      lines.push(`**Country:** ${metadata.country}`);
    }

    lines.push("", "---", "", result.text);

    return {
      type: "resource" as const,
      resource: {
        uri,
        name: result.url,
        mimeType: "text/markdown",
        text: lines.join("\n"),
      },
    };
  });

  return { content };
}
