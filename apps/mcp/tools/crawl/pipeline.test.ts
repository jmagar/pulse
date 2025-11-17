import { describe, it, expect, beforeEach, vi } from "vitest";
import type { CrawlClient } from "../../types.js";
import { crawlPipeline } from "./pipeline.js";
import type { CrawlOptions } from "./schema.js";

const asCrawlOptions = (options: Record<string, unknown>) => {
  return options as unknown as CrawlOptions;
};
import {
  DEFAULT_LANGUAGE_EXCLUDES,
  DEFAULT_SCRAPE_OPTIONS,
} from "../../config/crawl-config.js";

describe("crawlPipeline", () => {
  let mockClient: CrawlClient;

  beforeEach(() => {
    mockClient = {
      startCrawl: vi.fn().mockResolvedValue({ success: true, id: "job-123" }),
      getCrawlStatus: vi.fn(),
      cancelCrawl: vi.fn(),
      getCrawlErrors: vi.fn(),
      listActiveCrawls: vi.fn(),
    } as unknown as CrawlClient;
  });

  it("applies default language excludes when none provided", async () => {
    await crawlPipeline(
      mockClient,
      asCrawlOptions({ command: "start", url: "https://example.com" }),
    );

    expect(mockClient.startCrawl).toHaveBeenCalledTimes(1);
    const callArgs = (mockClient.startCrawl as any).mock.calls[0][0];
    expect(callArgs.excludePaths).toEqual(DEFAULT_LANGUAGE_EXCLUDES);
  });

  it("merges custom exclude paths with defaults", async () => {
    await crawlPipeline(
      mockClient,
      asCrawlOptions({
        command: "start",
        url: "https://example.com",
        excludePaths: ["^/custom/"],
      }),
    );

    const callArgs = (mockClient.startCrawl as any).mock.calls[0][0];
    expect(callArgs.excludePaths).toEqual([
      ...DEFAULT_LANGUAGE_EXCLUDES,
      "^/custom/",
    ]);
  });
  it("applies default scrape options when none provided", async () => {
    await crawlPipeline(
      mockClient,
      asCrawlOptions({ command: "start", url: "https://example.com" }),
    );

    const callArgs = (mockClient.startCrawl as any).mock.calls[0][0];
    expect(callArgs.scrapeOptions).toEqual(DEFAULT_SCRAPE_OPTIONS);
  });

  it("merges custom scrape options with defaults", async () => {
    await crawlPipeline(
      mockClient,
      asCrawlOptions({
        command: "start",
        url: "https://example.com",
        scrapeOptions: {
          onlyMainContent: false,
          formats: ["html"],
          parsers: [],
        },
      }),
    );

    const callArgs = (mockClient.startCrawl as any).mock.calls[0][0];
    expect(callArgs.scrapeOptions).toEqual({
      ...DEFAULT_SCRAPE_OPTIONS,
      onlyMainContent: false,
      formats: ["html"],
    });
  });

  it("routes status command to getCrawlStatus", async () => {
    await crawlPipeline(
      mockClient,
      asCrawlOptions({ command: "status", jobId: "job-42" }),
    );

    expect(mockClient.getCrawlStatus).toHaveBeenCalledWith("job-42");
  });

  it("routes cancel command to cancelCrawl", async () => {
    await crawlPipeline(
      mockClient,
      asCrawlOptions({ command: "cancel", jobId: "job-42" }),
    );

    expect(mockClient.cancelCrawl).toHaveBeenCalledWith("job-42");
  });

  it("routes errors command to getCrawlErrors", async () => {
    await crawlPipeline(
      mockClient,
      asCrawlOptions({ command: "errors", jobId: "job-42" }),
    );

    expect(mockClient.getCrawlErrors).toHaveBeenCalledWith("job-42");
  });

  it("routes list command to listActiveCrawls", async () => {
    await crawlPipeline(mockClient, asCrawlOptions({ command: "list" }));

    expect(mockClient.listActiveCrawls).toHaveBeenCalledTimes(1);
  });

  it("should default crawlEntireDomain to false when not specified", async () => {
    await crawlPipeline(
      mockClient,
      asCrawlOptions({ command: "start", url: "https://example.com" }),
    );

    expect(mockClient.startCrawl).toHaveBeenCalledWith(
      expect.objectContaining({
        crawlEntireDomain: false, // Should be false by default
      }),
    );
  });

  it("should filter webhook events to only page events by default", async () => {
    await crawlPipeline(
      mockClient,
      asCrawlOptions({
        command: "start",
        url: "https://example.com",
        webhook: {
          url: "https://webhook.example.com/firecrawl",
        },
      }),
    );

    expect(mockClient.startCrawl).toHaveBeenCalledWith(
      expect.objectContaining({
        webhook: expect.objectContaining({
          url: "https://webhook.example.com/firecrawl",
          events: ["page"], // Should default to page-only
        }),
      }),
    );
  });

  it("should use provided webhook events if specified", async () => {
    await crawlPipeline(
      mockClient,
      asCrawlOptions({
        command: "start",
        url: "https://example.com",
        webhook: {
          url: "https://webhook.example.com/firecrawl",
          events: ["page", "completed", "started"],
        },
      }),
    );

    expect(mockClient.startCrawl).toHaveBeenCalledWith(
      expect.objectContaining({
        webhook: expect.objectContaining({
          events: ["page", "completed", "started"], // Should respect user input
        }),
      }),
    );
  });
});
