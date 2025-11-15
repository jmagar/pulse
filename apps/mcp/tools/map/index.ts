import type { IScrapingClients } from "../../server.js";
import { mapOptionsSchema, buildMapInputSchema } from "./schema.js";
import { mapPipeline } from "./pipeline.js";
import { formatMapResponse } from "./response.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

export function createMapTool(clients: IScrapingClients): Tool {
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

        // Get map client from injected clients
        const mapClient = clients.firecrawl;
        if (!mapClient || typeof mapClient.map !== "function") {
          throw new Error("Map operation not supported by Firecrawl client");
        }

        const result = await mapPipeline(mapClient as { map: NonNullable<typeof mapClient.map> }, validatedArgs);
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
