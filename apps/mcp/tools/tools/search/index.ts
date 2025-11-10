import { FirecrawlSearchClient } from '@firecrawl/client';
import type { FirecrawlConfig } from '../../../types.js';
import { searchOptionsSchema, buildSearchInputSchema } from './schema.js';
import { searchPipeline } from './pipeline.js';
import { formatSearchResponse } from './response.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export function createSearchTool(config: FirecrawlConfig): Tool {
  const client = new FirecrawlSearchClient(config);

  return {
    name: 'search',
    description:
      'Search the web using Firecrawl with optional content scraping. Supports web, image, and news search with filtering by category (GitHub, research papers, PDFs).',
    inputSchema: buildSearchInputSchema(),

    handler: async (args: unknown) => {
      try {
        const validatedArgs = searchOptionsSchema.parse(args);
        const result = await searchPipeline(client, validatedArgs);
        return formatSearchResponse(result, validatedArgs.query);
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Search error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  };
}
