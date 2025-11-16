import type { IFirecrawlClient } from "../../server.js";
import { extractOptionsSchema, buildExtractInputSchema } from "./schema.js";
import { extractPipeline } from "./pipeline.js";
import { formatExtractResponse } from "./response.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

export function createExtractTool(firecrawlClient: IFirecrawlClient): Tool {
  return {
    name: "extract",
    description:
      "Extract structured data from web pages using Firecrawl. " +
      "Provide a natural language prompt describing what to extract, or a JSON schema for the desired structure. " +
      "Supports extraction from multiple URLs in a single request.",
    inputSchema: buildExtractInputSchema(),

    handler: async (args: unknown) => {
      try {
        const validatedArgs = extractOptionsSchema.parse(args);

        // Verify extract capability
        if (!firecrawlClient || typeof firecrawlClient.extract !== "function") {
          throw new Error("Extract operation not supported by Firecrawl client");
        }

        const result = await extractPipeline(firecrawlClient as { extract: NonNullable<typeof firecrawlClient.extract> }, validatedArgs);
        return formatExtractResponse(result, validatedArgs.urls);
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Extract error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  };
}
