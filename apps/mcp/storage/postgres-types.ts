/**
 * @fileoverview PostgreSQL storage type definitions
 *
 * Maps database schema (snake_case) to TypeScript types (camelCase).
 * Database schema is in `mcp.resources` table.
 *
 * @module storage/postgres-types
 */

import { ResourceData, ResourceMetadata, ResourceType } from "./types.js";

/**
 * Database row structure from mcp.resources table
 *
 * Matches schema created by migration 002_mcp_schema.sql
 */
export interface DbResourceRow {
  id: number;
  uri: string;
  url: string;
  resource_type: ResourceType;
  content_type: string;
  source: string;
  extraction_prompt: string | null;
  content: string;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
  ttl_ms: number | null;
  expires_at: Date | null;
}

/**
 * Convert database row to ResourceData format
 *
 * Transforms snake_case DB fields to camelCase TypeScript objects
 * and extracts metadata from JSONB column.
 *
 * @param row - Database row from mcp.resources
 * @returns ResourceData object for MCP protocol
 */
export function dbRowToResourceData(row: DbResourceRow): ResourceData {
  const metadata: ResourceMetadata = {
    url: row.url,
    timestamp: row.created_at.toISOString(),
    resourceType: row.resource_type,
    contentType: row.content_type,
    ttl: row.ttl_ms ?? undefined,
    ...row.metadata, // Merge JSONB metadata
  };

  // Add extraction prompt if present
  if (row.extraction_prompt) {
    metadata.extractionPrompt = row.extraction_prompt;
  }

  return {
    uri: row.uri,
    name: `${row.resource_type}/${extractNameFromUrl(row.url)}`,
    description:
      (row.metadata.description as string) || `Fetched content from ${row.url}`,
    mimeType: row.content_type,
    metadata,
  };
}

/**
 * Extract a human-readable name from URL
 *
 * @param url - Full URL string
 * @returns Simplified name for display
 */
function extractNameFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, "");
  } catch {
    return url.replace(/^https?:\/\//, "").replace(/[^a-zA-Z0-9.-]/g, "_");
  }
}
