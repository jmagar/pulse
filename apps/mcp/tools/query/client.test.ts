import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient } from "./client.js";

// Mock fetch globally
global.fetch = vi.fn();

describe("QueryClient", () => {
  let client: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new QueryClient({
      baseUrl: "http://localhost:50108",
      apiSecret: "test-secret",
    });
  });

  it("should make successful query request", async () => {
    const mockResponse = {
      results: [
        {
          url: "https://example.com",
          title: "Test",
          description: "Test description",
          text: "Test content",
          score: 0.95,
          metadata: {},
        },
      ],
      total: 1,
      query: "test query",
      mode: "hybrid",
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    });

    const result = await client.query({
      query: "test query",
      mode: "hybrid",
      limit: 10,
    });

    expect(result).toEqual(mockResponse);
    expect(global.fetch).toHaveBeenCalledWith(
      "http://localhost:50108/api/search",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          Authorization: "Bearer test-secret",
        }),
        body: expect.stringContaining('"query":"test query"'),
      }),
    );
  });

  it("should handle HTTP errors", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      json: async () => ({ detail: "Invalid API secret" }),
    });

    await expect(
      client.query({
        query: "test",
        mode: "hybrid",
        limit: 10,
      }),
    ).rejects.toThrow("Query failed: 401 Unauthorized");
  });

  it("should handle network errors", async () => {
    (global.fetch as any).mockRejectedValueOnce(new Error("Network error"));

    await expect(
      client.query({
        query: "test",
        mode: "hybrid",
        limit: 10,
      }),
    ).rejects.toThrow("Network error");
  });

  it("should include filters in request", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ results: [], total: 0, query: "", mode: "" }),
    });

    await client.query({
      query: "test",
      mode: "semantic",
      limit: 5,
      filters: {
        domain: "docs.firecrawl.dev",
        language: "en",
      },
    });

    const callArgs = (global.fetch as any).mock.calls[0];
    const body = JSON.parse(callArgs[1].body);

    expect(body.filters).toEqual({
      domain: "docs.firecrawl.dev",
      language: "en",
    });
  });
});
