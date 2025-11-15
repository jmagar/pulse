import type { IScrapingClients } from "../../server.js";
import { extractOptionsSchema, buildExtractInputSchema } from "./schema.js";
import { extractPipeline } from "./pipeline.js";
import { formatExtractResponse } from "./response.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

export function createExtractTool(clients: IScrapingClients): Tool {
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

        // Get extract client from injected clients
        const extractClient = clients.firecrawl;
        if (!extractClient || typeof extractClient.extract !== "function") {
          throw new Error("Extract operation not supported by Firecrawl client");
        }

        const result = await extractPipeline(extractClient, validatedArgs);
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
