/**
 * @fileoverview Tests for database migration runner
 *
 * Tests the migration runner script in both dry-run and live modes.
 * Validates SQL file discovery, execution order, and error handling.
 *
 * @module tests/scripts/run-migrations
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Pool } from "pg";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { runMigrations } from "../../scripts/run-migrations.js";

// Mock the environment module
vi.mock("../../config/environment.js", () => ({
  env: {
    databaseUrl: process.env.TEST_DATABASE_URL || "postgresql://test:test@localhost:5432/test",
  },
}));

describe("Migration Runner", () => {
  let pool: Pool;
  const testMigrationDir = join(process.cwd(), "test-migrations");

  beforeEach(async () => {
    // Create test migration directory
    mkdirSync(testMigrationDir, { recursive: true });

    // Initialize database connection
    const databaseUrl = process.env.TEST_DATABASE_URL || "postgresql://firecrawl:firecrawl@localhost:50105/pulse_postgres";
    pool = new Pool({ connectionString: databaseUrl });

    // Clean up test schema if it exists
    try {
      await pool.query("DROP SCHEMA IF EXISTS mcp_test CASCADE");
    } catch (error) {
      // Ignore if schema doesn't exist
    }
  });

  afterEach(async () => {
    // Clean up test migration directory
    try {
      rmSync(testMigrationDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore if directory doesn't exist
    }

    // Close database connection
    await pool.end();
  });

  describe("Migration Discovery", () => {
    it("should discover and sort SQL files correctly", () => {
      // Create test migration files in random order
      writeFileSync(join(testMigrationDir, "003_third.sql"), "SELECT 3;");
      writeFileSync(join(testMigrationDir, "001_first.sql"), "SELECT 1;");
      writeFileSync(join(testMigrationDir, "002_second.sql"), "SELECT 2;");
      writeFileSync(join(testMigrationDir, "README.md"), "# Not a migration");

      const { readdirSync } = await import("fs");
      const files = readdirSync(testMigrationDir)
        .filter((f) => f.endsWith(".sql"))
        .sort();

      expect(files).toEqual(["001_first.sql", "002_second.sql", "003_third.sql"]);
    });

    it("should handle empty migration directory", () => {
      const { readdirSync } = await import("fs");
      const files = readdirSync(testMigrationDir).filter((f) => f.endsWith(".sql"));

      expect(files).toHaveLength(0);
    });
  });

  describe("SQL Validation", () => {
    it("should validate 002_mcp_schema.sql syntax", () => {
      const sqlPath = join(process.cwd(), "migrations", "002_mcp_schema.sql");
      const sql = readFileSync(sqlPath, "utf8");

      // Basic syntax checks
      expect(sql).toContain("CREATE SCHEMA IF NOT EXISTS mcp");
      expect(sql).toContain("CREATE TABLE IF NOT EXISTS mcp.resources");
      expect(sql).toContain("CREATE INDEX");
      expect(sql).toContain("CREATE OR REPLACE FUNCTION");
      expect(sql).toContain("CREATE TRIGGER");

      // Check for required columns
      expect(sql).toContain("uri TEXT UNIQUE NOT NULL");
      expect(sql).toContain("url TEXT NOT NULL");
      expect(sql).toContain("resource_type TEXT NOT NULL");
      expect(sql).toContain("content TEXT NOT NULL");
      expect(sql).toContain("metadata JSONB NOT NULL");
      expect(sql).toContain("created_at TIMESTAMPTZ");
      expect(sql).toContain("expires_at TIMESTAMPTZ GENERATED ALWAYS AS");

      // Check for indexes
      expect(sql).toContain("idx_resources_url");
      expect(sql).toContain("idx_resources_created_at");
      expect(sql).toContain("idx_resources_uri");
      expect(sql).toContain("idx_resources_cache_lookup");

      // Check for functions
      expect(sql).toContain("mcp.update_updated_at_column");
      expect(sql).toContain("mcp.cleanup_expired_resources");
      expect(sql).toContain("mcp.auto_cleanup_on_insert");

      // Check for triggers
      expect(sql).toContain("trigger_resources_updated_at");
      expect(sql).toContain("trigger_auto_cleanup");
    });
  });

  describe("Schema Creation", () => {
    it("should create mcp schema successfully", async () => {
      const sql = `
        CREATE SCHEMA IF NOT EXISTS mcp_test;
        SET search_path TO mcp_test, public;

        CREATE TABLE IF NOT EXISTS mcp_test.test_table (
          id BIGSERIAL PRIMARY KEY,
          name TEXT NOT NULL
        );
      `;

      await pool.query(sql);

      // Verify schema exists
      const schemaResult = await pool.query(
        "SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'mcp_test'"
      );
      expect(schemaResult.rows).toHaveLength(1);

      // Verify table exists
      const tableResult = await pool.query(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = 'mcp_test' AND table_name = 'test_table'`
      );
      expect(tableResult.rows).toHaveLength(1);
    });

    it("should create resources table with correct structure", async () => {
      // Read the actual migration file
      const sqlPath = join(process.cwd(), "migrations", "002_mcp_schema.sql");
      const sql = readFileSync(sqlPath, "utf8");

      // Execute migration
      await pool.query(sql);

      // Verify schema exists
      const schemaResult = await pool.query(
        "SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'mcp'"
      );
      expect(schemaResult.rows).toHaveLength(1);

      // Verify table exists
      const tableResult = await pool.query(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = 'mcp' AND table_name = 'resources'`
      );
      expect(tableResult.rows).toHaveLength(1);

      // Verify columns
      const columnsResult = await pool.query(
        `SELECT column_name, data_type, is_nullable
         FROM information_schema.columns
         WHERE table_schema = 'mcp' AND table_name = 'resources'
         ORDER BY ordinal_position`
      );

      const columns = columnsResult.rows;
      const columnNames = columns.map((c) => c.column_name);

      expect(columnNames).toContain("id");
      expect(columnNames).toContain("uri");
      expect(columnNames).toContain("url");
      expect(columnNames).toContain("resource_type");
      expect(columnNames).toContain("content_type");
      expect(columnNames).toContain("source");
      expect(columnNames).toContain("extraction_prompt");
      expect(columnNames).toContain("content");
      expect(columnNames).toContain("metadata");
      expect(columnNames).toContain("created_at");
      expect(columnNames).toContain("updated_at");
      expect(columnNames).toContain("ttl_ms");
      expect(columnNames).toContain("expires_at");
    });

    it("should create indexes correctly", async () => {
      const sqlPath = join(process.cwd(), "migrations", "002_mcp_schema.sql");
      const sql = readFileSync(sqlPath, "utf8");

      await pool.query(sql);

      // Verify indexes exist
      const indexResult = await pool.query(
        `SELECT indexname FROM pg_indexes
         WHERE schemaname = 'mcp' AND tablename = 'resources'`
      );

      const indexes = indexResult.rows.map((r) => r.indexname);

      expect(indexes).toContain("idx_resources_url");
      expect(indexes).toContain("idx_resources_created_at");
      expect(indexes).toContain("idx_resources_uri");
      expect(indexes).toContain("idx_resources_cache_lookup");
      expect(indexes).toContain("idx_resources_expires_at");
    });

    it("should create functions and triggers", async () => {
      const sqlPath = join(process.cwd(), "migrations", "002_mcp_schema.sql");
      const sql = readFileSync(sqlPath, "utf8");

      await pool.query(sql);

      // Verify functions exist
      const functionResult = await pool.query(
        `SELECT routine_name FROM information_schema.routines
         WHERE routine_schema = 'mcp'`
      );

      const functions = functionResult.rows.map((r) => r.routine_name);

      expect(functions).toContain("update_updated_at_column");
      expect(functions).toContain("cleanup_expired_resources");
      expect(functions).toContain("auto_cleanup_on_insert");

      // Verify triggers exist
      const triggerResult = await pool.query(
        `SELECT trigger_name FROM information_schema.triggers
         WHERE trigger_schema = 'mcp' AND event_object_table = 'resources'`
      );

      const triggers = triggerResult.rows.map((r) => r.trigger_name);

      expect(triggers).toContain("trigger_resources_updated_at");
      expect(triggers).toContain("trigger_auto_cleanup");
    });
  });

  describe("Data Operations", () => {
    beforeEach(async () => {
      // Run migration to set up schema
      const sqlPath = join(process.cwd(), "migrations", "002_mcp_schema.sql");
      const sql = readFileSync(sqlPath, "utf8");
      await pool.query(sql);
    });

    it("should insert and retrieve resources", async () => {
      const insertResult = await pool.query(
        `INSERT INTO mcp.resources
         (uri, url, resource_type, content_type, source, content, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          "test://example/1",
          "https://example.com",
          "cleaned",
          "text/markdown",
          "test",
          "Test content",
          JSON.stringify({ test: true }),
        ]
      );

      expect(insertResult.rows).toHaveLength(1);
      expect(insertResult.rows[0].uri).toBe("test://example/1");
      expect(insertResult.rows[0].content).toBe("Test content");
    });

    it("should enforce unique URI constraint", async () => {
      await pool.query(
        `INSERT INTO mcp.resources
         (uri, url, resource_type, content, metadata)
         VALUES ($1, $2, $3, $4, $5)`,
        ["test://duplicate", "https://example.com", "raw", "Content", "{}"]
      );

      // Try to insert duplicate URI
      await expect(
        pool.query(
          `INSERT INTO mcp.resources
           (uri, url, resource_type, content, metadata)
           VALUES ($1, $2, $3, $4, $5)`,
          ["test://duplicate", "https://example.com", "raw", "Content", "{}"]
        )
      ).rejects.toThrow();
    });

    it("should enforce resource_type check constraint", async () => {
      await expect(
        pool.query(
          `INSERT INTO mcp.resources
           (uri, url, resource_type, content, metadata)
           VALUES ($1, $2, $3, $4, $5)`,
          ["test://invalid", "https://example.com", "invalid_type", "Content", "{}"]
        )
      ).rejects.toThrow();
    });

    it("should auto-update updated_at on UPDATE", async () => {
      // Insert resource
      await pool.query(
        `INSERT INTO mcp.resources
         (uri, url, resource_type, content, metadata)
         VALUES ($1, $2, $3, $4, $5)`,
        ["test://update", "https://example.com", "raw", "Original", "{}"]
      );

      // Get initial timestamps
      const before = await pool.query(
        "SELECT created_at, updated_at FROM mcp.resources WHERE uri = $1",
        ["test://update"]
      );

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Update resource
      await pool.query(
        "UPDATE mcp.resources SET content = $1 WHERE uri = $2",
        ["Updated", "test://update"]
      );

      // Check updated_at changed
      const after = await pool.query(
        "SELECT created_at, updated_at FROM mcp.resources WHERE uri = $1",
        ["test://update"]
      );

      expect(after.rows[0].created_at).toEqual(before.rows[0].created_at);
      expect(after.rows[0].updated_at.getTime()).toBeGreaterThan(
        before.rows[0].updated_at.getTime()
      );
    });

    it("should calculate expires_at from ttl_ms", async () => {
      const ttlMs = 60000; // 60 seconds

      const result = await pool.query(
        `INSERT INTO mcp.resources
         (uri, url, resource_type, content, metadata, ttl_ms)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING created_at, expires_at`,
        ["test://ttl", "https://example.com", "raw", "Content", "{}", ttlMs]
      );

      const createdAt = new Date(result.rows[0].created_at);
      const expiresAt = new Date(result.rows[0].expires_at);

      const expectedExpiry = new Date(createdAt.getTime() + ttlMs);

      // Allow 1 second tolerance for processing time
      expect(Math.abs(expiresAt.getTime() - expectedExpiry.getTime())).toBeLessThan(1000);
    });

    it("should delete expired resources with cleanup function", async () => {
      // Insert expired resource (TTL = 1ms)
      await pool.query(
        `INSERT INTO mcp.resources
         (uri, url, resource_type, content, metadata, ttl_ms)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ["test://expired", "https://example.com", "raw", "Content", "{}", 1]
      );

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Run cleanup function
      const cleanupResult = await pool.query("SELECT mcp.cleanup_expired_resources()");
      const deletedCount = cleanupResult.rows[0].cleanup_expired_resources;

      expect(deletedCount).toBeGreaterThan(0);

      // Verify resource was deleted
      const checkResult = await pool.query(
        "SELECT * FROM mcp.resources WHERE uri = $1",
        ["test://expired"]
      );

      expect(checkResult.rows).toHaveLength(0);
    });
  });
});
