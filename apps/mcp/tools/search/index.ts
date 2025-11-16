import type { IFirecrawlClient } from "../../server.js";
import { searchOptionsSchema, buildSearchInputSchema } from "./schema.js";
import { searchPipeline } from "./pipeline.js";
import { formatSearchResponse } from "./response.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

export function createSearchTool(firecrawlClient: IFirecrawlClient): Tool {
  return {
    name: "search",
    description:
      "Search the web using Firecrawl with optional content scraping. Supports web, image, and news search with filtering by category (GitHub, research papers, PDFs).",
    inputSchema: buildSearchInputSchema(),

    handler: async (args: unknown) => {
      try {
        const validatedArgs = searchOptionsSchema.parse(args);

        // Verify search capability
        if (!firecrawlClient || typeof firecrawlClient.search !== "function") {
          throw new Error("Search operation not supported by Firecrawl client");
        }

        const result = await searchPipeline(
          firecrawlClient as {
            search: NonNullable<typeof firecrawlClient.search>;
          },
          validatedArgs,
        );
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
