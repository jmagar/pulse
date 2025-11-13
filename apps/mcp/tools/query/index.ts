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
      "Search indexed documentation (hybrid / semantic / keyword) via the webhook service." +
      " Returns a plain-text summary listing the top five results and instructions for paginating with the offset argument.",
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
