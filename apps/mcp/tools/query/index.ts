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
      " Returns a plain-text summary listing the top ten results and instructions for paginating with the offset argument. Each result includes an ID for full document retrieval.",
    inputSchema: buildQueryInputSchema(),

    handler: async (args: unknown) => {
      const startTime = Date.now();
      try {
        const validatedArgs = queryOptionsSchema.parse(args);
        console.log("Query execution started", {
          query: validatedArgs.query,
          mode: validatedArgs.mode,
          limit: validatedArgs.limit,
          offset: validatedArgs.offset ?? 0,
          filters: validatedArgs.filters,
        });
        const response = await client.query(validatedArgs);
        const duration = Date.now() - startTime;
        console.log("Query execution completed", {
          query: validatedArgs.query,
          results: response.results.length,
          total: response.total,
          duration_ms: duration,
        });
        return formatQueryResponse(response, validatedArgs.query);
      } catch (error) {
        const duration = Date.now() - startTime;
        console.error("Query execution failed", {
          error: error instanceof Error ? error.message : String(error),
          duration_ms: duration,
        });
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
