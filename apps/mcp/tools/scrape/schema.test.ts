import { describe, it, expect } from "vitest";
import { buildScrapeArgsSchema, buildInputSchema } from "./schema.js";

describe("scrape schema", () => {
  it("defaults to start command with single url", () => {
    const schema = buildScrapeArgsSchema();
    const result = schema.parse({ url: "example.com" });
    expect(result.command).toBe("start");
    expect(result.url).toBe("https://example.com");
    expect(result.urls).toEqual(["https://example.com"]);
  });

  it("accepts urls array without url", () => {
    const schema = buildScrapeArgsSchema();
    const result = schema.parse({ urls: ["example.com", "example.org"] });
    expect(result.command).toBe("start");
    expect(result.urls).toHaveLength(2);
    expect(result.url).toBe("https://example.com");
  });

  it("requires url or urls for start", () => {
    const schema = buildScrapeArgsSchema();
    expect(() => schema.parse({})).toThrow();
  });

  it("requires jobId for status", () => {
    const schema = buildScrapeArgsSchema();
    expect(() => schema.parse({ command: "status" })).toThrow();
    const parsed = schema.parse({ command: "status", jobId: "job-1" });
    expect(parsed.command).toBe("status");
  });

  it("supports legacy cancel flag", () => {
    const schema = buildScrapeArgsSchema();
    const parsed = schema.parse({ cancel: true, jobId: "job-1" });
    expect(parsed.command).toBe("cancel");
  });
});

describe("scrape input schema", () => {
  it("includes command and urls properties", () => {
    const schema = buildInputSchema() as { properties: Record<string, unknown> };
    expect(schema.properties.command).toBeDefined();
    expect(schema.properties.urls).toBeDefined();
    expect(schema.properties.jobId).toBeDefined();
  });
});
