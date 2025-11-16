import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSearchTool } from "./index.js";
import type { IFirecrawlClient } from "../../server.js";
import { FirecrawlClient } from "@firecrawl/client";

describe("Search Tool", () => {
  let firecrawlClient: IFirecrawlClient;

  beforeEach(() => {
    firecrawlClient = new FirecrawlClient({
      apiKey: "fc-test-key",
      baseUrl: "https://api.firecrawl.dev/v2",
    });
  });

  it("should create search tool with proper structure", () => {
    const tool = createSearchTool(firecrawlClient);

    expect(tool.name).toBe("search");
    expect(tool.description).toBeDefined();
    if (tool.description) {
      expect(tool.description.toLowerCase()).toContain("search the web");
    }
    expect(tool.inputSchema).toBeDefined();
    expect(typeof tool.handler).toBe("function");
  });

  it("should execute search through handler", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: [{ url: "https://example.com", title: "Test" }],
        creditsUsed: 2,
      }),
    }) as typeof fetch;

    const tool = createSearchTool(firecrawlClient);
    const result = await (
      tool.handler as (
        args: unknown,
      ) => Promise<{ isError?: boolean; content: unknown[] }>
    )({ query: "test", limit: 5 });

    expect(result.isError).toBe(false);
    expect(result.content).toBeDefined();
  });
});
