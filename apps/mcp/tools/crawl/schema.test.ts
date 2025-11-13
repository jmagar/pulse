import { describe, it, expect } from "vitest";
import { crawlOptionsSchema } from "./schema.js";

describe("Crawl Options Schema", () => {
  describe("command routing", () => {
    it("defaults to start command when omitted", () => {
      const result = crawlOptionsSchema.parse({
        url: "https://example.com",
      });
      expect(result.command).toBe("start");
    });

    it("requires url for start command", () => {
      expect(() =>
        crawlOptionsSchema.parse({
          command: "start",
        }),
      ).toThrow();
    });

    it("requires jobId for status/cancel/errors commands", () => {
      ["status", "cancel", "errors"].forEach((command) => {
        expect(() => crawlOptionsSchema.parse({ command })).toThrow();
        const parsed = crawlOptionsSchema.parse({
          command,
          jobId: "job-123",
        });
        expect(parsed.jobId).toBe("job-123");
      });
    });

    it("allows list command without extra fields", () => {
      const result = crawlOptionsSchema.parse({ command: "list" });
      expect(result.command).toBe("list");
    });
  });

  describe("prompt parameter", () => {
    it("accepts natural language prompt", () => {
      const result = crawlOptionsSchema.parse({
        command: "start",
        url: "https://example.com",
        prompt: "Find all blog posts about AI",
      });
      expect(result.prompt).toBe("Find all blog posts about AI");
    });

    it("is optional", () => {
      const result = crawlOptionsSchema.parse({
        command: "start",
        url: "https://example.com",
      });
      expect(result.prompt).toBeUndefined();
    });

    it("works with manual parameters", () => {
      const result = crawlOptionsSchema.parse({
        command: "start",
        url: "https://example.com",
        prompt: "Find documentation pages",
        limit: 50,
        maxDiscoveryDepth: 3,
      });
      expect(result.prompt).toBe("Find documentation pages");
      expect(result.limit).toBe(50);
      expect(result.maxDiscoveryDepth).toBe(3);
    });
  });

  describe("scrapeOptions.actions", () => {
    it("accepts browser actions in scrapeOptions", () => {
      const result = crawlOptionsSchema.parse({
        command: "start",
        url: "https://example.com",
        scrapeOptions: {
          actions: [
            { type: "wait", milliseconds: 1000 },
            { type: "click", selector: ".load-more" },
          ],
        },
      });
      expect(result.scrapeOptions?.actions).toHaveLength(2);
      expect(result.scrapeOptions?.actions?.[0]).toEqual({
        type: "wait",
        milliseconds: 1000,
      });
      expect(result.scrapeOptions?.actions?.[1]).toEqual({
        type: "click",
        selector: ".load-more",
      });
    });

    it("applies actions to all pages in crawl", () => {
      const result = crawlOptionsSchema.parse({
        command: "start",
        url: "https://example.com",
        limit: 10,
        scrapeOptions: {
          actions: [{ type: "scroll", direction: "down" }],
        },
      });
      expect(result.scrapeOptions?.actions).toBeDefined();
      expect(result.scrapeOptions?.actions).toHaveLength(1);
      expect(result.limit).toBe(10);
    });

    it("accepts multiple action types", () => {
      const result = crawlOptionsSchema.parse({
        command: "start",
        url: "https://example.com",
        scrapeOptions: {
          actions: [
            { type: "wait", milliseconds: 500 },
            { type: "click", selector: "#cookie-accept" },
            { type: "write", selector: "#search", text: "test" },
            { type: "press", key: "Enter" },
            { type: "screenshot", name: "after-search" },
          ],
        },
      });
      expect(result.scrapeOptions?.actions).toHaveLength(5);
    });

    it("is optional", () => {
      const result = crawlOptionsSchema.parse({
        command: "start",
        url: "https://example.com",
        scrapeOptions: {
          formats: ["markdown"],
        },
      });
      expect(result.scrapeOptions?.actions).toBeUndefined();
    });
  });
});
