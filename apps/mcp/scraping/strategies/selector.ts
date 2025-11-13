/**
 * @fileoverview Scraping strategy selection and execution
 *
 * This module provides intelligent strategy selection for web scraping,
 * supporting both automatic strategy detection and learned pattern-based
 * routing. Includes fallback logic and diagnostics tracking.
 *
 * @module shared/scraping/strategies/selector
 */

import type { IScrapingClients } from "../../server.js";
import type {
  ScrapingStrategy,
  IStrategyConfigClient,
} from "./learned/index.js";
import { env } from "../../config/environment.js";
import { logDebug, logWarning } from "../../utils/logging.js";
import type { ScrapeDiagnostics } from "../../types.js";
import { getMetricsCollector } from "../../monitoring/index.js";

/**
 * Options for scraping strategy execution
 *
 * Defines the URL to scrape and optional timeout configuration.
 */
export interface StrategyOptions {
  url: string;
  timeout?: number;
}

/**
 * Result of a strategy execution
 *
 * Contains the scraped content, source strategy used, error information,
 * and diagnostics data about which strategies were attempted.
 */
export interface StrategyResult {
  success: boolean;
  content: string | null;
  source: string;
  error?: string;
  metadata?: Record<string, unknown>;
  isAuthError?: boolean;
  diagnostics?: ScrapeDiagnostics;
}

/**
 * Extract URL pattern for strategy learning
 *
 * Generates a URL pattern by taking the path up to the last segment,
 * which allows strategy configuration to match similar URLs.
 *
 * @param url - Full URL to extract pattern from
 * @returns URL pattern suitable for strategy matching
 *
 * @example
 * ```typescript
 * extractUrlPattern('https://yelp.com/biz/dolly-san-francisco')
 * // Returns: 'yelp.com/biz/'
 *
 * extractUrlPattern('https://reddit.com/r/programming/comments/123/title')
 * // Returns: 'reddit.com/r/programming/comments/123/'
 * ```
 */
export function extractUrlPattern(url: string): string {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;
    const port = urlObj.port;
    const pathname = urlObj.pathname;

    // Include port in hostname if present
    const hostWithPort = port ? `${hostname}:${port}` : hostname;

    // If no path or just root, return hostname with port
    if (!pathname || pathname === "/") {
      return hostWithPort;
    }

    // Split path into segments
    const segments = pathname.split("/").filter((s) => s.length > 0);

    // If no segments or only one segment, return hostname
    if (segments.length <= 1) {
      return hostWithPort;
    }

    // Return everything except the last segment
    const pathWithoutLastSegment = segments.slice(0, -1).join("/");
    return hostWithPort + "/" + pathWithoutLastSegment + "/";
  } catch {
    // If URL parsing fails, return as-is
    return url;
  }
}

/**
 * Universal scraping with automatic strategy fallback
 *
 * Tries all available scraping strategies sequentially based on optimization
 * mode. Collects diagnostics about which strategies were attempted and why
 * they failed. Supports cost optimization (native first) and speed optimization
 * (Firecrawl only).
 *
 * @param clients - Available scraping clients (native and optionally Firecrawl)
 * @param options - Scraping options including URL and timeout
 * @returns Strategy result with content, source, and diagnostics
 *
 * @example
 * ```typescript
 * const result = await scrapeUniversal(clients, {
 *   url: 'https://example.com',
 *   timeout: 30000
 * });
 * if (!result.success) {
 *   console.log('Failed strategies:', result.diagnostics?.strategiesAttempted);
 *   console.log('Errors:', result.diagnostics?.strategyErrors);
 * }
 * ```
 */
