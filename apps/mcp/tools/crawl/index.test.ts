import { describe, it, expect, vi, beforeEach } from "vitest";
import { createCrawlTool } from "./index.js";
import type { FirecrawlConfig, ToolResponse } from "../../types.js";

describe("Crawl Tool", () => {
  let config: FirecrawlConfig;

  beforeEach(() => {
    config = {
      apiKey: "fc-test-key",
      baseUrl: "https://api.firecrawl.dev/v2",
    };
  });

  it("should create crawl tool with proper structure", () => {
    const tool = createCrawlTool(config);

    expect(tool.name).toBe("crawl");
    expect(tool.description).toContain("crawl");
    expect(tool.inputSchema).toBeDefined();
  });

  it("should start crawl when url is provided", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        id: "crawl-job-123",
        url: "https://api.firecrawl.dev/v2/crawl/crawl-job-123",
      }),
    });

    const tool = createCrawlTool(config);
    const handler = tool.handler as (args: unknown) => Promise<ToolResponse>;
    const result = await handler({ url: "https://example.com", limit: 100 });

    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain("crawl-job-123");
  });

  it("should check status when only jobId is provided", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "scraping",
        total: 100,
        completed: 50,
        creditsUsed: 50,
        expiresAt: "2025-11-06T12:00:00Z",
        data: [],
      }),
    });

    const tool = createCrawlTool(config);
    const handler = tool.handler as (args: unknown) => Promise<ToolResponse>;
    const result = await handler({ jobId: "crawl-job-123" });

    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain("Crawl Status:");
  });

  it("should cancel crawl when jobId and cancel=true", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "cancelled" }),
    });

    const tool = createCrawlTool(config);
    const handler = tool.handler as (args: unknown) => Promise<ToolResponse>;
    const result = await handler({ jobId: "crawl-job-123", cancel: true });

    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain("cancelled");
  });

  it("should pass prompt parameter to API when provided", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        id: "crawl-job-456",
        url: "https://api.firecrawl.dev/v2/crawl/crawl-job-456",
      }),
    });
    global.fetch = mockFetch;

    const tool = createCrawlTool(config);
    const handler = tool.handler as (args: unknown) => Promise<ToolResponse>;
    await handler({
      url: "https://example.com",
      prompt: "Find all blog posts about AI",
    });

    // Verify that the fetch was called
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Verify that the request body contains the prompt parameter
    const callArgs = mockFetch.mock.calls[0];
    const requestBody = JSON.parse(callArgs[1].body);
    expect(requestBody.prompt).toBe("Find all blog posts about AI");
  });
});
