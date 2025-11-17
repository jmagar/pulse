import type { CrawlClient } from "../../types.js";
import { crawlOptionsSchema, buildCrawlInputSchema } from "./schema.js";
import { crawlPipeline } from "./pipeline.js";
import { formatCrawlResponse } from "./response.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { RateLimiter } from "../../server/middleware/rateLimit.js";

const crawlRateLimiter = new RateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Max 10 crawl jobs per 15 min
});

// Add cleanup on process exit
process.on("SIGTERM", () => {
  crawlRateLimiter.destroy();
});

process.on("SIGINT", () => {
  crawlRateLimiter.destroy();
});

export function createCrawlTool(client: CrawlClient): Tool {
  return {
    name: "crawl",
    description:
      "Manage website crawling jobs. Commands: crawl <url>, crawl status <jobId>, crawl cancel <jobId>, crawl errors <jobId>, crawl list.",
    inputSchema: buildCrawlInputSchema(),

    handler: async (args: unknown) => {
      try {
        const validatedArgs = crawlOptionsSchema.parse(args);

        // Rate limit on start command
        if (validatedArgs.command === "start") {
          const userId = "default"; // TODO: Extract from session/auth context
          if (!crawlRateLimiter.check(userId)) {
            return {
              content: [
                {
                  type: "text",
                  text: "Rate limit exceeded: Maximum 10 crawl jobs per 15 minutes. Please try again later.",
                },
              ],
              isError: true,
            };
          }
        }

        const result = await crawlPipeline(client, validatedArgs);
        return formatCrawlResponse(result);
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Crawl error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  };
}
