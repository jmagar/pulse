import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { QueryClient } from "./client.js";
import { queryOptionsSchema, buildQueryInputSchema } from "./schema.js";
import { formatQueryResponse } from "./response.js";

interface QueryConfig {
  baseUrl: string;
  apiSecret: string;
  timeout?: number;
}

/**
 * Create query tool for searching indexed documentation
 */
export function createQueryTool(config: QueryConfig): Tool {
  const client = new QueryClient(config);

  return {
    name: "query",
    description:
      "Search indexed documentation using hybrid (vector + BM25), semantic (vector only), or keyword (BM25 only) search. " +
      "Queries the webhook service's Qdrant vector store and BM25 index to find relevant documentation chunks. " +
      "Returns results as embedded MCP resources with content, scores, and metadata.",
    inputSchema: buildQueryInputSchema(),

    handler: async (args: unknown) => {
      try {
        const validatedArgs = queryOptionsSchema.parse(args);
        const response = await client.query(validatedArgs);
        return formatQueryResponse(response, validatedArgs.query);
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Query error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  };
}
