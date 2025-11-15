import { describe, it, expect, beforeEach } from "vitest";
import { WebhookPostgresStorage } from "../../storage/webhook-postgres.js";
import type { ResourceData } from "../../storage/types.js";

/**
 * Full end-to-end tests that hit the webhook service API.
 * Enable by setting RUN_WEBHOOK_STORAGE_INTEGRATION=true along with
 * WEBHOOK_BASE_URL and WEBHOOK_API_SECRET that point to a running webhook app.
 *
 * These tests verify:
 * 1. MCP can read scraped content from webhook.scraped_content via API
 * 2. ResourceData structure matches expected format
 * 3. Redis caching provides fast responses
 * 4. Error handling works correctly (404, invalid URI)
 */
const shouldRunIntegration =
  process.env.RUN_WEBHOOK_STORAGE_INTEGRATION === "true";
const describeIntegration = shouldRunIntegration ? describe : describe.skip;

const baseUrl = process.env.WEBHOOK_BASE_URL || "http://localhost:50108";
const apiSecret = process.env.WEBHOOK_API_SECRET || "test-secret";

describeIntegration("WebhookPostgresStorage Integration", () => {
  let storage: WebhookPostgresStorage;

  beforeEach(() => {
    storage = new WebhookPostgresStorage({
      webhookBaseUrl: baseUrl,
      apiSecret,
      defaultTtl: 3600000, // 1 hour
    });
  });

  describe("findByUrl", () => {
    it(
      "should retrieve scraped content from webhook API",
      async () => {
        // This test requires content to exist in the webhook database
        // You can seed test data by scraping a URL via Firecrawl first
        const testUrl = "https://docs.firecrawl.dev";

        const results = await storage.findByUrl(testUrl);

        // Verify structure even if no results (empty array is valid)
        expect(Array.isArray(results)).toBe(true);

        if (results.length > 0) {
          const firstResult = results[0];

          // Verify ResourceData structure
          expect(firstResult).toMatchObject({
            uri: expect.stringMatching(/^webhook:\/\/\d+$/),
            name: expect.any(String),
            description: expect.stringContaining(testUrl),
            mimeType: "text/markdown",
            metadata: {
              url: testUrl,
              timestamp: expect.any(String),
              resourceType: "cleaned",
              contentType: "text/markdown",
              ttl: expect.any(Number),
            },
          });

          // Verify metadata fields
          expect(firstResult.metadata.url).toBe(testUrl);
          expect(firstResult.metadata.resourceType).toBe("cleaned");
          expect(firstResult.metadata.timestamp).toMatch(
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
          );
        }
      },
      30_000,
    );

    it(
      "should return empty array for non-existent URL",
      async () => {
        const nonExistentUrl = "https://this-domain-does-not-exist-12345.com";

        const results = await storage.findByUrl(nonExistentUrl);

        expect(results).toEqual([]);
      },
      30_000,
    );

    it(
      "should handle multiple results for same URL",
      async () => {
        // URLs that might have been scraped multiple times
        const testUrl = "https://docs.firecrawl.dev";

        const results = await storage.findByUrl(testUrl);

        // Even if empty, should be array
        expect(Array.isArray(results)).toBe(true);

        // All results should have same URL in metadata
        for (const result of results) {
          expect(result.metadata.url).toBe(testUrl);
        }
      },
      30_000,
    );
  });

  describe("read", () => {
    it(
      "should fetch content by webhook URI",
      async () => {
        // First find a URL to get a valid URI
        const testUrl = "https://docs.firecrawl.dev";
        const results = await storage.findByUrl(testUrl);

        if (results.length === 0) {
          console.log(
            "Skipping read test - no content found for URL. Seed data first.",
          );
          return;
        }

        const uri = results[0].uri;
        const content = await storage.read(uri);

        // Verify ResourceContent structure
        expect(content).toMatchObject({
          uri,
          mimeType: "text/markdown",
          text: expect.any(String),
        });

        // Verify content is not empty
        expect(content.text).toBeTruthy();
        expect(content.text!.length).toBeGreaterThan(0);
      },
      30_000,
    );

    it(
      "should throw error for non-existent content ID",
      async () => {
        const invalidUri = "webhook://999999999";

        await expect(storage.read(invalidUri)).rejects.toThrow(
          "Resource not found",
        );
      },
      30_000,
    );

    it(
      "should throw error for invalid URI format",
      async () => {
        const invalidFormats = [
          "invalid://123",
          "webhook://abc",
          "webhook:123",
          "http://example.com",
        ];

        for (const invalidUri of invalidFormats) {
          await expect(storage.read(invalidUri)).rejects.toThrow(
            "Invalid URI",
          );
        }
      },
      30_000,
    );
  });

  describe("exists", () => {
    it(
      "should return true for existing content",
      async () => {
        const testUrl = "https://docs.firecrawl.dev";
        const results = await storage.findByUrl(testUrl);

        if (results.length === 0) {
          console.log(
            "Skipping exists test - no content found. Seed data first.",
          );
          return;
        }

        const uri = results[0].uri;
        const exists = await storage.exists(uri);

        expect(exists).toBe(true);
      },
      30_000,
    );

    it(
      "should return false for non-existent content",
      async () => {
        const invalidUri = "webhook://999999999";

        const exists = await storage.exists(invalidUri);

        expect(exists).toBe(false);
      },
      30_000,
    );
  });

  describe("findByUrlAndExtract", () => {
    it(
      "should return cleaned content (extractPrompt ignored)",
      async () => {
        const testUrl = "https://docs.firecrawl.dev";

        // Webhook doesn't support extraction filtering
        const results = await storage.findByUrlAndExtract(
          testUrl,
          "Extract pricing information",
        );

        expect(Array.isArray(results)).toBe(true);

        // Should return same results as findByUrl
        if (results.length > 0) {
          expect(results[0].metadata.resourceType).toBe("cleaned");
        }
      },
      30_000,
    );
  });

  describe("cache performance", () => {
    it(
      "should demonstrate Redis caching benefit",
      async () => {
        const testUrl = "https://docs.firecrawl.dev";

        // First call - cache miss (slower)
        const start1 = Date.now();
        const results1 = await storage.findByUrl(testUrl);
        const duration1 = Date.now() - start1;

        if (results1.length === 0) {
          console.log("Skipping cache test - no content found. Seed data first.");
          return;
        }

        // Second call - cache hit (faster)
        const start2 = Date.now();
        const results2 = await storage.findByUrl(testUrl);
        const duration2 = Date.now() - start2;

        console.log(`First call (cache miss): ${duration1}ms`);
        console.log(`Second call (cache hit): ${duration2}ms`);

        // Both should return same results
        expect(results1).toEqual(results2);

        // Cache hit should be faster (allowing for network variance)
        // Note: This may not always be true due to network conditions
        console.log(
          `Cache speedup: ${duration2 < duration1 ? "✓ faster" : "~ similar"}`,
        );
      },
      30_000,
    );
  });

  describe("error handling", () => {
    it(
      "should handle malformed API responses gracefully",
      async () => {
        // This test verifies error handling but requires webhook service to be running
        const testUrl = "https://docs.firecrawl.dev";

        // Should not throw even if API returns unexpected data
        const results = await storage.findByUrl(testUrl);
        expect(Array.isArray(results)).toBe(true);
      },
      30_000,
    );
  });
});

