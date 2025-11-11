/**
 * @fileoverview Main scrape tool registration for MCP server
 *
 * This module exports the scrape tool definition including its name,
 * description, input schema, and request handler. The tool provides
 * intelligent web scraping with automatic strategy selection, caching,
 * and flexible result handling.
 *
 * @module shared/mcp/tools/scrape
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type {
  IScrapingClients,
  StrategyConfigFactory,
} from "../../mcp-server.js";
import { buildInputSchema } from "./schema.js";
import { handleScrapeRequest } from "./handler.js";

/**
 * Create scrape tool definition for MCP server registration
 *
 * Builds a complete MCP tool definition with handler, schema, and documentation.
 * The tool supports multiple result handling modes, automatic caching, and
 * intelligent strategy selection based on URL patterns and available services.
 *
 * @param _server - MCP server instance (unused, kept for interface consistency)
 * @param clientsFactory - Factory function that creates scraping clients
 * @param strategyConfigFactory - Factory for loading/saving learned strategies
 * @returns MCP tool definition object with name, description, schema, and handler
 *
 * @example
 * ```typescript
 * const tool = scrapeTool(
 *   server,
 *   () => createScrapingClients(),
 *   strategyConfigFactory
 * );
 * // Register with MCP server
 * server.setRequestHandler(ListToolsRequestSchema, async () => ({
 *   tools: [tool]
 * }));
 * ```
 */
export function scrapeTool(
  _server: Server,
  clientsFactory: () => IScrapingClients,
  strategyConfigFactory: StrategyConfigFactory,
) {
  return {
    name: "scrape",
    description: `Scrape webpage content using intelligent automatic strategy selection with built-in caching. This tool fetches content from any URL with flexible result handling options.

Result handling modes:
- returnOnly: Returns scraped content without saving (uses maxChars for size limits)
- saveAndReturn: Saves content as MCP Resource AND returns it (default, best for reuse)
- saveOnly: Saves content as MCP Resource, returns only resource link (no content)

Example responses by mode:

returnOnly:
{
  "content": [
    {
      "type": "text",
      "text": "Article content here...\\n\\n---\\nScraped using: native"
    }
  ]
}

saveAndReturn (embedded resource):
{
  "content": [
    {
      "type": "resource",
      "resource": {
        "uri": "scraped://example.com/article_2024-01-15T10:30:00Z",
        "name": "https://example.com/article",
        "text": "Full article content..."
      }
    }
  ]
}

saveOnly (linked resource):
{
  "content": [
    {
      "type": "resource_link",
      "uri": "scraped://example.com/article_2024-01-15T10:30:00Z",
      "name": "https://example.com/article"
    }
  ]
}

Caching behavior:
- Previously scraped URLs are automatically cached as MCP Resources
- Subsequent requests return cached content (unless forceRescrape: true)
- saveOnly mode bypasses cache lookup for efficiency

Scraping strategies:
- native: Direct HTTP fetch (fastest, works for most public sites)
- firecrawl: Advanced scraping with JavaScript rendering (requires FIRECRAWL_API_KEY)

The tool automatically:
1. Checks cache first (except in saveOnly mode)
2. Tries the most appropriate scraping method based on domain patterns
3. Falls back to alternative methods if needed
4. Remembers successful strategies for future requests`,
    inputSchema: buildInputSchema(),
    handler: async (args: unknown) => {
      return await handleScrapeRequest(
        args,
        clientsFactory,
        strategyConfigFactory,
      );
    },
  };
}
