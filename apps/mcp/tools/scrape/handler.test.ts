/**
 * @fileoverview Tests for scrape handler
 *
 * Tests the thin wrapper that delegates to webhook service.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleScrapeRequest } from "./handler.js";

// Mock WebhookScrapeClient
const mockWebhookClient = vi.hoisted(() => ({
  scrape: vi.fn(),
}));

vi.mock("./webhook-client.js", () => ({
  WebhookScrapeClient: vi.fn(() => mockWebhookClient),
}));

// Mock response builders
const mockBuildWebhookResponse = vi.hoisted(() => vi.fn());

vi.mock("./response.js", async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    buildWebhookResponse: mockBuildWebhookResponse,
  };
});

// Mock env
vi.mock("../../config/environment.js", () => ({
  env: {
    webhookBaseUrl: "http://localhost:52100",
    webhookApiSecret: "test-secret",
  },
}));

describe("handleScrapeRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBuildWebhookResponse.mockReturnValue({
      content: [{ type: "text", text: "success" }],
    });
  });

  it("should validate args and call webhook service", async () => {
    mockWebhookClient.scrape.mockResolvedValue({
      success: true,
      command: "start",
      data: {
        url: "https://example.com",
        content: "# Test",
        source: "firecrawl",
        cached: false,
        timestamp: "2025-01-15T12:00:00Z",
      },
    });

    const result = await handleScrapeRequest({
      url: "https://example.com",
    });

    expect(mockWebhookClient.scrape).toHaveBeenCalledWith(
      expect.objectContaining({
        command: "start",
        url: "https://example.com",
      }),
    );
    expect(mockBuildWebhookResponse).toHaveBeenCalled();
    expect(result.content[0].text).toBe("success");
  });

  it("should handle batch scrape", async () => {
    mockWebhookClient.scrape.mockResolvedValue({
      success: true,
      command: "start",
      data: {
        jobId: "batch-123",
        status: "scraping",
        urls: 10,
        message: "Batch started",
      },
    });

    const result = await handleScrapeRequest({
      urls: ["https://example.com/1", "https://example.com/2"],
    });

    expect(mockWebhookClient.scrape).toHaveBeenCalledWith(
      expect.objectContaining({
        command: "start",
        urls: ["https://example.com/1", "https://example.com/2"],
      }),
    );
    expect(mockBuildWebhookResponse).toHaveBeenCalled();
    expect(result.content[0].text).toBe("success");
  });

  it("should handle status command", async () => {
    mockWebhookClient.scrape.mockResolvedValue({
      success: true,
      command: "status",
      data: {
        jobId: "batch-123",
        status: "scraping",
        total: 10,
        completed: 5,
        message: "5/10 completed",
      },
    });

    const result = await handleScrapeRequest({
      command: "status",
      jobId: "batch-123",
    });

    expect(mockWebhookClient.scrape).toHaveBeenCalledWith(
      expect.objectContaining({
        command: "status",
        jobId: "batch-123",
      }),
    );
    expect(result.content[0].text).toBe("success");
  });

  it("should handle cancel command", async () => {
    mockWebhookClient.scrape.mockResolvedValue({
      success: true,
      command: "cancel",
      data: {
        jobId: "batch-123",
        status: "cancelled",
        message: "Cancelled",
      },
    });

    const result = await handleScrapeRequest({
      command: "cancel",
      jobId: "batch-123",
    });

    expect(mockWebhookClient.scrape).toHaveBeenCalledWith(
      expect.objectContaining({
        command: "cancel",
        jobId: "batch-123",
      }),
    );
    expect(result.content[0].text).toBe("success");
  });

  it("should handle errors command", async () => {
    mockWebhookClient.scrape.mockResolvedValue({
      success: true,
      command: "errors",
      data: {
        jobId: "batch-123",
        errors: [
          {
            url: "https://example.com/failed",
            error: "Timeout",
            timestamp: "2025-01-15T12:00:00Z",
          },
        ],
        message: "1 error found",
      },
    });

    const result = await handleScrapeRequest({
      command: "errors",
      jobId: "batch-123",
    });

    expect(mockWebhookClient.scrape).toHaveBeenCalledWith(
      expect.objectContaining({
        command: "errors",
        jobId: "batch-123",
      }),
    );
    expect(result.content[0].text).toBe("success");
  });

  it("should handle validation errors", async () => {
    // Use invalid schema (missing url and urls)
    const result = await handleScrapeRequest({
      command: "start",
      // No URL provided
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Invalid arguments");
  });

  it("should handle webhook service errors", async () => {
    mockWebhookClient.scrape.mockRejectedValue(
      new Error("Connection refused"),
    );

    const result = await handleScrapeRequest({
      url: "https://example.com",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Connection refused");
  });

  // Note: Configuration check happens at import time via mock,
  // so we can't dynamically test missing config in this test suite.
  // The check is covered by the early return in handler.ts lines 46-56.
});
