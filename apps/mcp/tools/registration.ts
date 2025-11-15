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

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import type { ClientFactory, StrategyConfigFactory } from "../server.js";
import { scrapeTool } from "./scrape/index.js";
import { createSearchTool } from "./search/index.js";
import { createMapTool } from "./map/index.js";
import { createCrawlTool } from "./crawl/index.js";
import { createQueryTool } from "./query/index.js";
import { createProfileTool } from "./profile/index.js";
import { ResourceStorageFactory } from "../storage/index.js";
import type { FirecrawlConfig } from "../types.js";
import { logInfo, logError } from "../utils/logging.js";
import { registrationTracker } from "../utils/mcp-status.js";
import { getMetricsCollector } from "../monitoring/index.js";
import { env, getEnvSnapshot } from "../config/environment.js";
import { SELF_HOSTED_NO_AUTH } from "@firecrawl/client";
import { DockerLogsProvider } from "../resources/docker-logs.js";

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
  strategyConfigFactory: StrategyConfigFactory,
): void {
  const currentEnv = getEnvSnapshot();
  // Create Firecrawl config from centralized environment
  const firecrawlConfig: FirecrawlConfig = {
    apiKey: currentEnv.firecrawlApiKey || SELF_HOSTED_NO_AUTH,
    baseUrl: currentEnv.firecrawlBaseUrl || "http://firecrawl:3002",
  };

  // Create clients for tools that use the factory pattern
  const clients = clientFactory();

  // Create tool instances with tracking
  // Each tool is wrapped in a factory to enable error handling during registration
  const toolConfigs = [
    {
      name: "scrape",
      factory: () => scrapeTool(server, clientFactory, strategyConfigFactory),
    },
    { name: "search", factory: () => createSearchTool(firecrawlConfig) },
    { name: "map", factory: () => createMapTool(clients) },
    { name: "crawl", factory: () => createCrawlTool(firecrawlConfig) },
    {
      name: "query",
      factory: () => {
        if (!currentEnv.webhookBaseUrl) {
          throw new Error("WEBHOOK_BASE_URL is required for the query tool");
        }
        if (!currentEnv.webhookApiSecret) {
          throw new Error(
            "WEBHOOK_API_SECRET is required for the query tool",
          );
        }

        return createQueryTool({
          baseUrl: currentEnv.webhookBaseUrl,
          apiSecret: currentEnv.webhookApiSecret,
        });
      },
    },
    {
      name: "profile_crawl",
      factory: () => {
        if (!currentEnv.webhookBaseUrl) {
          throw new Error("WEBHOOK_BASE_URL is required for the profile_crawl tool");
        }
        if (!currentEnv.webhookApiSecret) {
          throw new Error(
            "WEBHOOK_API_SECRET is required for the profile_crawl tool",
          );
        }

        return createProfileTool({
          baseUrl: currentEnv.webhookBaseUrl,
          apiSecret: currentEnv.webhookApiSecret,
        });
      },
    },
  ];

  const tools: Tool[] = [];

  // Register each tool, tracking success/failure
  // Continue registration even if individual tools fail
  for (const { name, factory } of toolConfigs) {
    try {
      const tool = factory();
      tools.push(tool);

      // Record successful registration
      registrationTracker.recordRegistration({
        name: tool.name,
        type: "tool",
        success: true,
      });
    } catch (error) {
      // Record failed registration but continue with other tools
      registrationTracker.recordRegistration({
        name,
        type: "tool",
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });

      logError("tool-registration", error, { tool: name });
    }
  }

  // Log tool schemas for debugging (only in development or when DEBUG env var is set)
  if (process.env.DEBUG === "true" || process.env.NODE_ENV === "development") {
    console.error("[pulse] Registered tools:");
    tools.forEach((tool, index) => {
      console.error(`[pulse]   ${index + 1}. ${tool.name}`);
      console.error(
        `[pulse]      Schema type: ${tool.inputSchema.type || "unknown"}`,
      );

      // Check for problematic top-level schema properties
      const hasProblematicProps = [
        "oneOf" in tool.inputSchema,
        "allOf" in tool.inputSchema,
        "anyOf" in tool.inputSchema,
      ];

      if (hasProblematicProps.some(Boolean)) {
        console.error(
          `[pulse]      ⚠️ WARNING: Schema contains oneOf/allOf/anyOf at root level`,
        );
        console.error(
          `[pulse]         This may cause issues with some AI providers (like Anthropic)`,
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

    logInfo("tool-call", `Calling tool: ${name}`, { tool: name });

    try {
      const tool = tools.find((t) => t.name === name);
      if (!tool) {
        throw new Error(`Unknown tool: ${name}`);
      }

      const handler = tool.handler as unknown as (
        arguments_: unknown,
      ) => Promise<CallToolResult>;
      const result = await handler(args);

      const duration = Date.now() - startTime;
      metrics.recordRequest(duration, false);
      logInfo("tool-call", `Tool completed: ${name}`, {
        tool: name,
        duration: `${duration}ms`,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      metrics.recordRequest(duration, true);
      logError("tool-call", error, { tool: name, duration: `${duration}ms` });
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
    // Initialize Docker logs provider if configured
    const currentEnv = getEnvSnapshot();
    let dockerLogsProvider: DockerLogsProvider | undefined;

    if (currentEnv.dockerComposePath && currentEnv.dockerProjectName) {
      // Define services to expose logs for (local docker-compose stack)
      const services = [
        { name: "firecrawl", description: "Firecrawl API service logs" },
        { name: "pulse_mcp", description: "MCP server logs" },
        { name: "pulse_webhook", description: "Webhook bridge service logs" },
        {
          name: "pulse_webhook-worker",
          description: "Webhook worker process logs",
        },
        { name: "pulse_postgres", description: "PostgreSQL database logs" },
        { name: "pulse_redis", description: "Redis cache logs" },
        { name: "pulse_playwright", description: "Playwright browser logs" },
        {
          name: "pulse_change-detection",
          description: "Change detection service logs",
        },
        { name: "pulse_neo4j", description: "Neo4j graph database logs" },
      ];

      // Add external services from remote Docker contexts (if configured)
      // Example: GPU services on remote host
      let externalServices: Array<{ name: string; description: string; context?: string }> = [];
      if (currentEnv.dockerExternalServices) {
        try {
          externalServices = JSON.parse(currentEnv.dockerExternalServices);
        } catch (error) {
          logError("json-parse", error, {
            context: "registration",
            variable: "dockerExternalServices",
          });
          // Continue with empty array - don't fail registration
        }
      }
      services.push(...externalServices);

      dockerLogsProvider = new DockerLogsProvider({
        composePath: currentEnv.dockerComposePath,
        projectName: currentEnv.dockerProjectName,
        services,
      });

      logInfo("docker-logs", "Docker logs provider initialized", {
        composePath: currentEnv.dockerComposePath,
        projectName: currentEnv.dockerProjectName,
        serviceCount: services.length,
      });
    }

    // Set up resource handlers with error tracking
    server.setRequestHandler(ListResourcesRequestSchema, async () => {
      logInfo("resources/list", "Listing resources");

      const storage = await ResourceStorageFactory.create();
      const resources = await storage.list();

      // Add Docker logs resources if provider is configured
      const dockerResources = dockerLogsProvider
        ? dockerLogsProvider.list()
        : [];

      const allResources = [...resources, ...dockerResources];

      logInfo(
        "resources/list",
        `Found ${allResources.length} resources (${resources.length} storage, ${dockerResources.length} docker)`,
        {
          storageCount: resources.length,
          dockerCount: dockerResources.length,
          total: allResources.length,
        },
      );

      return {
        resources: allResources.map((resource) => ({
          uri: resource.uri,
          name: resource.name,
          mimeType: resource.mimeType,
          description: resource.description,
        })),
      };
    });

    server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;

      logInfo("resources/read", `Reading resource: ${uri}`, { uri });

      try {
        // Check if this is a Docker logs resource
        if (
          dockerLogsProvider &&
          DockerLogsProvider.isDockerLogsUri(uri)
        ) {
          const resource = await dockerLogsProvider.read(uri);

          logInfo("resources/read", `Docker logs read successfully: ${uri}`, {
            uri,
          });

          return {
            contents: [
              {
                uri: resource.uri,
                mimeType: resource.mimeType,
                text: resource.text,
              },
            ],
          };
        }

        // Otherwise, read from storage
        const storage = await ResourceStorageFactory.create();
        const resource = await storage.read(uri);

        logInfo("resources/read", `Resource read successfully: ${uri}`, {
          uri,
        });

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
        logError("resources/read", error, { uri });
        throw error;
      }
    });

    // Record successful resource registration
    registrationTracker.recordRegistration({
      name: "Resource Handlers",
      type: "resource",
      success: true,
    });
  } catch (error) {
    // Record failed resource registration
    registrationTracker.recordRegistration({
      name: "Resource Handlers",
      type: "resource",
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });

    logError("resource-registration", error);
    throw error;
  }
}
