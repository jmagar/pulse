import { describe, it, expect } from "vitest";
import { extractOptionsSchema, buildExtractInputSchema } from "./schema.js";

describe("Extract Options Schema", () => {
  describe("Required Fields", () => {
    it("should require urls array", () => {
      expect(() =>
        extractOptionsSchema.parse({
          prompt: "Extract all prices",
        }),
      ).toThrow();
    });

    it("should require at least one URL", () => {
      expect(() =>
        extractOptionsSchema.parse({
          urls: [],
          prompt: "Extract all prices",
        }),
      ).toThrow();
    });

    it("should accept urls with prompt", () => {
      const result = extractOptionsSchema.parse({
        urls: ["https://example.com"],
        prompt: "Extract all prices",
      });
      expect(result.urls).toEqual(["https://example.com"]);
      expect(result.prompt).toBe("Extract all prices");
    });

    it("should accept urls with schema", () => {
      const result = extractOptionsSchema.parse({
        urls: ["https://example.com"],
        schema: { type: "object", properties: { price: { type: "string" } } },
      });
      expect(result.urls).toEqual(["https://example.com"]);
      expect(result.schema).toEqual({
        type: "object",
        properties: { price: { type: "string" } },
      });
    });

    it("should accept both prompt and schema", () => {
      const result = extractOptionsSchema.parse({
        urls: ["https://example.com"],
        prompt: "Extract prices",
        schema: { type: "object" },
      });
      expect(result.prompt).toBe("Extract prices");
      expect(result.schema).toEqual({ type: "object" });
    });

    it("should accept urls without prompt or schema (optional)", () => {
      const result = extractOptionsSchema.parse({
        urls: ["https://example.com"],
      });
      expect(result.urls).toEqual(["https://example.com"]);
      expect(result.prompt).toBeUndefined();
      expect(result.schema).toBeUndefined();
    });
  });

  describe("URL Validation", () => {
    it("should validate URL format", () => {
      expect(() =>
        extractOptionsSchema.parse({
          urls: ["not-a-url"],
          prompt: "Extract data",
        }),
      ).toThrow();
    });

    it("should accept multiple valid URLs", () => {
      const result = extractOptionsSchema.parse({
        urls: ["https://example.com", "https://test.com"],
        prompt: "Extract data",
      });
      expect(result.urls).toEqual([
        "https://example.com",
        "https://test.com",
      ]);
    });
  });

  describe("Optional Fields", () => {
    it("should accept scrapeOptions", () => {
      const result = extractOptionsSchema.parse({
        urls: ["https://example.com"],
        prompt: "Extract data",
        scrapeOptions: {
          formats: ["markdown"],
          onlyMainContent: true,
          includeTags: ["article"],
          excludeTags: ["nav"],
          waitFor: 1000,
        },
      });
      expect(result.scrapeOptions).toEqual({
        formats: ["markdown"],
        onlyMainContent: true,
        includeTags: ["article"],
        excludeTags: ["nav"],
        waitFor: 1000,
      });
    });

    it("should accept timeout", () => {
      const result = extractOptionsSchema.parse({
        urls: ["https://example.com"],
        prompt: "Extract data",
        timeout: 30000,
      });
      expect(result.timeout).toBe(30000);
    });

    it("should reject negative timeout", () => {
      expect(() =>
        extractOptionsSchema.parse({
          urls: ["https://example.com"],
          prompt: "Extract data",
          timeout: -1000,
        }),
      ).toThrow();
    });

    it("should reject non-integer timeout", () => {
      expect(() =>
        extractOptionsSchema.parse({
          urls: ["https://example.com"],
          prompt: "Extract data",
          timeout: 1000.5,
        }),
      ).toThrow();
    });
  });
});

describe("buildExtractInputSchema", () => {
  it("should return correct JSON schema structure", () => {
    const schema = buildExtractInputSchema();

    expect(schema.type).toBe("object");
    expect(schema.required).toEqual(["urls"]);
  });

  it("should define urls property correctly", () => {
    const schema = buildExtractInputSchema();

    expect(schema.properties.urls).toEqual({
      type: "array",
      items: { type: "string", format: "uri" },
      minItems: 1,
      description: "URLs to extract structured data from",
    });
  });

  it("should define prompt property correctly", () => {
    const schema = buildExtractInputSchema();

    expect(schema.properties.prompt).toEqual({
      type: "string",
      description: "Natural language prompt describing what data to extract",
    });
  });

  it("should define schema property correctly", () => {
    const schema = buildExtractInputSchema();

    expect(schema.properties.schema).toEqual({
      type: "object",
      description: "JSON schema defining the structure of data to extract",
    });
  });

  it("should define scrapeOptions property correctly", () => {
    const schema = buildExtractInputSchema();

    expect(schema.properties.scrapeOptions).toEqual({
      type: "object",
      properties: {
        formats: { type: "array", items: { type: "string" } },
        onlyMainContent: { type: "boolean" },
        includeTags: { type: "array", items: { type: "string" } },
        excludeTags: { type: "array", items: { type: "string" } },
        waitFor: { type: "number" },
      },
      description: "Options for scraping before extraction",
    });
  });

  it("should define timeout property correctly", () => {
    const schema = buildExtractInputSchema();

    expect(schema.properties.timeout).toEqual({
      type: "number",
      description: "Request timeout in milliseconds",
    });
  });
});
