/**
 * @fileoverview PostgreSQL-backed resource storage implementation
 *
 * Implements ResourceStorage interface using PostgreSQL as persistence layer.
 * Features:
 * - Connection pooling for performance
 * - Transactional writeMulti for ACID guarantees
 * - Indexed cache lookups (O(log n) vs O(n))
 * - Automatic TTL-based expiration
 * - Compatible with existing memory/filesystem storage interfaces
 *
 * @module storage/postgres
 */

import { Pool, PoolClient } from "pg";
import { getPool } from "./postgres-pool.js";
import {
  ResourceStorage,
  ResourceData,
  ResourceContent,
  ResourceMetadata,
  ResourceType,
  MultiResourceWrite,
  MultiResourceUris,
  ResourceCacheOptions,
  ResourceCacheStats,
  ResourceCacheEntry,
} from "./types.js";
import { DbResourceRow, dbRowToResourceData } from "./postgres-types.js";
import { resolveCacheOptions, ResolvedCacheOptions } from "./cache-options.js";

/**
 * PostgreSQL implementation of ResourceStorage
 *
 * Stores resources in mcp.resources table with:
 * - JSONB metadata for flexibility
 * - Generated expires_at column for auto-cleanup
 * - Indexes on url, uri, and (url, extraction_prompt)
 */
export class PostgresResourceStorage implements ResourceStorage {
  private pool: Pool;
  private cleanupInterval?: NodeJS.Timeout;
  private options: ResolvedCacheOptions;

  constructor(options: ResourceCacheOptions = {}) {
    this.pool = getPool();
    this.options = resolveCacheOptions(options);
  }

  /**
   * List all non-expired resources
   *
   * @returns Array of resource metadata
   */
  async list(): Promise<ResourceData[]> {
    const result = await this.pool.query<DbResourceRow>(
      `SELECT * FROM mcp.resources
       WHERE expires_at IS NULL OR expires_at > NOW()
       ORDER BY created_at DESC`,
    );

    return result.rows.map(dbRowToResourceData);
  }

  /**
   * Read resource content by URI
   *
   * @param uri - Resource URI (e.g., "postgres://cleaned/example.com_20250115")
   * @returns Resource content with MIME type
   * @throws Error if resource not found or expired
   */
  async read(uri: string): Promise<ResourceContent> {
    const result = await this.pool.query<DbResourceRow>(
      `SELECT uri, content_type, content FROM mcp.resources
       WHERE uri = $1
       AND (expires_at IS NULL OR expires_at > NOW())`,
      [uri],
    );

    if (result.rows.length === 0) {
      throw new Error(`Resource not found: ${uri}`);
    }

    const row = result.rows[0];
    return {
      uri: row.uri,
      mimeType: row.content_type,
      text: row.content,
    };
  }

  /**
   * Write a single resource
   *
   * @param url - Source URL
   * @param content - Resource content (HTML, markdown, JSON, etc.)
   * @param metadata - Optional metadata (resourceType, ttl, etc.)
   * @returns Generated URI for the resource
   */
  async write(
    url: string,
    content: string,
    metadata?: Partial<ResourceMetadata>,
  ): Promise<string> {
    const timestamp = new Date().toISOString();
    const resourceType = metadata?.resourceType || "raw";
    const uri = this.generateUri(url, timestamp, resourceType);
    const ttl = this.resolveTtl(metadata);

    const fullMetadata: ResourceMetadata = {
      ...metadata,
      url,
      timestamp,
      resourceType,
      ttl,
    };

    await this.pool.query(
      `INSERT INTO mcp.resources (
        uri, url, resource_type, content_type, source,
        extraction_prompt, content, metadata, ttl_ms
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (uri) DO UPDATE SET
        content = EXCLUDED.content,
        metadata = EXCLUDED.metadata,
        updated_at = NOW()`,
      [
        uri,
        url,
        resourceType,
        metadata?.contentType || "text/plain",
        metadata?.source || "unknown",
        metadata?.extractionPrompt || null,
        content,
        JSON.stringify(fullMetadata),
        ttl > 0 ? ttl : null,
      ],
    );

    return uri;
  }

