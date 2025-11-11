import { FirecrawlMapClient } from "@firecrawl/client";
import type { FirecrawlConfig } from "../../types.js";
import { mapOptionsSchema, buildMapInputSchema } from "./schema.js";
import { mapPipeline } from "./pipeline.js";
import { formatMapResponse } from "./response.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

export function createMapTool(config: FirecrawlConfig): Tool {
  const client = new FirecrawlMapClient(config);

  return {
    name: "map",
    description:
      "Discover URLs from a website using Firecrawl. Fast URL discovery (8x faster than crawl) with optional search filtering, sitemap integration, and subdomain handling. " +
      "Supports pagination for large result sets. Use startIndex and maxResults to retrieve results in chunks. " +
      'Default returns 200 URLs per request (≈13k tokens, under 15k token budget). Set resultHandling to "saveOnly" for token-efficient responses.',
    inputSchema: buildMapInputSchema(),

    handler: async (args: unknown) => {
      try {
        const validatedArgs = mapOptionsSchema.parse(args);
        const result = await mapPipeline(client, validatedArgs);
        return formatMapResponse(
          result,
          validatedArgs.url,
          validatedArgs.startIndex,
          validatedArgs.maxResults,
          validatedArgs.resultHandling,
        );
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Map error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  };
}
