import { describe, it, expect } from "vitest";
import { formatQueryResponse } from "./response.js";

describe("Query Response Formatter", () => {
  it("should format search results with embedded resources", () => {
    const searchResponse = {
      results: [
        {
          url: "https://docs.firecrawl.dev/features/scrape",
          title: "Scrape | Firecrawl",
          description: "Turn any url into clean data",
          text: "Scrape Formats\n\nYou can now choose what formats you want your output in...",
          score: 0.95,
          metadata: {
            url: "https://docs.firecrawl.dev/features/scrape",
            title: "Scrape | Firecrawl",
            domain: "docs.firecrawl.dev",
            language: "en",
          },
        },
        {
          url: "https://docs.firecrawl.dev/features/search",
          title: "Search | Firecrawl",
          description: "Search the web and get full content from results",
          text: "Search and scrape content...",
          score: 0.85,
          metadata: {
            url: "https://docs.firecrawl.dev/features/search",
            title: "Search | Firecrawl",
            domain: "docs.firecrawl.dev",
          },
        },
      ],
      total: 2,
      query: "firecrawl scrape options",
      mode: "hybrid",
    };

    const result = formatQueryResponse(searchResponse, "firecrawl scrape options");

    expect(result.content).toHaveLength(2);
    expect(result.isError).toBeUndefined();

    // First result should be embedded resource
    const firstResult = result.content[0];
    expect(firstResult.type).toBe("resource");
    expect(firstResult.resource).toBeDefined();
    expect(firstResult.resource.uri).toContain("scraped://");
    expect(firstResult.resource.name).toBe("https://docs.firecrawl.dev/features/scrape");
    expect(firstResult.resource.text).toContain("Scrape Formats");
    expect(firstResult.resource.text).toContain("**Score:** 0.95");
  });

  it("should format empty results", () => {
    const searchResponse = {
      results: [],
      total: 0,
      query: "nonexistent query",
      mode: "hybrid",
    };

    const result = formatQueryResponse(searchResponse, "nonexistent query");

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toContain("No results found");
  });

  it("should include metadata in formatted text", () => {
    const searchResponse = {
      results: [
        {
          url: "https://example.com",
          title: "Example",
          description: "Example description",
          text: "Example content",
          score: 0.75,
          metadata: {
            domain: "example.com",
            language: "en",
            country: "US",
          },
        },
      ],
      total: 1,
      query: "test",
      mode: "semantic",
    };

    const result = formatQueryResponse(searchResponse, "test");

    const resource = result.content[0].resource;
    expect(resource.text).toContain("**Domain:** example.com");
    expect(resource.text).toContain("**Language:** en");
    expect(resource.text).toContain("**Country:** US");
  });
});
