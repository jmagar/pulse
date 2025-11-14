import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { ProfileClient, type ProfileConfig } from "./client.js";
import { profileOptionsSchema, buildProfileInputSchema } from "./schema.js";
import { formatProfileResponse, formatErrorResponse } from "./response.js";

/**
 * Create profile_crawl tool for debugging crawl performance
 */
export function createProfileTool(config: ProfileConfig): Tool {
  const client = new ProfileClient(config);

  return {
    name: "profile_crawl",
    description:
      "debug and profile crawl performance by querying lifecycle metrics. " +
      "Returns comprehensive diagnostics including performance breakdowns, error analysis, " +
      "and optimization insights. Use this after triggering a crawl to understand bottlenecks, " +
      "investigate failures, or monitor progress.",
    inputSchema: buildProfileInputSchema(),

    handler: async (args: unknown) => {
      try {
        const validatedArgs = profileOptionsSchema.parse(args);
        const metrics = await client.getMetrics(
          validatedArgs.crawl_id,
          validatedArgs.include_details
        );
        return formatProfileResponse(metrics, validatedArgs);
      } catch (error) {
        return formatErrorResponse(
          error instanceof Error ? error : new Error(String(error))
        );
      }
    },
  };
}

// Re-export types for consumers
export type { ProfileConfig };
export type { ProfileOptions } from "./schema.js";
export type { CrawlMetricsResponse } from "./types.js";
