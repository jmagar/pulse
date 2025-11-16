/**
 * @fileoverview Tests for WebhookScrapeClient
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { WebhookScrapeClient } from "./webhook-client.js";

describe("WebhookScrapeClient", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("single URL scrape", () => {
    it("should call webhook scrape endpoint for single URL", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          command: "start",
          data: {
            url: "https://example.com",
            content: "# Test Content",
            contentType: "text/markdown",
            source: "firecrawl",
            cached: false,
            timestamp: "2025-01-15T12:00:00Z",
          },
        }),
      });
      global.fetch = mockFetch;

      const client = new WebhookScrapeClient({
        baseUrl: "http://localhost",
        apiSecret: "test-secret",
      });

      const result = await client.scrape({
        command: "start",
        url: "https://example.com",
      });

      expect(result.success).toBe(true);
      if (result.data && "content" in result.data) {
        expect(result.data.content).toBe("# Test Content");
      }
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost/api/v2/scrape",
        expect.objectContaining({
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer test-secret",
          },
        }),
      );
    });

    it("should include all scrape options in request body", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, command: "start", data: {} }),
      });
      global.fetch = mockFetch;

      const client = new WebhookScrapeClient({
        baseUrl: "http://localhost",
        apiSecret: "secret",
      });

      await client.scrape({
        command: "start",
        url: "https://example.com",
        timeout: 60000,
        maxChars: 50000,
        cleanScrape: true,
        forceRescrape: true,
        resultHandling: "saveAndReturn",
        formats: ["markdown", "html"],
        onlyMainContent: true,
        includeTags: ["article", "main"],
        excludeTags: ["nav", "footer"],
      });

      const callBody = JSON.parse(
        (mockFetch.mock.calls[0] as [string, { body: string }])[1].body,
      );
      expect(callBody.command).toBe("start");
      expect(callBody.url).toBe("https://example.com");
      expect(callBody.timeout).toBe(60000);
      expect(callBody.maxChars).toBe(50000);
      expect(callBody.cleanScrape).toBe(true);
      expect(callBody.forceRescrape).toBe(true);
      expect(callBody.resultHandling).toBe("saveAndReturn");
      expect(callBody.formats).toEqual(["markdown", "html"]);
      expect(callBody.onlyMainContent).toBe(true);
      expect(callBody.includeTags).toEqual(["article", "main"]);
      expect(callBody.excludeTags).toEqual(["nav", "footer"]);
    });

    it("should handle cached response", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          command: "start",
          data: {
            url: "https://example.com",
            content: "# Cached",
            cached: true,
            cacheAge: 30000,
            timestamp: "2025-01-15T11:30:00Z",
          },
        }),
      });
      global.fetch = mockFetch;

      const client = new WebhookScrapeClient({
        baseUrl: "http://localhost",
        apiSecret: "secret",
      });

      const result = await client.scrape({
        command: "start",
        url: "https://example.com",
      });

      expect(result.success).toBe(true);
      if (result.data && "cached" in result.data && "cacheAge" in result.data) {
        expect(result.data.cached).toBe(true);
        expect(result.data.cacheAge).toBe(30000);
      }
    });
  });

  describe("batch scrape operations", () => {
    it("should handle batch start command", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          command: "start",
          data: {
            jobId: "batch-job-123",
            status: "scraping",
            urls: 10,
            message: "Batch scrape started for 10 URLs",
          },
        }),
      });
      global.fetch = mockFetch;

      const client = new WebhookScrapeClient({
        baseUrl: "http://localhost",
        apiSecret: "secret",
      });

      const result = await client.scrape({
        command: "start",
        urls: ["https://example.com/1", "https://example.com/2"],
      });

      expect(result.success).toBe(true);
      if (result.data && "jobId" in result.data && "status" in result.data) {
        expect(result.data.jobId).toBe("batch-job-123");
        expect(result.data.status).toBe("scraping");
      }

      const callBody = JSON.parse(
        (mockFetch.mock.calls[0] as [string, { body: string }])[1].body,
      );
      expect(callBody.command).toBe("start");
      expect(callBody.urls).toEqual([
        "https://example.com/1",
        "https://example.com/2",
      ]);
    });

    it("should handle batch status command", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          command: "status",
          data: {
            jobId: "batch-job-123",
            status: "scraping",
            total: 10,
            completed: 7,
            creditsUsed: 70,
            message: "Batch scrape progress: 7/10 URLs completed (70%)",
          },
        }),
      });
      global.fetch = mockFetch;

      const client = new WebhookScrapeClient({
        baseUrl: "http://localhost",
        apiSecret: "secret",
      });

      const result = await client.scrape({
        command: "status",
        jobId: "batch-job-123",
      });

      expect(result.success).toBe(true);
      if (result.data && "completed" in result.data && "total" in result.data) {
        expect(result.data.completed).toBe(7);
        expect(result.data.total).toBe(10);
      }

      const callBody = JSON.parse(
        (mockFetch.mock.calls[0] as [string, { body: string }])[1].body,
      );
      expect(callBody.command).toBe("status");
      expect(callBody.jobId).toBe("batch-job-123");
    });

    it("should handle batch cancel command", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          command: "cancel",
          data: {
            jobId: "batch-job-123",
            status: "cancelled",
            message: "Batch scrape cancelled",
          },
        }),
      });
      global.fetch = mockFetch;

      const client = new WebhookScrapeClient({
        baseUrl: "http://localhost",
        apiSecret: "secret",
      });

      const result = await client.scrape({
        command: "cancel",
        jobId: "batch-job-123",
      });

      expect(result.success).toBe(true);
      if (result.data && "status" in result.data) {
        expect(result.data.status).toBe("cancelled");
      }
    });

    it("should handle batch errors command", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          command: "errors",
          data: {
            jobId: "batch-job-123",
            errors: [
              {
                url: "https://example.com/failed",
                error: "Timeout",
                timestamp: "2025-01-15T12:00:00Z",
              },
            ],
            message: "Found 1 errors in batch scrape",
          },
        }),
      });
      global.fetch = mockFetch;

      const client = new WebhookScrapeClient({
        baseUrl: "http://localhost",
        apiSecret: "secret",
      });

      const result = await client.scrape({
        command: "errors",
        jobId: "batch-job-123",
      });

      expect(result.success).toBe(true);
      if (
        result.data &&
        "errors" in result.data &&
        Array.isArray(result.data.errors)
      ) {
        expect(result.data.errors).toHaveLength(1);
        expect(result.data.errors[0].url).toBe("https://example.com/failed");
      }
    });
  });

  describe("error handling", () => {
    it("should throw error on HTTP failure", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: async () => "Server error",
      });
      global.fetch = mockFetch;

      const client = new WebhookScrapeClient({
        baseUrl: "http://localhost",
        apiSecret: "secret",
      });

      await expect(
        client.scrape({ command: "start", url: "https://example.com" }),
      ).rejects.toThrow("Webhook scrape failed: 500 Internal Server Error");
    });

    it("should throw error when success is false", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: false,
          command: "start",
          error: {
            message: "URL not accessible",
            code: "SCRAPE_FAILED",
            url: "https://example.com",
          },
        }),
      });
      global.fetch = mockFetch;

      const client = new WebhookScrapeClient({
        baseUrl: "http://localhost",
        apiSecret: "secret",
      });

      await expect(
        client.scrape({ command: "start", url: "https://example.com" }),
      ).rejects.toThrow("Scrape failed: URL not accessible");
    });

    it("should handle network errors", async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error("Network error"));
      global.fetch = mockFetch;

      const client = new WebhookScrapeClient({
        baseUrl: "http://localhost",
        apiSecret: "secret",
      });

      await expect(
        client.scrape({ command: "start", url: "https://example.com" }),
      ).rejects.toThrow("Network error");
    });
  });

  describe("configuration", () => {
    it("should strip trailing slash from baseUrl", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, command: "start", data: {} }),
      });
      global.fetch = mockFetch;

      const client = new WebhookScrapeClient({
        baseUrl: "http://localhost/",
        apiSecret: "secret",
      });

      await client.scrape({ command: "start", url: "https://example.com" });

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost/api/v2/scrape",
        expect.anything(),
      );
    });
  });
});
