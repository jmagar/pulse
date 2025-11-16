import { describe, it, expect, vi, beforeEach } from "vitest";
import { createExtractTool } from "./index.js";
import type { ToolResponse } from "../../types.js";
import type { IFirecrawlClient } from "../../server.js";

describe("Extract Tool", () => {
  let firecrawlClient: IFirecrawlClient;

  beforeEach(() => {
    // Create mock Firecrawl client with extract method
    firecrawlClient = {
      scrape: vi.fn() as any,
      extract: vi.fn(async (options: {
        urls: string[];
        prompt?: string;
        schema?: Record<string, unknown>;
      }) => {
        // Mock successful extraction
        return {
          success: true,
          data: options.urls.map((url) => ({
            url,
            title: "Example Title",
            description: "Example description",
          })),
        };
      }),
    } as any;
  });

  it("should create extract tool with proper structure", () => {
    const tool = createExtractTool(firecrawlClient);

    expect(tool.name).toBe("extract");
    expect(tool.description).toContain("Extract structured data");
    expect(tool.inputSchema).toBeDefined();
    expect(tool.handler).toBeInstanceOf(Function);
  });

  it("should extract data using prompt", async () => {
    const tool = createExtractTool(firecrawlClient);
    const handler = tool.handler as (args: unknown) => Promise<ToolResponse>;
    const result = await handler({
      urls: ["https://example.com"],
      prompt: "Extract the title and description",
    });

    expect(result.isError).toBeFalsy();
    expect(result.content[0].type).toBe("text");
    const text = (result.content[0] as any).text;
    expect(text).toContain("Extracted Data");
    expect(text).toContain("1 URL");
  });

  it("should extract data using schema", async () => {
    const tool = createExtractTool(firecrawlClient);
    const handler = tool.handler as (args: unknown) => Promise<ToolResponse>;
    const result = await handler({
      urls: ["https://example.com"],
      schema: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
        },
      },
    });

    expect(result.isError).toBeFalsy();
    expect(result.content[0].type).toBe("text");
    const text = (result.content[0] as any).text;
    expect(text).toContain("Extracted Data");
  });

  it("should handle multiple URLs", async () => {
    const tool = createExtractTool(firecrawlClient);
    const handler = tool.handler as (args: unknown) => Promise<ToolResponse>;
    const result = await handler({
      urls: [
        "https://example.com/page1",
        "https://example.com/page2",
        "https://example.com/page3",
      ],
      prompt: "Extract product information",
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content[0] as any).text;
    expect(text).toContain("3 URL");
    expect(text).toContain("3 items");
  });

  it("should handle extraction errors gracefully", async () => {
    firecrawlClient.extract = vi.fn(async () => ({
      success: false,
      error: "API rate limit exceeded",
    }));

    const tool = createExtractTool(firecrawlClient);
    const handler = tool.handler as (args: unknown) => Promise<ToolResponse>;
    const result = await handler({
      urls: ["https://example.com"],
      prompt: "Extract data",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Extract failed");
    expect(result.content[0].text).toContain("API rate limit exceeded");
  });

  it("should handle missing extract client", async () => {
    const invalidClients = {
      native: {} as any,
      firecrawl: {
        scrape: vi.fn() as any,
        // No extract method
      } as any,
    };

    const tool = createExtractTool(invalidClients);
    const handler = tool.handler as (args: unknown) => Promise<ToolResponse>;
    const result = await handler({
      urls: ["https://example.com"],
      prompt: "Extract data",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Extract error");
    expect(result.content[0].text).toContain("not supported");
  });

  it("should validate required urls parameter", async () => {
    const tool = createExtractTool(firecrawlClient);
    const handler = tool.handler as (args: unknown) => Promise<ToolResponse>;
    const result = await handler({
      prompt: "Extract data",
      // Missing urls
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Extract error");
  });

  it("should pass scrapeOptions to client", async () => {
    const extractMock = vi.fn(async () => ({
      success: true,
      data: [{ title: "Test" }],
    }));
    firecrawlClient.extract = extractMock;

    const tool = createExtractTool(firecrawlClient);
    const handler = tool.handler as (args: unknown) => Promise<ToolResponse>;
    await handler({
      urls: ["https://example.com"],
      prompt: "Extract data",
      scrapeOptions: {
        formats: ["markdown"],
        onlyMainContent: true,
      },
    });

    expect(extractMock).toHaveBeenCalledWith(
      expect.objectContaining({
        scrapeOptions: {
          formats: ["markdown"],
          onlyMainContent: true,
        },
      }),
    );
  });

  it("should pass timeout to client", async () => {
    const extractMock = vi.fn(async () => ({
      success: true,
      data: [{ title: "Test" }],
    }));
    firecrawlClient.extract = extractMock;

    const tool = createExtractTool(firecrawlClient);
    const handler = tool.handler as (args: unknown) => Promise<ToolResponse>;
    await handler({
      urls: ["https://example.com"],
      prompt: "Extract data",
      timeout: 30000,
    });

    expect(extractMock).toHaveBeenCalledWith(
      expect.objectContaining({
        timeout: 30000,
      }),
    );
  });
});
