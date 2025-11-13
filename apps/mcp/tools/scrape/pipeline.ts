/**
 * @fileoverview Scraping pipeline orchestration
 *
 * Coordinates the end-to-end scraping workflow including cache lookup,
 * content fetching, cleaning, extraction, and storage operations.
 *
 * @module shared/mcp/tools/scrape/pipeline
 */

import { ResourceStorageFactory } from "../../storage/index.js";
import { ExtractClientFactory } from "../../processing/extraction/index.js";
import { createCleaner } from "../../processing/cleaning/index.js";
import type {
  IScrapingClients,
  StrategyConfigFactory,
} from "../../mcp-server.js";
import { scrapeWithStrategy } from "../../scraping/strategies/selector.js";
import { detectContentType } from "./helpers.js";
import type { ScrapeDiagnostics } from "../../types.js";
import {
  logWarning,
  logError,
  logDebug,
  logInfo,
} from "../../utils/logging.js";
import type {
  BatchScrapeOptions,
  BatchScrapeStartResult,
  CrawlStatusResult,
  BatchScrapeCancelResult,
  CrawlErrorsResult,
} from "@firecrawl/client";
import type { BrowserAction } from "./action-types.js";

const BATCH_CLIENT_ERROR =
  "Firecrawl batch scraping requires FIRECRAWL_API_KEY configured for the MCP server.";

/**
 * Configuration options for scraping pipeline
 *
 * Defines all parameters needed to execute a complete scraping operation
 * including caching, content processing, and result handling.
 */
export interface ScrapePipelineOptions {
  url: string;
  timeout: number;
  maxChars: number;
  startIndex: number;
  resultHandling: "saveOnly" | "saveAndReturn" | "returnOnly";
  forceRescrape: boolean;
  cleanScrape: boolean;
  extract?: string;
}

/**
 * Result of content processing pipeline
 *
 * Contains content in multiple stages (raw, cleaned, extracted) along
 * with metadata about the processing and caching status.
 */
export interface ProcessedContent {
  raw: string;
  cleaned?: string;
  extracted?: string;
  displayContent: string;
  source: string;
  wasCached: boolean;
}

/**
 * Check for cached content and return if found
 */
export async function checkCache(
  url: string,
  extract: string | undefined,
  resultHandling: string,
  forceRescrape: boolean,
): Promise<
  | {
      found: true;
      content: string;
      uri: string;
      name: string;
      mimeType?: string;
      description?: string;
      source: string;
      timestamp: string;
    }
  | { found: false }
> {
  // Skip cache if forceRescrape or saveOnly mode
  if (forceRescrape) {
    logDebug("checkCache", "Cache bypassed: forceRescrape=true", { url });
    return { found: false };
  }

  if (resultHandling === "saveOnly") {
    logDebug("checkCache", "Cache bypassed: saveOnly mode", { url });
    return { found: false };
  }

  try {
    logDebug("checkCache", "Checking cache for URL", {
      url,
      extract: !!extract,
    });
    const storage = await ResourceStorageFactory.create();
    const cachedResources = await storage.findByUrlAndExtract(url, extract);

    if (cachedResources.length > 0) {
      logDebug("checkCache", "Cache hit: found resources", {
        url,
        count: cachedResources.length,
        tiers: cachedResources.map((r) => {
          if (r.uri.includes("/cleaned/")) return "cleaned";
          if (r.uri.includes("/extracted/")) return "extracted";
          if (r.uri.includes("/raw/")) return "raw";
          return "unknown";
        }),
      });

      // Prioritize cleaned > extracted > raw
      // Cleaned is most useful (readable markdown), raw is HTML soup
      const preferredResource =
        cachedResources.find((r) => r.uri.includes("/cleaned/")) ||
        cachedResources.find((r) => r.uri.includes("/extracted/")) ||
        cachedResources[0];

      const tier = preferredResource.uri.includes("/cleaned/")
        ? "cleaned"
        : preferredResource.uri.includes("/extracted/")
          ? "extracted"
          : preferredResource.uri.includes("/raw/")
            ? "raw"
            : "unknown";

      const cachedContent = await storage.read(preferredResource.uri);

      logInfo("checkCache", "Cache hit: returning content", {
        url,
        tier,
        uri: preferredResource.uri,
        size: cachedContent.text?.length || 0,
      });

      return {
        found: true,
        content: cachedContent.text || "",
        uri: preferredResource.uri,
        name: preferredResource.name,
        mimeType: preferredResource.mimeType,
        description: preferredResource.description,
        source: (preferredResource.metadata.source as string) || "unknown",
        timestamp: preferredResource.metadata.timestamp as string,
      };
    }

    logDebug("checkCache", "Cache miss: no resources found", { url });
  } catch (error) {
    logWarning(
      "checkCache",
      "Cache lookup failed, proceeding with fresh scrape",
      { url, error },
    );
  }

  return { found: false };
}

