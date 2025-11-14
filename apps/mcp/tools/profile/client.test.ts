import { describe, it, expect, beforeEach, vi } from "vitest";
import { ProfileClient } from "./client.js";

// Mock fetch globally
global.fetch = vi.fn();

describe("ProfileClient", () => {
  let client: ProfileClient;

  beforeEach(() => {
    client = new ProfileClient({
      baseUrl: "http://localhost:52100",
      apiSecret: "test-secret",
    });
    vi.clearAllMocks();
  });

  describe("getMetrics", () => {
    it("should make GET request to correct endpoint", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          crawl_id: "test123",
          crawl_url: "https://example.com",
          status: "completed",
        }),
      });

      await client.getMetrics("test123", false);

      expect(global.fetch).toHaveBeenCalledWith(
        "http://localhost:52100/api/metrics/crawls/test123",
        expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({
            "X-API-Secret": "test-secret",
          }),
        })
      );
    });

    it("should include query param when include_per_page is true", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ crawl_id: "test" }),
      });

      await client.getMetrics("test123", true);

      expect(global.fetch).toHaveBeenCalledWith(
        "http://localhost:52100/api/metrics/crawls/test123?include_per_page=true",
        expect.any(Object)
      );
    });

    it("should use custom timeout if provided", async () => {
      const customClient = new ProfileClient({
        baseUrl: "http://localhost:52100",
        apiSecret: "test-secret",
        timeout: 60000,
      });

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ crawl_id: "test" }),
      });

      await customClient.getMetrics("test123");

      const callArgs = (global.fetch as any).mock.calls[0];
      expect(callArgs[1].signal).toBeDefined();
    });

    it("should throw error for 404 response", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });

      await expect(client.getMetrics("unknown")).rejects.toThrow(
        "Crawl not found: unknown"
      );
    });

    it("should throw error for authentication failure", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
      });

      await expect(client.getMetrics("test")).rejects.toThrow(
        "Authentication failed"
      );
    });

    it("should throw error for forbidden access", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: "Forbidden",
      });

      await expect(client.getMetrics("test")).rejects.toThrow(
        "Authentication failed"
      );
    });

    it("should throw error for other API errors", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: async () => "Database connection failed",
      });

      await expect(client.getMetrics("test")).rejects.toThrow(
        "Metrics API error (500)"
      );
    });

    it("should parse JSON response correctly", async () => {
      const mockResponse = {
        crawl_id: "test123",
        crawl_url: "https://example.com",
        status: "completed",
        success: true,
        total_pages: 10,
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.getMetrics("test123");

      expect(result).toEqual(mockResponse);
    });
  });
});
