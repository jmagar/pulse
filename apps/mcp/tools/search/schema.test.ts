import { describe, it, expect } from "vitest";
import { searchOptionsSchema } from "./schema.js";

describe("Search Schema", () => {
  it("should validate basic search options", () => {
    const result = searchOptionsSchema.safeParse({
      query: "test query",
      limit: 10,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.query).toBe("test query");
      expect(result.data.limit).toBe(10);
    }
  });

  it("should reject invalid limit", () => {
    const result = searchOptionsSchema.safeParse({
      query: "test",
      limit: 150, // Max is 100
    });

    expect(result.success).toBe(false);
  });

  it("should validate search with scrape options", () => {
    const result = searchOptionsSchema.safeParse({
      query: "test",
      scrapeOptions: {
        formats: ["markdown", "html"],
        onlyMainContent: true,
      },
    });

    expect(result.success).toBe(true);
  });

  describe("tbs parameter", () => {
    it("accepts past hour filter", () => {
      const result = searchOptionsSchema.parse({
        query: "test",
        tbs: "qdr:h",
      });
      expect(result.tbs).toBe("qdr:h");
    });

    it("accepts past day filter", () => {
      const result = searchOptionsSchema.parse({
        query: "test",
        tbs: "qdr:d",
      });
      expect(result.tbs).toBe("qdr:d");
    });

    it("accepts custom date range", () => {
      const result = searchOptionsSchema.parse({
        query: "test",
        tbs: "cdr:a,cd_min:01/01/2024,cd_max:12/31/2024",
      });
      expect(result.tbs).toBe("cdr:a,cd_min:01/01/2024,cd_max:12/31/2024");
    });

    it("is optional", () => {
      const result = searchOptionsSchema.parse({
        query: "test",
      });
      expect(result.tbs).toBeUndefined();
    });
  });
});
