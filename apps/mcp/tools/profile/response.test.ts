import { describe, it, expect } from "vitest";
import { formatProfileResponse, formatErrorResponse } from "./response.js";
import type { CrawlMetricsResponse } from "./types.js";

describe("Profile Tool Response Formatting", () => {
  const mockCompletedCrawl: CrawlMetricsResponse = {
    crawl_id: "test123",
    crawl_url: "https://example.com",
    status: "completed",
    success: true,
    started_at: "2025-11-13T22:00:00Z",
    completed_at: "2025-11-13T22:05:00Z",
    duration_ms: 300000,
    e2e_duration_ms: 305000,
    total_pages: 10,
    pages_indexed: 9,
    pages_failed: 1,
    aggregate_timing: {
      chunking_ms: 1000,
      embedding_ms: 5000,
      qdrant_ms: 2000,
      bm25_ms: 500,
    },
    error_message: null,
    extra_metadata: null,
  };

  describe("formatProfileResponse", () => {
    it("should format basic profile without details", () => {
      const result = formatProfileResponse(mockCompletedCrawl, {
        crawl_id: "test123",
        include_details: false,
        error_offset: 0,
        error_limit: 5,
      });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");
      const text = result.content[0].text;

      expect(text).toContain("test123");
      expect(text).toContain("completed ✓");
      expect(text).toContain("https://example.com");
      expect(text).toContain("10 total");
      expect(text).toContain("Indexed: 9");
      expect(text).toContain("Failed: 1");
    });

    it("should show performance breakdown", () => {
      const result = formatProfileResponse(mockCompletedCrawl, {
        crawl_id: "test123",
      });

      const text = result.content[0].text;
      expect(text).toContain("Performance Breakdown");
      expect(text).toContain("Chunking");
      expect(text).toContain("Embedding");
      expect(text).toContain("Qdrant");
      expect(text).toContain("BM25");
    });

    it("should calculate percentages correctly", () => {
      const result = formatProfileResponse(mockCompletedCrawl, {
        crawl_id: "test123",
      });

      const text = result.content[0].text;
      // Total: 8500ms, Embedding: 5000ms = 58.8%
      expect(text).toMatch(/Embedding.*58\.\d%/);
    });

    it("should format duration in human-readable format", () => {
      const result = formatProfileResponse(mockCompletedCrawl, {
        crawl_id: "test123",
      });

      const text = result.content[0].text;
      expect(text).toMatch(/Duration:.*5m \d+s/);
    });

    it("should show end-to-end latency", () => {
      const result = formatProfileResponse(mockCompletedCrawl, {
        crawl_id: "test123",
      });

      const text = result.content[0].text;
      expect(text).toContain("End-to-end latency");
      expect(text).toContain("305,000");
    });

    it("should format in-progress crawls", () => {
      const inProgress: CrawlMetricsResponse = {
        ...mockCompletedCrawl,
        status: "in_progress",
        success: null,
        completed_at: null,
        duration_ms: null,
      };

      const result = formatProfileResponse(inProgress, {
        crawl_id: "test123",
      });

      const text = result.content[0].text;
      expect(text).toContain("🔄");
      expect(text).toContain("in progress");
      expect(text).toContain("still in progress");
    });

    it("should format failed crawls", () => {
      const failed: CrawlMetricsResponse = {
        ...mockCompletedCrawl,
        status: "failed",
        success: false,
        error_message: "Rate limit exceeded",
      };

      const result = formatProfileResponse(failed, {
        crawl_id: "test123",
      });

      const text = result.content[0].text;
      expect(text).toContain("❌");
      expect(text).toContain("failed");
      expect(text).toContain("Rate limit exceeded");
    });
  });

  describe("formatErrorResponse", () => {
    it("should format error with message", () => {
      const error = new Error("Crawl not found: test123");
      const result = formatErrorResponse(error);

      expect(result.content[0].text).toContain("Profile error");
      expect(result.content[0].text).toContain("Crawl not found");
      expect(result.isError).toBe(true);
    });
  });

  describe("Error section", () => {
    it("should show errors when per_page_metrics included", () => {
      const withErrors: CrawlMetricsResponse = {
        ...mockCompletedCrawl,
        per_page_metrics: [
          {
            url: "/failed-page",
            operation_type: "chunking",
            operation_name: "chunk_text",
            duration_ms: 0,
            success: false,
            timestamp: "2025-11-13T22:01:00Z",
          },
          {
            url: "/another-fail",
            operation_type: "embedding",
            operation_name: "embed_batch",
            duration_ms: 0,
            success: false,
            timestamp: "2025-11-13T22:02:00Z",
          },
        ],
      };

      const result = formatProfileResponse(withErrors, {
        crawl_id: "test123",
        include_details: true,
      });

      const text = result.content[0].text;
      expect(text).toContain("⚠️ Errors Encountered");
      expect(text).toContain("2 operations failed");
      expect(text).toContain("/failed-page");
      expect(text).toContain("/another-fail");
      expect(text).toContain("Chunking Errors");
      expect(text).toContain("Embedding Errors");
    });

    it("should paginate errors correctly", () => {
      const errors = Array.from({ length: 20 }, (_, i) => ({
        url: `/page-${i}`,
        operation_type: "embedding",
        operation_name: "embed_batch",
        duration_ms: 0,
        success: false,
        timestamp: `2025-11-13T22:${String(i).padStart(2, "0")}:00Z`,
      }));

      const withManyErrors: CrawlMetricsResponse = {
        ...mockCompletedCrawl,
        per_page_metrics: errors,
      };

      const result = formatProfileResponse(withManyErrors, {
        crawl_id: "test123",
        include_details: true,
        error_offset: 0,
        error_limit: 5,
      });

      const text = result.content[0].text;
      expect(text).toContain("20 operations failed");
      expect(text).toContain("showing 5 of 20");
      expect(text).toContain("15 more errors available");
      expect(text).toContain("error_offset=5");
    });

    it("should sort errors by timestamp (most recent first)", () => {
      const withErrors: CrawlMetricsResponse = {
        ...mockCompletedCrawl,
        per_page_metrics: [
          {
            url: "/old-error",
            operation_type: "chunking",
            operation_name: "chunk_text",
            duration_ms: 0,
            success: false,
            timestamp: "2025-11-13T22:01:00Z",
          },
          {
            url: "/recent-error",
            operation_type: "chunking",
            operation_name: "chunk_text",
            duration_ms: 0,
            success: false,
            timestamp: "2025-11-13T22:05:00Z",
          },
        ],
      };

      const result = formatProfileResponse(withErrors, {
        crawl_id: "test123",
        include_details: true,
      });

      const text = result.content[0].text;
      const recentIndex = text.indexOf("/recent-error");
      const oldIndex = text.indexOf("/old-error");
      expect(recentIndex).toBeLessThan(oldIndex);
    });
  });

  describe("Insights section", () => {
    it("should show insights for completed crawls", () => {
      const result = formatProfileResponse(mockCompletedCrawl, {
        crawl_id: "test123",
      });

      const text = result.content[0].text;
      expect(text).toContain("💡 Insights");
    });

    it("should identify slowest operation", () => {
      const result = formatProfileResponse(mockCompletedCrawl, {
        crawl_id: "test123",
      });

      const text = result.content[0].text;
      // Embedding is slowest at 5000ms
      expect(text).toMatch(/Embedding accounts for.*of indexing time/);
    });

    it("should show failure rate if pages failed", () => {
      const result = formatProfileResponse(mockCompletedCrawl, {
        crawl_id: "test123",
      });

      const text = result.content[0].text;
      expect(text).toMatch(/10\.0% failure rate.*\(1\/10 pages\)/);
    });
  });
});
