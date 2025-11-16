import { describe, it, expect } from "vitest";
import { formatQueryResponse } from "./response.js";

describe("Query Response Formatter", () => {
  it("returns formatted text for top five results and pagination notice", () => {
    const searchResponse = {
      results: Array.from({ length: 8 }).map((_, i) => ({
        url: `https://example.com/page-${i + 1}`,
        title: `Result ${i + 1}`,
        description: i % 2 === 0 ? `Description ${i + 1}` : null,
        text: `Snippet ${i + 1} lorem ipsum dolor sit amet, consectetur adipiscing elit. Vestibulum ${i + 1}.`,
        score: 0.9 - i * 0.01,
        metadata: {
          domain: "example.com",
          language: "en",
        },
      })),
      total: 8,
      query: "firecrawl scrape options",
      mode: "hybrid",
      offset: 0,
    };

    const result = formatQueryResponse(
      searchResponse,
      "firecrawl scrape options",
    );
    expect(result.content).toHaveLength(1);
    const text = result.content[0].text;
    expect(text).toContain("1. Result 1");
    expect(text).toContain("5. Result 5");
    expect(text).not.toContain("6. Result 6");
    expect(text).toContain("Showing 5 of 8 results");
  });

  it("handles empty result sets", () => {
    const response = {
      results: [],
      total: 0,
      query: "q",
      mode: "hybrid",
      offset: 0,
    };
    const result = formatQueryResponse(response, "q");
    expect(result.content[0].text).toContain("No results found");
  });
});
