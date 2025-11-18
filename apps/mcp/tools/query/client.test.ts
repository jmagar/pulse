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
      offset: 0,
    });

    expect(result.results).toEqual(mockResponse.results);
    expect(result.offset).toBe(0);
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
        offset: 0,
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
        offset: 0,
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
      offset: 0,
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

  it("should honor offset by fetching more results and trimming", async () => {
    const allResults = Array.from({ length: 8 }).map((_, i) => ({
      url: `https://example.com/${i}`,
      title: `Result ${i}`,
      description: null,
      text: `Content ${i}`,
      score: 1 - i * 0.01,
      metadata: {},
    }));

    // Mock backend returns sliced results based on offset and limit
    const slicedResults = allResults.slice(5, 10);  // offset=5, limit=5, but only 3 results left

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        results: slicedResults,
        total: allResults.length,
        query: "test",
        mode: "hybrid",
      }),
    });

    const result = await client.query({
      query: "test",
      mode: "hybrid",
      limit: 5,
      offset: 5,
    });

    const callArgs = (global.fetch as any).mock.calls[0];
    const body = JSON.parse(callArgs[1].body);
    expect(body.limit).toBe(5);  // Should pass through the requested limit
    expect(result.results).toHaveLength(3);
    expect(result.results[0].title).toBe("Result 5");
    expect(result.offset).toBe(5);
  });
});
