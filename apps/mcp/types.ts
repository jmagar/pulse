/**
 * Common TypeScript types for Pulse Fetch MCP server
 */

import type {
  TextContentSchema,
  ImageContentSchema,
  AudioContentSchema,
  ResourceLinkSchema,
  EmbeddedResourceSchema,
  ToolSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { z } from "zod";

/**
 * Standard response format for MCP tools
 */
export interface ToolResponse {
  content: Array<{
    type: string;
    text: string;
  }>;
  isError?: boolean;
}

/**
 * Scraping result interface
 */
export interface ScrapeResult {
  success: boolean;
  content?: string;
  source: "native" | "firecrawl";
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Result handling options for scrape results
 */
export type ResultHandling = "saveOnly" | "saveAndReturn" | "returnOnly";

/**
 * Scraping options interface
 */
export interface ScrapeOptions {
  timeout?: number;
  extract?: string;
  maxChars?: number;
  startIndex?: number;
  resultHandling?: ResultHandling;
}

/**
 * Diagnostics information collected during scraping strategy execution
 */
export interface ScrapeDiagnostics {
  /** List of strategies that were attempted */
  strategiesAttempted: string[];
  /** Map of strategy names to their error messages */
  strategyErrors: Record<string, string>;
  /** Optional timing information for each strategy in milliseconds */
  timing?: Record<string, number>;
}

/**
 * Configuration for Firecrawl API clients
 */
export interface FirecrawlConfig {
  /** Firecrawl API key */
  apiKey: string;
  /** Base URL for Firecrawl API (optional, defaults to https://api.firecrawl.dev/v2) */
  baseUrl?: string;
}

/**
 * MCP SDK Type Exports
 */

/** Text content block */
export type TextContent = z.infer<typeof TextContentSchema>;

/** Image content block */
export type ImageContent = z.infer<typeof ImageContentSchema>;

/** Audio content block */
export type AudioContent = z.infer<typeof AudioContentSchema>;

/** Resource link content block */
export type ResourceLink = z.infer<typeof ResourceLinkSchema>;

/** Embedded resource content block */
export type EmbeddedResource = z.infer<typeof EmbeddedResourceSchema>;

/** Union of all possible content block types */
export type ContentBlock =
  | TextContent
  | ImageContent
  | AudioContent
  | ResourceLink
  | EmbeddedResource;

/** Tool definition from MCP protocol */
export type Tool = z.infer<typeof ToolSchema>;

/**
 * Type guard to check if content is TextContent
 */
export function isTextContent(content: ContentBlock): content is TextContent {
  return (content as { type: string }).type === "text";
}

/**
 * Type guard to check if content is ResourceLink
 */
export function isResourceLink(content: ContentBlock): content is ResourceLink {
  return (content as { type: string }).type === "resource_link";
}

/**
 * Type guard to check if content is EmbeddedResource
 */
export function isEmbeddedResource(
  content: ContentBlock,
): content is EmbeddedResource {
  return (content as { type: string }).type === "resource";
}
