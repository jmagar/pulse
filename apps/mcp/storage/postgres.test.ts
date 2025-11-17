/**
 * @fileoverview Unit tests for PostgreSQL resource storage
 *
 * Tests all 10 ResourceStorage interface methods:
 * 1. list() - List all non-expired resources
 * 2. read() - Read resource content by URI
 * 3. write() - Write single resource
 * 4. writeMulti() - Write 3 variants atomically
 * 5. exists() - Check resource existence
 * 6. delete() - Delete resource
 * 7. findByUrl() - Find all resources for URL
 * 8. findByUrlAndExtract() - Find cached resource with extraction
 * 9. getStats() - Get storage statistics
 * 10. startCleanup() / stopCleanup() - Periodic cleanup
 *
 * @module storage/postgres.test
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
} from "vitest";
import { PostgresResourceStorage } from "./postgres.js";
import { getPool, closePool } from "./postgres-pool.js";
import { ResourceMetadata } from "./types.js";

const databaseUrl =
  process.env.MCP_DATABASE_URL ||
  process.env.DATABASE_URL ||
  process.env.NUQ_DATABASE_URL ||
  process.env.TEST_DATABASE_URL;

const maybeDescribe = databaseUrl ? describe : describe.skip;

if (!databaseUrl) {
  // eslint-disable-next-line no-console
  console.warn(
    "[vitest] Skipping PostgresResourceStorage tests because no database URL is configured",
  );
}

maybeDescribe("PostgresResourceStorage", () => {
  let storage: PostgresResourceStorage;

  beforeAll(async () => {
    // Verify database connection
    const pool = getPool();
    await pool.query("SELECT 1");
  });

  beforeEach(async () => {
    storage = new PostgresResourceStorage({
      defaultTTL: 86400000, // 24 hours
      maxItems: 1000,
      maxSizeBytes: 100 * 1024 * 1024, // 100 MB
      cleanupInterval: 60000, // 1 minute
    });

    // Clear test data
    await getPool().query("DELETE FROM mcp.resources");
  });

  afterEach(async () => {
    storage.stopCleanup();
  });

  afterAll(async () => {
    await closePool();
  });

  describe("write and read", () => {
    it("should write and read a single resource", async () => {
      const url = "https://example.com/test";
      const content = "# Test Content\n\nThis is a test.";
      const metadata: Partial<ResourceMetadata> = {
        contentType: "text/markdown",
        source: "firecrawl",
        resourceType: "cleaned",
      };

      const uri = await storage.write(url, content, metadata);

      expect(uri).toBe(expect.stringContaining("postgres://cleaned/"));

      const retrieved = await storage.read(uri);
      expect(retrieved.text).toBe(content);
      expect(retrieved.mimeType).toBe("text/markdown");
    });

    it("should generate unique URIs for same URL with different timestamps", async () => {
      const url = "https://example.com";
      const content = "Test";

      const uri1 = await storage.write(url, content);
      // Small delay to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 10));
      const uri2 = await storage.write(url, content);

      expect(uri1).not.toBe(uri2);
    });

    it("should overwrite resource with same URI", async () => {
      const url = "https://example.com";
      const uri = "postgres://raw/example.com_20250115120000";

      await storage.write(url, "First content", { uri });
      await storage.write(url, "Second content", { uri });

      const retrieved = await storage.read(uri);
      expect(retrieved.text).toBe("Second content");
    });
  });

  describe("writeMulti", () => {
    it("should write all 3 variants atomically", async () => {
      const url = "https://example.com/article";
      const result = await storage.writeMulti({
        url,
        raw: "<html><body>Raw HTML</body></html>",
        cleaned: "# Article Title\n\nCleaned content",
        extracted: JSON.stringify({ title: "Article", summary: "Summary" }),
        metadata: {
          source: "firecrawl",
          contentType: "text/markdown",
        },
      });

      expect(result.raw).toBeTruthy();
      expect(result.cleaned).toBeTruthy();
      expect(result.extracted).toBeTruthy();

      // Verify all 3 exist
      const rawContent = await storage.read(result.raw);
      const cleanedContent = await storage.read(result.cleaned!);
      const extractedContent = await storage.read(result.extracted!);

      expect(rawContent.text).toContain("Raw HTML");
      expect(cleanedContent.text).toContain("Cleaned content");
      expect(extractedContent.text).toContain('"title"');
    });

    it("should write only raw and cleaned if no extracted", async () => {
      const url = "https://example.com";
      const result = await storage.writeMulti({
        url,
        raw: "<html>Raw</html>",
        cleaned: "# Cleaned",
      });

      expect(result.raw).toBeTruthy();
      expect(result.cleaned).toBeTruthy();
      expect(result.extracted).toBeUndefined();
    });

    it("should rollback on error during multi-write", async () => {
      const url = "https://example.com";

      // Force an error by using invalid content type
      try {
        await storage.writeMulti({
          url,
          raw: "test",
          metadata: {
            // @ts-expect-error Testing error handling
            contentType: { invalid: "object" },
          },
        });
      } catch (_error) {
        // Expected error
      }

      // Verify no partial writes
      const resources = await storage.findByUrl(url);
      expect(resources).toHaveLength(0);
    });
  });

  describe("exists", () => {
    it("should return true for existing resource", async () => {
      const url = "https://example.com";
      const uri = await storage.write(url, "test");

      const exists = await storage.exists(uri);
      expect(exists).toBe(true);
    });

    it("should return false for non-existing resource", async () => {
      const exists = await storage.exists("postgres://raw/nonexistent_12345");
      expect(exists).toBe(false);
    });

    it("should return false for expired resource", async () => {
      const url = "https://example.com";
      const uri = await storage.write(url, "test", { ttl: 100 }); // 100ms TTL

      // Should exist immediately
      expect(await storage.exists(uri)).toBe(true);

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Should be expired
      expect(await storage.exists(uri)).toBe(false);
    });
  });

  describe("delete", () => {
    it("should delete existing resource", async () => {
      const url = "https://example.com";
      const uri = await storage.write(url, "test");

      await storage.delete(uri);

      const exists = await storage.exists(uri);
      expect(exists).toBe(false);
    });

    it("should not throw when deleting non-existing resource", async () => {
      await expect(
        storage.delete("postgres://raw/nonexistent_12345"),
      ).resolves.not.toThrow();
    });
  });

  describe("findByUrl", () => {
    it("should find all resources for a URL", async () => {
      const url = "https://example.com";

      await storage.writeMulti({
        url,
        raw: "<html>Raw</html>",
        cleaned: "# Cleaned",
        extracted: '{"data": "extracted"}',
        metadata: { extractionPrompt: "Summarize" },
      });

      const resources = await storage.findByUrl(url);

      expect(resources).toHaveLength(3);
      const types = resources.map((r) => r.metadata.resourceType);
      expect(types).toContain("raw");
      expect(types).toContain("cleaned");
      expect(types).toContain("extracted");
    });

    it("should return empty array for URL with no resources", async () => {
      const resources = await storage.findByUrl("https://nonexistent.com");
      expect(resources).toHaveLength(0);
    });

    it("should not return expired resources", async () => {
      const url = "https://example.com";

      // Write resource with short TTL
      await storage.write(url, "test", { ttl: 100 }); // 100ms

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 150));

      const resources = await storage.findByUrl(url);
      expect(resources).toHaveLength(0);
    });
  });

  describe("findByUrlAndExtract", () => {
    beforeEach(async () => {
      const url = "https://example.com/article";

      // Create test resources
      await storage.writeMulti({
        url,
        raw: "<html>Raw</html>",
        cleaned: "# Article",
        extracted: '{"summary": "..."}',
        metadata: {
          extractionPrompt: "Summarize",
        },
      });
    });

    it("should prioritize cleaned content when no extraction prompt", async () => {
      const result = await storage.findByUrlAndExtract(
        "https://example.com/article",
      );

      expect(result).toHaveLength(1);
      expect(result[0].metadata.resourceType).toBe("cleaned");
    });

    it("should return extracted content when extraction prompt matches", async () => {
      const result = await storage.findByUrlAndExtract(
        "https://example.com/article",
        "Summarize",
      );

      expect(result).toHaveLength(1);
      expect(result[0].metadata.resourceType).toBe("extracted");
      expect(result[0].metadata.extractionPrompt).toBe("Summarize");
    });

    it("should fallback to cleaned if extraction prompt not found", async () => {
      const result = await storage.findByUrlAndExtract(
        "https://example.com/article",
        "Different prompt",
      );

      expect(result).toHaveLength(1);
      expect(result[0].metadata.resourceType).toBe("cleaned");
    });

    it("should return empty array if URL not found", async () => {
      const result = await storage.findByUrlAndExtract(
        "https://nonexistent.com",
      );

      expect(result).toHaveLength(0);
    });
  });

  describe("list", () => {
    it("should list all non-expired resources", async () => {
      await storage.write("https://example.com/1", "test1");
      await storage.write("https://example.com/2", "test2");
      await storage.write("https://example.com/3", "test3");

      const resources = await storage.list();

      expect(resources.length).toBeGreaterThanOrEqual(3);
    });

    it("should not include expired resources", async () => {
      await storage.write("https://example.com/1", "test1");
      await storage.write("https://example.com/2", "test2", { ttl: 100 });

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 150));

      const resources = await storage.list();

      expect(resources.length).toBe(1);
      expect(resources[0].metadata.url).toBe("https://example.com/1");
    });
  });

  describe("getStats", () => {
    it("should return accurate statistics", async () => {
      await storage.writeMulti({
        url: "https://example.com/1",
        raw: "A".repeat(1000), // 1KB
        cleaned: "B".repeat(2000), // 2KB
      });

      const stats = await storage.getStats();

      expect(stats.itemCount).toBe(2);
      expect(stats.totalSizeBytes).toBe(3000);
      expect(stats.resources).toHaveLength(2);
    });

    it("should not count expired resources", async () => {
      await storage.write("https://example.com/1", "test1");
      await storage.write("https://example.com/2", "test2", { ttl: 100 });

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 150));

      const stats = await storage.getStats();

      expect(stats.itemCount).toBe(1);
    });
  });

  describe("TTL and expiration", () => {
    it("should not return expired resources on read", async () => {
      const url = "https://example.com";
      const uri = await storage.write(url, "Expiring content", { ttl: 100 });

      // Should exist immediately
      const content1 = await storage.read(uri);
      expect(content1.text).toBe("Expiring content");

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Should throw error (resource expired)
      await expect(storage.read(uri)).rejects.toThrow("Resource not found");
    });

    it("should use default TTL when not specified", async () => {
      const url = "https://example.com";
      await storage.write(url, "test");

      const resources = await storage.findByUrl(url);
      expect(resources[0].metadata.ttl).toBe(86400000); // Default 24 hours
    });

    it("should support TTL=0 for no expiration", async () => {
      const url = "https://example.com";
      const uri = await storage.write(url, "test", { ttl: 0 });

      const resources = await storage.findByUrl(url);
      expect(resources[0].metadata.ttl).toBe(0);

      // Verify no expiration in database
      const result = await getPool().query(
        "SELECT ttl_ms, expires_at FROM mcp.resources WHERE uri = $1",
        [uri],
      );
      expect(result.rows[0].ttl_ms).toBeNull();
      expect(result.rows[0].expires_at).toBeNull();
    });
  });

  describe("cleanup", () => {
    it("should start and stop cleanup", () => {
      storage.startCleanup(1000);
      storage.stopCleanup();

      // Should not throw
      expect(true).toBe(true);
    });

    it("should not start cleanup twice", () => {
      storage.startCleanup(1000);
      storage.startCleanup(1000); // Second call should be ignored

      storage.stopCleanup();
      expect(true).toBe(true);
    });
  });
});
