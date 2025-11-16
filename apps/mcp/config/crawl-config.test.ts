import { describe, it, expect } from "vitest";
import {
  DEFAULT_LANGUAGE_EXCLUDES,
  mergeExcludePaths,
  DEFAULT_SCRAPE_OPTIONS,
  mergeScrapeOptions,
} from "./crawl-config.js";

describe("crawl-config", () => {
  it("mergeExcludePaths appends custom patterns without duplicates", () => {
    const merged = mergeExcludePaths(["^/custom/", "^/es/"]);

    expect(merged).toEqual([...DEFAULT_LANGUAGE_EXCLUDES, "^/custom/"]);
    // Ensure duplicate entry was not re-added
    const occurrences = merged.filter((pattern) => pattern === "^/es/").length;
    expect(occurrences).toBe(1);
  });

  it("mergeScrapeOptions falls back to defaults", () => {
    expect(mergeScrapeOptions()).toEqual(DEFAULT_SCRAPE_OPTIONS);
  });

  it("mergeScrapeOptions overrides specific fields", () => {
    const merged = mergeScrapeOptions({
      onlyMainContent: false,
      formats: ["html"],
    });
    expect(merged).toEqual({
      ...DEFAULT_SCRAPE_OPTIONS,
      onlyMainContent: false,
      formats: ["html"],
    });
  });
});
