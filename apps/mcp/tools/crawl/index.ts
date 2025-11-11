import { FirecrawlCrawlClient } from "@firecrawl/client";
import type { FirecrawlConfig } from "../../types.js";
import { crawlOptionsSchema, buildCrawlInputSchema } from "./schema.js";
import { crawlPipeline } from "./pipeline.js";
import { formatCrawlResponse } from "./response.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

export function createCrawlTool(config: FirecrawlConfig): Tool {
  const client = new FirecrawlCrawlClient(config);

  return {
    name: "crawl",
    description:
      "Manage website crawling jobs. Start a crawl with url parameter, check status with jobId, or cancel with jobId + cancel=true.",
    inputSchema: buildCrawlInputSchema(),

    handler: async (args: unknown) => {
      try {
        const validatedArgs = crawlOptionsSchema.parse(args);
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
