import { describe, it, expect, vi, beforeEach } from "vitest";
import { createQueryTool } from "./index.js";

// Mock dependencies
const queryMock = vi.fn().mockResolvedValue({
  results: [
    {
      url: "https://example.com",
      title: "Test",
      description: "Test desc",
      text: "Test content",
      score: 0.95,
      metadata: { domain: "example.com" },
    },
  ],
  total: 1,
  query: "test",
  mode: "hybrid",
  offset: 0,
});

vi.mock("./client.js", () => ({
  QueryClient: vi.fn().mockImplementation(() => ({
    query: queryMock,
  })),
}));

describe("Query Tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryMock.mockClear();
  });

  it("should create tool with correct name and description", () => {
    const tool = createQueryTool({
      baseUrl: "http://localhost:50108",
      apiSecret: "test-secret",
    });

    expect(tool.name).toBe("query");
    expect(tool.description).toContain("Search indexed documentation");
    expect(tool.inputSchema).toBeDefined();
  });

  it("should execute query successfully", async () => {
    const tool = createQueryTool({
      baseUrl: "http://localhost:50108",
      apiSecret: "test-secret",
    });

    const result = await (
      tool.handler as (
        args: unknown,
      ) => Promise<{ isError?: boolean; content: unknown[] }>
    )({
      query: "test query",
      mode: "hybrid",
      limit: 10,
    });

    expect(result.content).toBeDefined();
    expect(result.content[0]).toEqual(
      expect.objectContaining({
        type: "text",
        text: expect.stringContaining("1. Test"),
      }),
    );
    expect(result.isError).toBeUndefined();
  });

  it("should handle query errors gracefully", async () => {
    const { QueryClient } = await import("./client.js");
    (QueryClient as any).mockImplementationOnce(() => ({
      query: vi.fn().mockRejectedValue(new Error("Network error")),
    }));

    const tool = createQueryTool({
      baseUrl: "http://localhost:50108",
      apiSecret: "test-secret",
    });

    const result = await (
      tool.handler as (
        args: unknown,
      ) => Promise<{
        isError?: boolean;
        content: { type: string; text: string }[];
      }>
    )({
      query: "test",
      mode: "hybrid",
      limit: 10,
    });

    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toContain("Query error");
    expect(result.isError).toBe(true);
  });

  it("should validate input arguments", async () => {
    const tool = createQueryTool({
      baseUrl: "http://localhost:50108",
      apiSecret: "test-secret",
    });

    const result = await (
      tool.handler as (
        args: unknown,
      ) => Promise<{
        isError?: boolean;
        content: { type: string; text: string }[];
      }>
    )({
      query: "",
      mode: "invalid",
      limit: 101,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Query error");
  });
});
