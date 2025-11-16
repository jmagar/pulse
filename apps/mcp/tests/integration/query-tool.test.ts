import { describe, it, expect } from "vitest";
import { createQueryTool } from "../../tools/query/index.js";

/**
 * Full end-to-end tests that hit the webhook search service.
 * Enable by setting RUN_QUERY_TOOL_INTEGRATION=true along with
 * WEBHOOK_BASE_URL and WEBHOOK_API_SECRET that point to a running webhook app.
 */
const shouldRunIntegration = process.env.RUN_QUERY_TOOL_INTEGRATION === "true";
const describeIntegration = shouldRunIntegration ? describe : describe.skip;

const baseUrl = process.env.WEBHOOK_BASE_URL || "http://localhost:50108";
const apiSecret = process.env.WEBHOOK_API_SECRET || "test-secret";

const tool = createQueryTool({
  baseUrl,
  apiSecret,
});

describeIntegration("Query Tool Integration", () => {
  const callTool = (args: Record<string, unknown>) => tool.handler(args);

  it("should query firecrawl documentation successfully", async () => {
    const result = await callTool({
      query: "firecrawl scrape formats",
      mode: "hybrid",
      limit: 5,
    });

    expect(result.content).toBeDefined();
    expect(result.content.length).toBeGreaterThan(0);
    expect(result.isError).toBeUndefined();

    const firstResult = result.content[0];
    expect(firstResult.type).toBe("resource");
    expect(firstResult.resource).toBeDefined();
    expect(firstResult.resource?.uri).toContain("scraped://");
  }, 60_000);

  it("should handle semantic search", async () => {
    const result = await callTool({
      query: "how to extract links from pages",
      mode: "semantic",
      limit: 3,
    });

    expect(result.content).toBeDefined();
    expect(result.isError).toBeUndefined();
  }, 60_000);

  it("should handle keyword search", async () => {
    const result = await callTool({
      query: "markdown html rawHtml",
      mode: "keyword",
      limit: 5,
    });

    expect(result.content).toBeDefined();
    expect(result.isError).toBeUndefined();
  }, 60_000);

  it("should filter by domain", async () => {
    const result = await callTool({
      query: "search",
      mode: "hybrid",
      limit: 5,
      filters: {
        domain: "docs.firecrawl.dev",
      },
    });

    expect(result.content).toBeDefined();
    expect(result.isError).toBeUndefined();

    for (const item of result.content) {
      if (item.type === "resource") {
        expect(item.resource?.name).toContain("docs.firecrawl.dev");
      }
    }
  }, 60_000);
});
