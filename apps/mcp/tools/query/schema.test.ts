import { describe, it, expect } from "vitest";
import { queryOptionsSchema, buildQueryInputSchema } from "./schema.js";

describe("Query Tool Schema", () => {
  describe("queryOptionsSchema", () => {
    it("should validate basic query request", () => {
      const input = {
        query: "firecrawl scrape options",
      };

      const result = queryOptionsSchema.parse(input);

      expect(result.query).toBe("firecrawl scrape options");
      expect(result.mode).toBe("hybrid");
      expect(result.limit).toBe(10); // Default changed to 10
      expect(result.offset).toBe(0);
    });

    it("should validate query with all optional fields", () => {
      const input = {
        query: "test query",
        mode: "semantic",
        limit: 5,
        offset: 10,
        filters: {
          domain: "docs.firecrawl.dev",
          language: "en",
        },
      };

      const result = queryOptionsSchema.parse(input);

      expect(result.query).toBe("test query");
      expect(result.mode).toBe("semantic");
      expect(result.limit).toBe(5);
      expect(result.offset).toBe(10);
      expect(result.filters?.domain).toBe("docs.firecrawl.dev");
      expect(result.filters?.language).toBe("en");
    });

    it("should reject negative offset", () => {
      const input = {
        query: "test",
        offset: -1,
      };

      expect(() => queryOptionsSchema.parse(input)).toThrow();
    });

    it("should reject invalid mode", () => {
      const input = {
        query: "test",
        mode: "invalid",
      };

      expect(() => queryOptionsSchema.parse(input)).toThrow();
    });

    it("should reject limit out of range", () => {
      const input = {
        query: "test",
        limit: 101,
      };

      expect(() => queryOptionsSchema.parse(input)).toThrow();
    });

    it("should reject missing query", () => {
      const input = {};

      expect(() => queryOptionsSchema.parse(input)).toThrow();
    });
  });

  describe("buildQueryInputSchema", () => {
    it("should return valid JSON schema", () => {
      const schema = buildQueryInputSchema() as {
        type: string;
        properties: Record<string, unknown>;
        required: string[];
      };

      expect(schema.type).toBe("object");
      expect(schema.properties).toBeDefined();
      expect(schema.properties.query).toBeDefined();
      expect(schema.required).toContain("query");
    });

    it("should include all optional properties", () => {
      const schema = buildQueryInputSchema() as {
        properties: Record<string, unknown>;
      };

      expect(schema.properties.mode).toBeDefined();
      expect(schema.properties.limit).toBeDefined();
      expect(schema.properties.offset).toBeDefined();
      expect(schema.properties.filters).toBeDefined();
    });
  });
});
