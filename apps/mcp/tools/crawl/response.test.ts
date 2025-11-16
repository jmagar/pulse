import { describe, it, expect } from "vitest";
import { formatCrawlResponse } from "./response.js";

describe("formatCrawlResponse", () => {
  it("formats crawl errors response", () => {
    const result = formatCrawlResponse({
      errors: [{ id: "err-1", error: "boom" }],
      robotsBlocked: ["https://example.com/robots"],
    });

    expect(result.content[0].text).toContain("Crawl Errors");
    expect(result.content[0].text).toContain("boom");
    expect(result.content[0].text).toContain("robots");
  });

  it("formats active crawl list", () => {
    const result = formatCrawlResponse({
      success: true,
      crawls: [{ id: "job-1", teamId: "team-1", url: "https://example.com" }],
    });

    expect(result.content[0].text).toContain("Active Crawls");
    expect(result.content[0].text).toContain("job-1");
  });
});
