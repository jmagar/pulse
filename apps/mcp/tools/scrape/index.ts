/**
 * @fileoverview Main scrape tool registration for MCP server
 *
 * This module exports the scrape tool definition including its name,
 * description, input schema, and request handler. The tool is a thin
 * wrapper that delegates all scraping operations to the webhook service.
 *
 * @module shared/mcp/tools/scrape
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { buildInputSchema } from "./schema.js";
import { handleScrapeRequest } from "./handler.js";

/**
 * Create scrape tool definition for MCP server registration
 *
 * Builds a complete MCP tool definition with handler, schema, and documentation.
 * The tool delegates to the webhook service for all scraping operations including
 * caching, cleaning, extraction, and storage.
 *
 * @param _server - MCP server instance (unused, kept for interface consistency)
 * @returns MCP tool definition object with name, description, schema, and handler
 *
 * @example
 * ```typescript
 * const tool = scrapeTool(server);
 * // Register with MCP server
 * server.setRequestHandler(ListToolsRequestSchema, async () => ({
 *   tools: [tool]
 * }));
 * ```
 */
export function scrapeTool(_server: Server) {
  return {
    name: "scrape",
    description: `Scrape webpage content using intelligent automatic strategy selection with built-in caching. This tool fetches content from any URL with flexible result handling options and now supports Firecrawl batch scraping commands.

Command overview:
- "scrape <url>" — default start command. Provide a single URL for direct scraping (returns cached resources when available).
- "scrape <url1> <url2> ..." — when multiple URLs are supplied, the tool automatically launches a Firecrawl batch scrape and returns the job ID for later polling.
- "scrape status <jobId>" — prints the latest progress for a batch job (plain-text summary, includes pagination hints when the dataset exceeds 10MB).
- "scrape cancel <jobId>" — cancels a running batch scrape.
- "scrape errors <jobId>" — lists error entries and robots.txt blocks for the batch job.

All command-style responses are formatted as plain text for easy use inside CLI workflows, mirroring the crawl tool behavior.

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
      return await handleScrapeRequest(args);
    },
  };
}
