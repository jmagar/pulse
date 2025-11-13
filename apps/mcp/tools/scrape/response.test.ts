import { describe, it, expect } from "vitest";
import type {
  BatchScrapeStartResult,
  CrawlStatusResult,
  BatchScrapeCancelResult,
  CrawlErrorsResult,
} from "@firecrawl/client";
import {
  buildBatchStartResponse,
  buildBatchStatusResponse,
  buildBatchCancelResponse,
  buildBatchErrorsResponse,
} from "./response.js";

describe("scrape batch responses", () => {
  it("formats batch start response with invalid URL summary", () => {
    const result: BatchScrapeStartResult = {
      success: true,
      id: "batch-job-1",
      url: "https://firecrawl/jobs/batch-job-1",
      invalidURLs: ["https://bad.example"],
    };

    const response = buildBatchStartResponse(result, 3);

    const text = response.content[0].text!;
    expect(text).toContain("batch-job-1");
    expect(text).toContain("URLs accepted: 2");
    expect(text).toContain("Invalid URLs skipped: 1");
  });

  it("formats batch status response", () => {
    const status: CrawlStatusResult = {
      status: "scraping",
      total: 10,
      completed: 4,
      creditsUsed: 6,
      expiresAt: "2025-11-12T00:00:00Z",
      data: [],
    };

    const response = buildBatchStatusResponse(status);

    const text = response.content[0].text!;
    expect(text).toContain("Progress: 4/10");
    expect(text).toContain("Credits used: 6");
  });

  it("formats batch cancel response", () => {
    const result: BatchScrapeCancelResult = {
      success: true,
      message: "Cancelled by user",
    };
    const response = buildBatchCancelResponse(result);

    expect(response.content[0].text).toContain("Cancelled");
  });

  it("formats batch errors response", () => {
    const result: CrawlErrorsResult = {
      errors: [
        { error: "Blocked", url: "https://example.com/a" },
        { error: "Timeout", url: "https://example.com/b" },
      ],
      robotsBlocked: ["https://example.com/private"],
    };

    const response = buildBatchErrorsResponse(result);

    const text = response.content[0].text!;
    expect(text).toContain("Blocked");
    expect(text).toContain("Timeout");
    expect(text).toContain("Robots-blocked");
  });
});