/**
 * Determine whether batch scraping should be used
 */
export function shouldUseBatchScrape(
  urls: string[] | undefined,
): urls is string[] {
  return Array.isArray(urls) && urls.length > 1;
}

/**
 * Arguments used to build Firecrawl batch scrape options
 */
export interface BatchScrapeOptionArgs {
  urls: string[];
  timeout?: number;
  maxAge?: number;
  proxy?: "basic" | "stealth" | "auto";
  blockAds?: boolean;
  headers?: Record<string, string>;
  waitFor?: number;
  includeTags?: string[];
  excludeTags?: string[];
  formats?: Array<
    | "markdown"
    | "html"
    | "rawHtml"
    | "links"
    | "images"
    | "screenshot"
    | "summary"
    | "branding"
    | "changeTracking"
  >;
  parsers?: Array<{ type: "pdf"; maxPages?: number }>;
  onlyMainContent?: boolean;
  actions?: BrowserAction[];
}

/**
 * Create payload for Firecrawl batch scrape API
 */
export function createBatchScrapeOptions(
  args: BatchScrapeOptionArgs,
): BatchScrapeOptions {
  const options: BatchScrapeOptions = {
    urls: args.urls,
  };

  if (typeof args.timeout === "number") options.timeout = args.timeout;
  if (typeof args.maxAge === "number") options.maxAge = args.maxAge;
  if (args.proxy) options.proxy = args.proxy;
  if (typeof args.blockAds === "boolean") options.blockAds = args.blockAds;
  if (args.headers) options.headers = args.headers;
  if (typeof args.waitFor === "number") options.waitFor = args.waitFor;
  if (args.includeTags) options.includeTags = args.includeTags;
  if (args.excludeTags) options.excludeTags = args.excludeTags;
  if (args.formats) options.formats = args.formats;
  if (args.parsers) options.parsers = args.parsers;
  if (typeof args.onlyMainContent === "boolean") {
    options.onlyMainContent = args.onlyMainContent;
  }
  if (args.actions) options.actions = args.actions;

  return options;
}

/**
 * Start Firecrawl batch scraping job
 */
export async function startBatchScrapeJob(
  clients: IScrapingClients,
  options: BatchScrapeOptions,
): Promise<BatchScrapeStartResult> {
  const firecrawl = clients.firecrawl;
  if (!firecrawl || typeof firecrawl.batchScrape !== "function") {
    throw new Error(BATCH_CLIENT_ERROR);
  }
  return firecrawl.batchScrape(options);
}

type BatchCommand = "status" | "cancel" | "errors";

/**
 * Execute batch scrape command for existing job
 */
export async function runBatchScrapeCommand(
  clients: IScrapingClients,
  command: BatchCommand,
  jobId: string,
): Promise<
  CrawlStatusResult | BatchScrapeCancelResult | CrawlErrorsResult
> {
  const firecrawl = clients.firecrawl;
  if (!firecrawl) {
    throw new Error(BATCH_CLIENT_ERROR);
  }

  switch (command) {
    case "status": {
      if (typeof firecrawl.getBatchScrapeStatus !== "function") {
        throw new Error(BATCH_CLIENT_ERROR);
      }
      return firecrawl.getBatchScrapeStatus(jobId);
    }
    case "cancel": {
      if (typeof firecrawl.cancelBatchScrape !== "function") {
        throw new Error(BATCH_CLIENT_ERROR);
      }
      return firecrawl.cancelBatchScrape(jobId);
    }
    case "errors": {
      if (typeof firecrawl.getBatchScrapeErrors !== "function") {
        throw new Error(BATCH_CLIENT_ERROR);
      }
      return firecrawl.getBatchScrapeErrors(jobId);
    }
    default:
      throw new Error(`Unsupported batch command: ${command}`);
  }
}

/**
 * Scrape content from URL
 */
