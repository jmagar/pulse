import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { registrationTracker } from "../utils/mcp-status.js";
import type { ClientFactory, StrategyConfigFactory } from "../server.js";
import { ResourceStorageFactory } from "../storage/index.js";

// Mock the tool creation functions
vi.mock("./scrape/index.js", () => ({
  scrapeTool: vi.fn(() => ({
    name: "scrape",
    description: "Scrape tool",
    inputSchema: { type: "object" },
    handler: vi.fn(),
  })),
}));

vi.mock("./search/index.js", () => ({
  createSearchTool: vi.fn(() => ({
    name: "search",
    description: "Search tool",
    inputSchema: { type: "object" },
    handler: vi.fn(),
  })),
}));

vi.mock("./map/index.js", () => ({
  createMapTool: vi.fn(() => ({
    name: "map",
    description: "Map tool",
    inputSchema: { type: "object" },
    handler: vi.fn(),
  })),
}));

vi.mock("./crawl/index.js", () => ({
  createCrawlTool: vi.fn(() => ({
    name: "crawl",
    description: "Crawl tool",
    inputSchema: { type: "object" },
    handler: vi.fn(),
  })),
}));

describe("MCP Registration with Tracking", () => {
  let server: Server;
  const originalEnv = process.env;

  beforeEach(async () => {
    // Set up environment for Firecrawl tools
    process.env = {
      ...originalEnv,
      FIRECRAWL_API_KEY: "test-api-key",
      FIRECRAWL_BASE_URL: "https://api.firecrawl.dev",
    };

    server = new Server(
      { name: "test-server", version: "1.0.0" },
      { capabilities: { resources: {}, tools: {} } },
    );
    registrationTracker.clear();
    ResourceStorageFactory.reset();

    // Reset all mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("registerTools()", () => {
    it("should record successful tool registrations", async () => {
      // Import after mocks are set up
      const { registerTools } = await import("./registration.js");

      const mockClientFactory = vi.fn() as unknown as ClientFactory;
      const mockStrategyFactory = vi.fn(() => ({
        loadConfig: vi.fn().mockResolvedValue([]),
        saveConfig: vi.fn().mockResolvedValue(undefined),
        upsertEntry: vi.fn().mockResolvedValue(undefined),
        getStrategyForUrl: vi.fn().mockResolvedValue(null),
      })) as unknown as StrategyConfigFactory;

      registerTools(server, mockClientFactory, mockStrategyFactory);

      const tools = registrationTracker.getToolRegistrations();
      expect(tools.length).toBe(4);
      expect(tools.every((t) => t.success)).toBe(true);
    });

    it("should record all tool names correctly", async () => {
      const { registerTools } = await import("./registration.js");

      const mockClientFactory = vi.fn() as unknown as ClientFactory;
      const mockStrategyFactory = vi.fn(() => ({
        loadConfig: vi.fn().mockResolvedValue([]),
        saveConfig: vi.fn().mockResolvedValue(undefined),
        upsertEntry: vi.fn().mockResolvedValue(undefined),
        getStrategyForUrl: vi.fn().mockResolvedValue(null),
      })) as unknown as StrategyConfigFactory;

      registerTools(server, mockClientFactory, mockStrategyFactory);

      const tools = registrationTracker.getToolRegistrations();
      const toolNames = tools.map((t) => t.name);

      expect(toolNames).toContain("scrape");
      expect(toolNames).toContain("search");
      expect(toolNames).toContain("map");
      expect(toolNames).toContain("crawl");
    });

    it("should continue registration if one tool fails", async () => {
      // Make scrape tool throw an error
      const { scrapeTool } = await import("./scrape/index.js");
      vi.mocked(scrapeTool).mockImplementationOnce(() => {
        throw new Error("Scrape tool failed");
      });

      const { registerTools } = await import("./registration.js");

      const mockClientFactory = vi.fn() as unknown as ClientFactory;
      const mockStrategyFactory = vi.fn(() => ({
        loadConfig: vi.fn().mockResolvedValue([]),
        saveConfig: vi.fn().mockResolvedValue(undefined),
        upsertEntry: vi.fn().mockResolvedValue(undefined),
        getStrategyForUrl: vi.fn().mockResolvedValue(null),
      })) as unknown as StrategyConfigFactory;

      // Should not throw even if one tool fails
      expect(() =>
        registerTools(server, mockClientFactory, mockStrategyFactory),
      ).not.toThrow();

      const tools = registrationTracker.getToolRegistrations();

      // Should have exactly 4 tool registration attempts (scrape, search, map, crawl)
      expect(tools.length).toBe(4);

      // Should have exactly one failure (scrape)
      const failures = tools.filter((t) => !t.success);
      expect(failures.length).toBe(1);
      expect(failures[0].name).toBe("scrape");

      // Should have three successes
      const successes = tools.filter((t) => t.success);
      expect(successes.length).toBe(3);
    });

    it("should record error messages for failed registrations", async () => {
      // Make search tool throw an error
      const { createSearchTool } = await import("./search/index.js");
      vi.mocked(createSearchTool).mockImplementationOnce(() => {
        throw new Error("Test error message");
      });

      const { registerTools } = await import("./registration.js");

      const mockClientFactory = vi.fn() as unknown as ClientFactory;
      const mockStrategyFactory = vi.fn(() => ({
        loadConfig: vi.fn().mockResolvedValue([]),
        saveConfig: vi.fn().mockResolvedValue(undefined),
        upsertEntry: vi.fn().mockResolvedValue(undefined),
        getStrategyForUrl: vi.fn().mockResolvedValue(null),
      })) as unknown as StrategyConfigFactory;

      registerTools(server, mockClientFactory, mockStrategyFactory);

      const tools = registrationTracker.getToolRegistrations();
      const failedTool = tools.find((t) => !t.success);

      expect(failedTool).toBeDefined();
      expect(failedTool?.name).toBe("search");
      expect(failedTool?.error).toBe("Test error message");
    });
  });

  describe("registerResources()", () => {
    it("should record successful resource registration", async () => {
      const { registerResources } = await import("./registration.js");

      registerResources(server);

      const resources = registrationTracker.getResourceRegistrations();
      expect(resources.length).toBe(1);
      expect(resources[0].name).toBe("Resource Handlers");
      expect(resources[0].success).toBe(true);
    });

    it("should record failed resource registration with error message", async () => {
      const { registerResources } = await import("./registration.js");

      // Mock setRequestHandler to throw an error
      const originalSetRequestHandler = server.setRequestHandler.bind(server);
      let callCount = 0;
      server.setRequestHandler = vi.fn((schema, handler) => {
        callCount++;
        if (callCount === 1) {
          // Fail on first call (ListResources)
          throw new Error("Resource registration failed");
        }
        // Succeed on subsequent calls
        return originalSetRequestHandler(schema, handler);
      }) as any;

      try {
        registerResources(server);
      } catch {
        // Expected to throw
      }

      const resources = registrationTracker.getResourceRegistrations();
      expect(resources.length).toBe(1);
      expect(resources[0].success).toBe(false);
      expect(resources[0].error).toBe("Resource registration failed");
    });
  });
});