  /**
   * Write multiple resources atomically (3 variants: raw, cleaned, extracted)
   *
   * Uses transaction to ensure all-or-nothing write.
   * This is critical for maintaining consistency when saving scrape results.
   *
   * @param data - Multi-resource write data
   * @returns URIs for each written resource
   */
  async writeMulti(data: MultiResourceWrite): Promise<MultiResourceUris> {
    const client = await this.pool.connect();
    const uris: MultiResourceUris = {} as MultiResourceUris;

    try {
      await client.query("BEGIN");

      const timestamp = new Date().toISOString();

      // Write raw resource
      uris.raw = await this.writeWithClient(client, {
        url: data.url,
        content: data.raw,
        metadata: { ...data.metadata, resourceType: "raw" },
        timestamp,
      });

      // Write cleaned resource if provided
      if (data.cleaned) {
        uris.cleaned = await this.writeWithClient(client, {
          url: data.url,
          content: data.cleaned,
          metadata: { ...data.metadata, resourceType: "cleaned" },
          timestamp,
        });
      }

      // Write extracted resource if provided
      if (data.extracted) {
        const extractPrompt = (data.metadata?.extractionPrompt ||
          (data.metadata as Record<string, unknown>)?.extract) as
          | string
          | undefined;

        const { extract: _extract, ...metadataWithoutExtract } =
          (data.metadata || {}) as Record<string, unknown>;

        uris.extracted = await this.writeWithClient(client, {
          url: data.url,
          content: data.extracted,
          metadata: {
            ...metadataWithoutExtract,
            resourceType: "extracted",
            extractionPrompt: extractPrompt,
          },
          timestamp,
        });
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    return uris;
  }

  /**
   * Check if resource exists (not expired)
   *
   * @param uri - Resource URI
   * @returns True if resource exists and not expired
   */
  async exists(uri: string): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT 1 FROM mcp.resources
       WHERE uri = $1
       AND (expires_at IS NULL OR expires_at > NOW())`,
      [uri],
    );

    return result.rows.length > 0;
  }

  /**
   * Delete a resource permanently
   *
   * @param uri - Resource URI to delete
   */
  async delete(uri: string): Promise<void> {
    await this.pool.query(`DELETE FROM mcp.resources WHERE uri = $1`, [uri]);
  }

  /**
   * Find all resources for a given URL
   *
   * Returns all variants (raw, cleaned, extracted) sorted by newest first.
   *
   * @param url - Source URL
   * @returns Array of resource metadata
   */
  async findByUrl(url: string): Promise<ResourceData[]> {
    const result = await this.pool.query<DbResourceRow>(
      `SELECT * FROM mcp.resources
       WHERE url = $1
       AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY created_at DESC`,
      [url],
    );

    return result.rows.map(dbRowToResourceData);
  }

  /**
   * Find cached resource by URL and extraction prompt
   *
   * Priority order:
   * 1. Exact match: URL + extraction prompt → extracted resource
   * 2. Cleaned resource for URL (no extraction prompt needed)
   * 3. Any resource for URL (fallback)
   *
   * This implements the cache lookup logic used by scrape tool.
   *
   * @param url - Source URL
   * @param extractPrompt - Optional extraction prompt
   * @returns Matching resource data or empty array if not found
   */
  async findByUrlAndExtract(
    url: string,
    extractPrompt?: string,
  ): Promise<ResourceData[]> {
    // Try exact match first (URL + extraction prompt)
    if (extractPrompt) {
      const exactResult = await this.pool.query<DbResourceRow>(
        `SELECT * FROM mcp.resources
         WHERE url = $1
         AND resource_type = 'extracted'
         AND extraction_prompt = $2
         AND (expires_at IS NULL OR expires_at > NOW())
         ORDER BY created_at DESC
         LIMIT 1`,
        [url, extractPrompt],
      );

      if (exactResult.rows.length > 0) {
        return [dbRowToResourceData(exactResult.rows[0])];
      }
    }

    // Fallback: Find best available resource (priority: cleaned > extracted > raw)
    const fallbackResult = await this.pool.query<DbResourceRow>(
      `SELECT * FROM mcp.resources
       WHERE url = $1
       AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY
         CASE resource_type
           WHEN 'cleaned' THEN 1
           WHEN 'extracted' THEN 2
           WHEN 'raw' THEN 3
         END,
         created_at DESC
       LIMIT 1`,
      [url],
    );

    if (fallbackResult.rows.length === 0) {
      return [];
    }

    return [dbRowToResourceData(fallbackResult.rows[0])];
  }

  /**
   * Get storage statistics
   *
   * @returns Cache statistics including size, count, and resource details
   */
  async getStats(): Promise<ResourceCacheStats> {
    const statsResult = await this.pool.query<{
      count: string;
      total_size: string;
    }>(
      `SELECT
         COUNT(*)::text as count,
         SUM(LENGTH(content))::text as total_size
       FROM mcp.resources
       WHERE expires_at IS NULL OR expires_at > NOW()`,
    );

    const resourcesResult = await this.pool.query<DbResourceRow>(
      `SELECT * FROM mcp.resources
       WHERE expires_at IS NULL OR expires_at > NOW()
       ORDER BY created_at DESC`,
    );

    const stats = statsResult.rows[0];
    const resources: ResourceCacheEntry[] = resourcesResult.rows.map((row) => ({
      uri: row.uri,
      url: row.url,
      resourceType: row.resource_type,
      sizeBytes: Buffer.byteLength(row.content, "utf-8"),
      ttl: row.ttl_ms ?? 0,
      createdAt: row.created_at.getTime(),
      lastAccessTime: row.updated_at.getTime(),
      expiresAt: row.expires_at?.getTime(),
    }));

    return {
      itemCount: parseInt(stats.count, 10),
      totalSizeBytes: parseInt(stats.total_size || "0", 10),
      maxItems: this.options.maxItems,
      maxSizeBytes: this.options.maxSizeBytes,
      defaultTTL: this.options.defaultTTL,
      resources,
    };
  }

  /**
   * Start periodic cleanup of expired resources
   *
   * Calls mcp.cleanup_expired_resources() function at specified interval.
   *
   * @param intervalMs - Cleanup interval in milliseconds (optional, uses config default)
   */
  startCleanup(intervalMs?: number): void {
    if (this.cleanupInterval) {
      return; // Already running
    }

    const interval = intervalMs ?? this.options.cleanupInterval;

    this.cleanupInterval = setInterval(() => {
      void this.runCleanup();
    }, interval);

    console.log(
      `[PostgresResourceStorage] Cleanup started (interval: ${interval}ms)`,
    );
  }

  /**
   * Stop periodic cleanup
   */
  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
      console.log("[PostgresResourceStorage] Cleanup stopped");
    }
  }

  /**
   * Run cleanup manually
   *
   * Calls database function to delete expired resources.
   *
   * @private
   */
  private async runCleanup(): Promise<void> {
    try {
      const result = await this.pool.query<{ cleanup_count: number }>(
        `SELECT mcp.cleanup_expired_resources() as cleanup_count`,
      );

      const count = result.rows[0]?.cleanup_count || 0;
      if (count > 0) {
        console.log(
          `[PostgresResourceStorage] Cleaned up ${count} expired resources`,
        );
      }
    } catch (error) {
      console.error("[PostgresResourceStorage] Cleanup failed:", error);
    }
  }

  /**
   * Write a resource using an existing client (for transactions)
   *
   * @private
   * @param client - PostgreSQL client from pool
   * @param options - Write options
   * @returns Generated URI
   */
  private async writeWithClient(
    client: PoolClient,
    options: {
      url: string;
      content: string;
      metadata?: Partial<ResourceMetadata>;
      timestamp: string;
    },
  ): Promise<string> {
    const { url, content, metadata, timestamp } = options;
    const resourceType = (metadata?.resourceType as ResourceType) || "raw";
    const uri = this.generateUri(url, timestamp, resourceType);
    const ttl = this.resolveTtl(metadata);

    const fullMetadata: ResourceMetadata = {
      ...metadata,
      url,
      timestamp,
      resourceType,
      ttl,
    };

    await client.query(
      `INSERT INTO mcp.resources (
        uri, url, resource_type, content_type, source,
        extraction_prompt, content, metadata, ttl_ms
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (uri) DO UPDATE SET
        content = EXCLUDED.content,
        metadata = EXCLUDED.metadata,
        updated_at = NOW()`,
      [
        uri,
        url,
        resourceType,
        metadata?.contentType || "text/plain",
        metadata?.source || "unknown",
        metadata?.extractionPrompt || null,
        content,
        JSON.stringify(fullMetadata),
        ttl > 0 ? ttl : null,
      ],
    );

    return uri;
  }

  /**
   * Generate URI for resource
   *
   * Format: postgres://[resourceType]/[sanitized_url]_[timestamp]
   *
   * @private
   * @param url - Source URL
   * @param timestamp - ISO timestamp
   * @param resourceType - Resource type
   * @returns Generated URI
   */
  private generateUri(
    url: string,
    timestamp: string,
    resourceType: ResourceType = "raw",
  ): string {
    const sanitizedUrl = url
      .replace(/^https?:\/\//, "")
      .replace(/[^a-zA-Z0-9.-]/g, "_");
    const timestampPart = timestamp.replace(/[^0-9]/g, "");
    return `postgres://${resourceType}/${sanitizedUrl}_${timestampPart}`;
  }

  /**
   * Resolve TTL from metadata or use default
   *
   * @private
   * @param metadata - Resource metadata
   * @returns TTL in milliseconds (0 = no expiration)
   */
  private resolveTtl(metadata?: Partial<ResourceMetadata>): number {
    const ttl = metadata?.ttl;
    if (ttl === undefined || ttl === null) {
      return this.options.defaultTTL;
    }
    return ttl <= 0 ? 0 : ttl;
  }
}
