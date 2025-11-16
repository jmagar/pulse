import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMapTool } from "./index.js";
import type { ToolResponse } from "../../types.js";
import type { IFirecrawlClient } from "../../server.js";
import type { MapOptions, MapResult } from "@firecrawl/client";

describe("Map Tool", () => {
  let firecrawlClient: IFirecrawlClient;

  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        links: Array.from({ length: 3000 }, (_, i) => ({
          url: `https://example.com/page-${i + 1}`,
          title: `Page ${i + 1}`,
        })),
      }),
    });

    // Create mock Firecrawl client with map method
    firecrawlClient = {
      scrape: vi.fn() as any,
      map: vi.fn(async (options: MapOptions): Promise<MapResult> => {
        const response = await fetch(
          `https://api.firecrawl.dev/v2/map?url=${encodeURIComponent(options.url)}`,
        );
        const data = await response.json();
        return data as MapResult;
      }),
    } as any;
  });

  it("should create map tool with proper structure", () => {
    const tool = createMapTool(firecrawlClient);

    expect(tool.name).toBe("map");
    expect(tool.description).toContain("Discover URLs");
    expect(tool.inputSchema).toBeDefined();
    expect(tool.handler).toBeInstanceOf(Function);
  });

  it("should handle pagination parameters", async () => {
    const tool = createMapTool(firecrawlClient);
    const handler = tool.handler as (args: unknown) => Promise<ToolResponse>;
    const result = await handler({
      url: "https://example.com",
      startIndex: 1000,
      maxResults: 500,
    });

    expect(result.isError).toBe(false);
    const text = (result.content[0] as any).text;
    expect(text).toContain("Showing: 1001-1500 of 3000");
  });

  it("should handle resultHandling parameter", async () => {
    const tool = createMapTool(firecrawlClient);
    const handler = tool.handler as (args: unknown) => Promise<ToolResponse>;
    const result = await handler({
      url: "https://example.com",
      resultHandling: "saveOnly",
    });

    expect(result.isError).toBe(false);
    expect(result.content[1].type).toBe("resource_link");
  });

  it("should use default pagination values", async () => {
    const tool = createMapTool(firecrawlClient);
    const handler = tool.handler as (args: unknown) => Promise<ToolResponse>;
    const result = await handler({
      url: "https://example.com",
    });

    expect(result.isError).toBe(false);
    const text = (result.content[0] as any).text;
    expect(text).toContain("Showing: 1-200 of 3000");
  });

  it("should handle errors gracefully", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 402,
      text: async () => "Payment required",
    });

    const tool = createMapTool(firecrawlClient);
    const handler = tool.handler as (args: unknown) => Promise<ToolResponse>;
    const result = await handler({
      url: "https://example.com",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Map error");
  });
});
