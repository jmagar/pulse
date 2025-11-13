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
  offset: number;
}

const MAX_INLINE_RESULTS = 5;
const SNIPPET_LENGTH = 220;

const truncate = (value: string, max = SNIPPET_LENGTH) =>
  value.length <= max ? value : `${value.slice(0, max - 1)}…`;

const formatResult = (result: SearchResult, index: number) => {
  const lines = [
    `${index + 1}. ${result.title ?? "Untitled"}`,
    `   URL: ${result.url}`,
  ];

  if (result.description) {
    lines.push(`   Description: ${truncate(result.description, 160)}`);
  }

  const snippet = truncate(result.text.replace(/\s+/g, " ").trim());
  lines.push(`   Snippet: ${snippet}`);

  const metadataParts: string[] = [];
  if (result.metadata.domain) metadataParts.push(`Domain=${result.metadata.domain}`);
  if (result.metadata.language) metadataParts.push(`Lang=${result.metadata.language}`);
  if (result.metadata.country) metadataParts.push(`Country=${result.metadata.country}`);
  metadataParts.push(`Score=${result.score.toFixed(2)}`);

  lines.push(`   Meta: ${metadataParts.join(" | ")}`);

  return lines.join("\n");
};

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

  const shownResults = response.results.slice(0, MAX_INLINE_RESULTS);
  const lines: string[] = [];

  lines.push(`Query: ${query}`);
  lines.push(`Mode: ${response.mode}`);
  lines.push("");
  const offset = response.offset ?? 0;
  const startIndex = offset + 1;
  const endIndex = offset + shownResults.length;
  lines.push(`Results ${startIndex}-${endIndex} (of ~${response.total})`);
  lines.push("");

  shownResults.forEach((result, index) => {
    lines.push(formatResult(result, index));
    lines.push("");
  });

  if (response.total > shownResults.length + offset) {
    lines.push(
      `Showing ${shownResults.length} of ${response.total} results. ` +
        `Re-run with offset=${offset + shownResults.length} to continue.`,
    );
  }

  return {
    content: [
      {
        type: "text",
        text: lines.join("\n"),
      },
    ],
  };
}
