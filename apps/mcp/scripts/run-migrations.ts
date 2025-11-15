#!/usr/bin/env tsx
/**
 * @fileoverview Database migration runner for MCP server
 *
 * Runs SQL migration files in order from the migrations/ directory.
 * Supports dry-run mode for testing without executing migrations.
 *
 * Usage:
 *   pnpm mcp:migrate              # Run all migrations
 *   pnpm mcp:migrate --dry-run    # Show what would be executed
 *
 * @module scripts/run-migrations
 */

import { Pool } from "pg";
import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { env } from "../config/environment.js";

// Get directory name in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Parse command line arguments
 */
interface Args {
  dryRun: boolean;
  help: boolean;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes("--dry-run"),
    help: args.includes("--help") || args.includes("-h"),
  };
}

/**
 * Display help message
 */
function showHelp(): void {
  console.log(`
Database Migration Runner

Usage:
  pnpm mcp:migrate              Run all migrations
  pnpm mcp:migrate --dry-run    Show migrations without executing
  pnpm mcp:migrate --help       Show this help message

Environment:
  MCP_DATABASE_URL    PostgreSQL connection string (required)
  DATABASE_URL        Fallback database URL
  NUQ_DATABASE_URL    Fallback to Firecrawl database URL

Example:
  MCP_DATABASE_URL=postgresql://user:pass@localhost:5432/db pnpm mcp:migrate
`);
}

/**
 * Run database migrations
 */
async function runMigrations(dryRun = false): Promise<void> {
  const databaseUrl = env.databaseUrl;

  if (!databaseUrl) {
    throw new Error(
      "Database URL not configured. Set MCP_DATABASE_URL, DATABASE_URL, or NUQ_DATABASE_URL",
    );
  }

  console.log("=== MCP Database Migration Runner ===\n");
  console.log(`Mode: ${dryRun ? "DRY RUN (no changes will be made)" : "LIVE"}`);
  console.log(`Database: ${databaseUrl.replace(/:[^:@]+@/, ":***@")}\n`);

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    // Test connection
    await pool.query("SELECT 1");
    console.log("✓ Database connection successful\n");

    const migrationDir = join(__dirname, "../migrations");
    const files = readdirSync(migrationDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    if (files.length === 0) {
      console.log("No migration files found in", migrationDir);
      return;
    }

    console.log(`Found ${files.length} migration file(s):\n`);

    for (const file of files) {
      const filepath = join(migrationDir, file);
      const sql = readFileSync(filepath, "utf8");

      console.log(`📄 ${file}`);
      console.log(
        `   Size: ${(sql.length / 1024).toFixed(2)} KB, Lines: ${sql.split("\n").length}`,
      );

      if (dryRun) {
        console.log("   [DRY RUN] Would execute this migration\n");
        continue;
      }

      try {
        const startTime = Date.now();
        await pool.query(sql);
        const duration = Date.now() - startTime;

        console.log(`   ✓ Completed in ${duration}ms\n`);
      } catch (error) {
        console.error(`   ✗ FAILED: ${error instanceof Error ? error.message : String(error)}\n`);
        throw error;
      }
    }

    if (dryRun) {
      console.log("=== DRY RUN COMPLETE (no changes made) ===");
    } else {
      console.log("=== ALL MIGRATIONS COMPLETED SUCCESSFULLY ===");
    }
  } catch (error) {
    console.error("\n=== MIGRATION FAILED ===");
    console.error(error instanceof Error ? error.message : String(error));
    throw error;
  } finally {
    await pool.end();
  }
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const args = parseArgs();

  if (args.help) {
    showHelp();
    process.exit(0);
  }

  try {
    await runMigrations(args.dryRun);
    process.exit(0);
  } catch (error) {
    console.error("\nMigration runner failed:", error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { runMigrations };