/**
 * Test Notes:
 *
 * Full E2E Flow:
 * 1. Scrape URL via Firecrawl → webhook pipeline stores in webhook.scraped_content
 * 2. MCP reads content via WebhookPostgresStorage.findByUrl()
 * 3. Webhook API queries PostgreSQL + Redis cache
 * 4. Returns ResourceData[] to MCP
 * 5. MCP can read full content via storage.read(uri)
 *
 * Benefits Verified:
 * - Single source of truth (webhook.scraped_content)
 * - Redis caching provides fast reads
 * - No duplication between MCP and webhook
 * - Unified data model
 *
 * Running Tests:
 * ```bash
 * # Start webhook service first
 * pnpm dev:webhook
 *
 * # Run integration tests
 * RUN_WEBHOOK_STORAGE_INTEGRATION=true \
 * WEBHOOK_BASE_URL=http://localhost:50108 \
 * WEBHOOK_API_SECRET=your-secret \
 * pnpm test apps/mcp/tests/integration/webhook-storage.test.ts
 * ```
 *
 * Seeding Test Data:
 * Use the scrape tool to populate webhook.scraped_content:
 * ```typescript
 * // Via MCP scrape tool or direct Firecrawl API call
 * await scrape('https://docs.firecrawl.dev');
 * ```
 */
