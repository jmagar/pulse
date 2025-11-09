/**
 * @fileoverview MCP tool and resource registration
 *
 * This module provides functions to register MCP tools and resources
 * with an MCP server instance. It handles the wiring between the
 * shared business logic and the MCP protocol by setting up request
 * handlers for tool execution and resource access.
 *
 * @module shared/mcp/registration
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { ClientFactory, StrategyConfigFactory } from '../server.js';
import { scrapeTool } from './tools/scrape/index.js';
import { createSearchTool } from './tools/search/index.js';
import { createMapTool } from './tools/map/index.js';
import { createCrawlTool } from './tools/crawl/index.js';
import { ResourceStorageFactory } from '../storage/index.js';
import type { FirecrawlConfig } from '../types.js';
import { logInfo, logError } from '../utils/logging.js';
import { registrationTracker } from '../utils/mcp-status.js';
import { getMetricsCollector } from '../monitoring/index.js';

/**
 * Register MCP tools with the server
 *
 * Sets up request handlers for tool listing and execution. Creates tool
 * instances with their dependencies and registers them with the MCP server
 * to handle ListTools and CallTool requests.
 *
 * @param server - MCP server instance to register tools with
 * @param clientFactory - Factory function for creating scraping clients
 * @param strategyConfigFactory - Factory for loading/saving learned strategies
 *
 * @example
 * ```typescript
 * const server = new Server({ name: 'pulse', version: '1.0.0' }, {});
 * registerTools(server, () => createClients(), strategyFactory);
 * // Server now handles tool requests
 * ```
 */
export function registerTools(
  server: Server,
  clientFactory: ClientFactory,
  strategyConfigFactory: StrategyConfigFactory
): void {
  // Create Firecrawl config from environment
  const firecrawlConfig: FirecrawlConfig = {
    apiKey: process.env.FIRECRAWL_API_KEY || '',
    baseUrl: process.env.FIRECRAWL_BASE_URL || 'https://api.firecrawl.dev',
  };

  // Create tool instances with tracking
  // Each tool is wrapped in a factory to enable error handling during registration
  const toolConfigs = [
    { name: 'scrape', factory: () => scrapeTool(server, clientFactory, strategyConfigFactory) },
    { name: 'search', factory: () => createSearchTool(firecrawlConfig) },
    { name: 'map', factory: () => createMapTool(firecrawlConfig) },
    { name: 'crawl', factory: () => createCrawlTool(firecrawlConfig) },
  ];

  const tools: any[] = [];

  // Register each tool, tracking success/failure
  // Continue registration even if individual tools fail
  for (const { name, factory } of toolConfigs) {
    try {
      const tool = factory();
      tools.push(tool);

      // Record successful registration
      registrationTracker.recordRegistration({
        name: tool.name,
        type: 'tool',
        success: true,
      });
    } catch (error) {
      // Record failed registration but continue with other tools
      registrationTracker.recordRegistration({
        name,
        type: 'tool',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      logError('tool-registration', error, { tool: name });
    }
  }

  // Log tool schemas for debugging (only in development or when DEBUG env var is set)
  if (process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development') {
    console.error('[pulse] Registered tools:');
    tools.forEach((tool, index) => {
      console.error(`[pulse]   ${index + 1}. ${tool.name}`);
      console.error(`[pulse]      Schema type: ${tool.inputSchema.type || 'unknown'}`);

      // Check for problematic top-level schema properties
      const hasProblematicProps = [
        'oneOf' in tool.inputSchema,
        'allOf' in tool.inputSchema,
        'anyOf' in tool.inputSchema,
      ];

      if (hasProblematicProps.some(Boolean)) {
        console.error(
          `[pulse]      ⚠️ WARNING: Schema contains oneOf/allOf/anyOf at root level`
        );
        console.error(
          `[pulse]         This may cause issues with some AI providers (like Anthropic)`
        );
      }
    });
  }

  // Register tool definitions
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    })),
  }));

  // Register tool handlers
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const startTime = Date.now();
    const metrics = getMetricsCollector();

    logInfo('tool-call', `Calling tool: ${name}`, { tool: name });

    try {
      const tool = tools.find((t) => t.name === name);
      if (!tool) {
        throw new Error(`Unknown tool: ${name}`);
      }

      // Cast to any to satisfy MCP SDK type expectations
      // The ToolResponse interface matches the CallToolResult schema
      const result = (await (tool.handler as any)(args)) as any;

      const duration = Date.now() - startTime;
      metrics.recordRequest(duration, false);
      logInfo('tool-call', `Tool completed: ${name}`, { tool: name, duration: `${duration}ms` });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      metrics.recordRequest(duration, true);
      logError('tool-call', error, { tool: name, duration: `${duration}ms` });
      throw error;
    }
  });
}

/**
 * Register MCP resources with the server
 *
 * Sets up request handlers for resource listing and reading. Integrates
 * with the resource storage system to expose scraped content as MCP
 * resources that can be accessed via ListResources and ReadResource requests.
 *
 * @param server - MCP server instance to register resources with
 *
 * @example
 * ```typescript
 * const server = new Server({ name: 'pulse', version: '1.0.0' }, {});
 * registerResources(server);
 * // Server now handles resource requests
 * ```
 */
export function registerResources(server: Server): void {
  try {
    // Set up resource handlers with error tracking
    server.setRequestHandler(ListResourcesRequestSchema, async () => {
      logInfo('resources/list', 'Listing resources');

      const storage = await ResourceStorageFactory.create();
      const resources = await storage.list();

      logInfo('resources/list', `Found ${resources.length} resources`, { count: resources.length });

      return {
        resources: resources.map((resource) => ({
          uri: resource.uri,
          name: resource.name,
          mimeType: resource.mimeType,
          description: resource.description,
        })),
      };
    });

    server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;

      logInfo('resources/read', `Reading resource: ${uri}`, { uri });

      try {
        const storage = await ResourceStorageFactory.create();
        const resource = await storage.read(uri);

        logInfo('resources/read', `Resource read successfully: ${uri}`, { uri });

        return {
          contents: [
            {
              uri: resource.uri,
              mimeType: resource.mimeType,
              text: resource.text,
            },
          ],
        };
      } catch (error) {
        logError('resources/read', error, { uri });
        throw error;
      }
    });

    // Record successful resource registration
    registrationTracker.recordRegistration({
      name: 'Resource Handlers',
      type: 'resource',
      success: true,
    });
  } catch (error) {
    // Record failed resource registration
    registrationTracker.recordRegistration({
      name: 'Resource Handlers',
      type: 'resource',
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    logError('resource-registration', error);
    throw error;
  }
}
