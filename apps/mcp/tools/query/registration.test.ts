import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { registrationTracker } from "../../utils/mcp-status.js";
import type { FirecrawlClientFactory } from "../../server.js";

// Mock the query tool
vi.mock("./index.js", () => ({
  createQueryTool: vi.fn(() => ({
    name: "query",
    description: "Query tool for searching indexed documentation",
    inputSchema: { type: "object" },
    handler: vi.fn(),
  })),
}));

describe("Query Tool Registration", () => {
  let server: Server;
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      WEBHOOK_BASE_URL: "http://localhost:50108",
      WEBHOOK_API_SECRET: "test-secret",
      FIRECRAWL_API_KEY: "test-api-key",
      FIRECRAWL_BASE_URL: "https://api.firecrawl.dev",
    };

    server = new Server(
      { name: "test-server", version: "1.0.0" },
      { capabilities: { resources: {}, tools: {} } },
    );

    registrationTracker.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should register query tool", async () => {
    // Import after mocks are set up
    const { registerTools } = await import("../registration.js");

    const mockFirecrawlClientFactory = vi.fn(() => ({
      scrape: vi.fn(),
      search: vi.fn(),
      map: vi.fn(),
      extract: vi.fn(),
    })) as unknown as FirecrawlClientFactory;

    registerTools(server, mockFirecrawlClientFactory);

    // Verify query tool is registered via tracker
    const tools = registrationTracker.getToolRegistrations();
    const toolNames = tools.map((t) => t.name);

    expect(toolNames).toContain("query");
  });
});
