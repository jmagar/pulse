/**
 * @fileoverview Tests for WebhookBridgeClient methods
 *
 * Comprehensive tests for map() and search() methods added to WebhookBridgeClient.
 * These methods proxy Firecrawl operations through the webhook bridge.
 *
 * @module server.test
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { WebhookBridgeClient } from "./server.js";

// Mock fetch globally
global.fetch = vi.fn();

describe("WebhookBridgeClient", () => {
  let client: WebhookBridgeClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new WebhookBridgeClient("http://pulse_webhook:52100");
  });

  describe("map()", () => {
    it("should make POST request to correct endpoint", async () => {
      const mockResponse = {
        success: true,
        links: [
          {
            url: "https://example.com/page1",
            title: "Page 1",
            description: "Description 1",
          },
          {
            url: "https://example.com/page2",
            title: "Page 2",
            description: "Description 2",
          },
        ],
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.map({
        url: "https://example.com",
        limit: 100,
      });

      expect(global.fetch).toHaveBeenCalledWith(
        "http://pulse_webhook:52100/v2/map",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
        })
      );

      expect(result).toEqual(mockResponse);
      expect(result.success).toBe(true);
      expect(result.links).toHaveLength(2);
    });

    it("should send options as JSON body", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, links: [] }),
      });

      const options = {
        url: "https://example.com",
        search: "documentation",
        limit: 500,
        sitemap: "include" as const,
        includeSubdomains: true,
        ignoreQueryParameters: true,
        timeout: 60000,
        location: {
          country: "us",
          languages: ["en"],
        },
      };

      await client.map(options);

      const callArgs = (global.fetch as any).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      expect(body).toEqual(options);
      expect(body.url).toBe("https://example.com");
      expect(body.search).toBe("documentation");
      expect(body.limit).toBe(500);
      expect(body.sitemap).toBe("include");
      expect(body.includeSubdomains).toBe(true);
    });

    it("should return MapResult on success", async () => {
      const mockLinks = [
        { url: "https://docs.example.com/api", title: "API Reference" },
        { url: "https://docs.example.com/guide", title: "Getting Started" },
        {
          url: "https://docs.example.com/tutorial",
          title: "Tutorial",
          description: "Step by step",
        },
      ];

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          links: mockLinks,
        }),
      });

      const result = await client.map({
        url: "https://docs.example.com",
        limit: 100,
      });

      expect(result.success).toBe(true);
      expect(result.links).toEqual(mockLinks);
    });

    it("should throw error on HTTP failure", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => "Internal server error",
      });

      await expect(
        client.map({
          url: "https://example.com",
        })
      ).rejects.toThrow("Map request failed: Internal server error");
    });

    it("should throw error on network failure", async () => {
      (global.fetch as any).mockRejectedValueOnce(
        new Error("Network connection failed")
      );

      await expect(
        client.map({
          url: "https://example.com",
        })
      ).rejects.toThrow("Network connection failed");
    });

    it("should handle sitemap-only mode", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          links: [{ url: "https://example.com/sitemap-page" }],
        }),
      });

      await client.map({
        url: "https://example.com",
        sitemap: "only",
      });

      const callArgs = (global.fetch as any).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      expect(body.sitemap).toBe("only");
    });

    it("should handle location filters", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, links: [] }),
      });

      await client.map({
        url: "https://example.com",
        location: {
          country: "gb",
          languages: ["en", "es"],
        },
      });

      const callArgs = (global.fetch as any).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      expect(body.location).toEqual({
        country: "gb",
        languages: ["en", "es"],
      });
    });
  });

  describe("search()", () => {
    it("should make POST request to correct endpoint", async () => {
      const mockResponse = {
        success: true,
        data: [
          {
            url: "https://example.com/result1",
            title: "Result 1",
            description: "First result",
            position: 1,
          },
        ],
        creditsUsed: 1,
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.search({
        query: "test query",
        limit: 10,
      });

      expect(global.fetch).toHaveBeenCalledWith(
        "http://pulse_webhook:52100/v2/search",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
        })
      );

      expect(result).toEqual(mockResponse);
      expect(result.success).toBe(true);
      expect(result.creditsUsed).toBe(1);
    });

    it("should send options as JSON body", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: [], creditsUsed: 0 }),
      });

      const options = {
        query: "firecrawl documentation",
        limit: 20,
        sources: ["web" as const, "news" as const],
        categories: ["github" as const, "research" as const],
        country: "us",
        lang: "en",
        location: "San Francisco",
        timeout: 30000,
        ignoreInvalidURLs: true,
        tbs: "qdr:w",
        scrapeOptions: {
          formats: ["markdown", "html"],
          onlyMainContent: true,
          removeBase64Images: true,
          blockAds: true,
          waitFor: 2000,
        },
      };

      await client.search(options);

      const callArgs = (global.fetch as any).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      expect(body).toEqual(options);
      expect(body.query).toBe("firecrawl documentation");
      expect(body.limit).toBe(20);
      expect(body.sources).toEqual(["web", "news"]);
      expect(body.categories).toEqual(["github", "research"]);
      expect(body.tbs).toBe("qdr:w");
    });

    it("should return SearchResult on success", async () => {
      const mockData = [
        {
          url: "https://github.com/firecrawl/firecrawl",
          title: "Firecrawl Repository",
          description: "Open source web scraping",
          markdown: "# Firecrawl\n\nOpen source web scraping...",
          position: 1,
          category: "github",
        },
        {
          url: "https://docs.firecrawl.dev",
          title: "Firecrawl Documentation",
          description: "API reference and guides",
          html: "<h1>Documentation</h1>",
          position: 2,
        },
      ];

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: mockData,
          creditsUsed: 5,
        }),
      });

      const result = await client.search({
        query: "firecrawl",
        limit: 10,
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockData);
      expect(result.creditsUsed).toBe(5);
    });

    it("should throw error on HTTP failure", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => "Invalid query parameter",
      });

      await expect(
        client.search({
          query: "",
        })
      ).rejects.toThrow("Search request failed: Invalid query parameter");
    });

    it("should throw error on network failure", async () => {
      (global.fetch as any).mockRejectedValueOnce(
        new Error("Connection timeout")
      );

      await expect(
        client.search({
          query: "test",
        })
      ).rejects.toThrow("Connection timeout");
    });

    it("should handle multiple sources", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            web: [{ url: "https://example.com", title: "Web result" }],
            images: [{ url: "https://example.com/img.png", title: "Image" }],
            news: [{ url: "https://news.example.com", title: "News article" }],
          },
          creditsUsed: 3,
        }),
      });

      const result = await client.search({
        query: "test",
        sources: ["web", "images", "news"],
      });

      expect(result.success).toBe(true);
      expect(typeof result.data).toBe("object");
    });

    it("should handle category filters", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: [{ url: "https://github.com/test", category: "github" }],
          creditsUsed: 1,
        }),
      });

      await client.search({
        query: "test",
        categories: ["github", "research"],
      });

      const callArgs = (global.fetch as any).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      expect(body.categories).toEqual(["github", "research"]);
    });

    it("should handle time-based search filter", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: [], creditsUsed: 0 }),
      });

      await client.search({
        query: "recent news",
        tbs: "qdr:d", // Past day
      });

      const callArgs = (global.fetch as any).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      expect(body.tbs).toBe("qdr:d");
    });

    it("should handle scrape options", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: [], creditsUsed: 0 }),
      });

      await client.search({
        query: "test",
        scrapeOptions: {
          formats: ["markdown", "links"],
          onlyMainContent: true,
          blockAds: true,
        },
      });

      const callArgs = (global.fetch as any).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      expect(body.scrapeOptions).toEqual({
        formats: ["markdown", "links"],
        onlyMainContent: true,
        blockAds: true,
      });
    });
  });

  describe("constructor", () => {
    it("should remove trailing slash from baseUrl", () => {
      const clientWithSlash = new WebhookBridgeClient(
        "http://pulse_webhook:52100/"
      );

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, links: [] }),
      });

      clientWithSlash.map({ url: "https://example.com" });

      const callArgs = (global.fetch as any).mock.calls[0];
      expect(callArgs[0]).toBe("http://pulse_webhook:52100/v2/map");
    });

    it("should use default baseUrl when not provided", () => {
      const defaultClient = new WebhookBridgeClient();

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, links: [] }),
      });

      defaultClient.map({ url: "https://example.com" });

      const callArgs = (global.fetch as any).mock.calls[0];
      expect(callArgs[0]).toBe("http://pulse_webhook:52100/v2/map");
    });
  });
});
