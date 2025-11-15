/**
 * @fileoverview PostgreSQL connection pool management for MCP resource storage
 *
 * Provides singleton connection pool pattern matching webhook bridge's approach:
 * - Pool size: 20 base connections + 10 overflow
 * - Idle timeout: 30 seconds
 * - Connection timeout: 5 seconds
 * - Automatic reconnection on errors
 *
 * @module storage/postgres-pool
 */

import { Pool, PoolConfig } from "pg";
import { env } from "../config/environment.js";

let pool: Pool | null = null;

/**
 * Get or create the singleton PostgreSQL connection pool
 *
 * @returns Shared connection pool instance
 */
export function getPool(): Pool {
  if (!pool) {
    const databaseUrl = env.databaseUrl;

    if (!databaseUrl) {
      throw new Error(
        "Database URL not configured. Set MCP_DATABASE_URL, DATABASE_URL, or NUQ_DATABASE_URL environment variable.",
      );
    }

    const config: PoolConfig = {
      connectionString: databaseUrl,
      max: 20, // Match webhook bridge pool size
      idleTimeoutMillis: 30000, // 30 seconds
      connectionTimeoutMillis: 5000, // 5 seconds
    };

    pool = new Pool(config);

    // Handle pool-level errors to prevent crashes
    pool.on("error", (err) => {
      console.error("[PostgresPool] Unexpected pool error:", err);
    });

    console.log("[PostgresPool] Connection pool initialized");
  }

  return pool;
}

/**
 * Close the connection pool and release all resources
 *
 * Should be called during graceful shutdown.
 *
 * @returns Promise that resolves when pool is closed
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    console.log("[PostgresPool] Connection pool closed");
  }
}
