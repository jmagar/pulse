import type { IScrapingClients } from "../../server.js";
import { searchOptionsSchema, buildSearchInputSchema } from "./schema.js";
import { searchPipeline } from "./pipeline.js";
import { formatSearchResponse } from "./response.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

export function createSearchTool(clients: IScrapingClients): Tool {
  return {
    name: "search",
    description:
      "Search the web using Firecrawl with optional content scraping. Supports web, image, and news search with filtering by category (GitHub, research papers, PDFs).",
    inputSchema: buildSearchInputSchema(),

    handler: async (args: unknown) => {
      try {
        const validatedArgs = searchOptionsSchema.parse(args);

        // Get search client from injected clients
        const searchClient = clients.firecrawl;
        if (!searchClient || typeof searchClient.search !== "function") {
          throw new Error("Search operation not supported by Firecrawl client");
        }

        const result = await searchPipeline(searchClient as { search: NonNullable<typeof searchClient.search> }, validatedArgs);
        return formatSearchResponse(result, validatedArgs.query);
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Search error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  };
}
