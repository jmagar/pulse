import { describe, it, expect } from "vitest";
import { profileOptionsSchema, buildProfileInputSchema } from "./schema.js";

describe("Profile Tool Schema", () => {
  describe("profileOptionsSchema", () => {
    it("should require crawl_id", () => {
      expect(() => profileOptionsSchema.parse({})).toThrow();
    });

    it("should reject empty crawl_id", () => {
      expect(() => profileOptionsSchema.parse({ crawl_id: "" })).toThrow();
    });

    it("should apply default values", () => {
      const result = profileOptionsSchema.parse({ crawl_id: "test123" });

      expect(result.crawl_id).toBe("test123");
      expect(result.include_details).toBe(false);
      expect(result.error_offset).toBe(0);
      expect(result.error_limit).toBe(5);
    });

    it("should accept all optional fields", () => {
      const input = {
        crawl_id: "abc123",
        include_details: true,
        error_offset: 10,
        error_limit: 20,
      };

      const result = profileOptionsSchema.parse(input);

      expect(result.include_details).toBe(true);
      expect(result.error_offset).toBe(10);
      expect(result.error_limit).toBe(20);
    });

    it("should enforce error_limit maximum of 50", () => {
      expect(() =>
        profileOptionsSchema.parse({ crawl_id: "test", error_limit: 100 })
      ).toThrow();
    });

    it("should enforce error_offset minimum of 0", () => {
      expect(() =>
        profileOptionsSchema.parse({ crawl_id: "test", error_offset: -1 })
      ).toThrow();
    });

    it("should enforce error_limit minimum of 1", () => {
      expect(() =>
        profileOptionsSchema.parse({ crawl_id: "test", error_limit: 0 })
      ).toThrow();
    });
  });

  describe("buildProfileInputSchema", () => {
    it("should return valid JSON schema", () => {
      const schema = buildProfileInputSchema();

      expect(schema.type).toBe("object");
      expect(schema.properties).toBeDefined();
      expect(schema.required).toEqual(["crawl_id"]);
    });

    it("should have all expected properties", () => {
      const schema = buildProfileInputSchema();

      expect(schema.properties?.crawl_id).toBeDefined();
      expect(schema.properties?.include_details).toBeDefined();
      expect(schema.properties?.error_offset).toBeDefined();
      expect(schema.properties?.error_limit).toBeDefined();
    });
  });
});
