import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "../../../tools/query/client.js";

describe("QueryClient", () => {
  it("passes offset and limit directly to webhook without slicing", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ url: "https://example.com", text: "result", score: 1.0 }],
        total: 100,
        query: "test",
        mode: "hybrid",
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new QueryClient({
      baseUrl: "http://localhost:50108",
      apiSecret: "test-secret",
    });

    const response = await client.query({
      query: "test",
      mode: "hybrid",
      limit: 5,
      offset: 50,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:50108/api/search",
      expect.objectContaining({
        body: JSON.stringify({
          query: "test",
          mode: "hybrid",
          limit: 5,
          offset: 50,
        }),
      }),
    );
    expect(response.results.length).toBe(1);
    expect(response.total).toBe(100);
    expect(response.offset).toBe(50);
  });
});