export async function scrapeUniversal(
  clients: IScrapingClients,
  options: StrategyOptions,
): Promise<StrategyResult> {
  const { url } = options;
  const optimizeFor = env.optimizeFor;

  // Track diagnostics
  const diagnostics = {
    strategiesAttempted: [] as string[],
    strategyErrors: {} as Record<string, string>,
    timing: {} as Record<string, number>,
  };

  // Helper function to try native scraping
  const tryNative = async (): Promise<StrategyResult | null> => {
    const startTime = Date.now();
    diagnostics.strategiesAttempted.push("native");
    const metrics = getMetricsCollector();

    try {
      const nativeResult = await clients.native.scrape(url, {
        timeout: options.timeout,
      });
      const duration = Date.now() - startTime;
      diagnostics.timing.native = duration;

      if (
        nativeResult.success &&
        nativeResult.statusCode === 200 &&
        nativeResult.data
      ) {
        metrics.recordStrategyExecution("native", true, duration);
        return {
          success: true,
          content: nativeResult.data,
          source: "native",
          diagnostics,
        };
      }

      // Record the failure reason
      if (!nativeResult.success) {
        const errorMsg =
          nativeResult.error || `HTTP ${nativeResult.status || "unknown"}`;
        diagnostics.strategyErrors.native = errorMsg;
        metrics.recordStrategyExecution("native", false, duration);
        metrics.recordStrategyError("native", errorMsg);
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      diagnostics.timing.native = duration;
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      diagnostics.strategyErrors.native = errorMsg;
      metrics.recordStrategyExecution("native", false, duration);
      metrics.recordStrategyError("native", errorMsg);
    }
    return null;
  };

  // Helper function to try Firecrawl scraping
  const tryFirecrawl = async (): Promise<StrategyResult | null> => {
    const metrics = getMetricsCollector();

    if (!clients.firecrawl) {
      diagnostics.strategyErrors.firecrawl = "Firecrawl client not configured";
      return null;
    }

    const startTime = Date.now();
    diagnostics.strategiesAttempted.push("firecrawl");

    try {
      const firecrawlResult = await clients.firecrawl.scrape(url, {
        formats: ["html"],
      });
      const duration = Date.now() - startTime;
      diagnostics.timing.firecrawl = duration;

      if (firecrawlResult.success && firecrawlResult.data) {
        metrics.recordStrategyExecution("firecrawl", true, duration);
        return {
          success: true,
          content: firecrawlResult.data.html,
          source: "firecrawl",
          diagnostics,
        };
      }

      // Check for authentication errors
      if (!firecrawlResult.success) {
        if (firecrawlResult.error) {
          const errorLower = firecrawlResult.error.toLowerCase();
          if (
            errorLower.includes("unauthorized") ||
            errorLower.includes("invalid token") ||
            errorLower.includes("authentication")
          ) {
            const errorMsg = `Authentication failed: ${firecrawlResult.error}`;
            diagnostics.strategyErrors.firecrawl = errorMsg;
            metrics.recordStrategyExecution("firecrawl", false, duration);
            metrics.recordStrategyError("firecrawl", errorMsg);
            return {
              success: false,
              content: null,
              source: "firecrawl",
              error: `Firecrawl authentication error: ${firecrawlResult.error}`,
              isAuthError: true,
              diagnostics,
            };
          }
          diagnostics.strategyErrors.firecrawl = firecrawlResult.error;
          metrics.recordStrategyExecution("firecrawl", false, duration);
          metrics.recordStrategyError("firecrawl", firecrawlResult.error);
        } else {
          const errorMsg = "Request failed without error details";
          diagnostics.strategyErrors.firecrawl = errorMsg;
          metrics.recordStrategyExecution("firecrawl", false, duration);
          metrics.recordStrategyError("firecrawl", errorMsg);
        }
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      diagnostics.timing.firecrawl = duration;
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      diagnostics.strategyErrors.firecrawl = errorMsg;
      metrics.recordStrategyExecution("firecrawl", false, duration);
      metrics.recordStrategyError("firecrawl", errorMsg);
    }
    return null;
  };

  // Execute strategies based on optimization mode
  const metrics = getMetricsCollector();

  if (optimizeFor === "speed") {
    // speed mode: firecrawl only (skip native)
    const firecrawlResult = await tryFirecrawl();
    if (firecrawlResult) {
      // Return immediately on authentication errors
      if (firecrawlResult.isAuthError) {
        return firecrawlResult;
      }
      if (firecrawlResult.success) {
        return firecrawlResult;
      }
    }
  } else {
    // cost mode (default): native -> firecrawl
    const nativeResult = await tryNative();
    if (nativeResult) return nativeResult;

    // Native failed, trying firecrawl (fallback)
    metrics.recordFallback("native", "firecrawl");
    const firecrawlResult = await tryFirecrawl();
    if (firecrawlResult) {
      // Return immediately on authentication errors
      if (firecrawlResult.isAuthError) {
        return firecrawlResult;
      }
      if (firecrawlResult.success) {
        return firecrawlResult;
      }
    }
  }

  // Generate detailed error message
  const errorDetails = Object.entries(diagnostics.strategyErrors)
    .map(([strategy, error]) => `${strategy}: ${error}`)
    .join("; ");

  return {
    success: false,
    content: null,
    source: "none",
    error: `All strategies failed. Attempted: ${diagnostics.strategiesAttempted.join(", ")}. Errors: ${errorDetails}`,
    diagnostics,
  };
}

/**
 * Try a specific scraping strategy
 */
export async function scrapeWithSingleStrategy(
  clients: IScrapingClients,
  strategy: ScrapingStrategy,
  options: StrategyOptions,
): Promise<StrategyResult> {
  const { url } = options;

  try {
    switch (strategy) {
      case "native": {
        const result = await clients.native.scrape(url, {
          timeout: options.timeout,
        });
        if (result.success && result.status === 200 && result.data) {
          return {
            success: true,
            content: result.data,
            source: "native",
          };
        }
        break;
      }

      case "firecrawl": {
        if (!clients.firecrawl) {
          return {
            success: false,
            content: null,
            source: "firecrawl",
            error: "Firecrawl client not available",
          };
        }

        const result = await clients.firecrawl.scrape(url, {
          formats: ["html"],
        });

        if (result.success && result.data) {
          return {
            success: true,
            content: result.data.html,
            source: "firecrawl",
          };
        }
        break;
      }

      default:
        return {
          success: false,
          content: null,
          source: strategy,
          error: `Unknown strategy: ${strategy}`,
        };
    }
  } catch (error) {
    return {
      success: false,
      content: null,
      source: strategy,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }

  return {
    success: false,
    content: null,
    source: strategy,
    error: `Strategy ${strategy} failed`,
  };
}

/**
 * Scrape with strategy configuration
 * First tries the configured strategy for the URL, then falls back to universal approach
 */
export async function scrapeWithStrategy(
  clients: IScrapingClients,
  configClient: IStrategyConfigClient,
  options: StrategyOptions,
  explicitStrategy?: ScrapingStrategy,
): Promise<StrategyResult> {
  // If explicit strategy provided, try it first
  if (explicitStrategy) {
    const explicitResult = await scrapeWithSingleStrategy(
      clients,
      explicitStrategy,
      options,
    );
    if (explicitResult.success) {
      return explicitResult;
    }

    // If explicit strategy failed, fall back to universal
    logDebug(
      "scrapeWithStrategy",
      `Explicit strategy '${explicitStrategy}' failed, falling back to universal approach`,
    );
    const universalResult = await scrapeUniversal(clients, options);

    // If universal succeeded and we have a config client, save the successful strategy
    if (universalResult.success && universalResult.source !== "none") {
      try {
        const urlPattern = extractUrlPattern(options.url);
        await configClient.upsertEntry({
          prefix: urlPattern,
          default_strategy: universalResult.source as ScrapingStrategy,
          notes: `Auto-discovered after ${explicitStrategy} failed`,
        });
      } catch (error) {
        // Don't fail scraping if config update fails
        logWarning(
          "scrapeWithStrategy",
          `Failed to update strategy config: ${error}`,
        );
      }
    }

    return universalResult;
  }

  // Try to get configured strategy for this URL
  let configuredStrategy: ScrapingStrategy | null = null;
  try {
    configuredStrategy = await configClient.getStrategyForUrl(options.url);
  } catch (error) {
    logWarning(
      "scrapeWithStrategy",
      `Failed to load strategy config: ${error}`,
    );
  }

  // If we have a configured strategy, try it first
  if (configuredStrategy) {
    const configuredResult = await scrapeWithSingleStrategy(
      clients,
      configuredStrategy,
      options,
    );
    if (configuredResult.success) {
      return configuredResult;
    }

    logDebug(
      "scrapeWithStrategy",
      `Configured strategy '${configuredStrategy}' failed, falling back to universal approach`,
    );
  }

  // Fall back to universal approach
  const universalResult = await scrapeUniversal(clients, options);

  // If universal succeeded and we don't have a configured strategy, save it
  if (
    universalResult.success &&
    universalResult.source !== "none" &&
    !configuredStrategy
  ) {
    try {
      const urlPattern = extractUrlPattern(options.url);
      await configClient.upsertEntry({
        prefix: urlPattern,
        default_strategy: universalResult.source as ScrapingStrategy,
        notes: "Auto-discovered via universal fallback",
      });
    } catch (error) {
      // Don't fail scraping if config update fails
      logWarning(
        "scrapeWithStrategy",
        `Failed to update strategy config: ${error}`,
      );
    }
  }

  return universalResult;
}