export async function scrapeContent(
  url: string,
  timeout: number,
  clients: IScrapingClients,
  configClient: ReturnType<StrategyConfigFactory>,
  options?: Record<string, unknown>,
): Promise<{
  success: boolean;
  content?: string;
  source?: string;
  screenshot?: string;
  screenshotFormat?: string;
  error?: string;
  diagnostics?: ScrapeDiagnostics;
}> {
  // Check if screenshot format is requested
  const formats = (options?.formats as string[] | undefined) || [];
  const includeScreenshot = formats.includes("screenshot");

  // If screenshot is requested without Firecrawl API key, return error
  if (includeScreenshot && !clients.firecrawl) {
    return {
      success: false,
      error:
        "Screenshot format requires FIRECRAWL_API_KEY environment variable",
    };
  }

  // If screenshot is requested, we need to use Firecrawl directly
  // because the strategy selector doesn't preserve screenshot data
  if (includeScreenshot && clients.firecrawl) {
    // CRITICAL: Explicitly set parsers to empty array to prevent PDF engine loops
    // Firecrawl API defaults to PDF parsing ENABLED if parsers is undefined
    const firecrawlOptions = {
      ...options,
      parsers: (options?.parsers as unknown[]) ?? [],
    };
    const firecrawlResult = await clients.firecrawl.scrape(
      url,
      firecrawlOptions,
    );

    if (!firecrawlResult.success) {
      return {
        success: false,
        error: firecrawlResult.error,
      };
    }

    // Extract screenshot metadata if available
    let screenshotFormat = "png"; // Default format
    if (firecrawlResult.data?.metadata?.screenshotMetadata) {
      const metadata = firecrawlResult.data.metadata.screenshotMetadata as {
        format?: string;
      };
      screenshotFormat = metadata.format || "png";
    }

    return {
      success: true,
      content:
        firecrawlResult.data?.html || firecrawlResult.data?.markdown || "",
      source: "firecrawl",
      screenshot: firecrawlResult.data?.screenshot,
      screenshotFormat,
    };
  }

  // Standard scraping without screenshot
  const result = await scrapeWithStrategy(clients, configClient, {
    url,
    timeout,
  });

  if (!result.success) {
    return {
      success: false,
      error: result.error,
      diagnostics: result.diagnostics,
    };
  }

  return {
    success: true,
    content: result.content || "",
    source: result.source,
  };
}

/**
 * Process content through cleaning and extraction pipeline
 */
export async function processContent(
  rawContent: string,
  url: string,
  cleanScrape: boolean,
  extract: string | undefined,
): Promise<{ cleaned?: string; extracted?: string; displayContent: string }> {
  let cleanedContent: string | undefined;
  let extractedContent: string | undefined;
  let displayContent = rawContent;

  // Apply cleaning if cleanScrape is true (default)
  if (cleanScrape) {
    try {
      const cleaner = createCleaner(rawContent, url);
      cleanedContent = await cleaner.clean(rawContent, url);
      if (cleanedContent) {
        displayContent = cleanedContent;
      }
    } catch (cleanError) {
      logWarning(
        "processContent",
        "Content cleaning failed, proceeding with raw content",
        {
          url,
          error: cleanError,
        },
      );
      displayContent = rawContent;
    }
  }

  // If extract parameter is provided and extraction is available, perform extraction
  if (extract && ExtractClientFactory.isAvailable()) {
    try {
      const extractClient = ExtractClientFactory.createFromEnv();
      if (extractClient) {
        const contentToExtract = cleanedContent || rawContent;
        const extractResult = await extractClient.extract(
          contentToExtract,
          extract,
        );
        if (extractResult.success && extractResult.content) {
          extractedContent = extractResult.content;
          displayContent = extractedContent;
        } else {
          displayContent = `Extraction failed: ${extractResult.error}\n\n---\nRaw content:\n${displayContent}`;
        }
      }
    } catch (error) {
      logError("processContent", error, { url, extract });
      displayContent = `Extraction error: ${error instanceof Error ? error.message : String(error)}\n\n---\nRaw content:\n${displayContent}`;
    }
  }

  return {
    cleaned: cleanedContent,
    extracted: extractedContent,
    displayContent,
  };
}

/**
 * Save processed content to storage
 */
export async function saveToStorage(
  url: string,
  rawContent: string,
  cleanedContent: string | undefined,
  extractedContent: string | undefined,
  extract: string | undefined,
  source: string,
  startIndex: number,
  maxChars: number,
  wasTruncated: boolean,
): Promise<{ raw?: string; cleaned?: string; extracted?: string } | null> {
  try {
    const storage = await ResourceStorageFactory.create();
    const uris = await storage.writeMulti({
      url,
      raw: rawContent,
      cleaned: cleanedContent,
      extracted: extractedContent,
      metadata: {
        url,
        source,
        timestamp: new Date().toISOString(),
        extract: extract || undefined,
        contentLength: rawContent.length,
        startIndex,
        maxChars,
        wasTruncated,
        contentType: detectContentType(rawContent),
      },
    });

    return uris;
  } catch (error) {
    logError("saveToStorage", error, { url, source });
    return null;
  }
}
